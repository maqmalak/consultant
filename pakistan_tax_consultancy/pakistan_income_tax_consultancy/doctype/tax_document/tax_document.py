# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

# import frappe
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

		if not self.document_category:
			frappe.throw(_("Document Category is required"))

		if self.document_category and not frappe.db.exists(
			"Tax Document Category", self.document_category
		):
			frappe.throw(
				_("Tax Document Category {0} does not exist.").format(self.document_category)
			)


class TaxDocument(Document):
	pass
