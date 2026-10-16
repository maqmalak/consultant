"""Guest-accessible endpoints for the public website and the portal's public screens.

Everything here returns published, non-sensitive content only, and every write endpoint is rate limited.
"""

import frappe
from frappe import _
from frappe.rate_limiter import rate_limit
from frappe.utils import cint, flt, getdate, strip_html

from pakistan_tax_consultancy.utils.validators import normalize_cnic, normalize_mobile

SITE_FIELDS = ("firm_name", "tagline", "logo", "brand_color", "years_experience", "membership_info", "default_language",
	"phone", "whatsapp", "whatsapp_message", "email", "address", "office_hours", "map_link", "map_embed_url", "facebook",
	"instagram", "linkedin", "youtube", "x_url", "hero_headline", "hero_subtext", "announcement_enabled",
	"announcement_text", "announcement_link", "announcement_expiry", "work_before_payment")
PAYMENT_FIELDS = ("bank_name", "bank_account_title", "bank_account_no", "bank_iban", "raast_id", "jazzcash_number",
	"jazzcash_title", "easypaisa_number", "easypaisa_title")


def filled(value):
	"""Hide unfilled `[FILL]` placeholders from visitors."""
	return None if isinstance(value, str) and "[FILL]" in value else value


def current_tax_year():
	"""The tax year being filed now: the latest active one whose period has ended."""
	today = getdate()
	years = frappe.get_all("Tax Year", filters={"is_active": 1}, fields=["name", "start_date", "end_date", "return_due_date"],
		order_by="end_date desc")
	ended = [y for y in years if getdate(y.end_date) < today]
	return (ended or years or [None])[0]


@frappe.whitelist(allow_guest=True, methods=["GET"])
def site_info():
	s = frappe.get_cached_doc("Firm Website Settings")
	data = {f: filled(s.get(f)) for f in SITE_FIELDS}
	if data["announcement_expiry"] and getdate(data["announcement_expiry"]) < getdate():
		data["announcement_enabled"] = 0
	data["why_choose_us"] = [{"title": r.title, "icon": r.icon, "description": r.description} for r in s.why_choose_us]
	year = current_tax_year()
	data["tax_year"] = year.name if year else None
	data["filing_deadline"] = str(s.filing_deadline or (year.return_due_date if year else "") or "") or None
	data["tax_years"] = frappe.get_all("Tax Year", filters={"is_active": 1}, pluck="name", order_by="end_date desc")
	return data


@frappe.whitelist(allow_guest=True, methods=["GET"])
def payment_details():
	s = frappe.get_cached_doc("Firm Website Settings")
	return {f: filled(s.get(f)) for f in PAYMENT_FIELDS}


@frappe.whitelist(allow_guest=True, methods=["GET"])
def services():
	rows = frappe.get_all("Service", filters={"published": 1, "is_active": 1},
		fields=["name", "title", "slug", "category", "icon", "summary", "price_from"], order_by="display_order asc")
	prices = {}
	for p in frappe.get_all("Service Package", filters={"active": 1}, fields=["service", "price"]):
		prices[p.service] = min(prices.get(p.service, p.price), p.price)
	for r in rows:
		r["price_from"] = prices.get(r.name) or r.price_from
	return rows


@frappe.whitelist(allow_guest=True, methods=["GET"])
def service(slug: str):
	name = frappe.db.get_value("Service", {"slug": slug, "published": 1}, "name")
	if not name:
		frappe.throw(_("Service not found"), frappe.DoesNotExistError)
	doc = frappe.get_doc("Service", name)
	return {"title": doc.title, "slug": doc.slug, "category": doc.category, "icon": doc.icon, "summary": doc.summary,
		"details": doc.details or doc.description, "documents": [r.document_type for r in doc.required_document_types],
		"packages": packages(doc.name)}


@frappe.whitelist(allow_guest=True, methods=["GET"])
def packages(service: str | None = None):
	filters = {"active": 1}
	if service:
		filters["service"] = service
	rows = frappe.get_all("Service Package", filters=filters, fields=["name", "package_name", "service", "price",
		"turnaround", "for_whom", "most_popular"], order_by="display_order asc")
	inclusions = {}
	for i in frappe.get_all("Service Package Inclusion", filters={"parenttype": "Service Package"},
			fields=["parent", "item"], order_by="idx asc"):
		inclusions.setdefault(i.parent, []).append(i.item)
	for r in rows:
		r["inclusions"] = inclusions.get(r.name, [])
	return rows


@frappe.whitelist(allow_guest=True, methods=["GET"])
def faqs(language: str = "en"):
	return frappe.get_all("FAQ", filters={"published": 1, "language": ("in", (language, "", None))},
		fields=["name", "category", "question", "answer"], order_by="display_order asc")


@frappe.whitelist(allow_guest=True, methods=["GET"])
def testimonials():
	# only real reviews the client agreed to publish
	return frappe.get_all("Testimonial", filters={"published": 1, "client_consent": 1},
		fields=["display_name", "city", "rating", "text", "service"], order_by="creation desc", limit=12)


@frappe.whitelist(allow_guest=True, methods=["GET"])
def tax_updates(limit: int = 10, category: str | None = None):
	filters = {"published": 1}
	if category:
		filters["category"] = category
	return frappe.get_all("Tax Update", filters=filters, fields=["title", "route", "category", "summary", "cover_image",
		"published_on"], order_by="published_on desc, creation desc", limit=cint(limit) or 10)


@frappe.whitelist(allow_guest=True, methods=["GET", "POST"])
@rate_limit(limit=60, seconds=60 * 60)
def salary_calculator(monthly_salary: float, tax_year: str | None = None):
	from pakistan_tax_consultancy.services.tax_calc import salary_tax

	monthly = flt(monthly_salary)
	if monthly < 0 or monthly > 1e9:
		frappe.throw(_("Enter a valid monthly salary."))
	year = tax_year or (current_tax_year() or {}).get("name")
	if not frappe.db.exists("Tax Year", {"name": year, "is_active": 1}):
		frappe.throw(_("Unknown tax year."))
	result = salary_tax(monthly, year)
	result["disclaimer"] = _("Estimate only — final tax depends on your complete return.")
	return result


def _clean(value, length=140):
	return strip_html(str(value or "")).strip()[:length]


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=5, seconds=60 * 60)
def book_consultation(full_name, mobile, email=None, cnic=None, service=None, mode="Phone", call_preference="Scheduled",
		preferred_date=None, preferred_slot=None, message=None):
	from pakistan_tax_consultancy.services import notify

	try:
		mobile = normalize_mobile(mobile)
		cnic = normalize_cnic(cnic) if cnic else None
	except ValueError as e:
		frappe.throw(_(str(e)))
	if not _clean(full_name):
		frappe.throw(_("Please enter your name."))
	if preferred_date and getdate(preferred_date) < getdate():
		frappe.throw(_("Choose a date from today onwards."))
	if service and not frappe.db.exists("Service", {"name": service, "published": 1}):
		service = None
	lead = _make_lead(full_name, mobile, email, source_note=f"Consultation: {service or 'general'}")
	req = frappe.get_doc({"doctype": "Consultation Request", "full_name": _clean(full_name), "mobile": mobile,
		"email": _clean(email), "cnic": cnic, "service": service, "mode": mode if mode in ("Office", "Phone", "Video") else "Phone",
		"call_preference": "Urgent" if call_preference == "Urgent" else "Scheduled", "preferred_date": preferred_date,
		"preferred_slot": preferred_slot, "message": _clean(message, 2000), "lead": lead, "source": "Website"})
	req.insert(ignore_permissions=True)
	notify.consultation_requested(req)
	return {"name": req.name, "message": _("Thank you — we will call you to confirm the time.")}


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=5, seconds=60 * 60)
def contact(full_name, mobile=None, email=None, message=None):
	if not (_clean(full_name) and (mobile or email) and _clean(message, 2000)):
		frappe.throw(_("Please give your name, a phone number or email, and a message."))
	if mobile:
		try:
			mobile = normalize_mobile(mobile)
		except ValueError as e:
			frappe.throw(_(str(e)))
	lead = _make_lead(full_name, mobile, email, source_note=_clean(message, 2000))
	return {"lead": bool(lead), "message": _("Thank you — we will get back to you shortly.")}


def _make_lead(full_name, mobile, email, source_note=None):
	"""ERPNext Lead for follow-up in CRM; reuses an open lead with the same mobile or email."""
	existing = None
	if mobile:
		existing = frappe.db.get_value("Lead", {"mobile_no": mobile}, "name")
	if not existing and email:
		existing = frappe.db.get_value("Lead", {"email_id": _clean(email)}, "name")
	if existing:
		lead = frappe.get_doc("Lead", existing)
	else:
		lead = frappe.get_doc({"doctype": "Lead", "first_name": _clean(full_name), "lead_name": _clean(full_name),
			"mobile_no": mobile, "email_id": _clean(email) or None, "source": "Website" if frappe.db.exists(
				"Lead Source", "Website") else None})
		lead.flags.ignore_permissions = True
		lead.flags.ignore_mandatory = True
		lead.insert()
	if source_note:
		lead.add_comment("Comment", frappe.utils.escape_html(source_note))
	return lead.name
