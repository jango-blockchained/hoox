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

# class Symbols(Document):
    
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

from __future__ import unicode_literals
import frappe
from frappe.model.document import Document
import os
import time
import ccxt
import pandas as pd
from influxdb import InfluxDBClient

class Symbols(Document):
    INFLUXDB_HOST = "localhost"
    INFLUXDB_PORT = 8086
    INFLUXDB_USER = "root"
    INFLUXDB_PASSWORD = "root"
    INFLUXDB_DBNAME = "ohlcv"

    client = InfluxDBClient(host=INFLUXDB_HOST, port=INFLUXDB_PORT, username=INFLUXDB_USER, password=INFLUXDB_PASSWORD, database=INFLUXDB_DBNAME)

    @frappe.whitelist()
    def fetch_ohlcv_data(self, symbol, interval, exchange_name, from_date_time, page_size):
        # Your existing code, with hard-coded values replaced by function arguments

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


    def write_to_csv(self, filename, data):
        df = pd.DataFrame(data, dtype=float)
        df.rename(columns={
            0: 'open_ts',
            1: 'open',
            2: 'high',
            3: 'low',
            4: 'close',
            5: 'volume'
        }, inplace=True)
        df['datetime'] = pd.to_datetime(df['open_ts'], unit='ms')
        df['datetime'] = df['datetime'] + timedelta(hours=8)
        df = df[[
            'datetime',
            'open',
            'high',
            'low',
            'close',
            'volume'
        ]]
        df.to_csv(filename, index=False)
