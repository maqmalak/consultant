// Copyright (c) 2026, maqmalak and contributors
// For license information, please see license.txt

frappe.ui.form.on("Tax Return", {
	refresh(frm) {
		// Always show calculation summary fields as read-only
		frm.fields_map["total_income"]?.df?.read_only === undefined && frm.set_df_property("total_income", "read_only", 1);
		frm.fields_map["taxable_income"]?.df?.read_only === undefined && frm.set_df_property("taxable_income", "read_only", 1);
		frm.fields_map["tax_liability"]?.df?.read_only === undefined && frm.set_df_property("tax_liability", "read_only", 1);
		frm.fields_map["net_payable"]?.df?.read_only === undefined && frm.set_df_property("net_payable", "read_only", 1);
		frm.fields_map["refund_due"]?.df?.read_only === undefined && frm.set_df_property("refund_due", "read_only", 1);

		setup_action_buttons(frm);
		setup_status_indicator(frm);
	},

	before_save(frm) {
		// Ensure tax_client is set before saving
		if (!frm.doc.tax_client) {
			frappe.throw(__("Tax Client is required"));
		}
	},
});

function setup_action_buttons(frm) {
	const state = frm.doc.workflow_state || "Draft";
	const userRoles = frappe.user_roles || [];
	const isAdmin = userRoles.includes("System Manager") ||
		userRoles.includes("Tax Consultant Admin");
	const isConsultant = userRoles.includes("Tax Consultant");
	const isReviewer = userRoles.includes("Tax Reviewer") ||
		userRoles.includes("Tax Approver");
	const isFilingOfficer = userRoles.includes("Filing Officer");

	// Clear any previously added custom buttons
	frm.page.set_primary_action(null);

	// --- Calculate Tax ---
	// Available in Draft or Submitted state for consultant/all-scope roles
	if ((state === "Draft" || state === "Submitted") && (isAdmin || isConsultant)) {
		frm.page.set_primary_action(__("Calculate Tax"), () => {
			calculate_tax(frm);
		});
	}

	// --- Submit for Review ---
	// Draft -> Submitted: consultant/all-scope
	if (state === "Draft" && (isAdmin || isConsultant)) {
		frm.page.add_inner_button(__("Submit for Review"), () => {
			transition_workflow(frm, "Submitted");
		});
	}

	// --- Under Review actions ---
	if (state === "Submitted") {
		if (isAdmin || isConsultant) {
			frm.page.add_inner_button(__("Send for Review"), () => {
				transition_workflow(frm, "Under Review");
			});
		}
	}

	if (state === "Under Review" && (isReviewer || isAdmin)) {
		frm.page.add_inner_button(__("Approve"), () => {
			transition_workflow(frm, "Approved");
		});
		frm.page.add_inner_button(__("Reject"), () => {
			transition_workflow(frm, "Rejected");
		});
	}

	if (state === "Approved" && (isFilingOfficer || isAdmin)) {
		frm.page.add_inner_button(__("File Return"), () => {
			transition_workflow(frm, "Filed");
		});
	}

	if (state === "Rejected" && (isAdmin || isConsultant)) {
		frm.page.add_inner_button(__("Back to Draft"), () => {
			transition_workflow(frm, "Draft");
		});
	}
}

function setup_status_indicator(frm) {
	const state = frm.doc.workflow_state || "Draft";
	let color = "blue";
	switch (state) {
		case "Submitted": color = "orange"; break;
		case "Under Review": color = "blue"; break;
		case "Approved": color = "green"; break;
		case "Filed": color = "green"; break;
		case "Rejected": color = "red"; break;
		default: color = "gray";
	}
	frm.set_indicator(__("Status: {0}").format([state]), color);
}

function calculate_tax(frm) {
	if (!frm.doc.tax_client || !frm.doc.tax_year) {
		frappe.throw(__("Tax Client and Tax Year are required before calculating tax."));
	}

	frm.call({
		method: "incometax.api.tax_calculation.calculate_tax",
		args: { tax_return: frm.doc.name },
		btn: frm.page.btn_primary,
		freeze: true,
		freeze_message: __("Calculating tax..."),
		callback(r) {
			if (!r.exc && r.message) {
				const c = r.message;
				frm.set_value("total_income", c.total_income);
				frm.set_value("total_deductions", c.total_deductions);
				frm.set_value("taxable_income", c.taxable_income);
				frm.set_value("tax_liability", c.tax_liability);
				frm.set_value("total_tax_credits", c.total_tax_credits);
				frm.set_value("tax_already_paid", c.tax_already_paid);
				frm.set_value("net_payable", c.net_payable);
				frm.set_value("refund_due", c.refund_due);
				frm.set_value("latest_calculation", c.name);
				frm.save();
				frappe.msgprint(__("Tax calculated successfully. Net payable: {0}").format([
					format_currency(c.net_payable),
				]));
				setup_action_buttons(frm);
			}
		},
	});
}

function transition_workflow(frm, target_state) {
	const current = frm.doc.workflow_state || "Draft";

	frappe.confirm(
		__("Move this Tax Return from {0} to {1}?").format([current, target_state]),
		() => {
			frm.call({
				method: "incometax.api.workflow.transition_tax_return",
				args: {
					tax_return: frm.doc.name,
					target_state: target_state,
				},
				btn: $(frm.page.btn_primary || frm.page.inner_buttons).last(),
				freeze: true,
				freeze_message: __("Updating status..."),
				callback(r) {
					if (!r.exc && r.message) {
						frm.set_value("workflow_state", r.message.workflow_state);
						setup_status_indicator(frm);
						setup_action_buttons(frm);
						frappe.msgprint(__("Status updated to {0}").format([target_state]));
					}
				},
			});
		}
	);
}

function format_currency(value) {
	if (value === null || value === undefined) return "";
	return accounting.format_value(value || 0, { precision: 2 });
}
