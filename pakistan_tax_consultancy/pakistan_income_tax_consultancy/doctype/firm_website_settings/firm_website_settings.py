# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class FirmWebsiteSettings(Document):
	def on_update(self):
		frappe.cache.delete_value("ptc:site_info")
		frappe.clear_cache()  # rebuild cached www pages with the new firm details
