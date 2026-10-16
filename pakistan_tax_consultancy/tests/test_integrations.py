"""WhatsApp Cloud API payloads and opt-in rules; the settings API is admin-only and never returns secrets."""

import json
from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase

from pakistan_tax_consultancy.services import whatsapp


def make_user(email, roles):
	if not frappe.db.exists("User", email):
		frappe.get_doc({"doctype": "User", "email": email, "first_name": email.split("@")[0], "send_welcome_email": 0,
			"roles": [{"role": r} for r in roles]}).insert(ignore_permissions=True)
	return email


class TestIntegrations(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		frappe.set_user("Administrator")
		cls.admin = make_user("i.admin@example.com", ["Tax Admin"])
		cls.consultant = make_user("i.consultant@example.com", ["Tax Consultant"])
		cls.client = frappe.get_doc({"doctype": "Tax Client", "client_name": "WA Test", "client_type": "Individual-Salaried",
			"mobile": "03009990001", "status": "Active"}).insert(ignore_permissions=True).name

	@classmethod
	def tearDownClass(cls):
		super().tearDownClass()
		# the DB is rolled back, the cached settings document is not
		frappe.clear_document_cache("Portal Integration Settings", "Portal Integration Settings")

	def tearDown(self):
		frappe.set_user("Administrator")

	def configure(self, enabled=1):
		s = frappe.get_single("Portal Integration Settings")
		s.update({"whatsapp_provider": whatsapp.CLOUD_API, "whatsapp_enabled": enabled, "wa_phone_number_id": "123456",
			"wa_access_token": "test-token", "wa_tpl_filed": "return_filed", "wa_language": "en"})
		s.save(ignore_permissions=True)
		frappe.clear_document_cache("Portal Integration Settings", "Portal Integration Settings")

	def test_template_payload_matches_cloud_api(self):
		p = whatsapp.template_payload("0300 1234567", "return_filed", "en", ["Ali", "2026", "ACK-1"])
		self.assertEqual(p["to"], "923001234567")
		self.assertEqual(p["type"], "template")
		self.assertEqual(p["template"]["name"], "return_filed")
		self.assertEqual([x["text"] for x in p["template"]["components"][0]["parameters"]], ["Ali", "2026", "ACK-1"])

	def test_only_opted_in_clients_get_messages(self):
		self.configure()
		with patch("frappe.enqueue") as enqueue:
			self.assertFalse(whatsapp.notify_client(self.client, "filed", ["WA", "2026", "ACK"]))
			frappe.db.set_value("Tax Client", self.client, "whatsapp_opt_in", 1)
			self.assertTrue(whatsapp.notify_client(self.client, "filed", ["WA", "2026", "ACK"]))
			self.assertEqual(enqueue.call_args.kwargs["template"], "return_filed")
			self.assertEqual(enqueue.call_args.kwargs["to"], "+923009990001")
			# no template configured for this event -> nothing sent
			self.assertFalse(whatsapp.notify_client(self.client, "deadline", ["WA", "2026", "30-09-2026"]))
		self.configure(enabled=0)
		with patch("frappe.enqueue") as enqueue:
			self.assertFalse(whatsapp.notify_client(self.client, "filed", ["WA", "2026", "ACK"]))
			enqueue.assert_not_called()

	def test_send_uses_bearer_token_and_phone_number_id(self):
		self.configure()

		class Resp:
			status_code, content = 200, b"{}"

			def json(self):
				return {"messages": [{"id": "wamid.1"}]}

		with patch("requests.post", return_value=Resp()) as post:
			whatsapp.send_template_now("03001234567", "return_filed", ["a"])
		url = post.call_args.args[0]
		self.assertTrue(url.endswith("/123456/messages"))
		self.assertEqual(post.call_args.kwargs["headers"]["Authorization"], "Bearer test-token")

	def test_settings_are_admin_only_and_secrets_write_only(self):
		from pakistan_tax_consultancy.api import settings

		self.configure()
		frappe.set_user(self.consultant)
		with self.assertRaises(frappe.PermissionError):
			settings.get_settings()
		with self.assertRaises(frappe.PermissionError):
			settings.save_payment({"payment_gateway": "JazzCash"})
		frappe.set_user(self.admin)
		data = settings.get_settings()
		self.assertTrue(data["whatsapp"]["has_token"])
		self.assertNotIn("test-token", json.dumps(data, default=str))
		pay = settings.save_payment({"payment_gateway": "JazzCash", "gateway_secret": "s3cret", "gateway_enabled": 1})
		self.assertTrue(pay["has_secret"])
		self.assertFalse(pay["gateway_enabled"])  # checkout not built yet -> cannot be switched on
		self.assertNotIn("s3cret", json.dumps(settings.get_settings(), default=str))
