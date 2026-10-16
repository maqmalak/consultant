"""Fees and payments: engagement pricing with promo codes, and payment-proof verification into ERPNext.

Verifying a Payment Proof creates (or reuses) the engagement's Sales Invoice and posts a Payment Entry against it,
so the books stay in ERPNext and the client sees "Paid" in the portal.
"""

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, now_datetime, nowdate

PAYMENT_MODES = {"Bank Transfer": "Bank Transfer", "Raast": "Raast", "JazzCash": "JazzCash", "Easypaisa": "Easypaisa",
	"Gateway": "Bank Transfer"}


def apply_promo(code: str | None, amount: float, service: str | None = None) -> tuple[float, str | None]:
	"""Return (discount, error)."""
	if not code:
		return 0.0, None
	promo = frappe.db.get_value("Promo Code", {"name": code.strip().upper()}, ["name", "active", "discount_type", "value",
		"valid_from", "valid_to", "max_uses", "used_count", "service"], as_dict=True)
	today = getdate()
	if not promo or not promo.active:
		return 0.0, _("This promo code is not valid.")
	if promo.valid_from and getdate(promo.valid_from) > today or promo.valid_to and getdate(promo.valid_to) < today:
		return 0.0, _("This promo code has expired.")
	if cint(promo.max_uses) and cint(promo.used_count) >= cint(promo.max_uses):
		return 0.0, _("This promo code has been fully used.")
	if promo.service and service and promo.service != service:
		return 0.0, _("This promo code is for a different service.")
	discount = flt(amount) * flt(promo.value) / 100 if promo.discount_type == "Percent" else flt(promo.value)
	return round(min(discount, flt(amount)), 2), None


def settings():
	s = frappe.get_cached_doc("Tax Consultancy Settings")
	if not (s.company and s.fee_item):
		frappe.throw(_("Set Company and Fee Item in Tax Consultancy Settings (Billing)."))
	return s


def ensure_customer(tax_client: str) -> str:
	client = frappe.get_doc("Tax Client", tax_client)
	if client.customer and frappe.db.exists("Customer", client.customer):
		return client.customer
	customer = frappe.get_doc({"doctype": "Customer", "customer_name": client.client_name,
		"customer_type": "Company" if client.client_type in ("Company", "AOP") else "Individual",
		"customer_group": frappe.db.get_single_value("Selling Settings", "customer_group") or "Individual",
		"territory": "Pakistan" if frappe.db.exists("Territory", "Pakistan") else "All Territories",
		"mobile_no": client.mobile_e164, "email_id": client.email})
	customer.insert(ignore_permissions=True)
	client.db_set("customer", customer.name, update_modified=False)
	return customer.name


def ensure_invoice(engagement) -> str:
	if engagement.sales_invoice and frappe.db.get_value("Sales Invoice", engagement.sales_invoice, "docstatus") == 1:
		return engagement.sales_invoice
	s = settings()
	fee = flt(engagement.net_fee or engagement.agreed_fee)
	if fee <= 0:
		frappe.throw(_("The engagement has no fee to invoice."))
	inv = frappe.get_doc({"doctype": "Sales Invoice", "customer": ensure_customer(engagement.tax_client),
		"company": s.company, "posting_date": nowdate(), "due_date": nowdate(), "currency": "PKR",
		"remarks": _("Professional fee — {0} ({1})").format(engagement.service, engagement.name),
		"items": [{"item_code": s.fee_item, "qty": 1, "rate": fee,
			"description": " · ".join(filter(None, [engagement.service, engagement.service_package, engagement.tax_year]))}]})
	inv.flags.ignore_permissions = True
	inv.insert()
	inv.submit()
	engagement.db_set({"sales_invoice": inv.name, "payment_status": "Invoiced"}, update_modified=False)
	return inv.name


def verify_proof(name: str, decision: str, reason: str | None = None) -> dict:
	from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry

	from pakistan_tax_consultancy.audit import log_event
	from pakistan_tax_consultancy.permissions import get_scope
	from pakistan_tax_consultancy.services import notify

	roles = set(frappe.get_roles())
	if get_scope() != "all" or not roles & {"Tax Admin", "System Manager"}:
		frappe.throw(_("Only a Tax Admin can verify payments."), frappe.PermissionError)
	proof = frappe.get_doc("Payment Proof", name)
	if proof.status != "Pending":
		frappe.throw(_("This payment proof was already {0}.").format(proof.status.lower()))
	if decision == "Rejected":
		if not (reason or "").strip():
			frappe.throw(_("Give a reason for the rejection."))
		proof.update({"status": "Rejected", "rejection_reason": reason, "verified_by": frappe.session.user,
			"verified_on": now_datetime()})
		proof.save(ignore_permissions=True)
		log_event("Review", proof, details={"payment": "rejected", "reason": reason})
		return {"status": proof.status}

	from pakistan_tax_consultancy.utils.session import as_system

	verifier = frappe.session.user
	engagement = frappe.get_doc("Tax Engagement", proof.tax_engagement)
	s = settings()
	# the books are posted by the system once a Tax Admin has approved the proof (they need no accounts role)
	with as_system():
		invoice = ensure_invoice(engagement)
		pe = get_payment_entry("Sales Invoice", invoice, party_amount=flt(proof.amount))
		mode = PAYMENT_MODES.get(proof.method, "Bank Transfer")
		pe.mode_of_payment = mode if frappe.db.exists("Mode of Payment", mode) else s.default_receivable_mode
		account = frappe.db.get_value("Mode of Payment Account", {"parent": pe.mode_of_payment, "company": s.company},
			"default_account")
		if account:
			pe.paid_to = account
		pe.reference_no = proof.reference or proof.name
		pe.reference_date = proof.paid_on or nowdate()
		pe.remarks = f"Payment proof {proof.name} verified by {verifier}"
		pe.insert()
		pe.submit()

	outstanding = flt(frappe.db.get_value("Sales Invoice", invoice, "outstanding_amount"))
	engagement.db_set("payment_status", "Paid" if outstanding <= 0.5 else "Partially Paid", update_modified=False)
	if engagement.promo_code and outstanding <= 0.5:
		frappe.db.set_value("Promo Code", engagement.promo_code, "used_count",
			cint(frappe.db.get_value("Promo Code", engagement.promo_code, "used_count")) + 1)
	proof.update({"status": "Verified", "verified_by": verifier, "verified_on": now_datetime(),
		"sales_invoice": invoice, "payment_entry": pe.name})
	proof.save(ignore_permissions=True)
	log_event("Review", proof, details={"payment": "verified", "payment_entry": pe.name, "invoice": invoice})
	notify.payment_received(proof)
	return {"status": proof.status, "sales_invoice": invoice, "payment_entry": pe.name,
		"payment_status": engagement.payment_status}


def work_may_start(engagement) -> bool:
	if cint(frappe.db.get_single_value("Firm Website Settings", "work_before_payment")):
		return True
	return engagement.payment_status in ("Paid", "Waived")
