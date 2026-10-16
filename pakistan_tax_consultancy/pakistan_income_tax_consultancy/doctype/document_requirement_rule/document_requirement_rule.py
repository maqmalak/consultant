# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

# import frappe
import frappe
from frappe import _
from frappe.model.document import Document


class DocumentRequirementRule(Document):
	"""Rule defining which documents are required for a given client type / service."""

	def validate(self):
		if not self.document_type:
			frappe.throw(_("Document Category is required"))

		if self.document_type and not frappe.db.exists(
			"Document Type", self.document_type
		):
			frappe.throw(
				_("Document Type {0} does not exist.").format(self.document_type)
			)

		if self.service and not frappe.db.exists("Service", self.service):
			frappe.throw(_("Service {0} does not exist.").format(self.service))


class DocumentRequirementRule(Document):
	pass
