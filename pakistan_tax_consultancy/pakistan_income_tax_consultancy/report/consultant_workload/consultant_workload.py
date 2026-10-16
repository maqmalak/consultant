# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt
# Rows come from frappe.get_list, so record-level permission hooks apply (a consultant sees only assigned clients).

import frappe
from frappe import _
from frappe.utils import date_diff, flt, getdate, nowdate

def execute(filters=None):
	filters = filters or {}
	cond = {"workflow_state": ("not in", ("Acknowledged", "Closed"))}
	if filters.get("tax_year"):
		cond["tax_year"] = filters["tax_year"]
	rows = frappe.get_list("Tax Return", filters=cond, fields=["assigned_consultant", "workflow_state"], limit_page_length=0)
	agg = {}
	buckets = {"Documents Pending": "documents", "Draft": "preparing", "Changes Required": "preparing", "Pending Review": "review",
		"Under Review": "review", "Reviewed": "review", "Awaiting Client Confirmation": "client", "Approved": "filing",
		"Submitted to FBR": "filing", "Filing Error": "filing"}
	for r in rows:
		key = r.assigned_consultant or _("Unassigned")
		a = agg.setdefault(key, frappe._dict(consultant=key, documents=0, preparing=0, review=0, client=0, filing=0, total=0))
		a[buckets.get(r.workflow_state, "preparing")] += 1
		a.total += 1
	data = sorted(agg.values(), key=lambda a: -a.total)
	cols = [{"fieldname": "consultant", "label": _("Consultant"), "width": 200}] + [
		{"fieldname": f, "label": l, "fieldtype": "Int", "width": 110} for f, l in (("documents", _("Docs Pending")),
			("preparing", _("Preparing")), ("review", _("In Review")), ("client", _("With Client")), ("filing", _("Filing")),
			("total", _("Total")))]
	return cols, data
