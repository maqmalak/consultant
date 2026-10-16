"""WhatsApp updates through Meta's WhatsApp Cloud API (template messages only).

Business-initiated WhatsApp messages must use templates approved in WhatsApp Manager, and are sent only to clients
who opted in (Tax Client.whatsapp_opt_in). Each event below names its template field in Portal Integration Settings
and the body parameters it fills, in order — create the template in WhatsApp Manager with the same number of
{{1}} {{2}} … placeholders.
"""

import frappe
import requests
from frappe import _
from frappe.utils import cint, now_datetime

from pakistan_tax_consultancy.utils.validators import digits_only, normalize_mobile

CLOUD_API = "WhatsApp Cloud API (Meta)"
EVENTS = {
	# event: (settings field, parameter names shown to the admin)
	"ready_for_confirmation": ("wa_tpl_ready_for_confirmation", ["client name", "tax year"]),
	"document_rejected": ("wa_tpl_document_rejected", ["client name", "document", "reason"]),
	"documents_reminder": ("wa_tpl_documents_reminder", ["client name", "number of documents"]),
	"filed": ("wa_tpl_filed", ["client name", "tax year", "IRIS acknowledgment no."]),
	"payment_received": ("wa_tpl_payment_received", ["client name", "amount"]),
	"deadline": ("wa_tpl_deadline", ["client name", "tax year", "due date"]),
}


def settings():
	return frappe.get_cached_doc("Portal Integration Settings")


def is_active(s=None) -> bool:
	s = s or settings()
	return s.whatsapp_provider == CLOUD_API and cint(s.whatsapp_enabled) and (bool(s.wa_phone_number_id) or cint(s.wa_mock_mode))


def _post(s, payload):
	if cint(s.wa_mock_mode):
		from pakistan_tax_consultancy.services.wa_inbox import fake_response

		return fake_response("POST", "/messages", payload)
	token = s.get_password("wa_access_token", raise_exception=False)
	if not token:
		frappe.throw(_("Add the WhatsApp access token first."))
	url = f"https://graph.facebook.com/{s.wa_api_version or 'v21.0'}/{s.wa_phone_number_id}/messages"
	resp = requests.post(url, json=payload, headers={"Authorization": f"Bearer {token}"}, timeout=20)
	data = resp.json() if resp.content else {}
	if resp.status_code >= 300:
		message = (data.get("error") or {}).get("message") or resp.text[:300]
		frappe.throw(_("WhatsApp refused the message: {0}").format(message), title=_("WhatsApp"))
	return data


def template_payload(to: str, template: str, language: str, params: list) -> dict:
	payload = {"messaging_product": "whatsapp", "to": digits_only(normalize_mobile(to)), "type": "template",
		"template": {"name": template, "language": {"code": language or "en"}}}
	if params:
		payload["template"]["components"] = [{"type": "body",
			"parameters": [{"type": "text", "text": str(p)[:1000]} for p in params]}]
	return payload


def send_template_now(to: str, template: str, params: list | None = None) -> dict:
	s = settings()
	return _post(s, template_payload(to, template, s.wa_language, params or []))


def _job(to, template, params, reference):
	try:
		data = send_template_now(to, template, params)
		from pakistan_tax_consultancy.services.wa_inbox import log_template_message

		client = reference.split(" ", 1)[-1] if reference else None
		text = f"📄 {template}: " + " · ".join(str(p) for p in params or [])
		log_template_message(to, text, (data.get("messages") or [{}])[0].get("id"), client)
		frappe.db.commit()
	except Exception:
		frappe.log_error(title=f"WhatsApp update failed ({reference})")


def notify_client(tax_client: str, event: str, params: list):
	"""Queue a template message to the client if WhatsApp is set up, the template exists and the client opted in."""
	s = settings()
	if not is_active(s) or event not in EVENTS:
		return False
	template = s.get(EVENTS[event][0])
	if not template:
		return False
	client = frappe.db.get_value("Tax Client", tax_client, ["mobile_e164", "whatsapp_opt_in"], as_dict=True)
	if not client or not cint(client.whatsapp_opt_in) or not client.mobile_e164:
		return False
	frappe.enqueue(_job, queue="short", enqueue_after_commit=True, to=client.mobile_e164, template=template,
		params=params, reference=f"{event} {tax_client}")
	return True


def test(to: str, template: str = "hello_world") -> str:
	"""Send Meta's sample template (or any approved one without parameters) and record the result."""
	s = settings()
	try:
		data = _post(s, template_payload(to, template, "en_US" if template == "hello_world" else s.wa_language, []))
		result = _("OK {0}: message {1} accepted for {2}").format(now_datetime(),
			(data.get("messages") or [{}])[0].get("id", "?"), to)
	except Exception as e:
		result = _("FAILED {0}: {1}").format(now_datetime(), getattr(e, "message", None) or str(e))
	frappe.db.set_single_value("Portal Integration Settings", "wa_last_test", result)
	return result
