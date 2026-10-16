// Copyright (c) 2026, maqmalak and contributors
// For license information, please see license.txt

frappe.query_reports["Client Master"] = {
	filters: [
		{"fieldname": "client_type", "label": __("Client Type"), "fieldtype": "Select", "options": "\nIndividual-Salaried\nIndividual-Business\nAOP\nCompany\nOther"},
		{"fieldname": "assigned_consultant", "label": __("Consultant"), "fieldtype": "Link", "options": "User"}
	],
};
