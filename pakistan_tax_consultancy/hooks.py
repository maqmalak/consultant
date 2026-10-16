app_name = "pakistan_tax_consultancy"
app_title = "Pakistan Tax Consultancy"
app_publisher = "maqmalak"
app_description = "Pakistan FBR income tax filing and tax consultancy management"
app_email = "maqmalak@gmail.com"
app_license = "mit"

# Fixtures loaded on install / migrate
fixtures = [
	{"dt": "Role", "filters": [[
		"role_name", "in", [
			"Tax Admin", "Tax Consultant", "Tax Reviewer", "Tax Approver",
			"Filing Officer", "Field Officer", "Client"
		]
	]]},
	{"dt": "Tax Year"},
	{"dt": "Tax Regime"},
	{"dt": "Service"},
	{"dt": "Document Type"},
	{"dt": "Workspace", "filters": [[
		"module", "=", "Pakistan Income Tax Consultancy"
	]]},
]

# Apps
# ------------------

# required_apps = []

# Each item in the list will be shown as an app in the apps page
# add_to_apps_screen = [
# 	{
# 		"name": "pakistan_tax_consultancy",
# 		"logo": "/assets/pakistan_tax_consultancy/logo.png",
# 		"title": "Pakistan Income Tax Consultancy",
# 		"route": "/pakistan_tax_consultancy",
# 		"has_permission": "pakistan_tax_consultancy.api.permission.has_app_permission"
# 	}
# ]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/pakistan_tax_consultancy/css/pakistan_tax_consultancy.css"
# app_include_js = "/assets/pakistan_tax_consultancy/js/pakistan_tax_consultancy.js"

# include js, css files in header of web template
# web_include_css = "/assets/pakistan_tax_consultancy/css/pakistan_tax_consultancy.css"
# web_include_js = "/assets/pakistan_tax_consultancy/js/pakistan_tax_consultancy.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "pakistan_tax_consultancy/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# (page assets are auto-loaded by Page.load_assets from the page folder)

# include js in doctype views
doctype_js = {
	"Tax Client": "pakistan_income_tax_consultancy/doctype/tax_client/tax_client.js",
	"Site Visit": "pakistan_income_tax_consultancy/doctype/site_visit/site_visit.js",
	"Tax Engagement": "pakistan_income_tax_consultancy/doctype/tax_engagement/tax_engagement.js",
	"Tax Document": "pakistan_income_tax_consultancy/doctype/tax_document/tax_document.js",
	"Tax Return": "pakistan_income_tax_consultancy/doctype/tax_return/tax_return.js",
	"Tax Calculation": "pakistan_income_tax_consultancy/doctype/tax_calculation/tax_calculation.js",
	"Tax Review": "pakistan_income_tax_consultancy/doctype/tax_review/tax_review.js",
	"Tax Approval": "pakistan_income_tax_consultancy/doctype/tax_approval/tax_approval.js",
	"Filing Record": "pakistan_income_tax_consultancy/doctype/filing_record/filing_record.js",
	"Tax Year": "pakistan_income_tax_consultancy/doctype/tax_year/tax_year.js",
	"Tax Regime": "pakistan_income_tax_consultancy/doctype/tax_regime/tax_regime.js",
	"Service": "pakistan_income_tax_consultancy/doctype/service/service.js",
	"Tax Slab Setting": "pakistan_income_tax_consultancy/doctype/tax_slab_setting/tax_slab_setting.js",
	"Tax Credit Rule": "pakistan_income_tax_consultancy/doctype/tax_credit_rule/tax_credit_rule.js",
	"Withholding Tax Section": "pakistan_income_tax_consultancy/doctype/withholding_tax_section/withholding_tax_section.js",
	"Document Type": "pakistan_income_tax_consultancy/doctype/document_type/document_type.js",
	"Tax Consultancy Settings": "pakistan_income_tax_consultancy/doctype/tax_consultancy_settings/tax_consultancy_settings.js",
	"Document Requirement Rule": "pakistan_income_tax_consultancy/doctype/document_requirement_rule/document_requirement_rule.js",
	"Site Visit Document": "pakistan_income_tax_consultancy/doctype/site_visit_document/site_visit_document.js",
	"Site Visit Service": "pakistan_income_tax_consultancy/doctype/site_visit_service/site_visit_service.js",
}
doctype_list_js = {
	"Tax Return": "pakistan_income_tax_consultancy/doctype/tax_return/tax_return.js",
}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "pakistan_tax_consultancy/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# automatically load and sync documents of this doctype from downstream apps
# importable_doctypes = [doctype_1]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "pakistan_tax_consultancy.utils.jinja_methods",
# 	"filters": "pakistan_tax_consultancy.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "pakistan_tax_consultancy.install.before_install"
# after_install = "pakistan_tax_consultancy.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "pakistan_tax_consultancy.uninstall.before_uninstall"
# after_uninstall = "pakistan_tax_consultancy.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "pakistan_tax_consultancy.utils.before_app_install"
# after_app_install = "pakistan_tax_consultancy.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "pakistan_tax_consultancy.utils.before_app_uninstall"
# after_app_uninstall = "pakistan_tax_consultancy.utils.after_app_uninstall"

# Build
# ------------------
# To hook into the build process

# after_build = "pakistan_tax_consultancy.build.after_build"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "pakistan_tax_consultancy.notifications.get_notification_config"

# Awesome Bar
# -----------
# Extra search results: list of dicts with label, description, route, index.
# route: ["List", "ToDo"], "/desk/docs/some/page", or "https://example.com"
# awesomebar_search = ["pakistan_tax_consultancy.search.awesomebar_results"]

# Permissions
# -----------
# Record-level isolation: hooks can only deny, never grant (DocPerm decides the kind of
# access; these functions decide which records).

permission_query_conditions = {
	"Tax Client": "pakistan_tax_consultancy.permissions.tax_client_query",
	"Site Visit": "pakistan_tax_consultancy.permissions.site_visit_query",
	"Tax Engagement": "pakistan_tax_consultancy.permissions.client_linked_query",
	"Tax Document": "pakistan_tax_consultancy.permissions.client_linked_query",
	"Tax Return": "pakistan_tax_consultancy.permissions.client_linked_query",
	"Tax Calculation": "pakistan_tax_consultancy.permissions.client_linked_query",
	"Tax Review": "pakistan_tax_consultancy.permissions.client_linked_query",
	"Tax Approval": "pakistan_tax_consultancy.permissions.client_linked_query",
	"Filing Record": "pakistan_tax_consultancy.permissions.client_linked_query",
}

has_permission = {
	"Tax Client": "pakistan_tax_consultancy.permissions.tax_client_has_permission",
	"Site Visit": "pakistan_tax_consultancy.permissions.site_visit_has_permission",
	"Tax Engagement": "pakistan_tax_consultancy.permissions.client_linked_has_permission",
	"Tax Document": "pakistan_tax_consultancy.permissions.client_linked_has_permission",
	"Tax Return": "pakistan_tax_consultancy.permissions.client_linked_has_permission",
	"Tax Calculation": "pakistan_tax_consultancy.permissions.client_linked_has_permission",
	"Tax Review": "pakistan_tax_consultancy.permissions.client_linked_has_permission",
	"Tax Approval": "pakistan_tax_consultancy.permissions.client_linked_has_permission",
	"Filing Record": "pakistan_tax_consultancy.permissions.client_linked_has_permission",
}

# Document Events
# ---------------
# Enforce that records are only linked to accessible clients, and write an audit trail.

doc_events = {
	"Tax Client": {
		"validate": "pakistan_tax_consultancy.permissions.validate_client_link",
	},
	"Tax Engagement": {
		"validate": "pakistan_tax_consultancy.permissions.validate_client_link",
	},
	"Tax Document": {
		"validate": "pakistan_tax_consultancy.permissions.validate_client_link",
	},
	"Tax Return": {
		"validate": "pakistan_tax_consultancy.permissions.validate_client_link",
		"on_submit": "pakistan_tax_consultancy.api.tax_calculation.calculate_tax",
		"on_update": "pakistan_tax_consultancy.notifications.notify_workflow_state_change",
	},
	"Tax Calculation": {
		"validate": "pakistan_tax_consultancy.permissions.validate_client_link",
	},
	"Tax Review": {
		"validate": "pakistan_tax_consultancy.permissions.validate_client_link",
	},
	"Tax Approval": {
		"validate": "pakistan_tax_consultancy.permissions.validate_client_link",
	},
	"Filing Record": {
		"validate": "pakistan_tax_consultancy.permissions.validate_client_link",
	},
}

# Scheduled Tasks
# ---------------

scheduler_events = {
	"daily": [
		"pakistan_tax_consultancy.tasks.daily"
	],
}

# Testing
# -------

# before_tests = "pakistan_tax_consultancy.install.before_tests"

# Extend DocType Class
# ------------------------------
#
# Specify custom mixins to extend the standard doctype controller.
# extend_doctype_class = {
# 	"Task": "pakistan_tax_consultancy.custom.task.CustomTaskMixin"
# }

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "pakistan_tax_consultancy.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "pakistan_tax_consultancy.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["pakistan_tax_consultancy.utils.before_request"]
# after_request = ["pakistan_tax_consultancy.utils.after_request"]

# Job Events
# ----------
# before_job = ["pakistan_tax_consultancy.utils.before_job"]
# after_job = ["pakistan_tax_consultancy.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"pakistan_tax_consultancy.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

# Translation
# ------------
# List of apps whose translatable strings should be excluded from this app's translations.
# ignore_translatable_strings_from = []

