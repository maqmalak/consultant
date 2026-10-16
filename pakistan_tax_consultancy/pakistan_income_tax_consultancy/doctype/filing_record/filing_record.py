# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class FilingRecord(Document):
	"""One filing attempt of a Tax Return (created by services/filing.py on Submitted to FBR)."""

	def validate(self):
		if not frappe.db.exists("Tax Return", self.tax_return):
			frappe.throw(_("Tax Return {0} does not exist.").format(self.tax_return))
		if self.status == "Acknowledged" and not ((self.iris_acknowledgment_no or "").strip() and self.evidence):
			frappe.throw(_("An acknowledged filing needs the IRIS acknowledgment number and the receipt."))
		if self.status == "Error" and not (self.errors or "").strip():
			frappe.throw(_("Describe the error."))
