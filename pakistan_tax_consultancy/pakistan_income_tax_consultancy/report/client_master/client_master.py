# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt
# Rows come from frappe.get_list, so record-level permission hooks apply (a consultant sees only assigned clients).

import frappe
from frappe import _
from frappe.utils import date_diff, flt, getdate, nowdate

def execute(filters=None):
	filters = filters or {}
	cond = {k: v for k, v in filters.items() if v}
	rows = frappe.get_list("Tax Client", filters=cond, fields=["name", "client_name", "client_type", "cnic_masked", "ntn",
		"mobile", "email", "city", "province", "fbr_registration_status", "assigned_consultant", "portal_user",
		"registration_source", "status", "creation"], order_by="client_name asc", limit_page_length=0)
	for r in rows:
		r.portal = _("Yes") if r.portal_user else _("No")
	cols = [
		{"fieldname": "name", "label": _("Client"), "fieldtype": "Link", "options": "Tax Client", "width": 150},
		{"fieldname": "client_name", "label": _("Name"), "width": 180},
		{"fieldname": "client_type", "label": _("Type"), "width": 140},
		{"fieldname": "cnic_masked", "label": _("CNIC"), "width": 130},
		{"fieldname": "ntn", "label": _("NTN"), "width": 100},
		{"fieldname": "mobile", "label": _("Mobile"), "width": 130},
		{"fieldname": "email", "label": _("Email"), "width": 180},
		{"fieldname": "city", "label": _("City"), "width": 100},
		{"fieldname": "fbr_registration_status", "label": _("FBR Status"), "width": 150},
		{"fieldname": "assigned_consultant", "label": _("Consultant"), "fieldtype": "Link", "options": "User", "width": 160},
		{"fieldname": "portal", "label": _("Portal"), "width": 70},
		{"fieldname": "registration_source", "label": _("Source"), "width": 110},
		{"fieldname": "status", "label": _("Status"), "width": 80},
	]
	return cols, rows
