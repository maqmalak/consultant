# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt
# Rows come from frappe.get_list, so record-level permission hooks apply (a consultant sees only assigned clients).

import frappe
from frappe import _
from frappe.utils import date_diff, flt, getdate, nowdate

def execute(filters=None):
	filters = filters or {}
	cond = {"tax_year": filters["tax_year"]} if filters.get("tax_year") else {}
	rows = frappe.get_list("Tax Return", filters=cond, fields=["name", "client_name", "tax_year", "taxpayer_type", "workflow_state",
		"total_income", "taxable_income", "tax_liability", "total_tax_withheld", "total_advance_tax", "net_tax_payable",
		"refund_due"], order_by="tax_year desc, client_name asc", limit_page_length=0)
	cols = [
		{"fieldname": "name", "label": _("Return"), "fieldtype": "Link", "options": "Tax Return", "width": 160},
		{"fieldname": "client_name", "label": _("Client"), "width": 170}, {"fieldname": "tax_year", "label": _("Year"), "width": 70},
		{"fieldname": "taxpayer_type", "label": _("Taxpayer"), "width": 150},
		{"fieldname": "workflow_state", "label": _("Status"), "width": 180},
	] + [{"fieldname": f, "label": l, "fieldtype": "Currency", "width": 130} for f, l in (("total_income", _("Income")),
		("taxable_income", _("Taxable")), ("tax_liability", _("Liability")), ("total_tax_withheld", _("Withheld")),
		("total_advance_tax", _("Advance")), ("net_tax_payable", _("Payable")), ("refund_due", _("Refund")))]
	return cols, rows
