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
    bot_token = frappe.db.get_single_value('Telegram Settings', 'bot_token')
    chat_id = frappe.db.get_value('Telegram User', {'user': user}, 'telegram_user_id')
    
    if bot_token and chat_id:
        bot = telegram.Bot(token=bot_token)
        bot.send_message(chat_id=chat_id, text=message)
    else:
        frappe.throw(_("Telegram settings are not correctly configured." + str(chat_id) + str(bot_token)) )

def order_failed(user, error_message):
    message = f"Order failed to execute. Error: {error_message}"
    send_to_telegram(user, message)
