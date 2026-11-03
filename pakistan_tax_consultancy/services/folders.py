"""Client folders: the Tax Document vault shown as `C-00456 · Name / TY2026 / Document type / file`.

The folders are a view, not storage: every file stays a private File on its Tax Document, with the same permission
checks and audit as before. The names here are also the paths inside a ZIP download (and of a future Drive sync).
"""

import io
import re
import zipfile

import frappe
from frappe import _

BAD_CHARS = re.compile(r'[/\\:*?"<>|\x00-\x1f]+')
NO_YEAR = "No tax year"
MAX_ZIP_BYTES = 300 * 1024 * 1024


def clean(name: str, limit: int = 60) -> str:
	"""A name that is safe as a folder or file name on Windows, macOS and Linux."""
	name = BAD_CHARS.sub("-", (name or "").strip()).strip(" .-")
	return (name[:limit].rstrip(" .-") or "untitled")


def client_folder(client) -> str:
	"""`C-00456 · Asad Sheikh` (the client code is permanent, so the folder survives a change of name)."""
	code = client.get("client_code") or client.get("name")
	return f"{code} · {clean(client.get('client_name') or '')}"


def year_folder(tax_year) -> str:
	return f"TY{tax_year}" if tax_year else NO_YEAR


def file_versions(tax_document: str, current: str | None) -> list[dict]:
	"""Every file ever attached to the document's file field, newest first; the one in use is marked current."""
	files = frappe.get_all("File", filters={"attached_to_doctype": "Tax Document", "attached_to_name": tax_document,
		"attached_to_field": ("in", ("file", "", None))}, fields=["name", "file_name", "file_url", "file_size", "creation", "owner"],
		order_by="creation desc")
	for f in files:
		f.current = f.file_url == current
	return files


def zip_folder(client, documents) -> tuple[str, bytes]:
	"""ZIP of the current file of each document, laid out in client / year / type folders."""
	root = client_folder(client)
	buf, used, total = io.BytesIO(), set(), 0
	with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
		for d in documents:
			file = frappe.get_doc("File", {"file_url": d.file, "attached_to_doctype": "Tax Document", "attached_to_name": d.name})
			content = file.get_content(encodings=[])
			total += len(content)
			if total > MAX_ZIP_BYTES:
				frappe.throw(_("These files are larger than {0} MB together. Download a single year or folder instead.").format(
					MAX_ZIP_BYTES // (1024 * 1024)))
			base, dot, ext = clean(file.file_name, 120).rpartition(".")
			stem = base if dot else ext
			path = f"{root}/{year_folder(d.tax_year)}/{clean(d.document_type)}/{stem}{dot}{ext if dot else ''}"
			n = 2
			while path in used:  # two files with the same name in one folder
				path = f"{root}/{year_folder(d.tax_year)}/{clean(d.document_type)}/{stem} ({n}){dot}{ext if dot else ''}"
				n += 1
			used.add(path)
			zf.writestr(path, content)
	return f"{root}.zip", buf.getvalue()
