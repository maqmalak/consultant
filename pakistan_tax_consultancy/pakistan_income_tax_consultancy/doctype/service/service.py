# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

# import frappe
import frappe
from frappe import _
from frappe.model.document import Document


class Service(Document):
	"""Service type offered by the consultancy (e.g. Income Tax Return, Sales Tax)."""

	def validate(self):
		self.title = (self.title or "").strip()
		if not self.title:
			frappe.throw(_("Service Name is required"))

		existing = frappe.db.get_value(
			"Service",
			{"title": self.title, "name": ("!=", self.name or "")},
			"name",
		)
		if existing:
			frappe.throw(
				_("A Service named {0} already exists.").format(self.title),
				frappe.DuplicateEntryError,
				title=_("Duplicate Service Type"),
			)
