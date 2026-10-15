// Copyright (c) 2026, maqmalak and contributors
// For license information, please see license.txt

frappe.ui.form.on("Tax Client", {
	refresh(frm) {
		const readOnlyFields = [
			"cnic_hash",
			"cnic_masked",
			"ntn_normalized",
			"email_normalized",
			"mobile_e164",
		];
		readOnlyFields.forEach((f) => {
			frm.set_df_property(f, "read_only", 1);
		});

		// Mask CNIC and mobile for display if raw values are present
		if (frm.doc.cnic && !frm.doc.cnic_masked) {
			frm.set_value("cnic_masked", frm.doc.cnic.replace(/\d(?=\d{4})/g, "*"));
		}
		if (frm.doc.mobile && !frm.doc.mobile_e164) {
			frm.set_value("mobile_e164", frm.doc.mobile);
		}
	},
});
