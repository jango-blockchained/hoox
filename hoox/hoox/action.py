import ccxt
import frappe
import json
from frappe import _

from frappe.desk.form.linked_with import get_linked_docs, get_linked_doctypes


def get_linked_documents(doctype, docname):
    linkinfo = get_linked_doctypes(doctype)
    docs = get_linked_docs(doctype, docname, linkinfo)
    # print(docs)
    return docs


def create_api_log(
    api_url, api_method, request_data, status, error_message=None, response_data=None
):
    try:
        doc = frappe.get_doc(
            {
                "doctype": "API Log",
                "request_time": frappe.utils.now(),
                "api_url": api_url,
                "api_method": api_method,
                "request_data": request_data,
                "status": status,
                "error_message": error_message,
                "response_data": response_data,
            }
        )
        doc.insert(ignore_permissions=True)
    except Exception as e:
        print(f"Error while creating API Log: {e}")


def execute_order(action, exchange_id, symbol, price, amount, order_type, user_creds):
    try:
        exchange_class = getattr(ccxt, exchange_id)
        exchange = exchange_class(
            {
                "apiKey": user_creds.api_key,
                "secret": user_creds.api_secret,
            }
        )

        if user_creds.testnet:
            # If the exchange has a testnet
            if "test" in exchange.urls:
                exchange.urls["api"] = exchange.urls["test"]
            else:
                raise ValueError(f"Exchange {exchange_id} does not have a testnet.")

        if action not in ["buy", "sell", "close"]:
            raise ValueError(f"Invalid action: {action}")

        order = None
        if action == "buy":
            if order_type == "limit":
                order = exchange.create_limit_buy_order(symbol, amount, price)
            elif order_type == "market":
                order = exchange.create_market_buy_order(symbol, amount)
        elif action == "sell":
            if order_type == "limit":
                order = exchange.create_limit_sell_order(symbol, amount, price)
            elif order_type == "market":
                order = exchange.create_market_sell_order(symbol, amount)
        elif action == "close":
            all_orders = exchange.fetch_open_orders(symbol)
            for order in all_orders:
                exchange.cancel_order(order["id"])

        request_data = {
            "action": action,
            "exchange_id": exchange_id,
            "symbol": symbol,
            "price": price,
            "amount": amount,
            "order_type": order_type,
        }

        # create_api_log(
        #     exchange.urls["api"], action, request_data, "Success", response_data=order
        # )

        return order
    except AttributeError:
        return f"Exchange {exchange_id} not found in CCXT."
    except ccxt.NetworkError as e:
        request_data = {
            "action": action,
            "exchange_id": exchange_id,
            "symbol": symbol,
            "price": price,
            "amount": amount,
            "order_type": order_type,
        }

        # create_api_log(
        #     exchange.urls["api"], action, request_data, "Failure", error_message=str(e)
        # )
        return f"A networking error occurred: {str(e)}"
    except ccxt.ExchangeError as e:
        return f"An exchange error occurred: {str(e)}"
    except Exception as e:
        return f"An error occurred: {str(e)}"


@frappe.whitelist()
def sync_exchanges():
    # Get list of exchanges
    for exchange_id in ccxt.exchanges:
        if hasattr(ccxt, exchange_id):
            exchange_class = getattr(ccxt, exchange_id)
            exchange = exchange_class()  # create an instance of the exchange class
            # Create a new exchange document in Frappe
            frappe.get_doc(
                {
                    "doctype": "CCXT Exchanges",
                    "exchange_id": exchange.id,
                    "exchange_name": exchange.name,
                    "precision_mode": exchange.precisionMode,
                    "rate_limit": exchange.rateLimit,
                    "testnet": 1 if exchange.urls.get("test") is not None else 0,
                    "has": json.dumps(exchange.has),
                }
            ).insert(ignore_permissions=True)
        else:
            print(f"Exchange '{exchange_id}' is not found in ccxt module.")
    print(f"Exchanges synced successfully.")


@frappe.whitelist()
def delete_exchanges():
    if frappe.db.count("CCXT Exchanges") == 0:
        frappe.msgprint(f"No exchanges found in database.")
        print(f"No exchanges found in database.")
        return
    docs = frappe.get_all("CCXT Exchanges")
    for doc in docs:
        linked_docs = get_linked_documents("CCXT Exchanges", doc.name)
        links = len(linked_docs)
        if links > 0:
            frappe.msgprint(
                f"Exchange '{doc.exchange_name}' has {links} linked documents. Skipping deletion."
            )
            print(
                f"Exchange '{doc.exchange_name}' has {links} linked documents. Skipping deletion."
            )
            continue
        frappe.delete_doc("CCXT Exchanges", doc.name)
    frappe.msgprint(f"Exchanges deleted successfully.")
    print(f"Exchanges deleted successfully.")


# def get_balance(exchange_id, user_creds):
#     pass

# def get_order_book(exchange_id, symbol):
#     pass

# def get_ticker(exchange_id, symbol):
#     pass

# def get_ohlcv(exchange_id, symbol):
#     pass

# def get_trades(exchange_id, symbol):
#     pass

# def get_open_orders(exchange_id, symbol):
#     pass

# def get_closed_orders(exchange_id, symbol):
#     pass

# def get_order(exchange_id, symbol, order_id):
#     pass

# def get_deposit_address(exchange_id, symbol):
#     pass

# def get_deposit_history(exchange_id, symbol):
#     pass

# def get_withdrawal_history(exchange_id, symbol):
#     pass

# def get_withdrawal_fee(exchange_id, symbol):
#     pass

# def get_withdrawal_limits(exchange_id, symbol):
#     pass

# def get_withdrawal_status(exchange_id, symbol):
#     pass

# def get_withdrawal_address(exchange_id, symbol):
#     pass

# def get_withdrawal_fees(exchange_id, symbol):
#     pass

# def get_withdrawal_limits(exchange_id, symbol):
#     pass
