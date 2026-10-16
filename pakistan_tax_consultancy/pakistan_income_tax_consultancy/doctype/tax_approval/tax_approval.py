# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

# import frappe
import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime


class TaxApproval(Document):
	"""Approval/rejection of a tax return by an authorised approver."""

	def validate(self):
		if not self.tax_return:
			frappe.throw(_("Tax Return is required"))

		if not frappe.db.exists("Tax Return", self.tax_return):
			frappe.throw(_("Tax Return {0} does not exist.").format(self.tax_return))

		if not self.approver:
			frappe.throw(_("Approver is required"))

		if not self.decision:
			frappe.throw(_("Decision is required"))

		if self.decision == "Approved" and not self.approval_timestamp:
			self.approval_timestamp = now_datetime()

		if self.decision != "Approved":
			self.approval_timestamp = None

