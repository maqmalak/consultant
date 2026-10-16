"""Normalisation and validation helpers for Pakistani taxpayer identifiers.

All functions are pure (no DB access) so they can be unit tested in isolation.
"""

import re

CNIC_RE = re.compile(r"^\d{5}-\d{7}-\d$")
DEFAULT_NTN_RE = r"^\d{7}-?\d$"
MOBILE_E164_RE = re.compile(r"^\+923\d{9}$")


def digits_only(value: str | None) -> str:
	return re.sub(r"\D", "", value or "")


def normalize_cnic(value: str | None) -> str | None:
	"""Return CNIC in ``#####-#######-#`` form, or None when empty.

	Accepts 13 digits with or without dashes/spaces. Raises ValueError if invalid.
	"""
	if not (value or "").strip():
		return None
	d = digits_only(value)
	if len(d) != 13:
		raise ValueError("CNIC must have 13 digits in the format #####-#######-#")
	formatted = f"{d[:5]}-{d[5:12]}-{d[12]}"
	if not CNIC_RE.match(formatted):
		raise ValueError("CNIC must be in the format #####-#######-#")
	return formatted


def mask_cnic(value: str | None) -> str | None:
	"""``12345-1234567-3`` -> ``*****-*******-3``"""
	if not value:
		return None
	d = digits_only(value)
	if len(d) != 13:
		return "*****-*******-*"
	return f"*****-*******-{d[-1]}"


def normalize_mobile(value: str | None) -> str | None:
	"""Normalise a Pakistani mobile number to E.164 (``+923XXXXXXXXX``).

	Accepts ``03XX XXXXXXX``, ``3XXXXXXXXX``, ``923XXXXXXXXX``, ``+92 3XX XXXXXXX``, ``0092...``.
	"""
	if not (value or "").strip():
		return None
	d = digits_only(value)
	if d.startswith("0092"):
		d = d[4:]
	elif d.startswith("92"):
		d = d[2:]
	elif d.startswith("0"):
		d = d[1:]
	e164 = f"+92{d}"
	if not MOBILE_E164_RE.match(e164):
		raise ValueError("Mobile must be a Pakistani mobile number, e.g. +92 3XX XXXXXXX")
	return e164


def format_mobile_display(e164: str | None) -> str | None:
	"""``+923001234567`` -> ``+92 300 1234567``"""
	if not e164 or not MOBILE_E164_RE.match(e164):
		return e164
	return f"+92 {e164[3:6]} {e164[6:]}"


def normalize_email(value: str | None) -> str | None:
	value = (value or "").strip().lower()
	return value or None


def normalize_ntn(value: str | None, pattern: str | None = None) -> str | None:
	"""Validate NTN against the configured regex and return the digits-only form."""
	value = (value or "").strip()
	if not value:
		return None
	if not re.match(pattern or DEFAULT_NTN_RE, value):
		raise ValueError("NTN does not match the configured format")
	return digits_only(value) or value.upper()
