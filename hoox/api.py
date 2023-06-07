import frappe
from frappe.utils.logger import get_logger
import logging
import json
import time
from frappe import _
from .action import execute_order
from .user import get_exchange_credentials, send_to_haas
from tenacity import retry
from tenacity.stop import stop_after_attempt
from tenacity.wait import wait_exponential
from frappe.utils.password import get_decrypted_password
from frappe_telegram.client import send_message

# ------------------------------------------------------------


class HooxAPI:

    """
    The Hoox class processes incoming requests and handles the required actions.
    """

    # ------------------------------------------------------------

    # Properties
    client_ip_address = None
    secret_hash = None
    exchange_creds = None
    cfg = None
    data = None
    json = None
    retry = None
    log = None

    # ------------------------------------------------------------
    # Initialization

    def __setitem__(self, key, value):
        """
        Sets an item in the Hoox object.
        """

        setattr(self, key, value)

    def __getitem__(self, key):
        """
        Gets an item from the Hoox object.
        """

        return getattr(self, key)

    def __init__(self):
        """
        Initializes the Hoox object. It fet ches Hoox settings and the request data.
        """

        # Immediately return if the request method is not POST
        # if frappe.local.request.method != "POST":
        #     print(frappe.local.request.method)
        #     return

        # Validate IP address
        # self.client_ip_address = self.get_client_ip()
        # if not self.is_valid_ip(self.client_ip_address):
        #     return

        # Get request data
        self.data = frappe.request.data
        self.json = json.loads(self.data)

        # Get secret hash
        self.secret_hash = self.json.get("secret_hash")
        if not self.secret_hash:
            return

        self.exchange_creds = get_exchange_credentials(self.secret_hash)

        # Initialize retry counter
        self.retry = 0

        # Get Hoox settings and request data
        self.cfg = frappe.get_single("Hoox Settings")
        self.cfg.telegram_bot_token = get_decrypted_password(
            "Hoox Settings", "Hoox Settings", "telegram_bot_token", False
        )

        # Initialize logger
        self.log = get_logger(__name__)
        self.log.setLevel(logging.getLevelName(self.cfg.log_level))

    # ------------------------------------------------------------
    # Decorators

    def retry_on_exception():
        """
        Returns a retry decorator if retry is enabled in the Hoox settings.
        """

        cfg = frappe.get_single('Hoox Settings')
        if cfg.retry_enabled:
            return retry(
                stop=stop_after_attempt(cfg.retry_stop_after),
                wait=wait_exponential(
                    multiplier=cfg.retry_backoff, min=cfg.retry_min, max=cfg.retry_max)
            )
        else:
            def no_retry(func):
                """
                Returns the function if retry is disabled.
                """
                return func
            return no_retry

    @frappe.whitelist(allow_guest=True)
    def console_log_execution_time(func):
        """
        Logs the execution time of a function if logging is enabled.
        """

        log = get_logger(__name__ + '.timer')
        log.setLevel(logging.INFO)

        @frappe.whitelist(allow_guest=True)
        def wrapper(*args, **kwargs):
            """
            Returns the wrapped function with the execution time.
            """

            start_time = time.time()
            result = func(*args, **kwargs)
            end_time = time.time()
            msg = f"Execution time of {func.__name__}: {end_time - start_time} seconds"
            log.info(msg)

            return result
        return wrapper

    # ------------------------------------------------------------
    # Methods

    def immediately_response(self):
        """
        Immediately returns a response to the incoming request.
        """
        frappe.local.response.update({
            "http_status_code": 200,
            "message": "Success",
            "data": self.json
        })
        return

    # ------------------------------------------------------------

    @staticmethod
    @frappe.whitelist(allow_guest=True)
    def get_client_ip():
        """
        Gets the client IP address from the POST request.
        """
        if 'X-Forwarded-For' in frappe.local.request.headers:
            # the last IP in the X-Forwarded-For header is the original client IP
            ip_address = frappe.local.request.headers.get(
                'X-Forwarded-For').split(', ')[-1]
        else:
            ip_address = frappe.local.request.remote_addr
        return ip_address

    def is_valid_ip(self, ip_address):
        """
        Checks if the IP address is valid and not blacklisted.
        """
        docs = frappe.get_all('Alert IP Restriction')
        if len(docs) == 0:
            return

        for whitelisted in docs:
            if (whitelisted.ip == ip_address or whitelisted.ip == "*") and whitelisted.enabled:
                return True
    # ------------------------------------------------------------

    def process_trade_action(self):
        """
        Processes the trade action in the request if all required fields are present and the exchange credentials are valid and enabled.
        """

        required_fields = ["action", "symbol",
                           "order_type", "secret_hash", "quantity"]

        if all(field in self.json for field in required_fields):
            if (
                self.json["order_type"] == "limit"
                and "price" not in self.json
            ):
                self.log.debug(
                    "Price field is required for 'limit' order type.")
            elif self.exchange_creds.enabled:
                return self.handle_alert()
            else:
                self.log.debug("Invalid Secret Hash")

    def process_telegram(self):
        """
        Sends a message to Telegram if there is a "telegram" field in the request data.
        """

        # Return if Telegram is not enabled
        if not self.cfg.telegram_enabled:
            return

        # Return if there the alert holds no task
        telegram = self.json.get("telegram")
        if not telegram or not telegram.get("message"):
            return

        message = telegram.get("message")

        # Get Telegram credentials
        telegram_creds = frappe.get_doc(
            "Telegram User", {"user": self.exchange_creds.user})
        if not telegram_creds:
            return

        print(
            f"Sending to Telegram: # {telegram_creds.telegram_user_id}\t{message}")

        return send_message(
            message_text=message, user=self.exchange_creds.user, telegram_user=telegram_creds.telegram_user_id)

    def process_haas(self):
        """
        Sends a request to Haas if there is a "haas" field in the request data.
        """

        haas = self.json.get("haas")
        if haas and haas.get("entity_id") and haas.get("service"):
            payload = haas.get("data") or {}
            payload["entity_id"] = haas.get("entity_id")
            entity_domain = payload["entity_id"].split(".")[0]
            return send_to_haas(
                self.exchange_creds.user,
                entity_domain,
                haas.get("service"),
                payload,
            )

    # ------------------------------------------------------------

    @console_log_execution_time
    @retry_on_exception()
    def handle_alert(self):
        """
        Handles aa alert from a trading platform. If the alert results in a successful order, it updates the status of the trade and sends a message to Telegram. If the order fails, it retries the order based on the retry settings.
        """

        # Extract relevant information from the request data
        secret_hash = self.json.get("secret_hash")
        action = self.json.get("action")
        exchange_id = self.exchange_creds.exchange
        symbol = self.json.get("symbol")
        price = self.json.get("price")
        quantity = self.json.get("quantity")
        order_type = self.json.get("order_type") or "market"
        market_type = self.json.get("market_type") or "future"
        leverage = self.json.get("leverage") or 1

        # Initialize variables for exchange response, order ID, and status
        exchange_response = None
        exchange_order_id = None
        status = "Processing"

        # Execute order and handle exceptions
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
                self.exchange_creds.user, f"Order executed: {exchange_response}", self.cfg
            )

            # Update trade document based on retry status
            trade = None

            if self.retry <= 1:
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
                    }
                )
                trade.insert(ignore_permissions=True)

                incoming_request = frappe.get_doc({
                    "doctype": "incoming_requests",
                    "method": action,
                    "url": exchange_response.get("url"),
                    "params": json.dumps(self.json),
                    # "response_incoming": json.dumps(exchange_response),
                    # "request_outgoing": self.data,
                    "status": "Success",
                    "origin": trade.name
                })
                incoming_request.insert(ignore_permissions=True)

            else:
                trade = frappe.get_last_doc(
                    "Trades",
                    {
                        "secret_hash": self.json.get("secret_hash"),
                        "status": ["!=", "Success"],
                    },
                )
                trade.status = status
                trade.save()

            outgoing_request = frappe.get_doc({
                "doctype": "outgoing_requests",
                "method": action,
                "url": exchange_response.get("url"),
                "params": json.dumps(self.json),
                "request_incoming": incoming_request.name,
                # "response_incoming": json.dumps(exchange_response),
                "status": status,
                "origin": trade.name
            })
            outgoing_request.insert(ignore_permissions=True)

            incoming_response = frappe.get_doc({
                "doctype": "incoming_response",
                "method": action,
                "url": exchange_response.get("url"),
                "params": exchange_response.get("original_response"),
                "request_incoming": incoming_request.name,
                "request_outgoing": outgoing_request.name,
                "status": status,
                "origin": trade.name
            })
            incoming_response.insert(ignore_permissions=True)

            outgoing_request.response_incoming = incoming_response.name
            outgoing_request.save()

            retry_no = self.retry + 1
            self.log.info(
                f"Internal Trade-ID: {trade.name}\tExternal Trade-ID: {trade.exchange_order_id}\tRequest # {retry_no}")

            return trade

        except Exception as e:
            self.retry += 1
            send_to_telegram(
                self.exchange_creds.user,
                f"Order failed to execute. Retry # {self.retry+1} Exception: {e}", self.cfg
            )


# ------------------------------------------------------------
# Expose the hoox function to the outside world


@frappe.whitelist(allow_guest=True)
def receive_alert():
    """
    Main entry point for incoming requests. If there are valid exchange credentials and they are enabled, it processes the request.
    """

    hapi = HooxAPI()

    try:
        if hapi.exchange_creds and hapi.exchange_creds.enabled:
            hapi.immediately_response()
            hapi.process_trade_action()
            # hapi.process_telegram()
            hapi.process_haas()
            frappe.enqueue(hapi.process_telegram, queue='default',
                           timeout=60, job_name='send_telegram_message', is_async=True)
            # frappe.enqueue(hapi.process_haas, queue='short',
            #                timeout=15, is_async=True)

    except Exception as e:
        print(f"Error: {e}")


# DEVELOPMENT ONLY
# @frappe.whitelist(allow_guest=True)
# def get_ip():
#     return HooxAPI.get_client_ip()
