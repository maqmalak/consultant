# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt
# Rows come from frappe.get_list, so record-level permission hooks apply (a consultant sees only assigned clients).

import frappe
from frappe import _
from frappe.utils import date_diff, flt, getdate, nowdate

def execute(filters=None):
	filters = filters or {}
	cond = {k: v for k, v in filters.items() if v}
	rows = frappe.get_list("Tax Engagement", filters=cond, fields=["name", "client_name", "service", "service_package", "tax_year",
		"agreed_fee", "discount", "net_fee", "payment_status", "sales_invoice"], order_by="creation desc", limit_page_length=0)
	for r in rows:
		r.outstanding = flt(frappe.db.get_value("Sales Invoice", r.sales_invoice, "outstanding_amount")) if r.sales_invoice \
			else flt(r.net_fee or r.agreed_fee) if r.payment_status not in ("Paid", "Waived") else 0
		r.collected = flt(r.net_fee or r.agreed_fee) - r.outstanding if r.payment_status != "Waived" else 0
	cols = [
		{"fieldname": "name", "label": _("Engagement"), "fieldtype": "Link", "options": "Tax Engagement", "width": 160},
		{"fieldname": "client_name", "label": _("Client"), "width": 170}, {"fieldname": "service_package", "label": _("Package"), "width": 140},
		{"fieldname": "tax_year", "label": _("Year"), "width": 70},
	] + [{"fieldname": f, "label": l, "fieldtype": "Currency", "width": 120} for f, l in (("agreed_fee", _("Fee")),
		("discount", _("Discount")), ("collected", _("Collected")), ("outstanding", _("Outstanding")))] + [
		{"fieldname": "payment_status", "label": _("Payment"), "width": 110},
		{"fieldname": "sales_invoice", "label": _("Invoice"), "fieldtype": "Link", "options": "Sales Invoice", "width": 160},
	]
	return cols, rows
