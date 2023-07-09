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
ccxt_logger = logging.getLogger('ccxt')
ccxt_logger.setLevel(logging.DEBUG)

ccxt_fh = logging.FileHandler('ccxt.log')
ccxt_fh.setLevel(logging.DEBUG)

ccxt_logger.addHandler(ccxt_fh)

def get_linked_documents(doctype, docname):
    """
    Get linked documents for a given doctype and docname.
    """

    link_info = get_linked_doctypes(doctype)
    docs = get_linked_docs(doctype, docname, link_info)
    print(docs)
    return docs


def execute_order(action, exchange_id, pair, price, quantity, percent, order_type, market_type, leverage, user_creds):
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
            "logger": ccxt_logger,
            "options": {
                "defaultType": market_type,
                "test": user_creds.testnet,
                "createMarketBuyOrderRequiresPrice": False,
                "createMarketSellOrderRequiresPrice": False
            }
        })

        exchange.verbose = True

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
                    response["order"] = order_func(pair, quantity, price)
                else:
                    response["order"] = order_func(pair, quantity)

        elif action == "close":
            all_orders = exchange.fetch_open_orders(pair)
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
            # doc_obj = frappe.get_doc(doctype, doc.name)
            # doc_obj.set()
            # doc_obj.save()
        return True
    except:
        return False