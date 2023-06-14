import ccxt
import frappe
import json
from frappe.utils.logger import get_logger
import logging
from frappe import _
from frappe.desk.form.linked_with import get_linked_docs, get_linked_doctypes
from io import BytesIO


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

logger = get_logger(__name__)
logger_level = logging.getLevelName("DEBUG")
logger.setLevel(logger_level)


def get_linked_documents(doctype, docname):
    """
    Get linked documents for a given doctype and docname.
    """

    link_info = get_linked_doctypes(doctype)
    docs = get_linked_docs(doctype, docname, link_info)
    # print(docs)
    return docs


def execute_order(action, exchange_id, symbol, price, quantity, order_type, market_type, leverage, user_creds):
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
            }
        })

        # Create order object
        response = {}

        # Set leverage
        if market_type == "future" and "set_leverage" in exchange.has and leverage is not None and 0 < leverage <= exchange.maxLeverage:
            exchange.set_leverage(leverage)

        # Set testnet
        if user_creds.testnet:
            if "test" in exchange.urls:
                exchange.urls["api"] = exchange.urls["test"]
                logger.info(f"Exchange URL: {exchange.urls['api']}")
            else:
                raise ValueError(
                    f"Exchange {exchange_id} does not have a testnet.")

        # Set URL
        response["url"] = exchange.urls["api"]

        # Check action
        if action not in ["buy", "sell", "close", None]:
            logger.info(f"Invalid action: {action}")

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
            response["order"] = [exchange.cancel_order(
                order["id"]) for order in all_orders]

        response["original_data"] = exchange.last_json_response
        logger.info(response["original_data"])
        return response

    except AttributeError as e:
        logger.error(f"Exchange {exchange_id} not found in CCXT.")

    except (ccxt.BaseError, Exception) as e:
        logger.error(f"An error occurred: {str(e)}")


@frappe.whitelist()
def sync_exchanges():
    """
    Sync exchanges from ccxt module to the database.
    """

    # Get list of exchanges
    for i, exchange_id in enumerate(ccxt.exchanges):
        if hasattr(ccxt, exchange_id):
            exchange_class = getattr(ccxt, exchange_id)
            exchange = exchange_class()  # create an instance of the exchange class

            # Check if the exchange document already exists
            exchange_exists = frappe.db.exists(
                "CCXT Exchanges", {"exchange_id": exchange.id}
            )

            # Set logo_url field in the doc
            logo_url = exchange.urls.get("logo")
            if logo_url:
                logo_response = requests.get(logo_url)
                if logo_response.status_code == 200:
                    logo_image = BytesIO(logo_response.content)
                    logo_filename = f"{exchange.id}_logo.png"
                    logo_attachment = frappe.attach_file(
                        logo_filename, logo_image, "CCXT Exchanges", exchange.id
                    )
                    frappe.msgprint(
                        f"Downloaded and attached logo for exchange {exchange.name}: {logo_attachment.file_url}"
                    )

            exchange_doc_data = {
                "doctype": "CCXT Exchanges",
                "exchange_id": exchange.id,
                "exchange_name": exchange.name,
                "precision_mode": exchange.precisionMode,
                "rate_limit": exchange.rateLimit,
                "testnet": 1 if exchange.urls.get("test") is not None else 0,
                "has": json.dumps(exchange.has),
                "logo_url": logo_url,
            }

            if exchange_exists:
                # If the document exists, update its properties
                doc = frappe.get_doc("CCXT Exchanges", {
                                     "exchange_id": exchange.id})
                doc.update(exchange_doc_data)
                doc.save()
            else:
                # If the document doesn't exist, create a new one
                new_doc = frappe.get_doc(exchange_doc_data)
                new_doc.insert(ignore_permissions=True)

            current_position = i + 1
            amount_exchanges = len(ccxt.exchanges)
            logger.info(
                f"Synced exchange {exchange.name} - {current_position} of {amount_exchanges}"
            )

        else:
            frappe.msgprint(
                f"Exchange '{exchange_id}' is not found in ccxt module."
            )

    frappe.db.commit()
    amount = len(ccxt.exchanges)
    frappe.msgprint(f"{amount} exchanges synced successfully.")

    return


@frappe.whitelist()
def delete_exchanges():
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
            frappe.msgprint(
                f"Exchange '{doc.exchange_name}' has {links} linked documents. Skipping deletion."
            )
            continue
        frappe.delete_doc("CCXT Exchanges", doc.name)

    frappe.db.commit()
    frappe.msgprint(f"{amount} exchanges deleted successfully.")

    return


@frappe.whitelist()
def add_ip_addresses():
    # replace with your IP addresses
    ip_addresses = ["52.89.214.238", "34.212.75.30",
                    "54.218.53.128", "52.32.178.7"]
    for i, ip_address in enumerate(ip_addresses, start=1):
        friendly_name = 'TradingView™ IP Whitelist {}'.format(i)
        # Check if the doc exists
        if not frappe.db.exists('Alert IP Restriction', {"ip": ip_address}):
            doc = frappe.new_doc('Alert IP Restriction')
            doc.friendly_name = friendly_name
            doc.ip = ip_address
            doc.insert()
        frappe.db.commit()
    frappe.msgprint(
        "{} IP addresses added successfully.".format(len(ip_addresses)))
    return
