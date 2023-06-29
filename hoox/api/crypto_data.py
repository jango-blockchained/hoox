import frappe
import ccxt


@frappe.whitelist()
def fetch_ohlcv(exchange_id, symbol, timeframe):
    exchange = getattr(ccxt, exchange_id)()
    data = exchange.fetch_ohlcv(symbol, timeframe)
    return data
