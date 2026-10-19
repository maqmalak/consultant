"""Staff acting for a client who does not use the portal: entering "What the client told us" and recording the
client's confirmation of the return summary. Every action names who did it, how the client agreed, and is audited."""

import frappe
from frappe import _
from frappe.utils import now_datetime

from pakistan_tax_consultancy.audit import log_event
from pakistan_tax_consultancy.services import workflow as wf

# every team role may act for a client (record scope still applies: a consultant or field officer reaches only their own clients)
ROLES = {"System Manager", "Tax Admin", "Tax Consultant", "Tax Reviewer", "Tax Approver", "Filing Officer", "Field Officer",
	"Data Entry Officer"}
DETAILS_STATES = (wf.DOCUMENTS_PENDING, wf.DRAFT, wf.CHANGES_REQUIRED)
METHODS = ("Phone call", "WhatsApp", "In person", "Email", "Signed letter")


def can_act(user=None) -> bool:
	user = user or frappe.session.user
	return user == "Administrator" or bool(set(frappe.get_roles(user)) & ROLES)


def _return(tax_return):
	if not can_act():
		frappe.throw(_("Only team members can act for a client."), frappe.PermissionError)
	doc = frappe.get_doc("Tax Return", tax_return)
	if not doc.has_permission("read"):  # record scope: a consultant only reaches their own clients
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	return doc


def save_details(tax_return, details):
	from pakistan_tax_consultancy.services.client_details import clean

	doc = _return(tax_return)
	if doc.workflow_state not in DETAILS_STATES:
		frappe.throw(_("The client's details can only be changed while the return is in preparation."))
	data = clean(frappe.parse_json(details) if isinstance(details, str) else details or {})
	frappe.db.set_value("Tax Return", doc.name, {"client_details": frappe.as_json(data), "client_details_updated_on": now_datetime(),
		"client_details_entered_by": frappe.session.user}, update_modified=False)
	log_event("Update", doc, details={"client_details": "entered on behalf of the client",
		"sections": {k: len(v) for k, v in data.items() if isinstance(v, list) and v}})
	return data


def save_answers(tax_return, answers):
	"""The questionnaire answered for the client; rebuilds the document checklist like the portal does."""
	from frappe.utils import cint

	from pakistan_tax_consultancy.api.portal import QUESTIONS
	from pakistan_tax_consultancy.services.checklist import generate_checklist

	doc = _return(tax_return)
	if doc.workflow_state not in DETAILS_STATES:
		frappe.throw(_("The questionnaire can only be changed while the return is in preparation."))
	answers = frappe.parse_json(answers) if isinstance(answers, str) else answers or {}
	changed = {q: cint(answers[q]) for q in QUESTIONS if q in answers and cint(answers[q]) != cint(doc.get(q))}
	for q, v in changed.items():
		doc.set(q, 1 if v else 0)
	doc.save(ignore_permissions=True)  # role and record scope checked above; only the yes/no answers change
	required = generate_checklist(doc)
	log_event("Update", doc, details={"questionnaire": "answered on behalf of the client", "changed": changed})
	return {"required_documents": required}


def confirm(tax_return, method, note):
	"""An optional proof (call screenshot, signed letter …) arrives as the request's multipart file."""
	doc = _return(tax_return)
	if doc.workflow_state != wf.AWAITING_CLIENT:
		frappe.throw(_("The return is not waiting for the client's confirmation."))
	if frappe.utils.cint(doc.client_confirmed):
		frappe.throw(_("The client has already confirmed this return."))
	if method not in METHODS:
		frappe.throw(_("Say how the client confirmed: {0}.").format(", ".join(METHODS)))
	note = (note or "").strip()
	if len(note) < 10:
		frappe.throw(_("Add a short note: who you spoke to, when, and what they agreed to."))
	proof = None
	request = getattr(frappe.local, "request", None)  # unbound outside a web request (console, tests)
	if request is not None and (getattr(request, "files", None) or {}).get("file"):
		from pakistan_tax_consultancy.services.files import attach_private, read_upload

		proof = attach_private("Tax Return", doc.name, "client_confirmation_proof", *read_upload())
	doc.client_confirmed = 1
	doc.client_confirmed_on = now_datetime()
	doc.client_confirmed_by = frappe.session.user
	doc.client_confirmed_ip = getattr(frappe.local, "request_ip", None)
	doc.client_confirmed_via = "On behalf"
	doc.client_confirmation_method = method
	doc.client_confirmation_note = note[:1000]
	doc.client_confirmation_proof = proof
	doc.save(ignore_permissions=True)  # role and record scope checked above
	log_event("Approval", doc, details={"client_confirmed": True, "on_behalf": True, "method": method,
		"proof": bool(proof), "content_hash": doc.content_hash})
	doc.add_comment("Comment", frappe.utils.escape_html(
		_("Client confirmation recorded on their behalf by {0} ({1}): {2}").format(frappe.utils.get_fullname(), method, note)))
	from pakistan_tax_consultancy.services.notify import send, users_with_role

	send([doc.approver] if doc.approver else users_with_role("Tax Approver"),
		_("Client confirmed {0} (recorded by staff) — ready for approval").format(doc.name), f"<p>{doc.client_name} · {doc.tax_year}</p>", doc)
	return {"confirmed": True}
