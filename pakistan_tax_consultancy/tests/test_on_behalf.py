# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt
"""Data Entry Officer: enters "What the client told us" and records the client's approval on their behalf."""

import frappe
from frappe.tests import IntegrationTestCase

from pakistan_tax_consultancy.api import staff
from pakistan_tax_consultancy.permissions import get_scope
from pakistan_tax_consultancy.services import workflow as wf

USER = "test-dataentry@demo.taxportal.example"


class TestOnBehalf(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		if not frappe.db.exists("User", USER):
			u = frappe.get_doc({"doctype": "User", "email": USER, "first_name": "Test Data Entry", "send_welcome_email": 0})
			u.insert(ignore_permissions=True)
			u.add_roles("Data Entry Officer")

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
		# not once the return has gone to review
		frappe.db.set_value("Tax Return", self.tr, "workflow_state", wf.UNDER_REVIEW)
		self.assertRaises(frappe.ValidationError, staff.save_client_details, self.tr, "{}")

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
