"""SMS adapter. Development uses the console provider: messages go to the log instead of a phone.

To go live, add a provider class with `send(mobile_e164, text)` and register it in PROVIDERS; keep its credentials in
site_config.json (never in code or fixtures).
"""

import frappe


class ConsoleProvider:
	def send(self, mobile, text):
		frappe.logger("pakistan_tax_consultancy.sms").info(f"SMS to {mobile}: {text}")
		print(f"[SMS console] to {mobile}: {text}")


PROVIDERS = {"Console (development)": ConsoleProvider}


def send_sms(mobile, text):
	from pakistan_tax_consultancy.utils.validators import normalize_mobile

	try:
		number = normalize_mobile(mobile)
	except ValueError:
		return
	name = frappe.db.get_single_value("Tax Consultancy Settings", "sms_provider") or "Console (development)"
	provider = PROVIDERS.get(name, ConsoleProvider)()
	try:
		provider.send(number, text)
	except Exception:
		frappe.log_error(title="SMS send failed")
