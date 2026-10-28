"""Show the Ask ALYF app as "Ask VVS" in Desk, without renaming its doctypes or forking its code.

Applied on every migrate (Ask ALYF's own migrate re-syncs its standard icon and sidebar):
- the Desk app icon and its sidebar get the VVS name and logo;
- English Translation records rename the doctypes, the role and every user-facing message in Desk;
- the assistant is told its name through Ask ALYF Settings → System Prompt (kept if already there).
"""

import frappe

NAME, OLD = "Ask VVS", "Ask ALYF"
LOGO = "/assets/pakistan_tax_consultancy/images/favicon.svg"
PROMPT = ("Your name is Ask VVS, the assistant of Vision Vault Solutions (VVS Consultants). "
	"Always call yourself Ask VVS, never Ask ALYF.")

# source text → shown as (OLD replaced by NAME)
SOURCES = (
	"Ask ALYF",
	"Ask ALYF Settings",
	"Ask ALYF Conversation",
	"Ask ALYF Skill",
	"Ask ALYF User",
	"Ask ALYF Onboarding",
	"Update Ask ALYF Settings",
	"Open Ask ALYF",
	"Ask ALYF sections",
	"Ask ALYF could not finish processing this message. Please try again.",
	"Ask ALYF stopped processing this message. Please try again.",
	"Ask ALYF is an AI and can make mistakes, including with numbers and information about people.",
	"Ask ALYF is still working on a message in this conversation. Stop it or wait for it to finish before deleting.",
	"Ask ALYF is still working on the previous message in this conversation.",
	"Ask ALYF is visible, but no API key/model is configured yet in Ask ALYF Settings.",
	"Code search is disabled in Ask ALYF Settings.",
	"Configure a model in Ask ALYF Settings before sending messages.",
	"Configure a vision model API key in Ask ALYF Settings.",
	"Configure a vision model in Ask ALYF Settings.",
	"Configure an API key in Ask ALYF Settings before sending messages.",
	"You do not have access to Ask ALYF.",
)


def apply():
	if "ask_alyf" not in frappe.get_installed_apps():
		return
	if frappe.db.exists("Desktop Icon", OLD):
		frappe.db.set_value("Desktop Icon", OLD, {"label": NAME, "logo_url": LOGO}, update_modified=False)
	if frappe.db.exists("Workspace Sidebar", OLD):
		frappe.db.set_value("Workspace Sidebar", OLD, "title", NAME, update_modified=False)
		frappe.db.set_value("Workspace Sidebar Item", {"parent": OLD, "label": f"{OLD} Settings"}, "label", f"{NAME} Settings",
			update_modified=False)

	for source in SOURCES:
		shown = source.replace(OLD, NAME)
		name = frappe.db.get_value("Translation", {"language": "en", "source_text": source, "context": ("in", ("", None))})
		if name:
			frappe.db.set_value("Translation", name, "translated_text", shown)
		else:
			frappe.get_doc({"doctype": "Translation", "language": "en", "source_text": source, "translated_text": shown}).insert(
				ignore_permissions=True)

	prompt = frappe.db.get_single_value("Ask ALYF Settings", "system_prompt") or ""
	if NAME not in prompt:
		frappe.db.set_single_value("Ask ALYF Settings", "system_prompt", (PROMPT + "\n\n" + prompt).strip())

	frappe.clear_cache()
