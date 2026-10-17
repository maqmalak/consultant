"""Plain-language details a client enters about their year, and copying them into the return's schedules.

Clients are not tax experts, so they answer in everyday terms (employer, yearly salary, tax deducted, bank profit,
property, car …). Nothing they type touches the return's figures until a consultant reviews it and copies it in.
"""

import frappe
from frappe import _
from frappe.utils import flt, now_datetime

SECTIONS = {
	# section: list of (field, kind)
	"salary": [("employer", "text"), ("annual_salary", "money"), ("tax_deducted", "money")],
	"business": [("name", "text"), ("annual_sales", "money"), ("annual_expenses", "money")],
	"rent": [("property", "text"), ("annual_rent", "money"), ("tax_deducted", "money")],
	"bank": [("bank", "text"), ("balance_30_june", "money"), ("profit", "money"), ("tax_deducted", "money")],
	"property": [("description", "text"), ("city", "text"), ("purchase_year", "text"), ("value", "money")],
	"vehicles": [("make_model", "text"), ("registration_no", "text"), ("value", "money"), ("tax_paid_on_registration", "money")],
	"other_income": [("description", "text"), ("amount", "money")],
	"loans": [("lender", "text"), ("amount", "money")],
}
SINGLE = [("cash_in_hand", "money"), ("household_expenses_monthly", "money"), ("notes", "text")]
FROM_CLIENT = " (from client)"


def clean(details: dict) -> dict:
	out = {}
	for section, fields in SECTIONS.items():
		rows = []
		for row in (details.get(section) or [])[:30]:
			r = {f: (round(flt(row.get(f)), 2) if kind == "money" else str(row.get(f) or "").strip()[:140]) for f, kind in fields}
			if any(v for v in r.values()):
				rows.append(r)
		out[section] = rows
	for f, kind in SINGLE:
		v = details.get(f)
		out[f] = round(flt(v), 2) if kind == "money" else str(v or "").strip()[:2000]
	return out


def copy_into_return(doc) -> int:
	"""Replace earlier client-sourced rows with fresh ones from the client's details. Returns rows added."""
	d = frappe.parse_json(doc.client_details or "{}") or {}
	for table in ("income_sources", "withholding_lines", "asset_lines", "liability_lines", "personal_expense_lines"):
		doc.set(table, [r for r in doc.get(table) if not (r.get("description") or r.get("payer") or "").endswith(FROM_CLIENT)
			and not (r.get("payer_or_employer") or "").endswith(FROM_CLIENT)])
	added = 0

	def add(table, row):
		nonlocal added
		doc.append(table, row)
		added += 1

	def section(code):
		"""The active Withholding Tax Section for a code (149 salary, 151 bank profit, 155 rent, 231B vehicle registration)."""
		return frappe.db.get_value("Withholding Tax Section", {"section_code": code, "is_active": 1}, "name")

	for s in d.get("salary", []):
		add("income_sources", {"income_category": "Salary", "tax_treatment": "Normal", "gross_amount": s["annual_salary"],
			"payer_or_employer": f"{s['employer'] or 'Employer'}{FROM_CLIENT}"})
		if s.get("tax_deducted"):
			add("withholding_lines", {"payer": f"{s['employer'] or 'Employer'}{FROM_CLIENT}", "amount": s["tax_deducted"], "section": section("149")})
	for b in d.get("business", []):
		add("income_sources", {"income_category": "Business", "tax_treatment": "Normal",
			"gross_amount": max(flt(b["annual_sales"]) - flt(b["annual_expenses"]), 0),
			"description": f"{b['name'] or 'Business'}: sales {b['annual_sales']:,.0f} − expenses {b['annual_expenses']:,.0f}{FROM_CLIENT}"})
	for r in d.get("rent", []):
		add("income_sources", {"income_category": "Property (Rent)", "tax_treatment": "Normal", "gross_amount": r["annual_rent"],
			"description": f"{r['property'] or 'Property'}{FROM_CLIENT}"})
		if r.get("tax_deducted"):
			add("withholding_lines", {"payer": f"Tenant — {r['property'] or 'rent'}{FROM_CLIENT}", "amount": r["tax_deducted"], "section": section("155")})
	for b in d.get("bank", []):
		if b.get("profit"):
			# consultant sets the Finance Act rate for this separate-block income in the wizard
			add("income_sources", {"income_category": "Profit on Debt", "tax_treatment": "Separate Block", "gross_amount": b["profit"],
				"description": f"{b['bank'] or 'Bank'} profit{FROM_CLIENT}"})
		if b.get("tax_deducted"):
			add("withholding_lines", {"payer": f"{b['bank'] or 'Bank'}{FROM_CLIENT}", "amount": b["tax_deducted"], "section": section("151")})
		if b.get("balance_30_june"):
			add("asset_lines", {"asset_type": "Bank Balance", "description": f"{b['bank'] or 'Bank'} balance on 30 June{FROM_CLIENT}",
				"cost_value": b["balance_30_june"]})
	for p in d.get("property", []):
		add("asset_lines", {"asset_type": "Immovable Property", "cost_value": p["value"],
			"description": f"{p['description'] or 'Property'} {p['city']} {p['purchase_year']}".strip() + FROM_CLIENT})
	for v in d.get("vehicles", []):
		add("asset_lines", {"asset_type": "Motor Vehicle", "cost_value": v["value"],
			"description": f"{v['make_model'] or 'Vehicle'} {v['registration_no']}".strip() + FROM_CLIENT})
		if v.get("tax_paid_on_registration"):
			# tax collected at registration is claimable withholding for a filer
			add("withholding_lines", {"payer": f"Excise — {v['make_model'] or 'vehicle'} registration{FROM_CLIENT}",
				"amount": v["tax_paid_on_registration"], "section": section("231B")})
	for o in d.get("other_income", []):
		add("income_sources", {"income_category": "Other Sources", "tax_treatment": "Normal", "gross_amount": o["amount"],
			"description": f"{o['description'] or 'Other income'}{FROM_CLIENT}"})
	for loan in d.get("loans", []):
		add("liability_lines", {"liability_type": "Other", "creditor": loan["lender"], "amount": loan["amount"],
			"description": f"Loan{FROM_CLIENT}"})
	if d.get("cash_in_hand"):
		add("asset_lines", {"asset_type": "Cash", "description": f"Cash in hand{FROM_CLIENT}", "cost_value": d["cash_in_hand"]})
	if d.get("household_expenses_monthly"):
		add("personal_expense_lines", {"expense_type": "Other Personal / Household", "amount": flt(d["household_expenses_monthly"]) * 12,
			"description": f"Household expenses (monthly × 12){FROM_CLIENT}"})
	doc.client_details_imported_on = now_datetime()
	doc.client_details_imported_by = frappe.session.user
	return added
