import frappe
import json
import requests
import logging
from .exchange import execute_order
from .user import get_user_credentials, send_to_telegram, order_failed
# from .home_assistant import send_to_home_assistant

logging.basicConfig(filename='alerts.log', level=logging.INFO)

@frappe.whitelist(allow_guest=True)
def hoox():
    try:
        request_data = json.loads(frappe.request.data)
        secret_hash = request_data.get('secret_hash')
        user_creds = get_user_credentials(secret_hash)
        if user_creds.enabled:
            handle_alert(request_data, user_creds)
        else:
            # The token is invalid, so we return an error response
            return {"error": "Invalid Secret Hash"}
    except Exception as e:
        # Catch any other exceptions and return an error response
        return {"error": str(e)}


def handle_alert(request_data, user_creds):
    try:
        # Logging
        logging.info(f"Incoming request from TradingView: {request_data}")

        # Create a new Trade doc
        trade = frappe.get_doc({
            "doctype": "Trade",
            "user": user_creds.user,
            "secret_hash": request_data.get("secret_hash"),
            "action": request_data.get("action"),
            "exchange": user_creds.exchange,
            "symbol": request_data.get("symbol"),
            "price": request_data.get("price"),
            "quantity": request_data.get("quantity"),
            "order_type": request_data.get("order_type")
        })
        trade.insert(ignore_permissions=True)

            # Call to the exchange
        exchange_response = execute_order(
            request_data.get("action"),
            user_creds.exchange,
            request_data.get("symbol"),
            request_data.get("price"),
            request_data.get("quantity"),
            request_data.get("order_type"),
            user_creds)
        send_to_telegram(user_creds.user, f"Order executed: {exchange_response}")
        # send_to_home_assistant('light.led_strip_whiteboard', 'turn_on')
        logging.info(f"Outgoing request to Exchange: {request_data}")
        logging.info(f"Exchange response: {exchange_response}")
        # Append to the 'OutgoingRequest' child table
        trade.append("outgoing_requests", {
            "doctype": "Outgoing Requests",
            "request_data": request_data,
            "exchange_response": exchange_response
        })
        trade.save()

    except Exception as e:
        print(f"An error occurred: {e}")
        order_failed(user_creds.user, str(e))
        retry(request_data, user_creds)


def retry(request_data, user_creds):
    for i in range(3):  # Retry 3 times
        try:
            handle_alert(request_data, user_creds)
            break
        except Exception as e:
            sleep(1)  # Wait for 1 second before retrying
            if i == 2:  # If this was the last attempt
                order_failed(user_creds.user, str(e))

