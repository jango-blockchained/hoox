import frappe
from frappe import _
import telegram
from frappe.utils.password import get_decrypted_password
import requests
from frappe.auth import LoginManager, HTTPRequest


def get_exchange_credentials(secret_hash):
    exchange_creds = frappe.get_doc("Exchange Credentials", {
                                    "secret_hash": secret_hash})
    if not exchange_creds:
        raise Exception(
            f"No exchange credentials found for secret hash {secret_hash}")
    exchange_creds.api_key = get_decrypted_password(
        "Exchange Credentials", exchange_creds.name, "api_key", False
    )
    exchange_creds.api_secret = get_decrypted_password(
        "Exchange Credentials", exchange_creds.name, "api_secret", False
    )
    return exchange_creds if exchange_creds.enabled else None


def auth(secret_hash):
    creds = get_exchange_credentials(secret_hash)
    True if creds is not None else False


def get_telegram_credentials(user):
    telegram_creds = frappe.get_doc("Telegram User", {"user": user})
    return telegram_creds


def get_haas_credentials(user):
    haas_creds = frappe.get_doc(
        "Homeassistant Credentials", {"user": user})
    return haas_creds if haas_creds.enabled else None


# def send_to_telegram(user, message, settings, toId=None):

#     if not settings.telegram_enabled or not settings.telegram_bot_token:
#         return

#     telegram_creds = frappe.get_doc("Telegram Credentials", {"user": user})
#     if not telegram_creds:
#         return

#     chat_id = (
#         toId or telegram_creds.user_id or telegram_creds.group_id
#         if telegram_creds.enabled
#         else None
#     )
#     bot = telegram.Bot(token=settings.telegram_bot_token)
#     response = bot.send_message(chat_id=chat_id, text=message)
#     # print(f"Sending to Telegram: # {chat_id}\t{message}")

#     return response

# def send_to_telegram(user, message, toId=None):
#     """
#     Sends a message to a Telegram user or group.
#     """
#     telegram_creds = frappe.get_doc("Telegram User", {"user": user})
#     if not telegram_creds:
#         return

#     chat_id = toId or telegram_creds.telegram_user_id
#     response = send_message(
#         message_text=message, telegram_user=telegram_creds.telegram_username)
#     print(f"Sending to Telegram: # {chat_id}\t{message}")

#     return response


def send_to_haas(user, entity_domain, service, payload):
    """
    Sends a request to Home Assistant if there is a "haas" field in the request data.

    Incoming << JSON format:
    {
        "secret_hash": "SECRET_HASH",
        "haas": {
            "entity_id": "light.living_room",
            "service": "turn_on|turn_off|toggle|...",
            * "data": {
                * "rgb_color": [255, 255, 255],
                * "brightness": 255,
                * "color_temp": 255
                * "effect": "colorloop|random|flash|...",
                * "flash": "short|long",
                * "transition": 255,
                * "xy_color": [0.5, 0.5],
                * "profile": "relax|energize|concentrate|..."
                **** all available fields ....
            }
        }
    }
    * Optional fields

    Outgoing >> JSON format:
    {
        "entity_id": "light.living_room",
        * "rgb_color": [255, 255, 255],
        * "brightness": 255,
        * "color_temp": 255
        * "effect": "colorloop|random|flash|...",
    }
    """
    print(f"Sending to haas: {payload}")
    if not user or not service or not entity_domain:
        return frappe.throw("Invalid request data")

    if not payload or not isinstance(payload, dict) or not payload.get("entity_id"):
        return frappe.throw("Invalid request data")

    # Get Home Assistant credentials for the user from the DocType
    haas_creds = get_haas_credentials(user)

    if not haas_creds or not haas_creds.enabled:
        return frappe.throw("Home Assistant credentials not found")

    # Define the endpoint for the Home Assistant REST API
    url = f"{haas_creds.ha_url}/api/services/{entity_domain}/{service}"
    print(f"Sending to haas: {url}")
    # Define the headers for the API call
    headers = {
        "Authorization": f"Bearer {haas_creds.ha_token}",
        "Content-Type": "application/json",
    }

    # Make the API call
    response = requests.post(url, headers=headers, json=payload)
    # response.raise_for_status()
    frappe.msgprint(f"Response from haas: {response}")
    # Check the response
    if response.status_code != 200:
        return frappe.throw("Error sending request to Home Assistant")

    return response
