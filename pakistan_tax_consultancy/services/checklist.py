"""Required-documents checklist for a Tax Return, and verification of uploaded documents.

Checklist items are Tax Document rows in status "Requested" (no file yet). The client or staff upload against them
(services/files.py); staff verify or reject with a reason. A return cannot leave preparation for review until every
required item is Verified (services/workflow.py).
"""

import frappe
from frappe import _
from frappe.utils import cint, now_datetime

from pakistan_tax_consultancy.services.tax_calc import taxpayer_type_for

QUESTION_FIELDS = ("has_salary", "has_business", "has_property_income", "has_capital_gains", "has_profit_on_debt",
	"has_foreign_income", "has_other_income", "owns_property", "owns_vehicle", "first_time_filer")


def required_types(doc) -> dict[str, int]:
	"""{document_type: is_required} that apply to this return (client type, taxpayer type, service, year, answers)."""
	client_type = frappe.db.get_value("Tax Client", doc.tax_client, "client_type")
	service = frappe.db.get_value("Tax Engagement", doc.tax_engagement, "service") if doc.get("tax_engagement") else None
	taxpayer_type = taxpayer_type_for(doc)
	out: dict[str, int] = {}
	for rule in frappe.get_all("Document Requirement Rule", filters={"is_active": 1},
			fields=["document_type", "is_mandatory", "client_type", "taxpayer_type", "service", "tax_year", "when_answer"]):
		if rule.client_type and rule.client_type != client_type:
			continue
		if rule.taxpayer_type and rule.taxpayer_type != taxpayer_type:
			continue
		if rule.service and rule.service != service:
			continue
		if rule.tax_year and rule.tax_year != doc.tax_year:
			continue
		if rule.when_answer and not cint(doc.get(rule.when_answer)):
			continue
		out[rule.document_type] = max(out.get(rule.document_type, 0), cint(rule.is_mandatory))
	if service:
		for row in frappe.get_all("Service Document Type", filters={"parent": service, "parenttype": "Service"},
				pluck="document_type"):
			out[row] = 1
	return out


def generate_checklist(doc) -> int:
	"""Add missing checklist items; drop untouched items that no longer apply. Returns the number of required items."""
	wanted = required_types(doc)
	existing = {d.document_type: d for d in frappe.get_all("Tax Document", filters={"tax_return": doc.name},
		fields=["name", "document_type", "status", "file", "is_required", "requested_reason"])}
	for dtype, required in wanted.items():
		item = existing.get(dtype)
		if item:
			if cint(item.is_required) != required:
				frappe.db.set_value("Tax Document", item.name, "is_required", required, update_modified=False)
			continue
		frappe.get_doc({"doctype": "Tax Document", "tax_client": doc.tax_client, "tax_return": doc.name,
			"tax_engagement": doc.get("tax_engagement"), "tax_year": doc.tax_year, "document_type": dtype,
			"document_name": dtype, "status": "Requested", "is_required": required}).insert(ignore_permissions=True)
	for dtype, item in existing.items():
		# items a tax-planning scenario asked for are not rule-based: keep them until the scenario is undone
		if dtype not in wanted and item.status == "Requested" and not item.file and not item.requested_reason:
			frappe.delete_doc("Tax Document", item.name, ignore_permissions=True, force=True)
	return sum(wanted.values())


def checklist(tax_return: str) -> list[dict]:
	rows = frappe.get_all("Tax Document", filters={"tax_return": tax_return},
		fields=["name", "document_type", "document_name", "status", "is_required", "rejection_reason", "file", "requested_reason",
			"upload_date", "is_client_upload", "modified"],
		order_by="is_required desc, document_type asc")
	hints = {d.name: d for d in frappe.get_all("Document Type", fields=["name", "category", "client_hint"])}
	for r in rows:
		meta = hints.get(r.document_type) or {}
		r["category"] = meta.get("category")
		r["hint"] = meta.get("client_hint")
		r["has_file"] = bool(r.pop("file"))
	return rows


def verify(tax_document: str, decision: str, reason: str | None = None) -> dict:
	from pakistan_tax_consultancy.audit import log_event
	from pakistan_tax_consultancy.permissions import can_access_client, get_scope
	from pakistan_tax_consultancy.services import notify

	if get_scope() not in ("all", "consultant"):
		frappe.throw(_("Only staff can verify documents."), frappe.PermissionError)
	doc = frappe.get_doc("Tax Document", tax_document)
	if not can_access_client(doc.tax_client):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	if decision not in ("Verified", "Rejected"):
		frappe.throw(_("Decision must be Verified or Rejected"))
	if not doc.file:
		frappe.throw(_("Nothing uploaded yet for {0}.").format(doc.document_type))
	if decision == "Rejected" and not (reason or "").strip():
		frappe.throw(_("Give the client a reason for the rejection."))
	doc.status = decision
	doc.rejection_reason = reason if decision == "Rejected" else None
	doc.verified_by = frappe.session.user
	doc.verified_on = now_datetime()
	doc.save(ignore_permissions=True)
	log_event("Review", doc, details={"decision": decision, "reason": reason})
	if decision == "Rejected":
		notify.document_rejected(doc)
	elif doc.tax_return:
		advance_when_complete(doc.tax_return)
	return {"name": doc.name, "status": doc.status}


def advance_when_complete(tax_return: str):
	"""Documents Pending -> Draft once every required item is verified (if the verifier may make that move)."""
	from pakistan_tax_consultancy.services import workflow as wf

	tr = frappe.get_doc("Tax Return", tax_return)
	if tr.workflow_state != wf.DOCUMENTS_PENDING or wf.required_documents_status(tax_return)["pending"]:
		return
	if not set(frappe.get_roles()) & set(wf.STAFF_PREP):
		return
	tr.workflow_state = wf.DRAFT
	try:
		tr.save(ignore_permissions=True)
	except frappe.ValidationError:
		frappe.clear_last_message()  # e.g. fee not paid yet: stays in Documents Pending, the verification still stands
