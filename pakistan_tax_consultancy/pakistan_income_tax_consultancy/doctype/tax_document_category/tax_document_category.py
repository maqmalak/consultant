# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

# import frappe
import frappe
from frappe import _
from frappe.model.document import Document


class TaxDocumentCategory(Document):
	"""Category of tax documents (e.g. CNIC, NTN, Bank Statement)."""

	def validate(self):
		self.category_name = (self.category_name or "").strip()
		if not self.category_name:
			frappe.throw(_("Category Name is required"))

		existing = frappe.db.get_value(
			"Tax Document Category",
			{"category_name": self.category_name, "name": ("!=", self.name or "")},
			"name",
		)
		if existing:
			frappe.throw(
				_("A Tax Document Category named {0} already exists.").format(self.category_name),
				frappe.DuplicateEntryError,
				title=_("Duplicate Category"),
			)
