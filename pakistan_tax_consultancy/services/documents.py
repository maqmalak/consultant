"""Letters and summaries as Jinja print formats on the firm letterhead, generated to versioned PDFs (ported from the
realestate app's documents module, adapted to tax work).

Every generated PDF is stored on a `Generated Document` (type, client, reference, version, who / when) so the client's
Document vault and the staff client page show the full history. Print formats are plain Jinja, editable in the desk
(Print Format "PTC <document>"); `setup()` refreshes them from templates/docs on every migrate.
Nothing generated here is an FBR document: the filing confirmation exists only once IRIS acknowledged the return.
"""

import base64

import frappe
from frappe import _
from frappe.utils import flt, formatdate, fmt_money, now_datetime

from pakistan_tax_consultancy.services import workflow as wf

LETTER_HEAD = "VVS Consultants"
MODULE = "Pakistan Income Tax Consultancy"

# document type -> source doctype, template, short description (shown to clients), who may generate it
DOCUMENTS = {
	"Authority Letter": ("Tax Client", "authority_letter",
		"Lets VVS prepare and file your return on FBR IRIS for you. Print, sign and upload it."),
	"Engagement Letter": ("Tax Engagement", "engagement_letter",
		"What we will do, the fee and what we need from you."),
	"Document Checklist": ("Tax Return", "document_checklist",
		"Every document for this year, with what is still missing."),
	"Tax Computation Summary": ("Tax Return", "tax_computation_summary",
		"Income, deductions, tax and refund or payable, on one page."),
	"Wealth Statement Summary": ("Tax Return", "wealth_statement_summary",
		"Your assets, liabilities and net wealth for the year."),
	"Withholding Certificate Request": ("Tax Return", "withholding_certificate_request",
		"A ready letter to your employer or bank asking for your tax deduction certificate."),
	"Filing Confirmation": ("Tax Return", "filing_confirmation",
		"Confirms the return was filed, with the IRIS acknowledgment number."),
	"Tax Planning Report": ("Tax Scenario", "tax_planning_report",
		"A what-if from your consultant: how a change would move your tax, next to this year and last year."),
}
ICONS = {"Authority Letter": "pen-line", "Engagement Letter": "handshake", "Document Checklist": "list-checks",
	"Tax Computation Summary": "calculator", "Wealth Statement Summary": "landmark",
	"Withholding Certificate Request": "mail", "Filing Confirmation": "badge-check", "Tax Planning Report": "sliders-horizontal"}
# the summary figures are the client's to see once the consultant has prepared them for confirmation
CLIENT_FIGURES_STATES = (wf.AWAITING_CLIENT, wf.APPROVED) + wf.FILED_STATES
FILED_OK = (wf.ACKNOWLEDGED, wf.CLOSED)


def print_format_name(document_type):
	return f"PTC {document_type}"


def _read(path):
	return frappe.read_file(frappe.get_app_path("pakistan_tax_consultancy", "templates", "docs", *path.split("/"))) or ""


def setup():
	"""Letter head + one Jinja print format per document (re-run safe; refreshes the HTML)."""
	lh = frappe.get_doc("Letter Head", LETTER_HEAD) if frappe.db.exists("Letter Head", LETTER_HEAD) else frappe.new_doc("Letter Head")
	lh.update({"letter_head_name": LETTER_HEAD, "source": "HTML", "footer_source": "HTML", "content": _read("letterhead.html"),
		"footer": _read("letterfoot.html")})
	lh.flags.ignore_permissions = True
	lh.save()
	style = _read("_style.html")
	for document_type, (doctype, template, _desc) in DOCUMENTS.items():
		name = print_format_name(document_type)
		pf = frappe.get_doc("Print Format", name) if frappe.db.exists("Print Format", name) else frappe.new_doc("Print Format")
		pf.update({"name": name, "doc_type": doctype, "module": MODULE, "print_format_type": "Jinja", "custom_format": 1,
			"standard": "No", "disabled": 0, "html": style + _read(f"{template}.html")})
		pf.flags.ignore_permissions = True
		pf.save()


# ---------------------------------------------------------------- jinja helpers (hooks.jinja)
def ptc_firm():
	from pakistan_tax_consultancy.www_helpers import firm

	return firm()


def ptc_logo():
	"""The logo as a data URI, so wkhtmltopdf never has to fetch it over the network."""
	path = frappe.get_app_path("pakistan_tax_consultancy", "public", "images", "vvs-mark.svg")
	with open(path, "rb") as f:
		return "data:image/svg+xml;base64," + base64.b64encode(f.read()).decode()


def ptc_money(value):
	return fmt_money(flt(value), precision=0, currency="PKR").replace("PKR", "Rs")


def ptc_date(value=None):
	return formatdate(value or now_datetime(), "dd MMMM yyyy")


# ---------------------------------------------------------------- availability
def blocked_reason(document_type, src, for_client=False):
	"""Why this document cannot be generated from `src` yet (None when it can)."""
	if document_type in ("Tax Computation Summary", "Wealth Statement Summary"):
		if not src.get("latest_calculation") and document_type == "Tax Computation Summary":
			return _("Available once your consultant has calculated the tax.")
		if document_type == "Wealth Statement Summary" and not (src.get("asset_lines") or src.get("liability_lines")):
			return _("Available once assets or liabilities are entered.")
		if for_client and src.workflow_state not in CLIENT_FIGURES_STATES:
			return _("Available when your return is ready for you to check.")
	if document_type == "Tax Planning Report" and for_client:
		return _("Prepared by your consultant from the tax simulator.")
	if document_type == "Filing Confirmation" and not (src.workflow_state in FILED_OK and src.get("iris_acknowledgment_no")):
		return _("Available after FBR IRIS acknowledges the filed return.")
	return None


def sources(tax_client, for_client=False):
	"""Every document that can be generated for a client, per source record, with past versions."""
	client = frappe.get_doc("Tax Client", tax_client)
	returns = frappe.get_all("Tax Return", {"tax_client": tax_client}, ["name"], order_by="tax_year desc", limit=6)
	returns = [frappe.get_doc("Tax Return", r.name) for r in returns]
	engagements = frappe.get_all("Tax Engagement", {"tax_client": tax_client}, ["name", "tax_year", "service_package", "service"],
		order_by="creation desc", limit=6)
	history = {}
	for g in frappe.get_all("Generated Document", {"tax_client": tax_client}, ["name", "document_type", "reference_name",
			"version", "issued_on", "issued_by", "tax_year", "file"], order_by="issued_on desc"):
		history.setdefault((g.document_type, g.reference_name), []).append(g)
	out = []
	for document_type, (doctype, _t, desc) in DOCUMENTS.items():
		if doctype == "Tax Client":
			targets = [(client.name, _("All years"), None, None)]
		elif doctype == "Tax Scenario":
			# staff planning records: listed for history even where the viewer may not open the scenario itself
			targets = [(sc.name, f"TY{sc.tax_year} · {sc.title}", sc.tax_year, blocked_reason(document_type, sc, for_client))
				for sc in frappe.get_all("Tax Scenario", {"tax_client": tax_client}, ["name", "title", "tax_year"], order_by="creation desc", limit=8)]
			if for_client:  # clients see only the reports already shared with them
				targets = [t for t in targets if history.get((document_type, t[0]))]
		elif doctype == "Tax Engagement":
			targets = [(e.name, f"TY{e.tax_year} · {e.service_package or e.service}", e.tax_year, None) for e in engagements]
		else:
			targets = [(r.name, f"TY{r.tax_year}", r.tax_year, blocked_reason(document_type, r, for_client)) for r in returns]
		out.append({"document_type": document_type, "description": desc, "icon": ICONS[document_type], "source": doctype,
			"targets": [{"name": n, "label": label, "tax_year": year, "blocked": reason,
				"versions": history.get((document_type, n), [])} for n, label, year, reason in targets]})
	return out


# ---------------------------------------------------------------- generate
def generate(document_type, reference_name, for_client=None, remarks=None):
	"""Render to PDF on the letterhead, store as the next version. The caller has already checked access to the client."""
	if document_type not in DOCUMENTS:
		frappe.throw(_("Unknown document {0}").format(document_type))
	doctype = DOCUMENTS[document_type][0]
	src = frappe.get_doc(doctype, reference_name)
	tax_client = src.name if doctype == "Tax Client" else src.tax_client
	if for_client and for_client != tax_client:
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	reason = blocked_reason(document_type, src, bool(for_client))
	if reason:
		frappe.throw(reason)

	from pakistan_tax_consultancy.audit import log_event

	user = frappe.session.user
	# Render as the caller (access was checked above; the client has read but not print permission). Never switch user
	# around get_print: rendering may save the session, and it would be saved with the switched user's data.
	frappe.flags.ignore_print_permissions = True
	try:
		pdf = frappe.get_print(doctype, reference_name, print_format=print_format_name(document_type), as_pdf=True,
			letterhead=LETTER_HEAD)
	finally:
		frappe.flags.ignore_print_permissions = False
	# stored with ignore_permissions: clients may not create these records themselves
	version = frappe.db.count("Generated Document", {"document_type": document_type, "reference_name": reference_name}) + 1
	gen = frappe.get_doc({"doctype": "Generated Document", "document_type": document_type, "tax_client": tax_client,
		"tax_year": src.get("tax_year"), "reference_doctype": doctype, "reference_name": reference_name,
		"tax_return": src.name if doctype == "Tax Return" else src.get("tax_return"), "version": version, "language": "en",
		"issued_on": now_datetime(), "issued_by": user, "print_format": print_format_name(document_type),
		"remarks": (remarks or "")[:500] or None})
	gen.flags.ignore_permissions = True
	gen.insert()
	file_name = f"{document_type} - {reference_name} - v{version}.pdf".replace("/", "-")
	f = frappe.get_doc({"doctype": "File", "file_name": file_name, "attached_to_doctype": "Generated Document",
		"attached_to_name": gen.name, "attached_to_field": "file", "is_private": 1, "content": pdf})
	f.flags.ignore_permissions = True
	f.insert()
	gen.db_set("file", f.file_url)
	gen.db_set("owner", user)
	log_event("Export", src, details={"generated": document_type, "version": version})
	return {"name": gen.name, "version": version, "document_type": document_type}
