import frappe
from frappe import _
import telegram
from frappe.utils.password import get_decrypted_password


def get_exchange_credentials(secret_hash):
    exchange_creds = frappe.get_doc("Exchange Credentials", secret_hash)
    if not exchange_creds:
        raise Exception(f"No exchange credentials found for secret hash {secret_hash}")
    exchange_creds.api_key = get_decrypted_password(
        "Exchange Credentials", secret_hash, "api_key", False
    )
    exchange_creds.api_secret = get_decrypted_password(
        "Exchange Credentials", secret_hash, "api_secret", False
    )
    return exchange_creds if exchange_creds.enabled else None


def get_telegram_credentials(user):
    telegram_creds = frappe.get_doc("Telegram Credentials", {"user": user})
    return telegram_creds if telegram_creds.enabled else None


def get_haas_credentials(user):
    haas_creds = frappe.get_doc("Homeassistant Credentials", {"user": user})
    return haas_creds if haas_creds.enabled else None


def send_to_telegram(user, message, toId=None):
    settings = frappe.get_single("Hoox Settings")
    bot_token = settings.telegram_bot_token if settings.telegram_enabled else None
    telegram_creds = frappe.get_doc("Telegram Credentials", {"user": user})
    chat_id = (
        toId or telegram_creds.user_id or telegram_creds.group_id
        if telegram_creds.enabled
        else None
    )
    print(f"Telegram Bot Token: {bot_token}\nTelegram Chat ID: {chat_id}")
    if bot_token and chat_id:
        print(f"Sending to Telegram: {message}")
        bot = telegram.Bot(token=bot_token)
        bot.send_message(chat_id=chat_id, text=message)
    else:
        return None


def send_to_haas(user, entity_id, service, data=None):
    # Get Home Assistant credentials for the user from the DocType
    haas_creds = get_haas_credentials(user)

    if haas_creds and haas_creds.enabled:
        # Define the endpoint for the Home Assistant REST API
        url = f"{haas_creds.ha_url}/api/services/{service}/{entity_id}"

        # Define the headers for the API call
        headers = {
            "Authorization": f"Bearer {haas_creds.ha_user}:{haas_creds.ha_token}",
            "Content-Type": "application/json",
        }

        # Make the API call
        response = requests.post(url, headers=headers, data=data)

        # Check the response
        if response.status_code != 200:
            print(f"Failed to send to haas: {response.content}")

        return response.content
    else:
        return None


def order_failed(user, error_message):
    message = f"Order failed to execute. Error: {error_message}"
    send_to_telegram(user, message)
