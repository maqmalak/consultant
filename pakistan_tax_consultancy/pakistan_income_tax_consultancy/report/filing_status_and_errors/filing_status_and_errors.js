// Copyright (c) 2026, maqmalak and contributors
// For license information, please see license.txt

frappe.query_reports["Filing Status and Errors"] = {
	filters: [
		{"fieldname": "status", "label": __("Status"), "fieldtype": "Select", "options": "\nSubmitted - Pending Verification\nAcknowledged\nError"}
	],
};
