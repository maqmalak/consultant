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
