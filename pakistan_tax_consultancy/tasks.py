"""Daily jobs: deadline reminders, missing-document reminders and site-visit follow-ups.

Run one by hand:  bench --site consultant execute pakistan_tax_consultancy.tasks.daily
"""

import frappe
from frappe import _
from frappe.utils import add_days, cint, date_diff, getdate

from pakistan_tax_consultancy.services import workflow as wf
from pakistan_tax_consultancy.services.notify import client_user, send

OPEN_STATES = (wf.DOCUMENTS_PENDING, wf.DRAFT, wf.CHANGES_REQUIRED, wf.PENDING_REVIEW, wf.UNDER_REVIEW, wf.REVIEWED,
	wf.AWAITING_CLIENT, wf.APPROVED, wf.FILING_ERROR)


def daily():
	for job in (deadline_reminders, missing_document_reminders, followup_reminders):
		try:
			job()
		except Exception:
			frappe.log_error(title=f"pakistan_tax_consultancy {job.__name__}")


def deadline_reminders():
	"""On the configured number of days before a tax year's due date (and 3 days before), remind clients and staff."""
	days = cint(frappe.db.get_single_value("Tax Consultancy Settings", "deadline_reminder_days")) or 14
	today = getdate()
	for year in frappe.get_all("Tax Year", filters={"is_active": 1, "return_due_date": ("is", "set")},
			fields=["name", "return_due_date"]):
		left = date_diff(year.return_due_date, today)
		if left not in (days, 3):
			continue
		for r in frappe.get_all("Tax Return", filters={"tax_year": year.name, "workflow_state": ("in", OPEN_STATES)},
				fields=["name", "tax_client", "client_name", "assigned_consultant", "workflow_state"]):
			doc = frappe.get_doc("Tax Return", r.name)
			msg = _("The filing deadline for tax year {0} is {1} ({2} days left).").format(year.name,
				frappe.format(year.return_due_date, "Date"), left)
			if r.workflow_state in (wf.DOCUMENTS_PENDING, wf.AWAITING_CLIENT):
				send([client_user(r.tax_client)], _("Filing deadline approaching"), f"<p>{msg}</p>", doc, sms=msg)
			send([r.assigned_consultant], _("Deadline in {0} days: {1}").format(left, r.client_name),
				f"<p>{msg}</p><p>{_('Status')}: {r.workflow_state}</p>", doc)


def missing_document_reminders():
	"""Every 3 days, remind clients who still owe required documents."""
	if getdate().toordinal() % 3:
		return
	rows = frappe.get_all("Tax Document", filters={"is_required": 1, "status": ("in", ("Requested", "Rejected"))},
		fields=["tax_client", "document_type", "tax_return"])
	by_client = {}
	for r in rows:
		by_client.setdefault(r.tax_client, []).append(r.document_type)
	for tax_client, types in by_client.items():
		user = client_user(tax_client)
		if not user:
			continue
		items = "".join(f"<li>{frappe.utils.escape_html(t)}</li>" for t in sorted(set(types)))
		send([user], _("Documents still needed for your tax return"), f"<p>{_('Please upload:')}</p><ul>{items}</ul>",
			sms=_("{0} document(s) still needed for your tax return. Please upload in the portal.").format(len(set(types))))


def followup_reminders():
	"""Site visits whose follow-up date is today (or N days ahead, per settings)."""
	ahead = cint(frappe.db.get_single_value("Tax Consultancy Settings", "followup_reminder_days"))
	day = add_days(getdate(), ahead)
	for v in frappe.get_all("Site Visit", filters={"follow_up_date": day, "status": ("not in", ("Converted", "Not Interested"))},
			fields=["name", "full_name", "mobile", "field_officer", "assigned_consultant", "status"]):
		doc = frappe.get_doc("Site Visit", v.name)
		send([v.field_officer, v.assigned_consultant], _("Follow-up due: {0}").format(v.full_name),
			f"<p>{v.full_name} · {v.mobile or ''} · {v.status}</p>", doc)
