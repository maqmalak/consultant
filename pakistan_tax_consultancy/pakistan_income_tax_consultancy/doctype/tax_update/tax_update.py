# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import getdate


class TaxUpdate(Document):
	def validate(self):
		slug = (self.route or "").strip().strip("/").split("/")[-1] or frappe.scrub(self.title or "").replace("_", "-")
		self.route = f"tax-updates/{slug[:120]}"
		if self.published and not self.published_on:
			self.published_on = getdate()
