"""Staff API for the React back office. Reads go through frappe.get_list (permission hooks apply, so a consultant
only ever sees assigned clients); writes check permission explicitly before doing anything."""

import csv
import io

import frappe
from frappe import _
from frappe.model.workflow import get_transitions, has_approval_access
from frappe.utils import add_days, cint, flt, get_first_day, getdate, now_datetime

from pakistan_tax_consultancy.permissions import can_access_client, get_scope
from pakistan_tax_consultancy.services import workflow as wf
from pakistan_tax_consultancy.utils import validators as v

REVIEW_CHECKLIST = (
	"Identity, NTN and registration status verified",
	"Every income source in the documents is on the return",
	"Withholding and advance tax match the certificates and CPRs",
	"Deductions and credits are supported by documents",
	"Wealth statement reconciles (opening + income − expenses = closing)",
	"Calculation reviewed against the slab setting for the tax year",
)


def require_staff():
	if get_scope() in ("none", "client"):
		frappe.throw(_("Staff only"), frappe.PermissionError)


# ----------------------------------------------------------------------------------------------- dashboard & queues
def _readable(doctype, **kwargs):
	"""get_list for the dashboard: a role that may not read this doctype (e.g. a field officer and Tax Return) sees none."""
	if not frappe.has_permission(doctype, "read"):
		return []
	try:
		return frappe.get_list(doctype, limit_page_length=0, **kwargs)
	except frappe.PermissionError:  # can read the doctype but not a filtered field (permlevel)
		from frappe.utils.messages import clear_last_message

		clear_last_message()
		return []


@frappe.whitelist(methods=["GET"])
def dashboard():
	require_staff()
	today = getdate()
	returns = _readable("Tax Return", fields=["name", "workflow_state", "assigned_consultant", "tax_year",
		"net_tax_payable", "refund_due", "modified"])
	by_state = {}
	for r in returns:
		by_state[r.workflow_state] = by_state.get(r.workflow_state, 0) + 1
	due = {y.name: y.return_due_date for y in frappe.get_all("Tax Year", fields=["name", "return_due_date"])}
	overdue = [r for r in returns if r.workflow_state not in (wf.ACKNOWLEDGED, wf.CLOSED, wf.SUBMITTED)
		and due.get(r.tax_year) and getdate(due[r.tax_year]) < today]
	workload = {}
	for r in returns:
		if r.workflow_state not in (wf.ACKNOWLEDGED, wf.CLOSED):
			key = r.assigned_consultant or "Unassigned"
			workload[key] = workload.get(key, 0) + 1
	scope = get_scope()
	collected = 0.0
	if scope == "all":
		collected = flt(frappe.db.sql("""select sum(amount) from `tabPayment Proof`
			where status='Verified' and verified_on >= %s""", get_first_day(today))[0][0])
	return {
		"by_state": [{"state": s, "count": by_state.get(s, 0)} for s, *_ in wf.STATES],
		"total_returns": len(returns),
		"clients": len(_readable("Tax Client", pluck="name")),
		"documents_to_verify": len(_readable("Tax Document", filters={"status": "Pending"}, pluck="name")),
		"followups_due": len(_readable("Site Visit", filters={"follow_up_date": ("<=", today),
			"status": ("not in", ("Converted", "Not Interested"))}, pluck="name")),
		"overdue": len(overdue),
		"payments_to_verify": frappe.db.count("Payment Proof", {"status": "Pending"}) if scope == "all" else 0,
		"consultations_new": len(_readable("Consultation Request", filters={"status": "New"}, pluck="name")),
		"collected_this_month": collected,
		"total_payable": sum(flt(r.net_tax_payable) for r in returns),
		"total_refund": sum(flt(r.refund_due) for r in returns),
		"workload": [{"user": k, "name": frappe.utils.get_fullname(k) if k != "Unassigned" else k, "count": n}
			for k, n in sorted(workload.items(), key=lambda x: -x[1])],
		"recent": sorted(returns, key=lambda r: r.modified, reverse=True)[:8],
	}


QUEUES = {
	"documents": ("Tax Document", {"status": "Pending"}, ["name", "tax_client", "client_name", "document_type",
		"tax_return", "upload_date", "is_client_upload"]),
	"review": ("Tax Return", {"workflow_state": ("in", (wf.PENDING_REVIEW, wf.UNDER_REVIEW))}, None),
	"confirmation": ("Tax Return", {"workflow_state": wf.AWAITING_CLIENT}, None),
	"approval": ("Tax Return", {"workflow_state": wf.AWAITING_CLIENT, "client_confirmed": 1}, None),
	"filing": ("Tax Return", {"workflow_state": wf.APPROVED}, None),
	"submitted": ("Tax Return", {"workflow_state": wf.SUBMITTED}, None),
	"errors": ("Tax Return", {"workflow_state": wf.FILING_ERROR}, None),
	"preparation": ("Tax Return", {"workflow_state": ("in", (wf.DOCUMENTS_PENDING, wf.DRAFT, wf.CHANGES_REQUIRED))}, None),
	"payments": ("Payment Proof", {"status": "Pending"}, ["name", "tax_engagement", "tax_client", "client_name", "method",
		"amount", "reference", "paid_on", "proof_file", "creation"]),
	"consultations": ("Consultation Request", {"status": ("in", ("New", "Contacted", "Scheduled"))}, ["name", "full_name",
		"mobile", "email", "service", "mode", "call_preference", "preferred_date", "preferred_slot", "status", "message",
		"assigned_to", "creation"]),
	"followups": ("Site Visit", {"status": ("not in", ("Converted", "Not Interested"))}, ["name", "full_name", "mobile",
		"city", "status", "visit_date", "follow_up_date", "field_officer", "assigned_consultant"]),
}
RETURN_FIELDS = ["name", "tax_client", "client_name", "tax_year", "return_type", "workflow_state", "assigned_consultant",
	"reviewer", "net_tax_payable", "refund_due", "client_confirmed", "modified", "iris_acknowledgment_no"]


@frappe.whitelist(methods=["GET"])
def queue(name: str, search: str | None = None, start: int = 0, page_length: int = 50):
	require_staff()
	if name not in QUEUES:
		frappe.throw(_("Unknown queue"))
	doctype, filters, fields = QUEUES[name]
	or_filters = None
	if search:
		like = f"%{search.strip()}%"
		or_filters = {"name": ("like", like)}
		meta = frappe.get_meta(doctype)
		for f in ("client_name", "full_name", "mobile"):
			if meta.has_field(f):
				or_filters[f] = ("like", like)
	order = "follow_up_date asc" if name == "followups" else "modified desc"
	rows = frappe.get_list(doctype, filters=filters, or_filters=or_filters, fields=fields or RETURN_FIELDS,
		order_by=order, start=cint(start), page_length=min(cint(page_length) or 50, 200))
	if name == "payments" and get_scope() != "all":
		rows = []
	return {"rows": rows, "doctype": doctype}


# ----------------------------------------------------------------------------------------------- tax return work
def _return_for_write(tax_return):
	doc = frappe.get_doc("Tax Return", tax_return)
	if not doc.has_permission("write"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	return doc


@frappe.whitelist(methods=["GET"])
def return_progress(tax_return: str):
	"""One return's step on the 7-step client journey, with dates — the progress card beside return lists."""
	from pakistan_tax_consultancy.api.portal import STEP_OF, step_dates

	require_staff()
	doc = frappe.get_doc("Tax Return", tax_return)
	doc.check_permission("read")
	return {"name": doc.name, "tax_client": doc.tax_client, "client_name": doc.client_name, "tax_year": doc.tax_year,
		"state": doc.workflow_state, "step": STEP_OF.get(doc.workflow_state, 1), "step_dates": step_dates(doc.name, doc.tax_client),
		"problem": doc.workflow_state in (wf.CHANGES_REQUIRED, wf.FILING_ERROR),
		"net_tax_payable": doc.net_tax_payable, "refund_due": doc.refund_due, "assigned_consultant": doc.assigned_consultant}


@frappe.whitelist(methods=["GET"])
def return_overview(tax_return: str):
	from pakistan_tax_consultancy.services.checklist import checklist
	from pakistan_tax_consultancy.services.tax_calc import is_calculation_current

	doc = frappe.get_doc("Tax Return", tax_return)
	doc.check_permission("read")
	transitions = []
	try:
		# one button per action: the workflow has a row per allowed role, so a user with several roles sees repeats
		seen = {}
		for t in get_transitions(doc):
			if has_approval_access(frappe.session.user, doc, t):
				seen.setdefault((t.action, t.next_state), {"action": t.action, "next_state": t.next_state})
		transitions = list(seen.values())
	except Exception:
		transitions = []
	review = frappe.db.get_value("Tax Review", {"tax_return": doc.name}, "name", order_by="creation desc")
	from pakistan_tax_consultancy.api.portal import STEP_OF, step_dates

	return {
		"step": STEP_OF.get(doc.workflow_state, 1),
		"step_dates": step_dates(doc.name, doc.tax_client),
		"transitions": transitions,
		"checklist": checklist(doc.name),
		"documents": wf.required_documents_status(doc.name) | {"pending": None},
		"calculation_current": is_calculation_current(doc),
		"calculations": frappe.get_all("Tax Calculation", filters={"tax_return": doc.name}, order_by="creation desc",
			fields=["name", "calculation_version", "calculated_on", "calculated_by", "tax_liability", "net_payable",
				"refund_due", "rules_are_demo"], limit=10),
		"review": frappe.get_doc("Tax Review", review).as_dict() if review else None,
		"comments": frappe.get_all("Review Comment", filters={"tax_return": doc.name}, order_by="creation asc",
			fields=["name", "stage", "user", "comment", "from_client", "visible_to_client", "resolved", "creation"]),
		"filings": frappe.get_all("Filing Record", filters={"tax_return": doc.name}, order_by="creation desc",
			fields=["name", "status", "channel", "filing_datetime", "iris_acknowledgment_no", "errors"]),
		"audit": frappe.get_all("Tax Audit Event", filters={"reference_doctype": "Tax Return", "reference_name": doc.name},
			fields=["event_type", "user", "timestamp", "from_state", "to_state"], order_by="timestamp desc", limit=30),
		"engagement": frappe.db.get_value("Tax Engagement", doc.tax_engagement, ["name", "payment_status", "net_fee",
			"service_package"], as_dict=True) if doc.tax_engagement else None,
		"client": _client_card(doc),
	}


def _client_card(doc):
	"""Who the return is for and who works on it (masked identifiers only) — for the Client & year card."""
	c = frappe.db.get_value("Tax Client", doc.tax_client, ["client_name", "client_type", "business_name", "city", "province", "mobile",
		"email", "cnic_masked", "ntn", "fbr_registration_status", "registration_source", "portal_user", "whatsapp_opt_in", "creation"],
		as_dict=True) or {}
	year = frappe.db.get_value("Tax Year", doc.tax_year, ["start_date", "end_date", "return_due_date"], as_dict=True) or {}
	name = lambda u: frappe.utils.get_fullname(u) if u else None  # noqa: E731
	return {**c, "has_portal": bool(c.get("portal_user")), "client_since": c.get("creation"), "year": year,
		"team": {"consultant": name(doc.assigned_consultant), "reviewer": name(doc.get("reviewer")), "approver": name(doc.get("approver") or doc.get("approved_by")),
			"filing_officer": name(doc.get("filing_officer"))}}


@frappe.whitelist(methods=["POST"])
def calculate(tax_return: str):
	from pakistan_tax_consultancy.services.tax_calc import calculate_return

	doc = _return_for_write(tax_return)
	if doc.workflow_state not in (wf.DOCUMENTS_PENDING, wf.DRAFT, wf.CHANGES_REQUIRED, wf.PENDING_REVIEW, wf.UNDER_REVIEW):
		frappe.throw(_("The return is past review; reopen it to recalculate."))
	return calculate_return(doc)


@frappe.whitelist(methods=["POST"])
def transition(tax_return: str, action: str, comment: str | None = None):
	"""Apply a workflow action. Frappe Workflow checks the role; services/workflow.py checks the business rules."""
	doc = frappe.get_doc("Tax Return", tax_return)
	doc.check_permission("read")
	match = [t for t in get_transitions(doc) if t.action == action]
	if not match:
		frappe.throw(_("{0} is not possible from {1} for you.").format(action, doc.workflow_state), frappe.PermissionError)
	t = match[0]
	if not has_approval_access(frappe.session.user, doc, t):
		frappe.throw(_("You prepared this return, so someone else must approve it."), frappe.PermissionError)
	if comment:
		doc.flags.workflow_comment = comment.strip()[:2000]
	doc.workflow_state = t.next_state
	doc.save(ignore_permissions=True)  # role already checked above and again by validate_workflow
	return {"workflow_state": doc.workflow_state}


@frappe.whitelist(methods=["POST"])
def import_client_details(tax_return: str):
	"""Copy what the client entered into the return's schedules (replacing earlier client-sourced rows)."""
	from pakistan_tax_consultancy.services.client_details import copy_into_return

	doc = _return_for_write(tax_return)
	if doc.workflow_state not in (wf.DOCUMENTS_PENDING, wf.DRAFT, wf.CHANGES_REQUIRED):
		frappe.throw(_("Copy client details while the return is in preparation."))
	if not doc.client_details:
		frappe.throw(_("The client has not entered any details yet."))
	added = copy_into_return(doc)
	doc.save()
	return {"rows": added}


@frappe.whitelist(methods=["POST"])
def save_client_details(tax_return: str, details: str | dict):
	"""Enter or edit "What the client told us" on the client's behalf (Data Entry Officer, consultant, admin)."""
	from pakistan_tax_consultancy.services import on_behalf

	return on_behalf.save_details(tax_return, details)


@frappe.whitelist(methods=["POST"])
def save_answers_for_client(tax_return: str, answers: str | dict):
	"""Answer the questionnaire for the client (any team member, within their record scope)."""
	from pakistan_tax_consultancy.services import on_behalf

	return on_behalf.save_answers(tax_return, answers)


@frappe.whitelist(methods=["POST"])
def confirm_for_client(tax_return: str, method: str, note: str):
	"""Record that the client approved the return summary by phone, WhatsApp, in person …"""
	from pakistan_tax_consultancy.services import on_behalf

	return on_behalf.confirm(tax_return, method, note)


@frappe.whitelist(methods=["POST"])
def start_review(tax_return: str):
	"""Create (or return) the Tax Review with the standard checklist for the reviewer to tick."""
	doc = frappe.get_doc("Tax Return", tax_return)
	if not set(frappe.get_roles()) & {"Tax Reviewer", "Tax Admin", "System Manager"}:
		frappe.throw(_("Reviewers only"), frappe.PermissionError)
	existing = frappe.db.get_value("Tax Review", {"tax_return": doc.name, "return_version_hash": doc.content_hash}, "name")
	if existing:
		return existing
	review = frappe.get_doc({"doctype": "Tax Review", "tax_return": doc.name, "tax_client": doc.tax_client,
		"client_name": doc.client_name, "reviewer": frappe.session.user, "review_date": getdate(),
		"return_version_hash": doc.content_hash, "checklist": [{"check_item": c} for c in REVIEW_CHECKLIST]})
	review.insert(ignore_permissions=True)
	if not doc.reviewer:
		doc.db_set("reviewer", frappe.session.user, update_modified=False)
	return review.name


@frappe.whitelist(methods=["POST"])
def save_review(review: str, checklist: str | list, calculation_verified: int = 0, comments: str | None = None):
	r = frappe.get_doc("Tax Review", review)
	if not set(frappe.get_roles()) & {"Tax Reviewer", "Tax Admin", "System Manager"}:
		frappe.throw(_("Reviewers only"), frappe.PermissionError)
	items = frappe.parse_json(checklist) if isinstance(checklist, str) else checklist
	results = {i["check_item"]: i for i in items}
	for row in r.checklist:
		if row.check_item in results:
			row.result = results[row.check_item].get("result") or ""
			row.remarks = (results[row.check_item].get("remarks") or "")[:140]
	r.calculation_verified = cint(calculation_verified)
	r.comments = comments
	r.decision = "Reviewed" if all(row.result in ("Pass", "N/A") for row in r.checklist) and r.calculation_verified \
		else "Changes Required"
	r.save(ignore_permissions=True)
	return r.as_dict()


@frappe.whitelist(methods=["POST"])
def add_comment(tax_return: str, comment: str, visible_to_client: int = 0):
	doc = frappe.get_doc("Tax Return", tax_return)
	doc.check_permission("read")
	require_staff()
	c = frappe.get_doc({"doctype": "Review Comment", "tax_return": doc.name, "stage": doc.workflow_state,
		"user": frappe.session.user, "comment": comment.strip()[:4000], "visible_to_client": cint(visible_to_client)})
	c.insert(ignore_permissions=True)
	return c.name


@frappe.whitelist(methods=["POST"])
def regenerate_checklist(tax_return: str):
	from pakistan_tax_consultancy.services.checklist import generate_checklist

	return {"required": generate_checklist(_return_for_write(tax_return))}


@frappe.whitelist(methods=["POST"])
def upload_receipt(tax_return: str, iris_acknowledgment_no: str | None = None):
	"""Filing officer attaches the FBR receipt (private) and the IRIS acknowledgment number."""
	from pakistan_tax_consultancy.services.files import attach_private, read_upload

	doc = _return_for_write(tax_return)
	if not set(frappe.get_roles()) & {"Filing Officer", "Tax Admin", "System Manager"}:
		frappe.throw(_("Filing officers only"), frappe.PermissionError)
	if doc.workflow_state not in (wf.SUBMITTED, wf.FILING_ERROR):
		frappe.throw(_("Attach the receipt after marking the return submitted on IRIS."))
	filename, content = read_upload()
	doc.fbr_receipt = attach_private("Tax Return", doc.name, "fbr_receipt", filename, content)
	if iris_acknowledgment_no:
		doc.iris_acknowledgment_no = iris_acknowledgment_no.strip()[:60]
	doc.save(ignore_permissions=True)
	return {"fbr_receipt": bool(doc.fbr_receipt), "iris_acknowledgment_no": doc.iris_acknowledgment_no}


@frappe.whitelist(methods=["POST"])
def create_return(tax_client: str, tax_year: str, tax_engagement: str | None = None):
	if not can_access_client(tax_client) or get_scope() not in ("all", "consultant"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	doc = frappe.get_doc({"doctype": "Tax Return", "tax_client": tax_client, "tax_year": tax_year,
		"tax_engagement": tax_engagement, "return_type": "Original"})
	doc.insert()
	return doc.name


# ----------------------------------------------------------------------------------------------- documents & payments
@frappe.whitelist(methods=["POST"])
def verify_document(tax_document: str, decision: str, reason: str | None = None):
	from pakistan_tax_consultancy.services.checklist import verify

	return verify(tax_document, decision, reason)


@frappe.whitelist(methods=["POST"])
def upload_document(tax_document: str):
	from pakistan_tax_consultancy.services.files import upload_tax_document

	require_staff()
	return upload_tax_document(tax_document)


@frappe.whitelist(methods=["POST"])
def verify_payment(payment_proof: str, decision: str, reason: str | None = None):
	from pakistan_tax_consultancy.services.billing import verify_proof

	return verify_proof(payment_proof, decision, reason)


@frappe.whitelist(methods=["GET"])
def download(doctype: str, name: str, fieldname: str):
	from pakistan_tax_consultancy.services.files import stream

	require_staff()
	stream(doctype, name, fieldname)


# ----------------------------------------------------------------------------------------------- clients
@frappe.whitelist(methods=["GET"])
def search_clients(q: str = "", start: int = 0, page_length: int = 30):
	"""Search by name, CNIC, NTN, mobile or email — identifiers are normalised first."""
	require_staff()
	q = (q or "").strip()
	or_filters = None
	if q:
		or_filters = {"client_name": ("like", f"%{q}%"), "business_name": ("like", f"%{q}%"), "name": ("like", f"%{q}%")}
		digits = v.digits_only(q)
		if len(digits) == 13:
			from pakistan_tax_consultancy.pakistan_income_tax_consultancy.doctype.tax_client.tax_client import cnic_hash

			or_filters["cnic_hash"] = cnic_hash(digits)
		if digits:
			or_filters["ntn_normalized"] = ("like", f"%{digits}%")
			try:
				or_filters["mobile_e164"] = v.normalize_mobile(q)
			except ValueError:
				pass
		if "@" in q:
			or_filters["email_normalized"] = q.lower()
	rows = frappe.get_list("Tax Client", or_filters=or_filters, fields=["name", "client_name", "client_type", "cnic_masked",
		"ntn", "mobile", "email", "city", "status", "assigned_consultant", "portal_user", "fbr_registration_status",
		"registration_source"], order_by="modified desc", start=cint(start), page_length=min(cint(page_length) or 30, 200))
	attach_latest_return(rows)
	return rows


def attach_latest_return(rows):
	"""Each client's most recent return and its step on the 7-step client journey (for the circle chain)."""
	from pakistan_tax_consultancy.api.portal import STEP_OF

	if not rows:
		return
	latest = {}
	for r in frappe.get_list("Tax Return", filters={"tax_client": ("in", [c.name for c in rows])},
			fields=["name", "tax_client", "tax_year", "workflow_state", "creation"], order_by="tax_year desc, creation desc",
			limit_page_length=0):
		latest.setdefault(r.tax_client, r)
	for c in rows:
		r = latest.get(c.name)
		c["latest_return"] = r.name if r else None
		c["latest_year"] = r.tax_year if r else None
		c["latest_state"] = r.workflow_state if r else None
		# no return yet: the account step is done (0); otherwise the step the return has reached
		c["latest_step"] = STEP_OF.get(r.workflow_state, 1) if r else 0
		c["has_error"] = bool(r and r.workflow_state in (wf.FILING_ERROR, wf.CHANGES_REQUIRED))


@frappe.whitelist(methods=["GET"])
def client_overview(tax_client: str):
	client = frappe.get_doc("Tax Client", tax_client)
	client.check_permission("read")
	data = {f: client.get(f) for f in ("name", "client_name", "client_type", "status", "cnic_masked", "ntn", "strn",
		"mobile", "email", "city", "province", "business_name", "assigned_consultant", "field_officer", "portal_user",
		"customer", "fbr_registration_status", "registration_source", "consent_given", "consent_timestamp",
		"mobile_verified", "email_verified", "invited_on")}
	data["returns"] = frappe.get_list("Tax Return", filters={"tax_client": tax_client}, fields=RETURN_FIELDS,
		order_by="tax_year desc")
	if data["returns"]:
		from pakistan_tax_consultancy.api.portal import STEP_OF, step_dates

		latest = data["returns"][0]
		data["latest"] = {"name": latest.name, "tax_year": latest.tax_year, "state": latest.workflow_state,
			"step": STEP_OF.get(latest.workflow_state, 1), "step_dates": step_dates(latest.name, tax_client)}
	data["engagements"] = frappe.get_list("Tax Engagement", filters={"tax_client": tax_client}, fields=["name", "service",
		"service_package", "tax_year", "net_fee", "agreed_fee", "payment_status", "status"], order_by="creation desc")
	data["documents"] = frappe.get_list("Tax Document", filters={"tax_client": tax_client}, fields=["name",
		"document_type", "tax_year", "tax_return", "status", "upload_date"], order_by="creation desc", limit_page_length=100)
	data["messages"] = frappe.get_list("Client Message", filters={"tax_client": tax_client}, fields=["name", "message",
		"from_client", "sender", "creation"], order_by="creation asc", limit_page_length=200)
	return data


@frappe.whitelist(methods=["POST"])
def reply(tax_client: str, message: str, tax_return: str | None = None):
	from pakistan_tax_consultancy.services.notify import send

	require_staff()
	if not can_access_client(tax_client):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	msg = frappe.get_doc({"doctype": "Client Message", "tax_client": tax_client, "tax_return": tax_return,
		"sender": frappe.session.user, "from_client": 0, "message": message.strip()[:2000]})
	msg.insert(ignore_permissions=True)
	frappe.db.set_value("Client Message", {"tax_client": tax_client, "from_client": 1, "read_by_recipient": 0},
		"read_by_recipient", 1, update_modified=False)
	portal_user = frappe.db.get_value("Tax Client", tax_client, "portal_user")
	send([portal_user], _("New message from your tax consultant"), f"<p>{frappe.utils.escape_html(msg.message)}</p>", msg)
	return msg.name


@frappe.whitelist(methods=["POST"])
def invite(tax_client: str):
	"""Create (or re-enable) the client's portal user and email a link to set a password and claim the account."""
	from pakistan_tax_consultancy.audit import log_event

	client = frappe.get_doc("Tax Client", tax_client)
	if not client.has_permission("write"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	if not client.email:
		frappe.throw(_("Add the client's email address first."))
	email = client.email
	if frappe.db.exists("User", email):
		user = frappe.get_doc("User", email)
		if set(frappe.get_roles(email)) - {"Client", "All", "Guest"}:
			frappe.throw(_("{0} is a staff account and cannot be a client login.").format(email))
		user.enabled = 1
		if "Client" not in [r.role for r in user.roles]:
			user.append("roles", {"role": "Client"})
		user.flags.ignore_permissions = True
		user.save()
	else:
		first, _sp, last = (client.client_name or email).partition(" ")
		user = frappe.get_doc({"doctype": "User", "email": email, "first_name": first, "last_name": last,
			"mobile_no": client.mobile_e164, "user_type": "Website User", "send_welcome_email": 0,
			"roles": [{"role": "Client"}]})
		user.flags.ignore_permissions = True
		user.insert()
	client.portal_user = user.name
	client.invited_on = now_datetime()
	client.flags.ignore_permissions = True
	client.save()
	link = user._reset_password(send_email=False)
	from pakistan_tax_consultancy.services.notify import sendmail

	emailed = sendmail(recipients=[email], subject=_("Your client portal account"),
		message=_("<p>Assalam-o-Alaikum {0},</p><p>Your client portal is ready. Set your password here:</p>"
			"<p><a href='{1}'>{1}</a></p>").format(frappe.utils.escape_html(client.client_name), link))
	log_event("Update", client, details={"portal_invite": email, "emailed": emailed})
	# the link is returned so staff can also share it by WhatsApp when email is not set up
	return {"user": user.name, "invited_on": client.invited_on, "emailed": emailed, "link": link}


@frappe.whitelist(methods=["POST"])
def convert_visit(site_visit: str, send_invite: int = 0):
	"""Site visit -> Tax Client (+ ERPNext Customer, optional portal invite). The visit keeps its history."""
	from pakistan_tax_consultancy.audit import log_event
	from pakistan_tax_consultancy.services.billing import ensure_customer

	visit = frappe.get_doc("Site Visit", site_visit)
	if not visit.has_permission("write"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	if visit.converted_client:
		return {"tax_client": visit.converted_client, "existing": True}
	cnic = ntn = None
	digits = v.digits_only(visit.cnic_or_ntn)
	if len(digits) == 13:
		cnic = digits
	elif digits:
		ntn = visit.cnic_or_ntn
	client = frappe.get_doc({"doctype": "Tax Client", "client_name": visit.full_name, "client_type": visit.client_type,
		"registration_source": "Field Visit", "mobile": visit.mobile, "email": visit.email, "cnic": cnic, "ntn": ntn,
		"city": visit.city, "residential_address": visit.location_description, "status": "Active",
		"assigned_consultant": visit.assigned_consultant, "field_officer": visit.field_officer})
	client.insert()
	ensure_customer(client.name)
	visit.converted_client = client.name
	visit.conversion_date = getdate()
	visit.status = "Converted"
	visit.save()
	log_event("Create", client, details={"from_site_visit": visit.name})
	if cint(send_invite) and client.email:
		invite(client.name)
	return {"tax_client": client.name}


IMPORT_COLUMNS = ("client_name", "client_type", "cnic", "ntn", "mobile", "email", "city", "province", "business_name",
	"residential_address", "assigned_consultant", "fbr_registration_status")


@frappe.whitelist(methods=["POST"])
def import_clients(dry_run: int = 1, content: str | None = None):
	"""CSV import of existing office clients. dry_run=1 returns a preview with every problem and duplicate; dry_run=0
	inserts the valid, non-duplicate rows. Columns: see IMPORT_COLUMNS (header row required)."""
	from pakistan_tax_consultancy.pakistan_income_tax_consultancy.doctype.tax_client.tax_client import cnic_hash

	if get_scope() != "all" and "Tax Consultant" not in frappe.get_roles():
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	if content is None:
		files = getattr(frappe.request, "files", None) or {}
		if not files.get("file"):
			frappe.throw(_("Attach a CSV file."))
		content = files["file"].stream.read().decode("utf-8-sig")
	reader = csv.DictReader(io.StringIO(content))
	missing = {"client_name"} - set(reader.fieldnames or [])
	if missing:
		frappe.throw(_("The CSV needs a header row with at least: client_name"))
	preview, seen = [], {}
	for i, raw in enumerate(reader, start=2):
		row = {k: (raw.get(k) or "").strip() for k in IMPORT_COLUMNS}
		row["client_type"] = row["client_type"] or "Individual-Salaried"
		errors, dupes = [], []
		try:
			cnic = v.normalize_cnic(row["cnic"]) if row["cnic"] else None
			mobile = v.normalize_mobile(row["mobile"]) if row["mobile"] else None
		except ValueError as e:
			errors.append(str(e))
			cnic = mobile = None
		email = v.normalize_email(row["email"])
		if not row["client_name"]:
			errors.append(_("client_name is empty"))
		if row["client_type"] not in ("Individual-Salaried", "Individual-Business", "AOP", "Company", "Other"):
			errors.append(_("client_type must be one of Individual-Salaried, Individual-Business, AOP, Company, Other"))
		for label, field, value in (("CNIC", "cnic_hash", cnic_hash(cnic) if cnic else None),
				("mobile", "mobile_e164", mobile), ("email", "email_normalized", email),
				("NTN", "ntn_normalized", v.digits_only(row["ntn"]) or None)):
			if not value:
				continue
			hit = frappe.db.get_value("Tax Client", {field: value}, "name")
			if hit:
				dupes.append(f"{label} matches {hit}")
			if (field, value) in seen:
				dupes.append(f"{label} repeats row {seen[(field, value)]}")
			seen.setdefault((field, value), i)
		status = "error" if errors else "duplicate" if dupes else "ok"
		preview.append({"row": i, "client_name": row["client_name"], "status": status, "errors": errors,
			"duplicates": dupes})
		if status == "ok" and not cint(dry_run):
			doc = frappe.get_doc({"doctype": "Tax Client", **{k: row[k] for k in IMPORT_COLUMNS if row[k]},
				"client_type": row["client_type"], "registration_source": "Office", "status": "Active"})
			doc.insert()
			preview[-1]["name"] = doc.name
	return {"dry_run": cint(dry_run), "rows": preview,
		"summary": {s: sum(1 for p in preview if p["status"] == s) for s in ("ok", "duplicate", "error")}}


@frappe.whitelist(methods=["GET"])
def import_template():
	frappe.local.response.filename = "client_import_template.csv"
	frappe.local.response.filecontent = ",".join(IMPORT_COLUMNS) + "\n" + \
		"Ali Raza,Individual-Salaried,00000-0000000-1,,03001234567,ali@example.com,Lahore,Punjab,,,,\n"
	frappe.local.response.type = "download"


@frappe.whitelist(methods=["POST"])
def update_consultation(name: str, status: str | None = None, assigned_to: str | None = None, note: str | None = None):
	req = frappe.get_doc("Consultation Request", name)
	if not req.has_permission("write"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	if status:
		req.status = status
	if assigned_to is not None:
		req.assigned_to = assigned_to or None
	req.save()
	if note:
		req.add_comment("Comment", frappe.utils.escape_html(note))
	return req.as_dict()


@frappe.whitelist(methods=["GET"])
def staff_users():
	require_staff()
	roles = ("Tax Consultant", "Tax Reviewer", "Tax Approver", "Filing Officer", "Field Officer", "Data Entry Officer", "Tax Admin")
	users = frappe.get_all("Has Role", filters={"role": ("in", roles), "parenttype": "User"}, fields=["parent", "role"])
	out = {}
	for u in users:
		out.setdefault(u.parent, []).append(u.role)
	enabled = set(frappe.get_all("User", filters={"name": ("in", list(out)), "enabled": 1}, pluck="name")) if out else set()
	return [{"user": u, "name": frappe.utils.get_fullname(u), "roles": r} for u, r in out.items() if u in enabled]
