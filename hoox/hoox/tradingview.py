import frappe
import json
from .exchange import execute_order
from .user import get_user_credentials, send_to_telegram, order_failed
# from .home_assistant import send_to_home_assistant

@frappe.whitelist(allow_guest=True)
def hoox_old():
    if frappe.request.data:
        data = json.loads(frappe.request.data)
        secret_hash = data.get('secret_hash')
        user_creds = get_user_credentials(secret_hash)
        if user_creds.enabled:
            handle_alert(data, user_creds)

def handle_alert(alert, user_creds):
    try:
        action = alert.get("action")
        exchange_id = alert.get("exchange")
        symbol = alert.get("symbol")
        price = float(alert.get("price"))
        amount = int(alert.get("amount"))
        order_type = alert.get("type")

        execute_order(action, exchange_id, symbol, price, amount, order_type, user_creds)

        send_to_telegram(user_creds.user, f"Order executed: {order}")

        # send_to_home_assistant('light.led_strip_whiteboard', 'turn_on')
    except Exception as e:
        print(f"An error occurred: {e}")
        order_failed(user_creds.user, str(e))
        retry(alert, user_creds)

@frappe.whitelist(allow_guest=True)
def hoox():
    try:
        data = json.loads(frappe.request.data)
        secret_hash = data.get('secret_hash')
        user_creds = get_user_credentials(secret_hash)
        if user_creds.enabled:
            handle_alert(data, user_creds)
        else:
            # The token is invalid, so we return an error response
            return {"error": "Invalid Secret Hash"}
    except Exception as e:
        # Catch any other exceptions and return an error response
        return {"error": str(e)}


def retry(alert, user_creds):
    for i in range(3):  # Retry 3 times
        try:
            handle_alert(alert, user_creds)
            break
        except Exception as e:
            sleep(1)  # Wait for 1 second before retrying
            if i == 2:  # If this was the last attempt
                order_failed(user_creds.user, str(e))
