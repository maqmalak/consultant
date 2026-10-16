"""Document vault: every file a client has with the firm in one place — uploads, IRIS acknowledgments, invoices and
letters the firm generates (services/documents.py) — for the client portal and the staff client page."""

import frappe
from frappe import _
from frappe.rate_limiter import rate_limit
from frappe.utils import add_days, getdate

from pakistan_tax_consultancy.services import documents as gen
from pakistan_tax_consultancy.services import workflow as wf

EXPIRY_ALERT_DAYS = 30


def expiry_status(expiry):
	if not expiry:
		return None
	if getdate(expiry) < getdate():
		return "Expired"
	if getdate(expiry) <= add_days(getdate(), EXPIRY_ALERT_DAYS):
		return "Expiring Soon"
	return "Valid"


def _vault(tax_client, for_client):
	categories = dict(frappe.get_all("Document Type", fields=["name", "category"], as_list=True))
	docs = frappe.get_all("Tax Document", {"tax_client": tax_client, "file": ("is", "set")}, ["name", "document_type",
		"document_name", "tax_year", "tax_return", "status", "upload_date", "expiry_date", "is_client_upload"],
		order_by="upload_date desc")
	for d in docs:
		d.category = categories.get(d.document_type) or "Other"
		d.expiry_status = expiry_status(d.expiry_date)
	returns = frappe.get_all("Tax Return", {"tax_client": tax_client}, ["name", "tax_year", "workflow_state",
		"iris_acknowledgment_no", "fbr_receipt"], order_by="tax_year desc")
	acks = [{"tax_return": r.name, "tax_year": r.tax_year, "ack_no": r.iris_acknowledgment_no, "has_receipt": bool(r.fbr_receipt)}
		for r in returns if r.workflow_state in gen.FILED_OK and r.iris_acknowledgment_no]
	invoices = frappe.get_all("Tax Engagement", {"tax_client": tax_client, "sales_invoice": ("is", "set")}, ["name",
		"tax_year", "sales_invoice", "net_fee", "payment_status", "service_package"], order_by="creation desc")
	return {
		"client": frappe.db.get_value("Tax Client", tax_client, ["name", "client_name", "client_type"], as_dict=True),
		"documents": docs, "acknowledgments": acks, "invoices": invoices,
		"generate": gen.sources(tax_client, for_client=for_client),
		"years": sorted({d.tax_year for d in docs if d.tax_year} | {r.tax_year for r in returns}, reverse=True),
		"expiring": sum(1 for d in docs if d.expiry_status in ("Expired", "Expiring Soon")),
	}


# ---------------------------------------------------------------- client portal
@frappe.whitelist(methods=["GET"])
def my_vault():
	from pakistan_tax_consultancy.api.portal import my_client

	return _vault(my_client().name, for_client=True)


@frappe.whitelist(methods=["POST"])
@rate_limit(limit=30, seconds=60 * 60)
def generate(document_type: str, reference_name: str):
	from pakistan_tax_consultancy.api.portal import my_client

	return gen.generate(document_type, reference_name, for_client=my_client().name)


# ---------------------------------------------------------------- staff
@frappe.whitelist(methods=["GET"])
def client_vault(tax_client: str):
	from pakistan_tax_consultancy.api.staff import require_staff

	require_staff()
	frappe.get_doc("Tax Client", tax_client).check_permission("read")
	return _vault(tax_client, for_client=False)


@frappe.whitelist(methods=["POST"])
def staff_generate(document_type: str, reference_name: str, remarks: str | None = None):
	from pakistan_tax_consultancy.api.staff import require_staff

	require_staff()
	if document_type not in gen.DOCUMENTS:
		frappe.throw(_("Unknown document {0}").format(document_type))
	frappe.get_doc(gen.DOCUMENTS[document_type][0], reference_name).check_permission("read")
	return gen.generate(document_type, reference_name, remarks=remarks)
