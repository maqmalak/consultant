"""Tax simulator (what-if) for one Tax Return: move income, add-backs, deductions, credits and tax paid on sliders,
see the tax at once next to the actual figures and last year's return, and keep scenarios to compare and print.

Nothing here writes to the return. The simulation runs the same pure `tax_calc.compute` on an adjusted snapshot, so the
rates still come only from Tax Slab Setting / Tax Credit Rule / the income line — never from code. Every figure is an
estimate for planning; the return is calculated and filed through the normal workflow.
"""

import copy

import frappe
from frappe import _
from frappe.utils import cint, flt

from pakistan_tax_consultancy.services import tax_calc

# lever groups, in the order the simulator shows them
GROUPS = {
	"income": _("Income"),
	"addback": _("Add-backs"),
	"deduction": _("Deductible allowances"),
	"credit": _("Tax credits"),
	"paid": _("Tax already paid"),
}
ADDBACK = "addback"
METRICS = (
	("gross_income", _("Total income")),
	("total_deductions", _("Deductible allowances")),
	("taxable_income", _("Taxable income")),
	("normal_tax", _("Tax on taxable income")),
	("separate_tax", _("Final / separate block tax")),
	("total_tax_credits", _("Tax credits")),
	("tax_liability", _("Tax liability")),
	("tax_paid", _("Tax already paid")),
	("net_payable", _("Payable")),
	("refund_due", _("Refund")),
)
WEALTH = (("total_assets", _("Assets")), ("total_liabilities", _("Liabilities")), ("net_wealth", _("Net wealth")),
	("total_personal_expenses", _("Personal expenses")))


# ---------------------------------------------------------------- levers
def _income_key(line):
	return f"inc|{line['income_category']}|{line['tax_treatment']}"


def amounts(snap: dict) -> dict:
	"""Lever key -> amount for a snapshot (income at gross)."""
	out = {}

	def add(key, value):
		out[key] = out.get(key, 0.0) + flt(value)

	for line in snap["income"]:
		add(ADDBACK if line.get("addback") else _income_key(line), line["gross_amount"])
	for d in snap["deductions"]:
		add(f"ded|{d.get('deduction_type') or 'Other'}", d["amount"])
	for c in snap["credits"]:
		add(f"cr|{c.get('credit_type') or 'Other'}", c["credit_amount"])
	add("wht", sum(flt(w["amount"]) for w in snap["withholding"]))
	add("adv", sum(flt(a["amount"]) for a in snap["advance_tax"]))
	out.setdefault(ADDBACK, 0.0)
	return out


def _label(key):
	kind, *rest = key.split("|")
	if kind == "inc":
		category, treatment = rest
		return _(category) if treatment == tax_calc.NORMAL else f"{_(category)} · {_(treatment)}"
	if kind in ("ded", "cr"):
		return _(rest[0])
	return {"wht": _("Withheld at source"), "adv": _("Advance tax paid"), ADDBACK: _("Add-backs (inadmissible expenses)")}[kind]


def _group(key):
	kind = key.split("|")[0]
	return {"inc": "income", "ded": "deduction", "cr": "credit", "wht": "paid", "adv": "paid", ADDBACK: "addback"}[kind]


def levers(snap: dict, ly_snap: dict | None) -> list[dict]:
	"""Every lever with this year's amount and last year's (a lever exists if either year has it)."""
	now, ly = amounts(snap), amounts(ly_snap) if ly_snap else {}
	keys = list(dict.fromkeys([*now, *ly]))
	order = list(GROUPS)
	keys.sort(key=lambda k: (order.index(_group(k)), k))
	hints = {ADDBACK: _("Expenses not allowed against business income (e.g. personal use, no withholding, cash over limit) are added back to profit and taxed at normal rates.")}
	out = []
	for k in keys:
		base, last = round(now.get(k, 0.0), 2), (round(ly[k], 2) if k in ly else None)
		out.append({"key": k, "label": _label(k), "group": _group(k), "base": base, "last_year": last, "hint": hints.get(k),
			"max": _slider_max(base, last)})
	return out


def _slider_max(base, last):
	top = max(flt(base), flt(last))
	if top <= 0:
		return 1_000_000
	# round up to a friendly step, with room to grow 50 %
	step = 10 ** max(len(str(int(top * 1.5))) - 2, 3)
	return int(-(-top * 1.5 // step) * step)


# ---------------------------------------------------------------- simulate
def apply(snap: dict, values: dict, ly_snap: dict | None = None) -> dict:
	"""A copy of `snap` with every lever set to `values[key]` (lines in a group are scaled together)."""
	s = copy.deepcopy(snap)
	values = {k: max(flt(v), 0.0) for k, v in (values or {}).items()}
	now = amounts(snap)
	ly_lines = {}
	for line in (ly_snap or {}).get("income", []):
		ly_lines.setdefault(_income_key(line), line)

	inc_key = lambda r: ADDBACK if r.get("addback") else _income_key(r)  # noqa: E731

	def scale(rows, key_of, fields, key, target):
		mine = [r for r in rows if key_of(r) == key]
		base = sum(flt(r[fields[0]]) for r in mine)
		if base > 0:
			f = target / base
			for r in mine:
				for fld in fields:
					r[fld] = flt(r.get(fld)) * f
			return None
		return target  # nothing to scale: the caller adds a line

	for key, target in values.items():
		if abs(target - now.get(key, 0.0)) < 0.5:
			continue
		kind, *rest = key.split("|")
		if kind == "inc":
			left = scale(s["income"], inc_key, ("gross_amount", "exempt_amount", "taxable_amount"), key, target)
			if left:
				category, treatment = rest
				rate = flt((ly_lines.get(key) or {}).get("tax_rate_percent"))
				s["income"].append({"income_category": category, "tax_treatment": treatment, "gross_amount": left, "exempt_amount": 0,
					"taxable_amount": 0 if treatment == "Exempt" else left, "tax_rate_percent": rate})
		elif kind == "ded":
			left = scale(s["deductions"], lambda r: f"ded|{r.get('deduction_type') or 'Other'}", ("amount",), key, target)
			if left:
				s["deductions"].append({"deduction_type": rest[0], "amount": left})
		elif kind == "cr":
			left = scale(s["credits"], lambda r: f"cr|{r.get('credit_type') or 'Other'}", ("credit_amount", "eligible_amount"), key, target)
			if left:
				s["credits"].append({"credit_type": rest[0], "credit_rule": None, "eligible_amount": left, "credit_amount": left})
		elif kind in ("wht", "adv"):
			table = "withholding" if kind == "wht" else "advance_tax"
			s[table] = [{"section" if kind == "wht" else "cpr_no": None, "amount": target}] if target else []
		elif kind == ADDBACK:
			left = scale(s["income"], inc_key, ("gross_amount", "exempt_amount", "taxable_amount"), key, target)
			if left:
				s["income"].append({"income_category": "Business", "tax_treatment": tax_calc.NORMAL, "gross_amount": left,
					"exempt_amount": 0, "taxable_amount": left, "tax_rate_percent": 0, "addback": 1})
	return s


def run(snap: dict, tax_year: str, regime=None) -> dict:
	_setting, slabs = tax_calc.get_slab_setting(tax_year, snap["taxpayer_type"], regime)
	result = tax_calc.compute(snap, slabs, tax_calc.get_credit_rules(tax_year, snap["taxpayer_type"]))
	result.pop("slab", None)
	result["effective_rate"] = round(result["tax_liability"] * 100 / result["gross_income"], 2) if result["gross_income"] else 0
	return result


def last_year_return(doc):
	"""The client's return for the previous tax year (latest revision first), if there is one."""
	try:
		prev = str(cint(doc.tax_year) - 1)
	except (TypeError, ValueError):
		return None
	name = frappe.db.get_value("Tax Return", {"tax_client": doc.tax_client, "tax_year": prev}, "name", order_by="creation desc")
	return frappe.get_doc("Tax Return", name) if name else None


def _stored(doc):
	"""Last year's figures as saved on the return (used when its year has no slab setting any more)."""
	paid = flt(doc.total_tax_withheld) + flt(doc.total_advance_tax)
	return {"gross_income": flt(doc.total_income), "total_deductions": flt(doc.total_deductions), "taxable_income": flt(doc.taxable_income),
		"normal_tax": None, "separate_tax": None, "total_tax_credits": flt(doc.total_tax_credits), "tax_liability": flt(doc.tax_liability),
		"tax_paid": paid, "net_payable": flt(doc.net_tax_payable), "refund_due": flt(doc.refund_due),
		"effective_rate": round(flt(doc.tax_liability) * 100 / flt(doc.total_income), 2) if flt(doc.total_income) else 0}


def _wealth(doc):
	return {k: flt(doc.get(k)) for k, _l in WEALTH} if doc else None


def context(doc) -> dict:
	"""Everything the simulator page needs once: levers, actual, last year (figures + wealth)."""
	snap = tax_calc.snapshot(doc)
	ly = last_year_return(doc)
	ly_snap = tax_calc.snapshot(ly) if ly else None
	ly_result = None
	if ly:
		try:
			ly_result = run(ly_snap, ly.tax_year, ly.get("tax_regime"))
		except frappe.ValidationError:
			frappe.clear_last_message()
			ly_result = _stored(ly)
	setting, _slabs = tax_calc.get_slab_setting(doc.tax_year, snap["taxpayer_type"], doc.get("tax_regime"))
	return {
		"tax_return": doc.name, "tax_client": doc.tax_client, "client_name": doc.client_name, "tax_year": doc.tax_year,
		"taxpayer_type": snap["taxpayer_type"], "workflow_state": doc.workflow_state, "rules_are_demo": tax_calc.is_demo(setting),
		"groups": GROUPS, "metrics": METRICS, "wealth_metrics": WEALTH,
		"levers": levers(snap, ly_snap),
		"actual": run(snap, doc.tax_year, doc.get("tax_regime")),
		"last_year": {"tax_return": ly.name, "tax_year": ly.tax_year, "workflow_state": ly.workflow_state, "result": ly_result,
			"wealth": _wealth(ly)} if ly else None,
		"wealth": _wealth(doc),
	}


def simulate(doc, values: dict) -> dict:
	snap = tax_calc.snapshot(doc)
	ly = last_year_return(doc)
	return run(apply(snap, values, tax_calc.snapshot(ly) if ly else None), doc.tax_year, doc.get("tax_regime"))


# ---------------------------------------------------------------- report (print format "PTC Tax Planning Report")
def ptc_scenario_report(name: str) -> dict:
	"""Jinja helper: one scenario next to the actual figures, last year and up to two other saved scenarios."""
	sc = frappe.get_doc("Tax Scenario", name)
	doc = frappe.get_doc("Tax Return", sc.tax_return)
	ctx = context(doc)
	values = frappe.parse_json(sc.levers) or {}
	others = frappe.get_all("Tax Scenario", {"tax_return": doc.name, "name": ("!=", sc.name)}, ["name", "title", "result"],
		order_by="creation desc", limit=2)
	columns = []
	if ctx["last_year"]:
		columns.append({"title": _("Last year (TY{0})").format(ctx["last_year"]["tax_year"]), "result": ctx["last_year"]["result"]})
	columns.append({"title": _("Actual (TY{0})").format(doc.tax_year), "result": ctx["actual"]})
	columns.append({"title": sc.title, "result": simulate(doc, values), "main": True})
	columns += [{"title": o.title, "result": frappe.parse_json(o.result) or {}} for o in reversed(others)]
	changes = []
	for lv in ctx["levers"]:
		if lv["key"] in values and abs(flt(values[lv["key"]]) - lv["base"]) >= 1:
			changes.append({**lv, "value": flt(values[lv["key"]]), "delta": flt(values[lv["key"]]) - lv["base"]})
	return {"scenario": sc, "ctx": ctx, "columns": columns, "changes": changes, "metrics": METRICS}
