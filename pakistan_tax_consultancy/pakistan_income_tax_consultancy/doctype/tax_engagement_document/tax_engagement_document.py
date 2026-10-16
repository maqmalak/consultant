# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

# import frappe
import frappe
from frappe import _
from frappe.model.document import Document


class TaxEngagementDocument(Document):
	"""Document requirement linked to a tax engagement."""

	def validate(self):
		if not self.document_type:
			frappe.throw(_("Document Category is required"))

		if self.document_type and not frappe.db.exists(
			"Document Type", self.document_type
		):
			frappe.throw(
				_("Document Type {0} does not exist.").format(self.document_type)
			)

		if self.tax_document and not frappe.db.exists("Tax Document", self.tax_document):
			frappe.throw(_("Tax Document {0} does not exist.").format(self.tax_document))


class TaxEngagementDocument(Document):
	pass
