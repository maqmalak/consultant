# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

# import frappe
import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime


class FilingRecord(Document):
	"""Record of a tax return filing with FBR."""

	def validate(self):
		if not self.tax_return:
			frappe.throw(_("Tax Return is required"))

		if not frappe.db.exists("Tax Return", self.tax_return):
			frappe.throw(_("Tax Return {0} does not exist.").format(self.tax_return))

		if not self.filing_officer:
			frappe.throw(_("Filing Officer is required"))

		if not self.channel:
			frappe.throw(_("Filing Channel is required"))

		if self.status == "Filed" and not self.filing_datetime:
			self.filing_datetime = now_datetime()

		if self.status != "Filed":
			self.filing_datetime = None


class FilingRecord(Document):
	pass
