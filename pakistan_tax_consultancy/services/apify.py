"""Lead Finder via Apify: run a Google Maps actor for "business type + city" (e.g. restaurant, Faisalabad, Pakistan), or
import an existing run, into the Lead Prospect review queue. The API token lives encrypted in Portal Integration
Settings (Settings → Lead Finder) and is sent in the Authorization header, never in a URL."""

import re

import frappe
import requests
from frappe import _
from frappe.utils import cint, flt, now_datetime

API = "https://api.apify.com/v2"
DEFAULT_ACTOR = "nwua9Gu5YrADL7ZDj"
TIMEOUT = 30
MAX_PLACES = 200
RUN_ID_RE = re.compile(r"(?:/runs/|^)([A-Za-z0-9]{12,24})(?:[/?#]|$)")


def _settings():
	s = frappe.get_cached_doc("Portal Integration Settings")
	token = s.get_password("apify_api_token", raise_exception=False) if s.get("apify_api_token") else None
	if not token:
		frappe.throw(_("Add the Apify API token first (Settings → Lead Finder)."))
	return s, token


def _call(method, path, token, **kw):
	try:
		resp = requests.request(method, f"{API}{path}", headers={"Authorization": f"Bearer {token}"}, timeout=TIMEOUT, **kw)
	except requests.RequestException as e:
		frappe.throw(_("Could not reach Apify: {0}").format(str(e)[:200]))
	if resp.status_code == 401:
		frappe.throw(_("Apify refused the API token — check it in Settings → Lead Finder."))
	if resp.status_code == 404:
		frappe.throw(_("Apify could not find that actor or run — check the ID."))
	if resp.status_code >= 400:
		msg = ((resp.json() if resp.content else {}).get("error") or {}).get("message") if "json" in resp.headers.get("content-type", "") else resp.text[:200]
		frappe.throw(_("Apify error ({0}): {1}").format(resp.status_code, msg))
	return resp.json()


def run_id_from(text: str) -> str:
	"""Accept a run ID or a console URL like https://console.apify.com/actors/<actor>/runs/<run>#output."""
	m = RUN_ID_RE.search((text or "").strip())
	if not m:
		frappe.throw(_("That does not look like an Apify run link or ID."))
	return m.group(1)


def start_search(category: str, location: str, max_places: int | None = None) -> dict:
	s, token = _settings()
	category, location = (category or "").strip(), (location or "").strip()
	if not category or not location:
		frappe.throw(_("Give a business type and a city, e.g. restaurant · Faisalabad, Pakistan."))
	limit = max(1, min(cint(max_places) or cint(s.get("apify_max_places")) or 50, MAX_PLACES))
	payload = {"searchStringsArray": [category], "locationQuery": location, "maxCrawledPlacesPerSearch": limit,
		"language": s.get("apify_language") or "en", "skipClosedPlaces": True}
	run = _call("POST", f"/acts/{s.get('apify_actor_id') or DEFAULT_ACTOR}/runs", token, json=payload)["data"]
	return {"run": run["id"], "status": run["status"], "category": category, "location": location, "limit": limit}


def status(run: str) -> dict:
	_s, token = _settings()
	data = _call("GET", f"/actor-runs/{run_id_from(run)}", token)["data"]
	return {"run": data["id"], "status": data["status"], "dataset": data.get("defaultDatasetId"),
		"started": data.get("startedAt"), "finished": data.get("finishedAt")}


def _phone(item):
	return item.get("phoneUnformatted") or item.get("phone")


def import_run(run: str, client_type: str = "Individual-Business") -> dict:
	"""Copy a finished run's places into Lead Prospect rows; places already in the queue (same place or phone) are skipped."""
	_s, token = _settings()
	info = status(run)
	if info["status"] != "SUCCEEDED":
		frappe.throw(_("The Apify run is {0} — wait until it has finished.").format(info["status"].lower()))
	items = _call("GET", f"/datasets/{info['dataset']}/items", token, params={"clean": "true", "format": "json", "limit": 1000})
	added, skipped = [], 0
	for it in items if isinstance(items, list) else []:
		name = (it.get("title") or "").strip()
		phone = _phone(it)
		place_id = it.get("placeId") or it.get("cid")
		if not name:
			skipped += 1
			continue
		if (place_id and frappe.db.exists("Lead Prospect", {"place_id": place_id})) or (phone and frappe.db.exists("Lead Prospect", {"phone": phone})):
			skipped += 1
			continue
		doc = frappe.get_doc({"doctype": "Lead Prospect", "company_name": name[:140], "status": "Pending Review", "client_type": client_type,
			"phone": (phone or "")[:140] or None, "website": (it.get("website") or "")[:140] or None,
			"address": it.get("address"), "city": (it.get("city") or "")[:140] or None,
			"country": {"PK": "Pakistan"}.get(it.get("countryCode"), it.get("countryCode")),
			"category": (it.get("categoryName") or ", ".join(it.get("categories") or []))[:140] or None,
			"rating": flt(it.get("totalScore")), "reviews": cint(it.get("reviewsCount")), "maps_url": it.get("url"),
			"place_id": (place_id or "")[:140] or None, "apify_run": info["run"], "source_url": it.get("url") or name,
			"research_source": "Google Maps (Apify)", "researched_on": now_datetime(),
			"summary": " · ".join(filter(None, [it.get("categoryName"), it.get("totalScore") and f"{it['totalScore']}★ ({it.get('reviewsCount') or 0} reviews)",
				it.get("neighborhood")])) or None})
		doc.insert(ignore_permissions=True)
		added.append(doc.name)
	return {"added": len(added), "skipped": skipped, "run": info["run"]}
