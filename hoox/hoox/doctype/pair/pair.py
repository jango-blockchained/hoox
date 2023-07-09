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

# class Pair(Document):
    
#     @frappe.whitelist()
#     def fetch_ohlcv_data(self, pair, timeframe, exchange_name, from_date_time, page_size):
#         # Your existing code, with hard-coded values replaced by function arguments

#         # Instantiate the exchange by id
#         exchange = getattr(ccxt, exchange_name)()

#         # Convert since from string to milliseconds integer if needed
#         if isinstance(from_date_time, str):
#             from_date_time = exchange.parse8601(from_date_time)

#         # Preload all markets from the exchange
#         exchange.load_markets()

#         # Fetch all candles
#         ohlcv = self.scrape_ohlcv(exchange, 3, pair, timeframe, from_date_time, page_size)

#         # Save to csv file
#         filename = exchange_name + '_' + pair.split('/')[0] + '_' + pair.split('/')[1] + '_' + timeframe + '.csv'
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

class Pair(Document):


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
    def fetch_ohlcv_data(self, timeframe="15m", from_date_time="2023-01-01", page_size=100):
        
        # Instantiate the exchange by id
        self.exchange_instance = getattr(ccxt, self.exchange)()

        # Convert since from string to milliseconds integer if needed
        if isinstance(from_date_time, str):
            from_date_time = self.exchange_instance.parse8601(from_date_time)

        # Preload all markets from the exchange
        self.exchange_instance.load_markets()

        # Fetch all candles
        ohlcv = self.scrape_ohlcv(timeframe, from_date_time, page_size)

        # Save to InfluxDB
        data = [{
            "measurement": self.pair,
            "tags": {
                "exchange": self.exchange,
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

        print('Saved', len(ohlcv), 'candles from', self.exchange_instance.iso8601(ohlcv[0][0]), 'to', self.exchange_instance.iso8601(ohlcv[-1][0]), 'to InfluxDB')


    def retry_fetch_ohlcv(self, max_retries, timeframe, since, limit):
        num_retries = 0
        try:
            num_retries += 1
            ohlcv = self.exchange_instance.fetch_ohlcv(timeframe, since, limit)
            time.sleep(0.05)
            return ohlcv
        except Exception:
            if num_retries > max_retries:
                raise

    def scrape_ohlcv(self, timeframe, since, limit, max_retries=3):
        timeframe_duration_in_seconds=self.exchange_instance.parse_timeframe(timeframe)
        timeframe_duration_in_ms=timeframe_duration_in_seconds * 1000
        timedelta=limit * timeframe_duration_in_ms
        now=self.exchange_instance.milliseconds()
        all_ohlcv=[]
        fetch_since=since
        while fetch_since < now:
            try:
                ohlcv=self.retry_fetch_ohlcv(
                    max_retries, timeframe, fetch_since, limit)
                fetch_since=(
                    ohlcv[-1][0] + 1) if len(ohlcv) else (fetch_since + timedelta)
                all_ohlcv=all_ohlcv + ohlcv
                if len(all_ohlcv):
                    print(len(all_ohlcv), 'candles in total from', self.exchange_instance.iso8601(all_ohlcv[0][0]), 'to',
                        self.exchange_instance.iso8601(all_ohlcv[-1][0]))
                else:
                    print(len(all_ohlcv), 'candles in total from',
                        self.exchange_instance.iso8601(fetch_since))
            except Exception as e:
                print(e)
        return self.exchange_instance.filter_by_since_limit(all_ohlcv, since, None, key=0)


    def export_to_csv(self, filename, timeframe):
        # Query data from InfluxDB
        query = f'SELECT * FROM "{self.pair}" WHERE "exchange" = "{self.exchange}" AND "timeframe" = "{timeframe}"'
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

@frappe.whitelist()
def sync_exchange_pairs(exchange_id, total_exchanges, current_exchange):
    exchange_class = getattr(ccxt, exchange_id)
    exchange_instance = exchange_class()

    skipped = 0
    exists = 0
    new = 0
    processed_pairs = 0

    markets = exchange_instance.load_markets()
    total_pairs = len(markets)

    market_types = _get_supported_market_types()

    for pair, market_data in markets.items():  # Iterate over items to access both pair and market_data
        if market_data['type'] not in market_types:
            skipped += 1
            continue

        pair_exists = frappe.db.exists(
            "Pair", f"SYM-{exchange_id}-{market_data['type']}-{market_data['id']}")

        if pair_exists:
            exists += 1
            continue

        try:
            new_pair = frappe.get_doc({
                "doctype": "Pair",
                "pair": pair,
                "exchange": exchange_id,
                "market_type": market_data['type'],
                "pair_id": market_data['id'],
                "base_id": market_data['baseId'],
                "quote_id": market_data['quoteId'],
                "enabled": 0,
                "params": json.dumps(market_data, indent=4)
            })

            new_pair.insert(ignore_permissions=True)
            new += 1
        except Exception as e:
            frappe.msgprint(f"An error occurred: {str(e)}")

        processed_pairs += 1
        progress_percentage = (processed_pairs / total_pairs) / total_exchanges * current_exchange * 100
        frappe.publish_progress(percent=progress_percentage, title=_("Syncing Pair..."),
                                description=f"Processing {exchange_id}")
    return f"<h4>{exchange_id}</h4><p>Total <b>{total_pairs}</b> | New <b>{new}</b> | Skipped <b>{skipped}</b> | Exists <b>{exists}</b></p>"
    # return {"total": total_pairs, "new": new, "skipped": skipped, "exists": exists}


@frappe.whitelist()
def sync_pairs():
    enabled_exchanges = frappe.get_all("Exchange", filters={
                                    "enabled": 1}, fields=["name"])
    total_exchanges = len(enabled_exchanges)

    for ei, exchange_data in enumerate(enabled_exchanges):
        exchange_id = exchange_data["name"]
        result = sync_exchange_pairs(exchange_id, total_exchanges, ei+1)
        frappe.msgprint(json.dumps(result))
    frappe.publish_progress(percent=100, title=_("Syncing Pair..."), description=_("Completed!"))
    frappe.db.commit()
    return True

@frappe.whitelist()
def _get_supported_market_types():
    return frappe.db.get_list("Market Type", pluck="name")

@frappe.whitelist()
def activate_pairs():
    docs = frappe.get_all("Pair")
    amount = len(docs)
    for i, ref in enumerate(docs):
        frappe.db.set_value("Pair", ref.name, "enabled", 1)
        frappe.publish_progress(
            i / amount * 100, title=_("Activating"), description=_("Processing"))
    frappe.publish_progress(100, title=_("Activating"),
                            description=_("Finished"))
    return 'Successful'


@frappe.whitelist()
def delete_pairs():
    """
    Delete all exchanges from the database.
    """

    if frappe.db.count("Pair") == 0:
        frappe.msgprint(f"No Pair found in database.")
        return False

    docs = frappe.get_all("Pair")
    amount = len(docs)
    for i, doc in enumerate(docs):
        frappe.delete_doc("Pair", doc.name, ignore_missing=True, force=True)
        frappe.publish_progress(percent=(i / amount) *
                                100, title=_('Processing...'))

    frappe.publish_progress(percent=100, title=_('Processing...'))

    return f"{amount} pairs deleted successfully."


@frappe.whitelist()
def fetch_ohlcv(exchange_id, market, pair, timeframe, limit=100):
    cache_key = f"{exchange_id}_{market}_{pair}_{timeframe}_{limit}"

    # Try to get data from cache
    cached_data = frappe.cache().get(cache_key)
    if cached_data is not None:
        return cached_data

    # If data is not in cache, fetch it and store it in cache
    exchange = getattr(ccxt, exchange_id)({"enableRateLimit": True,
                                        "options": {
                                            "defaultType": market}
                                            })
    ohlcv_data = exchange.fetch_ohlcv(pair, timeframe, limit=limit)

    # Store data in cache for 5 minutes
    frappe.cache().set_value(cache_key, ohlcv_data, expires_in_sec=300)

    return ohlcv_data

# SYMBOLS
# -------
# @frappe.whitelist()
# def get_png_logo(pair):
#     base_url = "https://api.coingecko.com/api/v3"
#     endpoint = f"/coins/{pair.lower()}"
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
#         frappe.msgprint(f"Error fetching logo for {pair}: {e}")
#         return None