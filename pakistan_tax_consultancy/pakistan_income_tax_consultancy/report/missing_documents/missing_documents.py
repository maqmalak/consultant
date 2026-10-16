# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt
# Rows come from frappe.get_list, so record-level permission hooks apply (a consultant sees only assigned clients).

import frappe
from frappe import _
from frappe.utils import date_diff, flt, getdate, nowdate

def execute(filters=None):
	filters = filters or {}
	cond = {"is_required": 1, "status": ("in", ("Requested", "Rejected"))}
	if filters.get("tax_year"):
		cond["tax_year"] = filters["tax_year"]
	rows = frappe.get_list("Tax Document", filters=cond, fields=["tax_client", "client_name", "tax_return", "tax_year",
		"document_type", "status", "rejection_reason", "creation"], order_by="client_name asc, document_type asc",
		limit_page_length=0)
	for r in rows:
		r.days_waiting = date_diff(nowdate(), r.creation)
	cols = [
		{"fieldname": "tax_client", "label": _("Client"), "fieldtype": "Link", "options": "Tax Client", "width": 150},
		{"fieldname": "client_name", "label": _("Name"), "width": 170},
		{"fieldname": "tax_return", "label": _("Return"), "fieldtype": "Link", "options": "Tax Return", "width": 160},
		{"fieldname": "tax_year", "label": _("Year"), "width": 70},
		{"fieldname": "document_type", "label": _("Document"), "width": 190},
		{"fieldname": "status", "label": _("Status"), "width": 100},
		{"fieldname": "rejection_reason", "label": _("Rejection Reason"), "width": 220},
		{"fieldname": "days_waiting", "label": _("Days Waiting"), "fieldtype": "Int", "width": 100},
	]
	return cols, rows
