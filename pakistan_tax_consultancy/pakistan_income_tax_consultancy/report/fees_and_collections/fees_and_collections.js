// Copyright (c) 2026, maqmalak and contributors
// For license information, please see license.txt

frappe.query_reports["Fees and Collections"] = {
	filters: [
		{"fieldname": "tax_year", "label": __("Tax Year"), "fieldtype": "Link", "options": "Tax Year"},
		{"fieldname": "payment_status", "label": __("Payment Status"), "fieldtype": "Select", "options": "\nUnbilled\nInvoiced\nPartially Paid\nPaid\nWaived"}
	],
};
