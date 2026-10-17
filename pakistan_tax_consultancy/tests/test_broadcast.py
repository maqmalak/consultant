# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt
"""WhatsApp broadcast: consent rules, template / audience match, opt-outs, sending in test mode."""

import json

import frappe
from frappe.tests import IntegrationTestCase

from pakistan_tax_consultancy.api import broadcast as api
from pakistan_tax_consultancy.services import broadcast as svc
from pakistan_tax_consultancy.services import crm


class TestBroadcast(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		frappe.db.set_single_value("Portal Integration Settings", "wa_mock_mode", 1)
		svc.create_starter_templates()
		cls.lead_tpl = frappe.db.get_value("WhatsApp Template", {"template_label": "VVS Lead Introduction"})
		cls.client_tpl = frappe.db.get_value("WhatsApp Template", {"template_label": "VVS Filing Reminder"})
		cls.ok_lead = crm.make_lead("Bcast Yes", "+923000990101", source="Walk In")
		cls.out_lead = crm.make_lead("Bcast Stop", "+923000990102", source="Walk In")

	def test_template_must_match_audience(self):
		self.assertRaises(frappe.ValidationError, api.preview, json.dumps({"template": self.client_tpl, "audience": "Leads"}))

	def test_opted_out_and_unconsented_are_skipped(self):
		from pakistan_tax_consultancy.api import whatsapp as wa
		from pakistan_tax_consultancy.services import wa_inbox

		wa_inbox.install_mock()
		wa.simulate_incoming("03000990102", "STOP", "Bcast Stop")
		doc = api._draft({"template": self.lead_tpl, "audience": "Leads", "lead_source": "Walk In"})
		status = {r.party: r.status for r in doc.recipients}
		self.assertEqual(status.get(self.ok_lead), "Pending")
		self.assertEqual(status.get(self.out_lead), "Skipped")
		# clients who never agreed to WhatsApp are skipped too
		client_doc = api._draft({"template": self.client_tpl, "audience": "Clients - All Opted In"})
		for r in client_doc.recipients:
			if not frappe.db.get_value("Tax Client", r.party, "whatsapp_opt_in"):
				self.assertEqual(r.status, "Skipped")

	def test_broadcast_sends_in_test_mode(self):
		name = api.start(json.dumps({"template": self.lead_tpl, "audience": "Leads", "lead_source": "Walk In"}))
		doc = frappe.get_doc("WhatsApp Broadcast", name)
		self.assertEqual(doc.status, "Completed")
		sent = [r for r in doc.recipients if r.status == "Sent"]
		self.assertTrue(sent)
		msg = frappe.get_doc("WhatsApp Message", sent[0].whatsapp_message)
		self.assertTrue(msg.is_template)
		self.assertEqual(msg.reference_doctype, "CRM Lead")

	def test_edit_template(self):
		res = api.update_template(self.lead_tpl, "VVS Lead Introduction", "Assalam-o-Alaikum {{first_name}}, thank you for contacting us. Reply here any time.",
			{"first_name": "first_name"}, "VVS Consultants")
		doc = frappe.get_doc("WhatsApp Template", self.lead_tpl)
		self.assertEqual(res["status"], "Approved")  # test mode re-approves at once; live Meta returns Pending
		self.assertIn("Reply here any time", doc.message)
		self.assertEqual([(v.variable_name, v.variable_field) for v in doc.template_variables], [("first_name", "first_name")])
		# sensitive fields can never fill a template
		self.assertRaises(frappe.ValidationError, api.update_template, self.client_tpl, "x", "Dear {{c}}, your CNIC on file. Thanks.", {"c": "cnic"})

	def test_template_from_lead_page(self):
		"""Lead page → WhatsApp → Template: previewed and stored filled in from the lead, same consent rules as broadcasts."""
		from pakistan_tax_consultancy.api import crm_activity as act

		lead = crm.make_lead("Tpl Person", "+923000990103", source="Walk In")
		frappe.db.set_value("CRM Lead", lead, "first_name", "Tpl")
		rows = {r.name: r for r in act.whatsapp_templates("CRM Lead", lead)}
		self.assertIn(self.lead_tpl, rows)
		self.assertNotIn(self.client_tpl, rows)  # built on Tax Client, not leads
		self.assertIn("Tpl", rows[self.lead_tpl].preview)
		self.assertNotIn("{{", rows[self.lead_tpl].preview)
		msg = frappe.get_doc("WhatsApp Message", act.send_whatsapp_template("CRM Lead", lead, self.lead_tpl))
		self.assertTrue(msg.is_template)
		self.assertNotIn("{{", msg.message)
		self.assertRaises(frappe.ValidationError, act.send_whatsapp_template, "CRM Lead", lead, self.client_tpl)
		self.assertRaises(frappe.ValidationError, act.send_whatsapp_template, "CRM Lead", self.out_lead, self.lead_tpl)
