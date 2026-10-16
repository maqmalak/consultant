# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

# import frappe
import frappe
from frappe import _
from frappe.model.document import Document


class SiteVisitService(Document):
	"""Service discussed during a client visit."""

	def validate(self):
		if not self.service:
			frappe.throw(_("Service Type is required"))

		if self.service and not frappe.db.exists("Service", self.service):
			frappe.throw(_("Service {0} does not exist.").format(self.service))


class SiteVisitService(Document):
	pass
