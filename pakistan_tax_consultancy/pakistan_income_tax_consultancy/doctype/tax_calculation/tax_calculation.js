// Copyright (c) 2026, maqmalak and contributors
// For license information, please see license.txt

frappe.ui.form.on("Tax Calculation", {
	refresh(frm) {
		// All computed fields are read-only; they are set by the server-side engine
		const readOnlyFields = [
			"total_income",
			"total_deductions",
			"taxable_income",
			"tax_on_taxable_income",
			"separate_block_tax",
			"total_tax_credits",
			"tax_liability",
			"tax_already_paid",
			"net_payable",
			"refund_due",
			"calculation_version",
			"calculated_on",
			"calculated_by",
			"reviewer_verified",
		];
		readOnlyFields.forEach((f) => {
			frm.set_df_property(f, "read_only", 1);
		});

		// Show calculation log in a collapsible section
		if (frm.doc.calculation_log) {
			frm.page.add_inner_button(__("View Calculation Log"), () => {
				frappe.msgprint({
					title: __("Calculation Log"),
					message: `<pre>${frm.doc.calculation_log}</pre>`,
				});
			});
		}
	},
});
