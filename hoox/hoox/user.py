import frappe
from frappe import _
import telegram

def get_user_credentials(secret_hash):
    user_creds = frappe.get_doc('Exchange Credentials', secret_hash)
    if not user_creds:
        raise Exception(f"No exchange credentials found for secret hash {secret_hash}")
    return user_creds if user_creds.enabled else None

def get_haas_credentials(user):
    haas_creds = frappe.get_doc("HomeAssistant Credentials", {"user": user})
    return haas_creds if haas_creds.enabled else None

def send_to_telegram(user, message):
    bot_token = frappe.db.get_single_value('Hoox Settings', 'telegram_bot_token')
    chat_id = frappe.db.get_value('Telegram Credentials', {'user': user}, 'user_id')
    
    if bot_token and chat_id:
        bot = telegram.Bot(token=bot_token)
        bot.send_message(chat_id=chat_id, text=message)
    else:
        frappe.throw(_("Telegram settings are not correctly configured." + str(chat_id) + str(bot_token)) )

def send_to_haas(user, entity_id, service, data):
    # Get Home Assistant credentials for the user from the DocType
    haas_creds = frappe.get_doc("HomeAssistant Credentials", {"user": user})

    # Check if credentials exist and are enabled
    if not haas_creds:
        raise Exception(f"No HomeAssistant credentials found for user {user}")
    else if not haas_creds.enabled:
        raise Exception(f"HomeAssistant credentials for user {user} are not enabled")
    
    # Define the endpoint for the Home Assistant REST API
    url = f"{haas_creds.protocol}://{haas_creds.url}/api/services/{service}/{entity_id}"

    # Define the headers for the API call
    headers = {
        "Authorization": f"Bearer {haas_creds.auth_token}",
        "Content-Type": "application/json",
    }

    # Make the API call
    response = requests.post(url, headers=headers, data=data)

    # Check the response
    if response.status_code != 200:
        raise Exception(f"Failed to send to haas: {response.content}")

    return response.content


def order_failed(user, error_message):
    message = f"Order failed to execute. Error: {error_message}"
    send_to_telegram(user, message)
