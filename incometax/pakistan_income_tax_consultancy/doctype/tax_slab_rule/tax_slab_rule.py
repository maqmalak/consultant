# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

# import frappe
import frappe
from frappe import _
from frappe.model.document import Document


class TaxSlabRule(Document):
	"""Rule linking a tax slab to a tax year, regime, and taxpayer type."""

	def validate(self):
		self.rule_title = (self.rule_title or "").strip()
		if not self.rule_title:
			frappe.throw(_("Rule Title is required"))

		if not self.tax_year:
			frappe.throw(_("Tax Year is required"))

		if self.priority is not None and self.priority < 0:
			frappe.throw(_("Priority must be zero or greater"))

		existing = frappe.db.get_value(
			"Tax Slab Rule",
			{
				"rule_title": self.rule_title,
				"tax_year": self.tax_year,
				"name": ("!=", self.name or ""),
			},
			"name",
		)
		if existing:
			frappe.throw(
				_("A slab rule named {0} already exists for Tax Year {1}.").format(
					self.rule_title, self.tax_year
				),
				frappe.DuplicateEntryError,
				title=_("Duplicate Slab Rule"),
			)


class TaxSlabRule(Document):
	pass
