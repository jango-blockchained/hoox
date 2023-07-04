# Copyright (c) 2023, jango_blockchained and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

class IPWhitelist(Document):

	@frappe.whitelist()
	def add_ip_addresses():
		# replace with your IP addresses
		ip_addresses = ["52.89.214.238", "34.212.75.30",
						"54.218.53.128", "52.32.178.7"]
		for i, ip_address in enumerate(ip_addresses, start=1):
			friendly_name = "TradingView™ IP Whitelist {}".format(i)
			# Check if the doc exists
			if not frappe.db.exists("IP Whitelist", {"ip": ip_address}):
				doc = frappe.new_doc("IP Whitelist")
				doc.sig_provider = "TradingView"
				doc.friendly_name = friendly_name
				doc.ip = ip_address
				doc.insert()

		return "{} IP addresses added successfully.".format(len(ip_addresses))


	@frappe.whitelist()
	def add_whitelist_all():
		if not frappe.db.exists("IP Whitelist", {"ip": "*"}):
			doc = frappe.new_doc("IP Whitelist")
			doc.sig_provider = "SYSTEM"
			doc.friendly_name = "Whitelist All (NOT RECOMMENDED!)"
			doc.ip = "*"
			doc.enabled = 0
			doc.insert()

			return "Whitelist All '*' address placeholder added successfully."

		return "Whitelist All '*' entry already exists."



	pass
