"""Help centre: user manuals per role (manuals/*.md), A4 guides with screenshots (public/help/*.pdf, in git) and demo
videos (public/downloads/videos/*.mp4, copied to each server by hand like the sugarcane videos: a video is listed only
when its file is on this server). Shown in the portal at /staff/help (team) and /help (clients)."""

import os
import re

import frappe
from frappe import _

APP = os.path.dirname(os.path.dirname(__file__))
DIR = os.path.join(APP, "manuals")
PUBLIC = os.path.join(APP, "public")
EVERYONE = {"System Manager", "Tax Admin"}  # see every manual, guide and video
TEAM = ["Tax Admin", "Tax Consultant", "Tax Reviewer", "Tax Approver", "Filing Officer", "Field Officer", "Data Entry Officer"]

# In the order the work flows. "manuals": the guide is also shown at the top of those manuals.
GUIDES = [
	{"slug": "process-overview", "stage": "Start here", "title": "How a return moves through VVS", "kind": "Guide",
		"summary": "The 12 steps from the client's first contact to the IRIS acknowledgment, who does each one, and the screens they use.",
		"pdf": "help/process-overview.pdf", "video": "00-Full-process-one-return.mp4", "roles": ["all"],
		"manuals": ["getting-started", "admin"]},
	{"slug": "setup", "stage": "Start here", "title": "Setup — firm, team, roles and Ask VVS", "kind": "Guide",
		"summary": "Website & rules, settings (WhatsApp, email, payments), the team and their roles, and who may use Ask VVS.",
		"pdf": "help/setup.pdf", "video": "01-Setup-team-roles-settings.mp4", "roles": ["Tax Admin"], "manuals": ["admin"]},
	{"slug": "new-client", "stage": "Clients & intake", "title": "Register a client and invite them", "kind": "Guide",
		"summary": "A new client at the office: identifiers, client code, the assigned consultant, and the portal invitation by WhatsApp or email.",
		"pdf": "help/new-client.pdf", "video": "02-Register-client-and-invite.mp4", "roles": ["Tax Consultant", "Tax Admin"],
		"manuals": ["consultant", "admin"]},
	{"slug": "excel-import", "stage": "Clients & intake", "title": "Import clients and past returns from Excel", "kind": "Guide",
		"summary": "Download the template, fill clients and returns (filed history and this year's work), preview, then import.",
		"pdf": "help/excel-import.pdf", "video": "03-Import-from-Excel.mp4", "roles": ["Tax Admin", "Tax Consultant"],
		"manuals": ["admin", "consultant"]},
	{"slug": "site-visits", "stage": "Clients & intake", "title": "Site visits and leads", "kind": "Guide",
		"summary": "The field officer's visit form with location, the follow-up, and turning a visit into a client.",
		"pdf": "help/site-visits.pdf", "video": "04-Site-visit-to-client.mp4", "roles": ["Field Officer", "Tax Consultant"],
		"manuals": ["field-officer"]},
	{"slug": "client-portal", "stage": "Documents", "title": "The client portal — sign up, questionnaire, upload", "kind": "Guide",
		"summary": "What the client sees: creating an account, answering the questionnaire, uploading documents, messages and payments.",
		"pdf": "help/client-portal.pdf", "video": "05-Client-portal-website-to-filed.mp4", "roles": ["Client", "all"],
		"manuals": ["client", "getting-started"]},
	{"slug": "documents", "stage": "Documents", "title": "Verify documents and client folders", "kind": "Guide",
		"summary": "The verify queue, attaching files from WhatsApp, client folders (C-00456 · name / year / type), previews, versions and ZIP.",
		"pdf": "help/documents.pdf", "video": "06-Verify-documents-and-folders.mp4",
		"roles": ["Tax Consultant", "Data Entry Officer", "Tax Admin"], "manuals": ["consultant", "data-entry"]},
	{"slug": "preparation", "stage": "Return work", "title": "Prepare the return", "kind": "Guide",
		"summary": "What the client told us, the questionnaire on their behalf, income, deductions and withholding, the calculation, and submit for review.",
		"pdf": "help/preparation.pdf", "video": "07-Prepare-the-return.mp4",
		"roles": ["Tax Consultant", "Data Entry Officer"], "manuals": ["consultant", "data-entry"]},
	{"slug": "review-approval", "stage": "Return work", "title": "Review, client confirmation and approval", "kind": "Guide",
		"summary": "The review checklist, changes required, sending to the client, confirmation in the portal or on their behalf, and approval.",
		"pdf": "help/review-approval.pdf", "video": "08-Review-confirm-approve.mp4",
		"roles": ["Tax Reviewer", "Tax Approver", "Tax Consultant"], "manuals": ["reviewer", "approver"]},
	{"slug": "filing", "stage": "Return work", "title": "File on IRIS and record the acknowledgment", "kind": "Guide",
		"summary": "The filing queue, marking a return submitted, the IRIS acknowledgment number and receipt, and filing errors.",
		"pdf": "help/filing.pdf", "video": "09-File-on-IRIS-and-acknowledge.mp4", "roles": ["Filing Officer", "Tax Admin"],
		"manuals": ["filing-officer"]},
	{"slug": "payments", "stage": "Fees & records", "title": "Fees and payments", "kind": "Guide",
		"summary": "Service packages, the client's payment proof, verifying it against the bank, and the invoice it creates.",
		"pdf": "help/payments.pdf", "video": "10-Payments-to-verify.mp4", "roles": ["Tax Admin", "Client"], "manuals": ["admin", "client"]},
	{"slug": "vault-letters", "stage": "Fees & records", "title": "Document vault and letters", "kind": "Guide",
		"summary": "Every file of a client in one place, and letters on the firm letterhead: engagement, authority, checklist, computation.",
		"pdf": "help/vault-letters.pdf", "video": "11-Vault-and-letters.mp4", "roles": ["all"], "manuals": ["consultant", "client"]},
	{"slug": "ask-vvs", "stage": "Tools", "title": "Ask VVS — the AI assistant", "kind": "Guide",
		"summary": "Asking questions about clients and returns in plain language, charts, and Agent mode with Approve / Reject.",
		"pdf": "help/ask-vvs.pdf", "video": None, "roles": TEAM, "manuals": ["getting-started"]},
	{"slug": "reports", "stage": "Tools", "title": "Insights and reports", "kind": "Guide",
		"summary": "The dashboard, insights by consultant and status, and the report center with export.",
		"pdf": "help/reports.pdf", "video": "12-Insights-and-reports.mp4", "roles": ["Tax Admin", "Tax Consultant"], "manuals": ["admin"]},
]


def _mine() -> set:
	return set(frappe.get_roles())


def _sees_all(mine: set) -> bool:
	return frappe.session.user == "Administrator" or bool(EVERYONE & mine)


def _has(rel: str | None) -> bool:
	return bool(rel) and os.path.exists(os.path.join(PUBLIC, rel))


def _guides(mine: set, manual: str | None = None) -> list:
	staff = bool(set(TEAM) & mine) or _sees_all(mine)
	out = []
	for g in GUIDES:
		if manual and manual not in g["manuals"]:
			continue
		for_me = bool(set(g["roles"]) & mine) or ("all" in g["roles"] and (staff or "Client" in g["roles"]))
		if not (for_me or _sees_all(mine)):
			continue
		pdf = g["pdf"] if _has(g["pdf"]) else None
		video = f"downloads/videos/{g['video']}" if g["video"] and _has(f"downloads/videos/{g['video']}") else None
		if not (pdf or video):
			continue
		out.append({**{k: g[k] for k in ("slug", "title", "kind", "summary", "stage")}, "order": len(out) + 1,
			"roles": [r for r in g["roles"]], "pdf_url": f"/assets/pakistan_tax_consultancy/{pdf}" if pdf else None,
			"video_url": f"/assets/pakistan_tax_consultancy/{video}" if video else None,
			"mine": bool(set(g["roles"]) & mine) or "all" in g["roles"]})
	return out


def _read(slug: str) -> dict:
	path = os.path.join(DIR, f"{slug}.md")
	if not re.fullmatch(r"[a-z0-9-]+", slug or "") or not os.path.exists(path):
		frappe.throw(_("No such manual"), frappe.DoesNotExistError)
	text = open(path, encoding="utf-8").read()
	meta, body = {}, text
	m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
	if m:
		body = text[m.end():]
		for line in m.group(1).splitlines():
			k, _sep, v = line.partition(":")
			meta[k.strip()] = v.strip()
	roles = [r.strip() for r in meta.get("roles", "").split(",") if r.strip()]
	return {"slug": slug, "title": meta.get("title") or slug, "roles": roles, "order": int(meta.get("order") or 99), "body": body}


def _allowed(m: dict, mine: set) -> bool:
	if _sees_all(mine) or set(m["roles"]) & mine:
		return True
	return "all" in m["roles"] and bool(set(TEAM) & mine)  # "all" = the whole team; clients get their own manual


@frappe.whitelist(methods=["GET"])
def manuals() -> list:
	mine = _mine()
	out = []
	for f in sorted(os.listdir(DIR)):
		if f.endswith(".md"):
			m = _read(f[:-3])
			if _allowed(m, mine):
				out.append({"slug": m["slug"], "title": m["title"], "roles": m["roles"], "order": m["order"],
					"mine": bool(set(m["roles"]) & mine) or "all" in m["roles"]})
	return sorted(out, key=lambda m: (m["order"], m["title"]))


@frappe.whitelist(methods=["GET"])
def manual(slug: str) -> dict:
	m = _read(slug)
	if not _allowed(m, _mine()):
		frappe.throw(_("This manual is for another role."), frappe.PermissionError)
	return {"slug": m["slug"], "title": m["title"], "roles": m["roles"], "html": frappe.utils.md_to_html(m["body"]),
		"guides": _guides(_mine(), manual=slug)}


@frappe.whitelist(methods=["GET"])
def guides() -> list:
	return _guides(_mine())
