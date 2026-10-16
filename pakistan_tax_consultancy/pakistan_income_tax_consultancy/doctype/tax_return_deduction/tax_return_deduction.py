# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class TaxReturnDeduction(Document):
	"""Deduction entry within a tax return."""

	def validate(self):
		if not self.deduction_type:
			frappe.throw(_("Deduction Type is required"))

		if self.amount is not None and self.amount < 0:
			frappe.throw(_("Amount cannot be negative"))
