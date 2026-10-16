# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

# import frappe
import frappe
from frappe import _
from frappe.model.document import Document


class TaxReview(Document):
	"""Review of a tax return by an authorised reviewer."""

	def validate(self):
		if not self.tax_return:
			frappe.throw(_("Tax Return is required"))

		if not frappe.db.exists("Tax Return", self.tax_return):
			frappe.throw(_("Tax Return {0} does not exist.").format(self.tax_return))

		if not self.reviewer:
			frappe.throw(_("Reviewer is required"))

		if not self.decision:
			frappe.throw(_("Decision is required"))


class TaxReview(Document):
	pass
