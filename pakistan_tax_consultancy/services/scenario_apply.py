"""Apply a saved tax-planning scenario to its Tax Return — the step from "what if" to the figures that get reviewed.

The scenario's lever values are written into the return's own lines the same way the simulator adjusts its copy
(lines in a group scale together; a missing group gets one new line), the tax is recalculated through the normal
engine (a new Tax Calculation version), and any new or larger deduction, credit or tax-paid figure becomes a required
checklist document, so "Submit for Review" stays blocked until the evidence is uploaded and verified. Nothing is filed
here: the return continues through review, approval and client confirmation as usual.

Only while the return is still being prepared; one applied scenario at a time; undo restores the lines exactly.
"""

import json

import frappe
from frappe import _
from frappe.utils import flt, now_datetime

from pakistan_tax_consultancy.services import simulator, tax_calc
from pakistan_tax_consultancy.services import workflow as wf

EDITABLE = (wf.DOCUMENTS_PENDING, wf.DRAFT, wf.CHANGES_REQUIRED)
TABLES = {
	"income_sources": ("income_category", "description", "payer_or_employer", "tax_treatment", "tax_rate_percent", "gross_amount",
		"exempt_amount", "taxable_amount", "supporting_document", "is_addback"),
	"deduction_lines": ("deduction_type", "description", "section_reference", "amount", "supporting_document"),
	"credit_lines": ("credit_type", "credit_rule", "eligible_amount", "credit_amount", "supporting_document"),
	"withholding_lines": ("section", "payer", "payer_ntn", "tax_year_period", "amount", "certificate"),
	"advance_tax_lines": ("cpr_no", "payment_date", "section", "amount", "challan"),
}
# evidence asked for when a scenario adds or raises a figure (document type, category for a new type)
EVIDENCE = {
	"ded|Zakat": ("Zakat Deduction Certificate", "Other"),
	"ded|Business Expense": ("Business Accounts", "Business"),
	"ded|Workers Welfare Fund": ("Deduction Receipts", "Other"),
	"ded|Workers Participation Fund": ("Deduction Receipts", "Other"),
	"ded|Profit on Debt (House Loan)": ("House Loan Interest Certificate", "Banking"),
	"ded|Educational Expense": ("Tuition Fee Receipts", "Other"),
	"ded|Other Allowable Deduction": ("Deduction Receipts", "Other"),
	"cr|Charitable Donation": ("Donation Receipts", "Other"),
	"cr|Investment in Shares": ("Share Investment Certificate", "Wealth"),
	"cr|Pension Fund Contribution": ("Pension Fund Certificate", "Other"),
	"cr|Health Insurance": ("Health Insurance Premium Certificate", "Other"),
	"cr|Other": ("Tax Credit Evidence", "Other"),
	"wht": ("Withholding Tax Certificate", "Withholding"),
	"adv": ("Advance Tax Challan (CPR)", "Withholding"),
}
NOTE = _("from scenario")


def _lines(doc):
	return {t: [{f: row.get(f) for f in fields} for row in doc.get(t) or []] for t, fields in TABLES.items()}


def _check(doc, sc):
	doc.check_permission("write")
	if sc.tax_return != doc.name:
		frappe.throw(_("This scenario belongs to another return."))
	if doc.workflow_state not in EDITABLE:
		frappe.throw(_("A scenario can only be applied while the return is being prepared ({0}). It is now {1}.").format(
			", ".join(EDITABLE), doc.workflow_state))


def plan(doc, sc) -> dict:
	"""What applying would change: each lever old → new, the tax before / after, and the evidence it would ask for."""
	values = frappe.parse_json(sc.levers) or {}
	ly = simulator.last_year_return(doc)
	snap = tax_calc.snapshot(doc)
	levers = simulator.levers(snap, tax_calc.snapshot(ly) if ly else None)
	base = {lv["key"]: lv["base"] for lv in levers}
	# a scenario may add an item the return does not have yet (e.g. Zakat): it starts from 0
	changes = [{"key": k, "label": simulator._label(k), "group": simulator._group(k), "old": base.get(k, 0.0), "new": flt(v)}
		for k, v in values.items() if abs(flt(v) - base.get(k, 0.0)) >= 1]
	evidence = [{"document_type": EVIDENCE[c["key"]][0], "label": c["label"], "amount": c["new"]}
		for c in changes if c["key"] in EVIDENCE and c["new"] > c["old"]]
	applied = frappe.db.get_value("Tax Scenario", {"tax_return": doc.name, "applied_on": ("is", "set")}, ["name", "title"], as_dict=True)
	return {"changes": changes, "evidence": evidence, "before": simulator.run(snap, doc.tax_year, doc.get("tax_regime")),
		"after": simulator.simulate(doc, values), "editable": doc.workflow_state in EDITABLE, "state": doc.workflow_state,
		"applied": applied}


def _scale(doc, table, rows, fields, target, new_row):
	base = sum(flt(r.get(fields[0])) for r in rows)
	if base > 0:
		if target < 0.5:
			for r in rows:
				doc.remove(r)
			return
		f = target / base
		for r in rows:
			for fld in fields:
				r.set(fld, round(flt(r.get(fld)) * f, 2))
	elif target >= 0.5:
		doc.append(table, new_row(target))


def _apply_lines(doc, values, title):
	ly = simulator.last_year_return(doc)
	ly_rates = {f"inc|{r.income_category}|{r.tax_treatment or tax_calc.NORMAL}": flt(r.tax_rate_percent) for r in (ly.income_sources if ly else [])}
	now = simulator.amounts(tax_calc.snapshot(doc))
	tag = f"{NOTE} “{title}”"
	inc = ("gross_amount", "exempt_amount", "taxable_amount")
	for key, target in values.items():
		target = max(flt(target), 0.0)
		if abs(target - now.get(key, 0.0)) < 0.5:
			continue
		kind, *rest = key.split("|")
		if kind == "inc":
			category, treatment = rest
			rows = [r for r in doc.income_sources if not r.get("is_addback") and r.income_category == category
				and (r.tax_treatment or tax_calc.NORMAL) == treatment]
			_scale(doc, "income_sources", rows, inc, target, lambda v, c=category, t=treatment, k=key: {"income_category": c, "tax_treatment": t,
				"gross_amount": v, "taxable_amount": 0 if t == "Exempt" else v, "tax_rate_percent": ly_rates.get(k), "description": tag})
		elif kind == simulator.ADDBACK:
			rows = [r for r in doc.income_sources if r.get("is_addback")]
			_scale(doc, "income_sources", rows, inc, target, lambda v: {"income_category": "Business", "tax_treatment": tax_calc.NORMAL,
				"gross_amount": v, "taxable_amount": v, "is_addback": 1, "description": f"{_('Add-backs (inadmissible expenses)')} — {tag}"})
		elif kind == "ded":
			rows = [r for r in doc.deduction_lines if (r.deduction_type or "Other") == rest[0]]
			_scale(doc, "deduction_lines", rows, ("amount",), target, lambda v, t=rest[0]: {"deduction_type": t, "amount": v, "description": tag})
		elif kind == "cr":
			rows = [r for r in doc.credit_lines if (r.credit_type or "Other") == rest[0]]
			_scale(doc, "credit_lines", rows, ("credit_amount", "eligible_amount"), target,
				lambda v, t=rest[0]: {"credit_type": t, "credit_amount": v, "eligible_amount": v})
		elif kind == "wht":
			_scale(doc, "withholding_lines", list(doc.withholding_lines), ("amount",), target, lambda v: {"amount": v, "payer": tag})
		elif kind == "adv":
			_scale(doc, "advance_tax_lines", list(doc.advance_tax_lines), ("amount",), target,
				lambda v: {"amount": v, "cpr_no": _("To be provided"), "section": tag})


def _request_evidence(doc, sc, evidence):
	for e in evidence:
		dtype = e["document_type"]
		if not frappe.db.exists("Document Type", dtype):
			category = next((c for (d, c) in EVIDENCE.values() if d == dtype), "Other")
			frappe.get_doc({"doctype": "Document Type", "document_type_name": dtype, "category": category, "is_active": 1,
				"client_hint": _("Needed to claim this amount on your return.")}).insert(ignore_permissions=True)
		reason = _("{0} {1} — {2} “{3}”").format(e["label"], frappe.format_value(e["amount"], {"fieldtype": "Currency"}), NOTE, sc.title)
		existing = frappe.db.get_value("Tax Document", {"tax_return": doc.name, "document_type": dtype}, ["name", "status"], as_dict=True)
		if existing:
			frappe.db.set_value("Tax Document", existing.name, {"is_required": 1, "requested_reason": reason}, update_modified=False)
			continue
		frappe.get_doc({"doctype": "Tax Document", "tax_client": doc.tax_client, "tax_return": doc.name, "tax_engagement": doc.get("tax_engagement"),
			"tax_year": doc.tax_year, "document_type": dtype, "document_name": dtype, "status": "Requested", "is_required": 1,
			"requested_reason": reason}).insert(ignore_permissions=True)


def apply(doc, sc) -> dict:
	from pakistan_tax_consultancy.audit import log_event

	_check(doc, sc)
	other = frappe.db.get_value("Tax Scenario", {"tax_return": doc.name, "applied_on": ("is", "set"), "name": ("!=", sc.name)}, "title")
	if other:
		frappe.throw(_("“{0}” is already applied to this return. Undo it first, then apply another scenario.").format(other))
	if sc.applied_on:
		frappe.throw(_("This scenario is already applied."))
	p = plan(doc, sc)
	if not p["changes"]:
		frappe.throw(_("This scenario has the same figures as the return — nothing to apply."))
	before = _lines(doc)
	_apply_lines(doc, frappe.parse_json(sc.levers) or {}, sc.title)
	doc.save()
	result = tax_calc.calculate_return(doc)
	_request_evidence(doc, sc, p["evidence"])
	sc.db_set({"applied_on": now_datetime(), "applied_by": frappe.session.user, "applied_calculation": result["calculation"],
		"before_lines": json.dumps(before, default=str)})
	summary = "; ".join(f"{c['label']}: {c['old']:,.0f} → {c['new']:,.0f}" for c in p["changes"])
	doc.add_comment("Comment", _("Prepared from tax-planning scenario “{0}” ({1}). Tax {2:,.0f} → {3:,.0f}.").format(
		sc.title, summary, p["before"]["tax_liability"], result["tax_liability"]))
	log_event("Update", doc, details={"scenario_applied": sc.name, "calculation": result["calculation"]})
	return {"calculation": result["calculation"], "tax_liability": result["tax_liability"], "evidence": p["evidence"]}


def undo(doc, sc) -> dict:
	from pakistan_tax_consultancy.audit import log_event

	_check(doc, sc)
	if not sc.applied_on or not sc.before_lines:
		frappe.throw(_("This scenario is not applied."))
	before = json.loads(sc.before_lines)
	for table in TABLES:
		doc.set(table, before.get(table, []))
	doc.save()
	result = tax_calc.calculate_return(doc)
	for d in frappe.get_all("Tax Document", {"tax_return": doc.name, "requested_reason": ("like", f"%“{sc.title}”%")}, ["name", "status", "file"]):
		if d.status == "Requested" and not d.file:
			frappe.delete_doc("Tax Document", d.name, ignore_permissions=True, force=True)
		else:  # already uploaded — keep the file, it just stops being a scenario request
			frappe.db.set_value("Tax Document", d.name, "requested_reason", None, update_modified=False)
	sc.db_set({"applied_on": None, "applied_by": None, "applied_calculation": None, "before_lines": None})
	doc.add_comment("Comment", _("Tax-planning scenario “{0}” undone; the return's figures are back as they were.").format(sc.title))
	log_event("Update", doc, details={"scenario_undone": sc.name, "calculation": result["calculation"]})
	return {"calculation": result["calculation"], "tax_liability": result["tax_liability"]}
