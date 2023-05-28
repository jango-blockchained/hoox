import frappe
import ccxt

@frappe.whitelist()
def sync_exchanges():
    # Get list of exchanges
    exchange_list = ccxt.exchanges
    if exchange_list is None:
        raise Exception("No exchanges found")
    else:
        # Delete all existing entries
        frappe.db.sql("""DELETE FROM `tabExchanges`""")
        # Insert new entries
        for exchange_id in exchange_list:
            exchange = ccxt.Exchange(exchange_id)
            frappe.get_doc({
                'doctype': 'Exchanges',
                'exchange_id': exchange.id,
                'exchange_name': exchange.name,
                'precision_mode': exchange.precisionMode,
                'rate_limit': exchange.rateLimit,
                'testnet': exchange.urls['test'] is not None,
                'has': json.dumps(exchange.has)
            }).insert(ignore_permissions=True)
