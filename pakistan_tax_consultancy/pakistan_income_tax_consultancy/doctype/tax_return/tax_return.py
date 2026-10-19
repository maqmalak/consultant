# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, now_datetime

from pakistan_tax_consultancy.services import workflow as wf
from pakistan_tax_consultancy.services.tax_calc import taxpayer_type_for


class TaxReturn(Document):
	"""A client's income tax return for one tax year, moved through the workflow in services/workflow.py."""

	def validate(self):
		self.validate_links()
		self.check_duplicate()
		self.set_defaults()
		self.set_row_values()
		self.set_wealth_totals()
		before = self.get_doc_before_save()
		wf.apply_material_change_rules(self, before)
		old_state = before.workflow_state if before else None
		if old_state and old_state != self.workflow_state:
			wf.guard_transition(self, old_state, self.workflow_state, self.flags.workflow_comment)
		self.content_hash = wf.content_hash(self)

	def validate_links(self):
		for field, doctype in (("tax_client", "Tax Client"), ("tax_year", "Tax Year")):
			if not self.get(field):
				frappe.throw(_("{0} is required").format(_(doctype)))
			if not frappe.db.exists(doctype, self.get(field)):
				frappe.throw(_("{0} {1} does not exist.").format(_(doctype), self.get(field)))

	def check_duplicate(self):
		if self.return_type == "Revised":
			if not self.amended_from:
				frappe.throw(_("A revised return must point to the return it revises."))
			return
		existing = frappe.db.get_value("Tax Return", {"tax_client": self.tax_client, "tax_year": self.tax_year,
			"return_type": "Original", "name": ("!=", self.name or "")}, "name")
		if existing:
			frappe.throw(_("Return {0} already exists for this client and tax year. Revise it instead.").format(existing),
				frappe.DuplicateEntryError, title=_("Duplicate Return"))

	def set_defaults(self):
		self.client_name = frappe.db.get_value("Tax Client", self.tax_client, "client_name")
		self.taxpayer_type = taxpayer_type_for(self)
		if not self.assigned_consultant:
			self.assigned_consultant = frappe.db.get_value("Tax Client", self.tax_client, "assigned_consultant")
		if not (self.period_from and self.period_to):
			self.period_from, self.period_to = frappe.db.get_value("Tax Year", self.tax_year, ["start_date", "end_date"])

	def set_row_values(self):
		for row in self.get("income_sources") or []:
			for f in ("gross_amount", "exempt_amount", "taxable_amount"):
				if flt(row.get(f)) < 0:
					frappe.throw(_("Row {0}: amounts cannot be negative").format(row.idx))
			if row.tax_treatment == "Exempt":
				row.exempt_amount, row.taxable_amount = flt(row.gross_amount), 0
			elif not flt(row.taxable_amount):
				row.taxable_amount = max(flt(row.gross_amount) - flt(row.exempt_amount), 0)
			if flt(row.exempt_amount) + flt(row.taxable_amount) > flt(row.gross_amount) + 0.01:
				frappe.throw(_("Income row {0}: exempt + taxable cannot exceed gross").format(row.idx))

	def set_wealth_totals(self):
		self.total_assets = sum(flt(r.cost_value) for r in self.get("asset_lines") or [])
		self.total_liabilities = sum(flt(r.amount) for r in self.get("liability_lines") or [])
		self.net_wealth = self.total_assets - self.total_liabilities
		self.total_personal_expenses = sum(flt(r.amount) for r in self.get("personal_expense_lines") or [])
		self.wealth_statement_required = 1 if (self.asset_lines or self.liability_lines or self.wealth_statement_required) else 0

	# -------------------------------------------------------------------------------------- after save
	def after_insert(self):
		from pakistan_tax_consultancy.services.checklist import generate_checklist

		created = generate_checklist(self)
		if not created and self.workflow_state == wf.DOCUMENTS_PENDING:
			# nothing to collect: go straight to preparation
			self.db_set("workflow_state", wf.DRAFT, update_modified=False)
		from pakistan_tax_consultancy.audit import log_event

		log_event("Create", self, to_state=self.workflow_state)

	def on_update(self):
		before = self.get_doc_before_save()
		old_state = before.workflow_state if before else None
		if not old_state or old_state == self.workflow_state:
			return
		self.record_transition(old_state, self.workflow_state)

	def record_transition(self, old_state, new_state):
		from pakistan_tax_consultancy.audit import log_event
		from pakistan_tax_consultancy.services import filing, notify

		comment = self.flags.workflow_comment
		log_event("Status Change", self, from_state=old_state, to_state=new_state, details={"comment": comment})
		if comment:
			frappe.get_doc({"doctype": "Review Comment", "tax_return": self.name, "stage": new_state,
				"user": frappe.session.user, "comment": comment,
				"from_client": 1 if "Client" in frappe.get_roles() else 0}).insert(ignore_permissions=True)
		if new_state == wf.APPROVED:
			frappe.get_doc({"doctype": "Tax Approval", "tax_return": self.name, "tax_client": self.tax_client,
				"client_name": self.client_name, "approver": frappe.session.user, "decision": "Approved",
				"approval_timestamp": now_datetime(), "approved_version_hash": self.approved_content_hash,
				"is_valid": 1}).insert(ignore_permissions=True)
		filing.on_state_change(self, old_state, new_state)
		notify.workflow_changed(self, old_state, new_state, comment)


@frappe.whitelist(methods=["POST"])
def create_revision(tax_return: str) -> str:
	"""A filed return is never edited: a revision is a new linked return that goes through the workflow again."""
	src = frappe.get_doc("Tax Return", tax_return)
	src.check_permission("write")
	if src.workflow_state not in (wf.ACKNOWLEDGED, wf.CLOSED):
		frappe.throw(_("Only an acknowledged return can be revised."))
	new = frappe.copy_doc(src)
	new.update({"return_type": "Revised", "amended_from": src.name, "workflow_state": None,
		"approval_status": "Not Approved", "approved_by": None, "approved_on": None, "approved_content_hash": None,
		"client_confirmed": 0, "client_confirmed_on": None, "client_confirmed_by": None, "client_confirmed_ip": None,
		"client_confirmed_via": None, "client_confirmation_method": None, "client_confirmation_note": None,
		"client_confirmation_proof": None, "client_details_entered_by": None,
		"fbr_submission_status": "Not Submitted", "iris_acknowledgment_no": None, "submission_timestamp": None,
		"fbr_receipt": None, "filing_date": None, "filing_error_notes": None, "latest_calculation": None,
		"calculation_version": 0, "calc_input_hash": None})
	new.insert()
	return new.name
