// Copyright (c) 2026, maqmalak and contributors
// For license information, please see license.txt

frappe.query_reports["Consultation Requests Report"] = {
	filters: [
		{"fieldname": "status", "label": __("Status"), "fieldtype": "Select", "options": "\nNew\nContacted\nScheduled\nCompleted\nCancelled"}
	],
};
