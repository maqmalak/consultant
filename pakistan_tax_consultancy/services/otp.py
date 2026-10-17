"""One-time codes for mobile verification (sign-up, password reset)."""

import hashlib
import secrets

import frappe
from frappe import _
from frappe.utils import add_to_date, cint, get_datetime, now_datetime

from pakistan_tax_consultancy.utils.validators import normalize_mobile


def _hash(mobile, code):
	return hashlib.sha256(f"{mobile}:{code}:{frappe.local.conf.get('encryption_key', '')}".encode()).hexdigest()


def _settings():
	s = frappe.get_cached_doc("Tax Consultancy Settings")
	return cint(s.otp_expiry_minutes) or 10, cint(s.otp_max_attempts) or 5


CHANNELS = {"WhatsApp, then SMS": ("whatsapp", "sms"), "SMS only": ("sms",), "WhatsApp only": ("whatsapp",)}


def issue(mobile: str, purpose: str = "Signup", channel: str | None = None) -> dict:
	"""Create an OTP and deliver it (WhatsApp first, SMS as backup — per Portal Integration Settings).

	`channel="sms"` forces SMS (the client's "Send by SMS instead"). Returns the OTP Request name and the channel
	used — never the code, which is only ever stored hashed.
	"""
	try:
		mobile = normalize_mobile(mobile)
	except ValueError as e:
		frappe.throw(_(str(e)))
	expiry, _attempts = _settings()
	recent = frappe.db.count("OTP Request", {"mobile": mobile, "creation": (">", add_to_date(now_datetime(), hours=-1))})
	if recent >= 5:
		frappe.throw(_("Too many codes requested for this number. Try again in an hour."), frappe.RateLimitExceededError)
	code = f"{secrets.randbelow(1_000_000):06d}"
	req = frappe.get_doc({"doctype": "OTP Request", "mobile": mobile, "purpose": purpose, "otp_hash": _hash(mobile, code),
		"expires_at": add_to_date(now_datetime(), minutes=expiry), "ip_address": getattr(frappe.local, "request_ip", None)})
	req.insert(ignore_permissions=True)
	used = deliver(mobile, code, expiry, ("sms",) if channel == "sms" else None)
	req.db_set("channel", used or "Failed", update_modified=False)
	if not used:
		frappe.throw(_("We could not send the code right now. Please try again in a minute or call us."))
	return {"request": req.name, "channel": used}


def deliver(mobile: str, code: str, expiry: int, order: tuple | None = None) -> str | None:
	"""Try each channel in turn; returns "WhatsApp" or "SMS" for the one that took the code, else None."""
	from pakistan_tax_consultancy.services.sms import send_sms

	setting = frappe.db.get_single_value("Portal Integration Settings", "otp_channel") or "WhatsApp, then SMS"
	for ch in order or CHANNELS.get(setting, CHANNELS["WhatsApp, then SMS"]):
		try:
			if ch == "whatsapp" and _send_whatsapp(mobile, code):
				return "WhatsApp"
			if ch == "sms" and send_sms(mobile, _("Your VVS verification code is {0}. It expires in {1} minutes. Never share it.").format(code, expiry), raise_errors=True):
				return "SMS"
		except Exception:
			frappe.clear_last_message()
			continue
	return None


def whatsapp_ready() -> bool:
	s = frappe.get_single("Portal Integration Settings")
	return bool(cint(s.whatsapp_enabled) and s.whatsapp_provider == "WhatsApp Cloud API (Meta)" and s.wa_tpl_otp
		and frappe.db.get_single_value("WhatsApp Settings", "default_account"))


def _send_whatsapp(mobile: str, code: str) -> bool:
	"""The code as a Meta *Authentication* template (body {{1}} + copy-code button), sent directly — not through a
	WhatsApp Message record, so the code never sits in the team inbox or the API log in readable form."""
	import requests

	from pakistan_tax_consultancy.services.wa_inbox import is_mock, wa_id

	if not whatsapp_ready():
		return False
	s = frappe.get_single("Portal Integration Settings")
	if is_mock():
		frappe.logger("pakistan_tax_consultancy.sms", allow_site=False).warning(f"WhatsApp (test mode) code to {mobile}: {code}")
		print(f"[WhatsApp test mode] code to {mobile}: {code}", flush=True)
		return True
	ws = frappe.get_single("WhatsApp Settings")
	account = frappe.get_doc("WhatsApp Account", ws.default_account)
	base = (ws.get("whatsapp_api_url") or "https://graph.facebook.com").rstrip("/")
	version = ws.get("whatsapp_api_version") or s.wa_api_version or "v23.0"
	payload = {"messaging_product": "whatsapp", "to": wa_id(mobile), "type": "template", "template": {
		"name": s.wa_tpl_otp, "language": {"code": s.wa_language or "en"},
		"components": [{"type": "body", "parameters": [{"type": "text", "text": code}]},
			{"type": "button", "sub_type": "url", "index": "0", "parameters": [{"type": "text", "text": code}]}]}}
	r = requests.post(f"{base}/{version}/{account.phone_id}/messages", json=payload, timeout=10,
		headers={"Authorization": f"Bearer {account.get_password('access_token')}"})
	ok = r.status_code < 300
	try:
		from whatsapp.whatsapp.api.utils import log

		log("Info" if ok else "Error", "Message", f"Verification code via WhatsApp to …{mobile[-4:]}: HTTP {r.status_code}",
			account=account.name, request_data={"to": f"…{mobile[-4:]}", "template": s.wa_tpl_otp, "code": "******"},
			response_data={"status": r.status_code})
	except Exception:
		pass
	return ok


def verify(request_name: str, mobile: str, code: str) -> bool:
	_expiry, max_attempts = _settings()
	try:
		mobile = normalize_mobile(mobile)
	except ValueError:
		return False
	req = frappe.db.get_value("OTP Request", request_name, ["name", "mobile", "otp_hash", "expires_at", "attempts",
		"verified"], as_dict=True)
	if not req or req.mobile != mobile or req.verified:
		return False
	if cint(req.attempts) >= max_attempts or get_datetime(req.expires_at) < now_datetime():
		return False
	ok = secrets.compare_digest(req.otp_hash, _hash(mobile, (code or "").strip()))
	frappe.db.set_value("OTP Request", req.name, {"attempts": cint(req.attempts) + 1, "verified": 1 if ok else 0},
		update_modified=False)
	return ok


def is_verified(request_name: str, mobile: str) -> bool:
	try:
		mobile = normalize_mobile(mobile)
	except ValueError:
		return False
	return bool(frappe.db.get_value("OTP Request", {"name": request_name, "mobile": mobile, "verified": 1,
		"creation": (">", add_to_date(now_datetime(), hours=-1))}))
