import frappe
import json
import time
import logging
from .action import execute_order
from .user import get_user_credentials, get_telegram_credentials, get_haas_credentials, send_to_telegram, send_to_haas, order_failed
from frappe import DoesNotExistError, ValidationError

logging.basicConfig(filename='/home/prod/frappe-bench/logs/alerts.log', level=logging.DEBUG)

@frappe.whitelist(allow_guest=True)
def hoox():
    try:
        request_data = json.loads(frappe.request.data)
        secret_hash = request_data.get('secret_hash')
        user_creds = get_user_credentials(secret_hash)
        process_request(request_data, user_creds)
    except (DoesNotExistError, ValidationError) as e:
        logging.error(f"An error occurred in HOOX: {str(e)}")
        frappe.throw(str(e), frappe.AuthenticationError)
    except Exception as e:
        logging.error(f"An unexpected error occurred in HOOX: {str(e)}")
        frappe.throw("An unexpected error occurred", frappe.AuthenticationError)

def process_request(request_data, user_creds):
    process_trade_action(request_data, user_creds)
    process_telegram(request_data, user_creds)
    process_haas(request_data, user_creds)

def process_trade_action(request_data, user_creds):
    required_fields = ['action', 'symbol', 'order_type', 'secret_hash', 'quantity']

    if all(field in request_data for field in required_fields):
        if request_data['order_type'] == 'limit' and 'price' not in request_data:
            raise ValidationError("Price field is required for 'limit' order type.")
        elif user_creds.enabled:
            handle_alert(request_data, user_creds)
        else:
            raise ValidationError("Invalid Secret Hash")
    else:
        raise ValidationError("Missing required fields.")


def process_telegram(request_data, user_creds):
    telegram = request_data.get('telegram')
    if telegram and telegram.get('message'):
        toId = telegram.get('chat_id') or telegram.get('group_id')
        send_to_telegram(user_creds.user, telegram.get('message'), toId)

def process_haas(request_data, user_creds):
    haas = request_data.get('haas')
    if haas and haas.get('entity_id') and haas.get('service'):
        data = haas.get('data') or {}
        send_to_haas(haas.get('entity_id'), haas.get('service'), data)

def handle_alert(request_data, user_creds, is_retry=False):
    try:
        logging.info(f"Incoming request from TradingView: {request_data}")
        if not is_retry: 
            trade = frappe.get_doc({
                "doctype": "Trades",
                "user": user_creds.user,
                "secret_hash": request_data.get("secret_hash"),
                "action": request_data.get("action"),
                "exchange": user_creds.exchange,
                "symbol": request_data.get("symbol"),
                "price": request_data.get("price"),
                "quantity": request_data.get("quantity"),
                "market_type": request_data.get("market_type") or "futures"
            })
            trade.insert(ignore_permissions=True)
        else:
            trade = frappe.get_last_doc('Trades', {
                'secret_hash': request_data.get('secret_hash'),
                'state': ['!=', 'Success']
            })

        exchange_response = execute_order(
            request_data.get("action"),
            user_creds.exchange,
            request_data.get("symbol"),
            request_data.get("price"),
            request_data.get("quantity"),
            request_data.get("market_type"),
            user_creds)
               
        trade.append("outgoing_requests", {
            "doctype": "Outgoing Requests",
            "method": request_data.get('action'),
            "url": user_creds.exchange,
            "params": json.dumps(request_data),
            "response": exchange_response,
            "timestamp": (datetime.utcnow() + timedelta(hours=2)).strftime("%Y-%m-%d %H:%M:%S")
        })
        trade.save()

        send_to_telegram(user_creds.user, f"Order executed: {exchange_response}")
        logging.info(f"Outgoing request to Exchange: {request_data}")
        logging.info(f"Exchange response: {exchange_response}")

    except Exception as e:
        print(f"An error occurred: {e}")
        order_failed(user_creds.user, str(e))
        retry(request_data, user_creds)

def retry(request_data, user_creds):
    for i in range(5):  # Retry 5 times
        try:
            handle_alert(request_data, user_creds, is_retry=True)
            break
        except Exception as e:
            time.sleep(5)
            if i == 4:
                order_failed(user_creds.user, str(e))
