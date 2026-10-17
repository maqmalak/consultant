"""SMS adapter. Development uses the console provider: messages go to the log instead of a phone.

Live providers (Portal Integration Settings → Verification codes):
- Twilio — Account SID + Auth Token (encrypted) + the sending number / sender ID;
- HTTP gateway — most Pakistani bulk-SMS companies give a send link; paste it with {to} {to_e164} {message} {sender}
  {api_key} placeholders and keep the key in the encrypted field.
Credentials never live in code, fixtures or the browser. Message text is never written to logs by live providers
(it may hold a verification code).
"""

from urllib.parse import quote

import frappe
import requests
from frappe import _

TIMEOUT = 10


class ConsoleProvider:
	"""Development only: no SMS leaves the server — the text goes to logs/pakistan_tax_consultancy.sms.log (and stdout)."""

	def send(self, mobile, text, settings):
		# warning level: the default logger level drops info, which left the code unreadable during local sign-up tests
		frappe.logger("pakistan_tax_consultancy.sms", allow_site=False).warning(f"SMS to {mobile}: {text}")
		print(f"[SMS console] to {mobile}: {text}", flush=True)


class TwilioProvider:
	def send(self, mobile, text, settings):
		sid, token = settings.sms_twilio_sid, settings.get_password("sms_twilio_token", raise_exception=False)
		if not (sid and token and settings.sms_sender_id):
			frappe.throw(_("Twilio is not set up (Account SID, Auth Token and sender)."))
		r = requests.post(f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json", auth=(sid, token),
			data={"To": mobile, "From": settings.sms_sender_id, "Body": text}, timeout=TIMEOUT)
		if r.status_code >= 300:
			raise requests.HTTPError(f"Twilio answered HTTP {r.status_code}")


class HttpGatewayProvider:
	def send(self, mobile, text, settings):
		url = (settings.sms_gateway_url or "").strip()
		if not url.startswith("https://"):
			frappe.throw(_("Set an https gateway URL for SMS."))
		key = settings.get_password("sms_gateway_api_key", raise_exception=False) or ""
		filled = (url.replace("{to}", quote(mobile.lstrip("+"))).replace("{to_e164}", quote(mobile))
			.replace("{message}", quote(text)).replace("{sender}", quote(settings.sms_sender_id or ""))
			.replace("{api_key}", quote(key)))
		r = requests.get(filled, timeout=TIMEOUT)
		if r.status_code >= 300:
			raise requests.HTTPError(f"SMS gateway answered HTTP {r.status_code}")


PROVIDERS = {"Console (development)": ConsoleProvider, "Twilio": TwilioProvider, "HTTP gateway": HttpGatewayProvider}


def provider_name():
	return (frappe.db.get_single_value("Portal Integration Settings", "sms_provider")
		or frappe.db.get_single_value("Tax Consultancy Settings", "sms_provider") or "Console (development)")


def send_sms(mobile, text, raise_errors=False):
	"""Send one SMS. Failures are logged (without the text); with `raise_errors` they are raised for a fallback."""
	from pakistan_tax_consultancy.utils.validators import normalize_mobile

	try:
		number = normalize_mobile(mobile)
	except ValueError:
		if raise_errors:
			raise
		return False
	name = provider_name()
	try:
		PROVIDERS.get(name, ConsoleProvider)().send(number, text, frappe.get_single("Portal Integration Settings"))
		return True
	except Exception as e:
		frappe.log_error(title=f"SMS send failed ({name})", message=f"to …{number[-4:]}: {type(e).__name__}: {e}")
		if raise_errors:
			raise
		return False
