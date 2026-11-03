# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt
"""Client folders: safe names, adding files (fills an open request or makes a new document), versions, ZIP layout,
and the same access rules as the vault."""

import io
import zipfile
from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase

from pakistan_tax_consultancy.api import folders
from pakistan_tax_consultancy.services import folders as fs


def make_user(email, roles):
	if not frappe.db.exists("User", email):
		frappe.get_doc({"doctype": "User", "email": email, "first_name": email.split("@")[0], "send_welcome_email": 0,
			"roles": [{"role": r} for r in roles]}).insert(ignore_permissions=True)
	return email


def pdf(text="x") -> bytes:
	from pypdf import PdfWriter

	w = PdfWriter()
	w.add_blank_page(width=72, height=72)
	w.add_metadata({"/Title": text})
	buf = io.BytesIO()
	w.write(buf)
	return buf.getvalue()


def upload(name):
	return patch("pakistan_tax_consultancy.services.files.read_upload", return_value=(name, pdf(name)))


class TestClientFolders(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		frappe.set_user("Administrator")
		cls.consultant = make_user("f.consultant@example.com", ["Tax Consultant"])
		cls.other = make_user("f.other@example.com", ["Tax Consultant"])
		cls.client = frappe.get_doc({"doctype": "Tax Client", "client_name": "Folder: Test/Client?", "client_type":
			"Individual-Salaried", "mobile": "03009990201", "status": "Active", "assigned_consultant": cls.consultant}
			).insert(ignore_permissions=True)
		cls.year = frappe.get_all("Tax Year", pluck="name", order_by="name desc", limit=1)[0]
		cls.doc_type = frappe.get_all("Document Type", {"is_active": 1}, pluck="name", order_by="name", limit=1)[0]

	def setUp(self):
		frappe.set_user("Administrator")

	def tearDown(self):
		frappe.set_user("Administrator")

	def test_folder_names_are_safe(self):
		self.assertEqual(fs.clean('A/B: c? "d" <e>|f'), "A-B- c- -d- -e-f")
		self.assertEqual(fs.client_folder(self.client), f"{self.client.client_code} · Folder- Test-Client")
		self.assertEqual(fs.year_folder(None), fs.NO_YEAR)
		self.assertEqual(fs.year_folder("2026"), "TY2026")

	def test_add_file_fills_an_open_request_or_creates_a_document(self):
		frappe.set_user(self.consultant)
		request = frappe.get_doc({"doctype": "Tax Document", "tax_client": self.client.name, "document_type": self.doc_type,
			"document_name": self.doc_type, "tax_year": self.year, "status": "Requested"}).insert(ignore_permissions=True)
		with upload("first.pdf"):
			out = folders.add_file(self.client.name, self.doc_type, self.year, "WhatsApp")
		self.assertTrue(out["filled_request"])
		self.assertEqual(out["name"], request.name)
		with upload("second.pdf"):
			out = folders.add_file(self.client.name, self.doc_type, self.year)
		self.assertFalse(out["filled_request"])
		doc = frappe.get_doc("Tax Document", out["name"])
		self.assertEqual((doc.status, doc.tax_year, doc.is_client_upload), ("Pending", self.year, 0))
		tree = folders.tree(self.client.name)
		self.assertEqual(tree["client"]["folder"], fs.client_folder(self.client))
		self.assertEqual(len([f for f in tree["files"] if f.year_folder == f"TY{self.year}"]), 2)

	def test_replacing_a_file_keeps_the_old_version(self):
		with upload("v1.pdf"):
			name = folders.add_file(self.client.name, self.doc_type, None)["name"]
		with patch("pakistan_tax_consultancy.services.files.read_upload", return_value=("v2.pdf", pdf("v2"))):
			from pakistan_tax_consultancy.services.files import upload_tax_document

			upload_tax_document(name)
		versions = folders.versions(name)
		self.assertEqual([v.file_name for v in versions], ["v2.pdf", "v1.pdf"])
		self.assertEqual([v.current for v in versions], [True, False])

	def test_zip_keeps_the_folder_layout(self):
		with upload("cnic.pdf"):
			folders.add_file(self.client.name, self.doc_type, self.year)
		with upload("cnic.pdf"):  # same name in the same folder
			folders.add_file(self.client.name, self.doc_type, self.year)
		folders.download_zip(self.client.name, self.year)
		names = zipfile.ZipFile(io.BytesIO(frappe.local.response.filecontent)).namelist()
		root = f"{fs.client_folder(self.client)}/TY{self.year}/{fs.clean(self.doc_type)}"
		self.assertIn(f"{root}/cnic.pdf", names)
		self.assertEqual(len([n for n in names if n.startswith(f"{root}/cnic")]), 2)  # both kept, no overwrite
		self.assertEqual(len(names), len(set(names)))

	def test_access_follows_the_vault_rules(self):
		frappe.set_user(self.other)  # a consultant this client is not assigned to
		self.assertRaises(frappe.PermissionError, folders.tree, self.client.name)
		with upload("x.pdf"):
			self.assertRaises(frappe.PermissionError, folders.add_file, self.client.name, self.doc_type, self.year)
		client_user = frappe.db.get_value("Has Role", {"role": "Client", "parenttype": "User"}, "parent")
		if client_user:
			frappe.set_user(client_user)
			self.assertRaises(frappe.PermissionError, folders.tree, self.client.name)
