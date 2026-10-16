# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class TaxReturnCredit(Document):
	"""Tax credit entry within a tax return."""

	def validate(self):
		if self.amount is not None and self.amount < 0:
			frappe.throw(_("Amount cannot be negative"))
