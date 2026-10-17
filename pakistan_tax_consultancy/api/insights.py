"""Insights for the staff portal: season KPIs, monthly trends, the stage funnel, how long work waits, team performance
and the client mix — all scoped like the rest of the portal (a consultant sees their own clients, a field officer theirs).
"""

from datetime import timedelta

import frappe
from frappe.utils import add_months, flt, get_first_day, getdate, now_datetime

from pakistan_tax_consultancy.api.staff import require_staff
from pakistan_tax_consultancy.permissions import get_scope
from pakistan_tax_consultancy.services import workflow as wf

FUNNEL = [wf.DOCUMENTS_PENDING, wf.DRAFT, wf.PENDING_REVIEW, wf.UNDER_REVIEW, wf.REVIEWED, wf.AWAITING_CLIENT, wf.APPROVED, wf.SUBMITTED,
	wf.ACKNOWLEDGED]
OPEN = FUNNEL[:-1] + [wf.CHANGES_REQUIRED, wf.FILING_ERROR]
# days a return may sit in a state before it counts as late (review / approval SLAs come from settings)
SLA_DEFAULT = {wf.DOCUMENTS_PENDING: 10, wf.DRAFT: 5, wf.PENDING_REVIEW: 2, wf.UNDER_REVIEW: 3, wf.CHANGES_REQUIRED: 3, wf.REVIEWED: 1,
	wf.AWAITING_CLIENT: 5, wf.APPROVED: 2, wf.SUBMITTED: 3, wf.FILING_ERROR: 1}


def _client_scope():
	"""SQL condition on `tabTax Client` (alias c) for the current user, or '' for everyone."""
	user = frappe.db.escape(frappe.session.user)
	scope = get_scope()
	if scope == "consultant":
		return f" and c.assigned_consultant = {user}"
	if scope == "field":
		return f" and (c.field_officer = {user} or c.owner = {user})"
	return ""


def _months(n):
	first = get_first_day(getdate())
	return [add_months(first, -i) for i in range(n - 1, -1, -1)]


@frappe.whitelist(methods=["GET"])
def overview(tax_year: str | None = None, months: int = 6):
	require_staff()
	sc = _client_scope()
	from pakistan_tax_consultancy.api.reports import _current_year

	year = tax_year or _current_year() or str(getdate().year)
	yc = " and r.tax_year = %(year)s"
	p = {"year": year}
	months = max(3, min(int(months or 6), 12))
	start = _months(months)[0]
	p["start"] = start

	def one(sql, **extra):
		return frappe.db.sql(sql, {**p, **extra})[0][0] or 0

	today = getdate()
	m0, m1 = get_first_day(today), add_months(get_first_day(today), -1)
	returns = frappe.db.sql(f"""select r.name, r.workflow_state, r.creation, r.modified, r.assigned_consultant, r.net_tax_payable, r.refund_due,
		r.tax_liability, c.client_type, c.city, c.registration_source from `tabTax Return` r join `tabTax Client` c on c.name = r.tax_client
		where 1=1 {yc}{sc}""", p, as_dict=True)
	names = [r.name for r in returns] or [""]
	events = frappe.db.sql("""select reference_name, to_state, timestamp from `tabTax Audit Event` where reference_doctype = 'Tax Return'
		and reference_name in %(names)s and to_state is not null and to_state != '' order by timestamp""", {"names": names}, as_dict=True)
	entered = {}  # return -> [(state, when)]
	for e in events:
		entered.setdefault(e.reference_name, []).append((e.to_state, e.timestamp))

	# ---- KPIs
	filed = [r for r in returns if r.workflow_state in (wf.ACKNOWLEDGED, wf.CLOSED)]
	turnaround = []
	for r in filed:
		ack = next((t for s, t in entered.get(r.name, []) if s == wf.ACKNOWLEDGED), None)
		if ack:
			turnaround.append((ack - r.creation).total_seconds() / 86400)
	paid = lambda a, b: flt(one(f"""select sum(p.amount) from `tabPayment Proof` p join `tabTax Client` c on c.name = p.tax_client  # noqa: E731
		where p.status = 'Verified' and p.paid_on >= %(a)s and p.paid_on < %(b)s{sc}""", a=a, b=b))
	billed = flt(one(f"""select sum(e.net_fee) from `tabTax Engagement` e join `tabTax Client` c on c.name = e.tax_client
		where e.tax_year = %(year)s and e.status != 'Cancelled'{sc}"""))
	collected = flt(one(f"""select sum(p.amount) from `tabPayment Proof` p join `tabTax Engagement` e on e.name = p.tax_engagement
		join `tabTax Client` c on c.name = p.tax_client where p.status = 'Verified' and e.tax_year = %(year)s{sc}"""))
	visits_closed = one(f"""select count(*) from `tabSite Visit` v where v.status in ('Converted', 'Not Interested')
		{"and v.field_officer = %(u)s" if get_scope() == "field" else ""}""", u=frappe.session.user)
	visits_won = one(f"""select count(*) from `tabSite Visit` v where v.status = 'Converted'
		{"and v.field_officer = %(u)s" if get_scope() == "field" else ""}""", u=frappe.session.user)
	new_now = one(f"select count(*) from `tabTax Client` c where c.creation >= %(a)s{sc}", a=m0)
	new_prev = one(f"select count(*) from `tabTax Client` c where c.creation >= %(a)s and c.creation < %(b)s{sc}", a=m1, b=m0)
	kpis = {
		"clients": one(f"select count(*) from `tabTax Client` c where c.status = 'Active'{sc}"),
		"new_clients_month": new_now, "new_clients_prev": new_prev,
		"returns": len(returns), "in_progress": sum(1 for r in returns if r.workflow_state in OPEN),
		"filed": len(filed), "filed_pct": round(100 * len(filed) / len(returns)) if returns else 0,
		"avg_days_to_file": round(sum(turnaround) / len(turnaround), 1) if turnaround else None,
		"collected_month": paid(m0, add_months(m0, 1)), "collected_prev": paid(m1, m0),
		"billed": billed, "collected": collected, "outstanding": max(billed - collected, 0),
		"visit_conversion": round(100 * visits_won / visits_closed) if visits_closed else None,
		"payable": sum(flt(r.net_tax_payable) for r in returns), "refund": sum(flt(r.refund_due) for r in returns),
		"needs_attention": sum(1 for r in returns if r.workflow_state in (wf.CHANGES_REQUIRED, wf.FILING_ERROR)),
	}

	# ---- monthly trends (last N months)
	keys = [m.strftime("%Y-%m") for m in _months(months)]

	def by_month(sql, **extra):
		got = dict(frappe.db.sql(sql, {**p, **extra}))
		return [flt(got.get(k, 0)) for k in keys]

	fo = "and v.field_officer = %(u)s" if get_scope() == "field" else ""
	series = {
		"new_clients": by_month(f"""select date_format(c.creation, '%%Y-%%m'), count(*) from `tabTax Client` c where c.creation >= %(start)s{sc} group by 1"""),
		"returns_started": by_month(f"""select date_format(r.creation, '%%Y-%%m'), count(*) from `tabTax Return` r join `tabTax Client` c on c.name = r.tax_client
			where r.creation >= %(start)s{sc} group by 1"""),
		"returns_filed": by_month(f"""select date_format(a.timestamp, '%%Y-%%m'), count(*) from `tabTax Audit Event` a join `tabTax Client` c on c.name = a.tax_client
			where a.reference_doctype = 'Tax Return' and a.to_state = 'Acknowledged' and a.timestamp >= %(start)s{sc} group by 1"""),
		"visits": by_month(f"""select date_format(v.visit_date, '%%Y-%%m'), count(*) from `tabSite Visit` v where v.visit_date >= %(start)s {fo} group by 1""",
			u=frappe.session.user),
		"conversions": by_month(f"""select date_format(v.conversion_date, '%%Y-%%m'), count(*) from `tabSite Visit` v where v.status = 'Converted'
			and v.conversion_date >= %(start)s {fo} group by 1""", u=frappe.session.user),
		"collections": by_month(f"""select date_format(p.paid_on, '%%Y-%%m'), sum(p.amount) from `tabPayment Proof` p join `tabTax Client` c on c.name = p.tax_client
			where p.status = 'Verified' and p.paid_on >= %(start)s{sc} group by 1"""),
	}
	trend = [{"month": k, "label": getdate(k + "-01").strftime("%b"), **{s: v[i] for s, v in series.items()}} for i, k in enumerate(keys)]

	# ---- funnel + how long work has been waiting in each open state
	settings = frappe.get_cached_doc("Tax Consultancy Settings")
	sla = {**SLA_DEFAULT, wf.PENDING_REVIEW: settings.review_sla_days or 2, wf.AWAITING_CLIENT: SLA_DEFAULT[wf.AWAITING_CLIENT],
		wf.APPROVED: settings.approval_sla_days or 2}
	now = now_datetime()
	waiting = {}
	for r in returns:
		if r.workflow_state not in OPEN:
			continue
		since = next((t for s, t in reversed(entered.get(r.name, [])) if s == r.workflow_state), r.creation)
		waiting.setdefault(r.workflow_state, []).append((now - since).total_seconds() / 86400)
	funnel = [{"state": s, "count": sum(1 for r in returns if r.workflow_state == s or (s != wf.ACKNOWLEDGED and _past(r.workflow_state, s)))}
		for s in FUNNEL]
	stages = [{"state": s, "count": len(waiting.get(s, [])), "avg_days": round(sum(waiting[s]) / len(waiting[s]), 1) if waiting.get(s) else 0,
		"late": sum(1 for d in waiting.get(s, []) if d > sla.get(s, 5)), "sla_days": sla.get(s, 5)} for s in OPEN]

	# ---- average time spent in each step (finished steps only)
	spent = {}
	for steps in entered.values():
		for (s, t), (_s2, t2) in zip(steps, steps[1:]):
			spent.setdefault(s, []).append((t2 - t).total_seconds() / 86400)
	step_time = [{"state": s, "avg_days": round(sum(spent[s]) / len(spent[s]), 1), "n": len(spent[s])} for s in FUNNEL if spent.get(s)]

	# ---- team
	team = {}
	for r in returns:
		t = team.setdefault(r.assigned_consultant or "Unassigned", {"open": 0, "filed": 0, "payable": 0.0, "days": []})
		if r.workflow_state in OPEN:
			t["open"] += 1
		if r.workflow_state in (wf.ACKNOWLEDGED, wf.CLOSED):
			t["filed"] += 1
			ack = next((x for s, x in entered.get(r.name, []) if s == wf.ACKNOWLEDGED), None)
			if ack:
				t["days"].append((ack - r.creation).total_seconds() / 86400)
		t["payable"] += flt(r.net_tax_payable)
	team_rows = [{"user": u, "name": frappe.utils.get_fullname(u) if u != "Unassigned" else u, "open": t["open"], "filed": t["filed"],
		"avg_days": round(sum(t["days"]) / len(t["days"]), 1) if t["days"] else None, "payable": t["payable"]}
		for u, t in sorted(team.items(), key=lambda x: -(x[1]["open"] + x[1]["filed"]))]
	actions = frappe.db.sql("""select a.user, a.to_state, count(*) from `tabTax Audit Event` a where a.reference_doctype = 'Tax Return'
		and a.reference_name in %(names)s and a.to_state in ('Reviewed', 'Approved', 'Acknowledged') group by a.user, a.to_state""",
		{"names": names})
	done = {}
	for u, s, n in actions:
		done.setdefault(u, {})[s] = n
	people = [{"user": u, "name": frappe.utils.get_fullname(u), "reviewed": d.get("Reviewed", 0), "approved": d.get("Approved", 0),
		"filed": d.get("Acknowledged", 0)} for u, d in done.items()]

	# ---- mix
	def mix(key, top=6):
		counts = {}
		for r in returns:
			counts[r.get(key) or "—"] = counts.get(r.get(key) or "—", 0) + 1
		rows = sorted(counts.items(), key=lambda x: -x[1])
		if len(rows) > top:
			rows = rows[: top - 1] + [("Other", sum(n for _k, n in rows[top - 1:]))]
		return [{"name": k, "count": n} for k, n in rows]

	packages = frappe.db.sql(f"""select e.service_package, count(*), sum(e.net_fee) from `tabTax Engagement` e join `tabTax Client` c on c.name = e.tax_client
		where e.tax_year = %(year)s and e.status != 'Cancelled'{sc} group by e.service_package order by 2 desc""", p)
	return {
		"tax_year": year, "scope": get_scope(), "kpis": kpis, "trend": trend, "funnel": funnel, "stages": stages, "step_time": step_time,
		"team": team_rows, "people": people,
		"mix": {"client_type": mix("client_type"), "city": mix("city"), "source": mix("registration_source", 4),
			"packages": [{"name": n or "—", "count": c, "fees": flt(f)} for n, c, f in packages]},
		"generated": str(now),
	}


def _past(current, state):
	"""True when a return in `current` has already been through `state` (for the cumulative funnel)."""
	if current in (wf.CHANGES_REQUIRED,):
		current = wf.UNDER_REVIEW
	if current in (wf.FILING_ERROR,):
		current = wf.SUBMITTED
	if current == wf.CLOSED:
		current = wf.ACKNOWLEDGED
	return current in FUNNEL and FUNNEL.index(current) > FUNNEL.index(state)
