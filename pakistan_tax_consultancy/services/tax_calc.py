"""Income tax calculation for a Tax Return (and the public salary calculator).

Rates never live in code: slabs come from Tax Slab Setting (tax year + taxpayer type), credits from Tax Credit
Rule, and final / separate-block income carries its own rate on the income line (entered from the Finance Act).

A slab row reads like the Finance Act schedule: "where taxable income exceeds `from_amount` but does not exceed
`to_amount`, tax is `fixed_tax` + `rate_percent` % of the amount exceeding `from_amount`". Exactly one slab applies.
"""

import hashlib
import json

import frappe
from frappe import _
from frappe.utils import flt, getdate, now_datetime

CLIENT_TO_TAXPAYER = {
	"Individual-Salaried": "Salaried Individual",
	"Individual-Business": "Non-Salaried Individual",
	"AOP": "AOP",
	"Company": "Company",
	"Other": "Non-Salaried Individual",
}

NORMAL = "Normal"
SEPARATE = ("Final / Fixed", "Separate Block")


# ----------------------------------------------------------------------------------------------- pure functions
def slab_tax(taxable_income: float, slabs: list[dict]) -> tuple[float, dict | None]:
	"""Tax on `taxable_income` from the one slab it falls in. Returns (tax, slab)."""
	income = flt(taxable_income)
	if income <= 0:
		return 0.0, None
	for slab in sorted(slabs, key=lambda s: flt(s["from_amount"])):
		lo, hi = flt(slab["from_amount"]), slab.get("to_amount")
		if income > lo and (not hi or income <= flt(hi)):
			return flt(slab["fixed_tax"]) + (income - lo) * flt(slab["rate_percent"]) / 100.0, slab
	return 0.0, None


def compute(inputs: dict, slabs: list[dict], credit_rules: list[dict] | None = None) -> dict:
	"""Pure computation from a plain-dict snapshot of the return (see `snapshot`)."""
	credit_rules = {r["name"]: r for r in (credit_rules or [])}
	normal_income = separate_tax = gross = exempt = 0.0
	for line in inputs["income"]:
		gross += flt(line["gross_amount"])
		exempt += flt(line["exempt_amount"])
		taxable = flt(line["taxable_amount"])
		if line["tax_treatment"] == NORMAL:
			normal_income += taxable
		elif line["tax_treatment"] in SEPARATE:
			separate_tax += taxable * flt(line.get("tax_rate_percent")) / 100.0

	deductions = sum(flt(d["amount"]) for d in inputs["deductions"])
	taxable_income = max(normal_income - deductions, 0.0)
	normal_tax, slab = slab_tax(taxable_income, slabs)

	credits = 0.0
	for line in inputs["credits"]:
		claimed = flt(line["credit_amount"])
		rule = credit_rules.get(line.get("credit_rule"))
		if rule:
			claimed = min(claimed, flt(line.get("eligible_amount")) or claimed)
			if flt(rule.get("max_percent_of_taxable_income")):
				claimed = min(claimed, taxable_income * flt(rule["max_percent_of_taxable_income"]) / 100.0)
			if flt(rule.get("max_amount")):
				claimed = min(claimed, flt(rule["max_amount"]))
		credits += claimed
	credits = min(credits, normal_tax)  # credits reduce normal tax only, never below zero

	liability = max(normal_tax - credits, 0.0) + separate_tax
	withheld = sum(flt(w["amount"]) for w in inputs["withholding"])
	advance = sum(flt(a["amount"]) for a in inputs["advance_tax"])
	paid = withheld + advance
	return {
		"gross_income": round(gross, 2),
		"exempt_income": round(exempt, 2),
		"normal_income": round(normal_income, 2),
		"total_deductions": round(deductions, 2),
		"taxable_income": round(taxable_income, 2),
		"normal_tax": round(normal_tax, 2),
		"separate_tax": round(separate_tax, 2),
		"total_tax_credits": round(credits, 2),
		"tax_liability": round(liability, 2),
		"total_tax_withheld": round(withheld, 2),
		"total_advance_tax": round(advance, 2),
		"tax_paid": round(paid, 2),
		"net_payable": round(max(liability - paid, 0.0), 2),
		"refund_due": round(max(paid - liability, 0.0), 2),
		"slab": slab,
	}


def input_hash(inputs: dict) -> str:
	return hashlib.sha256(json.dumps(inputs, sort_keys=True, default=str).encode()).hexdigest()


# ----------------------------------------------------------------------------------------------- data access
def taxpayer_type_for(doc) -> str:
	if doc.get("taxpayer_type"):
		return doc.taxpayer_type
	client_type = frappe.db.get_value("Tax Client", doc.tax_client, "client_type") if doc.get("tax_client") else None
	return CLIENT_TO_TAXPAYER.get(client_type or "", "Salaried Individual")


def snapshot(doc) -> dict:
	"""Every input the calculation reads, as plain data (also the basis of the input hash)."""

	def rows(table, fields):
		return [{f: row.get(f) for f in fields} for row in doc.get(table) or []]

	income = []
	for row in doc.get("income_sources") or []:
		taxable = row.taxable_amount
		if not taxable and row.tax_treatment != "Exempt":
			taxable = max(flt(row.gross_amount) - flt(row.exempt_amount), 0)
		income.append({"income_category": row.income_category, "tax_treatment": row.tax_treatment or NORMAL,
			"gross_amount": flt(row.gross_amount), "exempt_amount": flt(row.exempt_amount),
			"taxable_amount": 0 if row.tax_treatment == "Exempt" else flt(taxable),
			"tax_rate_percent": flt(row.get("tax_rate_percent"))})
	return {
		"tax_year": doc.tax_year,
		"taxpayer_type": taxpayer_type_for(doc),
		"tax_regime": doc.get("tax_regime"),
		"income": income,
		"deductions": rows("deduction_lines", ("deduction_type", "amount")),
		"credits": rows("credit_lines", ("credit_type", "credit_rule", "eligible_amount", "credit_amount")),
		"withholding": rows("withholding_lines", ("section", "amount")),
		"advance_tax": rows("advance_tax_lines", ("cpr_no", "amount")),
	}


def get_slab_setting(tax_year: str, taxpayer_type: str, tax_regime: str | None = None, on_date=None):
	"""Active Tax Slab Setting for the year and taxpayer type (regime-specific first), with its slab rows."""
	on_date = getdate(on_date) if on_date else None
	candidates = frappe.get_all("Tax Slab Setting",
		filters={"tax_year": tax_year, "taxpayer_type": taxpayer_type, "is_active": 1},
		fields=["name", "tax_regime", "priority", "effective_from", "effective_to", "validation_status"],
		order_by="priority asc, creation asc")
	if on_date:
		candidates = [c for c in candidates if (not c.effective_from or getdate(c.effective_from) <= on_date)
			and (not c.effective_to or getdate(c.effective_to) >= on_date)]
	candidates.sort(key=lambda c: (0 if tax_regime and c.tax_regime == tax_regime else 1 if not c.tax_regime else 2))
	if not candidates:
		frappe.throw(_("No active Tax Slab Setting for Tax Year {0} and taxpayer type {1}.").format(tax_year, taxpayer_type),
			title=_("Slabs Missing"))
	setting = frappe.get_doc("Tax Slab Setting", candidates[0].name)
	slabs = [{"from_amount": flt(s.from_amount), "to_amount": flt(s.to_amount) or None, "fixed_tax": flt(s.fixed_tax),
		"rate_percent": flt(s.rate_percent)} for s in setting.slabs]
	return setting, slabs


def get_credit_rules(tax_year: str, taxpayer_type: str) -> list[dict]:
	return frappe.get_all("Tax Credit Rule", filters={"tax_year": tax_year, "is_active": 1,
		"taxpayer_type": ("in", ["", taxpayer_type])},
		fields=["name", "max_percent_of_taxable_income", "max_amount"])


def is_demo(setting) -> bool:
	return "DEMO" in (setting.get("validation_status") or "").upper() or "NOT" in (setting.get("validation_status") or "").upper()


# ----------------------------------------------------------------------------------------------- persistence
def calculate_return(doc, save=True) -> dict:
	"""Compute, write the totals onto the return and keep a versioned Tax Calculation record."""
	inputs = snapshot(doc)
	setting, slabs = get_slab_setting(doc.tax_year, inputs["taxpayer_type"], doc.get("tax_regime"))
	result = compute(inputs, slabs, get_credit_rules(doc.tax_year, inputs["taxpayer_type"]))
	version = (doc.get("calculation_version") or 0) + 1
	now = now_datetime()

	doc.taxpayer_type = inputs["taxpayer_type"]
	doc.total_income = result["gross_income"]
	doc.total_deductions = result["total_deductions"]
	doc.total_tax_credits = result["total_tax_credits"]
	doc.total_tax_withheld = result["total_tax_withheld"]
	doc.total_advance_tax = result["total_advance_tax"]
	doc.taxable_income = result["taxable_income"]
	doc.tax_liability = result["tax_liability"]
	doc.net_tax_payable = result["net_payable"]
	doc.refund_due = result["refund_due"]
	doc.calculation_version = version
	doc.calculated_on = now
	doc.calc_input_hash = input_hash(inputs)

	calc = frappe.get_doc({
		"doctype": "Tax Calculation",
		"tax_return": doc.name,
		"tax_client": doc.tax_client,
		"client_name": doc.client_name,
		"tax_year": doc.tax_year,
		"tax_regime": doc.get("tax_regime"),
		"taxpayer_type": inputs["taxpayer_type"],
		"calculation_version": version,
		"calculated_on": now,
		"calculated_by": frappe.session.user,
		"rules_are_demo": 1 if is_demo(setting) else 0,
		"total_income": result["gross_income"],
		"total_deductions": result["total_deductions"],
		"taxable_income": result["taxable_income"],
		"slab_setting": setting.name,
		"applied_slab_from": (result["slab"] or {}).get("from_amount"),
		"applied_slab_to": (result["slab"] or {}).get("to_amount"),
		"fixed_tax": (result["slab"] or {}).get("fixed_tax"),
		"rate_percent": (result["slab"] or {}).get("rate_percent"),
		"tax_on_taxable_income": result["normal_tax"],
		"separate_block_tax": result["separate_tax"],
		"total_tax_credits": result["total_tax_credits"],
		"tax_liability": result["tax_liability"],
		"tax_already_paid": result["tax_paid"],
		"net_payable": result["net_payable"],
		"refund_due": result["refund_due"],
		"input_hash": doc.calc_input_hash,
		"calculation_log": json.dumps({"inputs": inputs, "slabs": slabs, "result": result}, indent=1, default=str),
	})
	calc.flags.ignore_permissions = True
	calc.insert()
	doc.latest_calculation = calc.name
	if save:
		doc.flags.from_calculation = True
		doc.save()
	result.update(version=version, calculation=calc.name, rules_are_demo=bool(calc.rules_are_demo))
	return result


def is_calculation_current(doc) -> bool:
	return bool(doc.get("calc_input_hash")) and doc.calc_input_hash == input_hash(snapshot(doc))


# ----------------------------------------------------------------------------------------------- salary calculator
def salary_tax(monthly_salary: float, tax_year: str) -> dict:
	"""Public salary calculator — estimate only."""
	annual = flt(monthly_salary) * 12
	setting, slabs = get_slab_setting(tax_year, "Salaried Individual")
	tax, slab = slab_tax(annual, slabs)
	return {
		"tax_year": tax_year,
		"monthly_salary": round(flt(monthly_salary), 2),
		"annual_salary": round(annual, 2),
		"annual_tax": round(tax, 2),
		"monthly_tax": round(tax / 12, 2),
		"monthly_take_home": round(flt(monthly_salary) - tax / 12, 2),
		"effective_rate": round(tax * 100 / annual, 2) if annual else 0,
		"slab": slab,
		"rules_are_demo": is_demo(setting),
	}
