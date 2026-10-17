"""CRM masters for the CRM app (ported from the realestate MastersPage idea): organizations, lead sources, statuses,
lost reasons, industries, territories — Frappe CRM's own records, with its permissions (Sales User / Manager)."""

import frappe
from frappe import _

from pakistan_tax_consultancy.api.crm import _guard

# doctype -> (title field, [(field, label, type, options)], usage: (linked doctype, link field))
MASTERS = {
	"CRM Organization": ("organization_name", [("organization_name", "Name", "Data", None), ("website", "Website", "Data", None),
		("industry", "Industry", "Link", "CRM Industry"), ("territory", "Territory", "Link", "CRM Territory"),
		("no_of_employees", "Employees", "Select", "1-10\n11-50\n51-200\n201-500\n501-1000\n1000+"),
		("annual_revenue", "Annual revenue", "Currency", None)], ("CRM Deal", "organization")),
	"CRM Lead Source": ("source_name", [("source_name", "Source", "Data", None), ("details", "Details", "Text", None)], ("CRM Lead", "source")),
	"CRM Lead Status": ("lead_status", [("lead_status", "Status", "Data", None),
		("color", "Colour", "Select", "gray\nblue\ngreen\nred\npink\norange\namber\nyellow\ncyan\nteal\nviolet\npurple\nblack"),
		("type", "Type", "Select", "Open\nOngoing\nOn Hold\nWon\nLost"), ("position", "Order", "Int", None)], ("CRM Lead", "status")),
	"CRM Lost Reason": ("lost_reason", [("lost_reason", "Reason", "Data", None), ("description", "Description", "Text", None)], ("CRM Deal", "lost_reason")),
	"CRM Industry": ("industry", [("industry", "Industry", "Data", None)], ("CRM Lead", "industry")),
	"CRM Territory": ("territory_name", [("territory_name", "Territory", "Data", None), ("territory_manager", "Manager", "Link", "User"),
		("parent_crm_territory", "Parent", "Link", "CRM Territory")], ("CRM Lead", "territory")),
}


def _check(doctype):
	_guard()
	if doctype not in MASTERS:
		frappe.throw(_("Not a CRM master."))


@frappe.whitelist(methods=["GET"])
def overview():
	_guard()
	return [{"doctype": dt, "title": t, "count": frappe.db.count(dt), "fields": [{"field": f, "label": l, "type": ty, "options": o} for f, l, ty, o in fields]}
		for dt, (t, fields, _u) in MASTERS.items()]


@frappe.whitelist(methods=["GET"])
def rows(doctype: str):
	_check(doctype)
	title, fields, (used_dt, used_field) = MASTERS[doctype]
	data = frappe.get_list(doctype, fields=["name"] + [f for f, *_x in fields], order_by=f"{'position asc, ' if doctype == 'CRM Lead Status' else ''}modified desc",
		limit_page_length=500)
	usage = dict(frappe.db.sql(f"select `{used_field}`, count(*) from `tab{used_dt}` where `{used_field}` is not null group by `{used_field}`"))
	for r in data:
		r.used = usage.get(r.name, 0)
	return {"rows": data, "can_write": frappe.has_permission(doctype, "write"), "can_create": frappe.has_permission(doctype, "create"),
		"used_by": used_dt}


@frappe.whitelist(methods=["POST"])
def save(doctype: str, data: str | dict, name: str | None = None):
	_check(doctype)
	title, fields, _u = MASTERS[doctype]
	data = frappe.parse_json(data) if isinstance(data, str) else data
	values = {f: data.get(f) for f, *_x in fields if f in data}
	if not (values.get(title) or name):
		frappe.throw(_("Give it a name."))
	if name:
		doc = frappe.get_doc(doctype, name)
		doc.update({k: v for k, v in values.items() if k != title})
		doc.save()
		return doc.name
	doc = frappe.get_doc({"doctype": doctype, **values})
	doc.insert()
	return doc.name


@frappe.whitelist(methods=["POST"])
def delete(doctype: str, name: str):
	_check(doctype)
	try:
		frappe.delete_doc(doctype, name)
	except frappe.LinkExistsError:
		frappe.throw(_("{0} is still used by some records — change those first.").format(name))


@frappe.whitelist(methods=["GET"])
def link_options(doctype: str):
	"""Choices for a Link field in the masters forms (only the doctypes those forms use)."""
	_guard()
	if doctype == "User":
		users = frappe.get_all("Has Role", {"role": ("in", ["Sales User", "Sales Manager"]), "parenttype": "User"}, pluck="parent")
		return [{"value": u.name, "label": u.full_name} for u in frappe.get_all("User", {"name": ("in", users or [""]), "enabled": 1}, ["name", "full_name"])]
	if doctype not in MASTERS:
		frappe.throw(_("Not allowed"))
	return [{"value": n, "label": n} for n in frappe.get_list(doctype, pluck="name", limit_page_length=500)]
