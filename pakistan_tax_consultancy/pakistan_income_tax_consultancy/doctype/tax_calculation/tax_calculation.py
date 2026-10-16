# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class TaxCalculation(Document):
	"""Tax calculation linked to a tax return."""

	def validate(self):
		if not self.tax_return:
			frappe.throw(_("Tax Return is required"))

		if not frappe.db.exists("Tax Return", self.tax_return):
			frappe.throw(_("Tax Return {0} does not exist.").format(self.tax_return))

		if self.tax_year and not frappe.db.exists("Tax Year", self.tax_year):
			frappe.throw(_("Tax Year {0} does not exist.").format(self.tax_year))

		if self.tax_regime and not frappe.db.exists("Tax Regime", self.tax_regime):
			frappe.throw(_("Tax Regime {0} does not exist.").format(self.tax_regime))
