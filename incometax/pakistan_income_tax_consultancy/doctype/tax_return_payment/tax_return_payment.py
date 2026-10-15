# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

# import frappe
import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate


class TaxReturnPayment(Document):
	"""Tax payment entry within a tax return."""

	def validate(self):
		if not self.payment_type:
			frappe.throw(_("Payment Type is required"))

		if self.amount is not None and self.amount < 0:
			frappe.throw(_("Amount cannot be negative"))

		if self.payment_date:
			pd = getdate(self.payment_date)
			if pd > getdate():
				frappe.throw(_("Payment Date cannot be in the future"))


class TaxReturnPayment(Document):
	pass
