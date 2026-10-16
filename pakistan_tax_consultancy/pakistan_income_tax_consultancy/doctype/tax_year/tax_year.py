# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate


class TaxYear(Document):
	"""Pakistan tax year: 1 July - 30 June, named by the year it ends."""

	def validate(self):
		if getdate(self.end_date) <= getdate(self.start_date):
			frappe.throw(_("End Date must be after Start Date"))
		overlap = frappe.db.get_value("Tax Year", {
			"name": ("!=", self.name or ""),
			"start_date": ("<=", self.end_date),
			"end_date": (">=", self.start_date),
		})
		if overlap:
			frappe.throw(_("Tax Year overlaps with {0}").format(overlap))


def tax_year_for_date(date):
	date = getdate(date)
	return frappe.db.get_value("Tax Year", {"start_date": ("<=", date), "end_date": (">=", date)})
