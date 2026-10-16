# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt
"""Frappe CRM glue: lead capture (website, WhatsApp), pipeline stages, won deal -> Tax Client, CRM roles."""

import frappe
from frappe.tests import IntegrationTestCase

from pakistan_tax_consultancy.services import crm
from pakistan_tax_consultancy.tests.test_permission_isolation import make_user


class TestCrm(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		crm.setup()
		cls.consultant = make_user("crm.consultant@example.com", ["Tax Consultant"], "Crm Consultant")
		crm.sync_roles(cls.consultant.name)

	def tearDown(self):
		frappe.set_user("Administrator")

	def test_pipeline_matches_a_tax_firm(self):
		self.assertEqual(frappe.get_all("CRM Deal Status", pluck="name", order_by="position"), [p[0] for p in crm.PIPELINE])
		self.assertEqual(frappe.db.get_value("CRM Deal Status", crm.WON, "type"), "Won")

	def test_staff_get_crm_roles(self):
		self.assertIn("Sales User", frappe.get_roles(self.consultant.name))

	def test_contact_form_creates_one_crm_lead_per_person(self):
		from pakistan_tax_consultancy.api import public

		public.contact("Test Crm Person", "03000990001", None, "Do I need to file?")
		public.contact("Test Crm Person", "0300-0990001", None, "Second message")
		leads = frappe.get_all("CRM Lead", {"mobile_no": ("like", "%3000990001")}, pluck="name")
		self.assertEqual(len(leads), 1)
		self.assertEqual(frappe.db.get_value("CRM Lead", leads[0], "source"), "Contact Form")
		self.assertEqual(frappe.db.count("FCRM Note", {"reference_doctype": "CRM Lead", "reference_docname": leads[0]}), 2)

	def test_won_deal_becomes_tax_client(self):
		from pakistan_tax_consultancy.api import crm as crm_api

		lead = crm.make_lead("Won Deal Person", "+923000990002", "won.deal@example.com", source="Referral", owner=self.consultant.name)
		frappe.set_user(self.consultant.name)
		deal = crm_api.convert(lead)
		self.assertEqual(frappe.db.get_value("CRM Deal", deal, "status"), crm.PIPELINE[0][0])
		res = crm_api.move_deal(deal, crm.WON)
		frappe.set_user("Administrator")
		client = frappe.get_doc("Tax Client", res["tax_client"])
		self.assertEqual((client.client_name, client.assigned_consultant), ("Won Deal Person", self.consultant.name))
		self.assertEqual(frappe.db.get_value("CRM Lead", lead, "tax_client"), client.name)
		# moving again never creates a second client
		frappe.get_doc("CRM Deal", deal).save()
		self.assertEqual(frappe.db.count("Tax Client", {"client_name": "Won Deal Person"}), 1)

	def test_lost_needs_a_reason(self):
		from pakistan_tax_consultancy.api import crm as crm_api

		lead = crm.make_lead("Lost Deal Person", "+923000990003", source="Walk In")
		deal = crm_api.convert(lead)
		self.assertRaises(frappe.ValidationError, crm_api.move_deal, deal, "Lost")
		self.assertEqual(crm_api.move_deal(deal, "Lost", crm.LOST_REASONS[0])["status"], "Lost")

	def test_unknown_whatsapp_number_becomes_crm_lead(self):
		from pakistan_tax_consultancy.services import wa_inbox

		profile = wa_inbox.profile_for("923000990004")
		frappe.db.set_value("WhatsApp Profile", profile, "profile_name", "Wa Stranger")
		msg = frappe._dict(to=profile, direction="Incoming", message="Salam, fee kitni hai?", reference_docname=None)
		msg.get = lambda k, d=None: msg[k] if k in msg else d  # noqa: E731
		wa_inbox.link_party(msg)
		self.assertEqual(msg.reference_doctype, "CRM Lead")
		self.assertEqual(frappe.db.get_value("CRM Lead", msg.reference_docname, "source"), "WhatsApp")
