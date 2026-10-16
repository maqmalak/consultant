# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class TaxReturnIncomeSource(Document):
	"""Income entry within a tax return."""

	def validate(self):
		if self.gross_amount is not None and self.gross_amount < 0:
			frappe.throw(_("Gross Amount cannot be negative"))

		if self.exempt_amount is not None and self.exempt_amount < 0:
			frappe.throw(_("Exempt Amount cannot be negative"))

		if self.taxable_amount is not None and self.taxable_amount < 0:
			frappe.throw(_("Taxable Amount cannot be negative"))

		if (
			self.gross_amount is not None
			and self.exempt_amount is not None
			and self.taxable_amount is not None
		):
			if self.gross_amount < self.exempt_amount + self.taxable_amount:
				frappe.throw(
					_("Gross Amount must be at least Exempt Amount plus Taxable Amount")
				)
