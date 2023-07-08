# Copyright (c) 2023, jango_blockchained and contributors
# For license information, please see license.txt

import frappe
from frappe import _
import ccxt
from frappe.model.document import Document

class MarketType(Document):

    def autoname(self):
        if self.exchange is None:
            name = self.type
        else:
            name = f"{self.type}-{self.exchange}"
        return name


@frappe.whitelist()
def get_supported_market_types(exchange_id):
    exchange_class = getattr(ccxt, exchange_id)
    exchange_instance = exchange_class()

    # Load the markets
    exchange_instance.load_markets()

    # Get the unique market types
    market_types = set(market['type'] for market in exchange_instance.markets.values())

    return list(market_types)


@frappe.whitelist()
def insert_market_types(exchange, market_types):
    # Perform the logic to insert the selected market types into the Market Type doctype
    # Replace this with your actual implementation
    for market_type in market_types:
        exists = frappe.db.exists("Market Type", {"exchange": exchange, "type": market_type})
        if exists is not None:
             continue
        doc = frappe.get_doc({
            "doctype": "Market Type",
            "exchange": exchange,
            "type": market_type
        })
        doc.insert(ignore_permissions=True)
    
    return _('Market types inserted successfully!')