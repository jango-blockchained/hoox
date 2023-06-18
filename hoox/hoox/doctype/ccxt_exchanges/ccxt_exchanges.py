# Copyright (c) 2023, jango_blockchained and contributors
# For license information, please see license.txt

import frappe
from frappe.website.website_generator import WebsiteGenerator


class CCXTExchanges(WebsiteGenerator):

    listview_template = "hoox/hoox/doctype/ccxt_exchanges/ccxt_exchanges_list.html"

    pass
