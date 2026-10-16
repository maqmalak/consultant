"""Client self-registration with mobile OTP, email verification and session info.

Login, logout and password reset use Frappe's own endpoints (session cookies, built-in rate limits):
  POST /api/method/login · GET /api/method/logout · POST frappe.core.doctype.user.user.reset_password
"""

import frappe
from frappe import _
from frappe.rate_limiter import rate_limit
from frappe.utils import cint, get_url, now_datetime
from frappe.utils.password import update_password

from pakistan_tax_consultancy.services import otp
from pakistan_tax_consultancy.utils.validators import normalize_cnic, normalize_email, normalize_mobile

CLIENT_TYPES = ("Individual-Salaried", "Individual-Business", "AOP", "Company", "Other")
STAFF_ROLES = ("System Manager", "Tax Admin", "Tax Consultant", "Tax Reviewer", "Tax Approver", "Filing Officer",
	"Field Officer")


def _mobile(value):
	try:
		return normalize_mobile(value)
	except ValueError as e:
		frappe.throw(_(str(e)))


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=10, seconds=60 * 60)
def request_otp(mobile: str, purpose: str = "Signup"):
	mobile = _mobile(mobile)
	if purpose == "Signup" and frappe.db.exists("Tax Client", {"mobile_e164": mobile, "portal_user": ("is", "set")}):
		frappe.throw(_("An account already exists for this mobile number. Please sign in."))
	return {"request": otp.issue(mobile, purpose if purpose in ("Signup", "Verify") else "Signup")}


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=20, seconds=60 * 60)
def verify_otp(request: str, mobile: str, code: str):
	if not otp.verify(request, mobile, code):
		frappe.throw(_("The code is wrong or has expired. Request a new one."))
	return {"verified": True}


def _check_password(password, full_name, email):
	from frappe.core.doctype.user.user import test_password_strength

	if len(password or "") < 8:
		frappe.throw(_("Use at least 8 characters for your password."))
	result = test_password_strength(password, user_data=(full_name, email))
	if result and not (result.get("feedback") or {}).get("password_policy_validation_passed", True):
		frappe.throw(_("Choose a stronger password."))


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=5, seconds=60 * 60)
def signup(full_name: str, mobile: str, email: str, password: str, client_type: str, otp_request: str,
		consent: int = 0, cnic: str | None = None, city: str | None = None):
	from pakistan_tax_consultancy.audit import log_event
	from pakistan_tax_consultancy.services import notify

	if not cint(frappe.db.get_single_value("Tax Consultancy Settings", "allow_self_signup")):
		frappe.throw(_("Online registration is closed. Please contact our office."))
	if not cint(consent):
		frappe.throw(_("Please accept the privacy policy and terms to continue."))
	full_name = (full_name or "").strip()[:140]
	email = normalize_email(email)
	mobile = _mobile(mobile)
	if not full_name or not email:
		frappe.throw(_("Name and email are required."))
	if client_type not in CLIENT_TYPES:
		frappe.throw(_("Choose your client type."))
	try:
		cnic = normalize_cnic(cnic) if cnic else None
	except ValueError as e:
		frappe.throw(_(str(e)))
	if not otp.is_verified(otp_request, mobile):
		frappe.throw(_("Verify your mobile number first."))
	if frappe.db.exists("User", email):
		frappe.throw(_("An account with this email already exists. Please sign in or reset your password."))
	_check_password(password, full_name, email)

	# an office record with this (OTP-verified) mobile and no portal account is claimed instead of duplicated
	existing = frappe.db.get_value("Tax Client", {"mobile_e164": mobile}, ["name", "portal_user"], as_dict=True)
	if existing and existing.portal_user:
		frappe.throw(_("An account already exists for this mobile number. Please sign in."))
	if cnic and not existing:
		from pakistan_tax_consultancy.pakistan_income_tax_consultancy.doctype.tax_client.tax_client import cnic_hash

		if frappe.db.exists("Tax Client", {"cnic_hash": cnic_hash(cnic)}):
			frappe.throw(_("We already have a client with this CNIC. Please call our office to activate your account."))

	first, _sp, last = full_name.partition(" ")
	user = frappe.get_doc({"doctype": "User", "email": email, "first_name": first, "last_name": last,
		"mobile_no": mobile, "user_type": "Website User", "send_welcome_email": 0, "enabled": 1,
		"roles": [{"role": "Client"}]})
	user.flags.ignore_permissions = True
	user.insert()
	update_password(user.name, password)

	if existing:
		client = frappe.get_doc("Tax Client", existing.name)
		client.portal_user = user.name
	else:
		client = frappe.get_doc({"doctype": "Tax Client", "client_name": full_name, "client_type": client_type,
			"registration_source": "Self Registration", "cnic": cnic, "email": email, "mobile": mobile, "city": city,
			"status": "Active", "portal_user": user.name,
			"assigned_consultant": frappe.db.get_single_value("Tax Consultancy Settings", "default_consultant")})
	client.update({"consent_given": 1, "mobile_verified": 1})
	client.flags.ignore_permissions = True
	client.save()
	log_event("Create", client, details={"self_signup": True, "claimed_existing": bool(existing)})
	notify.new_registration(client)
	send_email_verification(user.name)

	frappe.local.login_manager.login_as(user.name)
	return {"user": user.name, "client": client.name, "home": "/portal"}


def send_email_verification(user: str):
	key = frappe.generate_hash(length=32)
	frappe.cache.set_value(f"ptc:verify-email:{key}", user, expires_in_sec=48 * 3600)
	link = get_url(f"/api/method/pakistan_tax_consultancy.api.auth.verify_email?key={key}")
	from pakistan_tax_consultancy.services.notify import sendmail

	sendmail(recipients=[user], subject=_("Verify your email address"),
		message=_("<p>Please confirm your email address:</p><p><a href='{0}'>Verify email</a></p>").format(link))


@frappe.whitelist(allow_guest=True, methods=["GET"])
@rate_limit(limit=20, seconds=60 * 60)
def verify_email(key: str):
	user = frappe.cache.get_value(f"ptc:verify-email:{key}")
	if user:
		frappe.cache.delete_value(f"ptc:verify-email:{key}")
		for name in frappe.get_all("Tax Client", {"portal_user": user}, pluck="name"):
			frappe.db.set_value("Tax Client", name, "email_verified", 1)
	frappe.local.response["type"] = "redirect"
	frappe.local.response["location"] = "/portal?email_verified=" + ("1" if user else "0")


@frappe.whitelist(methods=["POST"])
@rate_limit(limit=3, seconds=60 * 60)
def resend_email_verification():
	send_email_verification(frappe.session.user)
	return {"sent": True}


@frappe.whitelist(allow_guest=True, methods=["GET"])
def whoami():
	user = frappe.session.user
	if user == "Guest":
		return {"user": "Guest", "roles": [], "home": "/portal/login"}
	roles = frappe.get_roles(user)
	is_staff = user == "Administrator" or bool(set(roles) & set(STAFF_ROLES))
	client = frappe.db.get_value("Tax Client", {"portal_user": user}, ["name", "client_name", "email_verified",
		"mobile_verified"], as_dict=True)
	return {"user": user, "full_name": frappe.utils.get_fullname(user), "roles": roles, "is_staff": is_staff,
		"client": client, "home": "/portal/staff" if is_staff else "/portal", "server_time": str(now_datetime())}
