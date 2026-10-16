"""Filing adapters. Returns are filed by staff on FBR IRIS; the app records the evidence.

`ManualIrisAdapter` is the only active adapter. `FbrApiAdapter` is a disabled stub: no official, authorised FBR
filing API has been verified, so no endpoint is invented here. It raises until one is confirmed and implemented.
"""

import frappe
from frappe import _
from frappe.utils import getdate, now_datetime

from pakistan_tax_consultancy.services import workflow as wf

MANUAL = "Manual FBR Filing (IRIS)"


class FilingAdapter:
	channel = None

	def submit(self, tax_return):
		raise NotImplementedError

	def acknowledge(self, tax_return):
		raise NotImplementedError


class ManualIrisAdapter(FilingAdapter):
	"""The filing officer files on IRIS by hand; this records what they did."""

	channel = MANUAL

	def submit(self, doc):
		record = frappe.get_doc({"doctype": "Filing Record", "tax_return": doc.name, "tax_client": doc.tax_client,
			"client_name": doc.client_name, "filing_officer": doc.filing_officer or frappe.session.user,
			"channel": self.channel, "status": "Submitted - Pending Verification", "filing_datetime": now_datetime(),
			"idempotency_key": f"{doc.name}-{doc.content_hash}"})
		record.insert(ignore_permissions=True)
		return record

	def acknowledge(self, doc):
		record = latest_record(doc.name)
		if record:
			record.update({"status": "Acknowledged", "iris_acknowledgment_no": doc.iris_acknowledgment_no,
				"evidence": doc.fbr_receipt, "verified_by": frappe.session.user, "verified_on": now_datetime(),
				"reconciliation_status": "Reconciled"})
			record.save(ignore_permissions=True)
		return record

	def error(self, doc):
		record = latest_record(doc.name)
		if record:
			record.update({"status": "Error", "errors": doc.filing_error_notes})
			record.save(ignore_permissions=True)
		return record


class FbrApiAdapter(FilingAdapter):
	"""Placeholder for an official FBR integration. Disabled on purpose."""

	channel = "Authorized Integration"

	def submit(self, doc):
		frappe.throw(_("Direct FBR API filing is not available: no official FBR filing API has been verified. "
			"File on IRIS and record the acknowledgment."), title=_("Not Available"))

	acknowledge = error = submit


def get_adapter() -> FilingAdapter:
	# Even if someone switches the setting, the stub refuses to file.
	setting = frappe.db.get_single_value("Tax Consultancy Settings", "filing_adapter")
	return FbrApiAdapter() if setting == "FBR API" else ManualIrisAdapter()


def latest_record(tax_return):
	name = frappe.db.get_value("Filing Record", {"tax_return": tax_return}, "name", order_by="creation desc")
	return frappe.get_doc("Filing Record", name) if name else None


def on_state_change(doc, old_state, new_state):
	from pakistan_tax_consultancy.audit import log_event

	adapter = get_adapter()
	if new_state == wf.SUBMITTED:
		record = adapter.submit(doc)
		doc.db_set({"fbr_submission_status": "Submitted - Pending Verification", "submission_timestamp": now_datetime(),
			"filing_officer": doc.filing_officer or frappe.session.user}, update_modified=False)
		log_event("Filing", doc, details={"filing_record": record.name, "retry": old_state == wf.FILING_ERROR})
	elif new_state == wf.ACKNOWLEDGED:
		adapter.acknowledge(doc)
		doc.db_set({"filing_date": doc.filing_date or getdate()}, update_modified=False)
		log_event("Filing", doc, details={"acknowledgment": doc.iris_acknowledgment_no})
	elif new_state == wf.FILING_ERROR:
		adapter.error(doc)
		doc.db_set("fbr_submission_status", "Rejected / Error", update_modified=False)
		log_event("Filing", doc, details={"error": doc.filing_error_notes})
