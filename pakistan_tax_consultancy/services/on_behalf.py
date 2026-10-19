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
PREPARATION = (wf.DOCUMENTS_PENDING, wf.DRAFT, wf.CHANGES_REQUIRED)
# the team may change what the client told us until the return is submitted to FBR; the figures only change when the
# consultant copies the details in (preparation only), so a late edit never alters an approved return — it is flagged
EDIT_STATES = (*PREPARATION, wf.PENDING_REVIEW, wf.UNDER_REVIEW, wf.REVIEWED, wf.AWAITING_CLIENT, wf.APPROVED)
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


def _check_editable(doc):
	if doc.workflow_state not in EDIT_STATES:
		frappe.throw(_("The return is already submitted to FBR — client data can no longer be changed."))


def _flag_late(doc, what):
	"""A change after preparation: leave a comment and tell the consultant (and reviewer) to check the return."""
	if doc.workflow_state in PREPARATION:
		return
	msg = _("{0} changed by {1} while the return is “{2}” — check whether the return needs changes.").format(
		what, frappe.utils.get_fullname(), doc.workflow_state)
	doc.add_comment("Comment", frappe.utils.escape_html(msg))
	from pakistan_tax_consultancy.services.notify import send

	to = [u for u in {doc.assigned_consultant, doc.reviewer} if u and u != frappe.session.user]
	if to:
		send(to, _("Client data changed on {0}").format(doc.name), f"<p>{frappe.utils.escape_html(msg)}</p>", doc)


def save_details(tax_return, details):
	from pakistan_tax_consultancy.services.client_details import clean

	doc = _return(tax_return)
	_check_editable(doc)
	data = clean(frappe.parse_json(details) if isinstance(details, str) else details or {})
	frappe.db.set_value("Tax Return", doc.name, {"client_details": frappe.as_json(data), "client_details_updated_on": now_datetime(),
		"client_details_entered_by": frappe.session.user}, update_modified=False)
	log_event("Update", doc, details={"client_details": "entered on behalf of the client",
		"sections": {k: len(v) for k, v in data.items() if isinstance(v, list) and v}})
	_flag_late(doc, _("What the client told us"))
	return data


def save_answers(tax_return, answers):
	"""The questionnaire answered for the client; rebuilds the document checklist like the portal does."""
	from frappe.utils import cint

	from pakistan_tax_consultancy.api.portal import QUESTIONS
	from pakistan_tax_consultancy.services.checklist import generate_checklist

	doc = _return(tax_return)
	_check_editable(doc)
	answers = frappe.parse_json(answers) if isinstance(answers, str) else answers or {}
	changed = {q: cint(answers[q]) for q in QUESTIONS if q in answers and cint(answers[q]) != cint(doc.get(q))}
	for q, v in changed.items():
		doc.set(q, 1 if v else 0)
	doc.save(ignore_permissions=True)  # role and record scope checked above; only the yes/no answers change
	required = generate_checklist(doc)
	log_event("Update", doc, details={"questionnaire": "answered on behalf of the client", "changed": changed})
	if changed:
		_flag_late(doc, _("Questionnaire"))
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


# ----------------------------------------------------------------------------------------------- documents sent on WhatsApp
WA_TYPES = {"application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png"}


def _client_files_query(tax_client):
	return frappe.db.sql("""select m.name, m.message, m.attach, m.mime_type, coalesce(m.timestamp, m.creation) as at
		from `tabWhatsApp Message` m join `tabClient Conversation` c on c.name = m.`to`
		where c.tax_client = %s and m.direction = 'Incoming' and ifnull(m.attach, '') != ''
		order by at desc limit 40""", tax_client, as_dict=True)


def _file(attach, message):
	"""The File attached to this message (identical files share a URL, so match the message first)."""
	fields = ["name", "file_name", "file_size"]
	return frappe.db.get_value("File", {"attached_to_doctype": "WhatsApp Message", "attached_to_name": message, "file_url": attach}, fields, as_dict=True) \
		or frappe.db.get_value("File", {"file_url": attach}, fields, as_dict=True) or frappe.db.get_value("File", attach, fields, as_dict=True)


def whatsapp_files(tax_client):
	from pakistan_tax_consultancy.permissions import can_access_client

	if not can_act() or not can_access_client(tax_client):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	used = dict(frappe.get_all("Tax Document", {"tax_client": tax_client, "whatsapp_message": ("is", "set")},
		["whatsapp_message", "document_type"], as_list=True))
	out = []
	for m in _client_files_query(tax_client):
		f = _file(m.attach, m.name)
		if not f:
			continue
		out.append({"message": m.name, "caption": (m.message or "").strip()[:140], "file_name": f.file_name, "size": f.file_size,
			"mime_type": m.mime_type, "at": str(m.at), "ago": frappe.utils.pretty_date(m.at),
			"supported": (m.mime_type or "").split(";")[0] in WA_TYPES or (f.file_name or "").lower().rsplit(".", 1)[-1] in ("pdf", "jpg", "jpeg", "png"),
			"used_for": used.get(m.name)})
	return out


def attach_from_whatsapp(tax_document, message):
	"""Copy a file the client sent on WhatsApp onto a checklist item, as if they had uploaded it in the portal."""
	from frappe.utils import getdate

	from pakistan_tax_consultancy.permissions import can_access_client
	from pakistan_tax_consultancy.services.files import ALLOWED, attach_private, max_bytes

	doc = frappe.get_doc("Tax Document", tax_document)
	if not can_act() or not can_access_client(doc.tax_client):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	if doc.status == "Verified":
		frappe.throw(_("{0} is already verified.").format(doc.document_type))
	if message not in {m.name for m in _client_files_query(doc.tax_client)}:
		frappe.throw(_("That WhatsApp file was not sent by this client."), frappe.PermissionError)
	if doc.tax_return:
		_check_editable(frappe.get_doc("Tax Return", doc.tax_return))
	f = _file(frappe.db.get_value("WhatsApp Message", message, "attach"), message)
	if not f:
		frappe.throw(_("The WhatsApp file is no longer available."))
	content = frappe.get_doc("File", f.name).get_content()
	if isinstance(content, str):
		content = content.encode()
	name = (f.file_name or "whatsapp").replace("/", "_")
	ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
	if ext == "jpeg":
		ext = "jpg"
	if ext not in ALLOWED or not any(content.startswith(sig) for sig in ALLOWED[ext]):
		frappe.throw(_("Only PDF, JPG or PNG files can be attached — ask the client to send a photo or PDF."))
	if len(content) > max_bytes():
		frappe.throw(_("File is larger than {0} MB.").format(max_bytes() // (1024 * 1024)))
	doc.file = attach_private("Tax Document", doc.name, "file", name, content)
	doc.status = "Pending"
	doc.rejection_reason = None
	doc.uploaded_by = frappe.session.user
	doc.upload_date = getdate()
	doc.is_client_upload = 0
	doc.received_via = "WhatsApp"
	doc.whatsapp_message = message
	doc.save(ignore_permissions=True)
	log_event("Update", doc, details={"upload": name, "bytes": len(content), "received_via": "WhatsApp", "whatsapp_message": message})
	return {"name": doc.name, "status": doc.status}
