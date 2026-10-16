"""Lead Finder API (staff CRM): research public business websites into a review queue, then convert to CRM leads."""

import frappe
from frappe import _

from pakistan_tax_consultancy.api.crm import _guard
from pakistan_tax_consultancy.services import lead_finder

EDITABLE = ("company_name", "client_type", "phone", "email", "website", "address", "city", "country", "summary", "notes")


@frappe.whitelist(methods=["POST"])
def run(entries: str | list, client_type: str | None = None):
	_guard()
	frappe.get_doc({"doctype": "Lead Prospect"}).check_permission("create")
	if isinstance(entries, str):
		entries = frappe.parse_json(entries) if entries.strip().startswith("[") else entries.splitlines()
	return lead_finder.run(entries, client_type)


@frappe.whitelist(methods=["GET"])
def prospects(status: str | None = None, q: str | None = None):
	_guard()
	filters = {"status": status} if status else {}
	or_filters = {f: ("like", f"%{q}%") for f in ("company_name", "city", "email", "phone", "website")} if q else None
	rows = frappe.get_list("Lead Prospect", filters=filters, or_filters=or_filters, fields=["name", "company_name", "status", "client_type",
		"phone", "email", "website", "address", "city", "country", "summary", "notes", "scrape_error", "converted_lead", "source_url",
		"research_source", "researched_on", "social_media", "category", "rating", "reviews", "maps_url"], order_by="creation desc", limit_page_length=300)
	counts = {s: frappe.db.count("Lead Prospect", {"status": s}) for s in ("Pending Review", "Approved", "Converted", "Rejected")}
	from frappe.utils.password import get_decrypted_password

	apify_ready = bool(get_decrypted_password("Portal Integration Settings", "Portal Integration Settings", "apify_api_token", raise_exception=False))
	return {"rows": rows, "counts": counts, "max_per_run": lead_finder.MAX_URLS_PER_CALL, "apify_ready": apify_ready}


@frappe.whitelist(methods=["POST"])
def update(name: str, data: str | dict):
	_guard()
	doc = frappe.get_doc("Lead Prospect", name)
	doc.check_permission("write")
	data = frappe.parse_json(data) if isinstance(data, str) else data
	doc.update({k: v for k, v in data.items() if k in EDITABLE})
	doc.save()


@frappe.whitelist(methods=["POST"])
def set_status(name: str, status: str):
	_guard()
	if status not in ("Pending Review", "Approved", "Rejected"):
		frappe.throw(_("Unknown status"))
	doc = frappe.get_doc("Lead Prospect", name)
	doc.check_permission("write")
	if doc.status == "Converted":
		frappe.throw(_("Already a CRM lead."))
	doc.status = status
	doc.save()


@frappe.whitelist(methods=["POST"])
def convert(name: str):
	_guard()
	frappe.get_doc("Lead Prospect", name).check_permission("write")
	frappe.get_doc({"doctype": "CRM Lead"}).check_permission("create")
	return lead_finder.convert(name)


@frappe.whitelist(methods=["POST"])
def delete(name: str):
	_guard()
	frappe.delete_doc("Lead Prospect", name)


# ---------------------------------------------------------------- Google Maps via Apify (business type + city)
@frappe.whitelist(methods=["POST"])
def maps_search(category: str, location: str, max_places: int | None = None):
	from pakistan_tax_consultancy.services import apify

	_guard()
	frappe.get_doc({"doctype": "Lead Prospect"}).check_permission("create")
	return apify.start_search(category, location, max_places)


@frappe.whitelist(methods=["GET"])
def maps_status(run: str):
	from pakistan_tax_consultancy.services import apify

	_guard()
	return apify.status(run)


@frappe.whitelist(methods=["POST"])
def maps_import(run: str, client_type: str | None = None):
	from pakistan_tax_consultancy.services import apify

	_guard()
	frappe.get_doc({"doctype": "Lead Prospect"}).check_permission("create")
	return apify.import_run(run, client_type or "Individual-Business")
