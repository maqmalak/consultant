# Pakistan Tax Consultancy — FSD data extract (run inside: bench --site consultant console)
#   exec(open("apps/pakistan_tax_consultancy/docs/fsd/fsd_data.py").read())
# Writes fsd_data.json next to this file: live counts, workflow, insights, a worked tax calculation and the role matrix.
import json
import os

import frappe


def _fsd_data():
	from pakistan_tax_consultancy.api import insights, roles
	from pakistan_tax_consultancy.services import tax_calc
	from pakistan_tax_consultancy.services import workflow as wf

	frappe.set_user("Administrator")
	cnt = lambda dt, f=None: frappe.db.count(dt, f or {})  # noqa: E731
	out = {"firm": frappe.db.get_value("Firm Website Settings", "Firm Website Settings",
		["firm_name", "tagline", "address", "phone", "email", "partner_name"], as_dict=True)}
	out["counts"] = {k: cnt(*v) if isinstance(v, tuple) else cnt(v) for k, v in {
		"Clients": "Tax Client", "Tax Returns": "Tax Return", "Engagements": "Tax Engagement", "Tax Documents": "Tax Document",
		"Generated PDFs": "Generated Document", "Tax Calculations": "Tax Calculation", "Scenarios": "Tax Scenario",
		"Site Visits": "Site Visit", "Consultations": "Consultation Request", "Payment Proofs": "Payment Proof",
		"Audit Events": "Tax Audit Event", "CRM Leads": "CRM Lead", "CRM Deals": "CRM Deal", "WhatsApp Messages": "WhatsApp Message",
		"WhatsApp Templates": "WhatsApp Template", "Lead Prospects": "Lead Prospect", "Sales Invoices": ("Sales Invoice", {"docstatus": 1}),
		"Payment Entries": ("Payment Entry", {"docstatus": 1}), "Services": "Service", "Packages": "Service Package",
		"Document Types": "Document Type", "Tax Years": "Tax Year", "Slab Settings": "Tax Slab Setting", "Staff users": ("Has Role",
			{"role": ("in", ["Tax Admin", "Tax Consultant", "Tax Reviewer", "Tax Approver", "Filing Officer", "Field Officer"]), "parenttype": "User"}),
		"Client logins": ("Has Role", {"role": "Client", "parenttype": "User"}),
	}.items()}
	out["states"] = [{"state": s, "count": cnt("Tax Return", {"workflow_state": s})} for s, *_ in wf.STATES]
	out["transitions"] = [{"from": f, "action": a, "to": t, "roles": list(dict.fromkeys(r)), "self": s} for f, a, t, r, s in wf.TRANSITIONS]
	ov = insights.overview(tax_year="2026", months=6)
	out["insights"] = {k: ov[k] for k in ("kpis", "trend", "funnel", "stages", "step_time", "team", "people", "mix")}
	# worked example: the E2E test return
	doc = frappe.get_doc("Tax Return", "TAX-RET-2026-00006")
	snap = tax_calc.snapshot(doc)
	setting, slabs = tax_calc.get_slab_setting(doc.tax_year, snap["taxpayer_type"])
	res = tax_calc.compute(snap, slabs, tax_calc.get_credit_rules(doc.tax_year, snap["taxpayer_type"]))
	out["example"] = {"name": doc.name, "client": doc.client_name, "tax_year": doc.tax_year, "taxpayer_type": snap["taxpayer_type"],
		"income": snap["income"], "deductions": snap["deductions"], "credits": snap["credits"], "withholding": snap["withholding"],
		"result": {k: v for k, v in res.items() if k != "slab"}, "slab": res["slab"], "slabs": slabs, "rules": setting.validation_status,
		"ack": doc.iris_acknowledgment_no, "state": doc.workflow_state}
	out["packages"] = frappe.get_all("Service Package", {"active": 1}, ["package_name", "service", "price", "turnaround"], order_by="display_order")
	out["roles"] = roles.overview()["roles"]
	out["matrix"] = [{"doctype": d["doctype"], "area": d["area"], "rules": {r: [p for p in ("read", "write", "create", "delete") if v.get(p)]
		for r, v in d["rules"].items()}} for d in roles.overview()["doctypes"]]
	out["reports"] = [r["name"] for r in __import__("pakistan_tax_consultancy.api.reports", fromlist=["x"]).catalog()["reports"]]
	return out


_path = os.path.join(frappe.get_app_path("pakistan_tax_consultancy"), "..", "docs", "fsd", "fsd_data.json")
with open(_path, "w") as _f:
	json.dump(_fsd_data(), _f, indent=1, default=str)
print("FSD data written to", os.path.abspath(_path))
