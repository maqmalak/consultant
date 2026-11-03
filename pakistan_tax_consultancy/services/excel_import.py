"""Excel import of the firm's real data: a template to download, then a preview and an import of the filled file.

Sheets:
- **Clients**: one row per client. A row that matches an existing client (CNIC, NTN, mobile or email) only fills that
  client's empty fields; values that differ from what the portal has are reported, never overwritten.
- **Returns**: one row per client and tax year, for past years ("Filed": recorded as acknowledged history, with the
  IRIS acknowledgment number and filing date) and the current year ("In progress": a normal new return with its
  document checklist).

Nothing is saved on a preview. On import, every row is saved on its own (one bad row does not stop the others).
"""

import io
import re
from datetime import date, datetime

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, now_datetime

from pakistan_tax_consultancy.utils import validators as v

MAX_ROWS = 5000
CLIENT_TYPES = ("Individual-Salaried", "Individual-Business", "AOP", "Company", "Other")
PROVINCES = ("Punjab", "Sindh", "Khyber Pakhtunkhwa", "Balochistan", "Islamabad Capital Territory", "Gilgit-Baltistan",
	"Azad Jammu and Kashmir")
FBR_STATUSES = ("Filer (Active Taxpayer)", "Non-Filer", "Not Registered (No NTN)", "Unknown")
RETURN_STATUSES = ("Filed", "In progress")
FILED, IN_PROGRESS = RETURN_STATUSES

# (key, header, required, width, help, list name, text column)
CLIENT_COLUMNS = (
	("client_name", "Client name", True, 28, "Full name of the person, or the business / company name.", None, False),
	("client_type", "Client type", True, 20, "Choose from the list.", "client_types", False),
	("cnic", "CNIC", False, 18, "13 digits, with or without dashes: 35202-1234567-1.", None, True),
	("ntn", "NTN", False, 14, "As on the FBR certificate, e.g. 1234567-8.", None, True),
	("mobile", "Mobile", False, 15, "03001234567 or +923001234567.", None, True),
	("email", "Email", False, 26, "", None, False),
	("city", "City", False, 14, "", None, False),
	("province", "Province", False, 22, "Choose from the list.", "provinces", False),
	("business_name", "Business name", False, 24, "For business, AOP and company clients.", None, False),
	("residential_address", "Address", False, 32, "", None, False),
	("fbr_registration_status", "FBR status", False, 22, "Choose from the list.", "fbr_statuses", False),
	("assigned_consultant", "Consultant email", False, 28, "Login email of the consultant who handles this client.", "consultants", False),
)
RETURN_COLUMNS = (
	("cnic", "Client CNIC", False, 18, "Identify the client by CNIC, NTN, mobile or client code (one is enough).", None, True),
	("ntn", "Client NTN", False, 14, "", None, True),
	("mobile", "Client mobile", False, 15, "", None, True),
	("client_code", "Client code", False, 12, "C-00456, for clients already in the portal.", None, False),
	("tax_year", "Tax year", True, 10, "e.g. 2025 (= 1 Jul 2024 – 30 Jun 2025).", "tax_years", False),
	("status", "Status", True, 13, "Filed = past return already filed on IRIS. In progress = this year's work.", "return_statuses", False),
	("iris_acknowledgment_no", "IRIS acknowledgment no", False, 24, "Required for Filed.", None, True),
	("filing_date", "Filing date", False, 13, "Required for Filed. A date, e.g. 28-09-2025.", None, False),
	("total_income", "Total income", False, 14, "Rupees, numbers only.", None, False),
	("taxable_income", "Taxable income", False, 14, "", None, False),
	("tax_liability", "Tax liability", False, 14, "", None, False),
	("total_tax_withheld", "Tax withheld", False, 14, "", None, False),
	("net_tax_payable", "Tax payable", False, 14, "", None, False),
	("refund_due", "Refund due", False, 12, "", None, False),
)
SHEETS = {"Clients": CLIENT_COLUMNS, "Returns": RETURN_COLUMNS}


# ---------------------------------------------------------------------------------------------------- template
def _lists() -> dict:
	consultants = frappe.get_all("Has Role", {"role": "Tax Consultant", "parenttype": "User"}, pluck="parent", distinct=True)
	consultants = sorted(u for u in consultants if frappe.db.get_value("User", u, "enabled"))
	this_year = getdate().year + (1 if getdate().month >= 7 else 0)
	return {"client_types": CLIENT_TYPES, "provinces": PROVINCES, "fbr_statuses": FBR_STATUSES, "consultants": consultants,
		"return_statuses": RETURN_STATUSES, "tax_years": [str(y) for y in range(this_year, this_year - 8, -1)]}


def template() -> bytes:
	from openpyxl import Workbook
	from openpyxl.comments import Comment
	from openpyxl.styles import Alignment, Font, PatternFill
	from openpyxl.utils import get_column_letter
	from openpyxl.worksheet.datavalidation import DataValidation

	wb = Workbook()
	info = wb.active
	info.title = "Instructions"
	lines = [
		("Data import for the tax portal", True),
		("", False),
		("1. Fill the Clients sheet: one row per client. Only the name and type are required.", False),
		("2. Fill the Returns sheet: one row per client and tax year.", False),
		("     Filed = a past return already filed on IRIS (needs the IRIS acknowledgment number and filing date).", False),
		("     In progress = this year's return that the team is working on. Its document checklist is created.", False),
		("3. In the portal: Import Clients → choose this file → Preview. Fix the rows marked in red, then Import.", False),
		("", False),
		("A client already in the portal (same CNIC, NTN, mobile or email) only gets its empty fields filled.", False),
		("Values that differ from the portal are shown in the preview and are not overwritten.", False),
		("In the Returns sheet, a client is found by CNIC, NTN, mobile or client code: from the portal or from the Clients sheet.", False),
		("Keep the header row as it is. Leave a cell empty when you don't know the value.", False),
		("", False),
		("Example rows (do not copy into the other sheets):", True),
	]
	for i, (text, bold) in enumerate(lines, start=1):
		info.cell(row=i, column=1, value=text).font = Font(bold=bold, size=14 if i == 1 else 11)
	info.append(["Clients:", "Ali Raza", "Individual-Salaried", "35202-1234567-1", "", "03001234567", "ali@example.com", "Lahore", "Punjab"])
	info.append(["Returns:", "35202-1234567-1", "", "", "", "2025", "Filed", "IRIS-1234567", "28-09-2025", "2400000"])
	info.append(["Returns:", "35202-1234567-1", "", "", "", "2026", "In progress"])
	info.column_dimensions["A"].width = 110

	lists = _lists()
	ref = wb.create_sheet("Lists")
	ranges = {}
	for col, (name, values) in enumerate(lists.items(), start=1):
		ref.cell(row=1, column=col, value=name)
		for r, value in enumerate(values, start=2):
			ref.cell(row=r, column=col, value=value)
		letter = get_column_letter(col)
		ranges[name] = f"Lists!${letter}$2:${letter}${max(len(values), 1) + 1}"
	ref.sheet_state = "hidden"

	head_fill = PatternFill("solid", fgColor="141416")
	for title, columns in SHEETS.items():
		ws = wb.create_sheet(title, index=len(wb.sheetnames) - 1)
		for c, (key, header, required, width, help_text, list_name, as_text) in enumerate(columns, start=1):
			cell = ws.cell(row=1, column=c, value=f"{header} *" if required else header)
			cell.font = Font(bold=True, color="F3D77A" if required else "FFFFFF")
			cell.fill = head_fill
			cell.alignment = Alignment(vertical="center")
			if help_text:
				cell.comment = Comment(help_text, "VVS")
			letter = get_column_letter(c)
			ws.column_dimensions[letter].width = width
			if as_text:  # keep leading zeros and long numbers exactly as typed
				ws.column_dimensions[letter].number_format = "@"
			if list_name and lists.get(list_name):
				dv = DataValidation(type="list", formula1=f"={ranges[list_name]}", allow_blank=True,
					showErrorMessage=list_name != "consultants")
				dv.add(f"{letter}2:{letter}{MAX_ROWS + 1}")
				ws.add_data_validation(dv)
		ws.freeze_panes = "A2"
		ws.row_dimensions[1].height = 22
	buf = io.BytesIO()
	wb.save(buf)
	return buf.getvalue()


# ---------------------------------------------------------------------------------------------------- reading
def _norm_header(h) -> str:
	return re.sub(r"[^a-z0-9]+", "", str(h or "").replace("*", "").lower())


def _text(value) -> str:
	if value is None:
		return ""
	if isinstance(value, float) and value.is_integer():
		value = int(value)
	if isinstance(value, (datetime, date)):
		return value.strftime("%Y-%m-%d")
	return str(value).strip()


def _rows(sheet_rows, columns):
	"""Header row → keys (by header text or key), then one dict per non-empty row with its Excel row number."""
	rows = list(sheet_rows)
	if not rows:
		return []
	lookup = {}
	for key, header, *_ in columns:
		lookup[_norm_header(header)] = key
		lookup[_norm_header(key)] = key
	keys = [lookup.get(_norm_header(h)) for h in rows[0]]
	out = []
	for i, raw in enumerate(rows[1:], start=2):
		row = {k: raw[c] for c, k in enumerate(keys) if k and c < len(raw)}
		if any(_text(x) for x in row.values()):
			row["_row"] = i
			out.append(row)
	if len(out) > MAX_ROWS:
		frappe.throw(_("A sheet can have at most {0} rows.").format(MAX_ROWS))
	return out


def read(filename: str, content: bytes) -> dict:
	"""{"Clients": [...], "Returns": [...]} from an .xlsx (both sheets) or a .csv (clients only)."""
	if filename.lower().endswith(".csv"):
		import csv

		reader = csv.reader(io.StringIO(content.decode("utf-8-sig")))
		return {"Clients": _rows(reader, CLIENT_COLUMNS), "Returns": []}
	from openpyxl import load_workbook

	try:
		wb = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
	except Exception:
		frappe.throw(_("This is not an Excel file the portal can read. Save it as .xlsx and try again."))
	out = {}
	for title, columns in SHEETS.items():
		ws = wb[title] if title in wb.sheetnames else None
		out[title] = _rows(ws.iter_rows(values_only=True), columns) if ws else []
	return out


# ---------------------------------------------------------------------------------------------------- clients
IDENTITY = (("cnic", "cnic_hash", "CNIC"), ("ntn", "ntn_normalized", "NTN"), ("mobile", "mobile_e164", "mobile"),
	("email", "email_normalized", "email"))


def _mobile(value: str) -> str:
	digits = v.digits_only(value)
	return "0" + digits if len(digits) == 10 and digits.startswith("3") else value


def _identity(row: dict) -> dict:
	"""Normalised identifiers of a row (field → value), as Tax Client stores them; raises ValueError on bad input."""
	from pakistan_tax_consultancy.pakistan_income_tax_consultancy.doctype.tax_client.tax_client import cnic_hash

	ids = {}
	if row.get("cnic"):
		ids["cnic_hash"] = cnic_hash(v.normalize_cnic(row["cnic"]))
	if row.get("ntn"):
		ids["ntn_normalized"] = v.normalize_ntn(row["ntn"], frappe.db.get_single_value("Tax Consultancy Settings", "ntn_regex"))
	if row.get("mobile"):
		ids["mobile_e164"] = v.normalize_mobile(_mobile(row["mobile"]))
	if row.get("email"):
		ids["email_normalized"] = v.normalize_email(row["email"])
	return {k: x for k, x in ids.items() if x}


def _find_client(ids: dict) -> tuple[str | None, list[str]]:
	"""(the one existing client these identifiers point to, problems)."""
	hits = {}
	for field, value in ids.items():
		name = frappe.db.get_value("Tax Client", {field: value}, "name")
		if name:
			hits.setdefault(name, []).append(field)
	if len(hits) > 1:
		return None, [_("matches more than one client: {0}").format(", ".join(sorted(hits)))]
	return (next(iter(hits)) if hits else None), []


def _client_row(row: dict, consultants: set) -> tuple[dict, list[str]]:
	data = {k: _text(row.get(k)) for k, *_ in CLIENT_COLUMNS}
	if data["mobile"]:
		data["mobile"] = _mobile(data["mobile"])
	errors = []
	if not data["client_name"]:
		errors.append(_("Client name is empty"))
	if data["client_type"] and data["client_type"] not in CLIENT_TYPES:
		errors.append(_("Client type must be one of: {0}").format(", ".join(CLIENT_TYPES)))
	if data["province"] and data["province"] not in PROVINCES:
		errors.append(_("Unknown province {0}").format(data["province"]))
	if data["fbr_registration_status"] and data["fbr_registration_status"] not in FBR_STATUSES:
		errors.append(_("FBR status must be one of: {0}").format(", ".join(FBR_STATUSES)))
	if data["assigned_consultant"]:
		data["assigned_consultant"] = data["assigned_consultant"].lower()
		if data["assigned_consultant"] not in consultants:
			errors.append(_("{0} is not a consultant in the portal").format(data["assigned_consultant"]))
	return {k: x for k, x in data.items() if x}, errors


def _clients(rows: list, commit: bool) -> tuple[list, dict]:
	"""Preview (and import) the Clients sheet. Returns (result rows, identifier → client or Clients-sheet row)."""
	consultants = set(_lists()["consultants"])
	results, known, seen = [], {}, {}
	for row in rows:
		data, errors = _client_row(row, consultants)
		res = {"row": row["_row"], "label": data.get("client_name") or "—", "status": "new", "messages": errors, "name": None}
		results.append(res)
		try:
			ids = _identity(data)
		except ValueError as e:
			errors.append(str(e))
			ids = {}
		for field, value in ids.items():
			if (field, value) in seen:
				errors.append(_("same {0} as row {1}").format(dict((f, l) for _k, f, l in IDENTITY)[field], seen[(field, value)]))
			seen.setdefault((field, value), row["_row"])
		existing, problems = _find_client(ids)
		errors.extend(problems)
		if errors:
			res["status"] = "error"
			continue
		if existing:
			res["name"] = existing
			doc = frappe.get_doc("Tax Client", existing)
			res["label"] = f"{doc.client_name} ({doc.client_code or doc.name})"
			fill, differ = {}, []
			for key, value in data.items():
				current = doc.get(key)
				if key in ("cnic", "ntn", "mobile", "email"):
					continue  # identifiers that matched, or that would clash with the matched client's own
				if not current:
					fill[key] = value
				elif _text(current).lower() != value.lower():
					differ.append(_("{0}: portal has “{1}”, file has “{2}” (kept)").format(key.replace("_", " "), current, value))
			for key in ("cnic", "ntn", "mobile", "email"):
				if data.get(key) and not doc.get(key):
					fill[key] = data[key]
			res["status"] = "update" if fill else "unchanged"
			res["messages"] = ([_("fills {0}").format(", ".join(k.replace("_", " ") for k in fill))] if fill else []) + differ
			if commit and fill:
				def update(doc=doc, fill=fill):
					doc.update(fill)
					doc.save()
				_save(res, update)
		elif commit:
			def insert():
				doc = frappe.get_doc({"doctype": "Tax Client", "client_type": "Individual-Salaried", **data,
					"registration_source": "Import", "status": "Active"})
				doc.insert()
				res["name"] = doc.name
				res["label"] = f"{doc.client_name} ({doc.client_code})"
			_save(res, insert)
		for field, value in ids.items():
			known[(field, value)] = res["name"] or f"row {row['_row']}"
	return results, known


def _save(res: dict, fn):
	frappe.db.savepoint("excel_row")
	try:
		fn()
	except Exception as e:
		frappe.db.rollback(save_point="excel_row")
		res["status"] = "error"
		res["messages"] = [frappe.utils.strip_html(str(e)) or _("Could not be saved")]
		frappe.clear_last_message()


# ---------------------------------------------------------------------------------------------------- returns
def _year(value) -> str:
	text = _text(value).upper().replace("TY", "").strip()
	return text[:4] if re.fullmatch(r"\d{4}(\.0)?", text) else ""


def _date(value):
	if isinstance(value, (datetime, date)):
		return getdate(value)
	text = _text(value)
	if not text:
		return None
	m = re.fullmatch(r"(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})", text)  # Pakistani day-month-year
	if m:
		return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
	return getdate(text)


def ensure_tax_year(year: str):
	"""A past tax year that the portal does not have yet (1 July – 30 June), so history can be recorded against it."""
	if frappe.db.exists("Tax Year", year):
		return
	y = int(year)
	frappe.get_doc({"doctype": "Tax Year", "tax_year_name": year, "is_active": 0, "start_date": date(y - 1, 7, 1),
		"end_date": date(y, 6, 30), "return_due_date": date(y, 9, 30),
		"notes": "Created by the Excel import for past returns."}).insert(ignore_permissions=True)


def _returns(rows: list, known: dict, commit: bool) -> list:
	results, seen = [], set()
	current = str(getdate().year + (1 if getdate().month >= 7 else 0))
	for row in rows:
		errors, notes = [], []
		year, status = _year(row.get("tax_year")), _text(row.get("status"))
		status = next((s for s in RETURN_STATUSES if s.lower() == status.lower()), status)
		res = {"row": row["_row"], "label": f"TY{year or '?'} · {status or '?'}", "status": "new", "messages": notes,
			"name": None}
		results.append(res)
		if not year:
			errors.append(_("Tax year is missing or not a year like 2025"))
		elif int(year) > int(current) + 1:
			errors.append(_("Tax year {0} is in the future").format(year))
		if status not in RETURN_STATUSES:
			errors.append(_("Status must be Filed or In progress"))
		ack = _text(row.get("iris_acknowledgment_no"))
		try:
			filed_on = _date(row.get("filing_date"))
		except Exception:
			filed_on = None
			errors.append(_("Filing date is not a date"))
		if status == FILED:
			if not ack:
				errors.append(_("A filed return needs its IRIS acknowledgment number"))
			if not filed_on:
				errors.append(_("A filed return needs its filing date"))
		elif status == IN_PROGRESS and year and not frappe.db.exists("Tax Year", year):
			errors.append(_("Tax year {0} is not set up in the portal").format(year))
		figures = {}
		for key in ("total_income", "taxable_income", "tax_liability", "total_tax_withheld", "net_tax_payable", "refund_due"):
			raw = _text(row.get(key)).replace(",", "")
			if raw:
				try:
					figures[key] = flt(float(raw), 0)
				except ValueError:
					errors.append(_("{0} is not a number").format(key.replace("_", " ")))

		client = _return_client(row, known, errors)
		if client and client.startswith("row "):
			notes.append(_("client from the Clients sheet, {0}").format(client))
		elif client:
			res["label"] = f"{frappe.db.get_value('Tax Client', client, 'client_name')} · {res['label']}"
		if client and year:
			if (client, year) in seen:
				errors.append(_("this client and tax year appear twice in the sheet"))
			seen.add((client, year))
		if errors:
			res["status"], res["messages"] = "error", errors
			continue
		existing = None if client.startswith("row ") else frappe.db.get_value("Tax Return",
			{"tax_client": client, "tax_year": year, "return_type": "Original"}, "name")
		if existing:
			res["status"], res["name"] = "unchanged", existing
			notes.append(_("return {0} already exists, left as it is").format(existing))
			continue
		if commit:
			if client.startswith("row "):  # its client row could not be imported
				res["status"], res["messages"] = "error", [_("its client ({0}) was not imported").format(client)]
				continue
			_save(res, lambda c=client, y=year, s=status, f=figures, a=ack, d=filed_on: _insert_return(res, c, y, s, f, a, d))
	return results


def _return_client(row: dict, known: dict, errors: list) -> str | None:
	"""The client of a Returns row: by client code, or by CNIC / NTN / mobile in the portal or the Clients sheet."""
	code = _text(row.get("client_code")).upper()
	if code:
		client = frappe.db.get_value("Tax Client", {"client_code": code}, "name")
		if not client:
			errors.append(_("No client with code {0}").format(code))
		return client
	try:
		ids = _identity({"cnic": _text(row.get("cnic")), "ntn": _text(row.get("ntn")), "mobile": _text(row.get("mobile"))})
	except ValueError as e:
		errors.append(str(e))
		return None
	if not ids:
		errors.append(_("Give the client's CNIC, NTN, mobile or client code"))
		return None
	for field, value in ids.items():
		client = known.get((field, value)) or frappe.db.get_value("Tax Client", {field: value}, "name")
		if client:
			return client
	errors.append(_("No client with this CNIC / NTN / mobile in the portal or the Clients sheet"))
	return None


def _insert_return(res, client, year, status, figures, ack, filed_on):
	from pakistan_tax_consultancy.audit import log_event
	from pakistan_tax_consultancy.services import workflow as wf

	if status == FILED:
		ensure_tax_year(year)
	doc = frappe.get_doc({"doctype": "Tax Return", "tax_client": client, "tax_year": year, "return_type": "Original",
		**(figures if status == FILED else {}), "is_imported": 1 if status == FILED else 0})
	doc.flags.imported_history = status == FILED
	doc.insert(ignore_permissions=True)
	if status == FILED:
		# history: the return was filed outside the portal, so it is recorded as acknowledged without the review steps
		doc.db_set({"workflow_state": wf.ACKNOWLEDGED, "fbr_submission_status": "Acknowledged", "iris_acknowledgment_no": ack,
			"filing_date": filed_on, "submission_timestamp": datetime.combine(filed_on, datetime.min.time())}, update_modified=False)
		log_event("Status Change", doc, from_state=None, to_state=wf.ACKNOWLEDGED,
			details={"imported": True, "iris_acknowledgment_no": ack, "filing_date": str(filed_on)})
	res["name"] = doc.name


# ---------------------------------------------------------------------------------------------------- entry point
def run(filename: str, content: bytes, commit: bool) -> dict:
	sheets = read(filename, content)
	clients, known = _clients(sheets["Clients"], commit)
	returns = _returns(sheets["Returns"], known, commit)
	summary = {}
	for sheet, rows in (("clients", clients), ("returns", returns)):
		summary[sheet] = {s: sum(1 for r in rows if r["status"] == s) for s in ("new", "update", "unchanged", "error")}
	return {"dry_run": 0 if commit else 1, "clients": clients, "returns": returns, "summary": summary,
		"checked_on": str(now_datetime())}
