import frappe
import ccxt
import logging
from frappe import _
from frappe.utils.logger import get_logger
from frappe.desk.form.linked_with import get_linked_docs, get_linked_doctypes
from frappe.utils import add_to_date, now_datetime
from frappe.desk.form.load import get_attachments

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

def get_user_exchange_connection(credentials:object, market_type:str, verbose:bool=False, rate_limit:bool=True, price_required:bool=False):
    """
    Connect via REST to the selected exchange.
    """
    
    return getattr(ccxt, credentials.exchange)({
        "apiKey": credentials.api_key,
        "secret": credentials.api_secret,
        "enableRateLimit": rate_limit,
        "verbose": verbose,
        "options": {
            "defaultType": market_type,
            "test": credentials.testnet,
            "createMarketBuyOrderRequiresPrice": price_required,
            "createMarketSellOrderRequiresPrice": price_required
        }
    })


def execute_order(action:str, exchange_id:str, pair:str, price:float, quantity:float, percent:float, order_type:str, market_type:str, leverage:int, credentials:object):
    """
    Execute an order on an exchange using CCXT.
    Returns the order object.
    """

    def handle_error(msg):
        frappe.msgprint(msg)
        logger.error(msg)
        return msg

    try:
        # Get exchange
        exchange = get_user_exchange_connection(credentials, market_type)

        # exchange.verbose = True

        if credentials.testnet:
            exchange.set_sandbox_mode(True)

        response = {}

        # Set leverage
        if market_type == "future" and "setLeverage" in exchange.has and leverage is not None and 1 < leverage: # <= exchange.maxLeverage:
            exchange.set_leverage(leverage, pair)

        # Check action
        if action not in ["buy", "sell", "close", None]:
            raise ValueError(f"Invalid action: {action}")

        # Execute order
        if action in ["buy", "sell"]:
            order_func_name = ORDER_TYPE_FUNCS[action].get(order_type)
            if order_func_name:
                order_func = getattr(exchange, order_func_name)

                if order_type == "limit":
                    response["order"] = order_func(pair, quantity, price)
                else:
                    response["order"] = order_func(pair, quantity)

        elif action == "close":
            all_orders = exchange.fetch_open_orders(pair)
            response["order"] = [exchange.cancel_order(order["id"]) for order in all_orders]

        return response

    except ccxt.RequestTimeout as e:
        msg = f"Request timed out: {str(e)}"
        handle_error(msg)

    except ccxt.AuthenticationError as e:
        msg = f"Authentication error: {str(e)}"
        handle_error(msg)

    except ccxt.ExchangeNotAvailable as e:
        msg = f"Exchange not available: {str(e)}"
        handle_error(msg)

    except ccxt.ExchangeError as e:
        msg = f"Exchange error: {str(e)}"
        handle_error(msg)

    except ccxt.BaseError as e:
        msg = f"Base error in CCXT: {str(e)}"
        handle_error(msg)
    except ValueError as e:
        msg = f"Value error: {str(e)}"
        handle_error(msg)

    except AttributeError as e:
        msg = f"Attribute error: {str(e)}"
        handle_error(msg)

    except Exception as e:
        msg = f"An unexpected error occurred: {str(e)}"
        handle_error(msg)

@frappe.whitelist()
def get_attachment_url(doctype, docname):
    attachments = get_attachments(doctype, docname)
    if attachments:
        # return the URL of the first attachment
        return attachments[0].file_url
    else:
        return None
    

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


def _check_and_update_status(doctype):
    # get all documents that are 'Processing' and older than 1 minute
    try:
        docs = frappe.get_all(doctype, filters = {
            'status': 'Processing',
            'creation': ['<', add_to_date(now_datetime(), minutes=-1)]
        }, fields = ['name'])

        print(len(docs))

        # update the status of these documents to 'Failure'
        for doc in docs:
            frappe.db.set_value(doctype, doc.name, 'status', 'Failed')
        return True
    except:
        return False