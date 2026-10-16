# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt
# Rows come from frappe.get_list, so record-level permission hooks apply (a consultant sees only assigned clients).

import frappe
from frappe import _
from frappe.utils import date_diff, flt, getdate, nowdate

WAITING = ("Pending Review", "Under Review", "Reviewed", "Awaiting Client Confirmation", "Approved", "Submitted to FBR", "Filing Error")


def execute(filters=None):
	rows = frappe.get_list("Tax Return", filters={"workflow_state": ("in", WAITING)}, fields=["name", "client_name", "tax_year",
		"workflow_state", "assigned_consultant", "reviewer", "approver", "client_confirmed"], limit_page_length=0)
	since = {}
	if rows:
		for e in frappe.get_all("Tax Audit Event", filters={"reference_doctype": "Tax Return",
				"reference_name": ("in", [r.name for r in rows]), "event_type": "Status Change"},
				fields=["reference_name", "to_state", "timestamp"], order_by="timestamp asc"):
			since[(e.reference_name, e.to_state)] = e.timestamp
	for r in rows:
		entered = since.get((r.name, r.workflow_state))
		r.days_in_state = date_diff(nowdate(), entered) if entered else None
	rows.sort(key=lambda r: -(r.days_in_state or 0))
	cols = [
		{"fieldname": "name", "label": _("Return"), "fieldtype": "Link", "options": "Tax Return", "width": 160},
		{"fieldname": "client_name", "label": _("Client"), "width": 170}, {"fieldname": "tax_year", "label": _("Year"), "width": 70},
		{"fieldname": "workflow_state", "label": _("Waiting In"), "width": 210},
		{"fieldname": "days_in_state", "label": _("Days"), "fieldtype": "Int", "width": 70},
		{"fieldname": "assigned_consultant", "label": _("Consultant"), "fieldtype": "Link", "options": "User", "width": 160},
		{"fieldname": "reviewer", "label": _("Reviewer"), "fieldtype": "Link", "options": "User", "width": 160},
		{"fieldname": "client_confirmed", "label": _("Client Confirmed"), "fieldtype": "Check", "width": 110},
	]
	return cols, rows
