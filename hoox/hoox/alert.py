import frappe
import json
import time
from .action import execute_order
from .user import (
    get_exchange_credentials,
    get_telegram_credentials,
    get_haas_credentials,
    send_to_telegram,
    send_to_haas,
    order_failed,
)
from frappe import DoesNotExistError, ValidationError, _
from datetime import datetime, timedelta
from frappe.utils import now_datetime, add_to_date
from frappe.utils.background_jobs import enqueue


def update_status(doctype, docname):
    doc = frappe.get_doc(doctype, docname)

    # Calculate the difference between the current time and the document's creation time
    time_difference = now_datetime() - doc.creation

    # If the time difference is less than 30 seconds and the status is not 'Success',
    # then don't update the status to 'Failure'
    if time_difference.total_seconds() < 30 and doc.status != "Success":
        return
    elif time_difference.total_seconds() > 30 and doc.status != "Success":
        doc.status = "Failure"
        doc.save()
        frappe.db.commit()
        pass


@frappe.whitelist(allow_guest=True)
def hoox(data=None):
    try:
        request_data = data or json.loads(frappe.request.data)
        secret_hash = request_data.get("secret_hash")
        exchange_creds = get_exchange_credentials(secret_hash)
        process_request(request_data, exchange_creds)
    except (DoesNotExistError, ValidationError) as e:
        # log.error(f"An error occurred in HOOX: {str(e)}")
        frappe.throw(str(e), frappe.AuthenticationError)
    except Exception as e:
        # log.error(f"An unexpected error occurred in HOOX: {str(e)}")
        frappe.throw("An unexpected error occurred", frappe.AuthenticationError)


def process_request(request_data, exchange_creds):
    process_trade_action(request_data, exchange_creds)
    process_telegram(request_data, exchange_creds)
    process_haas(request_data, exchange_creds)


def process_trade_action(request_data, exchange_creds):
    required_fields = ["action", "symbol", "order_type", "secret_hash", "quantity"]

    if all(field in request_data for field in required_fields):
        if request_data["order_type"] == "limit" and "price" not in request_data:
            raise ValidationError("Price field is required for 'limit' order type.")
        elif exchange_creds.enabled:
            handle_alert(request_data, exchange_creds)
        else:
            raise ValidationError("Invalid Secret Hash")
    else:
        raise ValidationError("Missing required fields.")


def process_telegram(request_data, exchange_creds):
    telegram = request_data.get("telegram")
    if telegram and telegram.get("message"):
        toId = telegram.get("chat_id") or telegram.get("group_id")
        send_to_telegram(exchange_creds.user, telegram.get("message"), toId)


def process_haas(request_data, exchange_creds):
    haas = request_data.get("haas")
    if haas and haas.get("entity_id") and haas.get("service"):
        data = haas.get("data") or {}
        send_to_haas(haas.get("entity_id"), haas.get("service"), data)


def handle_alert(request_data, exchange_creds, is_retry=False):
    try:
        if not is_retry:
            msg = f"Incoming request from TradingView: {request_data}"
            frappe.msgprint(msg)
            frappe.publish_realtime(
                event="hoox_alert", message=msg, user=frappe.session.user
            )
            trade = frappe.get_doc(
                {
                    "doctype": "Trades",
                    "user": exchange_creds.user,
                    "secret_hash": request_data.get("secret_hash"),
                    "action": request_data.get("action"),
                    "order_type": request_data.get("order_type") or "market",
                    "market_type": request_data.get("market_type") or "futures",
                    "exchange": exchange_creds.exchange,
                    "symbol": request_data.get("symbol"),
                    "price": request_data.get("price"),
                    "quantity": request_data.get("quantity"),
                    "leverage": request_data.get("leverage") or 1,
                    "time": (datetime.utcnow() + timedelta(hours=2)).strftime(
                        "%Y-%m-%d %H:%M:%S"
                    ),
                }
            )
            trade.insert(ignore_permissions=True)
            frappe.msgprint(f"Tardename: {trade.name}")
            frappe.enqueue(
                update_status,
                queue="default",
                timeout=120,
                is_async=True,
                now=False,
                enqueue_after_commit=False,
                job_name="Update Trade Status",
                doctype="Trades",
                docname=trade.name,
            )
        else:
            frappe.msgprint(
                f"Retry execution of incoming request from TradingView: {request_data}"
            )
            trade = frappe.get_last_doc(
                "Trades",
                {
                    "secret_hash": request_data.get("secret_hash"),
                    "status": ["!=", "Success"],
                },
            )

        exchange_response = execute_order(
            request_data.get("action"),
            exchange_creds.exchange,
            request_data.get("symbol"),
            request_data.get("price"),
            request_data.get("quantity"),
            request_data.get("order_type") or "market",
            request_data.get("market_type") or "futures",
            request_data.get("leverage") or 1,
            exchange_creds,
        )

        trade.append(
            "outgoing_requests",
            {
                "doctype": "Outgoing Requests",
                "method": request_data.get("action"),
                "url": exchange_creds.exchange,
                "params": json.dumps(request_data),
                "response": exchange_response,
                "timestamp": (datetime.utcnow() + timedelta(hours=2)).strftime(
                    "%Y-%m-%d %H:%M:%S"
                ),
            },
        )
        trade.save()

        send_to_telegram(exchange_creds.user, f"Order executed: {exchange_response}")
        # log.info(f"Outgoing request to Exchange: {request_data}")
        # log.info(f"Exchange response: {exchange_response}")

    except Exception as e:
        print(f"An error occurred: {e}")
        order_failed(exchange_creds.user, str(e))
        retry(request_data, exchange_creds)


def retry(request_data, exchange_creds):
    for i in range(5):  # Retry 5 times
        try:
            handle_alert(request_data, exchange_creds, is_retry=True)
            break
        except Exception as e:
            if i == 4:
                order_failed(exchange_creds.user, str(e))
            time.sleep(5)
