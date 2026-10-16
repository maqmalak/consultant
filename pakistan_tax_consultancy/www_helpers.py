"""Shared context for the public www pages (firm details, footer services, language) and small page helpers."""

import frappe

CACHE_SECONDS = 300


def _cached(key, fn):
	data = frappe.cache.get_value(key)
	if data is None:
		data = fn()
		frappe.cache.set_value(key, data, expires_in_sec=CACHE_SECONDS)
	return data


def firm():
	from pakistan_tax_consultancy.api.public import site_info

	return frappe._dict(_cached("ptc:site_info", site_info))


def footer_services():
	from pakistan_tax_consultancy.api.public import services

	return _cached("ptc:footer_services", lambda: services()[:6])


def clear_cache():
	for key in ("ptc:site_info", "ptc:footer_services"):
		frappe.cache.delete_value(key)


def on_content_change(doc=None, method=None):
	from frappe.website.utils import clear_cache as clear_website_cache

	clear_cache()
	clear_website_cache()


def hex_to_hsl(value: str | None) -> str | None:
	"""'#0d9488' -> '175 84% 32%' (the format the theme's CSS variables use)."""
	import colorsys
	import re

	if not value or not re.fullmatch(r"#?[0-9a-fA-F]{6}", value.strip()):
		return None
	r, g, b = (int(value.strip().lstrip("#")[i:i + 2], 16) / 255 for i in (0, 2, 4))
	h, l, s = colorsys.rgb_to_hls(r, g, b)
	return f"{round(h * 360)} {round(s * 100)}% {round(l * 100)}%"


def site_css_version() -> str:
	"""Cache-busting query for /assets/.../css/site.css: changes whenever the stylesheet is rebuilt."""
	import os

	try:
		return str(int(os.path.getmtime(frappe.get_app_path("pakistan_tax_consultancy", "public", "css", "site.css"))))
	except OSError:
		return "1"


def update_website_context(context):
	path = frappe.local.request.path if getattr(frappe.local, "request", None) else ""
	if path.startswith("/portal"):
		return
	context.site_css_version = site_css_version()
	context.ptc_lang = "ur" if frappe.local.lang == "ur" else "en"
	context.firm = firm()
	context.footer_services = footer_services()
	context.brand_hsl = hex_to_hsl(frappe.db.get_single_value("Firm Website Settings", "brand_color"))


def page(context, title, description, sitemap=True):
	"""Common page meta: title, description, no Frappe navbar/footer (our base template has its own)."""
	context.page_title = title
	context.meta_description = description
	context.no_breadcrumbs = 1
	context.sitemap = 1 if sitemap else 0
	return context
