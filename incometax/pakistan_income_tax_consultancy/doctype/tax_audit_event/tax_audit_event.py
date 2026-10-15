# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class TaxAuditEvent(Document):
	"""Insert-only audit trail. Rows can only be created through incometax.audit.log_event."""

	def before_insert(self):
		if not self.flags.from_audit_api:
			frappe.throw(_("Audit events can only be created by the system."), frappe.PermissionError)

	def on_update(self):
		if not self.is_new() and self.get_doc_before_save():
			frappe.throw(_("Audit events are immutable."), frappe.PermissionError)

	def on_trash(self):
		if not frappe.flags.in_test:
			frappe.throw(_("Audit events cannot be deleted."), frappe.PermissionError)
