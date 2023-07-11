import frappe
import ipfshttpclient


def unpin_file_from_ipfs(cid):
    client = ipfshttpclient.connect()  # Connect to the IPFS API
    result = client.pin.rm(cid)  # Unpin the file from IPFS
    return result


def pin_file_to_ipfs(file_path):
    client = ipfshttpclient.connect()  # Connect to the IPFS API
    result = client.pin.add(file_path)  # Pin the file to IPFS
    return result
