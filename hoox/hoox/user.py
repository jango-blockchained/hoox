import frappe
from frappe import _
import telegram

def get_user_credentials(secret_hash):
    user_creds = frappe.get_doc('Exchange Credentials', secret_hash)
    return user_creds

def send_to_telegram(user, message):
    bot_token = frappe.db.get_single_value('Telegram Settings', 'bot_token')
    chat_id = frappe.db.get_value('User', user, 'telegram_chat_id')
    
    if bot_token and chat_id:
        bot = telegram.Bot(token=bot_token)
        bot.send_message(chat_id=chat_id, text=message)
    else:
        frappe.throw(_("Telegram settings are not correctly configured."))

def order_failed(user, error_message):
    message = f"Order failed to execute. Error: {error_message}"
    send_to_telegram(user, message)
