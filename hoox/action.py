import frappe
import ccxt
import logging
from frappe import _
from frappe.utils.logger import get_logger
from frappe.desk.form.linked_with import get_linked_docs, get_linked_doctypes

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

        if user_creds.testnet:
            exchange.set_sandbox_mode(True)

        response = {}

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

        elif action == "close":
            all_orders = exchange.fetch_open_orders(symbol)
            response["order"] = [exchange.cancel_order(order["id"]) for order in all_orders]

        return response

    except ccxt.RequestTimeout as e:
        msg = f"Request timed out: {str(e)}"
        frappe.msgprint(msg)
        logger.error(msg)

    except ccxt.AuthenticationError as e:
        msg = f"Authentication error: {str(e)}"
        frappe.msgprint(msg)
        logger.error(msg)

    except ccxt.ExchangeNotAvailable as e:
        msg = f"Exchange not available: {str(e)}"
        frappe.msgprint(msg)
        logger.error(msg)

    except ccxt.ExchangeError as e:
        msg = f"Exchange error: {str(e)}"
        frappe.msgprint(msg)
        logger.error(msg)

    except ccxt.BaseError as e:
        msg = f"Base error in CCXT: {str(e)}"
        frappe.msgprint(msg)
        logger.error(msg)

    except ValueError as e:
        msg = f"Value error: {str(e)}"
        frappe.msgprint(msg)
        logger.error(msg)

    except AttributeError as e:
        msg = f"Attribute error: {str(e)}"
        frappe.msgprint(msg)
        logger.error(msg)

    except Exception as e:
        msg = f"An unexpected error occurred: {str(e)}"
        frappe.msgprint(msg)
        logger.error(msg)


# @frappe.whitelist()
# def sync_exchanges():
#     """
#     Sync exchanges from ccxt module to the database.
#     """

#     # Get list of exchanges
#     amount = len(ccxt.exchanges)
#     for i, exchange_id in enumerate(ccxt.exchanges):
#         if hasattr(ccxt, exchange_id):
#             exchange_class = getattr(ccxt, exchange_id)
#             exchange = exchange_class()  # create an instance of the exchange class

#             # Check if the exchange document already exists
#             exchange_exists = frappe.db.exists("Exchange", exchange.id)

#             # set logo_url field in the doc
#             exchange_doc_data = {
#                 "doctype": "Exchange",
#                 "exchange_name": exchange.name,
#                 "exchange_id": exchange.id,
#                 "precision_mode": exchange.precisionMode,
#                 "rate_limit": exchange.rateLimit,
#                 "testnet": 1 if exchange.urls.get("test") is not None else 0,
#                 "has": json.dumps(exchange.has, indent=4),
#                 "logo_url": exchange.urls.get("logo"),
#             }

#             if exchange_exists:
#                 # If the document exists, fetch it
#                 doc = frappe.get_doc("Exchange", exchange.id)
#                 doc.update(exchange_doc_data)
#             else:
#                 # If the document doesn't exist, create a new one
#                 doc = frappe.get_doc(exchange_doc_data)

#             # Save the document with exception handling for duplicate entries
#             try:
#                 doc.save(ignore_permissions=True)
#                 # Download and attach the logo file
#                 logo_url = exchange.urls.get("logo")
#                 if logo_url:
#                     # Download and attach the logo file
#                     # if logo_url:
#                     try:
#                         attach_url_to_document(doc, logo_url)
#                     except Exception as e:
#                         frappe.msgprint(
#                             f"Error attaching logo for {exchange_id}: {e}")

#             except frappe.DuplicateEntryError:
#                 continue

#             frappe.publish_progress(
#                 percent=((i + 1) / amount) * 100, title=_('Processing...'))

#     frappe.db.commit()
#     return


# @frappe.whitelist()
# def delete_exchanges(force=False):
#     """
#     Delete all exchanges from the database.
#     """

#     if frappe.db.count("Exchange") == 0:
#         frappe.msgprint(f"No exchanges found in database.")
#         return False

#     docs = frappe.get_all("Exchange")
#     amount = len(docs)
#     for i, doc in enumerate(docs):
#         linked_docs = get_linked_documents("Exchange", doc.name)
#         links = len(linked_docs)
#         if links > 0:
#             if not force:
#                 frappe.msgprint(
#                     f"Exchange '{doc.name}' has {links} linked documents. Skipping deletion."
#                 )
#                 continue
#         frappe.delete_doc("Exchange", doc.name, force=force)
#         frappe.publish_progress(percent=((i + 1) / amount) *
#                                 100, title=_("Processing..."))

#     frappe.db.commit()

#     return f"{amount} exchanges deleted successfully."


from frappe.desk.form.load import get_attachments

@frappe.whitelist()
def get_attachment_url(doctype, docname):
    attachments = get_attachments(doctype, docname)
    if attachments:
        # return the URL of the first attachment
        return attachments[0].file_url
    else:
        return None
    


# @frappe.whitelist()
# def get_svg_logo(symbol):
#     base_url = "https://api.coingecko.com/api/v3"
#     endpoint = f"/coins/{symbol.lower()}"
#     params = {
#         "localization": False,
#     }

#     try:
#         response = requests.get(url=f"{base_url}{endpoint}", params=params)
#         response.raise_for_status()
#         data = response.json()
#         logo_url = data.get("image", {}).get("large")

#         if logo_url:
#             logo_response = requests.get(url=logo_url)
#             logo_response.raise_for_status()
#             return logo_response.content

#     except requests.exceptions.RequestException as e:
#         frappe.msgprint(f"Error fetching SVG logo for {symbol}: {e}")
#         return None

# @frappe.whitelist()
# def sync_exchange_symbols(exchange_id):
#     exchange_class = getattr(ccxt, exchange_id)
#     exchange_instance = exchange_class()
#     supported_market_types = exchange_instance.load_markets().keys()

#     for market_type in supported_market_types:
#         exchange_instance.options['defaultType'] = market_type
#         markets = exchange_instance.load_markets()

#         for symbol, market_data in markets.items():
#             symbol_exists = frappe.db.exists(
#                 "Symbol", {"symbol": symbol, "exchange": exchange_id, "market": market_type})

#             if symbol_exists:
#                 continue

#             try:
#                 new_symbol = frappe.get_doc({
#                     "doctype": "Symbol",
#                     "symbol": symbol,
#                     "exchange": exchange_id,
#                     "market": market_type
#                 })

#                 new_symbol.symbol_id = market_data["id"]
#                 new_symbol.base_id = market_data["baseId"]
#                 new_symbol.quote_id = market_data["quoteId"]
#                 new_symbol.exchange = exchange_id
#                 new_symbol.market = market_type
#                 new_symbol.enabled = 0

#                 svg_logo = get_svg_logo(market_data["baseId"])
#                 if svg_logo:
#                     logo_file_name = f"{market_data['baseId']}.svg"
#                     logo_file_path = frappe.get_site_path("public", "files", logo_file_name)
#                     with open(logo_file_path, "wb") as logo_file:
#                         logo_file.write(svg_logo)
#                     new_symbol.logo_attachment = logo_file_name

#                 new_symbol.params = json.dumps(market_data, indent=4)
#                 new_symbol.insert(ignore_permissions=True)

#             except Exception as e:
#                 frappe.msgprint(f"An error occurred: {str(e)}")


# @frappe.whitelist()
# def sync_symbols():
#     enabled_exchanges = frappe.get_all("Exchange", filters={
#                                        "enabled": 1}, fields=["name"])
#     total_exchanges = len(enabled_exchanges)

#     for ei, exchange_data in enumerate(enabled_exchanges):
#         exchange_id = exchange_data["name"]
#         sync_exchange_symbols(exchange_id)

#         progress_percentage = ei / total_exchanges * 100
#         frappe.publish_progress(percent=progress_percentage, title=_("Syncing Symbol..."), description=f"Processing {exchange_id}")

#     frappe.publish_progress(percent=100, title=_("Syncing Symbol..."), description=_("Completed!"))
#     frappe.db.commit()
#     return 'Successful'


# def get_supported_market_types(exchange):
#     supported_market_types = []

#     if hasattr(exchange, 'has') and exchange.has:
#         for market_type in ['spot', 'future']:
#             if exchange.has.get(market_type):
#                 supported_market_types.append(market_type)

#     return supported_market_types

# @frappe.whitelist()
# def activate_symbols():
#     docs = frappe.get_all("Symbol")
#     amount = len(docs)
#     for i, ref in enumerate(docs):
#         frappe.db.set_value("Symbol", ref.name, "enabled", 1)
#         frappe.publish_progress(
#             i / amount * 100, title=_("Activating"), description=_("Processing"))
#     frappe.publish_progress(100, title=_("Activating"),
#                             description=_("Finished"))
#     return 'Successful'


# @frappe.whitelist()
# def delete_symbols():
#     """
#     Delete all exchanges from the database.
#     """

#     if frappe.db.count("Symbol") == 0:
#         frappe.msgprint(f"No Symbol found in database.")
#         return False

#     docs = frappe.get_all("Symbol")
#     amount = len(docs)
#     for i, doc in enumerate(docs):
#         frappe.delete_doc("Symbol", doc.name, ignore_missing=True, force=True)
#         frappe.publish_progress(percent=(i / amount) *
#                                 100, title=_('Processing...'))

#     frappe.publish_progress(percent=100, title=_('Processing...'))

#     return f"{amount} symbols deleted successfully."


# @frappe.whitelist()
# def fetch_ohlcv(exchange_id, market, symbol, timeframe):
#     exchange = getattr(ccxt, exchange_id)({"enableRateLimit": True,
#                                            "options": {
#                                                "defaultType": market}
#                                             })
#     return exchange.fetch_ohlcv(symbol, timeframe)


def attach_url_to_document(doc, file_url, save=False):
    try:
        doc.append("attachments", {
            "file_url": file_url
        })
        if save:
            doc.save(ignore_permissions=True)
        print("File attached successfully.")
    except frappe.DoesNotExistError:
        print("Document does not exist.")
    except Exception as e:
        print(f"An error occurred: {str(e)}")