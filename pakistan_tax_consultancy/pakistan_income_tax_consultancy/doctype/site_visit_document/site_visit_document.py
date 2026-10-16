# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

# import frappe
import frappe
from frappe import _
from frappe.model.document import Document


class SiteVisitDocument(Document):
	"""Document received during a client visit."""

	def validate(self):
		if not self.document_type:
			frappe.throw(_("Document Category is required"))

		if self.document_type and not frappe.db.exists(
			"Document Type", self.document_type
		):
			frappe.throw(
				_("Document Type {0} does not exist.").format(self.document_type)
			)


class SiteVisitDocument(Document):
	pass
