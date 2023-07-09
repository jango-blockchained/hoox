# -*- encoding: utf-8 -*-
'''
@filename    : fetcher.py
@description : Fetch OHLCV data from exchanges.
@author      : jango_blockchained
@email       : info@cryptolinx.de
@Version     : 0.1.0
'''


import os
import time
from datetime import timedelta
import pandas as pd

# -----------------------------------------------------------------------------

root = os.path.dirname((os.path.abspath(__file__)))

import ccxt


# -----------------------------------------------------------------------------

def retry_fetch_ohlcv(exchange, max_retries, pair, timeframe, since, limit):
    num_retries=0
    try:
        num_retries += 1
        ohlcv=exchange.fetch_ohlcv(pair, timeframe, since, limit)
        # print('Fetched', len(ohlcv), pair, 'candles from', exchange.iso8601 (ohlcv[0][0]), 'to', exchange.iso8601 (ohlcv[-1][0]))
        time.sleep(0.05)
        return ohlcv
    except Exception:
        if num_retries > max_retries:
            # Exception('Failed to fetch', timeframe, pair, 'OHLCV in', max_retries, 'attempts')
            raise

def scrape_ohlcv(exchange, max_retries, pair, timeframe, since, limit):
    timeframe_duration_in_seconds=exchange.parse_timeframe(timeframe)
    timeframe_duration_in_ms=timeframe_duration_in_seconds * 1000
    timedelta=limit * timeframe_duration_in_ms
    now=exchange.milliseconds()
    all_ohlcv=[]
    fetch_since=since
    while fetch_since < now:
        try:
            ohlcv=retry_fetch_ohlcv(
                exchange, max_retries, pair, timeframe, fetch_since, limit)
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


def write_to_csv(filename, data):
    df=pd.DataFrame(data, dtype=float)
    df.rename(columns={
        0: 'open_ts',
        1: 'open',
        2: 'high',
        3: 'low',
        4: 'close',
        5: 'volume'
    }, inplace=True)
    df['datetime']=pd.to_datetime(df['open_ts'], unit='ms')
    df['datetime']=df['datetime'] + timedelta(hours=8)
    df=df[[
        'datetime',
        'open',
        'high',
        'low',
        'close',
        'volume'
    ]]
    df.to_csv(filename, index=False)

def scrape_candles_to_csv(filename, exchange_id, max_retries, pair, timeframe, since, limit):
    # instantiate the exchange by id
    exchange=getattr(ccxt, exchange_id)()
    # convert since from string to milliseconds integer if needed
    if isinstance(since, str):
        since=exchange.parse8601(since)
    # proxy set
    # exchange.proxies={
    #     'http': 'http://127.0.0.1:7070',
    #     'https': 'http://127.0.0.1:7070',
    # }
    # preload all markets from the exchange
    exchange.load_markets()
    # fetch all candles
    ohlcv=scrape_ohlcv(exchange, max_retries, pair,
                         timeframe, since, limit)
    # save to csv file
    write_to_csv(filename, ohlcv)
    print('Saved', len(ohlcv), 'candles from', exchange.iso8601(ohlcv[0][0]), 'to', exchange.iso8601(ohlcv[-1][0]),
          'to', filename)


# -----------------------------------------------------------------------------
if __name__ == '__main__':

    #pair
    pair='ETH/USDT'
    #timeframe
    timeframe='15m'
    #exchange
    exchangeName='bybit'
    #from
    fromDateTime='2023-06-01T00:00:00Z'
    #size of one fetch
    pagesize =100 

    path=exchangeName+'_'+pair.split('/')[0]+'_'+pair.split('/')[1]+'_'+timeframe+'.csv'
    scrape_candles_to_csv(os.path.join(root, path), exchangeName,
                          3, pair, timeframe, fromDateTime, pagesize)