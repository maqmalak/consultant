"""WhatsApp team inbox on top of the `whatsapp` app (ported from the realestate app, adapted to tax clients).

- One Client Conversation per WhatsApp number, linked to the Tax Client with that mobile (or a new ERPNext Lead),
  assigned to the client's consultant; unread counts, opt-out / opt-in keywords.
- Test mode (Portal Integration Settings.wa_mock_mode): the whatsapp app's Graph client is patched once per process;
  every call checks *this site's* setting, so other sites served by the same process are unaffected.
- The WhatsApp Account the whatsapp app sends through is kept in step with Portal Integration Settings.
"""

import time

import frappe
from frappe import _
from frappe.utils import cint, now_datetime, strip_html

ACCOUNT = "VVS WhatsApp"
APP = "pakistan_tax_consultancy"
STAFF_ROLES = {"System Manager", "Tax Admin", "Tax Consultant", "Tax Reviewer", "Tax Approver", "Filing Officer", "Field Officer"}
_installed = False


# ----------------------------------------------------------------------------------------------- test mode
def is_mock() -> bool:
	if not getattr(frappe.local, "site", None) or APP not in frappe.get_installed_apps():
		return False
	return bool(cint(frappe.db.get_single_value("Portal Integration Settings", "wa_mock_mode")))


def install_mock(**kwargs):
	"""before_request / before_job: route Graph calls to the fake responses while this site is in test mode."""
	global _installed
	if _installed:
		return
	try:
		from whatsapp.whatsapp.api.whatsapp import WhatsApp
	except ImportError:
		return
	real_request, real_upload = WhatsApp._request, WhatsApp.upload_media

	def _request(self, method, endpoint, **kw):
		if is_mock():
			return fake_response(method, endpoint, kw.get("json") or {})
		return real_request(self, method, endpoint, **kw)

	def upload_media(self, file_content, mime_type, file_name):
		if is_mock():
			return {"id": f"MOCKMEDIA{int(time.time() * 1000)}"}
		return real_upload(self, file_content, mime_type, file_name)

	WhatsApp._request, WhatsApp.upload_media = _request, upload_media
	_installed = True


def fake_response(method, endpoint, payload):
	stamp = f"{time.time_ns()}"
	if endpoint.endswith("/messages"):
		if payload.get("status") == "read":
			return {"success": True}
		return {"messaging_product": "whatsapp", "contacts": [{"input": payload.get("to"), "wa_id": payload.get("to")}],
			"messages": [{"id": f"wamid.MOCK{stamp}"}]}
	if "message_templates" in endpoint:
		return {"data": []} if method == "GET" else {"id": f"MOCKTPL{stamp}", "status": "APPROVED"}
	if method == "POST" and "components" in payload:  # template edit: Meta re-reviews; test mode approves at once
		return {"success": True, "id": endpoint, "status": "APPROVED"}
	return {"success": True, "id": f"MOCK{stamp}"}


def sync_account(settings=None):
	"""Keep the whatsapp app's WhatsApp Account (and default) in step with our settings."""
	s = settings or frappe.get_single("Portal Integration Settings")
	acc = frappe.get_doc("WhatsApp Account", ACCOUNT) if frappe.db.exists("WhatsApp Account", ACCOUNT) else frappe.new_doc("WhatsApp Account")
	token = s.get_password("wa_access_token", raise_exception=False) if s.wa_access_token else None
	acc.update({"account_name": ACCOUNT, "status": "Active", "phone_id": s.wa_phone_number_id or "MOCK-PHONE-ID",
		"business_id": s.wa_business_account_id or "MOCK-WABA-ID", "app_id": s.wa_app_id or ""})
	if token or not acc.access_token:
		acc.access_token = token or "mock-token"
	acc.flags.ignore_permissions = True
	acc.save()
	ws = frappe.get_single("WhatsApp Settings")
	if ws.default_account != acc.name:
		ws.default_account = acc.name
		ws.flags.ignore_permissions = True
		ws.save()
	return acc.name


def access_guard():
	"""whatsapp_access_guard hook: only staff use the whatsapp app's send / chat endpoints."""
	if frappe.session.user == "Administrator" or frappe.flags.ptc_system_send:
		return
	if not STAFF_ROLES & set(frappe.get_roles()):
		frappe.throw(_("Only staff can use WhatsApp."), frappe.PermissionError)


# ----------------------------------------------------------------------------------------------- matching
def phone_key(phone):
	"""Last 10 digits — matches 0300-1234567, +92 300 1234567 and 923001234567 alike."""
	digits = "".join(c for c in (phone or "") if c.isdigit())
	return digits[-10:] if len(digits) >= 10 else digits


def wa_id(phone):
	digits = "".join(c for c in phone or "" if c.isdigit())
	return "92" + digits[1:] if digits.startswith("0") else digits


def profile_for(phone, create=True):
	from whatsapp.whatsapp.api.messages import _resolve_to_profile

	key = phone_key(phone)
	if not key:
		return None
	found = frappe.db.sql("""select name from `tabWhatsApp Profile`
		where RIGHT(REGEXP_REPLACE(phone_number, '[^0-9]', ''), 10) = %s order by modified desc limit 1""", key)
	if found:
		return found[0][0]
	return _resolve_to_profile(wa_id(phone), create_if_missing=True) if create else None


def find_client(phone):
	key = phone_key(phone)
	if len(key) < 7:
		return None
	row = frappe.db.sql("""select name from `tabTax Client`
		where RIGHT(REGEXP_REPLACE(IFNULL(mobile_e164, ''), '[^0-9]', ''), 10) = %s order by modified desc limit 1""", key)
	return row[0][0] if row else None


def find_lead(phone):
	from pakistan_tax_consultancy.services import crm

	return crm.find_lead(phone)


def default_agent():
	return frappe.db.get_single_value("Tax Consultancy Settings", "default_consultant")


def profile_phone(profile):
	return frappe.db.get_value("WhatsApp Profile", profile, "phone_number")


# ----------------------------------------------------------------------------------------------- WhatsApp Message hooks
def link_party(doc, method=None):
	"""validate: tag each message with its Tax Client (or Lead) when it has no reference yet."""
	if doc.get("reference_docname") or not doc.to:
		if doc.get("reference_docname"):
			doc.flags.ptc_reference = (doc.reference_doctype, doc.reference_docname)
		return
	phone = profile_phone(doc.to)
	client = find_client(phone)
	if client:
		doc.reference_doctype, doc.reference_docname = "Tax Client", client
		doc.flags.ptc_reference = (doc.reference_doctype, doc.reference_docname)
		return
	lead = find_lead(phone)
	if not lead and doc.direction == "Incoming":
		lead = _create_lead(doc)
	if lead:
		doc.reference_doctype, doc.reference_docname = "CRM Lead", lead
		doc.flags.ptc_reference = (doc.reference_doctype, doc.reference_docname)


def _create_lead(doc):
	"""An unknown number wrote in: a Frappe CRM lead (its WhatsApp tab then shows this chat)."""
	from pakistan_tax_consultancy.services import crm

	profile = frappe.db.get_value("WhatsApp Profile", doc.to, ["profile_name", "phone_number"], as_dict=True)
	name = (profile.profile_name or "").strip() or profile.phone_number
	return crm.make_lead(name, "+" + profile.phone_number.lstrip("+"), source="WhatsApp",
		note=_("First WhatsApp message: {0}").format(strip_html(doc.message or "")[:500]))


def on_message(doc, method=None):
	"""after_insert: update the conversation, unread count, opt-out keywords; notify the consultant."""
	if doc.get("reaction") or not doc.to:
		return
	conv = conversation_for_profile(doc.to, doc)
	preview = _preview(doc)
	conv.last_message, conv.last_message_at, conv.last_direction = preview[:240], doc.timestamp or now_datetime(), doc.direction
	if doc.direction == "Incoming":
		conv.unread_count = (conv.unread_count or 0) + 1
		conv.last_incoming_at = conv.last_message_at
		conv.status = "Open"
	conv.flags.ignore_permissions = True
	conv.save()
	if doc.direction == "Incoming":
		_handle_keywords(conv, (doc.message or "").strip())
		if conv.agent:
			frappe.get_doc({"doctype": "Notification Log", "for_user": conv.agent, "type": "Alert", "document_type": "Client Conversation",
				"document_name": conv.name, "subject": _("WhatsApp from {0}: {1}").format(conv.contact_name, preview[:80])}).insert(
				ignore_permissions=True)
	frappe.publish_realtime("ptc_inbox", {"conversation": conv.name}, after_commit=True)


def conversation_for_profile(profile, msg=None):
	if frappe.db.exists("Client Conversation", profile):
		conv = frappe.get_doc("Client Conversation", profile)
	else:
		p = frappe.db.get_value("WhatsApp Profile", profile, ["phone_number", "profile_name"], as_dict=True)
		conv = frappe.get_doc({"doctype": "Client Conversation", "whatsapp_profile": profile, "phone": p.phone_number,
			"contact_name": p.profile_name or p.phone_number, "status": "Open"})
	if msg and msg.get("reference_doctype") == "Tax Client" and msg.get("reference_docname"):
		conv.tax_client = msg.reference_docname
	elif msg and msg.get("reference_doctype") == "CRM Lead" and not conv.tax_client:
		conv.lead = msg.reference_docname
	if not conv.tax_client:
		conv.tax_client = find_client(conv.phone)
	if conv.tax_client:
		c = frappe.db.get_value("Tax Client", conv.tax_client, ["client_name", "assigned_consultant", "whatsapp_opt_in"], as_dict=True)
		conv.contact_name = c.client_name
		conv.agent = conv.agent or c.assigned_consultant
	elif conv.lead and (not conv.contact_name or conv.contact_name.replace("+", "").isdigit()):
		# a number-only chat linked to a CRM lead shows the lead's name
		name = frappe.db.get_value("CRM Lead", conv.lead, "lead_name")
		conv.contact_name = name or conv.contact_name
	conv.agent = conv.agent or default_agent()
	return conv


def _preview(doc):
	if doc.is_template and doc.whatsapp_template:
		return "📄 " + doc.whatsapp_template
	if doc.media_id or doc.attach:
		return "📎 " + (strip_html(doc.message or "") or (doc.mime_type or _("Attachment")))
	return strip_html(doc.message or "")


def _keywords(field):
	return {k.strip().upper() for k in (frappe.db.get_single_value("Portal Integration Settings", field) or "").splitlines() if k.strip()}


def _handle_keywords(conv, text):
	word = text.upper().strip(" .!")
	if word in _keywords("wa_opt_out_keywords"):
		set_opt_out(conv, 1)
	elif word in _keywords("wa_opt_in_keywords"):
		set_opt_out(conv, 0)


def set_opt_out(conv, value):
	conv.db_set("opted_out", value)
	if conv.tax_client:
		frappe.db.set_value("Tax Client", conv.tax_client, {"whatsapp_opt_in": 0 if value else 1,
			"whatsapp_opt_in_on": None if value else now_datetime()})
	frappe.enqueue(send_text, enqueue_after_commit=True, profile=conv.whatsapp_profile, system=True,
		text=_("You will no longer get WhatsApp updates from us. Reply START to subscribe again.") if value
		else _("You will get WhatsApp updates about your tax return again. Reply STOP to unsubscribe."))


def send_text(profile, text, system=False, reference=None):
	"""Send a free-text message through the whatsapp app (works inside Meta's 24-hour reply window)."""
	from whatsapp.whatsapp.api.messages import send_message

	frappe.flags.ptc_system_send = system
	try:
		return send_message(to=profile, message=text, content_type="text",
			reference_doctype="Tax Client" if reference else None, reference_docname=reference)
	finally:
		frappe.flags.ptc_system_send = False


def log_template_message(phone, text, message_id, reference_client=None):
	"""Show an automatic template update in the client's inbox thread (it was sent directly, not re-sent here)."""
	profile = profile_for(phone)
	if not profile:
		return
	msg = frappe.get_doc({"doctype": "WhatsApp Message", "direction": "Outgoing", "to": profile, "message": text,
		"status": "Sent", "message_id": message_id, "timestamp": now_datetime(),
		"reference_doctype": "Tax Client" if reference_client else None, "reference_docname": reference_client})
	msg.flags.ignore_permissions = True
	msg.insert()  # inserted, not submitted: submitting is what sends
	return msg.name
