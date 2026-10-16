# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class TaxDocument(Document):
	"""Tax document uploaded for a client."""

	def validate(self):
		if not self.tax_client:
			frappe.throw(_("Tax Client is required"))

		if not frappe.db.exists("Tax Client", self.tax_client):
			frappe.throw(_("Tax Client {0} does not exist.").format(self.tax_client))

		if not self.document_type:
			frappe.throw(_("Document Category is required"))

		if self.document_type and not frappe.db.exists(
			"Document Type", self.document_type
		):
			frappe.throw(
				_("Document Type {0} does not exist.").format(self.document_type)
			)
