app_name = "incometax"
app_title = "Pakistan Income Tax Consultancy"
app_publisher = "maqmalak"
app_description = "Pakistan FBR income tax filing and tax consultancy management"
app_email = "maqmalak@gmail.com"
app_license = "mit"

# Fixtures loaded on install / migrate
fixtures = [
	{"dt": "Role", "filters": [[
		"role_name", "in", [
			"Tax Consultant Admin", "Tax Consultant", "Tax Reviewer", "Tax Approver",
			"Filing Officer", "Field Officer", "Tax Client User"
		]
	]]},
	{"dt": "Tax Year"},
	{"dt": "Tax Regime"},
	{"dt": "Tax Service Type"},
	{"dt": "Tax Document Category"},
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
# 		"name": "incometax",
# 		"logo": "/assets/incometax/logo.png",
# 		"title": "Pakistan Income Tax Consultancy",
# 		"route": "/incometax",
# 		"has_permission": "incometax.api.permission.has_app_permission"
# 	}
# ]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/incometax/css/incometax.css"
# app_include_js = "/assets/incometax/js/incometax.js"

# include js, css files in header of web template
# web_include_css = "/assets/incometax/css/incometax.css"
# web_include_js = "/assets/incometax/js/incometax.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "incometax/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
doctype_js = {
	"Tax Client": "pakistan_income_tax_consultancy/doctype/tax_client/tax_client.js",
	"Client Visit": "pakistan_income_tax_consultancy/doctype/client_visit/client_visit.js",
	"Tax Engagement": "pakistan_income_tax_consultancy/doctype/tax_engagement/tax_engagement.js",
	"Tax Document": "pakistan_income_tax_consultancy/doctype/tax_document/tax_document.js",
	"Tax Return": "pakistan_income_tax_consultancy/doctype/tax_return/tax_return.js",
	"Tax Calculation": "pakistan_income_tax_consultancy/doctype/tax_calculation/tax_calculation.js",
	"Tax Review": "pakistan_income_tax_consultancy/doctype/tax_review/tax_review.js",
	"Tax Approval": "pakistan_income_tax_consultancy/doctype/tax_approval/tax_approval.js",
	"Tax Filing Record": "pakistan_income_tax_consultancy/doctype/tax_filing_record/tax_filing_record.js",
	"Tax Year": "pakistan_income_tax_consultancy/doctype/tax_year/tax_year.js",
	"Tax Regime": "pakistan_income_tax_consultancy/doctype/tax_regime/tax_regime.js",
	"Tax Service Type": "pakistan_income_tax_consultancy/doctype/tax_service_type/tax_service_type.js",
	"Tax Slab Rule": "pakistan_income_tax_consultancy/doctype/tax_slab_rule/tax_slab_rule.js",
	"Tax Credit Rule": "pakistan_income_tax_consultancy/doctype/tax_credit_rule/tax_credit_rule.js",
	"Withholding Tax Section": "pakistan_income_tax_consultancy/doctype/withholding_tax_section/withholding_tax_section.js",
	"Tax Document Category": "pakistan_income_tax_consultancy/doctype/tax_document_category/tax_document_category.js",
	"Tax Consultancy Settings": "pakistan_income_tax_consultancy/doctype/tax_consultancy_settings/tax_consultancy_settings.js",
	"Document Requirement Rule": "pakistan_income_tax_consultancy/doctype/document_requirement_rule/document_requirement_rule.js",
	"Client Visit Document": "pakistan_income_tax_consultancy/doctype/client_visit_document/client_visit_document.js",
	"Client Visit Service": "pakistan_income_tax_consultancy/doctype/client_visit_service/client_visit_service.js",
}
doctype_list_js = {
	"Tax Return": "pakistan_income_tax_consultancy/doctype/tax_return/tax_return.js",
}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "incometax/public/icons.svg"

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
# 	"methods": "incometax.utils.jinja_methods",
# 	"filters": "incometax.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "incometax.install.before_install"
# after_install = "incometax.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "incometax.uninstall.before_uninstall"
# after_uninstall = "incometax.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "incometax.utils.before_app_install"
# after_app_install = "incometax.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "incometax.utils.before_app_uninstall"
# after_app_uninstall = "incometax.utils.after_app_uninstall"

# Build
# ------------------
# To hook into the build process

# after_build = "incometax.build.after_build"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "incometax.notifications.get_notification_config"

# Awesome Bar
# -----------
# Extra search results: list of dicts with label, description, route, index.
# route: ["List", "ToDo"], "/desk/docs/some/page", or "https://example.com"
# awesomebar_search = ["incometax.search.awesomebar_results"]

# Permissions
# -----------
# Record-level isolation: hooks can only deny, never grant (DocPerm decides the kind of
# access; these functions decide which records).

permission_query_conditions = {
	"Tax Client": "incometax.permissions.tax_client_query",
	"Client Visit": "incometax.permissions.client_visit_query",
	"Tax Engagement": "incometax.permissions.client_linked_query",
	"Tax Document": "incometax.permissions.client_linked_query",
	"Tax Return": "incometax.permissions.client_linked_query",
	"Tax Calculation": "incometax.permissions.client_linked_query",
	"Tax Review": "incometax.permissions.client_linked_query",
	"Tax Approval": "incometax.permissions.client_linked_query",
	"Tax Filing Record": "incometax.permissions.client_linked_query",
}

has_permission = {
	"Tax Client": "incometax.permissions.tax_client_has_permission",
	"Client Visit": "incometax.permissions.client_visit_has_permission",
	"Tax Engagement": "incometax.permissions.client_linked_has_permission",
	"Tax Document": "incometax.permissions.client_linked_has_permission",
	"Tax Return": "incometax.permissions.client_linked_has_permission",
	"Tax Calculation": "incometax.permissions.client_linked_has_permission",
	"Tax Review": "incometax.permissions.client_linked_has_permission",
	"Tax Approval": "incometax.permissions.client_linked_has_permission",
	"Tax Filing Record": "incometax.permissions.client_linked_has_permission",
}

# Document Events
# ---------------
# Enforce that records are only linked to accessible clients, and write an audit trail.

doc_events = {
	"Tax Client": {
		"validate": "incometax.permissions.validate_client_link",
	},
	"Tax Engagement": {
		"validate": "incometax.permissions.validate_client_link",
	},
	"Tax Document": {
		"validate": "incometax.permissions.validate_client_link",
	},
	"Tax Return": {
		"validate": "incometax.permissions.validate_client_link",
		"on_submit": "incometax.api.tax_calculation.calculate_tax",
		"on_update": "incometax.notifications.notify_workflow_state_change",
	},
	"Tax Calculation": {
		"validate": "incometax.permissions.validate_client_link",
	},
	"Tax Review": {
		"validate": "incometax.permissions.validate_client_link",
	},
	"Tax Approval": {
		"validate": "incometax.permissions.validate_client_link",
	},
	"Tax Filing Record": {
		"validate": "incometax.permissions.validate_client_link",
	},
}

# Scheduled Tasks
# ---------------

scheduler_events = {
	"daily": [
		"incometax.tasks.daily"
	],
}

# Testing
# -------

# before_tests = "incometax.install.before_tests"

# Extend DocType Class
# ------------------------------
#
# Specify custom mixins to extend the standard doctype controller.
# extend_doctype_class = {
# 	"Task": "incometax.custom.task.CustomTaskMixin"
# }

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "incometax.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "incometax.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["incometax.utils.before_request"]
# after_request = ["incometax.utils.after_request"]

# Job Events
# ----------
# before_job = ["incometax.utils.before_job"]
# after_job = ["incometax.utils.after_job"]

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
# 	"incometax.auth.validate"
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

