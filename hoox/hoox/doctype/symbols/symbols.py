# # -*- coding: utf-8 -*-
# # Copyright (c) 2023 - Your Company

# from __future__ import unicode_literals
# import frappe
# from frappe.model.document import Document
# import os
# import time
# from datetime import timedelta
# import pandas as pd
# import ccxt

# class Symbol(Document):
    
#     @frappe.whitelist()
#     def fetch_ohlcv_data(self, symbol, interval, exchange_name, from_date_time, page_size):
#         # Your existing code, with hard-coded values replaced by function arguments

#         # Instantiate the exchange by id
#         exchange = getattr(ccxt, exchange_name)()

#         # Convert since from string to milliseconds integer if needed
#         if isinstance(from_date_time, str):
#             from_date_time = exchange.parse8601(from_date_time)

#         # Preload all markets from the exchange
#         exchange.load_markets()

#         # Fetch all candles
#         ohlcv = self.scrape_ohlcv(exchange, 3, symbol, interval, from_date_time, page_size)

#         # Save to csv file
#         filename = exchange_name + '_' + symbol.split('/')[0] + '_' + symbol.split('/')[1] + '_' + interval + '.csv'
#         self.write_to_csv(filename, ohlcv)

#         print('Saved', len(ohlcv), 'candles from', exchange.iso8601(ohlcv[0][0]), 'to', exchange.iso8601(ohlcv[-1][0]), 'to', filename)

# import os
# from datetime import timedelta
from __future__ import unicode_literals
import frappe
from frappe.model.document import Document
import time
import json
import requests
from frappe import _
import ccxt
import pandas as pd
from influxdb import InfluxDBClient

class Symbol(Document):

    # CONST
    # -----
    INFLUXDB_HOST = "localhost"
    INFLUXDB_PORT = 8086
    INFLUXDB_USER = "root"
    INFLUXDB_PASSWORD = "root"
    INFLUXDB_DBNAME = "ohlcv"

    # CLIENT
    # ------
    client = InfluxDBClient(host=INFLUXDB_HOST, port=INFLUXDB_PORT, username=INFLUXDB_USER, password=INFLUXDB_PASSWORD, database=INFLUXDB_DBNAME)

    # Fetch OHLCV Data
    # ----------------
    @frappe.whitelist()
    def fetch_ohlcv_data(self, symbol, interval, exchange_name, from_date_time, page_size):
        
        # Instantiate the exchange by id
        exchange = getattr(ccxt, exchange_name)()

        # Convert since from string to milliseconds integer if needed
        if isinstance(from_date_time, str):
            from_date_time = exchange.parse8601(from_date_time)

        # Preload all markets from the exchange
        exchange.load_markets()

        # Fetch all candles
        ohlcv = self.scrape_ohlcv(exchange, 3, symbol, interval, from_date_time, page_size)

        # Save to InfluxDB
        data = [{
            "measurement": symbol,
            "tags": {
                "exchange": exchange_name,
                "interval": interval
            },
            "time": point[0],
            "fields": {
                "open": point[1],
                "high": point[2],
                "low": point[3],
                "close": point[4],
                "volume": point[5]
            }
        } for point in ohlcv]

        self.client.write_points(data)

        print('Saved', len(ohlcv), 'candles from', exchange.iso8601(ohlcv[0][0]), 'to', exchange.iso8601(ohlcv[-1][0]), 'to InfluxDB')


    def retry_fetch_ohlcv(self, exchange, max_retries, symbol, timeframe, since, limit):
        num_retries = 0
        try:
            num_retries += 1
            ohlcv = exchange.fetch_ohlcv(symbol, timeframe, since, limit)
            time.sleep(0.05)
            return ohlcv
        except Exception:
            if num_retries > max_retries:
                raise

    def scrape_ohlcv(self, exchange, max_retries, symbol, timeframe, since, limit):
        timeframe_duration_in_seconds=exchange.parse_timeframe(timeframe)
        timeframe_duration_in_ms=timeframe_duration_in_seconds * 1000
        timedelta=limit * timeframe_duration_in_ms
        now=exchange.milliseconds()
        all_ohlcv=[]
        fetch_since=since
        while fetch_since < now:
            try:
                ohlcv=self.retry_fetch_ohlcv(
                    exchange, max_retries, symbol, timeframe, fetch_since, limit)
                fetch_since=(
                    ohlcv[-1][0] + 1) if len(ohlcv) else (fetch_since + timedelta)
                all_ohlcv=all_ohlcv + ohlcv
                if len(all_ohlcv):
                    print(len(all_ohlcv), 'candles in total from', exchange.iso8601(all_ohlcv[0][0]), 'to',
                        exchange.iso8601(all_ohlcv[-1][0]))
                else:
                    print(len(all_ohlcv), 'candles in total from',
                        exchange.iso8601(fetch_since))
            except Exception as e:
                print(e)
        return exchange.filter_by_since_limit(all_ohlcv, since, None, key=0)


    def export_to_csv(self, filename, symbol, exchange_name, interval):
        # Query data from InfluxDB
        query = f'SELECT * FROM "{symbol}" WHERE "exchange" = \'{exchange_name}\' AND "interval" = \'{interval}\''
        result = self.client.query(query)
        points = list(result.get_points())

        # Convert to DataFrame
        df = pd.DataFrame(points)

        # Convert timestamp from string to datetime
        df['time'] = pd.to_datetime(df['time'])

        # Rename columns to match original CSV format
        df.rename(columns={
            'time': 'datetime',
            'open': 'open',
            'high': 'high',
            'low': 'low',
            'close': 'close',
            'volume': 'volume'
        }, inplace=True)

        # Write to CSV
        df.to_csv(filename, index=False)

    # SYMBOLS
    # -------
    @frappe.whitelist()
    def get_png_logo(self, symbol):
        base_url = "https://api.coingecko.com/api/v3"
        endpoint = f"/coins/{symbol.lower()}"
        params = {
            "localization": False,
        }

        try:
            response = requests.get(url=f"{base_url}{endpoint}", params=params)
            response.raise_for_status()
            data = response.json()
            logo_url = data.get("image", {}).get("large")

            if logo_url:
                logo_response = requests.get(url=logo_url)
                logo_response.raise_for_status()
                return logo_response.content

        except requests.exceptions.RequestException as e:
            frappe.msgprint(f"Error fetching SVG logo for {symbol}: {e}")
            return None

    @frappe.whitelist()
    def sync_exchange_symbols(self, exchange_id):
        exchange_class = getattr(ccxt, exchange_id)
        exchange_instance = exchange_class()
        supported_market_types = exchange_instance.load_markets().keys()

        for market_type in supported_market_types:
            exchange_instance.options['defaultType'] = market_type
            markets = exchange_instance.load_markets()

            for symbol, market_data in markets.items():
                symbol_exists = frappe.db.exists(
                    "Symbol", {"symbol": symbol, "exchange": exchange_id, "market": market_type})

                if symbol_exists:
                    continue

                try:
                    new_symbol = frappe.get_doc({
                        "doctype": "Symbol",
                        "symbol": symbol,
                        "exchange": exchange_id,
                        "market": market_type
                    })

                    new_symbol.symbol_id = market_data["id"]
                    new_symbol.base_id = market_data["baseId"]
                    new_symbol.quote_id = market_data["quoteId"]
                    new_symbol.exchange = exchange_id
                    new_symbol.market = market_type
                    new_symbol.enabled = 0

                    png_logo = self.get_png_logo(market_data["baseId"])
                    if png_logo:
                        logo_file_name = f"{market_data['baseId']}.png"
                        logo_file_path = frappe.get_site_path("public", "files", logo_file_name)
                        with open(logo_file_path, "wb") as logo_file:
                            logo_file.write(png_logo)
                        new_symbol.logo_attachment = logo_file_name

                    new_symbol.params = json.dumps(market_data, indent=4)
                    new_symbol.insert(ignore_permissions=True)

                except Exception as e:
                    frappe.msgprint(f"An error occurred: {str(e)}")


    @frappe.whitelist()
    def sync_symbols(self):
        enabled_exchanges = frappe.get_all("Exchange", filters={
                                        "enabled": 1}, fields=["name"])
        total_exchanges = len(enabled_exchanges)

        for ei, exchange_data in enumerate(enabled_exchanges):
            exchange_id = exchange_data["name"]
            self.sync_exchange_symbols(exchange_id)

            progress_percentage = ei / total_exchanges * 100
            frappe.publish_progress(percent=progress_percentage, title=_("Syncing Symbol..."), description=f"Processing {exchange_id}")

        frappe.publish_progress(percent=100, title=_("Syncing Symbol..."), description=_("Completed!"))
        frappe.db.commit()
        return 'Successful'


    def get_supported_market_types(exchange):
        supported_market_types = []

        if hasattr(exchange, 'has') and exchange.has:
            for market_type in ['spot', 'future']:
                if exchange.has.get(market_type):
                    supported_market_types.append(market_type)

        return supported_market_types

    @frappe.whitelist()
    def activate_symbols():
        docs = frappe.get_all("Symbol")
        amount = len(docs)
        for i, ref in enumerate(docs):
            frappe.db.set_value("Symbol", ref.name, "enabled", 1)
            frappe.publish_progress(
                i / amount * 100, title=_("Activating"), description=_("Processing"))
        frappe.publish_progress(100, title=_("Activating"),
                                description=_("Finished"))
        return 'Successful'


    @frappe.whitelist()
    def delete_symbols():
        """
        Delete all exchanges from the database.
        """

        if frappe.db.count("Symbol") == 0:
            frappe.msgprint(f"No Symbol found in database.")
            return False

        docs = frappe.get_all("Symbol")
        amount = len(docs)
        for i, doc in enumerate(docs):
            frappe.delete_doc("Symbol", doc.name, ignore_missing=True, force=True)
            frappe.publish_progress(percent=(i / amount) *
                                    100, title=_('Processing...'))

        frappe.publish_progress(percent=100, title=_('Processing...'))

        return f"{amount} symbols deleted successfully."


    @frappe.whitelist()
    def fetch_ohlcv(exchange_id, market, symbol, timeframe):
        exchange = getattr(ccxt, exchange_id)({"enableRateLimit": True,
                                            "options": {
                                                "defaultType": market}
                                                })
        return exchange.fetch_ohlcv(symbol, timeframe)
