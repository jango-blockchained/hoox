from influxdb import InfluxDBClient
from frappe import get_site_config


def get_influxdb_client():
    site_config = get_site_config()
    influxdb_config = site_config.get('influxdb')

    client = InfluxDBClient(
        host=influxdb_config.get('host'),
        port=influxdb_config.get('port'),
        username=influxdb_config.get('username'),
        password=influxdb_config.get('password'),
        database=influxdb_config.get('database')
    )
    return client


def write_data_to_influxdb(data):
    client = get_influxdb_client()
    client.write_points(data)


def query_data_from_influxdb(query):
    client = get_influxdb_client()
    result = client.query(query)
    return result
