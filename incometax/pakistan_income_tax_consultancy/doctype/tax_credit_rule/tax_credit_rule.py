# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

# import frappe
import frappe
from frappe import _
from frappe.model.document import Document


class TaxCreditRule(Document):
	"""Tax credit rule for a given tax year and taxpayer type."""

	def validate(self):
		self.credit_name = (self.credit_name or "").strip()
		if not self.credit_name:
			frappe.throw(_("Credit Name is required"))

		if not self.tax_year:
			frappe.throw(_("Tax Year is required"))

		existing = frappe.db.get_value(
			"Tax Credit Rule",
			{
				"credit_name": self.credit_name,
				"tax_year": self.tax_year,
				"name": ("!=", self.name or ""),
			},
			"name",
		)
		if existing:
			frappe.throw(
				_("A credit rule named {0} already exists for Tax Year {1}.").format(
					self.credit_name, self.tax_year
				),
				frappe.DuplicateEntryError,
				title=_("Duplicate Credit Rule"),
			)


class TaxCreditRule(Document):
	pass
