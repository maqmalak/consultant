# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

# import frappe
import frappe
from frappe import _
from frappe.model.document import Document


class ClientVisitDocument(Document):
	"""Document received during a client visit."""

	def validate(self):
		if not self.document_category:
			frappe.throw(_("Document Category is required"))

		if self.document_category and not frappe.db.exists(
			"Tax Document Category", self.document_category
		):
			frappe.throw(
				_("Tax Document Category {0} does not exist.").format(self.document_category)
			)


class ClientVisitDocument(Document):
	pass
