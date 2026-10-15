# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

# import frappe
import frappe
from frappe import _
from frappe.model.document import Document


class ClientVisitService(Document):
	"""Service discussed during a client visit."""

	def validate(self):
		if not self.service_type:
			frappe.throw(_("Service Type is required"))

		if self.service_type and not frappe.db.exists("Tax Service Type", self.service_type):
			frappe.throw(_("Tax Service Type {0} does not exist.").format(self.service_type))


class ClientVisitService(Document):
	pass
