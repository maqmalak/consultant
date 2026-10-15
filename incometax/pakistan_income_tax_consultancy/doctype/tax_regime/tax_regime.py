# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

# import frappe
import frappe
from frappe import _
from frappe.model.document import Document


class TaxRegime(Document):
	"""Tax regime (e.g. Normal Tax Regime, Final Tax Regime)."""

	def validate(self):
		self.regime_name = (self.regime_name or "").strip()
		if not self.regime_name:
			frappe.throw(_("Regime Name is required"))

		existing = frappe.db.get_value(
			"Tax Regime",
			{"regime_name": self.regime_name, "name": ("!=", self.name or "")},
			"name",
		)
		if existing:
			frappe.throw(
				_("A Tax Regime named {0} already exists.").format(self.regime_name),
				frappe.DuplicateEntryError,
				title=_("Duplicate Regime"),
			)
