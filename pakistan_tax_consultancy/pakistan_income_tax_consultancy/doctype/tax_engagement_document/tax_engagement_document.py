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
		if not self.document_category:
			frappe.throw(_("Document Category is required"))

		if self.document_category and not frappe.db.exists(
			"Tax Document Category", self.document_category
		):
			frappe.throw(
				_("Tax Document Category {0} does not exist.").format(self.document_category)
			)

		if self.tax_document and not frappe.db.exists("Tax Document", self.tax_document):
			frappe.throw(_("Tax Document {0} does not exist.").format(self.tax_document))


class TaxEngagementDocument(Document):
	pass
