# -*- coding: utf-8 -*-
# Copyright (c) 2023. All rights reserved.

from __future__ import unicode_literals
import frappe
from frappe.model.document import Document

class APILog(Document):
    
    def on_update(self):
        if self.status == 'Failure':
            frappe.sendmail(
                recipients="jan.goischke@gmail.com",
                subject="API Request Failed",
                message=f"An API request to {self.api_url} failed with error message: {self.error_message}"
            )
    
    pass
