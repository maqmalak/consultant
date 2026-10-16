# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt
# Rows come from frappe.get_list, so record-level permission hooks apply (a consultant sees only assigned clients).

import frappe
from frappe import _
from frappe.utils import date_diff, flt, getdate, nowdate

def execute(filters=None):
	filters = filters or {}
	cond = {}
	if filters.get("status"):
		cond["status"] = filters["status"]
	if filters.get("due_only"):
		cond["follow_up_date"] = ("<=", nowdate())
		cond["status"] = ("not in", ("Converted", "Not Interested"))
	rows = frappe.get_list("Site Visit", filters=cond, fields=["name", "full_name", "mobile", "city", "client_type", "status",
		"visit_date", "follow_up_date", "field_officer", "assigned_consultant", "converted_client"],
		order_by="follow_up_date asc", limit_page_length=0)
	for r in rows:
		r.days_overdue = max(date_diff(nowdate(), r.follow_up_date), 0) if r.follow_up_date and r.status not in ("Converted", "Not Interested") else 0
	cols = [
		{"fieldname": "name", "label": _("Visit"), "fieldtype": "Link", "options": "Site Visit", "width": 150},
		{"fieldname": "full_name", "label": _("Name"), "width": 160}, {"fieldname": "mobile", "label": _("Mobile"), "width": 130},
		{"fieldname": "city", "label": _("City"), "width": 100}, {"fieldname": "status", "label": _("Status"), "width": 110},
		{"fieldname": "visit_date", "label": _("Visit"), "fieldtype": "Date", "width": 100},
		{"fieldname": "follow_up_date", "label": _("Follow-up"), "fieldtype": "Date", "width": 100},
		{"fieldname": "days_overdue", "label": _("Days Overdue"), "fieldtype": "Int", "width": 100},
		{"fieldname": "field_officer", "label": _("Field Officer"), "fieldtype": "Link", "options": "User", "width": 160},
		{"fieldname": "converted_client", "label": _("Client"), "fieldtype": "Link", "options": "Tax Client", "width": 150},
	]
	return cols, rows
