"""Shared context for the public www pages (firm details, navigation, language)."""

import frappe


def firm():
	from pakistan_tax_consultancy.api.public import site_info

	cache_key = "ptc:site_info"
	data = frappe.cache.get_value(cache_key)
	if not data:
		data = site_info()
		frappe.cache.set_value(cache_key, data, expires_in_sec=300)
	return frappe._dict(data)


def update_website_context(context):
	if not (frappe.local.request and (frappe.local.request.path or "").startswith(("/portal",))):
		context.firm = firm()
		context.lang = frappe.local.lang if frappe.local.lang in ("en", "ur") else "en"
