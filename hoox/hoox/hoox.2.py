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
)
from frappe import DoesNotExistError, ValidationError, _
from datetime import datetime, timedelta
from frappe.utils import now_datetime, add_to_date
from frappe.utils.background_jobs import enqueue
from tenacity import retry, stop_after_attempt, wait_exponential


class NetworkError(Exception):
    pass


class APIError(Exception):
    pass


class ExchangeError(Exception):
    pass


cfg = frappe.get_single("Hoox Settings")
request_data = json.loads(frappe.request.data)
secret_hash = request_data.get("secret_hash")
exchange_creds = get_exchange_credentials(secret_hash)


def get_retry_decorator():
    if cfg.retry_enabled:
        return retry(
            stop=stop_after_attempt(cfg.retry_stop_after),
            wait=wait_exponential(
                multiplier=cfg.retry_backoff, min=cfg.retry_min, max=cfg.retry_max
            ),
        )
    else:

        def no_retry(func):
            return func

        return no_retry


@frappe.whitelist(allow_guest=True)
def update_status(doctype, docname):
    doc = frappe.get_doc(doctype, docname)

    time_difference = now_datetime() - doc.creation

    if time_difference.total_seconds() < 30 and doc.status != "Success":
        return

    if doc.status != "Success":
        doc.status = "Failed"
        doc.save()
        frappe.db.commit()


@frappe.whitelist(allow_guest=True)
def hoox():
    try:
        if exchange_creds and exchange_creds.enabled:
            # send_to_telegram(exchange_creds.user, f"Request received: {request_data}")
            process_request()
    except (DoesNotExistError, ValidationError) as e:
        frappe.throw(str(e), frappe.AuthenticationError)
    except Exception as e:
        frappe.throw("An unexpected error occurred",
                     frappe.AuthenticationError)


def process_request():
    process_trade_action()
    process_telegram()
    process_haas()


def process_trade_action():
    required_fields = ["action", "symbol",
                       "order_type", "secret_hash", "quantity"]

    if all(field in request_data for field in required_fields):
        if request_data["order_type"] == "limit" and "price" not in request_data:
            raise ValidationError(
                "Price field is required for 'limit' order type.")
        elif exchange_creds.enabled:
            handle_alert()
        else:
            raise ValidationError("Invalid Secret Hash")


def process_telegram():
    telegram = request_data.get("telegram")
    if telegram and telegram.get("message"):
        toId = telegram.get("chat_id") or telegram.get("group_id")
        send_to_telegram(exchange_creds.user, telegram.get("message"), toId)


def process_haas():
    haas = request_data.get("haas")
    if haas and haas.get("entity_id") and haas.get("service"):
        data = haas.get("data") or {}
        send_to_haas(
            exchange_creds.user, haas.get(
                "entity_id"), haas.get("service"), data
        )


@get_retry_decorator()
def handle_alert():
    try:
        if not hasattr(handle_alert, "retry") or handle_alert.retry == 0:
            msg = f"Incoming request from TradingView: {request_data}"
            frappe.msgprint(msg)
            frappe.publish_realtime(
                event="hoox_alert", message=msg, user=exchange_creds.user
            )
            trade = frappe.get_doc(
                {
                    "doctype": "Trades",
                    "user": exchange_creds.user,
                    "secret_hash": request_data.get("secret_hash"),
                    "action": request_data.get("action"),
                    "order_type": request_data.get("order_type") or "market",
                    "market_type": request_data.get("market_type") or "future",
                    "exchange": exchange_creds.exchange,
                    "symbol": request_data.get("symbol"),
                    "price": request_data.get("price"),
                    "quantity": request_data.get("quantity"),
                    "leverage": request_data.get("leverage") or 1,
                }
            )
            trade.insert(ignore_permissions=True)
            frappe.msgprint(f"Tradename: {trade.name}")
            enqueue(
                update_status,
                queue="short",
                timeout=900,
                is_async=True,
                now=False,
                job_name="Update Trade Status",
                doctype="Trades",
                docname=trade.name,
            )
        else:
            handle_alert.retry = True
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
            request_data.get("market_type") or "future",
            request_data.get("leverage") or 1,
            exchange_creds,
        )

        orderId = exchange_response.get("info").get("orderId")
        if orderId is not None:
            trade.status = "Success"
            trade.exchange_order_id = orderId
        else:
            trade.status = "Failed"

        trade.append(
            "outgoing_requests",
            {
                "doctype": "Outgoing Requests",
                "method": request_data.get("action"),
                "url": exchange_response.get("url"),
                "params": json.dumps(request_data),
                "response": json.dumps(exchange_response),
                "status": trade.status,
            },
        )

        trade.save()
        frappe.db.commit()

        if trade.status == "Failed":
            raise ExchangeError(exchange_response)

        handle_alert.retry = 0
        send_to_telegram(exchange_creds.user,
                         f"Order executed: {exchange_response}")

    except NetworkError as e:
        handle_alert.retry += 1
        send_to_telegram(
            exchange_creds.user, f"Order failed to execute. NetworkError: {e}"
        )
    except APIError as e:
        handle_alert.retry += 1
        send_to_telegram(exchange_creds.user,
                         f"Order failed to execute. APIError: {e}")
    except Exception as e:
        handle_alert.retry += 1
        send_to_telegram(
            exchange_creds.user, f"Order failed to execute. Exception: {e}"
        )
