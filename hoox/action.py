import frappe
import ccxt
import requests
import logging
import json
import os
import io
from frappe import _
from frappe import get_doc
from frappe.utils.logger import get_logger
from frappe.desk.form.linked_with import get_linked_docs, get_linked_doctypes
from frappe.utils import get_files_path
from frappe.utils.file_manager import save_file
import frappe.utils.file_manager as file_manager

from urllib.parse import urlparse
from io import BytesIO

# Function Definition
ORDER_TYPE_FUNCS = {
    "buy": {
        "limit": "create_limit_buy_order",
        "market": "create_market_buy_order",
    },
    "sell": {
        "limit": "create_limit_sell_order",
        "market": "create_market_sell_order",
    },
}

# Logger
logger = get_logger(__name__)
logger_level = logging.getLevelName("DEBUG")
logger.setLevel(logger_level)


def get_linked_documents(doctype, docname):
    """
    Get linked documents for a given doctype and docname.
    """

    link_info = get_linked_doctypes(doctype)
    docs = get_linked_docs(doctype, docname, link_info)
    print(docs)
    return docs


def execute_order(action, exchange_id, symbol, price, quantity, percent, order_type, market_type, leverage, user_creds):
    """
    Execute an order on an exchange using CCXT.
    Returns the order object.
    """

    try:
        # Get exchange
        exchange = getattr(ccxt, exchange_id)({
            "apiKey": user_creds.api_key,
            "secret": user_creds.api_secret,
            "enableRateLimit": True,
            "options": {
                "defaultType": market_type,
                "test": user_creds.testnet,
                "createMarketBuyOrderRequiresPrice": False,
                "createMarketSellOrderRequiresPrice": False
            }
        })

        # Set testnet
        # if user_creds.testnet:
        #     if "test" in exchange.urls:
        #         exchange.urls["api"] = exchange.urls["test"]
        #         logger.info(f"Exchange URL: {exchange.urls['api']}")
        #     else:
        #         raise ValueError(
        #             f"Exchange {exchange_id} does not have a testnet.")

        if user_creds.testnet:
            exchange.set_sandbox_mode(True)

        response = {}

        # open_orders = exchange.fetch_open_orders(symbol)
        # open_order_amount = sum([order['remaining']
        #                          for order in open_orders])
        # if percent:
        #     quantity = open_order_amount * quantity / 100

        # Set leverage
        if market_type == "future" and "set_leverage" in exchange.has and leverage is not None and 0 < leverage <= exchange.maxLeverage:
            exchange.set_leverage(leverage)

        # Check action
        if action not in ["buy", "sell", "close", None]:
            raise ValueError(f"Invalid action: {action}")

        # Execute order
        if action in ["buy", "sell"]:
            order_func_name = ORDER_TYPE_FUNCS[action].get(order_type)
            if order_func_name:
                order_func = getattr(exchange, order_func_name)

                if order_type == "limit":
                    response["order"] = order_func(symbol, quantity, price)
                else:
                    response["order"] = order_func(symbol, quantity)

                # response["details"] = exchange.fetch_open_order(
                #     response["order"]["id"], symbol)

        elif action == "close":
            all_orders = exchange.fetch_open_orders(symbol)
            response["order"] = [exchange.cancel_order(
                order["id"]) for order in all_orders]

        # Details
        # response["last"] = exchange.last_json_response
        # response["original_data"].pop("Trades", None)

        return response

    except AttributeError as e:
        msg = f"Exchange {exchange_id} not found in CCXT."
        frappe.msgprint(msg)
        logger.error(msg)

    except (ccxt.BaseError, ValueError, Exception) as e:
        msg = f"An error occurred: {str(e)}"
        frappe.msgprint(msg)
        logger.error(msg)


@frappe.whitelist()
def sync_exchanges():
    """
    Sync exchanges from ccxt module to the database.
    """

    # Get list of exchanges
    amount = len(ccxt.exchanges)
    for i, exchange_id in enumerate(ccxt.exchanges):
        if hasattr(ccxt, exchange_id):
            exchange_class = getattr(ccxt, exchange_id)
            exchange = exchange_class()  # create an instance of the exchange class

            # Check if the exchange document already exists
            exchange_exists = frappe.db.exists("CCXT Exchanges", exchange.id)

            # set logo_url field in the doc
            exchange_doc_data = {
                "doctype": "CCXT Exchanges",
                "exchange_name": exchange.name,
                "exchange_id": exchange.id,
                "precision_mode": exchange.precisionMode,
                "rate_limit": exchange.rateLimit,
                "testnet": 1 if exchange.urls.get("test") is not None else 0,
                "has": json.dumps(exchange.has),
                "logo_url": exchange.urls.get("logo"),
            }

            if exchange_exists:
                # If the document exists, fetch it
                doc = frappe.get_doc("CCXT Exchanges", exchange.id)
                doc.update(exchange_doc_data)
            else:
                # If the document doesn't exist, create a new one
                doc = frappe.get_doc(exchange_doc_data)

            # Save the document with exception handling for duplicate entries
            try:
                doc.save(ignore_permissions=True)
                # Download and attach the logo file
                logo_url = exchange.urls.get("logo")
                if logo_url:
                    # Download and attach the logo file
                    # if logo_url:
                    try:
                        attach_url_to_document(doc, logo_url)
                    except Exception as e:
                        frappe.msgprint(
                            f"Error attaching logo for {exchange_id}: {e}")

            except frappe.DuplicateEntryError:
                continue

            frappe.publish_progress(
                percent=((i + 1) / amount) * 100, title=_('Processing...'))

    frappe.db.commit()
    return


@frappe.whitelist()
def delete_exchanges(force=False):
    """
    Delete all exchanges from the database.
    """

    if frappe.db.count("CCXT Exchanges") == 0:
        frappe.msgprint(f"No exchanges found in database.")
        return False

    docs = frappe.get_all("CCXT Exchanges")
    amount = len(docs)
    for i, doc in enumerate(docs):
        linked_docs = get_linked_documents("CCXT Exchanges", doc.name)
        links = len(linked_docs)
        if links > 0:
            if not force:
                frappe.msgprint(
                    f"Exchange '{doc.name}' has {links} linked documents. Skipping deletion."
                )
                continue
        frappe.delete_doc("CCXT Exchanges", doc.name, force=force)
        frappe.publish_progress(percent=((i + 1) / amount) *
                                100, title=_('Processing...'))

    frappe.db.commit()

    return f"{amount} exchanges deleted successfully."


@frappe.whitelist()
def add_ip_addresses():
    # replace with your IP addresses
    ip_addresses = ["52.89.214.238", "34.212.75.30",
                    "54.218.53.128", "52.32.178.7"]
    for i, ip_address in enumerate(ip_addresses, start=1):
        friendly_name = 'TradingView™ IP Whitelist {}'.format(i)
        # Check if the doc exists
        if not frappe.db.exists('IP Whitelist', {"ip": ip_address}):
            doc = frappe.new_doc('IP Whitelist')
            doc.friendly_name = friendly_name
            doc.ip = ip_address
            doc.insert()
        frappe.db.commit()
    frappe.msgprint(
        "{} IP addresses added successfully.".format(len(ip_addresses)))
    return


def save_file_from_buffer(buffer, filename):
    with open(filename, 'wb') as file:
        file.write(buffer.getbuffer())


def attach_url_to_document(doc, file_url):
    try:
        doc.append("attachments", {
            "file_url": file_url
        })
        doc.save()
        print("File attached successfully.")
    except frappe.DoesNotExistError:
        print("Document does not exist.")
    except Exception as e:
        print(f"An error occurred: {str(e)}")


@frappe.whitelist()
def sync_symbols():
    enabled_exchanges = frappe.get_all("CCXT Exchanges", filters={
                                       "enabled": 1}, fields=["name"])
    total_exchanges = len(enabled_exchanges)

    processed_steps = 0
    steps = 0
    for ei, exchange_data in enumerate(enabled_exchanges):
        exchange_id = exchange_data["name"]
        exchange_class = getattr(ccxt, exchange_id)
        print(exchange_id)
        for testnet in [True, False]:
            exchange_instance = exchange_class({'testnet': testnet})
            supported_market_types = get_supported_market_types(
                exchange_instance)
            for mi, marketType in enumerate(supported_market_types):

                exchange_instance.options['defaultType'] = marketType
                markets = exchange_instance.load_markets()
                steps += len(markets)
                for symbol, market_data in markets.items():
                    symbol_exists = frappe.db.exists(
                        "Symbols", {"symbol": symbol, "exchange": exchange_id, "market": marketType})

                    if not symbol_exists:
                        # new_symbol = frappe.new_doc("Symbols")
                        new_symbol = frappe.get_doc({
                            "doctype": "Symbols",
                            "symbol": symbol,
                            "exchange": exchange_id,
                            "market": marketType
                        })

                        new_symbol.symbol_id = market_data["id"]
                        new_symbol.base_id = market_data["baseId"]
                        new_symbol.quote_id = market_data["quoteId"]
                        new_symbol.exchange = exchange_id
                        new_symbol.market = marketType
                        new_symbol.enabled = 0
                        url = f"/assets/hoox/svg/symbols/svg/color/{market_data['baseId']}.svg".lower(
                        )
                        if file_manager.file_exists(url):
                            new_symbol.logo_url = frappe.utils.get_url(url)

                        new_symbol.params = json.dumps(market_data)
                        new_symbol.save(ignore_permissions=True)

                    processed_steps += 1
                    progress_percentage = (
                        processed_steps / steps) * 100 * (ei+1) / total_exchanges * (mi+1) / 2
                    frappe.publish_progress(progress_percentage, title=_(
                        f"Syncing Symbols..."), description=f"Processing {exchange_id} {marketType} {symbol}")
                processed_steps = 0

    frappe.publish_progress(100, title=_(
        "Syncing Symbols..."), description=_("Completed!"))

    return 'Successfull'


def get_supported_market_types(exchange):
    supported_market_types = []

    if hasattr(exchange, 'has') and exchange.has:
        for market_type in ['spot', 'future']:
            if exchange.has.get(market_type):
                supported_market_types.append(market_type)

    return supported_market_types


@frappe.whitelist()
def activate_symbols():
    docs = frappe.get_all("Symbols")
    amount = len(docs)
    for i, ref in enumerate(docs):
        frappe.db.set_value("symbols", symbol.name, "enabled", 1)
        frappe.publish_progress(
            i / amount * 100, title=_("Activating"), description=_("Processing"))
    frappe.publish_progress(100, title=_("Activating"),
                            description=_("Finished"))
    return 'Successfull'


@frappe.whitelist()
def delete_symbols():
    """
    Delete all exchanges from the database.
    """

    if frappe.db.count("Symbols") == 0:
        frappe.msgprint(f"No Symbols found in database.")
        return False

    docs = frappe.get_all("Symbols")
    amount = len(docs)
    for i, doc in enumerate(docs):
        frappe.delete_doc("Symbols", doc.name, ignore_missing=True, force=True)
        frappe.publish_progress(percent=(i / amount) *
                                100, title=_('Processing...'))

    frappe.publish_progress(percent=100, title=_('Processing...'))

    return f"{amount} symbols deleted successfully."


# @frappe.whitelist()
# def download_exchange_logo(exchange_id, logo_url):
#     directory = "public/images/exchange_logos"
#     os.makedirs(directory, exist_ok=True)

#     url_file_name = os.path.basename(logo_url)
#     # Split the filename into name and extension
#     url_name, url_extension = os.path.splitext(url_file_name)

#     file_name = f"{exchange_id}_logo.{url_extension.lstrip('.')}"
#     file_path = os.path.join(directory, file_name)

#     response = requests.get(logo_url)
#     if response.status_code == 200:
#         with open(file_path, "wb") as file:
#             file.write(response.content)
#         print(f"Logo downloaded for exchange {exchange_id}")
#     else:
#         print(f"Failed to download logo for exchange {exchange_id}")

#     # Using io.BytesIO to write the response content
#     if response.status_code == 200:
#         with open(file_path, "wb") as file:
#             buffer = io.BytesIO(response.content)
#             file.write(buffer.read())
#         print(f"Logo downloaded for exchange {exchange_id}")
#     else:
#         print(f"Failed to download logo for exchange {exchange_id}")


# @frappe.whitelist()
# def download_all_exchange_logos():
#     directory = "public/images/exchange_logos"
#     os.makedirs(directory, exist_ok=True)

#     for exchange_id in ccxt.exchanges:
#         exchange_class = getattr(ccxt, exchange_id)
#         exchange = exchange_class()

#         logo_url = exchange.urls.get("logo")
#         if logo_url:
#             download_exchange_logo(exchange_id, logo_url)
