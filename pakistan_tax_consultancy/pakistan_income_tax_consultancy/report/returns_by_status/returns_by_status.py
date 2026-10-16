# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt
# Rows come from frappe.get_list, so record-level permission hooks apply (a consultant sees only assigned clients).

import frappe
from frappe import _
from frappe.utils import date_diff, flt, getdate, nowdate

def execute(filters=None):
	from pakistan_tax_consultancy.services.workflow import STATES

	filters = filters or {}
	cond = {"tax_year": filters["tax_year"]} if filters.get("tax_year") else {}
	rows = frappe.get_list("Tax Return", filters=cond, fields=["tax_year", "workflow_state", "tax_liability", "net_tax_payable",
		"refund_due"], limit_page_length=0)
	agg = {}
	for r in rows:
		key = (r.tax_year, r.workflow_state)
		a = agg.setdefault(key, frappe._dict(tax_year=r.tax_year, workflow_state=r.workflow_state, returns=0,
			tax_liability=0, net_tax_payable=0, refund_due=0))
		a.returns += 1
		a.tax_liability += flt(r.tax_liability)
		a.net_tax_payable += flt(r.net_tax_payable)
		a.refund_due += flt(r.refund_due)
	order = {s[0]: i for i, s in enumerate(STATES)}
	data = sorted(agg.values(), key=lambda a: (a.tax_year or "", order.get(a.workflow_state, 99)))
	cols = [
		{"fieldname": "tax_year", "label": _("Tax Year"), "width": 90},
		{"fieldname": "workflow_state", "label": _("Status"), "width": 220},
		{"fieldname": "returns", "label": _("Returns"), "fieldtype": "Int", "width": 90},
		{"fieldname": "tax_liability", "label": _("Tax Liability"), "fieldtype": "Currency", "width": 140},
		{"fieldname": "net_tax_payable", "label": _("Payable"), "fieldtype": "Currency", "width": 130},
		{"fieldname": "refund_due", "label": _("Refunds"), "fieldtype": "Currency", "width": 130},
	]
	chart = {"data": {"labels": [d.workflow_state for d in data], "datasets": [{"name": _("Returns"), "values": [d.returns for d in data]}]},
		"type": "bar"}
	return cols, data, None, chart
