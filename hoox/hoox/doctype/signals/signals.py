# Copyright (c) 2023, jango_blockchained and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class Signals(Document):

    def before_save(self):
        """
        Generates a secret hash if one does not already exist.
        """
        if not self.sig_secret_hash:
            self.sig_secret_hash = frappe.generate_hash(length=16)
