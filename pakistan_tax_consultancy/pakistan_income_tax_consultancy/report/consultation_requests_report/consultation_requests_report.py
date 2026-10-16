# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt
# Rows come from frappe.get_list, so record-level permission hooks apply (a consultant sees only assigned clients).

import frappe
from frappe import _
from frappe.utils import date_diff, flt, getdate, nowdate

def execute(filters=None):
	filters = filters or {}
	cond = {"status": filters["status"]} if filters.get("status") else {}
	rows = frappe.get_list("Consultation Request", filters=cond, fields=["name", "full_name", "mobile", "email", "service", "mode",
		"call_preference", "preferred_date", "preferred_slot", "status", "assigned_to", "lead", "creation"],
		order_by="creation desc", limit_page_length=0)
	cols = [
		{"fieldname": "name", "label": _("Request"), "fieldtype": "Link", "options": "Consultation Request", "width": 150},
		{"fieldname": "full_name", "label": _("Name"), "width": 160}, {"fieldname": "mobile", "label": _("Mobile"), "width": 130},
		{"fieldname": "service", "label": _("Service"), "width": 170}, {"fieldname": "mode", "label": _("Mode"), "width": 80},
		{"fieldname": "call_preference", "label": _("When"), "width": 90},
		{"fieldname": "preferred_date", "label": _("Date"), "fieldtype": "Date", "width": 100},
		{"fieldname": "status", "label": _("Status"), "width": 100},
		{"fieldname": "assigned_to", "label": _("Assigned"), "fieldtype": "Link", "options": "User", "width": 150},
		{"fieldname": "lead", "label": _("Lead"), "fieldtype": "Link", "options": "Lead", "width": 140},
		{"fieldname": "creation", "label": _("Received"), "fieldtype": "Datetime", "width": 150},
	]
	return cols, rows
