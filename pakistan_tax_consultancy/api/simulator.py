"""Tax simulator API (staff portal): context, live simulation, saved scenarios, planning report."""

import frappe
from frappe import _
from frappe.utils import flt

from pakistan_tax_consultancy.api.staff import require_staff
from pakistan_tax_consultancy.services import simulator as svc

SAVED = ("taxable_income", "tax_liability", "net_payable", "refund_due")


def _return(name, ptype="read"):
	require_staff()
	doc = frappe.get_doc("Tax Return", name)
	doc.check_permission(ptype)
	return doc


def _values(values):
	values = frappe.parse_json(values) if isinstance(values, str) else (values or {})
	return {str(k): max(flt(v), 0.0) for k, v in values.items()}


@frappe.whitelist(methods=["GET"])
def context(tax_return: str):
	ctx = svc.context(_return(tax_return))
	ctx["scenarios"] = scenarios(tax_return)
	return ctx


@frappe.whitelist(methods=["POST"])
def simulate(tax_return: str, values: str | dict):
	return svc.simulate(_return(tax_return), _values(values))


@frappe.whitelist(methods=["GET"])
def scenarios(tax_return: str):
	_return(tax_return)
	rows = frappe.get_list("Tax Scenario", {"tax_return": tax_return}, ["name", "title", "notes", "levers", "result", "owner", "creation"],
		order_by="creation asc", limit_page_length=50)
	for r in rows:
		r.levers, r.result = frappe.parse_json(r.levers) or {}, frappe.parse_json(r.result) or {}
		r.owner_name = frappe.utils.get_fullname(r.owner)
	return rows


@frappe.whitelist(methods=["POST"])
def save_scenario(tax_return: str, title: str, values: str | dict, notes: str | None = None, name: str | None = None):
	doc = _return(tax_return)
	if not (title or "").strip():
		frappe.throw(_("Give the scenario a name."))
	values = _values(values)
	result = svc.simulate(doc, values)
	sc = frappe.get_doc("Tax Scenario", name) if name else frappe.new_doc("Tax Scenario")
	if name and sc.tax_return != doc.name:
		frappe.throw(_("This scenario belongs to another return."))
	sc.update({"title": title.strip()[:140], "tax_return": doc.name, "tax_client": doc.tax_client, "client_name": doc.client_name,
		"tax_year": doc.tax_year, "notes": (notes or "").strip()[:1000] or None, "levers": frappe.as_json(values),
		"result": frappe.as_json(result), **{k: result[k] for k in SAVED}})
	sc.save()
	return sc.name


@frappe.whitelist(methods=["POST"])
def delete_scenario(name: str):
	require_staff()
	frappe.delete_doc("Tax Scenario", name)


@frappe.whitelist(methods=["POST"])
def generate_report(name: str):
	"""PDF 'Tax Planning Report' for a saved scenario, stored in the client's document vault."""
	from pakistan_tax_consultancy.services import documents

	require_staff()
	sc = frappe.get_doc("Tax Scenario", name)
	sc.check_permission("read")
	res = documents.generate("Tax Planning Report", name, remarks=sc.title)
	res["file"] = frappe.db.get_value("Generated Document", res["name"], "file")
	return res
