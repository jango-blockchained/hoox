# Copyright (c) 2022, jango_blockchained and contributors
# For license information, please see license.txt

import frappe
from frappe.website.website_generator import WebsiteGenerator
from frappe.model.document import Document
from frappe import _, whitelist
from frappe.model.delete_doc import delete_doc


class ExchangeCredential(WebsiteGenerator, Document):
    def before_save(self):
        """
        Generates a secret hash if one does not already exist.
        """
        if not self.secret_hash:
            self.secret_hash = frappe.generate_hash(length=16)

    def before_insert(self):
        """
        Validates that exchange credentials do not already exist for the user.
        """
        if self.exists():
            frappe.throw(
                _("Exchange credentials already exist for user {0}").format(self.user))

    def exists(self):
        """
        Returns True if exchange credentials already exist for the user.
        """
        cred_filter = {"user": self.user,
                       "exchange": self.exchange,
                       "testnet": False,
                       "docstatus": "Enabled"}
        if self.testnet:
            cred_filter["testnet"] = self.testnet

        existing_credentials = frappe.db.get_all(
            "Exchange Credential", filters=cred_filter, fields=["name", "docstatus"])

        filtered_credentials = list(
            filter(lambda x: x['docstatus'] != 'Revoked', existing_credentials))

        return bool(filtered_credentials)

    def delete_document(doctype, name, ignore_linked_doctypes=None):
        delete_doc(doctype, name, ignore_doctypes=ignore_linked_doctypes,
                   force=1, for_reload=False, ignore_permissions=False, flags=None)

    def on_trash(self):
        delete_document(self.doctype, self.docname, ["Trade"])
