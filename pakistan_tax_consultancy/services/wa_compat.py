"""WhatsApp Message compatibility with Frappe CRM (ported from the realestate app).

Frappe CRM's WhatsApp hooks were written for the older frappe_whatsapp schema (`type`, `reference_name`); this bench's
whatsapp app calls them `direction` and `reference_docname`. Without these aliases every WhatsApp Message save raises
AttributeError once crm is installed (team inbox, incoming webhook, automatic updates).
"""


class CrmWhatsAppCompat:
	@property
	def type(self):
		return self.direction

	@property
	def reference_name(self):
		return self.reference_docname

	@reference_name.setter
	def reference_name(self, value):
		# CRM sets reference_doctype then reference_name from its own phone match. When our inbox already linked the
		# message (wa_inbox.link_party), keep that link whole; otherwise accept CRM's lead / deal match.
		keep = self.flags.get("ptc_reference")
		if keep:
			self.reference_doctype, self.reference_docname = keep
		elif value and not self.reference_docname:
			self.reference_docname = value
