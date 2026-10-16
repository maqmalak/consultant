// Copyright (c) 2026, maqmalak and contributors
// For license information, please see license.txt

frappe.query_reports["Missing Documents"] = {
	filters: [
		{"fieldname": "tax_year", "label": __("Tax Year"), "fieldtype": "Link", "options": "Tax Year"}
	],
};
