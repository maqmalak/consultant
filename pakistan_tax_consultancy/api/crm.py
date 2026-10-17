"""Staff portal CRM (ported from the realestate CRM pages): dashboard, leads and the deal pipeline board, on top of
Frappe CRM's own records and permissions. The full CRM (activity, notes, tasks, calls, email) stays at /crm."""

import frappe
from frappe import _
from frappe.utils import add_days, cint, flt, get_first_day, getdate, nowdate

from pakistan_tax_consultancy.services import crm

CRM_ACCESS = {"System Manager", "Sales Manager", "Sales User"}
LEAD_FIELDS = ["name", "lead_name", "first_name", "last_name", "mobile_no", "email", "status", "source", "lead_owner", "organization",
	"creation", "converted", "tax_client", "ptc_client_type"]
DEAL_FIELDS = ["name", "lead", "lead_name", "first_name", "last_name", "organization_name", "mobile_no", "email", "deal_owner", "status",
	"expected_deal_value", "deal_value", "modified", "creation", "tax_client", "service_package", "next_step", "source"]


def _guard():
	if not crm.installed():
		frappe.throw(_("Frappe CRM is not installed on this site."))
	if not CRM_ACCESS & set(frappe.get_roles()):
		frappe.throw(_("You need CRM access — ask the admin to add you on the Team page."), frappe.PermissionError)


def _names(users):
	users = [u for u in set(users) if u]
	return dict(frappe.get_all("User", {"name": ("in", users or [""])}, ["name", "full_name"], as_list=True))


def _person(r):
	return " ".join(filter(None, [r.get("first_name"), r.get("last_name")])) or r.get("lead_name") or r.get("organization_name") or r.name


@frappe.whitelist(methods=["GET"])
def dashboard():
	_guard()
	today = getdate()
	month = get_first_day(today)
	statuses = frappe.get_all("CRM Deal Status", ["name", "type", "color", "position"], order_by="position")
	kind = {s.name: s.type for s in statuses}
	deals = frappe.get_list("CRM Deal", fields=["status", "expected_deal_value", "deal_value", "closed_date", "modified"], limit_page_length=0)
	value = lambda d: flt(d.deal_value or d.expected_deal_value)  # noqa: E731
	stages = [{"status": s.name, "color": s.color, "type": s.type,
		"count": sum(1 for d in deals if d.status == s.name), "value": sum(value(d) for d in deals if d.status == s.name)} for s in statuses]
	closed = lambda d: getdate(d.closed_date or d.modified)  # noqa: E731
	won = [d for d in deals if kind.get(d.status) == "Won"]
	lost = [d for d in deals if kind.get(d.status) == "Lost"]
	recent_won = [d for d in won if closed(d) >= add_days(today, -90)]
	recent_lost = [d for d in lost if closed(d) >= add_days(today, -90)]
	leads = frappe.get_list("CRM Lead", fields=["source", "creation", "converted", "status"], filters={"creation": (">=", add_days(today, -90))},
		limit_page_length=0)
	by_source = {}
	for lead in leads:
		by_source[lead.source or _("Unknown")] = by_source.get(lead.source or _("Unknown"), 0) + 1
	tasks = frappe.get_list("CRM Task", filters={"assigned_to": frappe.session.user, "status": ("not in", ["Done", "Canceled"]),
		"due_date": ("<=", f"{nowdate()} 23:59:59")}, fields=["name", "title", "due_date", "priority", "reference_doctype", "reference_docname"],
		order_by="due_date asc", limit_page_length=8)
	recent = frappe.get_list("CRM Lead", fields=LEAD_FIELDS, filters={"converted": 0}, order_by="creation desc", limit_page_length=6)
	owners = _names([r.lead_owner for r in recent])
	for r in recent:
		r.person, r.owner_name = _person(r), owners.get(r.lead_owner)
	open_deals = [d for d in deals if kind.get(d.status) in ("Open", "Ongoing")]
	return {
		"new_leads_7d": sum(1 for lead in leads if getdate(lead.creation) >= add_days(today, -7)),
		"open_leads": frappe.db.count("CRM Lead", {"converted": 0, "status": ("not in", ["Junk", "Unqualified", "Converted"])}),
		"open_deals": len(open_deals), "pipeline_value": sum(value(d) for d in open_deals),
		"won_month": sum(1 for d in won if closed(d) >= month), "won_value_month": sum(value(d) for d in won if closed(d) >= month),
		"win_rate": round(100 * len(recent_won) / (len(recent_won) + len(recent_lost))) if (recent_won or recent_lost) else None,
		"lead_conversion": round(100 * sum(1 for lead in leads if lead.converted) / len(leads)) if leads else None,
		"stages": stages, "by_source": sorted(({"source": k, "count": v} for k, v in by_source.items()), key=lambda x: -x["count"]),
		"tasks": tasks, "recent_leads": recent,
	}


@frappe.whitelist(methods=["GET"])
def lead_statuses():
	_guard()
	return {"statuses": frappe.get_all("CRM Lead Status", ["name", "color", "type"], order_by="position"),
		"sources": frappe.get_all("CRM Lead Source", pluck="name", order_by="name"),
		"lost_reasons": frappe.get_all("CRM Lost Reason", pluck="name", order_by="name"),
		"pipeline_view": crm.pipeline_view_name()}


@frappe.whitelist(methods=["GET"])
def leads(q: str | None = None, status: str | None = None, source: str | None = None, include_converted: int = 0, limit: int = 100):
	_guard()
	filters = {}
	if status:
		filters["status"] = status
	if source:
		filters["source"] = source
	if not cint(include_converted):
		filters["converted"] = 0
	or_filters = {f: ("like", f"%{q}%") for f in ("lead_name", "first_name", "last_name", "mobile_no", "email", "organization")} if q else None
	rows = frappe.get_list("CRM Lead", fields=LEAD_FIELDS, filters=filters, or_filters=or_filters, order_by="creation desc",
		limit_page_length=min(cint(limit) or 100, 500))
	owners = _names([r.lead_owner for r in rows])
	deals = dict(frappe.get_all("CRM Deal", {"lead": ("in", [r.name for r in rows if r.converted] or [""])}, ["lead", "name"], as_list=True))
	for r in rows:
		r.person, r.owner_name, r.deal = _person(r), owners.get(r.lead_owner), deals.get(r.name)
	return rows


@frappe.whitelist(methods=["POST"])
def create_lead(full_name: str, mobile: str | None = None, email: str | None = None, source: str | None = None,
		note: str | None = None, client_type: str | None = None):
	_guard()
	from pakistan_tax_consultancy.utils.validators import normalize_mobile

	if not (full_name or "").strip() or not (mobile or email):
		frappe.throw(_("Give a name and a mobile number or email."))
	try:
		mobile = normalize_mobile(mobile) if mobile else None
	except ValueError as e:
		frappe.throw(_(str(e)))
	frappe.get_doc({"doctype": "CRM Lead"}).check_permission("create")
	return crm.make_lead(full_name.strip(), mobile, email, source=source or "Walk In", note=note, owner=frappe.session.user,
		client_type=client_type)


@frappe.whitelist(methods=["POST"])
def convert(lead: str):
	"""Lead -> deal at the first pipeline stage (Frappe CRM's own conversion: contact + deal)."""
	_guard()
	from crm.fcrm.doctype.crm_lead.crm_lead import convert_to_deal

	doc = frappe.get_doc("CRM Lead", lead)
	doc.check_permission("write")
	deal = convert_to_deal(lead=lead, doc=doc, deal={"status": crm.PIPELINE[0][0], "ptc_client_type": doc.get("ptc_client_type")})
	return deal


@frappe.whitelist(methods=["GET"])
def pipeline(owner: str | None = None, q: str | None = None):
	_guard()
	statuses = frappe.get_all("CRM Deal Status", ["name", "type", "color", "position", "probability"], order_by="position")
	filters = {"modified": (">=", add_days(nowdate(), -120))}
	if owner:
		filters["deal_owner"] = owner
	or_filters = {f: ("like", f"%{q}%") for f in ("lead_name", "first_name", "last_name", "organization_name", "mobile_no")} if q else None
	rows = frappe.get_list("CRM Deal", fields=DEAL_FIELDS, filters=filters, or_filters=or_filters, order_by="modified desc",
		limit_page_length=400)
	owners = _names([r.deal_owner for r in rows])
	for r in rows:
		r.person, r.owner_name = _person(r), owners.get(r.deal_owner)
	return {"statuses": statuses, "deals": rows}


@frappe.whitelist(methods=["POST"])
def move_deal(deal: str, status: str, lost_reason: str | None = None):
	_guard()
	doc = frappe.get_doc("CRM Deal", deal)
	doc.check_permission("write")
	kind = frappe.db.get_value("CRM Deal Status", status, "type")
	if not kind:
		frappe.throw(_("Unknown stage {0}").format(status))
	if kind == "Lost":
		if not lost_reason:
			frappe.throw(_("Choose why the deal was lost."))
		doc.lost_reason = lost_reason
	doc.status = status
	doc.probability = frappe.db.get_value("CRM Deal Status", status, "probability") or doc.probability
	doc.save()
	return {"status": doc.status, "tax_client": frappe.db.get_value("CRM Deal", deal, "tax_client")}


LEAD_FORM_FIELDS = ("salutation", "first_name", "last_name", "mobile_no", "email", "organization", "website", "job_title", "industry",
	"territory", "source", "status", "lead_owner", "ptc_client_type")


@frappe.whitelist(methods=["GET"])
def get_lead(name: str):
	_guard()
	doc = frappe.get_doc("CRM Lead", name)
	doc.check_permission("read")
	d = {f: doc.get(f) or "" for f in LEAD_FORM_FIELDS}
	d.update(mobile=d.pop("mobile_no"), client_type=d.pop("ptc_client_type") or "Individual-Salaried", name=doc.name,
		converted=doc.converted, can_write=doc.has_permission("write"))
	return d


@frappe.whitelist(methods=["POST"])
def save_lead(data: str | dict, name: str | None = None):
	"""The New / Edit Lead page: person, business, how they found us, owner, first note (rich text, new leads only)."""
	from pakistan_tax_consultancy.api.crm_activity import rich
	from pakistan_tax_consultancy.utils.validators import normalize_mobile

	_guard()
	d = frappe.parse_json(data) if isinstance(data, str) else data
	first = (d.get("first_name") or "").strip()
	if not first or not (d.get("mobile") or d.get("email")):
		frappe.throw(_("Give at least a first name and a mobile number or email."))
	mobile = None
	if d.get("mobile"):
		try:
			mobile = normalize_mobile(d["mobile"])
		except ValueError as e:
			frappe.throw(_(str(e)))
	dup = crm.find_lead(mobile, d.get("email"))
	if dup and dup != name and not frappe.utils.cint(d.get("allow_duplicate")):
		frappe.throw(_("A lead with this mobile or email already exists: {0}").format(dup), title=_("Possible duplicate"))
	values = {"salutation": d.get("salutation") or None, "first_name": first,
		"last_name": (d.get("last_name") or "").strip() or None, "mobile_no": mobile, "email": (d.get("email") or "").strip().lower() or None,
		"organization": (d.get("organization") or "").strip() or None, "website": (d.get("website") or "").strip() or None,
		"job_title": (d.get("job_title") or "").strip() or None, "industry": d.get("industry") or None, "territory": d.get("territory") or None,
		"source": d.get("source") or None, "status": d.get("status") or "New", "lead_owner": d.get("lead_owner") or frappe.session.user,
		"ptc_client_type": d.get("client_type") or "Individual-Salaried"}
	if name:
		lead = frappe.get_doc("CRM Lead", name)
		lead.check_permission("write")
		lead.update(values)
		lead.save()
		return lead.name
	lead = frappe.get_doc({"doctype": "CRM Lead", **values})
	lead.insert()
	note = rich(d.get("note"))
	if frappe.utils.strip_html(note).strip():
		frappe.get_doc({"doctype": "FCRM Note", "title": frappe.utils.strip_html(note).strip().split("\n")[0][:120], "content": note,
			"reference_doctype": "CRM Lead", "reference_docname": lead.name}).insert()
	return lead.name


@frappe.whitelist(methods=["GET"])
def lead_form_options():
	_guard()
	return {"sources": frappe.get_all("CRM Lead Source", pluck="name", order_by="name"),
		"statuses": frappe.get_all("CRM Lead Status", ["name", "color"], order_by="position"),
		"industries": frappe.get_all("CRM Industry", pluck="name", order_by="name"),
		"territories": frappe.get_all("CRM Territory", pluck="name", order_by="name"),
		"organizations": frappe.get_all("CRM Organization", pluck="name", order_by="modified desc", limit=200),
		"salutations": frappe.get_all("Salutation", pluck="name"),
		"owners": frappe.get_all("User", {"name": ("in", frappe.get_all("Has Role", {"role": ("in", ["Sales User", "Sales Manager"]), "parenttype": "User"},
			pluck="parent") or [""]), "enabled": 1}, ["name", "full_name"], order_by="full_name")}


DEAL_FORM_FIELDS = ("expected_deal_value", "deal_value", "service_package", "next_step", "expected_closure_date", "ptc_client_type", "organization_name")


@frappe.whitelist(methods=["POST"])
def update_deal(name: str, data: str | dict):
	"""Deal details from the deal page: value, package, next step, expected close."""
	_guard()
	doc = frappe.get_doc("CRM Deal", name)
	doc.check_permission("write")
	d = frappe.parse_json(data) if isinstance(data, str) else data
	doc.update({k: (d.get(k) or None) for k in DEAL_FORM_FIELDS if k in d})
	doc.save()
	return doc.name
