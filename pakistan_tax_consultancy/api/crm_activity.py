"""Lead / deal page and the activity calendar for the staff portal (calendar ported from the wise site's CRM calendar).

One timeline per CRM Lead or CRM Deal: notes (FCRM Note), follow-ups (CRM Task), WhatsApp (WhatsApp Message), email
(Communication), meetings and calls (Event linked through Event Participants) and stage changes. Every action here
writes the same records Frappe CRM uses, so /crm shows them too.
"""

import frappe
from frappe import _
from frappe.utils import add_to_date, cint, escape_html, get_datetime, getdate, now_datetime, strip_html
from frappe.utils.html_utils import sanitize_html

from pakistan_tax_consultancy.api.crm import _guard, _names, _person

KINDS = {"CRM Lead": "leads", "CRM Deal": "deals"}
EVENT_CATEGORIES = ("Meeting", "Call", "Event", "Other")
LINKABLE = ("CRM Lead", "CRM Deal", "Tax Client")


def _doc(doctype, name, ptype="read"):
	_guard()
	if doctype not in KINDS:
		frappe.throw(_("Not a CRM record."))
	doc = frappe.get_doc(doctype, name)
	doc.check_permission(ptype)
	return doc


def _contact(doc):
	return {"mobile": doc.get("mobile_no") or doc.get("phone"), "email": doc.get("email")}


@frappe.whitelist(methods=["GET"])
def detail(doctype: str, name: str):
	doc = _doc(doctype, name)
	is_lead = doctype == "CRM Lead"
	status_meta = frappe.get_all("CRM Lead Status" if is_lead else "CRM Deal Status", ["name", "color", "type"], order_by="position")
	owner = doc.get("lead_owner") if is_lead else doc.get("deal_owner")
	# a converted lead's history continues on its deal (and the deal shows its lead's history)
	related = [(doctype, name)]
	if is_lead and doc.converted:
		deal = frappe.db.get_value("CRM Deal", {"lead": name}, "name")
		if deal:
			related.append(("CRM Deal", deal))
	elif not is_lead and doc.get("lead"):
		related.append(("CRM Lead", doc.lead))

	items = []
	for dt, dn in related:
		r = {"reference_doctype": dt, "reference_docname": dn}
		for n in frappe.get_all("FCRM Note", r, ["name", "title", "content", "owner", "creation"]):
			items.append({"kind": "note", "at": n.creation, "by": n.owner, "title": n.title, "html": sanitize_html(n.content or ""), "id": n.name})
		for t in frappe.get_all("CRM Task", r, ["name", "title", "description", "status", "priority", "due_date", "assigned_to", "owner", "creation"]):
			items.append({"kind": "task", "at": t.creation, "by": t.owner, "title": t.title, "html": sanitize_html(t.description or ""), "id": t.name,
				"status": t.status, "priority": t.priority, "due": t.due_date, "assigned_to": t.assigned_to})
		for c in frappe.get_all("Communication", {"reference_doctype": dt, "reference_name": dn, "communication_medium": "Email"}, ["name", "subject", "content", "sender",
				"recipients", "sent_or_received", "creation", "delivery_status"]):
			items.append({"kind": "email", "at": c.creation, "by": c.sender, "title": c.subject, "html": sanitize_html(c.content or ""),
				"id": c.name, "direction": c.sent_or_received, "to": c.recipients, "status": c.delivery_status})
		for m in frappe.get_all("WhatsApp Message", r, ["name", "message", "direction", "status", "creation", "owner"]):
			items.append({"kind": "whatsapp", "at": m.creation, "by": m.owner, "body": strip_html(m.message or ""), "id": m.name,
				"direction": m.direction, "status": m.status})
		for e in frappe.get_all("Event Participants", {"reference_doctype": dt, "reference_docname": dn, "parenttype": "Event"}, pluck="parent"):
			ev = frappe.db.get_value("Event", e, ["name", "subject", "event_category", "starts_on", "status", "owner", "creation", "description"], as_dict=True)
			if ev:
				items.append({"kind": "event", "at": ev.creation, "by": ev.owner, "title": ev.subject, "html": sanitize_html(ev.description or ""),
					"id": ev.name, "category": ev.event_category, "due": ev.starts_on, "status": ev.status})
		for log in frappe.get_all("CRM Status Change Log", {"parenttype": dt, "parent": dn}, ["from", "to", "from_date", "to_date", "owner", "creation"]):
			if log.get("from") and log.get("to"):
				items.append({"kind": "status", "at": log.to_date or log.from_date or log.creation, "by": log.owner,
					"title": _("{0} → {1}").format(log.get("from"), log.get("to"))})
	items.append({"kind": "created", "at": doc.creation, "by": doc.owner, "title": _("Lead created") if is_lead else _("Deal created"),
		"body": doc.get("source") and _("Source: {0}").format(doc.source)})
	people = _names([i.get("by") for i in items] + [i.get("assigned_to") for i in items] + [owner])
	for i in items:
		i["by_name"] = people.get(i.get("by")) or i.get("by")
		if i.get("assigned_to"):
			i["assigned_name"] = people.get(i["assigned_to"]) or i["assigned_to"]
	items.sort(key=lambda i: str(i["at"]), reverse=True)

	open_tasks = sorted((i for i in items if i["kind"] == "task" and i.get("status") not in ("Done", "Canceled")),
		key=lambda i: str(i.get("due") or "9999"))
	upcoming = sorted((i for i in items if i["kind"] == "event" and i.get("due") and get_datetime(i["due"]) >= now_datetime()
		and i.get("status") == "Open"), key=lambda i: str(i["due"]))
	conv = frappe.db.get_value("Client Conversation", {"phone": ("like", f"%{(doc.get('mobile_no') or 'x')[-10:]}")},
		["name", "opted_out"], as_dict=True) if doc.get("mobile_no") else None
	return {
		"doctype": doctype, "name": name, "person": _person(doc), "status": doc.status, "statuses": status_meta,
		"owner": owner, "owner_name": people.get(owner), "source": doc.get("source"), "organization": doc.get("organization") or doc.get("organization_name"),
		"client_type": doc.get("ptc_client_type"), "tax_client": doc.get("tax_client"), "converted": cint(doc.get("converted")),
		"deal": related[1][1] if is_lead and len(related) > 1 else None, "lead": doc.get("lead") if not is_lead else None,
		"value": doc.get("deal_value") or doc.get("expected_deal_value"), "package": doc.get("service_package"),
		"deal_fields": {f: doc.get(f) for f in ("expected_deal_value", "deal_value", "service_package", "next_step", "expected_closure_date",
			"organization_name")} if not is_lead else None,
		"packages": frappe.get_all("Service Package", {"active": 1}, ["name", "price"], order_by="display_order") if not is_lead else [],
		"can_write": doc.has_permission("write"),
		"next_step": doc.get("next_step"), "created": doc.creation, "contact": _contact(doc),
		"whatsapp_opted_out": cint(conv.opted_out) if conv else 0, "email_ready": _email_ready(),
		"crm_url": f"/crm/{KINDS[doctype]}/{name}", "timeline": items, "open_tasks": open_tasks, "upcoming": upcoming,
		"lost_reasons": frappe.get_all("CRM Lost Reason", pluck="name") if not is_lead else [],
		"agents": frappe.get_all("User", {"name": ("in", frappe.get_all("Has Role", {"role": ("in", ["Sales User", "Sales Manager"]),
			"parenttype": "User"}, pluck="parent") or [""]), "enabled": 1}, ["name", "full_name"], order_by="full_name"),
	}


def rich(value):
	"""Rich text from the editor (Quill HTML), sanitised; plain text (API callers) keeps its line breaks."""
	value = (value or "").strip()
	if not value:
		return ""
	if "<" not in value:
		return escape_html(value).replace("\n", "<br>")
	return sanitize_html(value)


def _email_ready():
	return bool(frappe.db.exists("Email Account", {"enable_outgoing": 1, "default_outgoing": 1}))


# ---------------------------------------------------------------- actions
@frappe.whitelist(methods=["POST"])
def add_note(doctype: str, name: str, content: str, title: str | None = None):
	_doc(doctype, name, "write")
	if not (content or "").strip():
		frappe.throw(_("Write the note first."))
	html = rich(content)
	if not strip_html(html).strip():
		frappe.throw(_("Write the note first."))
	note = frappe.get_doc({"doctype": "FCRM Note", "title": (title or strip_html(html).strip().split("\n")[0])[:120],
		"content": html, "reference_doctype": doctype, "reference_docname": name})
	note.insert()
	return note.name


@frappe.whitelist(methods=["POST"])
def add_task(doctype: str, name: str, title: str, due_date: str, priority: str = "Medium", assigned_to: str | None = None,
		description: str | None = None):
	"""A follow-up (CRM Task): shows on the lead, in the assignee's 'My follow-ups' and on the activity calendar."""
	_doc(doctype, name, "write")
	if not (title or "").strip() or not due_date:
		frappe.throw(_("Give the follow-up a title and a due date."))
	task = frappe.get_doc({"doctype": "CRM Task", "title": title.strip()[:140], "due_date": get_datetime(due_date),
		"priority": priority if priority in ("Low", "Medium", "High") else "Medium", "status": "Todo",
		"assigned_to": assigned_to or frappe.session.user, "description": rich(description),
		"reference_doctype": doctype, "reference_docname": name})
	task.insert()
	return task.name


@frappe.whitelist(methods=["POST"])
def set_task_status(task: str, status: str):
	_guard()
	if status not in ("Backlog", "Todo", "In Progress", "Done", "Canceled"):
		frappe.throw(_("Unknown status"))
	doc = frappe.get_doc("CRM Task", task)
	doc.check_permission("write")
	doc.status = status
	doc.save()


@frappe.whitelist(methods=["POST"])
def send_whatsapp(doctype: str, name: str, message: str):
	"""Free text through the team WhatsApp number (Meta only delivers it within 24 h of the person's last message —
	otherwise use an approved template). Logged on the lead and in the WhatsApp inbox."""
	from whatsapp.whatsapp.api.messages import send_message

	from pakistan_tax_consultancy.services import wa_inbox

	doc = _doc(doctype, name, "write")
	mobile = doc.get("mobile_no") or doc.get("phone")
	if not mobile:
		frappe.throw(_("This record has no mobile number."))
	if not (message or "").strip():
		frappe.throw(_("Type a message."))
	profile = wa_inbox.profile_for(mobile)
	if frappe.db.get_value("Client Conversation", profile, "opted_out"):
		frappe.throw(_("This person opted out of WhatsApp messages."))
	return send_message(to=profile, message=message.strip(), content_type="text", reference_doctype=doctype, reference_docname=name)


@frappe.whitelist(methods=["POST"])
def send_email(doctype: str, name: str, subject: str, message: str, to: str | None = None):
	from frappe.core.doctype.communication.email import make

	doc = _doc(doctype, name, "write")
	to = (to or doc.get("email") or "").strip()
	if not to:
		frappe.throw(_("This record has no email address."))
	if not _email_ready():
		frappe.throw(_("Set up the outgoing email account first (Settings → Email)."))
	if not (subject or "").strip() or not strip_html(message or "").strip():
		frappe.throw(_("Write a subject and a message."))
	res = make(doctype=doctype, name=name, subject=subject.strip(), content=rich(message),
		recipients=to, send_email=1, communication_medium="Email")
	return res.get("name") if isinstance(res, dict) else res


@frappe.whitelist(methods=["POST"])
def set_status(doctype: str, name: str, status: str, lost_reason: str | None = None):
	if doctype == "CRM Deal":
		from pakistan_tax_consultancy.api.crm import move_deal

		return move_deal(name, status, lost_reason)
	doc = _doc(doctype, name, "write")
	if not frappe.db.exists("CRM Lead Status", status):
		frappe.throw(_("Unknown status {0}").format(status))
	doc.status = status
	doc.save()
	return {"status": doc.status}


@frappe.whitelist(methods=["POST"])
def set_owner(doctype: str, name: str, owner: str):
	doc = _doc(doctype, name, "write")
	doc.set("lead_owner" if doctype == "CRM Lead" else "deal_owner", owner)
	doc.save()


# ---------------------------------------------------------------- calendar (ported from the wise CRM calendar)
@frappe.whitelist(methods=["GET"])
def calendar(start: str, end: str, mine: int = 0):
	"""Meetings / calls / reminders (Event) and CRM follow-ups (CRM Task) between two dates."""
	_guard()
	start, end = getdate(start), getdate(end)
	events = frappe.get_list("Event", filters={"starts_on": ("between", [f"{start} 00:00:00", f"{end} 23:59:59"]),
		"event_category": ("in", EVENT_CATEGORIES)}, fields=["name", "subject", "event_category", "starts_on", "ends_on", "status", "owner",
		"description"], order_by="starts_on asc", limit_page_length=1000)
	links = {}
	for p in frappe.get_all("Event Participants", {"parent": ("in", [e.name for e in events] or [""]), "parenttype": "Event"},
			["parent", "reference_doctype", "reference_docname"]):
		links.setdefault(p.parent, (p.reference_doctype, p.reference_docname))
	tf = {"due_date": ("between", [f"{start} 00:00:00", f"{end} 23:59:59"])}
	if cint(mine):
		tf["assigned_to"] = frappe.session.user
	tasks = frappe.get_list("CRM Task", filters=tf, fields=["name", "title", "due_date", "status", "priority", "assigned_to",
		"reference_doctype", "reference_docname"], order_by="due_date asc", limit_page_length=1000)
	labels = _labels([v for v in links.values()] + [(t.reference_doctype, t.reference_docname) for t in tasks])
	people = _names([e.owner for e in events] + [t.assigned_to for t in tasks])
	out = []
	for e in events:
		if cint(mine) and e.owner != frappe.session.user:
			continue
		ref = links.get(e.name)
		out.append({"id": e.name, "kind": "event", "category": e.event_category, "title": e.subject, "start": e.starts_on, "end": e.ends_on,
			"status": e.status, "note": strip_html(e.description or ""), "who": people.get(e.owner),
			"ref_doctype": ref[0] if ref else None, "ref_name": ref[1] if ref else None, "ref_label": labels.get(ref) if ref else None})
	for t in tasks:
		ref = (t.reference_doctype, t.reference_docname) if t.reference_docname else None
		out.append({"id": t.name, "kind": "task", "category": "Follow-up", "title": t.title, "start": t.due_date, "status": t.status,
			"priority": t.priority, "who": people.get(t.assigned_to), "ref_doctype": ref[0] if ref else None, "ref_name": ref[1] if ref else None,
			"ref_label": labels.get(ref) if ref else None})
	return out


def _labels(refs):
	out = {}
	for dt, dn in {r for r in refs if r and r[0] and r[1]}:
		if dt == "CRM Lead":
			r = frappe.db.get_value("CRM Lead", dn, ["first_name", "last_name", "lead_name", "organization"], as_dict=True)
		elif dt == "CRM Deal":
			r = frappe.db.get_value("CRM Deal", dn, ["first_name", "last_name", "lead_name", "organization_name"], as_dict=True)
		elif dt == "Tax Client":
			r = frappe._dict(lead_name=frappe.db.get_value("Tax Client", dn, "client_name"))
		else:
			r = None
		out[(dt, dn)] = (_person(frappe._dict(r, name=dn)) if r else dn)
	return out


@frappe.whitelist(methods=["GET"])
def link_options(q: str | None = None):
	"""What an activity can be linked to: open leads, deals, clients."""
	_guard()
	like = f"%{q}%" if q else None
	leads = frappe.get_list("CRM Lead", fields=["name", "lead_name", "first_name", "last_name", "organization"], filters={"converted": 0},
		or_filters={"lead_name": ("like", like), "mobile_no": ("like", like)} if like else None, order_by="modified desc", limit_page_length=50)
	deals = frappe.get_list("CRM Deal", fields=["name", "lead_name", "first_name", "last_name", "organization_name"],
		or_filters={"lead_name": ("like", like), "mobile_no": ("like", like)} if like else None, order_by="modified desc", limit_page_length=50)
	clients = frappe.get_list("Tax Client", fields=["name", "client_name"], or_filters={"client_name": ("like", like)} if like else None,
		order_by="modified desc", limit_page_length=50)
	return ([{"doctype": "CRM Lead", "name": r.name, "label": f"Lead · {_person(r)}"} for r in leads]
		+ [{"doctype": "CRM Deal", "name": r.name, "label": f"Deal · {_person(r)}"} for r in deals]
		+ [{"doctype": "Tax Client", "name": r.name, "label": f"Client · {r.client_name}"} for r in clients])


@frappe.whitelist(methods=["POST"])
def schedule(category: str, starts_on: str, subject: str | None = None, note: str | None = None, minutes: int = 60,
		ref_doctype: str | None = None, ref_name: str | None = None):
	"""A meeting, call or reminder on the team calendar, optionally linked to a lead, deal or client."""
	_guard()
	if category not in EVENT_CATEGORIES:
		frappe.throw(_("Unknown activity type"))
	start = get_datetime(starts_on)
	label = None
	if ref_doctype and ref_name:
		if ref_doctype not in LINKABLE:
			frappe.throw(_("Cannot link to {0}").format(ref_doctype))
		frappe.get_doc(ref_doctype, ref_name).check_permission("read")
		label = _labels([(ref_doctype, ref_name)]).get((ref_doctype, ref_name))
	title = (subject or "").strip() or (strip_html(note or "").strip().split("\n")[0][:120]) or f"{'Reminder' if category == 'Event' else category}{' — ' + label if label else ''}"
	ev = frappe.get_doc({"doctype": "Event", "subject": title[:140], "event_category": category, "event_type": "Public", "status": "Open",
		"starts_on": start, "ends_on": add_to_date(start, minutes=max(15, min(cint(minutes) or 60, 600))), "send_reminder": 1,
		"description": rich(note) or None,
		"event_participants": [{"reference_doctype": ref_doctype, "reference_docname": ref_name}] if ref_doctype and ref_name else []})
	ev.insert()
	return ev.name


@frappe.whitelist(methods=["POST"])
def set_event_status(event: str, status: str):
	_guard()
	if status not in ("Open", "Completed", "Cancelled"):
		frappe.throw(_("Unknown status"))
	doc = frappe.get_doc("Event", event)
	doc.check_permission("write")
	doc.status = status
	doc.save()


@frappe.whitelist(methods=["GET"])
def follow_ups(scope: str = "mine", status: str = "open"):
	"""Follow-up list: overdue / today / upcoming, mine or the whole team."""
	_guard()
	filters = {"status": ("not in", ["Done", "Canceled"])} if status == "open" else {"status": "Done"}
	if scope == "mine":
		filters["assigned_to"] = frappe.session.user
	rows = frappe.get_list("CRM Task", filters=filters, fields=["name", "title", "description", "due_date", "status", "priority",
		"assigned_to", "reference_doctype", "reference_docname"], order_by="due_date asc" if status == "open" else "modified desc",
		limit_page_length=300)
	labels = _labels([(r.reference_doctype, r.reference_docname) for r in rows if r.reference_docname])
	people = _names([r.assigned_to for r in rows])
	for r in rows:
		r.ref_label = labels.get((r.reference_doctype, r.reference_docname))
		r.assigned_name = people.get(r.assigned_to)
		r.description = strip_html(r.description or "")
	return rows


# ---------------------------------------------------------------- attachments (lead / deal)
@frappe.whitelist(methods=["GET"])
def attachments(doctype: str, name: str):
	_doc(doctype, name)
	rows = frappe.get_all("File", {"attached_to_doctype": doctype, "attached_to_name": name, "is_folder": 0},
		["name", "file_name", "file_url", "file_size", "is_private", "owner", "creation"], order_by="creation desc")
	people = _names([r.owner for r in rows])
	for r in rows:
		r.owner_name = people.get(r.owner) or r.owner
	return rows


@frappe.whitelist(methods=["POST"])
def remove_attachment(doctype: str, name: str, file: str):
	_doc(doctype, name, "write")
	f = frappe.get_doc("File", file)
	if f.attached_to_doctype != doctype or f.attached_to_name != name:
		frappe.throw(_("Not an attachment of this record."), frappe.PermissionError)
	f.delete(ignore_permissions=True)
