"""Tax Return workflow: states, transitions and the server-side guards behind them.

The same table drives the Frappe Workflow fixture (desk buttons) and `guard_transition`, which TaxReturn.validate
runs on every save, so neither the desk, the REST API nor the React portal can skip a state or a rule.
"""

import hashlib
import json

import frappe
from frappe import _
from frappe.utils import flt, cint, now_datetime

DOCUMENTS_PENDING = "Documents Pending"
DRAFT = "Draft"
PENDING_REVIEW = "Pending Review"
UNDER_REVIEW = "Under Review"
CHANGES_REQUIRED = "Changes Required"
REVIEWED = "Reviewed"
AWAITING_CLIENT = "Awaiting Client Confirmation"
APPROVED = "Approved"
SUBMITTED = "Submitted to FBR"
FILING_ERROR = "Filing Error"
ACKNOWLEDGED = "Acknowledged"
CLOSED = "Closed"

STATES = [
	# state, style, roles that may edit in this state
	(DOCUMENTS_PENDING, "Warning", ("Tax Consultant", "Tax Admin")),
	(DRAFT, "", ("Tax Consultant", "Tax Admin")),
	(PENDING_REVIEW, "Primary", ("Tax Reviewer", "Tax Admin")),
	(UNDER_REVIEW, "Primary", ("Tax Reviewer", "Tax Admin")),
	(CHANGES_REQUIRED, "Danger", ("Tax Consultant", "Tax Admin")),
	(REVIEWED, "Info", ("Tax Reviewer", "Tax Admin")),
	(AWAITING_CLIENT, "Warning", ("Tax Approver", "Tax Admin")),
	(APPROVED, "Success", ("Filing Officer", "Tax Admin")),
	(SUBMITTED, "Primary", ("Filing Officer", "Tax Admin")),
	(FILING_ERROR, "Danger", ("Filing Officer", "Tax Admin")),
	(ACKNOWLEDGED, "Success", ("Tax Admin",)),
	(CLOSED, "Inverse", ("Tax Admin",)),
]

STAFF_PREP = ("Tax Consultant", "Tax Admin")
REVIEW = ("Tax Reviewer", "Tax Admin")
APPROVE = ("Tax Approver", "Tax Admin")
FILE = ("Filing Officer", "Tax Admin")

TRANSITIONS = [
	# from, action, to, roles, self-approval allowed
	(DOCUMENTS_PENDING, "Documents Complete", DRAFT, STAFF_PREP, 1),
	(DRAFT, "Submit for Review", PENDING_REVIEW, STAFF_PREP, 1),
	(PENDING_REVIEW, "Start Review", UNDER_REVIEW, REVIEW, 1),
	(UNDER_REVIEW, "Request Changes", CHANGES_REQUIRED, REVIEW, 1),
	(CHANGES_REQUIRED, "Resume Preparation", DRAFT, STAFF_PREP, 1),
	(UNDER_REVIEW, "Mark Reviewed", REVIEWED, REVIEW, 1),
	(REVIEWED, "Send to Client", AWAITING_CLIENT, REVIEW, 1),
	(AWAITING_CLIENT, "Client Question", CHANGES_REQUIRED, ("Client",), 1),
	(AWAITING_CLIENT, "Approve", APPROVED, APPROVE, 0),  # four eyes: the preparer cannot approve
	(APPROVED, "Mark Submitted on IRIS", SUBMITTED, FILE, 1),
	(SUBMITTED, "Record Acknowledgment", ACKNOWLEDGED, FILE, 1),
	(SUBMITTED, "Report Filing Error", FILING_ERROR, FILE, 1),
	(FILING_ERROR, "Retry Filing", SUBMITTED, FILE, 1),
	(ACKNOWLEDGED, "Close", CLOSED, ("Tax Admin",), 1),
	# a material change after review/approval sends the return back (TaxReturn.validate does it automatically)
	(REVIEWED, "Reopen for Review", PENDING_REVIEW, STAFF_PREP + REVIEW + APPROVE, 1),
	(AWAITING_CLIENT, "Reopen for Review", PENDING_REVIEW, STAFF_PREP + REVIEW + APPROVE, 1),
	(APPROVED, "Reopen for Review", PENDING_REVIEW, STAFF_PREP + REVIEW + APPROVE + FILE, 1),
]

FILED_STATES = (SUBMITTED, ACKNOWLEDGED, CLOSED, FILING_ERROR)
LOCKED_STATES = (SUBMITTED, ACKNOWLEDGED, CLOSED)
REVIEWED_STATES = (REVIEWED, AWAITING_CLIENT, APPROVED)

# The figures a client and approver sign off on. Changing any of them after approval cancels the approval.
MATERIAL_FIELDS = ("tax_year", "taxpayer_type", "return_type", "taxable_income", "tax_liability", "net_tax_payable",
	"refund_due", "total_income", "total_deductions", "total_tax_credits", "total_tax_withheld", "total_advance_tax",
	"total_assets", "total_liabilities", "net_wealth", "total_personal_expenses")
MATERIAL_TABLES = {
	"income_sources": ("income_category", "tax_treatment", "gross_amount", "exempt_amount", "taxable_amount", "tax_rate_percent"),
	"deduction_lines": ("deduction_type", "amount"),
	"credit_lines": ("credit_type", "credit_amount"),
	"withholding_lines": ("section", "payer", "amount"),
	"advance_tax_lines": ("cpr_no", "amount"),
	"asset_lines": ("asset_type", "description", "cost_value"),
	"liability_lines": ("liability_type", "creditor", "amount"),
	"personal_expense_lines": ("expense_type", "amount"),
}


def transition_roles(from_state, to_state):
	for f, _action, t, roles, _self in TRANSITIONS:
		if f == from_state and t == to_state:
			return roles
	return None


def content_hash(doc) -> str:
	data = {f: str(doc.get(f) or "") for f in MATERIAL_FIELDS}
	for table, fields in MATERIAL_TABLES.items():
		data[table] = [[str(row.get(f) or "") for f in fields] for row in doc.get(table) or []]
	return hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()


# ----------------------------------------------------------------------------------------------- guards
def required_documents_status(tax_return: str) -> dict:
	rows = frappe.get_all("Tax Document", filters={"tax_return": tax_return, "is_required": 1},
		fields=["name", "document_type", "status"])
	pending = [r for r in rows if r.status != "Verified"]
	return {"total": len(rows), "verified": len(rows) - len(pending), "pending": pending}


def _fail(msg):
	frappe.throw(msg, frappe.ValidationError, title=_("Workflow rule"))


def guard_transition(doc, old_state, new_state, comment=None):
	"""Business rules for entering `new_state`. Role checks are Frappe Workflow's job (validate_workflow)."""
	if new_state == DRAFT and old_state == DOCUMENTS_PENDING or new_state == PENDING_REVIEW and old_state == DRAFT:
		docs = required_documents_status(doc.name)
		if docs["pending"]:
			_fail(_("{0} of {1} required documents are not verified yet: {2}").format(
				len(docs["pending"]), docs["total"], ", ".join(sorted({p.document_type for p in docs["pending"]}))))

	if new_state == DRAFT and old_state == DOCUMENTS_PENDING and doc.get("tax_engagement"):
		from pakistan_tax_consultancy.services.billing import work_may_start

		engagement = frappe.get_doc("Tax Engagement", doc.tax_engagement)
		if not work_may_start(engagement):
			_fail(_("Preparation starts after the fee is paid (see Firm Website Settings → Start Work Before Payment)."))

	if new_state == PENDING_REVIEW and old_state == DRAFT:
		from pakistan_tax_consultancy.services.tax_calc import is_calculation_current
		missing = [label for field, label in (("tax_client", _("Client")), ("tax_year", _("Tax Year")),
			("taxpayer_type", _("Taxpayer Type"))) if not doc.get(field)]
		if not doc.get("income_sources"):
			missing.append(_("at least one income source"))
		# final / separate-block income is taxed at its own rate; without one it adds no tax while its withholding still
		# counts as paid, which understates the tax (caught in an end-to-end test with bank profit)
		no_rate = [r.income_category for r in doc.get("income_sources") or []
			if r.tax_treatment in ("Final / Fixed", "Separate Block") and not flt(r.tax_rate_percent) and flt(r.gross_amount)]
		if no_rate:
			missing.append(_("the tax rate for {0} (final / separate-block income)").format(", ".join(sorted(set(no_rate)))))
		if missing:
			_fail(_("Complete these before review: {0}").format(", ".join(missing)))
		if not is_calculation_current(doc):
			_fail(_("Recalculate the tax: the figures changed since the last calculation."))

	if new_state == CHANGES_REQUIRED and not (comment or doc.flags.workflow_comment):
		_fail(_("Add a comment explaining what needs to change."))

	if new_state == PENDING_REVIEW and old_state in REVIEWED_STATES and not doc.flags.auto_reopened \
			and not (comment or doc.flags.workflow_comment):
		_fail(_("Say why the reviewed return is being reopened."))

	if new_state == REVIEWED:
		review = frappe.db.get_value("Tax Review", {"tax_return": doc.name}, ["name", "calculation_verified"],
			as_dict=True, order_by="creation desc")
		if not review:
			_fail(_("Record a Tax Review (with its checklist) before marking the return reviewed."))
		open_items = frappe.db.sql("""select count(*) from `tabTax Review Checklist Item`
			where parent = %s and ifnull(result, '') in ('', 'Fail')""", review.name)[0][0]
		if open_items or not cint(review.calculation_verified):
			_fail(_("Complete the review checklist and verify the calculation first."))

	if new_state == AWAITING_CLIENT:
		# a client without a portal account confirms by phone / in person and staff record it (services/on_behalf.py)
		doc.client_confirmed = 0
		doc.client_confirmed_on = doc.client_confirmed_by = doc.client_confirmed_ip = None
		doc.client_confirmed_via = doc.client_confirmation_method = doc.client_confirmation_note = doc.client_confirmation_proof = None

	if new_state == APPROVED:
		if not cint(doc.client_confirmed):
			_fail(_("The client has not confirmed the return summary yet."))
		if doc.client_confirmed_via == "On behalf" and doc.client_confirmed_by == frappe.session.user:
			_fail(_("You recorded the client's confirmation, so someone else must approve this return."))
		doc.approval_status = "Approved"
		doc.approved_by = frappe.session.user
		doc.approved_on = now_datetime()
		doc.approved_content_hash = content_hash(doc)

	if new_state == SUBMITTED:
		if doc.approval_status != "Approved" or doc.approved_content_hash != content_hash(doc):
			_fail(_("Only an approved, unchanged return can be filed."))

	if new_state == ACKNOWLEDGED:
		if not (doc.get("iris_acknowledgment_no") or "").strip() or not doc.get("fbr_receipt"):
			_fail(_("Enter the IRIS acknowledgment number and attach the FBR receipt — a return is never marked filed without evidence."))
		doc.fbr_submission_status = "Acknowledged"

	if new_state == FILING_ERROR and not (doc.get("filing_error_notes") or "").strip():
		_fail(_("Describe the filing error in Filing Error Notes."))


def apply_material_change_rules(doc, before):
	"""Cancel approval when signed-off figures change; never let a filed return change."""
	if not before:
		return
	old_state = before.workflow_state
	if content_hash(before) == content_hash(doc):
		return
	if old_state in LOCKED_STATES or old_state == FILING_ERROR:
		_fail(_("This return was filed and can no longer change. Create a revised return instead."))
	if old_state in REVIEWED_STATES and doc.workflow_state == old_state:
		doc.workflow_state = PENDING_REVIEW
		doc.approval_status = "Invalidated" if old_state == APPROVED else doc.approval_status
		doc.approved_content_hash = None
		doc.client_confirmed = 0
		doc.flags.workflow_comment = _("Figures changed after {0}; sent back for review automatically.").format(old_state)
		doc.flags.auto_reopened = True
		frappe.msgprint(doc.flags.workflow_comment, indicator="orange", alert=True)
		for name in frappe.get_all("Tax Approval", {"tax_return": doc.name, "is_valid": 1}, pluck="name"):
			frappe.db.set_value("Tax Approval", name, {"is_valid": 0, "invalidated_on": now_datetime(),
				"invalidation_reason": doc.flags.workflow_comment})
