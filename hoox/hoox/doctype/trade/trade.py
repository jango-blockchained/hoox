# Copyright (c) 2023, jango_blockchained and contributors
# For license information, please see license.txt

# import frappe
from frappe.website.website_generator import WebsiteGenerator

class Trade(WebsiteGenerator):
	pass

# ------------------------------------------------------------

from hoox.action import _check_and_update_status

def check_and_update_status():
    _check_and_update_status("Trade")