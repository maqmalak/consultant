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
		msg = frappe._dict(to=profile, direction="Incoming", message="Salam, fee kitni hai?", reference_docname=None, flags=frappe._dict())
		msg.get = lambda k, d=None: msg[k] if k in msg else d  # noqa: E731
		wa_inbox.link_party(msg)
		self.assertEqual(msg.reference_doctype, "CRM Lead")
		self.assertEqual(frappe.db.get_value("CRM Lead", msg.reference_docname, "source"), "WhatsApp")

	def test_whatsapp_messages_save_with_crm_installed(self):
		"""Frappe CRM's WhatsApp hooks expect older field names; the compat class keeps every save working."""
		from pakistan_tax_consultancy.api import whatsapp as wa
		from pakistan_tax_consultancy.services import wa_inbox

		frappe.db.set_single_value("Portal Integration Settings", "wa_mock_mode", 1)
		wa_inbox.install_mock()
		name = wa.simulate_incoming("03000990005", "Salam, tax return ki fee?", "Compat Tester")
		msg = frappe.get_doc("WhatsApp Message", name)
		self.assertEqual(msg.type, "Incoming")
		self.assertEqual((msg.reference_doctype, msg.reference_name), ("CRM Lead", msg.reference_docname))

	def test_lead_activities(self):
		from frappe.utils import add_days, now_datetime

		from pakistan_tax_consultancy.api import crm_activity as act

		lead = crm.make_lead("Activity Person", "+923000990006", source="Walk In", owner=self.consultant.name)
		frappe.set_user(self.consultant.name)
		act.add_note("CRM Lead", lead, "Met at the office; salaried, two employers.")
		act.add_task("CRM Lead", lead, "Collect salary certificates", str(add_days(now_datetime(), 1)), "High")
		event = act.schedule("Call", str(add_days(now_datetime(), 2)), note="Call about documents", ref_doctype="CRM Lead", ref_name=lead)
		d = act.detail("CRM Lead", lead)
		kinds = {i["kind"] for i in d["timeline"]}
		self.assertTrue({"note", "task", "event", "created"} <= kinds)
		self.assertEqual(len(d["open_tasks"]), 1)
		self.assertEqual(d["upcoming"][0]["id"], event)
		cal = act.calendar(str(now_datetime().date()), str(add_days(now_datetime(), 7).date()))
		self.assertTrue({"event", "task"} <= {c["kind"] for c in cal})
		self.assertRaises(frappe.ValidationError, act.send_email, "CRM Lead", lead, "Hi", "Hello")  # no email address / account


class TestLeadFinder(IntegrationTestCase):
	def test_only_public_addresses_are_fetched(self):
		from pakistan_tax_consultancy.services import lead_finder as lf

		for url in ("http://127.0.0.1:8010/", "http://localhost/", "http://169.254.169.254/latest/meta-data", "http://10.0.0.5/", "file:///etc/passwd"):
			self.assertFalse(lf._is_safe_url(url), url)
		row = lf.find_one("http://127.0.0.1:8010/")
		self.assertTrue(row.scrape_error)

	def test_apify_run_import(self):
		from unittest.mock import patch

		from pakistan_tax_consultancy.services import apify

		self.assertEqual(apify.run_id_from("https://console.apify.com/actors/nwua9Gu5YrADL7ZDj/runs/2FASrquyaonUxt8Iu#output"), "2FASrquyaonUxt8Iu")
		items = [{"title": "Test Karahi House", "phoneUnformatted": "+924100990001", "address": "D Ground, Faisalabad", "city": "Faisalabad",
			"countryCode": "PK", "categoryName": "Restaurant", "totalScore": 4.4, "reviewsCount": 120, "url": "https://maps.google.com/?cid=1",
			"placeId": "TESTPLACE1"}, {"title": ""}]

		def fake(method, path, token, **kw):
			if path.startswith("/actor-runs/"):
				return {"data": {"id": "2FASrquyaonUxt8Iu", "status": "SUCCEEDED", "defaultDatasetId": "DS1"}}
			return items

		with patch.object(apify, "_settings", return_value=(frappe._dict(), "token")), patch.object(apify, "_call", side_effect=fake):
			first = apify.import_run("2FASrquyaonUxt8Iu")
			again = apify.import_run("2FASrquyaonUxt8Iu")
		self.assertEqual((first["added"], first["skipped"]), (1, 1))
		self.assertEqual(again["added"], 0)  # the same place is never queued twice
		p = frappe.get_doc("Lead Prospect", {"place_id": "TESTPLACE1"})
		self.assertEqual((p.city, p.category, p.status), ("Faisalabad", "Restaurant", "Pending Review"))


class TestCrmPages(IntegrationTestCase):
	def test_email_template_render_and_rich_note(self):
		from pakistan_tax_consultancy.api import crm_activity as act
		from pakistan_tax_consultancy.api import email_templates as et

		et.save("Test Tpl Welcome", "Hello {{ first_name }}", "<p>Dear {{ first_name }}, <strong>welcome</strong> to {{ firm_name }}.</p><script>x()</script>")
		lead = crm.make_lead("Render Person", "+923000990201", source="Walk In")
		r = et.render(template="Test Tpl Welcome", doctype="CRM Lead", name=lead)
		self.assertEqual(r["subject"], "Hello Render")
		self.assertIn("<strong>welcome</strong>", r["body"])
		self.assertNotIn("<script", r["body"])
		act.add_note("CRM Lead", lead, "<p>Called <em>twice</em></p><img src=x onerror=alert(1)>")
		note = frappe.get_all("FCRM Note", {"reference_docname": lead}, pluck="content")[0]
		self.assertIn("<em>twice</em>", note)
		self.assertNotIn("onerror", note)

	def test_masters_and_attachments(self):
		from pakistan_tax_consultancy.api import crm_activity as act
		from pakistan_tax_consultancy.api import crm_masters as m

		m.save("CRM Lead Source", {"source_name": "Test Seminar", "details": "Tax seminar at the chamber"})
		rows = {r.name: r for r in m.rows("CRM Lead Source")["rows"]}
		self.assertIn("Test Seminar", rows)
		self.assertRaises(frappe.ValidationError, m.rows, "User")
		lead = crm.make_lead("Attach Person", "+923000990202", source="Test Seminar")
		f = frappe.get_doc({"doctype": "File", "file_name": "cnic.txt", "content": b"x", "attached_to_doctype": "CRM Lead", "attached_to_name": lead, "is_private": 1}).insert(ignore_permissions=True)
		self.assertEqual([a.name for a in act.attachments("CRM Lead", lead)], [f.name])
		act.remove_attachment("CRM Lead", lead, f.name)
		self.assertEqual(act.attachments("CRM Lead", lead), [])

	def test_edit_lead_and_deal(self):
		from pakistan_tax_consultancy.api import crm as crm_api

		lead = crm_api.save_lead({"first_name": "Edit", "last_name": "Me", "mobile": "03000990301", "source": "Walk In"})
		other = crm_api.save_lead({"first_name": "Other", "mobile": "03000990302", "source": "Walk In"})
		data = crm_api.get_lead(lead)
		self.assertEqual((data["first_name"], data["mobile"]), ("Edit", "+923000990301"))
		crm_api.save_lead({**data, "first_name": "Edited", "organization": "Edited Traders", "status": "Contacted"}, name=lead)
		self.assertEqual(frappe.db.get_value("CRM Lead", lead, ["first_name", "organization", "status"]), ("Edited", "Edited Traders", "Contacted"))
		# taking another lead's mobile is caught as a duplicate
		self.assertRaises(frappe.ValidationError, crm_api.save_lead, {**data, "mobile": "03000990302"}, name=lead)
		self.assertTrue(other)
		deal = crm_api.convert(lead)
		crm_api.update_deal(deal, {"expected_deal_value": 12000, "next_step": "Send quote", "expected_closure_date": "2026-10-30"})
		self.assertEqual(frappe.db.get_value("CRM Deal", deal, ["expected_deal_value", "next_step"]), (12000, "Send quote"))
