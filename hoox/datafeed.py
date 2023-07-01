import ccxt
from influxdb import InfluxDBClient


class DataFeed:
    def __init__(self, exchanges, symbols, influxdb_host, influxdb_port, influxdb_database):
        self.exchanges = exchanges
        self.symbols = symbols

        self.client = InfluxDBClient(host=influxdb_host, port=influxdb_port)
        self.client.switch_database(influxdb_database)

    def fetch_and_store_data(self):
        for exchange_name in self.exchanges:
            exchange = getattr(ccxt, exchange_name)()
            # Set the desired rate limit in milliseconds (e.g., 2 seconds)
            exchange.rateLimit = 2000

            for symbol in self.symbols:
                try:
                    klines = self.fetch_klines_with_rate_limit(
                        exchange, symbol)
                    influx_data = self.format_data_for_influxdb(
                        klines, symbol, exchange_name)
                    self.store_data_in_influxdb(influx_data)
                except Exception as e:
                    print(
                        f"Error retrieving data for {symbol} on {exchange_name}: {e}")

    def fetch_klines_with_rate_limit(self, exchange, symbol):
        @exchange.rateLimit
        def fetch_klines():
            return exchange.fetch_ohlcv(symbol, timeframe='1d', limit=100)

        return fetch_klines()

    def format_data_for_influxdb(self, klines, symbol, exchange_name):
        data_points = []
        for kline in klines:
            timestamp = kline[0]
            open_price = kline[1]
            high_price = kline[2]
            low_price = kline[3]
            close_price = kline[4]
            volume = kline[5]

            data_points.append({
                "measurement": "kline",
                "tags": {
                    "symbol": symbol,
                    "exchange": exchange_name
                },
                "time": timestamp,
                "fields": {
                    "open": open_price,
                    "high": high_price,
                    "low": low_price,
                    "close": close_price,
                    "volume": volume
                }
            })

        return data_points

    def store_data_in_influxdb(self, influx_data):
        self.client.write_points(influx_data)


# Usage example (same as before)
exchanges = frappe.get_list("CCXT Exchanges", filters={enabled: 1})
symbols = frappe.get_list("Symbols", filters={enabled: 1})
influxdb_host = 'localhost'
influxdb_port = 8086
influxdb_database = 'crypto_data'

data_feed = DataFeed(
    exchanges, symbols, influxdb_host, influxdb_port, influxdb_database)
data_feed.fetch_and_store_data()
