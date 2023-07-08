# Copyright (c) 2023, jango_blockchained and contributors
# For license information, please see license.txt

# from frappe.website.website_generator import WebsiteGenerator
import frappe
from frappe import _
import ccxt
import json
from frappe.model.document import Document
from hoox.action import attach_url_to_document, get_linked_documents


class Exchange(Document):

    # @property
    # def logo_clone(self):
    #     return self.logo_url

    def validate(self):
        self.logo_clone = self.logo_url

    pass


@frappe.whitelist()
def sync_exchanges():
    """
    Sync exchanges from ccxt module to the database.
    """

    # Get list of exchanges
    amount = len(ccxt.exchanges)
    for i, exchange_id in enumerate(ccxt.exchanges):
        if hasattr(ccxt, exchange_id):
            exchange_class = getattr(ccxt, exchange_id)
            exchange = exchange_class()  # create an instance of the exchange class

            # Check if the exchange document already exists
            exchange_exists = frappe.db.exists("Exchange", exchange.id)

            # set logo_url field in the doc
            exchange_doc_data = {
                "doctype": "Exchange",
                "exchange_name": exchange.name,
                "exchange_id": exchange.id,
                "precision_mode": exchange.precisionMode,
                "rate_limit": exchange.rateLimit,
                "testnet": 1 if exchange.urls.get("test") is not None else 0,
                "has": json.dumps(exchange.has, indent=4),
                "logo_url": exchange.urls.get("logo") or "",
                "logo_clone": exchange.urls.get("logo") or ""
            }

            if exchange_exists is not None:
                # If the document exists, fetch it
                doc = frappe.get_doc("Exchange", exchange.id)
                doc.update(exchange_doc_data)
            else:
                # If the document doesn't exist, create a new one
                doc = frappe.get_doc(exchange_doc_data)

            # Save the document with exception handling for duplicate entries
            try:
                # Download and attach the logo file
                # logo_url = exchange.urls.get("logo")
                # if logo_url and doc.logo_url == "":
                #     # Download and attach the logo file
                #     # if logo_url:
                #     try:
                #         attach_url_to_document(doc, logo_url)
                #     except Exception as e:
                #         frappe.msgprint(
                #             f"Error attaching logo for {exchange_id}: {e}")
                if exchange_exists is not None:
                    doc.save(ignore_permissions=True)
                else:
                    doc.insert(ignore_permissions=True)

            except frappe.DuplicateEntryError:
                continue

            frappe.publish_progress(
                percent=((i + 1) / amount) * 100, title=_('Processing...'))

    frappe.db.commit()

    return True


@frappe.whitelist()
def delete_exchanges(force=False):
    """
    Delete all exchanges from the database.
    """

    if frappe.db.count("Exchange") == 0:
        frappe.msgprint(f"No exchanges found in database.")
        return False

    docs = frappe.get_all("Exchange")
    amount = len(docs)
    for i, doc in enumerate(docs):
        linked_docs = get_linked_documents("Exchange", doc.name)
        links = len(linked_docs)
        if links > 0:
            if not force:
                frappe.msgprint(
                    f"Exchange '{doc.name}' has {links} linked documents. Skipping deletion."
                )
                continue
        frappe.delete_doc("Exchange", doc.name, force=force)
        frappe.publish_progress(percent=((i + 1) / amount) *
                                100, title=_("Processing..."))

    frappe.db.commit()

    return f"{amount} exchanges deleted successfully."