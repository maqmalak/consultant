"""Ask VVS: the Ask ALYF assistant inside the React staff portal.

A thin wrapper around ask_alyf's API so the portal never renders model output itself:
- assistant replies come back as sanitised HTML (Markdown rendered and cleaned on the server);
- the portal page the user is on is translated into the record context Ask ALYF understands;
- browser-side actions that only make sense in Desk are settled here: charts are accepted (Ask ALYF then attaches them
  to the reply), Desk navigation is declined with a pointer to the matching portal page.
Access is Ask ALYF's own: the "Ask ALYF User" role, and every tool call runs with the user's Frappe permissions.
"""

import re

import frappe
from frappe import _
from frappe.utils import cint
from frappe.utils.html_utils import sanitize_html

ROLE = "Ask ALYF User"
STAFF_ROLES = ("Tax Admin", "Tax Consultant", "Tax Reviewer", "Tax Approver", "Filing Officer", "Field Officer", "Data Entry Officer")
# portal routes → the record they show (doctype, route prefix)
PORTAL_RECORDS = (
	("Tax Return", r"^/staff/returns/([^/]+)"),
	("Tax Client", r"^/staff/clients/([^/]+)"),
	("Site Visit", r"^/staff/visits/([^/]+)"),
	("CRM Lead", r"^/crm/leads/([^/]+)"),
	("CRM Deal", r"^/crm/deals/([^/]+)"),
)
PORTAL_LINKS = {"Tax Return": "/staff/returns/{}", "Tax Client": "/staff/clients/{}", "Site Visit": "/staff/visits/{}",
	"CRM Lead": "/crm/leads/{}", "CRM Deal": "/crm/deals/{}"}
PORTAL_LISTS = {"Tax Return": "/staff/returns", "Tax Client": "/staff/clients", "Site Visit": "/staff/visits", "CRM Lead": "/crm/leads"}


def _alyf():
	if "ask_alyf" not in frappe.get_installed_apps():
		frappe.throw(_("Ask VVS is not installed on this site."))
	from ask_alyf.ask_alyf import api

	return api


def _require_access():
	api = _alyf()
	if not api.can_access_ask_alyf():
		frappe.throw(_("Ask VVS is not switched on for your account. Ask an admin to give you access on the Team page."), frappe.PermissionError)
	return api


# ----------------------------------------------------------------------------------------------- payload shaping
def _html(markdown_text: str) -> str:
	return sanitize_html(frappe.utils.md_to_html(markdown_text or "") or "")


def _message(m: dict) -> dict:
	meta = m.get("metadata") or {}
	out = {"id": m.get("id"), "role": m.get("role"), "created_at": m.get("created_at"), "mode": meta.get("mode")}
	if m.get("role") == "assistant":
		out["html"] = _html(m.get("content"))
		out["charts"] = meta.get("frappe_charts") or []
		out["steps"] = [{"label": t.get("label") or t.get("name"), "status": t.get("status")} for t in (meta.get("tool_calls") or [])
			if isinstance(t, dict)]
	else:
		out["text"] = m.get("content") or ""
	if isinstance(meta.get("files"), list):
		out["files"] = [{"name": f.get("file_name") or f.get("name"), "url": f.get("file_url")} for f in meta["files"] if isinstance(f, dict)]
	return out


def _conversation(payload: dict, links: list | None = None) -> dict:
	ops = [{"call_id": op.get("call_id"), "summary": op.get("summary") or op.get("tool"), "tool": op.get("tool"),
		"needs_confirmation": bool(op.get("requires_confirmation", True))}
		for op in payload.get("pending_operations") or [] if op.get("kind") == "backend_action"]
	return {"name": payload.get("name"), "title": payload.get("title"),
		"messages": [_message(m) for m in payload.get("messages") or [] if m.get("role") in ("user", "assistant", "system")],
		"pending": ops, "links": links or []}


def _portal_link(route) -> dict | None:
	"""A Desk route (['Form', 'Tax Return', 'X'] / ['List', 'Tax Client']) → the matching portal page, if there is one."""
	parts = route if isinstance(route, list) else str(route or "").strip("/").split("/")
	parts = [str(p) for p in parts if p]
	if len(parts) >= 3 and parts[0] == "Form" and parts[1] in PORTAL_LINKS:
		return {"label": f"{parts[1]} {parts[2]}", "to": PORTAL_LINKS[parts[1]].format(parts[2])}
	if len(parts) >= 2 and parts[0] == "List" and parts[1] in PORTAL_LISTS:
		return {"label": _("{0} list").format(parts[1]), "to": PORTAL_LISTS[parts[1]]}
	return None


def _settle_frontend_actions(conversation: str, mode: str) -> tuple[dict | None, list]:
	"""Resolve browser-side actions the portal cannot run in Desk. Returns (latest payload or None, portal links)."""
	api = _alyf()
	links, payload = [], None
	for _i in range(6):  # each call resolves one action; the agent may queue a few
		doc = frappe.get_doc("Ask ALYF Conversation", conversation)
		ops = [op for op in api.load_pending_operations(doc.pending_operation_json) if op.get("kind") == "frontend_action"]
		if not ops:
			break
		op = ops[0]
		tool, data = (op.get("tool") or "").strip(), op.get("payload") if isinstance(op.get("payload"), dict) else {}
		if tool == "show_chart":
			result = api.frontend_action_result(conversation, op.get("call_id"), "success", mode)
		else:
			link = _portal_link(data.get("route")) if tool == "set_route" else (
				{"label": _("New {0}").format(data.get("doctype")), "to": f"/app/{frappe.scrub(data.get('doctype') or '').replace('_', '-')}/new", "desk": True}
				if tool == "new_doc" and data.get("doctype") else None)
			if link:
				links.append(link)
			result = api.frontend_action_result(conversation, op.get("call_id"), "failed", mode,
				error=_("This assistant runs in the VVS staff portal, where Desk actions are not available.")
				+ (" " + _("A link to {0} was shown to the user instead.").format(link["label"]) if link else ""))
		payload = (result or {}).get("conversation") or payload
	return payload, links


def _context(path: str | None) -> dict:
	path = (path or "").split("?")[0]
	ctx = {"route": "portal" + path, "lang": frappe.local.lang or "en", "app": "VVS staff portal (React)",
		"user_roles": [r for r in frappe.get_roles() if r not in ("All", "Guest")]}
	for doctype, pattern in PORTAL_RECORDS:
		m = re.match(pattern, path)
		if m and m.group(1) not in ("new",) and frappe.db.exists(doctype, m.group(1)):
			ctx["current_doctype"], ctx["current_docname"] = doctype, m.group(1)
			break
	return ctx


# ----------------------------------------------------------------------------------------------- endpoints
@frappe.whitelist(methods=["GET"])
def status():
	"""What the portal needs to show the Ask VVS button (and why it may be unavailable)."""
	installed = "ask_alyf" in frappe.get_installed_apps()
	roles = set(frappe.get_roles())
	admin = frappe.session.user == "Administrator" or bool(roles & {"Tax Admin", "System Manager"})
	out = {"installed": installed, "has_access": installed and ROLE in roles, "can_manage": admin, "configured": False,
		"enabled": False, "agent_mode": False}
	if installed:
		boot = _alyf().get_ask_alyf_boot_payload()
		out.update(configured=bool(boot.get("configured")), enabled=bool(cint(frappe.db.get_single_value("Ask ALYF Settings", "enabled"))),
			agent_mode=bool(boot.get("agent_mode_enabled")) and _alyf().can_use_agent_mode())
	return out


@frappe.whitelist(methods=["GET"])
def conversations(limit: int = 20):
	return _require_access().list_conversations(limit=min(cint(limit) or 20, 50))


@frappe.whitelist(methods=["GET"])
def open_conversation(conversation: str | None = None):
	api = _require_access()
	payload = api.bootstrap(conversation=conversation or None)["conversation"]
	return _conversation(payload)


@frappe.whitelist(methods=["POST"])
def new_conversation():
	return _conversation(_require_access().start_new_conversation())


@frappe.whitelist(methods=["POST"])
def send(message: str, conversation: str | None = None, mode: str = "Ask", path: str | None = None):
	api = _require_access()
	message = (message or "").strip()
	if not message:
		frappe.throw(_("Type a question first."))
	return api.send_message(message=message[:8000], mode=mode, conversation=conversation or None, context=_context(path))


@frappe.whitelist(methods=["GET"])
def poll(conversation: str, user_message_id: str, job_id: str, mode: str = "Ask"):
	api = _require_access()
	res = api.get_message_job_status(conversation=conversation, user_message_id=user_message_id, job_id=job_id)
	if res.get("status") == "pending":
		return {"status": "pending", "steps": [{"label": s.get("label") or s.get("name"), "status": s.get("status")}
			for s in res.get("tool_calls") or [] if isinstance(s, dict)]}
	if res.get("status") == "completed":
		settled, links = _settle_frontend_actions(conversation, mode)
		return {"status": "completed", "conversation": _conversation(settled or res["conversation"], links)}
	return {"status": res.get("status")}


@frappe.whitelist(methods=["POST"])
def decide(conversation: str, call_id: str, approve: int, mode: str = "Agent"):
	"""Confirm or reject a change the assistant proposed (Agent mode)."""
	api = _require_access()
	fn = api.confirm_pending_operation if cint(approve) else api.reject_pending_operation
	payload = fn(conversation=conversation, call_id=call_id, mode=mode)["conversation"]
	settled, links = _settle_frontend_actions(conversation, mode)
	return _conversation(settled or payload, links)


@frappe.whitelist(methods=["POST"])
def stop(conversation: str, user_message_id: str, job_id: str):
	return _require_access().stop_message(conversation=conversation, user_message_id=user_message_id, job_id=job_id)


@frappe.whitelist(methods=["POST"])
def set_access(user: str, enabled: int):
	"""Team page switch: give or remove a staff member's Ask VVS access (the Ask ALYF User role)."""
	if frappe.session.user != "Administrator" and not set(frappe.get_roles()) & {"Tax Admin", "System Manager"}:
		frappe.throw(_("Only an admin can change Ask VVS access."), frappe.PermissionError)
	_alyf()
	if not set(frappe.get_roles(user)) & set(STAFF_ROLES):
		frappe.throw(_("Ask VVS is for team members only."))
	doc = frappe.get_doc("User", user)
	if cint(enabled):
		doc.add_roles(ROLE)
	else:
		doc.remove_roles(ROLE)
	from pakistan_tax_consultancy.audit import log_event

	log_event("Update", reference_doctype="User", reference_name=user, details={"ask_vvs_access": bool(cint(enabled))})
	return {"user": user, "enabled": ROLE in frappe.get_roles(user)}
