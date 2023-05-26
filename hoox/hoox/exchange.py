import ccxt
import frappe

def create_api_log(api_url, api_method, request_data, status, error_message=None, response_data=None):
    doc = frappe.get_doc({
        "doctype": "API Log",
        "request_time": frappe.utils.now(),
        "api_url": api_url,
        "api_method": api_method,
        "request_data": request_data,
        "status": status,
        "error_message": error_message,
        "response_data": response_data,
    })
    doc.insert(ignore_permissions=True)

def execute_order(action, exchange_id, symbol, price, amount, order_type, user_creds):
    try:
        exchange_class = getattr(ccxt, exchange_id)
        exchange = exchange_class({
            'apiKey': user_creds.api_key,
            'secret': user_creds.api_secret,
        })

        if user_creds.testnet:
            # If the exchange has a testnet
            if 'test' in exchange.urls:
                exchange.urls['api'] = exchange.urls['test']
            else:
                raise ValueError(f"Exchange {exchange_id} does not have a testnet.")

        if action not in ['buy', 'sell', 'close']:
            raise ValueError(f"Invalid action: {action}")

        order = None
        if action == 'buy':
            if order_type == 'limit':
                order = exchange.create_limit_buy_order(symbol, amount, price)
            elif order_type == 'market':
                order = exchange.create_market_buy_order(symbol, amount)
        elif action == 'sell':
            if order_type == 'limit':
                order = exchange.create_limit_sell_order(symbol, amount, price)
            elif order_type == 'market':
                order = exchange.create_market_sell_order(symbol, amount)
        elif action == 'close':
            all_orders = exchange.fetch_open_orders(symbol)
            for order in all_orders:
                exchange.cancel_order(order['id'])

        request_data = {
            "action": action,
            "exchange_id": exchange_id,
            "symbol": symbol,
            "price": price,
            "amount": amount,
            "order_type": order_type,
        }

        create_api_log(exchange.urls['api'], action, request_data, "Success", response_data=order)

        return order
    except AttributeError:
        return f"Exchange {exchange_id} not found in ccxt."
    except ccxt.NetworkError as e:
        request_data = {
            "action": action,
            "exchange_id": exchange_id,
            "symbol": symbol,
            "price": price,
            "amount": amount,
            "order_type": order_type,
        }

        create_api_log(exchange.urls['api'], action, request_data, "Failure", error_message=str(e))
        return f"A networking error occurred: {str(e)}"
    except ccxt.ExchangeError as e:
        return f"An exchange error occurred: {str(e)}"
    except Exception as e:
        return f"An error occurred: {str(e)}"
