"""Admin settings for the React portal: firm details, WhatsApp, outgoing email and the payment gateway.

Tax Admin / System Manager only. Secrets are write-only: they are stored encrypted (Password fields / Email Account)
and the browser only ever learns whether one is set, never its value.
"""

import frappe
from frappe import _
from frappe.utils import cint

FIRM_FIELDS = ("firm_name", "tagline", "phone", "phone_2", "whatsapp", "whatsapp_message", "email", "address",
	"office_hours", "map_link", "map_embed_url", "years_experience", "membership_info", "brand_color", "facebook",
	"instagram", "linkedin", "youtube", "hero_headline", "hero_subtext", "announcement_enabled", "announcement_text",
	"announcement_link", "announcement_expiry", "bank_name", "bank_account_title", "bank_account_no", "bank_iban",
	"raast_id", "jazzcash_number", "jazzcash_title", "easypaisa_number", "easypaisa_title", "work_before_payment",
	"filing_deadline")
WA_FIELDS = ("whatsapp_provider", "whatsapp_enabled", "wa_phone_number_id", "wa_business_account_id", "wa_api_version",
	"wa_language", "wa_tpl_ready_for_confirmation", "wa_tpl_document_rejected", "wa_tpl_documents_reminder", "wa_tpl_filed",
	"wa_tpl_payment_received", "wa_tpl_deadline")
PAY_FIELDS = ("payment_gateway", "gateway_environment", "gateway_merchant_id", "gateway_store_id", "gateway_api_key")
EMAIL_ACCOUNT = "Firm Outgoing Email"


def require_admin():
	if frappe.session.user != "Administrator" and not set(frappe.get_roles()) & {"Tax Admin", "System Manager"}:
		frappe.throw(_("Only a Tax Admin can change settings."), frappe.PermissionError)


def _has_password(doctype, name, field):
	from frappe.utils.password import get_decrypted_password

	return bool(get_decrypted_password(doctype, name, field, raise_exception=False))


@frappe.whitelist(methods=["GET"])
def get_settings():
	from pakistan_tax_consultancy.services.whatsapp import EVENTS

	require_admin()
	firm = frappe.get_single("Firm Website Settings")
	integ = frappe.get_single("Portal Integration Settings")
	email = frappe.db.get_value("Email Account", EMAIL_ACCOUNT, ["email_id", "email_account_name", "smtp_server",
		"smtp_port", "use_tls", "use_ssl_for_outgoing", "login_id", "enable_outgoing", "service"], as_dict=True)
	return {
		"firm": {f: firm.get(f) for f in FIRM_FIELDS},
		"whatsapp": {**{f: integ.get(f) for f in WA_FIELDS},
			"has_token": _has_password("Portal Integration Settings", "Portal Integration Settings", "wa_access_token"),
			"last_test": integ.wa_last_test,
			"events": [{"field": field, "event": event, "params": params} for event, (field, params) in EVENTS.items()]},
		"email": {**(email or {}), "configured": bool(email),
			"has_password": bool(email) and _has_password("Email Account", EMAIL_ACCOUNT, "password")},
		"payment": {**{f: integ.get(f) for f in PAY_FIELDS}, "gateway_enabled": integ.gateway_enabled,
			"gateway_status": integ.gateway_status,
			"has_secret": _has_password("Portal Integration Settings", "Portal Integration Settings", "gateway_secret"),
			"has_salt": _has_password("Portal Integration Settings", "Portal Integration Settings", "gateway_salt"),
			"return_url": frappe.utils.get_url("/api/method/pakistan_tax_consultancy.api.payments.gateway_return")},
	}


def _apply(doc, data, fields):
	for f in fields:
		if f in data:
			doc.set(f, data[f])


@frappe.whitelist(methods=["POST"])
def save_firm(data: str | dict):
	require_admin()
	data = frappe.parse_json(data)
	doc = frappe.get_single("Firm Website Settings")
	_apply(doc, data, FIRM_FIELDS)
	doc.save(ignore_permissions=True)
	return get_settings()["firm"]


@frappe.whitelist(methods=["POST"])
def save_whatsapp(data: str | dict):
	require_admin()
	data = frappe.parse_json(data)
	doc = frappe.get_single("Portal Integration Settings")
	_apply(doc, data, WA_FIELDS)
	if data.get("wa_access_token"):  # write-only; blank keeps the stored token
		doc.wa_access_token = data["wa_access_token"].strip()
	if cint(doc.whatsapp_enabled) and doc.whatsapp_provider == "WhatsApp Cloud API (Meta)" and not (
			doc.wa_phone_number_id and (data.get("wa_access_token") or doc.get_password("wa_access_token", raise_exception=False))):
		frappe.throw(_("Add the Phone Number ID and access token before turning on automatic WhatsApp updates."))
	doc.save(ignore_permissions=True)
	return get_settings()["whatsapp"]


@frappe.whitelist(methods=["POST"])
def test_whatsapp(to: str, template: str = "hello_world"):
	from pakistan_tax_consultancy.services.whatsapp import test

	require_admin()
	return {"result": test(to, template or "hello_world")}


@frappe.whitelist(methods=["POST"])
def save_email(data: str | dict):
	"""Create / update the default outgoing Email Account. Frappe tests the SMTP login when it is saved."""
	require_admin()
	data = frappe.parse_json(data)
	exists = frappe.db.exists("Email Account", EMAIL_ACCOUNT)
	acc = frappe.get_doc("Email Account", EMAIL_ACCOUNT) if exists else frappe.new_doc("Email Account")
	acc.update({"email_account_name": EMAIL_ACCOUNT, "email_id": (data.get("email_id") or "").strip(),
		"service": data.get("service") or "", "enable_outgoing": 1, "default_outgoing": 1, "enable_incoming": 0,
		"smtp_server": (data.get("smtp_server") or "").strip(), "smtp_port": str(data.get("smtp_port") or "587"),
		"use_tls": cint(data.get("use_tls", 1)), "use_ssl_for_outgoing": cint(data.get("use_ssl_for_outgoing", 0)),
		"login_id_is_different": 1 if data.get("login_id") else 0, "login_id": (data.get("login_id") or "").strip() or None,
		"always_use_account_email_id_as_sender": 1, "always_use_account_name_as_sender_name": 0,
		"awaiting_password": 0})
	if data.get("password"):
		acc.password = data["password"]
	elif not exists:
		frappe.throw(_("Enter the email password (or app password)."))
	acc.flags.ignore_permissions = True
	try:
		acc.save() if exists else acc.insert()
	except Exception as e:
		frappe.db.rollback()
		frappe.throw(_("Could not connect to the mail server: {0}").format(frappe.utils.strip_html(str(e))[:300]),
			title=_("Email"))
	return get_settings()["email"]


@frappe.whitelist(methods=["POST"])
def test_email(to: str):
	require_admin()
	if not frappe.db.exists("Email Account", EMAIL_ACCOUNT):
		frappe.throw(_("Save the email account first."))
	frappe.sendmail(recipients=[to], subject=_("Test email from your tax portal"), now=True,
		message=_("<p>Outgoing email works.</p>"))
	return {"sent": True}


@frappe.whitelist(methods=["POST"])
def save_payment(data: str | dict):
	require_admin()
	data = frappe.parse_json(data)
	doc = frappe.get_single("Portal Integration Settings")
	_apply(doc, data, PAY_FIELDS)
	for f in ("gateway_secret", "gateway_salt"):
		if data.get(f):
			doc.set(f, data[f].strip())
	# online checkout is switched on only once the chosen gateway's checkout is implemented and tested
	from pakistan_tax_consultancy.services.payment_gateway import is_implemented

	doc.gateway_enabled = 1 if cint(data.get("gateway_enabled")) and is_implemented(doc.payment_gateway) else 0
	doc.gateway_status = (_("Manual payments: clients upload proof; a Tax Admin verifies it.")
		if doc.payment_gateway.startswith("Manual") else
		_("Credentials saved for {0} ({1}). Online checkout for this gateway is not built yet — choose it and we "
			"implement and test it in Sandbox first.").format(doc.payment_gateway, doc.gateway_environment)
		if not is_implemented(doc.payment_gateway) else
		_("{0} checkout {1} ({2}).").format(doc.payment_gateway, _("enabled") if doc.gateway_enabled else _("disabled"),
			doc.gateway_environment))
	doc.save(ignore_permissions=True)
	return get_settings()["payment"]
