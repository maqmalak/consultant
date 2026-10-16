# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class TaxFilingChecklistItem(Document):
	"""Checklist item within a tax filing record."""

	def validate(self):
		if not self.check_item:
			frappe.throw(_("Check Item is required"))
