# Copyright (c) 2023, jango_blockchained and contributors
# For license information, please see license.txt

import frappe
from frappe.website.website_generator import WebsiteGenerator
from frappe.model.document import Document
from frappe.utils import add_to_date, now_datetime
class OutgoingRequest(Document):
    pass

# ------------------------------------------------------------

from hoox.action import _check_and_update_status

def check_and_update_status():
    # _check_and_update_status("Outgoing Request")
    doctype = "Outgoing Request"
    try:
        docs = frappe.get_all(doctype, filters = {
            'status': 'Processing',
            'creation': ['<', add_to_date(now_datetime(), minutes=-1)]
        }, fields = ['name'])

        print(len(docs))

        # update the status of these documents to 'Failure'
        for doc in docs:
            frappe.db.set_value(doctype, doc.name, 'status', 'Failed')
            # doc_obj = frappe.get_doc(doctype, doc.name)
            # doc_obj.set()
            # doc_obj.save()
        return True
    except:
        return False
