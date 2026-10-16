# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

# import frappe
import frappe
from frappe import _
from frappe.model.document import Document


class TaxServiceType(Document):
	"""Service type offered by the consultancy (e.g. Income Tax Return, Sales Tax)."""

	def validate(self):
		self.service_name = (self.service_name or "").strip()
		if not self.service_name:
			frappe.throw(_("Service Name is required"))

		existing = frappe.db.get_value(
			"Tax Service Type",
			{"service_name": self.service_name, "name": ("!=", self.name or "")},
			"name",
		)
		if existing:
			frappe.throw(
				_("A Tax Service Type named {0} already exists.").format(self.service_name),
				frappe.DuplicateEntryError,
				title=_("Duplicate Service Type"),
			)
