import ccxt

def execute_order(action, exchange_id, symbol, price, amount, order_type, user_creds):
    exchange_class = getattr(ccxt, exchange_id)
    exchange = exchange_class({
        'apiKey': user_creds.api_key,
        'secret': user_creds.api_secret,
    })

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
        # To close an order, we must first fetch all open orders, then close them
        all_orders = exchange.fetch_open_orders(symbol)
        for order in all_orders:
            exchange.cancel_order(order['id'])

    return order
