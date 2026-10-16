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


def issue(mobile: str, purpose: str = "Signup") -> str:
	"""Create an OTP and send it by SMS. Returns the OTP Request name (never the code)."""
	from pakistan_tax_consultancy.services.sms import send_sms

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
	send_sms(mobile, _("Your verification code is {0}. It expires in {1} minutes.").format(code, expiry))
	return req.name


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
