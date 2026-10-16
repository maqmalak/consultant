"""Copy values from the old fieldnames into the renamed ones (runs after model sync created the new columns)."""

import frappe
from frappe.model.utils.rename_field import rename_field

FIELDS = {
	"Site Visit": {
		"contact_person": "full_name",
		"client_category": "client_type",
		"lead_status": "status",
		"next_follow_up_date": "follow_up_date",
		"services_requested": "services_needed",
		"required_documents": "documents_handed_over",
		"visit_notes": "notes",
	},
	"Tax Client": {"taxpayer_registration_status": "fbr_registration_status"},
	"Tax Document": {
		"document_category": "document_type",
		"verification_status": "status",
		"verification_date": "verified_on",
		"attachment": "file",
	},
	"Document Requirement Rule": {"document_category": "document_type", "service_type": "service"},
	"Site Visit Document": {"document_category": "document_type"},
	"Tax Engagement Document": {"document_category": "document_type"},
	"Site Visit Service": {"service_type": "service"},
	"Tax Engagement": {"service_type": "service", "engagement_status": "status"},
	"Tax Year": {"filing_due_date": "return_due_date"},
	"Service": {"service_name": "title", "default_fee": "price_from"},
	"Document Type": {"category_name": "document_type_name"},
	"Filing Record": {
		"filing_channel": "channel",
		"filing_status": "status",
		"fbr_acknowledgment_number": "iris_acknowledgment_no",
		"submission_receipt": "evidence",
		"error_reason": "errors",
	},
	"Tax Return": {
		"fbr_acknowledgment_number": "iris_acknowledgment_no",
		"filing_error_details": "filing_error_notes",
		"income_lines": "income_sources",
	},
	"Tax Calculation": {"slab_rule": "slab_setting"},
}


def execute():
	for doctype, fields in FIELDS.items():
		meta = frappe.get_meta(doctype, cached=False)
		for old, new in fields.items():
			# Table fields have no column of their own, so validation would skip moving the rows' parentfield
			table = meta.get_field(new) and meta.get_field(new).fieldtype in ("Table", "Table MultiSelect")
			rename_field(doctype, old, new, validate=not table)
