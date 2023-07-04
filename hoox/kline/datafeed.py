import ccxt
import frappe
import asyncio
import aiohttp

class DataFeed:
    def __init__(self, exchanges, symbols):
        self.exchanges = exchanges
        self.symbols = symbols

    async def fetch_and_store_data(self):
        async with aiohttp.ClientSession() as session:
            tasks = []
            for exchange_name in self.exchanges:
                exchange = getattr(ccxt, exchange_name)()
                # Set the desired rate limit in milliseconds (e.g., 2 seconds)
                exchange.rateLimit = 2000
                for symbol in self.symbols:
                    task = asyncio.create_task(
                        self.fetch_and_store_exchange_data(session, exchange, symbol, exchange_name))
                    tasks.append(task)

            await asyncio.gather(*tasks)

    async def fetch_and_store_exchange_data(self, session, exchange, symbol, exchange_name):
        try:
            klines = await self.fetch_klines_with_rate_limit(
                session, exchange, symbol)
            frappe_data = self.format_data_for_frappe(
                klines, symbol, exchange_name)
            await self.store_data_in_frappe_database(frappe_data)
        except Exception as e:
            print(
                f"Error retrieving data for {symbol} on {exchange_name}: {e}")

    async def fetch_klines_with_rate_limit(self, session, exchange, symbol):
        @exchange.rateLimit
        async def fetch_klines():
            return await session.get(f"{exchange.urls['api']}v1/klines", params={
                "symbol": symbol,
                "interval": '1d',
                "limit": 100
            })

        response = await fetch_klines()
        klines = await response.json()
        return klines

    def format_data_for_frappe(self, klines, symbol, exchange_name):
        data_points = []
        for kline in klines:
            timestamp = kline[0]
            open_price = kline[1]
            high_price = kline[2]
            low_price = kline[3]
            close_price = kline[4]
            volume = kline[5]

            data_points.append({
                "symbol": symbol,
                "exchange": exchange_name,
                "time": timestamp,
                "open": open_price,
                "high": high_price,
                "low": low_price,
                "close": close_price,
                "volume": volume
            })

        return data_points

    async def store_data_in_frappe_database(self, frappe_data):
        for data_point in frappe_data:
            doc = frappe.get_doc({
                "doctype": "Kline Data",
                "symbol": data_point["symbol"],
                "exchange": data_point["exchange"],
                "time": data_point["time"],
                "open": data_point["open"],
                "high": data_point["high"],
                "low": data_point["low"],
                "close": data_point["close"],
                "volume": data_point["volume"]
            })
            doc.insert()

# Usage example (same as before)
exchanges = frappe.get_list("CCXT Exchanges", filters={"enabled": 1})
symbols = frappe.get_list("Symbols", filters={"enabled": 1})

data_feed = DataFeed(exchanges, symbols)

asyncio.run(data_feed.fetch_and_store_data())
