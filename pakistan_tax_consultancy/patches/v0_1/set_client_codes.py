"""Give every existing client a permanent client code (C-00456) and start the code counter after the highest number.

Existing clients keep the number of their name (TAX-CLIENT-2026-00456 → C-00456); if two years ever gave the same
number, the later client gets a new code instead.
"""

import frappe
from frappe.query_builder import DocType

from pakistan_tax_consultancy.pakistan_income_tax_consultancy.doctype.tax_client.tax_client import (
	CLIENT_CODE_SERIES,
	next_client_code,
)


def execute():
	clients = frappe.get_all("Tax Client", fields=["name", "client_code"], order_by="creation asc")
	used = {c.client_code for c in clients if c.client_code}
	numbers = [int(c.client_code[2:]) for c in clients if (c.client_code or "")[2:].isdigit()]
	later = []
	for c in clients:
		if c.client_code:
			continue
		tail = c.name.rsplit("-", 1)[-1]
		code = f"C-{int(tail):05d}" if tail.isdigit() else None
		if not code or code in used:
			later.append(c.name)
			continue
		frappe.db.set_value("Tax Client", c.name, "client_code", code, update_modified=False)
		used.add(code)
		numbers.append(int(code[2:]))

	# the counter starts after every number in use: existing codes and the name series' own counters
	Series = DocType("Series")
	series_max = (frappe.qb.from_(Series).select(Series.current).where(Series.name.like("TAX-CLIENT-%"))
		.where(Series.name != CLIENT_CODE_SERIES).run(pluck=True))
	start = max(numbers + [int(x or 0) for x in series_max] + [0])
	current = frappe.db.get_value("Series", CLIENT_CODE_SERIES, "current", order_by="name")
	if current is None:
		frappe.db.sql("insert into `tabSeries` (`name`, `current`) values (%s, %s)", (CLIENT_CODE_SERIES, start))
	elif int(current) < start:
		frappe.db.sql("update `tabSeries` set `current` = %s where `name` = %s", (start, CLIENT_CODE_SERIES))

	for name in later:  # same number as an earlier client: a fresh code
		frappe.db.set_value("Tax Client", name, "client_code", next_client_code(), update_modified=False)
