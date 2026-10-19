# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt
"""Data Entry Officer: enters "What the client told us" and records the client's approval on their behalf."""

import frappe
from frappe.tests import IntegrationTestCase

from pakistan_tax_consultancy.api import staff
from pakistan_tax_consultancy.permissions import get_scope
from pakistan_tax_consultancy.services import workflow as wf

USER = "test-dataentry@demo.taxportal.example"


def _data_entry_user():
	if not frappe.db.exists("User", USER):
		u = frappe.get_doc({"doctype": "User", "email": USER, "first_name": "Test Data Entry", "send_welcome_email": 0})
		u.insert(ignore_permissions=True)
		u.add_roles("Data Entry Officer")


class TestOnBehalf(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		_data_entry_user()

	def setUp(self):
		frappe.set_user("Administrator")
		self.tr = frappe.db.get_value("Tax Return", {"workflow_state": wf.DRAFT}, "name") \
			or frappe.db.get_value("Tax Return", {"workflow_state": ("in", (wf.DOCUMENTS_PENDING, wf.CHANGES_REQUIRED))}, "name")
		if not self.tr:
			self.skipTest("no return in preparation on this site")

	def tearDown(self):
		frappe.set_user("Administrator")

	def test_role_reads_but_cannot_edit_figures(self):
		frappe.set_user(USER)
		self.assertEqual(get_scope(), "all")
		doc = frappe.get_doc("Tax Return", self.tr)
		self.assertTrue(doc.has_permission("read"))
		self.assertFalse(doc.has_permission("write"))
		self.assertTrue(frappe.has_permission("Tax Client", "read"))
		self.assertFalse(frappe.has_permission("Tax Calculation", "read"))

	def test_enter_details_for_client(self):
		frappe.set_user(USER)
		out = staff.save_client_details(self.tr, frappe.as_json({"salary": [{"employer": "Test Mills", "annual_salary": 1_200_000,
			"tax_deducted": 30_000}], "notes": "Told us on the phone"}))
		self.assertEqual(out["salary"][0]["annual_salary"], 1_200_000)
		row = frappe.db.get_value("Tax Return", self.tr, ["client_details", "client_details_entered_by"], as_dict=True)
		self.assertEqual(row.client_details_entered_by, USER)
		self.assertIn("Test Mills", row.client_details)
		self.assertTrue(frappe.db.exists("Tax Audit Event", {"reference_name": self.tr, "event_type": "Update", "user": USER}))
		# still allowed after review / approval (flagged to the consultant), but not once submitted to FBR
		frappe.db.set_value("Tax Return", self.tr, "workflow_state", wf.APPROVED)
		staff.save_client_details(self.tr, frappe.as_json({"notes": "Also has a second bank account"}))
		self.assertTrue(frappe.db.exists("Comment", {"reference_name": self.tr, "content": ("like", "%check whether the return needs changes%")}))
		frappe.db.set_value("Tax Return", self.tr, "workflow_state", wf.SUBMITTED)
		self.assertRaises(frappe.ValidationError, staff.save_client_details, self.tr, "{}")
		self.assertRaises(frappe.ValidationError, staff.save_answers_for_client, self.tr, "{}")

	def test_answer_questionnaire_for_client(self):
		frappe.set_user(USER)
		before = frappe.db.get_value("Tax Return", self.tr, "owns_vehicle")
		staff.save_answers_for_client(self.tr, frappe.as_json({"owns_vehicle": 0 if before else 1, "not_a_question": 1}))
		self.assertEqual(frappe.db.get_value("Tax Return", self.tr, "owns_vehicle"), 0 if before else 1)

	def test_every_team_role_can_act_but_not_clients(self):
		filer = frappe.db.get_value("Has Role", {"role": "Filing Officer", "parenttype": "User", "parent": ("like", "%@demo.taxportal.example")}, "parent")
		if filer:
			frappe.set_user(filer)
			self.assertIn("salary", staff.save_client_details(self.tr, frappe.as_json({"salary": [{"employer": "Filer entry"}]})))
		client = frappe.db.get_value("Has Role", {"role": "Client", "parenttype": "User"}, "parent")
		frappe.set_user(client or "Guest")
		self.assertRaises(frappe.PermissionError, staff.save_client_details, self.tr, "{}")

	def test_record_approval_and_four_eyes(self):
		frappe.db.set_value("Tax Return", self.tr, {"workflow_state": wf.AWAITING_CLIENT, "client_confirmed": 0})
		frappe.set_user(USER)
		self.assertRaises(frappe.ValidationError, staff.confirm_for_client, self.tr, "Phone call", "ok")  # note too short
		self.assertRaises(frappe.ValidationError, staff.confirm_for_client, self.tr, "Telepathy", "Called the client, agreed")
		staff.confirm_for_client(self.tr, "Phone call", "Called the client at 4 pm, read the summary, agreed")
		doc = frappe.get_doc("Tax Return", self.tr)
		self.assertEqual((doc.client_confirmed, doc.client_confirmed_via, doc.client_confirmed_by), (1, "On behalf", USER))
		self.assertEqual(doc.client_confirmation_method, "Phone call")
		self.assertRaises(frappe.ValidationError, staff.confirm_for_client, self.tr, "Phone call", "Called the client again")
		# whoever recorded the approval cannot also approve the return
		frappe.set_user("Administrator")
		frappe.db.set_value("Tax Return", self.tr, "client_confirmed_by", "Administrator")
		doc = frappe.get_doc("Tax Return", self.tr)
		doc.workflow_state = wf.APPROVED
		self.assertRaisesRegex(frappe.ValidationError, "recorded the client's confirmation", doc.save, ignore_permissions=True)


def _pdf():
	import io

	from pypdf import PdfWriter

	w, buf = PdfWriter(), io.BytesIO()
	w.add_blank_page(width=200, height=200)
	w.write(buf)
	return buf.getvalue()


class TestWhatsAppDocuments(IntegrationTestCase):
	"""A file the client sent on WhatsApp is attached to their checklist; data entry cannot verify it."""

	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		_data_entry_user()

	def setUp(self):
		frappe.set_user("Administrator")
		self.td = frappe.db.get_value("Tax Document", {"status": "Requested", "tax_return": ("is", "set")}, ["name", "tax_client"], as_dict=True)
		if not self.td:
			self.skipTest("no requested document on this site")
		from pakistan_tax_consultancy.services import wa_inbox

		mobile = frappe.db.get_value("Tax Client", self.td.tax_client, "mobile_e164") or "+923009990001"
		profile = wa_inbox.profile_for(mobile)
		frappe.flags.ptc_system_send = True
		self.msg = frappe.get_doc({"doctype": "WhatsApp Message", "type": "Incoming", "direction": "Incoming", "to": profile, "whatsapp_account": wa_inbox.ACCOUNT,
			"from": wa_inbox.wa_id(mobile), "message": "my salary certificate", "mime_type": "application/pdf",
			"message_id": "test-wa-file-1", "content_type": "document"}).insert(ignore_permissions=True)
		f = frappe.get_doc({"doctype": "File", "file_name": "salary.pdf", "is_private": 1, "content": _pdf(),
			"attached_to_doctype": "WhatsApp Message", "attached_to_name": self.msg.name}).insert(ignore_permissions=True)
		self.msg.db_set("attach", f.file_url)
		frappe.db.set_value("Client Conversation", profile, "tax_client", self.td.tax_client)
		frappe.flags.ptc_system_send = False

	def tearDown(self):
		frappe.set_user("Administrator")

	def test_attach_from_whatsapp(self):
		frappe.set_user(USER)
		files = staff.client_whatsapp_files(self.td.tax_client)
		self.assertIn(self.msg.name, [f["message"] for f in files])
		staff.attach_from_whatsapp(self.td.name, self.msg.name)
		doc = frappe.get_doc("Tax Document", self.td.name)
		self.assertEqual((doc.status, doc.received_via, doc.whatsapp_message, doc.uploaded_by), ("Pending", "WhatsApp", self.msg.name, USER))
		self.assertTrue(doc.file)
		# data entry uploads, a consultant / reviewer verifies
		self.assertRaises(frappe.PermissionError, staff.verify_document, self.td.name, "Verified")

	def test_file_from_another_client_is_refused(self):
		other = frappe.db.get_value("Tax Document", {"status": "Requested", "tax_client": ("!=", self.td.tax_client)}, "name")
		if not other:
			self.skipTest("needs a second client")
		frappe.set_user(USER)
		self.assertRaises(frappe.PermissionError, staff.attach_from_whatsapp, other, self.msg.name)
