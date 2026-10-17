"""Report center for the staff portal: the firm's script reports, run in the portal with simple filters (the desk's own
report engine and role rules decide who may run what), shown as a table and exportable to CSV."""

import frappe
from frappe import _

from pakistan_tax_consultancy.api.staff import require_staff

STATES = ["Documents Pending", "Draft", "Pending Review", "Under Review", "Changes Required", "Reviewed", "Awaiting Client Confirmation",
	"Approved", "Submitted to FBR", "Filing Error", "Acknowledged", "Closed"]
TAX_YEAR = {"fieldname": "tax_year", "label": "Tax year", "type": "tax_year"}
# report -> group, icon, what it answers, filters
CATALOG = {
	"Returns by Status": ("Returns", "layers", "How many returns sit in each step, per tax year.", [TAX_YEAR]),
	"Review and Approval Aging": ("Returns", "hourglass", "Days each return has been waiting for review or approval.", []),
	"Consultant Workload": ("Team", "users", "Open returns per consultant and step.", [TAX_YEAR]),
	"Missing Documents": ("Returns", "file-warning", "Required documents not uploaded yet or rejected, by client.", [TAX_YEAR]),
	"Filing Status and Errors": ("Filing", "send", "Filing records, IRIS acknowledgments and filing errors.",
		[{"fieldname": "status", "label": "Status", "type": "select", "options": ["", "Pending", "Submitted", "Acknowledged", "Error"]}]),
	"Tax Payable and Refund Summary": ("Money", "scale", "Tax liability, payable and refunds per return.", [TAX_YEAR]),
	"Fees and Collections": ("Money", "wallet", "Engagement fees, invoices, payments and what is still outstanding.", [TAX_YEAR]),
	"Client Master": ("Clients", "contact", "Every client with masked identifiers, type, consultant and portal status.",
		[{"fieldname": "client_type", "label": "Client type", "type": "select", "options": ["", "Individual-Salaried", "Individual-Business", "AOP", "Company", "Other"]},
		{"fieldname": "status", "label": "Status", "type": "select", "options": ["", "Active", "Inactive"]}]),
	"Site Visits and Follow-ups": ("Clients", "map-pin", "Field visits by status and officer, with follow-ups due.",
		[{"fieldname": "status", "label": "Status", "type": "select", "options": ["", "New", "Contacted", "Qualified", "Converted", "Not Interested"]},
		{"fieldname": "due_only", "label": "Follow-ups due only", "type": "check"}]),
	"Consultation Requests Report": ("Clients", "phone", "Website bookings by status and service.",
		[{"fieldname": "status", "label": "Status", "type": "select", "options": ["", "New", "Contacted", "Scheduled", "Completed", "Cancelled"]}]),
}
GROUPS = ["Returns", "Money", "Clients", "Team", "Filing"]


@frappe.whitelist(methods=["GET"])
def catalog():
	require_staff()
	years = frappe.get_all("Tax Year", {"is_active": 1}, pluck="name", order_by="end_date desc")
	out = []
	for name, (group, icon, desc, filters) in CATALOG.items():
		if not frappe.db.exists("Report", name) or not frappe.get_doc("Report", name).is_permitted():
			continue
		out.append({"name": name, "group": group, "icon": icon, "description": desc, "filters": filters})
	return {"reports": out, "groups": GROUPS, "tax_years": years,
		"default_year": _current_year() or (years[0] if years else None)}


def _current_year():
	"""The year being filed now (as on the website), else the configured default."""
	from pakistan_tax_consultancy.api.public import current_tax_year

	return (current_tax_year() or {}).get("name") or frappe.db.get_single_value("Tax Consultancy Settings", "default_tax_year")


@frappe.whitelist(methods=["POST"])
def run(report: str, filters: str | dict | None = None):
	"""Run one catalogued report with the filters it understands; returns columns + rows."""
	from frappe.desk.query_report import run as run_report

	require_staff()
	if report not in CATALOG:
		frappe.throw(_("Unknown report."))
	if not frappe.get_doc("Report", report).is_permitted():
		frappe.throw(_("You may not run this report."), frappe.PermissionError)
	allowed = {f["fieldname"] for f in CATALOG[report][3]}
	given = frappe.parse_json(filters) if isinstance(filters, str) else (filters or {})
	clean = {k: v for k, v in given.items() if k in allowed and v not in (None, "", 0, "0")}
	res = run_report(report, filters=clean, ignore_prepared_report=True)
	columns = []
	for c in res.get("columns") or []:
		if isinstance(c, str):  # "Label:Type/Options:Width" style
			label, _sep, rest = c.partition(":")
			ftype = rest.split(":")[0].split("/")[0] or "Data"
			columns.append({"label": label, "fieldname": frappe.scrub(label), "fieldtype": ftype})
		else:
			columns.append({"label": c.get("label"), "fieldname": c.get("fieldname") or frappe.scrub(c.get("label") or ""),
				"fieldtype": c.get("fieldtype") or "Data", "options": c.get("options")})
	rows = []
	for r in res.get("result") or []:
		if isinstance(r, (list, tuple)):
			r = {columns[i]["fieldname"]: v for i, v in enumerate(r) if i < len(columns)}
		if r.get("is_total_row") or not isinstance(r, dict):
			continue
		rows.append(r)
	return {"columns": columns, "rows": rows, "filters": clean}
