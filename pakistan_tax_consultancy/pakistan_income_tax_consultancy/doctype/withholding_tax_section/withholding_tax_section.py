# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

# import frappe
import frappe
from frappe import _
from frappe.model.document import Document


class WithholdingTaxSection(Document):
	"""Withholding tax section (e.g. Section 149, Section 153)."""

	def validate(self):
		self.section_code = (self.section_code or "").strip()
		if not self.section_code:
			frappe.throw(_("Section Code is required"))

		existing = frappe.db.get_value(
			"Withholding Tax Section",
			{"section_code": self.section_code, "name": ("!=", self.name or "")},
			"name",
		)
		if existing:
			frappe.throw(
				_("A Withholding Tax Section with code {0} already exists.").format(self.section_code),
				frappe.DuplicateEntryError,
				title=_("Duplicate Section"),
			)

		if self.default_rate_percent is not None and (
			self.default_rate_percent < 0 or self.default_rate_percent > 100
		):
			frappe.throw(_("Default Rate Percent must be between 0 and 100"))
