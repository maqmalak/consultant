# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt
"""Verification codes: WhatsApp first, SMS as backup, forced SMS, failure handling, the code never stored readable."""

from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase

from pakistan_tax_consultancy.services import otp, sms


class TestOtpDelivery(IntegrationTestCase):
	def setUp(self):
		s = frappe.get_single("Portal Integration Settings")
		s.update({"otp_channel": "WhatsApp, then SMS", "wa_tpl_otp": "vvs_verification_code", "sms_provider": "Console (development)",
			"wa_mock_mode": 1, "whatsapp_enabled": 0, "whatsapp_provider": "Click-to-chat only"})
		s.flags.ignore_permissions = True
		s.save()
		frappe.db.delete("OTP Request", {"mobile": ("like", "%30009905%")})

	def whatsapp_on(self):
		frappe.db.set_single_value("Portal Integration Settings", {"whatsapp_enabled": 1, "whatsapp_provider": "WhatsApp Cloud API (Meta)"})

	def test_sms_when_whatsapp_not_ready(self):
		res = otp.issue("03000990501")
		self.assertEqual(res["channel"], "SMS")
		self.assertEqual(frappe.db.get_value("OTP Request", res["request"], "channel"), "SMS")

	def test_whatsapp_first_and_never_in_inbox(self):
		if not frappe.db.get_single_value("WhatsApp Settings", "default_account"):
			self.skipTest("no WhatsApp account on this site")
		self.whatsapp_on()
		before = frappe.db.count("WhatsApp Message")
		res = otp.issue("03000990502")
		self.assertEqual(res["channel"], "WhatsApp")
		self.assertEqual(frappe.db.count("WhatsApp Message"), before)  # sent directly: no inbox record holds the code
		self.assertEqual(otp.issue("03000990502", channel="sms")["channel"], "SMS")  # "Send by SMS instead"

	def test_falls_back_to_sms_with_the_same_code(self):
		self.whatsapp_on()
		sent = {}
		with patch.object(otp, "_send_whatsapp", side_effect=RuntimeError("Meta down")), \
				patch.object(sms.ConsoleProvider, "send", lambda self, m, text, s: sent.update(text=text)):
			res = otp.issue("03000990503")
		self.assertEqual(res["channel"], "SMS")
		code = "".join(c for c in sent["text"].split("code is ")[1][:6])
		self.assertTrue(otp.verify(res["request"], "03000990503", code))

	def test_whatsapp_only_failure_is_reported(self):
		frappe.db.set_single_value("Portal Integration Settings", "otp_channel", "WhatsApp only")
		self.assertRaises(frappe.ValidationError, otp.issue, "03000990504")
		self.assertEqual(frappe.db.get_value("OTP Request", {"mobile": "+923000990504"}, "channel"), "Failed")

	def test_code_stored_only_hashed(self):
		sent = {}
		with patch.object(sms.ConsoleProvider, "send", lambda self, m, text, s: sent.update(text=text)):
			res = otp.issue("03000990505")
		code = sent["text"].split("code is ")[1][:6]
		row = frappe.db.get_value("OTP Request", res["request"], ["otp_hash"], as_dict=True)
		self.assertNotIn(code, row.otp_hash)

	def test_http_gateway_fills_the_link(self):
		s = frappe.get_single("Portal Integration Settings")
		s.update({"sms_provider": "HTTP gateway", "sms_sender_id": "VVS-TAX", "sms_gateway_api_key": "k3y",
			"sms_gateway_url": "https://sms.example.pk/send?key={api_key}&to={to}&mask={sender}&msg={message}"})
		s.flags.ignore_permissions = True
		s.save()
		calls = []

		class Ok:
			status_code = 200

		with patch("pakistan_tax_consultancy.services.sms.requests.get", lambda url, timeout: calls.append(url) or Ok()):
			self.assertTrue(sms.send_sms("0300-0990506", "Hello 1", raise_errors=True))
		self.assertEqual(calls, ["https://sms.example.pk/send?key=k3y&to=923000990506&mask=VVS-TAX&msg=Hello%201"])
