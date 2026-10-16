"""Notifications: email (queued) + in-app Notification Log + SMS through services/sms.py.

WhatsApp is not sent automatically: it needs an approved WhatsApp Business provider and the client's opt-in.
"""

import frappe
from frappe import _
from frappe.utils import fmt_money, get_url

from pakistan_tax_consultancy.services import workflow as wf


def users_with_role(*roles) -> list[str]:
	return frappe.get_all("Has Role", filters={"role": ("in", roles), "parenttype": "User",
		"parent": ("not in", ("Administrator", "Guest"))}, pluck="parent", distinct=True)


def enabled(users) -> list[str]:
	users = [u for u in dict.fromkeys(users) if u and u not in ("Guest",)]
	if not users:
		return []
	return frappe.get_all("User", filters={"name": ("in", users), "enabled": 1}, pluck="name")


def client_user(tax_client) -> str | None:
	return frappe.db.get_value("Tax Client", tax_client, "portal_user") if tax_client else None


def send(users, subject, message, doc=None, sms=None, mobile=None):
	"""Email + in-app to `users`; optional SMS to `mobile` (or the users' mobile numbers)."""
	users = enabled(users)
	for user in users:
		log = frappe.get_doc({"doctype": "Notification Log", "for_user": user, "type": "Alert", "subject": subject,
			"email_content": message, "document_type": doc.doctype if doc else None,
			"document_name": doc.name if doc else None})
		log.flags.ignore_permissions = True
		log.insert()
	emails = [e for e in frappe.get_all("User", filters={"name": ("in", users)}, pluck="email") if e] if users else []
	if emails:
		sendmail(recipients=emails, subject=subject, message=message,
			reference_doctype=doc.doctype if doc else None, reference_name=doc.name if doc else None)
	if sms:
		from pakistan_tax_consultancy.services.sms import send_sms

		numbers = [mobile] if mobile else [m for m in frappe.get_all("User", filters={"name": ("in", users)},
			pluck="mobile_no") if m]
		for number in numbers:
			send_sms(number, sms)


def sendmail(**kwargs) -> bool:
	"""Queue an email; a site without an outgoing email account must never break the business step that notifies."""
	try:
		frappe.sendmail(delayed=True, **kwargs)
		return True
	except frappe.OutgoingEmailError:
		frappe.logger("pakistan_tax_consultancy").info(f"email not sent (no outgoing account): {kwargs.get('subject')}")
		return False


def portal_link(path="") -> str:
	return get_url(f"/portal{path}")


def _return_line(doc) -> str:
	return _("Tax year {0} · {1}").format(doc.tax_year, doc.client_name)


def workflow_changed(doc, old_state, new_state, comment=None):
	consultant = doc.assigned_consultant
	client = client_user(doc.tax_client)
	note = f"<p><b>{_('Comment')}:</b> {frappe.utils.escape_html(comment)}</p>" if comment else ""
	body = f"<p>{_return_line(doc)}</p><p>{_('Status')}: <b>{old_state}</b> → <b>{new_state}</b></p>{note}"
	if new_state == wf.PENDING_REVIEW:
		send([doc.reviewer] if doc.reviewer else users_with_role("Tax Reviewer"),
			_("Return {0} is ready for review").format(doc.name), body, doc)
	elif new_state == wf.CHANGES_REQUIRED:
		send([consultant], _("Changes required on {0}").format(doc.name), body, doc)
	elif new_state == wf.AWAITING_CLIENT:
		send([client], _("Your tax return is ready for your confirmation"),
			body + f"<p><a href='{portal_link('/returns/' + doc.name)}'>{_('Review and confirm')}</a></p>", doc,
			sms=_("Your tax return summary is ready. Please review and confirm in the portal: {0}").format(portal_link()))
	elif new_state == wf.APPROVED:
		send([consultant, doc.filing_officer] if doc.filing_officer else [consultant] + users_with_role("Filing Officer"),
			_("Return {0} approved for filing").format(doc.name), body, doc)
	elif new_state == wf.SUBMITTED:
		send([client, consultant], _("Your tax return has been submitted on FBR IRIS"), body, doc)
	elif new_state == wf.ACKNOWLEDGED:
		send([client, consultant], _("Filed: acknowledgment received for tax year {0}").format(doc.tax_year),
			body + f"<p>{_('IRIS acknowledgment no.')}: <b>{doc.iris_acknowledgment_no}</b></p>", doc,
			sms=_("Your tax return for {0} is filed. IRIS acknowledgment: {1}").format(doc.tax_year, doc.iris_acknowledgment_no))
	elif new_state == wf.FILING_ERROR:
		send([consultant, doc.filing_officer] + users_with_role("Tax Admin"),
			_("Filing error on {0}").format(doc.name), body + f"<p>{frappe.utils.escape_html(doc.filing_error_notes or '')}</p>", doc)


def document_rejected(tdoc):
	client = client_user(tdoc.tax_client)
	send([client], _("Please re-upload: {0}").format(tdoc.document_type),
		f"<p>{_('Your document was not accepted.')}</p><p><b>{_('Reason')}:</b> "
		f"{frappe.utils.escape_html(tdoc.rejection_reason or '')}</p><p><a href='{portal_link()}'>{_('Open the portal')}</a></p>",
		tdoc, sms=_("{0} needs to be uploaded again: {1}").format(tdoc.document_type, tdoc.rejection_reason or ""))


def new_registration(client_doc):
	send(users_with_role("Tax Admin") + [client_doc.assigned_consultant],
		_("New client registered: {0}").format(client_doc.client_name),
		f"<p>{client_doc.client_name} · {client_doc.mobile or ''} · {client_doc.client_type}</p>", client_doc)


def payment_received(proof):
	client = client_user(proof.tax_client)
	send([client], _("Payment received — thank you"),
		f"<p>{_('We received your payment of {0}.').format(fmt_money(proof.amount, currency='PKR'))}</p>", proof,
		sms=_("Payment of Rs {0} received. Thank you.").format(int(proof.amount or 0)))


def consultation_requested(req):
	send(users_with_role("Tax Admin", "Tax Consultant") if not req.assigned_to else [req.assigned_to],
		_("New consultation request from {0}").format(req.full_name),
		f"<p>{req.full_name} · {req.mobile} · {req.mode} · {req.preferred_date or ''} {req.preferred_slot or ''}</p>"
		f"<p>{frappe.utils.escape_html(req.message or '')}</p>", req)
