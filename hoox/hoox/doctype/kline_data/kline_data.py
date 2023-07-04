from frappe.model.base_document import BaseDocument
from influxdb import InfluxDBClient

class KlineData(BaseDocument):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.influx_client = self.connect_to_influxdb()

    def connect_to_influxdb(self):
        # Replace these values with your InfluxDB credentials
        host = 'localhost'
        port = 8086
        username = 'username'
        password = 'password'
        database = 'database_name'
        client = InfluxDBClient(host=host, port=port, username=username, password=password, database=database)
        return client

    def fetch_ohlcv_data(self, symbol, timeframe):
        # Construct the InfluxDB query
        query = f'SELECT * FROM ohlcv WHERE symbol = \'{symbol}\' AND timeframe = \'{timeframe}\''
        result = self.influx_client.query(query)
        return result

    @staticmethod
    def get_list(filters, order_by, start, page_len, with_childnames):
        # Create an instance to access the fetch_ohlcv_data method
        instance = KlineData()
        symbol = filters.get('symbol')
        timeframe = filters.get('timeframe')
        
        # Fetch data from InfluxDB
        result = instance.fetch_ohlcv_data(symbol, timeframe)
        
        # Convert the result to a list of dictionaries
        data = []
        for point in result.get_points():
            data.append({
                'time': point['time'],
                'open': point['open'],
                'high': point['high'],
                'low': point['low'],
                'close': point['close'],
                'volume': point['volume']
            })
        
        # Apply ordering, start and page_len to the data
        # This is a simple example, you may want to implement more complex ordering and pagination logic
        data = sorted(data, key=lambda x: x[order_by])
        data = data[start : start + page_len]
        
        return data

    @staticmethod
    def get(filters):
        # Create an instance to access the fetch_ohlcv_data method
        instance = KlineData()
        symbol = filters.get('symbol')
        timeframe = filters.get('timeframe')
        
        # Fetch data from InfluxDB
        result = instance.fetch_ohlcv_data(symbol, timeframe)
        
        # Convert the result to a dictionary
        # This is a simple example, you may want to implement more complex logic
        data = next(result.get_points(), None)
        if data is not None:
            data = {
                'time': data['time'],
                'open': data['open'],
                'high': data['high'],
                'low': data['low'],
                'close': data['close'],
                'volume': data['volume']
            }
        
        return data

