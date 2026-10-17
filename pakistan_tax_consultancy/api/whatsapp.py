"""Team WhatsApp inbox API and the Meta webhook (ported from realestate, adapted to tax clients)."""

import hashlib
import hmac
import json
import time

import frappe
from frappe import _
from frappe.utils import cint
from frappe.utils.password import get_decrypted_password
from werkzeug.wrappers import Response

from pakistan_tax_consultancy.services import wa_inbox as inbox

FIELDS = ["name", "contact_name", "phone", "tax_client", "lead", "agent", "status", "unread_count", "last_message",
	"last_message_at", "last_direction", "opted_out"]


def _guard():
	inbox.access_guard()
	if frappe.session.user == "Guest":
		frappe.throw(_("Not permitted"), frappe.PermissionError)


@frappe.whitelist(methods=["GET"])
def get_conversations(view: str = "mine", search: str | None = None, limit: int = 100):
	_guard()
	filters = {}
	if view == "mine":
		filters.update(agent=frappe.session.user, status="Open")
	elif view == "unassigned":
		filters.update(agent=("is", "not set"), status="Open")
	elif view == "unread":
		filters["unread_count"] = (">", 0)
	elif view == "resolved":
		filters["status"] = "Resolved"
	elif view == "all":
		filters["status"] = "Open"
	or_filters = {"name": search, "contact_name": ("like", f"%{search}%"), "phone": ("like", f"%{search}%"),
		"tax_client": ("like", f"%{search}%")} if search else None
	return frappe.get_list("Client Conversation", filters=filters, or_filters=or_filters, fields=FIELDS,
		order_by="last_message_at desc", limit_page_length=min(cint(limit) or 100, 300))


@frappe.whitelist(methods=["GET"])
def get_counts():
	_guard()
	user = frappe.session.user
	q = lambda f: len(frappe.get_list("Client Conversation", filters=f, pluck="name", limit_page_length=0))  # noqa: E731
	return {"mine": q({"agent": user, "status": "Open"}), "unassigned": q({"agent": ("is", "not set"), "status": "Open"}),
		"unread": q({"unread_count": (">", 0)}), "all": q({"status": "Open"})}


@frappe.whitelist(methods=["GET"])
def get_thread(conversation: str, limit: int = 200):
	_guard()
	frappe.get_doc("Client Conversation", conversation).check_permission("read")
	rows = frappe.get_all("WhatsApp Message", {"to": conversation, "reaction": ("is", "not set")}, ["name", "direction", "message",
		"status", "timestamp", "creation", "attach", "mime_type", "is_template", "whatsapp_template", "owner", "error_message"],
		order_by="creation desc", limit=min(cint(limit) or 200, 500))
	files = {f.name: f for f in frappe.get_all("File", {"name": ("in", [r.attach for r in rows if r.attach] or [""])},
		["name", "file_url", "file_name"])}
	for r in rows:
		r.at = r.timestamp or r.creation
		f = files.get(r.attach) or (frappe.db.get_value("File", {"file_url": r.attach}, ["file_url", "file_name"], as_dict=True)
			if r.attach else None)
		if f:
			r.file_url, r.file_name = f.file_url, f.file_name
		if r.status == "Failed" and r.error_message:
			r.error = (r.error_message or "")[:200]
		r.agent = frappe.utils.get_fullname(r.owner) if r.direction == "Outgoing" and r.owner not in ("Administrator", "Guest") else None
	return list(reversed(rows))


@frappe.whitelist(methods=["GET"])
def get_context(conversation: str):
	_guard()
	conv = frappe.get_doc("Client Conversation", conversation)
	conv.check_permission("read")
	return {"mock": inbox.is_mock(), "wa_link": f"https://wa.me/{inbox.wa_id(conv.phone)}",
		"client": frappe.db.get_value("Tax Client", conv.tax_client, ["name", "client_name", "client_type", "assigned_consultant",
			"whatsapp_opt_in"], as_dict=True) if conv.tax_client else None,
		"returns": frappe.get_all("Tax Return", {"tax_client": conv.tax_client}, ["name", "tax_year", "workflow_state"],
			order_by="tax_year desc", limit=3) if conv.tax_client else []}


@frappe.whitelist(methods=["POST"])
def send(conversation: str, message: str | None = None, attach: str | None = None):
	from whatsapp.whatsapp.api.messages import send_message

	_guard()
	conv = frappe.get_doc("Client Conversation", conversation)
	conv.check_permission("write")
	if conv.opted_out:
		frappe.throw(_("This contact opted out of WhatsApp."))
	if not (message or "").strip() and not attach:
		frappe.throw(_("Type a message."))
	content_type = "text"
	if attach:
		ext = attach.rsplit(".", 1)[-1].lower()
		content_type = "image" if ext in ("png", "jpg", "jpeg", "webp", "gif") else "document"
	name = send_message(to=conv.name, message=(message or "").strip(), attach=attach, content_type=content_type,
		reference_doctype="Tax Client" if conv.tax_client else None, reference_docname=conv.tax_client)
	frappe.db.set_value("Client Conversation", conv.name, "unread_count", 0)
	return name


@frappe.whitelist(methods=["POST"])
def open_conversation(tax_client: str):
	"""The inbox chat for a client's mobile (created if they never messaged), so WhatsApp buttons open the team inbox."""
	_guard()
	client = frappe.get_doc("Tax Client", tax_client)
	client.check_permission("read")
	if not client.mobile_e164:
		frappe.throw(_("The client has no mobile number."))
	profile = inbox.profile_for(client.mobile_e164)
	conv = inbox.conversation_for_profile(profile)
	conv.tax_client = client.name
	conv.contact_name = client.client_name
	conv.agent = conv.agent or client.assigned_consultant or frappe.session.user
	conv.status = "Open"
	conv.flags.ignore_permissions = True
	conv.save()
	return conv.name


@frappe.whitelist(methods=["POST"])
def open_crm_conversation(doctype: str, name: str):
	"""The team-inbox chat for a CRM lead / deal's mobile (created if they never messaged), so WhatsApp buttons in the CRM
	open our inbox instead of wa.me."""
	_guard()
	if doctype not in ("CRM Lead", "CRM Deal"):
		frappe.throw(_("Not a CRM record."))
	doc = frappe.get_doc(doctype, name)
	doc.check_permission("read")
	mobile = doc.get("mobile_no") or doc.get("phone")
	if not mobile:
		frappe.throw(_("This record has no mobile number."))
	conv = inbox.conversation_for_profile(inbox.profile_for(mobile))
	lead = name if doctype == "CRM Lead" else doc.get("lead")
	if lead and not conv.tax_client and frappe.get_meta("Client Conversation").get_field("lead"):
		conv.lead = lead
	person = " ".join(filter(None, [doc.get("first_name"), doc.get("last_name")])) or doc.get("lead_name")
	if person and not conv.tax_client:
		conv.contact_name = person
	conv.agent = conv.agent or doc.get("lead_owner") or doc.get("deal_owner") or frappe.session.user
	conv.status = "Open"
	conv.flags.ignore_permissions = True
	conv.save()
	return conv.name


@frappe.whitelist(methods=["POST"])
def mark_read(conversation: str):
	_guard()
	frappe.get_doc("Client Conversation", conversation).check_permission("read")
	frappe.db.set_value("Client Conversation", conversation, "unread_count", 0)


@frappe.whitelist(methods=["POST"])
def assign(conversation: str, agent: str | None = None, status: str | None = None):
	_guard()
	conv = frappe.get_doc("Client Conversation", conversation)
	conv.check_permission("write")
	if agent is not None:
		conv.agent = agent or None
	if status in ("Open", "Resolved"):
		conv.status = status
	conv.save()
	if agent and agent != frappe.session.user:
		frappe.get_doc({"doctype": "Notification Log", "for_user": agent, "type": "Assignment", "document_type": "Client Conversation",
			"document_name": conv.name, "from_user": frappe.session.user,
			"subject": _("WhatsApp chat with {0} assigned to you").format(conv.contact_name)}).insert(ignore_permissions=True)


@frappe.whitelist(methods=["POST"])
def set_opted_out(conversation: str, opted_out: int):
	_guard()
	conv = frappe.get_doc("Client Conversation", conversation)
	conv.check_permission("write")
	inbox.set_opt_out(conv, cint(opted_out))


@frappe.whitelist(methods=["GET"])
def agents():
	_guard()
	users = frappe.get_all("Has Role", {"role": ("in", ["Tax Admin", "Tax Consultant", "Tax Reviewer", "Field Officer"]),
		"parenttype": "User"}, pluck="parent", distinct=True)
	return frappe.get_all("User", {"name": ("in", users or [""]), "enabled": 1}, ["name", "full_name"], order_by="full_name")


@frappe.whitelist(methods=["GET"])
def quick_replies():
	_guard()
	return frappe.get_all("Quick Reply", ["title", "shortcut", "message"], order_by="title")


# ----------------------------------------------------------------------------------------------- test mode tools
@frappe.whitelist(methods=["POST"])
def simulate_incoming(phone: str, text: str, name: str | None = None):
	"""Test mode only: pretend Meta delivered a client's message to the webhook."""
	_guard()
	if not inbox.is_mock():
		frappe.throw(_("Simulation works only in WhatsApp test mode."))
	wid = inbox.wa_id(phone)
	msg_id = f"wamid.MOCKIN{time.time_ns()}"
	phone_id = frappe.db.get_value("WhatsApp Account", inbox.ACCOUNT, "phone_id") or "MOCK-PHONE-ID"
	process_payload({"object": "whatsapp_business_account", "entry": [{"id": "MOCK", "changes": [{"field": "messages", "value": {
		"messaging_product": "whatsapp", "metadata": {"phone_number_id": phone_id, "display_phone_number": phone_id},
		"contacts": [{"profile": {"name": name or wid}, "wa_id": wid}],
		"messages": [{"from": wid, "id": msg_id, "timestamp": str(int(time.time())), "type": "text", "text": {"body": text}}]}}]}]})
	return frappe.db.get_value("WhatsApp Message", {"message_id": msg_id}, "name")


# ----------------------------------------------------------------------------------------------- webhook
def _secret(field):
	return get_decrypted_password("Portal Integration Settings", "Portal Integration Settings", field, raise_exception=False) or ""


@frappe.whitelist(allow_guest=True, methods=["GET", "POST"])
def webhook():
	"""Meta callback URL: https://<site>/api/method/pakistan_tax_consultancy.api.whatsapp.webhook (field: messages)."""
	if frappe.request.method == "GET":
		args = frappe.form_dict
		token = _secret("wa_webhook_verify_token")
		if args.get("hub.mode") == "subscribe" and token and hmac.compare_digest(args.get("hub.verify_token") or "", token):
			return Response(args.get("hub.challenge") or "", status=200, mimetype="text/plain")
		return Response("verification failed", status=403, mimetype="text/plain")
	secret = _secret("wa_app_secret")
	raw = frappe.request.get_data()
	if not secret:
		return Response("app secret not configured", status=403, mimetype="text/plain")
	expected = "sha256=" + hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
	if not hmac.compare_digest(expected, frappe.get_request_header("X-Hub-Signature-256", "")):
		return Response("bad signature", status=403, mimetype="text/plain")
	process_payload(json.loads(raw or b"{}"))
	return Response("ok", status=200, mimetype="text/plain")


def process_payload(payload):
	from whatsapp.whatsapp.webhook import _handle_messages, _handle_template_status

	from pakistan_tax_consultancy.utils.session import as_system

	with as_system():
		for entry in payload.get("entry", []):
			for change in entry.get("changes", []):
				field, value = change.get("field"), change.get("value", {})
				if field == "messages":
					_handle_messages(value)
				elif field == "message_template_status_update":
					_handle_template_status(value)
	if not frappe.flags.in_test:
		frappe.db.commit()
