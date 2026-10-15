"""Immutable audit trail helpers. Tax Audit Event rows are insert-only."""

import json

import frappe
from frappe.utils import now_datetime

SENSITIVE_KEYS = {"cnic", "cnic_digits", "bank_iban", "bank_name", "password", "pwd", "fbr_api_password"}


def _scrub(details):
	if isinstance(details, dict):
		return {k: ("***" if k in SENSITIVE_KEYS else _scrub(v)) for k, v in details.items()}
	if isinstance(details, list):
		return [_scrub(v) for v in details]
	return details


def log_event(event_type, doc=None, reference_doctype=None, reference_name=None, tax_client=None,
		from_state=None, to_state=None, details=None):
	"""Write an audit event. Never raises into the caller's transaction for logging failures."""
	if doc is not None:
		reference_doctype = reference_doctype or doc.doctype
		reference_name = reference_name or doc.name
		tax_client = tax_client or (doc.get("tax_client") if doc.doctype != "Tax Client" else doc.name)
	request_ip = getattr(frappe.local, "request_ip", None)
	event = frappe.get_doc({
		"doctype": "Tax Audit Event",
		"event_type": event_type,
		"reference_doctype": reference_doctype,
		"reference_name": reference_name,
		"tax_client": tax_client,
		"user": frappe.session.user,
		"timestamp": now_datetime(),
		"ip_address": request_ip,
		"from_state": from_state,
		"to_state": to_state,
		"details": json.dumps(_scrub(details or {}), default=str, indent=1),
	})
	event.flags.ignore_permissions = True
	event.flags.from_audit_api = True
	event.insert()
	return event.name
