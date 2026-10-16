"""Private client files: validated upload, permission-checked and audited download.

Every client file is a private File attached to its record. The portal and desk download it only through
`stream`, which checks access to the record and writes a Tax Audit Event.
"""

import mimetypes

import frappe
from frappe import _
from frappe.utils import cint, getdate

ALLOWED = {
	"pdf": (b"%PDF",),
	"jpg": (b"\xff\xd8\xff",),
	"jpeg": (b"\xff\xd8\xff",),
	"png": (b"\x89PNG\r\n\x1a\n",),
}


def max_bytes() -> int:
	return (cint(frappe.db.get_single_value("Tax Consultancy Settings", "max_upload_mb")) or 10) * 1024 * 1024


def read_upload() -> tuple[str, bytes]:
	"""The single multipart file of this request, after type and size checks."""
	files = getattr(frappe.request, "files", None) or {}
	upload = files.get("file")
	if not upload:
		frappe.throw(_("No file received."))
	filename = (upload.filename or "upload").replace("/", "_").replace("\\", "_")
	content = upload.stream.read()
	ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
	if ext not in ALLOWED:
		frappe.throw(_("Only PDF, JPG or PNG files are accepted."))
	if not any(content.startswith(sig) for sig in ALLOWED[ext]):
		frappe.throw(_("The file content does not match its .{0} extension.").format(ext))
	if len(content) > max_bytes():
		frappe.throw(_("File is larger than {0} MB.").format(max_bytes() // (1024 * 1024)))
	return filename, content


def attach_private(doctype: str, name: str, fieldname: str, filename: str, content: bytes) -> str:
	f = frappe.get_doc({"doctype": "File", "file_name": filename, "attached_to_doctype": doctype,
		"attached_to_name": name, "attached_to_field": fieldname, "is_private": 1, "content": content})
	f.flags.ignore_permissions = True
	try:
		f.insert()
	except frappe.ValidationError:
		raise
	except Exception:
		# e.g. a damaged PDF that the PDF reader cannot open
		frappe.throw(_("This file could not be read. Please upload a clear PDF or photo."))
	return f.file_url


def upload_tax_document(tax_document: str) -> dict:
	from pakistan_tax_consultancy.audit import log_event
	from pakistan_tax_consultancy.permissions import can_access_client, get_scope

	doc = frappe.get_doc("Tax Document", tax_document)
	scope = get_scope()
	if scope == "none" or not can_access_client(doc.tax_client):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	if scope == "client" and doc.status == "Verified":
		frappe.throw(_("This document is already verified. Contact your consultant to replace it."))
	filename, content = read_upload()
	doc.file = attach_private("Tax Document", doc.name, "file", filename, content)
	doc.status = "Pending"
	doc.rejection_reason = None
	doc.uploaded_by = frappe.session.user
	doc.upload_date = getdate()
	doc.is_client_upload = 1 if scope == "client" else 0
	doc.save(ignore_permissions=True)
	log_event("Update", doc, details={"upload": filename, "bytes": len(content)})
	return {"name": doc.name, "status": doc.status}


# fields that hold a private file, per DocType, for the download endpoint
FILE_FIELDS = {
	"Tax Document": ("file",),
	"Tax Return": ("fbr_receipt",),
	"Filing Record": ("evidence",),
	"Payment Proof": ("proof_file",),
	"Generated Document": ("file",),
}


def stream(doctype: str, name: str, fieldname: str):
	from pakistan_tax_consultancy.audit import log_event

	if fieldname not in FILE_FIELDS.get(doctype, ()):
		frappe.throw(_("Not a downloadable file."), frappe.PermissionError)
	doc = frappe.get_doc(doctype, name)
	if not doc.has_permission("read"):
		log_event("Permission Denied", doc, details={"download": fieldname})
		if not frappe.flags.in_test:
			frappe.db.commit()  # keep the denied-download audit row although the request fails
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	file_url = doc.get(fieldname)
	if not file_url:
		frappe.throw(_("No file attached."))
	file = frappe.get_doc("File", {"file_url": file_url, "attached_to_doctype": doctype, "attached_to_name": name})
	log_event("Download", doc, details={"field": fieldname, "file": file.file_name})
	frappe.local.response.filename = file.file_name
	frappe.local.response.filecontent = file.get_content(encodings=[])  # raw bytes; decoding would corrupt PDFs
	frappe.local.response.type = "download"
	frappe.local.response.display_content_as = "inline" if (mimetypes.guess_type(file.file_name)[0] or "").startswith(
		("image/", "application/pdf")) else "attachment"
