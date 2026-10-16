# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

"""Desk dashboard page. Every figure goes through frappe.get_list, so a consultant sees only assigned clients."""

import frappe
from frappe.utils import flt

from pakistan_tax_consultancy.services import workflow as wf


def _returns():
	return frappe.get_list("Tax Return", fields=["name", "tax_client", "client_name", "tax_year", "workflow_state",
		"tax_liability", "net_tax_payable", "refund_due", "fbr_submission_status", "creation"],
		order_by="creation desc", limit_page_length=0)


@frappe.whitelist()
def get_dashboard_summary():
	rows = _returns()
	counts = {s: 0 for s, *_ in wf.STATES}
	for r in rows:
		counts[r.workflow_state] = counts.get(r.workflow_state, 0) + 1
	return {
		"total_returns": len(rows),
		"state_counts": counts,
		"total_liability": sum(flt(r.tax_liability) for r in rows),
		"total_net_payable": sum(flt(r.net_tax_payable) for r in rows),
		"total_refund_due": sum(flt(r.refund_due) for r in rows),
		"recent_filings": rows[:10],
	}


@frappe.whitelist()
def get_status_distribution():
	counts = get_dashboard_summary()["state_counts"]
	pairs = [(s, n) for s, n in counts.items() if n]
	return {"labels": [p[0] for p in pairs], "values": [p[1] for p in pairs]}


@frappe.whitelist()
def get_tax_over_time():
	months = {}
	for r in _returns():
		key = str(r.creation)[:7]
		months[key] = months.get(key, 0) + flt(r.tax_liability)
	keys = sorted(months)[-12:]
	return {"labels": keys, "values": [months[k] for k in keys]}
