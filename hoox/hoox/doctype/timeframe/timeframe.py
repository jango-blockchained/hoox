# Copyright (c) 2023, jango_blockchained and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document

class Timeframe(Document):

	def before_save(self):
		self.timeframe_id = self.value + self.unit

		
	pass
