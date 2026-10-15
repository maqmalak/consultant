# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

# import frappe
import frappe
from frappe import _
from frappe.model.document import Document


class TaxReviewChecklistItem(Document):
	"""Checklist item within a tax review."""

	def validate(self):
		if not self.check_item:
			frappe.throw(_("Check Item is required"))


class TaxReviewChecklistItem(Document):
	pass
