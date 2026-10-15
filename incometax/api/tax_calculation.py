"""Tax calculation engine for Pakistan Income Tax Consultancy.

Provides server-side computation of tax liability from a Tax Return's
income, deduction, credit and payment lines using active slab rules
and tax credit rules.

All functions are ``@frappe.whitelist()`` so they can be called from
the frontend / REST API.
"""

import frappe
from frappe import _
from frappe.utils import flt, getdate


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_active_slab_rules(tax_year, tax_regime, taxpayer_type):
    """Return active Tax Slab Rule rows ordered by priority, with their slabs."""
    rules = frappe.get_all(
        "Tax Slab Rule",
        filters={
            "tax_year": tax_year,
            "tax_regime": tax_regime,
            "taxpayer_type": taxpayer_type,
            "is_active": 1,
        },
        fields=["name", "rule_title", "priority"],
        order_by="priority asc, creation asc",
        limit=1,
    )
    if not rules:
        frappe.throw(
            _("No active Tax Slab Rule found for year {0}, regime {1}, taxpayer {2}").format(
                tax_year, tax_regime, taxpayer_type
            ),
            title=_("Missing Slab Rule"),
        )

    rule = frappe.get_doc("Tax Slab Rule", rules[0].name)
    slabs = []
    for s in rule.slabs or []:
        slabs.append(
            {
                "from_amount": flt(s.from_amount),
                "to_amount": flt(s.to_amount) if s.to_amount else None,
                "fixed_tax": flt(s.fixed_tax),
                "rate_percent": flt(s.rate_percent),
            }
        )
    return rule, slabs


def _get_active_credit_rules(tax_year, taxpayer_type):
    """Return active Tax Credit Rules for the year / taxpayer type."""
    return frappe.get_all(
        "Tax Credit Rule",
        filters={
            "tax_year": tax_year,
            "taxpayer_type": taxpayer_type,
            "is_active": 1,
        },
        fields=["name", "credit_name", "section_reference", "calculation_method",
                "rate_percent", "max_percent_of_taxable_income", "max_amount"],
        order_by="creation asc",
    )


def _compute_slab_tax(taxable_income, slabs):
    """Progressive slab computation."""
    taxable_income = flt(taxable_income)
    tax = 0.0
    for slab in slabs:
        lo = flt(slab["from_amount"])
        hi = slab["to_amount"]
        if taxable_income <= lo:
            continue
        upper = hi if hi is not None else taxable_income
        chunk = min(taxable_income, upper) - lo
        if chunk <= 0:
            continue
        tax += flt(slab["fixed_tax"]) + (chunk * flt(slab["rate_percent"]) / 100.0)
    return tax


def _compute_tax_credits(taxable_income, tax_on_income, credit_lines, credit_rules):
    """Apply tax credit rules to the credit lines on the return."""
    total_credit = 0.0
    rule_by_name = {r["name"]: r for r in credit_rules}
    for line in credit_lines or []:
        credit_rule_name = line.get("credit_rule")
        eligible = flt(line.get("eligible_amount"))
        claimed = flt(line.get("credit_amount"))
        if not credit_rule_name or credit_rule_name not in rule_by_name:
            total_credit += claimed
            continue
        rule = rule_by_name[credit_rule_name]
        credit = min(claimed, eligible)
        pct_cap = flt(rule.get("max_percent_of_taxable_income"))
        if pct_cap:
            credit = min(credit, taxable_income * pct_cap / 100.0)
        amt_cap = flt(rule.get("max_amount"))
        if amt_cap:
            credit = min(credit, amt_cap)
        credit = min(credit, tax_on_income)
        total_credit += credit
    return total_credit


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


@frappe.whitelist()
def calculate_tax(tax_return):
    """Compute tax liability for a Tax Return and (re)create a Tax Calculation.

    Parameters
    ----------
    tax_return : str
        Name of the Tax Return document.

    Returns
    -------
    dict
        The saved Tax Calculation document as a dict.
    """
    doc = frappe.get_doc("Tax Return", tax_return)

    from incometax.permissions import get_scope, can_access_client
    scope = get_scope()
    if scope not in ("all", "consultant"):
        frappe.throw(_("Only a Tax Consultant or admin can calculate tax."), frappe.PermissionError)
    if scope == "consultant" and not can_access_client(doc.tax_client):
        frappe.throw(_("You cannot access client {0}").format(doc.tax_client), frappe.PermissionError)

    tax_year = doc.tax_year
    tax_regime = doc.tax_regime
    taxpayer_type = doc.taxpayer_type or "Individual"

    income_lines = doc.get("income_lines") or []
    gross_income = sum(flt(l.get("gross_amount")) for l in income_lines)
    exempt_income = sum(flt(l.get("exempt_amount")) for l in income_lines)
    taxable_income_from_lines = sum(flt(l.get("taxable_amount")) for l in income_lines)

    deduction_lines = doc.get("deduction_lines") or []
    total_deductions = sum(flt(l.get("amount")) for l in deduction_lines)

    credit_rules = _get_active_credit_rules(tax_year, taxpayer_type)
    credit_lines = doc.get("credit_lines") or []

    rule, slabs = _get_active_slab_rules(tax_year, tax_regime, taxpayer_type)

    taxable_income = max(flt(taxable_income_from_lines) - flt(total_deductions), 0)
    tax_on_taxable_income = _compute_slab_tax(taxable_income, slabs)

    separate_block_tax = sum(
        flt(l.get("taxable_amount")) for l in income_lines
        if l.get("tax_treatment") == "Separate Block"
    )
    fixed_tax = sum(flt(s["fixed_tax"]) for s in slabs if taxable_income > flt(s["from_amount"]))
    total_tax = flt(tax_on_taxable_income) + flt(separate_block_tax) + flt(fixed_tax)

    total_tax_credits = _compute_tax_credits(
        taxable_income, flt(tax_on_taxable_income), credit_lines, credit_rules
    )

    tax_liability = max(flt(total_tax) - flt(total_tax_credits), 0)
    payment_lines = doc.get("payment_lines") or []
    tax_already_paid = sum(flt(l.get("amount")) for l in payment_lines)
    net_payable = max(flt(tax_liability) - flt(tax_already_paid), 0)
    refund_due = max(flt(tax_already_paid) - flt(tax_liability), 0)

    existing = frappe.db.get_value(
        "Tax Calculation", {"tax_return": doc.name}, "name"
    )
    if existing:
        calc = frappe.get_doc("Tax Calculation", existing)
    else:
        calc = frappe.new_doc("Tax Calculation")

    calc.tax_return = doc.name
    calc.tax_client = doc.tax_client
    calc.client_name = doc.client_name
    calc.tax_year = tax_year
    calc.tax_regime = tax_regime
    calc.taxpayer_type = taxpayer_type
    calc.calculation_version = (flt(calc.calculation_version) + 1) if calc.calculation_version else 1
    calc.calculated_on = frappe.utils.now()
    calc.calculated_by = frappe.session.user
    calc.rules_are_demo = 0

    calc.sb_income = 1
    calc.total_income = flt(gross_income)
    calc.total_deductions = flt(total_deductions)
    calc.taxable_income = flt(taxable_income)

    calc.sb_tax = 1
    calc.applied_slab_from = slabs[0]["from_amount"] if slabs else 0
    calc.applied_slab_to = slabs[-1]["to_amount"] if slabs and slabs[-1]["to_amount"] else 0
    calc.fixed_tax = flt(fixed_tax)
    calc.rate_percent = slabs[-1]["rate_percent"] if slabs else 0
    calc.sb_tax = 1
    calc.tax_on_taxable_income = flt(tax_on_taxable_income)
    calc.separate_block_tax = flt(separate_block_tax)
    calc.total_tax_credits = flt(total_tax_credits)
    calc.tax_liability = flt(tax_liability)

    calc.sb_verify = 1
    calc.tax_already_paid = flt(tax_already_paid)
    calc.net_payable = flt(net_payable)
    calc.refund_due = flt(refund_due)

    calc.input_hash = ""
    calc.calculation_log = frappe.as_json(
        {
            "slab_rule": rule.name,
            "slabs": slabs,
            "credit_rules": [r["name"] for r in credit_rules],
            "gross_income": gross_income,
            "exempt_income": exempt_income,
            "total_deductions": total_deductions,
            "taxable_income": taxable_income,
            "tax_on_taxable_income": tax_on_taxable_income,
            "total_tax_credits": total_tax_credits,
            "tax_liability": tax_liability,
            "tax_already_paid": tax_already_paid,
            "net_payable": net_payable,
            "refund_due": refund_due,
        },
        indent=2,
    )
    calc.reviewer_verified = 0

    calc.save(ignore_permissions=True)
    frappe.db.commit()

    return calc.as_dict()


@frappe.whitelist()
def recalculate_tax(tax_return):
    """Alias for calculate_tax kept for backwards-compatible frontend calls."""
    return calculate_tax(tax_return)

