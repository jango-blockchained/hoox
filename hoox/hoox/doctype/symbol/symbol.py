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
#     def fetch_ohlcv_data(self, symbol, timeframe, exchange_name, from_date_time, page_size):
#         # Your existing code, with hard-coded values replaced by function arguments

#         # Instantiate the exchange by id
#         exchange = getattr(ccxt, exchange_name)()

#         # Convert since from string to milliseconds integer if needed
#         if isinstance(from_date_time, str):
#             from_date_time = exchange.parse8601(from_date_time)

#         # Preload all markets from the exchange
#         exchange.load_markets()

#         # Fetch all candles
#         ohlcv = self.scrape_ohlcv(exchange, 3, symbol, timeframe, from_date_time, page_size)

#         # Save to csv file
#         filename = exchange_name + '_' + symbol.split('/')[0] + '_' + symbol.split('/')[1] + '_' + timeframe + '.csv'
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


    # CONFIG
    # ------
    CFG = frappe.get_site_config()

    # CONST
    # -----
    INFLUXDB_HOST = CFG.get("influxdb_host") or "localhost"
    INFLUXDB_PORT = CFG.get("influxdb_port") or 8086
    INFLUXDB_USER = CFG.get("influxdb_user") or "root"
    INFLUXDB_PASSWORD = CFG.get("influxdb_password") or "root"
    INFLUXDB_DBNAME = CFG.get("influxdb_dbname") or "ohlcv"

    # CLIENT
    # ------
    client = InfluxDBClient(host=INFLUXDB_HOST, port=INFLUXDB_PORT, username=INFLUXDB_USER, password=INFLUXDB_PASSWORD, database=INFLUXDB_DBNAME)

    # Fetch OHLCV Data
    # ----------------
    @frappe.whitelist()
    def fetch_ohlcv_data(self, symbol, timeframe, exchange_name, from_date_time, page_size):
        
        # Instantiate the exchange by id
        exchange = getattr(ccxt, exchange_name)()

        # Convert since from string to milliseconds integer if needed
        if isinstance(from_date_time, str):
            from_date_time = exchange.parse8601(from_date_time)

        # Preload all markets from the exchange
        exchange.load_markets()

        # Fetch all candles
        ohlcv = self.scrape_ohlcv(exchange, symbol, timeframe, from_date_time, page_size)

        # Save to InfluxDB
        data = [{
            "measurement": symbol,
            "tags": {
                "exchange": exchange_name,
                "timeframe": timeframe
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

    def scrape_ohlcv(self, exchange, symbol, timeframe, since, limit, max_retries=3):
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


    def export_to_csv(self, filename, symbol, exchange_name, timeframe):
        # Query data from InfluxDB
        query = f'SELECT * FROM "{symbol}" WHERE "exchange" = "{exchange_name}" AND "timeframe" = "{timeframe}"'
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
# @frappe.whitelist()
# def get_png_logo(symbol):
#     base_url = "https://api.coingecko.com/api/v3"
#     endpoint = f"/coins/{symbol.lower()}"
#     params = {
#         "localization": False,
#     }

#     try:
#         response = requests.get(url=f"{base_url}{endpoint}", params=params)
#         response.raise_for_status()
#         data = response.json()
#         logo_url = data.get("image", {}).get("large")

#         if logo_url:
#             logo_response = requests.get(url=logo_url)
#             logo_response.raise_for_status()
#             return logo_response.content
#         else:
#             # If logo_url is None or empty, return the alternative image
#             # alternative_logo_url = "/files/hoox.svg"
#             # alternative_logo_response = requests.get(url=alternative_logo_url)
#             # alternative_logo_response.raise_for_status()
#             return None

#     except requests.exceptions.RequestException as e:
#         frappe.msgprint(f"Error fetching logo for {symbol}: {e}")
#         return None


@frappe.whitelist()
def sync_exchange_symbols(exchange_id, total_exchanges, current_exchange):
    exchange_class = getattr(ccxt, exchange_id)
    exchange_instance = exchange_class()

    skipped = 0
    exists = 0
    new = 0
    processed_symbols = 0

    markets = exchange_instance.load_markets()
    total_symbols = len(markets)

    market_types = _get_supported_market_types()

    for symbol, market_data in markets.items():  # Iterate over items to access both symbol and market_data
        if market_data['type'] not in market_types:
            skipped += 1
            continue

        symbol_exists = frappe.db.exists(
            "Symbol", f"SYM-{exchange_id}-{market_data['type']}-{market_data['id']}")

        if symbol_exists:
            exists += 1
            continue

        try:
            new_symbol = frappe.get_doc({
                "doctype": "Symbol",
                "symbol": symbol,
                "exchange": exchange_id,
                "market_type": market_data['type'],
                "symbol_id": market_data['id'],
                "base_id": market_data['baseId'],
                "quote_id": market_data['quoteId'],
                "enabled": 0,
                "params": json.dumps(market_data, indent=4)
            })

            new_symbol.insert(ignore_permissions=True)
            new += 1
        except Exception as e:
            frappe.msgprint(f"An error occurred: {str(e)}")

        processed_symbols += 1
        progress_percentage = (processed_symbols / total_symbols) / total_exchanges * current_exchange * 100
        frappe.publish_progress(percent=progress_percentage, title=_("Syncing Symbol..."),
                                description=f"Processing {exchange_id}")

    return {"total": total_symbols, "new": new, "skipped": skipped, "exists": exists}



@frappe.whitelist()
def sync_symbols():
    enabled_exchanges = frappe.get_all("Exchange", filters={
                                    "enabled": 1}, fields=["name"])
    total_exchanges = len(enabled_exchanges)

    for ei, exchange_data in enumerate(enabled_exchanges):
        exchange_id = exchange_data["name"]
        result = sync_exchange_symbols(exchange_id, total_exchanges, ei+1)
        frappe.msgprint(json.dumps(result))
    frappe.publish_progress(percent=100, title=_("Syncing Symbol..."), description=_("Completed!"))
    frappe.db.commit()
    return True

@frappe.whitelist()
def _get_supported_market_types():
    return frappe.db.get_list("Market Type", pluck="name")

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
    cache_key = f"{exchange_id}_{market}_{symbol}_{timeframe}"

    # Try to get data from cache
    cached_data = frappe.cache().get(cache_key)
    if cached_data is not None:
        return cached_data

    # If data is not in cache, fetch it and store it in cache
    exchange = getattr(ccxt, exchange_id)({"enableRateLimit": True,
                                        "options": {
                                            "defaultType": market}
                                            })
    ohlcv_data = exchange.fetch_ohlcv(symbol, timeframe)

    # Store data in cache for 5 minutes
    frappe.cache().set_value(cache_key, ohlcv_data, expires_in_sec=300)


    return ohlcv_data


