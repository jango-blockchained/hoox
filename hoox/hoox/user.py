import frappe
from frappe import _
import telegram


def get_exchange_credentials(secret_hash):
    exchange_creds = frappe.get_doc("Exchange Credentials", secret_hash)
    if not exchange_creds:
        raise Exception(f"No exchange credentials found for secret hash {secret_hash}")
    return exchange_creds if exchange_creds.enabled else None


def get_telegram_credentials(user):
    telegram_creds = frappe.get_doc("Telegram Credentials", {"user": user})
    return telegram_creds if telegram_creds.enabled else None


def get_haas_credentials(user):
    haas_creds = frappe.get_doc("HomeAssistant Credentials", {"user": user})
    return haas_creds if haas_creds.enabled else None


def send_to_telegram(user, message, toId=None):
    settings = frappe.get_doc("Hoox Settings")
    bot_token = settings.telegram_bot_token if settings.telegram_enabled else None
    chat_id = toId or frappe.db.get_value(
        "Telegram Credentials", {"user": user}, "user_id"
    )

    if bot_token and chat_id:
        bot = telegram.Bot(token=bot_token)
        bot.send_message(chat_id=chat_id, text=message)
    # else:
    #     frappe.throw(_("Telegram settings under HOOX Settings are not correctly configured."))
    else:
        return None


def send_to_haas(user, entity_id, service, data=None):
    # Get Home Assistant credentials for the user from the DocType
    haas_creds = frappe.get_doc("HomeAssistant Credentials", {"user": user})

    # Check if credentials exist and are enabled
    # if not haas_creds:
    #     raise Exception(f"No HomeAssistant credentials found for user {user}")
    # else if not haas_creds.enabled:
    #     raise Exception(f"HomeAssistant credentials for user {user} are not enabled")

    if haas_creds and haas_creds.enabled:
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
    else:
        return None


def order_failed(user, error_message):
    message = f"Order failed to execute. Error: {error_message}"
    send_to_telegram(user, message)
