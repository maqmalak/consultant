// Copyright (c) 2026, maqmalak and contributors
// For license information, please see license.txt

frappe.query_reports["Site Visits and Follow-ups"] = {
	filters: [
		{"fieldname": "status", "label": __("Status"), "fieldtype": "Select", "options": "\nNew\nContacted\nQualified\nConverted\nNot Interested"},
		{"fieldname": "due_only", "label": __("Follow-ups due only"), "fieldtype": "Check"}
	],
};
