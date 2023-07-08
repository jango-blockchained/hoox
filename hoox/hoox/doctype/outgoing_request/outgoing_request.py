# Copyright (c) 2023, jango_blockchained and contributors
# For license information, please see license.txt

import frappe
from frappe.website.website_generator import WebsiteGenerator
from frappe.model.document import Document

class OutgoingRequest(WebsiteGenerator, Document):
	pass

# ------------------------------------------------------------

from hoox.action import _check_and_update_status

def check_and_update_status():
    _check_and_update_status("Outgoing Request")
