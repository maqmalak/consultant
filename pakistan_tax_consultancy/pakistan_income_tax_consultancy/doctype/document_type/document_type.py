# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

# import frappe
import frappe
from frappe import _
from frappe.model.document import Document


class DocumentType(Document):
	"""Category of tax documents (e.g. CNIC, NTN, Bank Statement)."""

	def validate(self):
		self.document_type_name = (self.document_type_name or "").strip()
		if not self.document_type_name:
			frappe.throw(_("Category Name is required"))

		existing = frappe.db.get_value(
			"Document Type",
			{"document_type_name": self.document_type_name, "name": ("!=", self.name or "")},
			"name",
		)
		if existing:
			frappe.throw(
				_("A Document Type named {0} already exists.").format(self.document_type_name),
				frappe.DuplicateEntryError,
				title=_("Duplicate Category"),
			)
