// Copyright (c) 2026, maqmalak and contributors
// For license information, please see license.txt

// Workflow buttons come from the "Tax Return Workflow" (Frappe Workflow); the rules behind them run on the server
// (services/workflow.py). This script adds the working tools around them.

const API = "pakistan_tax_consultancy.api.staff";
const NEEDS_COMMENT = ["Request Changes", "Report Filing Error"];

frappe.ui.form.on("Tax Return", {
	refresh(frm) {
		if (frm.is_new()) return;
		const state = frm.doc.workflow_state;
		const roles = frappe.user_roles || [];
		const has = (...r) => r.some((x) => roles.includes(x)) || frappe.session.user === "Administrator";

		if (["Documents Pending", "Draft", "Changes Required", "Pending Review", "Under Review"].includes(state)
			&& has("Tax Consultant", "Tax Admin", "System Manager")) {
			frm.add_custom_button(__("Calculate Tax"), () =>
				frappe.call({ method: `${API}.calculate`, args: { tax_return: frm.doc.name }, freeze: true })
					.then((r) => {
						frm.reload_doc();
						const m = r.message || {};
						frappe.show_alert({ message: __("Liability {0}, payable {1}, refund {2}{3}",
							[format_currency(m.tax_liability, "PKR"), format_currency(m.net_payable, "PKR"),
								format_currency(m.refund_due, "PKR"), m.rules_are_demo ? " — DEMO slabs" : ""]),
						indicator: m.rules_are_demo ? "orange" : "green" }, 8);
					}), __("Tools"));
			frm.add_custom_button(__("Rebuild Document Checklist"), () =>
				frappe.call({ method: `${API}.regenerate_checklist`, args: { tax_return: frm.doc.name } })
					.then((r) => frappe.show_alert(__("{0} required documents", [r.message.required]))), __("Tools"));
		}
		if (["Pending Review", "Under Review"].includes(state) && has("Tax Reviewer", "Tax Admin", "System Manager")) {
			frm.add_custom_button(__("Open Review Checklist"), () =>
				frappe.call({ method: `${API}.start_review`, args: { tax_return: frm.doc.name } })
					.then((r) => frappe.set_route("Form", "Tax Review", r.message)), __("Tools"));
		}
		if (["Acknowledged", "Closed"].includes(state)) {
			frm.add_custom_button(__("Create Revised Return"), () =>
				frappe.call({
					method: "pakistan_tax_consultancy.pakistan_income_tax_consultancy.doctype.tax_return.tax_return.create_revision",
					args: { tax_return: frm.doc.name },
				}).then((r) => frappe.set_route("Form", "Tax Return", r.message)), __("Tools"));
		}
		frm.add_custom_button(__("Documents"), () =>
			frappe.set_route("List", "Tax Document", { tax_return: frm.doc.name }), __("View"));
		frm.add_custom_button(__("Comments"), () =>
			frappe.set_route("List", "Review Comment", { tax_return: frm.doc.name }), __("View"));
		frm.add_custom_button(__("Calculations"), () =>
			frappe.set_route("List", "Tax Calculation", { tax_return: frm.doc.name }), __("View"));

		if (frm.doc.approval_status === "Invalidated") {
			frm.dashboard.set_headline_alert(__("Figures changed after approval — the approval was cancelled and the return went back to review."), "orange");
		}
	},

	before_workflow_action(frm) {
		const action = frm.selected_workflow_action;
		if (!NEEDS_COMMENT.includes(action)) return;
		// these actions need a comment: collect it and apply the action through the API (which records it)
		return new Promise((_resolve, reject) => {
			frappe.dom.unfreeze();
			frappe.prompt({ fieldname: "comment", fieldtype: "Small Text", label: __("Comment"), reqd: 1 },
				({ comment }) => {
					const apply = () => frappe.call({ method: `${API}.transition`, freeze: true,
						args: { tax_return: frm.doc.name, action, comment } }).then(() => frm.reload_doc());
					if (action === "Report Filing Error") {
						frappe.db.set_value("Tax Return", frm.doc.name, "filing_error_notes", comment).then(apply);
					} else {
						apply();
					}
				}, __(action));
			reject();
		});
	},
});
