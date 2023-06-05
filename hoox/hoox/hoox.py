import frappe
import json
from .action import execute_order
from .user import (
    get_exchange_credentials,
    send_to_telegram,
    send_to_haas,
)
import time
from frappe import DoesNotExistError, ValidationError, _
from datetime import datetime
from frappe.utils import now_datetime, logger
from frappe.utils.background_jobs import enqueue
from tenacity import retry, stop_after_attempt, wait_exponential

frappe.utils.logger.set_log_level("DEBUG")
logger = frappe.logger("hoox", allow_site=True, file_count=50)


class NetworkError(Exception):
    pass


class APIError(Exception):
    pass


class ExchangeError(Exception):
    pass


class HooxAPI:

    """
    The Hoox class processes incoming requests and handles the required actions.
    """

    def __init__(self):
        """
        Initializes the Hoox object. It fetches Hoox settings and the request data.
        """

        self.cfg = frappe.get_single("Hoox Settings")
        self.request_data = json.loads(frappe.request.data)
        self.secret_hash = self.request_data.get("secret_hash")
        self.exchange_creds = get_exchange_credentials(self.secret_hash)
        self.retry = 0

    def get_retry_decorator():

        settings = frappe.get_single('Hoox Settings')
        if settings.retry_enabled:
            return retry(
                stop=stop_after_attempt(settings.retry_stop_after),
                wait=wait_exponential(
                    multiplier=settings.retry_backoff, min=settings.retry_min, max=settings.retry_max)
            )
        else:
            def no_retry(func):
                return func
            return no_retry

    def process_trade_action(self):
        """
        Processes the trade action in the request if all required fields are present and the exchange credentials are valid and enabled.
        """

        required_fields = ["action", "symbol",
                           "order_type", "secret_hash", "quantity"]

        if all(field in self.request_data for field in required_fields):
            if (
                self.request_data["order_type"] == "limit"
                and "price" not in self.request_data
            ):
                raise ValidationError(
                    "Price field is required for 'limit' order type.")
            elif self.exchange_creds.enabled:
                self.handle_alert()
            else:
                raise ValidationError("Invalid Secret Hash")

    def process_telegram(self):
        """
        Sends a message to Telegram if there is a "telegram" field in the request data.
        """

        telegram = self.request_data.get("telegram")
        if telegram and telegram.get("message"):
            toId = telegram.get("chat_id") or telegram.get("group_id")
            send_to_telegram(self.exchange_creds.user,
                             telegram.get("message"), toId)

    def process_haas(self):
        """
        Sends a request to Haas if there is a "haas" field in the request data.
        """

        haas = self.request_data.get("haas")
        if haas and haas.get("entity_id") and haas.get("service"):
            data = haas.get("data") or {}
            send_to_haas(
                self.exchange_creds.user,
                haas.get("entity_id"),
                haas.get("service"),
                data,
            )

    @get_retry_decorator()
    def handle_alert(self):
        """
        Handles an alert from a trading platform. If the alert results in a successful order, it updates the status of the trade and sends a message to Telegram. If the order fails, it retries the order based on the retry settings.
        """

        secret_hash = self.request_data.get("secret_hash")
        action = self.request_data.get("action")
        exchange_id = self.exchange_creds.exchange
        symbol = self.request_data.get("symbol")
        price = self.request_data.get("price")
        quantity = self.request_data.get("quantity")
        order_type = self.request_data.get("order_type") or "market"
        market_type = self.request_data.get("market_type") or "future"
        leverage = self.request_data.get("leverage") or 1
        # --
        exchange_response = None
        exchange_order_id = None
        status = "Processing"

        try:
            exchange_response = execute_order(
                action,
                exchange_id,
                symbol,
                price,
                quantity,
                order_type,
                market_type,
                leverage,
                self.exchange_creds,
            )

            exchange_order_id = exchange_response.get("info").get("orderId")
            status = "Success" if exchange_order_id else "Failed"

            self.retry = 0

            send_to_telegram(
                self.exchange_creds.user, f"Order executed: {exchange_response}"
            )

        except Exception as e:
            self.retry += 1
            send_to_telegram(
                self.exchange_creds.user,
                f"Order failed to execute. Exception: {e}",
            )

        if not self.retry:

            trade = frappe.get_doc(
                {
                    "doctype": "Trades",
                    "user": self.exchange_creds.user,
                    "secret_hash": secret_hash,
                    "action": action,
                    "order_type": order_type,
                    "market_type": market_type,
                    "exchange": self.exchange_creds.exchange,
                    "symbol": symbol,
                    "price": price,
                    "quantity": quantity,
                    "leverage": leverage,
                    "exchange_order_id": exchange_order_id,
                    "status": status,
                    "outgoing_requests": [
                        {
                            "method": action,
                            "url": exchange_response.get("url"),
                            "params": json.dumps(self.request_data),
                            "response": json.dumps(exchange_response),
                            "status": trade.status,
                        }]
                }
            )
            trade.insert(ignore_permissions=True)
            frappe.msgprint(
                f"Internal Trade-ID: {trade.name}\nExternal Trade-ID: {trade.exchange_order_id}")

        else:

            trade = frappe.get_last_doc(
                "Trades",
                {
                    "secret_hash": self.request_data.get("secret_hash"),
                    "status": ["!=", "Success"],
                },
            )
            trade.append(
                "outgoing_requests",
                {
                    "doctype": "Outgoing Requests",
                    "method": self.request_data.get("action"),
                    "url": exchange_response.get("url"),
                    "params": json.dumps(self.request_data),
                    "response": json.dumps(exchange_response),
                    "status": status,
                },
            )
            trade.save()
            frappe.msgprint(f"Using last Trade-ID: {trade.name}")

        return trade


@frappe.whitelist(allow_guest=True)
def hoox():
    """
    Main entry point for incoming requests. If there are valid exchange credentials and they are enabled, it processes the request.
    """
    start_time = time.time()

    hapi = HooxAPI()

    try:
        if hapi.exchange_creds and hapi.exchange_creds.enabled:
            start_time_trade = time.time()
            hapi.process_trade_action()
            end_time_trade = time.time()
            logger.info(
                f"Trade action time taken to process request: {end_time_trade - start_time_trade} seconds")
            start_time_telegram = time.time()
            hapi.process_telegram()
            end_time_telegram = time.time()
            logger.info(
                f"Telegram time taken to process request: {end_time_telegram - start_time_telegram} seconds")
            start_time_haas = time.time()
            hapi.process_haas()
            end_time_haas = time.time()
            logger.info(
                f"Haas time taken to process request: {end_time_haas - start_time_haas} seconds")
        end_time = time.time()
        logger.info(
            f"Full cycle time taken to process request: {end_time - start_time} seconds")
        return "Success"
    except (DoesNotExistError, ValidationError) as e:
        frappe.throw(str(e), frappe.AuthenticationError)
    except Exception as e:
        frappe.throw(_("An unexpected error occurred"),
                     frappe.AuthenticationError)
