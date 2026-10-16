app_name = "pakistan_tax_consultancy"
app_title = "Pakistan Tax Consultancy"
app_publisher = "maqmalak"
app_description = "Pakistan FBR income tax filing and tax consultancy management"
app_email = "maqmalak@gmail.com"
app_license = "mit"

# Fixtures: structure only. Content (services, packages, document types, tax years, slabs, FAQs) is seeded once by
# setup/content.py and then owned by the admin, so a migrate never overwrites their edits.
fixtures = [
	{"dt": "Role", "filters": [[
		"role_name", "in", [
			"Tax Admin", "Tax Consultant", "Tax Reviewer", "Tax Approver",
			"Filing Officer", "Field Officer", "Client"
		]
	]]},
	{"dt": "Workspace", "filters": [["module", "=", "Pakistan Income Tax Consultancy"]]},
]

after_install = "pakistan_tax_consultancy.setup.install.after_migrate"
after_migrate = [
	"pakistan_tax_consultancy.setup.install.after_migrate",
	"pakistan_tax_consultancy.setup.content.seed",
]

# Website
# -------
# Public pages are www/ Jinja pages; the React portal is one SPA page serving every /portal/* route.
website_route_rules = [
	{"from_route": "/portal/<path:app_path>", "to_route": "portal"},
	{"from_route": "/services/<slug>", "to_route": "services/service"},
	{"from_route": "/tax-updates/<slug>", "to_route": "tax-updates/post"},
]
website_context = {
	"favicon": "/assets/pakistan_tax_consultancy/images/favicon.svg",
	"splash_image": "/assets/pakistan_tax_consultancy/images/favicon.svg",
}
update_website_context = "pakistan_tax_consultancy.www_helpers.update_website_context"
role_home_page = {"Client": "portal"}
home_page = "home"

# Permissions
# -----------
jinja = {"methods": ["pakistan_tax_consultancy.services.documents.ptc_firm",
	"pakistan_tax_consultancy.services.documents.ptc_logo", "pakistan_tax_consultancy.services.documents.ptc_money",
	"pakistan_tax_consultancy.services.documents.ptc_date"]}

# Record-level isolation: hooks can only deny, never grant (DocPerm decides the kind of
# access; these functions decide which records).

_CLIENT_LINKED = ("Tax Engagement", "Tax Document", "Tax Return", "Tax Calculation", "Tax Review", "Tax Approval",
	"Filing Record", "Review Comment", "Payment Proof", "Client Message", "Generated Document")

permission_query_conditions = {
	"Tax Client": "pakistan_tax_consultancy.permissions.tax_client_query",
	"Site Visit": "pakistan_tax_consultancy.permissions.site_visit_query",
	"Consultation Request": "pakistan_tax_consultancy.permissions.consultation_query",
	**{dt: "pakistan_tax_consultancy.permissions.client_linked_query" for dt in _CLIENT_LINKED},
}

has_permission = {
	"Tax Client": "pakistan_tax_consultancy.permissions.tax_client_has_permission",
	"Site Visit": "pakistan_tax_consultancy.permissions.site_visit_has_permission",
	"Consultation Request": "pakistan_tax_consultancy.permissions.consultation_has_permission",
	**{dt: "pakistan_tax_consultancy.permissions.client_linked_has_permission" for dt in _CLIENT_LINKED},
}

# Document Events
# ---------------
# Users may only link records to clients they can access (also through the REST API).

doc_events = {
	dt: {"validate": "pakistan_tax_consultancy.permissions.validate_client_link"}
	for dt in ("Tax Client",) + _CLIENT_LINKED
}
# website content changed -> drop the cached pages and the cached firm/service data
for _dt in ("Service", "Service Package", "FAQ", "Testimonial", "Tax Update", "Tax Year"):
	doc_events[_dt] = {"on_update": "pakistan_tax_consultancy.www_helpers.on_content_change",
		"on_trash": "pakistan_tax_consultancy.www_helpers.on_content_change"}

# WhatsApp (team inbox on the `whatsapp` app — services/wa_inbox.py)
before_request = ["pakistan_tax_consultancy.services.wa_inbox.install_mock"]
before_job = ["pakistan_tax_consultancy.services.wa_inbox.install_mock"]
whatsapp_access_guard = ["pakistan_tax_consultancy.services.wa_inbox.access_guard"]
doc_events["WhatsApp Message"] = {
	"validate": "pakistan_tax_consultancy.services.wa_inbox.link_party",
	"after_insert": "pakistan_tax_consultancy.services.wa_inbox.on_message",
}

# Scheduled Tasks
# ---------------

scheduler_events = {
	"daily": ["pakistan_tax_consultancy.tasks.daily"],
}

# Rate limits for the public endpoints are declared on the functions (frappe.rate_limiter.rate_limit).
