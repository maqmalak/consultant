# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

# import frappe
import frappe
from frappe import _
from frappe.model.document import Document


class TaxSlab(Document):
	"""Tax slab for income tax calculation."""

	def validate(self):
		if self.from_amount is not None and self.to_amount is not None:
			if self.to_amount <= self.from_amount:
				frappe.throw(_("To Amount must be greater than From Amount"))

		if self.rate_percent is not None and (self.rate_percent < 0 or self.rate_percent > 100):
			frappe.throw(_("Rate Percent must be between 0 and 100"))
