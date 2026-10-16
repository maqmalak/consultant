"""/sitemap.xml: Frappe's pages plus every published service and tax update (served through route rules)."""

from urllib.parse import quote

import frappe
from frappe.utils import get_url, nowdate
from frappe.website.router import get_pages

no_cache = 1
base_template_path = "www/sitemap.xml"


def get_context(context):
	links = [{"loc": get_url(quote(page.name.encode("utf-8"))), "lastmod": nowdate()}
		for _route, page in get_pages().items() if page.sitemap and page.name not in ("home", "portal")]
	links.insert(0, {"loc": get_url("/"), "lastmod": nowdate()})
	for s in frappe.get_all("Service", filters={"published": 1, "is_active": 1}, fields=["slug", "modified"]):
		if s.slug:
			links.append({"loc": get_url(f"/services/{quote(s.slug)}"), "lastmod": f"{s.modified:%Y-%m-%d}"})
	for p in frappe.get_all("Tax Update", filters={"published": 1}, fields=["route", "modified"]):
		if p.route:
			links.append({"loc": get_url(f"/tax-updates/{quote(p.route.split('/')[-1])}"), "lastmod": f"{p.modified:%Y-%m-%d}"})
	return {"links": links}
