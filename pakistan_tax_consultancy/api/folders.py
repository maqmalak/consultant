"""Staff client folders: browse, preview, add files, older versions and ZIP download (services/folders.py)."""

import mimetypes

import frappe
from frappe import _

from pakistan_tax_consultancy.services import folders as fs


def _client(tax_client: str):
	from pakistan_tax_consultancy.api.staff import require_staff
	from pakistan_tax_consultancy.permissions import can_access_client

	require_staff()
	if not can_access_client(tax_client):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	return frappe.db.get_value("Tax Client", tax_client, ["name", "client_code", "client_name"], as_dict=True)


def _documents(tax_client: str, tax_year: str | None = None, document_type: str | None = None):
	filters = {"tax_client": tax_client, "file": ("is", "set")}
	if tax_year == fs.NO_YEAR:
		filters["tax_year"] = ("is", "not set")
	elif tax_year:
		filters["tax_year"] = tax_year
	if document_type:
		filters["document_type"] = document_type
	return frappe.get_all("Tax Document", filters, ["name", "document_type", "document_name", "tax_year", "tax_return",
		"status", "upload_date", "is_client_upload", "received_via", "file", "expiry_date"], order_by="upload_date desc, creation desc")


@frappe.whitelist(methods=["GET"])
def tree(tax_client: str):
	"""Everything the folder view needs: the client's folder name, its files and what can be uploaded."""
	from pakistan_tax_consultancy.services.files import RECEIVED_VIA

	client = _client(tax_client)
	docs = _documents(tax_client)
	counts, current = {}, {}
	for f in frappe.get_all("File", filters={"attached_to_doctype": "Tax Document",
			"attached_to_name": ("in", [d.name for d in docs] or [""])}, fields=["attached_to_name", "file_url", "file_name", "file_size"]):
		counts[f.attached_to_name] = counts.get(f.attached_to_name, 0) + 1
		current.setdefault((f.attached_to_name, f.file_url), f)
	for d in docs:
		f = current.get((d.name, d.file)) or {}
		d.file_name = f.get("file_name") or d.document_name
		d.file_size = f.get("file_size") or 0
		d.ext = d.file_name.rsplit(".", 1)[-1].lower() if "." in (d.file_name or "") else ""
		d.versions = counts.get(d.name, 1)
		d.year_folder = fs.year_folder(d.tax_year)
		del d["file"]
	years = sorted({d.tax_year for d in docs if d.tax_year} | set(frappe.get_all("Tax Year", pluck="name"))
		| set(frappe.get_all("Tax Return", {"tax_client": tax_client}, pluck="tax_year")), reverse=True)
	return {"client": {**client, "folder": fs.client_folder(client)}, "files": docs, "years": years,
		"document_types": frappe.get_all("Document Type", {"is_active": 1}, pluck="name", order_by="name"),
		"received_via": list(RECEIVED_VIA), "max_mb": fs_max_mb()}


def fs_max_mb() -> int:
	from pakistan_tax_consultancy.services.files import max_bytes

	return max_bytes() // (1024 * 1024)


@frappe.whitelist(methods=["POST"])
def add_file(tax_client: str, document_type: str, tax_year: str | None = None, received_via: str | None = None):
	"""One file dropped into a folder. It fills an open request for that document (same type and year) if there is
	one, so the return's checklist moves on; otherwise it becomes a new Tax Document. Either way it waits for
	verification ("Pending")."""
	from pakistan_tax_consultancy.services.files import upload_tax_document

	_client(tax_client)
	if not frappe.db.exists("Document Type", {"name": document_type, "is_active": 1}):
		frappe.throw(_("Unknown document type."))
	tax_year = tax_year if tax_year and tax_year != fs.NO_YEAR else None
	if tax_year and not frappe.db.exists("Tax Year", tax_year):
		frappe.throw(_("Unknown tax year."))
	request = frappe.db.get_value("Tax Document", {"tax_client": tax_client, "document_type": document_type,
		"tax_year": tax_year or ("is", "not set"), "status": ("in", ("Requested", "Rejected")), "file": ("is", "not set")}, "name")
	if not request:
		tax_return = frappe.db.get_value("Tax Return", {"tax_client": tax_client, "tax_year": tax_year}, "name",
			order_by="creation desc") if tax_year else None
		doc = frappe.get_doc({"doctype": "Tax Document", "tax_client": tax_client, "document_type": document_type,
			"document_name": document_type, "tax_year": tax_year, "tax_return": tax_return, "status": "Requested",
			"is_required": 0})
		doc.insert(ignore_permissions=True)
		request = doc.name
		filled = False
	else:
		filled = True
	out = upload_tax_document(request, received_via)
	return {**out, "filled_request": filled}


@frappe.whitelist(methods=["GET"])
def versions(tax_document: str):
	doc = frappe.get_doc("Tax Document", tax_document)
	_client(doc.tax_client)
	doc.check_permission("read")
	return fs.file_versions(tax_document, doc.file)


@frappe.whitelist(methods=["GET"])
def download_version(tax_document: str, file: str):
	"""An older file of a document (the current one goes through staff.download like every other file)."""
	from pakistan_tax_consultancy.audit import log_event

	doc = frappe.get_doc("Tax Document", tax_document)
	_client(doc.tax_client)
	doc.check_permission("read")
	f = frappe.get_doc("File", file)
	if f.attached_to_doctype != "Tax Document" or f.attached_to_name != tax_document:
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	log_event("Download", doc, details={"field": "file", "file": f.file_name, "version": f.name})
	frappe.local.response.filename = f.file_name
	frappe.local.response.filecontent = f.get_content(encodings=[])
	frappe.local.response.type = "download"
	frappe.local.response.display_content_as = "inline" if (mimetypes.guess_type(f.file_name)[0] or "").startswith(
		("image/", "application/pdf")) else "attachment"


@frappe.whitelist(methods=["GET"])
def download_zip(tax_client: str, tax_year: str | None = None, document_type: str | None = None):
	"""The client's folder (or one year / one document type of it) as a ZIP, in the same folder layout."""
	from pakistan_tax_consultancy.audit import log_event

	client = _client(tax_client)
	docs = [d for d in _documents(tax_client, tax_year, document_type)
		if frappe.has_permission("Tax Document", "read", d.name)]
	if not docs:
		frappe.throw(_("There are no files in this folder."))
	filename, content = fs.zip_folder(client, docs)
	log_event("Download", frappe.get_doc("Tax Client", tax_client), details={"zip": filename, "files": len(docs),
		"tax_year": tax_year, "document_type": document_type, "bytes": len(content)})
	frappe.local.response.filename = filename.replace(" · ", " - ") if not (tax_year or document_type) else (
		f"{fs.clean(client.client_code or client.name)} {fs.clean(tax_year or '')} {fs.clean(document_type or '')}".strip() + ".zip")
	frappe.local.response.filecontent = content
	frappe.local.response.type = "download"
