"""Staff home side panel: an approval inbox (what is waiting for *my* action, by role), things that need attention, and
recent activity — scoped like the rest of the portal (a consultant sees their own clients, a field officer theirs)."""

import frappe
from frappe.utils import add_days, getdate, now_datetime, pretty_date

from pakistan_tax_consultancy.api.insights import OPEN, SLA_DEFAULT, _client_scope
from pakistan_tax_consultancy.api.staff import require_staff
from pakistan_tax_consultancy.services import workflow as wf

INBOX_LIMIT = 6
# role(s) -> what they act on: (key, title, verb, workflow state, extra SQL, link)
INBOX = [
	(("Tax Approver", "Tax Admin"), "approve", "Approve", "Client confirmed — ready for approval", wf.AWAITING_CLIENT, " and r.client_confirmed = 1", "/staff/queue/approval"),
	(("Tax Reviewer", "Tax Admin"), "review", "Review", "Waiting for review", wf.PENDING_REVIEW, "", "/staff/queue/review"),
	(("Tax Reviewer", "Tax Admin"), "in_review", "Finish review", "Review in progress", wf.UNDER_REVIEW, "", "/staff/queue/review"),
	(("Filing Officer", "Tax Admin"), "file", "File on IRIS", "Approved — file on FBR IRIS", wf.APPROVED, "", "/staff/queue/filing"),
	(("Filing Officer", "Tax Admin"), "ack", "Record acknowledgment", "Submitted — attach the IRIS receipt", wf.SUBMITTED, "", "/staff/queue/submitted"),
	(("Tax Consultant", "Tax Admin"), "changes", "Fix", "Changes requested by the reviewer", wf.CHANGES_REQUIRED, "", "/staff/queue/preparation"),
	(("Tax Consultant", "Tax Admin"), "verify", "Check uploads", "Client uploaded documents to verify", wf.DOCUMENTS_PENDING,
		" and exists (select 1 from `tabTax Document` d where d.tax_return = r.name and d.status = 'Pending')", "/staff/queue/documents"),
]


@frappe.whitelist(methods=["GET"])
def panel():
	require_staff()
	roles = set(frappe.get_roles())
	admin = bool(roles & {"Tax Admin", "System Manager"}) or frappe.session.user == "Administrator"
	sc = _client_scope()
	now = now_datetime()

	# ---------------- approval inbox
	inbox = []
	for allowed, key, verb, title, state, extra, link in INBOX:
		if not (admin or roles & set(allowed)):
			continue
		rows = frappe.db.sql(f"""select r.name, r.client_name, r.tax_year, r.modified, r.net_tax_payable, r.refund_due
			from `tabTax Return` r join `tabTax Client` c on c.name = r.tax_client
			where r.workflow_state = %(s)s{extra}{sc} order by r.modified asc limit {INBOX_LIMIT}""", {"s": state}, as_dict=True)
		total = frappe.db.sql(f"""select count(*) from `tabTax Return` r join `tabTax Client` c on c.name = r.tax_client
			where r.workflow_state = %(s)s{extra}{sc}""", {"s": state})[0][0]
		if total:
			inbox.append({"key": key, "verb": verb, "title": title, "count": total, "link": link,
				"items": [{"name": r.name, "client": r.client_name, "tax_year": r.tax_year, "waiting": pretty_date(r.modified),
					"amount": r.refund_due or r.net_tax_payable, "refund": bool(r.refund_due)} for r in rows]})
	if admin:
		pays = frappe.get_all("Payment Proof", {"status": "Pending"}, ["name", "tax_client", "amount", "method", "creation"],
			order_by="creation asc", limit=INBOX_LIMIT)
		n = frappe.db.count("Payment Proof", {"status": "Pending"})
		if n:
			names = dict(frappe.get_all("Tax Client", {"name": ("in", [p.tax_client for p in pays] or [""])}, ["name", "client_name"], as_list=True))
			inbox.append({"key": "payments", "verb": "Verify", "title": "Payment proofs to verify", "count": n, "link": "/staff/payments",
				"items": [{"name": p.name, "client": names.get(p.tax_client, p.tax_client), "tax_year": p.method, "waiting": pretty_date(p.creation),
					"amount": p.amount, "refund": False, "payment": True} for p in pays]})

	# ---------------- needs attention
	attention = []

	def add(key, tone, title, hint, count, link):
		if count:
			attention.append({"key": key, "tone": tone, "title": title, "hint": hint, "count": count, "link": link})

	count = lambda state: frappe.db.sql(f"""select count(*) from `tabTax Return` r join `tabTax Client` c on c.name = r.tax_client  # noqa: E731
		where r.workflow_state = %(s)s{sc}""", {"s": state})[0][0]
	add("errors", "critical", "Filing errors", "IRIS rejected the return — fix and retry", count(wf.FILING_ERROR), "/staff/queue/errors")
	add("changes", "serious", "Changes required", "The reviewer sent these back", count(wf.CHANGES_REQUIRED), "/staff/queue/preparation")
	# returns waiting longer than their step's target (time since the last change, a cheap proxy for time in state)
	late = 0
	for state in OPEN:
		late += frappe.db.sql(f"""select count(*) from `tabTax Return` r join `tabTax Client` c on c.name = r.tax_client
			where r.workflow_state = %(s)s and r.modified < %(t)s{sc}""", {"s": state, "t": add_days(now, -SLA_DEFAULT.get(state, 5))})[0][0]
	add("late", "warning", "Past their time target", "Open returns idle longer than their step allows", late, "/staff/insights")
	rejected = frappe.db.sql(f"""select count(*) from `tabTax Document` d join `tabTax Client` c on c.name = d.tax_client
		where d.status = 'Rejected'{sc}""")[0][0]
	add("rejected", "warning", "Rejected documents", "Waiting for the client to upload again", rejected, "/staff/queue/documents")
	user = frappe.db.escape(frappe.session.user)
	fo = f" and (v.field_officer = {user} or v.assigned_consultant = {user})" if not admin else ""
	visits = frappe.db.sql(f"""select count(*) from `tabSite Visit` v where v.follow_up_date < %(d)s
		and v.status not in ('Converted', 'Not Interested'){fo}""", {"d": getdate()})[0][0]
	add("followups", "warning", "Overdue visit follow-ups", "Prospects to call back", visits, "/staff/visits")
	if admin or roles & {"Tax Consultant"}:
		new = frappe.db.count("Consultation Request", {"status": "New", "creation": ("<", add_days(now, -1))})
		add("consultations", "info", "Consultations not contacted", "Website bookings older than a day", new, "/staff/consultations")
	if "crm" in frappe.get_installed_apps():
		tasks = frappe.db.count("CRM Task", {"assigned_to": frappe.session.user, "status": ("not in", ("Done", "Canceled")), "due_date": ("<", now)})
		add("tasks", "info", "Overdue CRM follow-ups", "Tasks assigned to you", tasks, "/crm/follow-ups")

	# ---------------- recent activity
	events = frappe.db.sql(f"""select a.event_type, a.reference_doctype, a.reference_name, a.from_state, a.to_state, a.user, a.timestamp,
		c.client_name from `tabTax Audit Event` a join `tabTax Client` c on c.name = a.tax_client
		where a.event_type in ('Create', 'Status Change', 'Review', 'Approval', 'Filing') and a.timestamp <= %(now)s{sc}
		order by a.timestamp desc limit 12""", {"now": now}, as_dict=True)
	activity = [{"type": e.event_type, "doctype": e.reference_doctype, "name": e.reference_name, "from": e.from_state, "to": e.to_state,
		"user": frappe.utils.get_fullname(e.user) if e.user else "System", "client": e.client_name, "when": str(e.timestamp),
		"ago": pretty_date(e.timestamp)} for e in events]
	return {"inbox": inbox, "inbox_total": sum(i["count"] for i in inbox), "attention": attention, "activity": activity}
