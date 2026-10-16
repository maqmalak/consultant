# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt
# Rows come from frappe.get_list, so record-level permission hooks apply (a consultant sees only assigned clients).

import frappe
from frappe import _
from frappe.utils import date_diff, flt, getdate, nowdate

def execute(filters=None):
	filters = filters or {}
	cond = {"status": filters["status"]} if filters.get("status") else {}
	rows = frappe.get_list("Filing Record", filters=cond, fields=["name", "tax_return", "client_name", "filing_officer", "channel",
		"status", "filing_datetime", "iris_acknowledgment_no", "errors", "retry_notes"], order_by="filing_datetime desc",
		limit_page_length=0)
	cols = [
		{"fieldname": "name", "label": _("Filing"), "fieldtype": "Link", "options": "Filing Record", "width": 150},
		{"fieldname": "tax_return", "label": _("Return"), "fieldtype": "Link", "options": "Tax Return", "width": 160},
		{"fieldname": "client_name", "label": _("Client"), "width": 170}, {"fieldname": "status", "label": _("Status"), "width": 200},
		{"fieldname": "filing_datetime", "label": _("Filed At"), "fieldtype": "Datetime", "width": 150},
		{"fieldname": "iris_acknowledgment_no", "label": _("IRIS Ack. No."), "width": 160},
		{"fieldname": "filing_officer", "label": _("Officer"), "fieldtype": "Link", "options": "User", "width": 160},
		{"fieldname": "errors", "label": _("Errors"), "width": 240},
	]
	return cols, rows
