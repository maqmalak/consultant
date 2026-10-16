import ipaddress
import re
import socket
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import unquote, urljoin, urlparse

import frappe
import requests
from bs4 import BeautifulSoup

# Lead Finder (ported from the mm_core CRM prospect scraper, adapted to a tax firm): given a business's public
# website or name, best-effort extract its name, phone, email, address and city into a `Lead Prospect`
# review-queue row. Nothing here writes a CRM Lead — a person reviews each row and converts it by hand.
# Polite by design: an honest User-Agent, robots.txt respected, public addresses only (re-checked on every
# redirect), small pages, a handful of URLs per run.

USER_AGENT = "Mozilla/5.0 (compatible; VVSLeadFinder/1.0; business contact research)"
# Wikipedia / Wikidata ask bots to identify themselves; used only for the company-name -> website lookup.
WIKIMEDIA_USER_AGENT = "vvs-lead-finder/1.0 (internal CRM research tool)"
REQUEST_TIMEOUT = 7
MAX_RESPONSE_BYTES = 2_000_000
# Each entry may take two fetches of up to REQUEST_TIMEOUT; a small batch keeps one request well inside proxy timeouts.
MAX_URLS_PER_CALL = 10
# Pause between company-name lookups so Wikipedia's API is not hammered.
DISCOVERY_PACING_SECONDS = 2.0

# Same-site pages worth one more hop: Contact (address / phone) and About (what the business does).
CONTACT_LINK_KEYWORDS = ["contact", "reach us", "get in touch", "find us", "head office", "our offices", "locations", "visit us"]
CSR_LINK_KEYWORDS = ["services", "what we do", "our business", "products"]
ABOUT_LINK_KEYWORDS = ["about"]
# URL paths that are content, not a site section — an article titled "...About..." must not pass for the About page.
NOT_A_SECTION_PATHS = ("/blog", "/news", "/press", "/career", "/job", "/tag/", "/category/", "/product/", "/shop", "/cart", "/login", "/privacy", "/terms", "/faq", "/events/")

# Social platform domains worth surfacing, and the friendly label each maps
# to in the stored "Platform: url" list — checked against each anchor's
# href, in this order, so a page linking multiple platforms keeps them
# grouped predictably.
SOCIAL_DOMAINS = [
	("facebook.com", "Facebook"),
	("linkedin.com", "LinkedIn"),
	("twitter.com", "Twitter/X"),
	("x.com", "Twitter/X"),
	("instagram.com", "Instagram"),
	("youtube.com", "YouTube"),
]
# The doctype's "Data" fieldtype fields (140-char DB column) that this
# module ever writes — everything else it sets (address, proposed_ask,
# social_media, raw_extract) is "Small Text"/no practical length limit.
SHORT_TEXT_FIELDS = {"company_name", "website", "contact_page", "country", "city", "email", "phone", "research_source"}
EMAIL_RE = re.compile(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+")
# A phone-number-SHAPED run of digits, deliberately loose: candidates are then judged by _clean_phone
# (7-15 digits, not a year range / date / repeated digit). Bounded length so one match can't run away over
# a whole "1965 1966 1968 ... 2026" history timeline (that once produced a several-hundred-character
# "phone" that crashed the insert — SCRAPE-00367).
PHONE_CANDIDATE_RE = re.compile(r"(?<![\w.])(?:\+|00)?\d[\d ()\-.–—]{6,20}\d(?![\w])")
# Things of that shape that are NOT phone numbers: "2009 - 2018", "1919-04-15", "15-04-2019".
YEAR_RANGE_RE = re.compile(r"^(?:19|20)\d{2}\s*[-–/]\s*(?:19|20)\d{2}$")
ISO_DATE_RE = re.compile(r"^(?:\d{4}[-./]\d{1,2}[-./]\d{1,2}|\d{1,2}[-./]\d{1,2}[-./]\d{2,4})$")
# "Fax: +92 42 35978098" — a real number, but not the one to call.
FAX_RE = re.compile(r"\bfax\b\.?\s*(?:no\.?|number|#)?\s*[:\-–]?\s*\+?\d[\d ()\-.–—]{5,20}\d", re.IGNORECASE)
PHONE_LABEL_RE = re.compile(
	r"\b(?:phone|tel|telephone|mobile|cell|call|contact\s*(?:no|number)|ph|uan|helpline|toll[\s-]*free|whats\s*app)\b\.?\s*(?:no\.?|number|#)?\s*[:\-–]?",
	re.IGNORECASE,
)
# "Address", "Head Office", "Registered Office: …" — as a label line (content after the colon) or a heading
# with the address on the following line(s).
ADDRESS_LABEL_RE = re.compile(
	r"^(?:our\s+|head\s+|registered\s+|corporate\s+|main\s+|mailing\s+|postal\s+|business\s+|contact\s+|factory\s+|plant\s+|works\s+|regional\s+)*"
	r"(?:address|head\s*office|registered\s*office|corporate\s*office|office|headquarters|location|find\s+us|visit\s+us)"
	r"(?:\s+address)?\s*(?:[:\-–]\s*(.*))?$",
	re.IGNORECASE,
)
# A line that ends an address block (the next labelled thing).
STOP_LINE_RE = re.compile(
	r"^(?:phone|tel|telephone|fax|e-?mail|mobile|cell|contacts?|website|web|timings?|hours|uan|whats\s*app|follow|copyright|©|map|get\s+directions)\b",
	re.IGNORECASE,
)
STREET_WORD_RE = re.compile(
	r"\b(?:road|rd|street|st|avenue|ave|plot|block|sector|floor|building|bldg|kilometer|colony|town|industrial|estate|phase|lane|"
	r"chowk|near|opposite|suite|house|bypass|highway|boulevard|blvd|tower|centre|center|mall|market|bazaar|society|apartment|flat|"
	r"gulberg|defence|cantt|cantonment|box)\b|\d\s*km\b|\bp\.?\s?o\.?\s*box",
	re.IGNORECASE,
)
# Longest names first, so "Rahim Yar Khan" is tried before anything shorter.
KNOWN_CITIES = sorted(
	[
		# Pakistan
		"Karachi", "Lahore", "Islamabad", "Rawalpindi", "Faisalabad", "Multan", "Peshawar", "Quetta", "Sialkot", "Gujranwala",
		"Hyderabad", "Bahawalpur", "Sargodha", "Sukkur", "Larkana", "Sheikhupura", "Jhang", "Rahim Yar Khan", "Gujrat", "Mardan",
		"Kasur", "Okara", "Sahiwal", "Wah Cantt", "Mingora", "Nawabshah", "Dera Ghazi Khan", "Abbottabad", "Mirpur", "Muzaffarabad",
		"Gilgit", "Kohat", "Jhelum", "Chiniot", "Hafizabad", "Sadiqabad", "Burewala", "Mandi Bahauddin", "Kamoke", "Muridke", "Kotri",
		"Jamshoro", "Nowshera", "Swat", "Attock", "Taxila", "Haripur", "Khanewal", "Vehari", "Layyah", "Bhakkar", "Mianwali",
		"Khushab", "Narowal", "Toba Tek Singh", "Pakpattan", "Lodhran", "Muzaffargarh", "Bahawalnagar", "Chakwal", "Gwadar",
		"Turbat", "Khuzdar", "Raiwind", "Kot Addu", "Gojra", "Daska", "Wazirabad", "Sambrial", "Hub",
		# elsewhere
		"Dubai", "Abu Dhabi", "Sharjah", "Riyadh", "Jeddah", "Doha", "Muscat", "Kuwait City", "Manama", "London", "Manchester",
		"Birmingham", "New York", "Chicago", "Houston", "Los Angeles", "San Francisco", "Toronto", "Sydney", "Melbourne",
		"Singapore", "Hong Kong", "Shanghai", "Beijing", "Shenzhen", "Tokyo", "Istanbul", "Dhaka", "Chittagong", "Colombo",
		"Kathmandu", "Kabul", "Delhi", "Mumbai", "Bangalore", "Kolkata", "Cairo", "Nairobi", "Paris", "Berlin", "Frankfurt",
		"Zurich", "Geneva", "Amsterdam", "Brussels", "Milan", "Madrid", "Kuala Lumpur",
	],
	key=len,
	reverse=True,
)
# Spelled-out-as-initials countries a plain Country-name search would miss (case-sensitive: upper case only).
COUNTRY_ALIASES = {r"U\.?K\.?": "United Kingdom", r"U\.?S\.?A\.?": "United States", r"U\.?A\.?E\.?": "United Arab Emirates", r"KSA": "Saudi Arabia"}
# International dialling code -> country (+1 is left out: it is shared by the US and Canada).
PHONE_COUNTRY_CODES = {
	"92": "Pakistan", "971": "United Arab Emirates", "966": "Saudi Arabia", "44": "United Kingdom", "91": "India",
	"880": "Bangladesh", "93": "Afghanistan", "86": "China", "90": "Turkey", "974": "Qatar", "968": "Oman", "965": "Kuwait",
	"973": "Bahrain", "98": "Iran", "94": "Sri Lanka", "977": "Nepal", "65": "Singapore", "852": "Hong Kong", "60": "Malaysia",
	"61": "Australia", "49": "Germany", "33": "France", "39": "Italy", "81": "Japan", "82": "South Korea", "20": "Egypt",
}

# A bare company/NGO name (no scheme, no dot-tld shape) triggers discovery
# instead of being fetched directly.
DOMAIN_LIKE_RE = re.compile(r"^[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}(?:/.*)?$")

WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php"


def _looks_like_url_or_domain(s: str) -> bool:
	if s.startswith(("http://", "https://")):
		return True
	return bool(DOMAIN_LIKE_RE.match(s))


def _get_json(url: str, params: dict | None = None) -> dict:
	"""GET + parse JSON with one retry against Wikipedia/Wikidata. A 429
	(confirmed live during a 74-company bulk run) gets a real backoff —
	honoring `Retry-After` when the server sends one, else 8s, since a short
	retry just gets 429'd again; anything else (a transient empty/non-JSON
	body) only needs a brief pause before the retry.
	"""
	last_exc: Exception | None = None
	for attempt in range(2):
		try:
			resp = requests.get(url, params=params, headers={"User-Agent": WIKIMEDIA_USER_AGENT}, timeout=REQUEST_TIMEOUT)
			resp.raise_for_status()
			return resp.json()
		except Exception as e:
			last_exc = e
			if attempt == 0:
				retry_after = None
				resp = getattr(e, "response", None)
				if resp is not None and resp.status_code == 429:
					retry_after = resp.headers.get("Retry-After")
				try:
					wait = float(retry_after) if retry_after else (8.0 if getattr(resp, "status_code", None) == 429 else 1.5)
				except ValueError:
					wait = 8.0
				time.sleep(wait)
	raise last_exc  # type: ignore[misc]


def _discover_official_website(company_name: str) -> tuple[str | None, str | None]:
	"""Resolve a bare company/NGO name to its official website via Wikipedia
	search -> Wikidata's "official website" (P856) claim — both free, public,
	documented APIs (no key, generous read-only rate limits for this kind of
	one-off lookup), unlike a general web-search API which needs a paid key
	we don't have configured. Returns (url, source_label) or (None, None).
	"""
	search = _get_json(
		WIKIPEDIA_API,
		params={"action": "query", "list": "search", "srsearch": company_name, "format": "json", "srlimit": 1},
	)
	hits = search.get("query", {}).get("search", [])
	if not hits:
		return None, None
	title = hits[0]["title"]

	pageprops = _get_json(
		WIKIPEDIA_API,
		params={"action": "query", "titles": title, "prop": "pageprops", "format": "json"},
	)
	pages = pageprops.get("query", {}).get("pages", {})
	qid = next(iter(pages.values()), {}).get("pageprops", {}).get("wikibase_item")
	if not qid:
		return None, None

	entity = _get_json(f"https://www.wikidata.org/wiki/Special:EntityData/{qid}.json")
	claims = entity.get("entities", {}).get(qid, {}).get("claims", {})
	p856 = claims.get("P856")
	if not p856:
		return None, None
	try:
		url = p856[0]["mainsnak"]["datavalue"]["value"]
	except (KeyError, IndexError):
		return None, None
	return url, f"Wikidata (via Wikipedia article \"{title}\")"


def _is_safe_url(url: str) -> bool:
	"""Basic SSRF guard: only plain http(s) to a publicly routable host.
	Blocks loopback/private/link-local/reserved ranges (this also covers the
	169.254.169.254 cloud metadata address). Does not pin the resolved IP
	for the actual request, so a DNS-rebinding attacker could in principle
	still slip past the check-then-fetch gap — acceptable residual risk for
	a tool gated to authenticated System/Sales Manager/User roles, not
	something to over-engineer here.
	"""
	parsed = urlparse(url)
	if parsed.scheme not in ("http", "https"):
		return False
	host = parsed.hostname
	if not host:
		return False
	try:
		infos = socket.getaddrinfo(host, None)
	except socket.gaierror:
		return False
	for info in infos:
		ip = ipaddress.ip_address(info[4][0])
		if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
			return False
	return True


MAX_REDIRECTS = 4


def _robots_allows(url: str) -> bool:
	"""Respect the site's robots.txt for our user agent (a missing or unreadable robots.txt allows)."""
	from urllib.robotparser import RobotFileParser

	parsed = urlparse(url)
	robots = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
	if not _is_safe_url(robots):
		return False
	try:
		resp = requests.get(robots, headers={"User-Agent": USER_AGENT}, timeout=REQUEST_TIMEOUT, allow_redirects=False)
	except requests.RequestException:
		return True
	if resp.status_code >= 400:
		return True
	rp = RobotFileParser()
	rp.parse(resp.text.splitlines())
	return rp.can_fetch(USER_AGENT, url)


def _fetch(url: str) -> str:
	"""GET a public page: redirects are followed by hand and each hop is re-checked (a public URL must not bounce the
	server to an internal address), robots.txt is honoured, and at most MAX_RESPONSE_BYTES are read."""
	if not _robots_allows(url):
		raise PermissionError("The site's robots.txt asks automated tools not to read this page — add the details by hand")
	for _hop in range(MAX_REDIRECTS + 1):
		if not _is_safe_url(url):
			raise ValueError("URL not allowed (must be a public http/https address)")
		resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=REQUEST_TIMEOUT, stream=True, allow_redirects=False)
		if resp.is_redirect or resp.status_code in (301, 302, 303, 307, 308):
			url = urljoin(url, resp.headers.get("location", ""))
			resp.close()
			continue
		resp.raise_for_status()
		content = b""
		for chunk in resp.iter_content(8192):
			content += chunk
			if len(content) > MAX_RESPONSE_BYTES:
				break
		encoding = resp.encoding
		# requests falls back to ISO-8859-1 for text/* without a charset, which garbles UTF-8 pages
		if not encoding or (encoding.lower() == "iso-8859-1" and "charset" not in resp.headers.get("content-type", "").lower()):
			encoding = "utf-8"
		return content.decode(encoding, errors="ignore")
	raise ValueError("Too many redirects")


def _same_site(a: str, b: str) -> bool:
	strip = lambda u: urlparse(u).netloc.lower().removeprefix("www.")  # noqa: E731
	return strip(a) == strip(b)


def _score_link(label: str, href: str, keywords: list[str]) -> int:
	"""How strongly an anchor points at one of `keywords`: the keyword in the URL path counts most, then in a
	headline-length anchor text. A long anchor is an article title ("28 Odd Facts About The Human Body"),
	not navigation, so its text doesn't count."""
	path = urlparse(href).path.lower()
	squashed = path.replace("-", "").replace("_", "").replace("/", "")
	score = 0
	for k in keywords:
		if k.replace(" ", "-") in path or k.replace(" ", "") in squashed:
			score += 3
		if k in label and len(label) <= 40:
			score += 2
	return score


def _find_pages(url: str, html: str) -> dict[str, str | None]:
	"""Best same-site link for each of the Contact page (address/phone live there), the CSR page, and the
	About page — chosen by score rather than "first anchor containing any keyword", which used to send the
	scraper to an About page or a blog post and never reach Contact."""
	soup = BeautifulSoup(html, "lxml")
	best: dict[str, tuple[int, int, str]] = {}
	groups = {"contact": CONTACT_LINK_KEYWORDS, "csr": CSR_LINK_KEYWORDS, "about": ABOUT_LINK_KEYWORDS}
	for a in soup.find_all("a", href=True):
		href = a["href"].strip()
		if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")):
			continue
		candidate = urljoin(url, href).split("#")[0]
		if not candidate or not _same_site(candidate, url) or candidate.rstrip("/") == url.rstrip("/"):
			continue
		path = urlparse(candidate).path.lower()
		if any(seg in path for seg in NOT_A_SECTION_PATHS):
			continue
		label = re.sub(r"\s+", " ", a.get_text(" ", strip=True)).lower()
		for group, keywords in groups.items():
			score = _score_link(label, candidate, keywords)
			if score <= 0:
				continue
			key = (score, -len(path))  # higher score wins; on a tie the shorter (more top-level) path
			if group not in best or key > best[group][:2]:
				best[group] = (score, -len(path), candidate)
	return {g: (best[g][2] if g in best else None) for g in groups}


def _extract_social_links(soup: BeautifulSoup) -> str | None:
	"""First matching profile URL per platform (site headers/footers often
	repeat the same social icon several times) as `"Platform: url"` lines."""
	found: dict[str, str] = {}
	for a in soup.find_all("a", href=True):
		href = a["href"].strip()
		host = urlparse(href).netloc.lower()
		if not host:
			continue
		for domain, label in SOCIAL_DOMAINS:
			if domain in host and label not in found:
				found[label] = href
				break
	if not found:
		return None
	return "\n".join(f"{label}: {href}" for label, href in found.items())


# ------------------------------------------------------------------ contact details (address / city / country / phone)

_COUNTRY_NAMES: list[str] | None = None


def _country_names() -> list[str]:
	"""Names from the Country doctype, longest first so "South Africa" wins over "Africa"-style overlaps."""
	global _COUNTRY_NAMES
	if _COUNTRY_NAMES is None:
		_COUNTRY_NAMES = sorted(frappe.get_all("Country", pluck="name"), key=len, reverse=True)
	return _COUNTRY_NAMES


def _country_from_code(code: str) -> str | None:
	code = (code or "").strip().lower()
	if len(code) != 2:
		return None
	code = {"uk": "gb"}.get(code, code)  # .uk is the ccTLD, GB the ISO code
	return frappe.db.get_value("Country", {"code": code}, "name")


def _normalize_country(value) -> str | None:
	"""A schema.org addressCountry is an ISO code ("PK"), a name ("Pakistan"), or a {"name": ...} node."""
	if isinstance(value, dict):
		value = value.get("name") or value.get("@id")
	if not isinstance(value, str) or not value.strip():
		return None
	value = value.strip()
	return _country_from_code(value) or (value if len(value) <= 60 else None)


def _word_re(term: str) -> re.Pattern:
	return re.compile(r"(?<![A-Za-z])" + re.escape(term) + r"(?![A-Za-z])", re.IGNORECASE)


def _country_from_address(address: str) -> str | None:
	"""Last country named in the address (a country closes an address: "..., Lahore 53800 - Pakistan")."""
	best: tuple[int, str] | None = None
	for alias, name in COUNTRY_ALIASES.items():
		for m in re.finditer(r"(?<![A-Za-z])" + alias + r"(?![A-Za-z])", address):
			if best is None or m.start() >= best[0]:
				best = (m.start(), name)
	for name in _country_names():
		for m in _word_re(name).finditer(address):
			if best is None or m.start() > best[0]:
				best = (m.start(), name)
	return best[1] if best else None


def _country_from_phone(phone: str | None) -> str | None:
	if not phone:
		return None
	digits = re.sub(r"[^\d+]", "", phone)
	if digits.startswith("00"):
		digits = "+" + digits[2:]
	if not digits.startswith("+"):
		return None
	for prefix in sorted(PHONE_COUNTRY_CODES, key=len, reverse=True):
		if digits[1:].startswith(prefix):
			return PHONE_COUNTRY_CODES[prefix]
	return None


def _country_from_url(url: str) -> str | None:
	"""Country from a two-letter country-code domain (.pk, .ae, .co.uk …); generic .com/.org say nothing."""
	host = (urlparse(url).hostname or "").lower()
	tld = host.rsplit(".", 1)[-1] if "." in host else ""
	return _country_from_code(tld) if len(tld) == 2 else None


_CITY_TRAILING_STREET = re.compile(
	r"^\s*(?:road|rd|street|st|avenue|ave|highway|hwy|bypass|chowk|colony|town|bazaar|market|block|sector|phase|society|cantt|cantonment|expressway|motorway)\b",
	re.IGNORECASE,
)


def _city_from_address(address: str) -> str | None:
	"""A known city named in the address. Later mentions beat earlier ones (a city closes an address), and a
	name followed by a street word is a street, not the city — "18km Multan Road, Lahore" is Lahore, not Multan."""
	best: tuple[int, str] | None = None
	for city in KNOWN_CITIES:
		for m in _word_re(city).finditer(address):
			if _CITY_TRAILING_STREET.match(address[m.end():]):
				continue
			if best is None or m.start() > best[0]:
				best = (m.start(), city)
	return best[1] if best else None


def _clean_phone(raw: str) -> str | None:
	"""A displayable phone number, or None if `raw` is not plausibly one (a year range, a date, a long ID …)."""
	s = unquote(raw or "").strip()
	s = re.sub(r"^(?:tel|callto|phone)\s*:\s*", "", s, flags=re.IGNORECASE).strip()
	s = s.replace("–", "-").replace("—", "-")
	s = re.sub(r"\s+", " ", s)
	m = re.match(r"^\+?\d[\d ()\-.]*\d", s)
	if not m:
		return None
	s = m.group(0).strip()
	digits = re.sub(r"\D", "", s)
	if not 7 <= len(digits) <= 15:
		return None
	if YEAR_RANGE_RE.match(s) or ISO_DATE_RE.match(s) or re.fullmatch(r"\d+\.\d+", s):
		return None
	if len(set(digits)) == 1:  # 0000000, 1111111 …
		return None
	if re.search(r"1234567|7654321", digits):  # form placeholders like "+92 300 1234567"
		return None
	return s


def _phones_in(text: str) -> list[str]:
	"""Plausible phone numbers in a piece of text, with anything labelled as a fax removed first."""
	text = FAX_RE.sub(" ", text)
	out = []
	for m in PHONE_CANDIDATE_RE.finditer(text):
		cleaned = _clean_phone(m.group(0))
		if cleaned and cleaned not in out:
			out.append(cleaned)
	return out


def _jsonld_nodes(soup: BeautifulSoup) -> list[dict]:
	"""Every object in the page's JSON-LD blocks, flattening @graph and nested lists."""
	import json

	nodes: list[dict] = []

	def walk(x):
		if isinstance(x, list):
			for i in x:
				walk(i)
		elif isinstance(x, dict):
			nodes.append(x)
			for v in x.values():
				if isinstance(v, (dict, list)):
					walk(v)

	for tag in soup.find_all("script", type="application/ld+json"):
		try:
			walk(json.loads(tag.string or tag.get_text() or ""))
		except Exception:
			continue
	return nodes


def _with_postal(locality, postal) -> str | None:
	""""Lahore" + "53100" -> "Lahore 53100" (the postal code sits with the city, as in a written address)."""
	parts = [str(x).strip() for x in (locality, postal) if isinstance(x, (str, int)) and str(x).strip()]
	return " ".join(parts) or None


def _join_address(parts) -> str | None:
	parts = [re.sub(r"\s+", " ", str(p)).strip(" ,;|-–") for p in parts if p]
	parts = [p for p in parts if p and p.lower() not in ("address", "location")]
	return ", ".join(parts) if parts else None


def _address_signals(s: str) -> int:
	"""How many independent things say "this is a postal address": a street word (Road, Plot, Block …), a known
	city, a country, a postal code (4-6 digits that isn't a year), a leading house number, several comma parts.
	One alone is not enough — a headline like "Most Innovative Contact Center Enterprise 2026" has a "center" and
	a number."""
	return sum(
		[
			bool(STREET_WORD_RE.search(s)),
			bool(_city_from_address(s)),
			bool(_country_from_address(s)),
			bool(re.search(r"(?<!\d)(?!(?:19|20)\d{2}(?!\d))\d{4,6}(?!\d)", s)),
			bool(re.match(r"^\s*(?:#|no\.?\s*)?\d+[A-Za-z]?\b", s) or re.search(r"\b(?:plot|house|h)\s*(?:no\.?|#)?\s*\d", s, re.IGNORECASE)),
			s.count(",") >= 2,
		]
	)


def _looks_like_address(s: str | None) -> bool:
	if not s or not 8 <= len(s) <= 250 or "@" in s or "http" in s.lower():
		return False
	if len(s.split()) > 40 or not re.search(r"[A-Za-z]", s):
		return False
	return _address_signals(s) >= 2


def _address_from_lines(lines: list[str]) -> str | None:
	""""Address" / "Head Office" / "Registered Office"… as a label line ("Address: …") or a heading followed by
	the address on the next line(s)."""
	for i, line in enumerate(lines):
		if len(line) > 250:
			continue
		m = ADDRESS_LABEL_RE.match(line)
		if not m:
			continue
		parts = [m.group(1).strip()] if m.group(1) and m.group(1).strip() else []
		for nxt in lines[i + 1:i + 4]:
			if STOP_LINE_RE.match(nxt) or "@" in nxt or len(nxt) > 160 or ADDRESS_LABEL_RE.match(nxt):
				break
			if PHONE_CANDIDATE_RE.fullmatch(nxt.strip()) and _clean_phone(nxt):
				break
			parts.append(nxt)
			if len(parts) >= 3:
				break
		candidate = _join_address(parts)
		if _looks_like_address(candidate):
			return candidate
	return None


def _address_from_street_line(lines: list[str]) -> str | None:
	"""Last resort: a short line that reads as an address AND has a street word plus a known city or country."""
	for line in lines:
		if 10 <= len(line) <= 200 and not line.lower().startswith(("copyright", "©")) and _looks_like_address(line):
			if STREET_WORD_RE.search(line) and (_city_from_address(line) or _country_from_address(line)):
				return line
	return None


def _extract_contact(soup: BeautifulSoup, lines_source: BeautifulSoup) -> dict:
	"""address / city / country / phone from one page. `soup` still has its <script> tags (JSON-LD lives
	there); `lines_source` is the same page with scripts/styles stripped, for the text-based fallbacks."""
	address = city = country = None
	phones: list[str] = []

	# 1. schema.org structured data — the most reliable, since the site says what each part is
	for node in _jsonld_nodes(soup):
		addr = node.get("address")
		if isinstance(addr, str) and not address and _looks_like_address(addr):
			address = re.sub(r"\s+", " ", addr).strip()
		elif isinstance(addr, dict) and not address:
			street, locality, region = addr.get("streetAddress"), addr.get("addressLocality"), addr.get("addressRegion")
			candidate = _join_address([street, _with_postal(locality, addr.get("postalCode")), region])
			if candidate and (street or locality):
				address = candidate
				city = city or (locality if isinstance(locality, str) and locality.strip() else None)
				country = country or _normalize_country(addr.get("addressCountry"))
		tel = node.get("telephone")
		for t in ([tel] if isinstance(tel, str) else tel if isinstance(tel, list) else []):
			cleaned = _clean_phone(str(t))
			if cleaned and cleaned not in phones:
				phones.append(cleaned)

	# 2. microdata (itemprop="streetAddress" …)
	def prop(name):
		el = soup.find(attrs={"itemprop": name})
		return re.sub(r"\s+", " ", el.get_text(" ", strip=True)).strip() if el else None

	if not address:
		candidate = _join_address([prop("streetAddress"), _with_postal(prop("addressLocality"), prop("postalCode")), prop("addressRegion")])
		if candidate and (prop("streetAddress") or prop("addressLocality")):
			address = candidate
			city = city or prop("addressLocality")
			country = country or _normalize_country(prop("addressCountry"))
	micro_tel = prop("telephone")
	if micro_tel and _clean_phone(micro_tel) and _clean_phone(micro_tel) not in phones:
		phones.append(_clean_phone(micro_tel))  # type: ignore[arg-type]

	# 3. text: <address> element, then labelled lines
	lines = [re.sub(r"\s+", " ", ln).strip() for ln in lines_source.get_text("\n").split("\n")]
	lines = [ln for ln in lines if ln]
	if not address:
		for el in lines_source.find_all("address"):
			parts = [re.sub(r"\s+", " ", p).strip() for p in el.get_text("\n").split("\n") if p.strip()]
			parts = [p for p in parts if "@" not in p and not _clean_phone(p) and not STOP_LINE_RE.match(p)]
			candidate = _join_address(parts)
			if _looks_like_address(candidate):
				address = candidate
				break
	if not address:
		address = _address_from_lines(lines)
	if not address:
		address = _address_from_street_line(lines)

	# phones: labelled text first (the site says it's a phone), then tel: links, then bare numbers
	for i, line in enumerate(lines):
		if PHONE_LABEL_RE.search(line) and not re.match(r"^\s*fax\b", line, re.IGNORECASE):
			found = _phones_in(PHONE_LABEL_RE.split(line, maxsplit=1)[-1]) or (
				_phones_in(" ".join(lines[i + 1:i + 3])) if len(line) <= 30 else []
			)
			for p in found[:2]:
				if p not in phones:
					phones.append(p)
	for a in soup.find_all("a", href=True):
		if a["href"].lower().startswith(("tel:", "callto:")):
			ctx = (a.get_text(" ", strip=True) + " " + (a.parent.get_text(" ", strip=True)[:80] if a.parent else "")).lower()
			if re.search(r"\bfax\b", ctx) and not re.search(r"\b(tel|phone|call|mobile|cell)\b", ctx):
				continue
			cleaned = _clean_phone(a["href"])
			if cleaned and cleaned not in phones:
				phones.append(cleaned)
	if not phones:
		for line in lines:
			phones.extend(p for p in _phones_in(line) if p not in phones and (p.startswith("+") or re.match(r"^0\d{2,4}[\s-]", p)))
			if phones:
				break

	phone = phones[0] if phones else None
	if address:
		city = city or _city_from_address(address)
		country = country or _country_from_address(address)
	return {"address": address, "city": city, "country": country, "phone": phone}



# ---------------------------------------------------------------- tax-firm extraction (Lead Prospect rows)
def _extract(url: str, html: str) -> dict:
	soup = BeautifulSoup(html, "lxml")
	title = soup.title.get_text().strip() if soup.title and soup.title.string else ""
	name = re.split(r"[|\-–—:]", title)[0].strip() if title else ""
	meta_desc_tag = soup.find("meta", attrs={"name": "description"})
	meta_desc = (meta_desc_tag.get("content") or "").strip() if meta_desc_tag else ""

	emails = set()
	for a in soup.find_all("a", href=True):
		if a["href"].lower().startswith("mailto:"):
			m = EMAIL_RE.search(unquote(a["href"][7:].split("?")[0]))
			if m:
				emails.add(m.group(0))
	social_media = _extract_social_links(soup)
	# contact details need the JSON-LD <script> tags, so read them before scripts are stripped
	plain = BeautifulSoup(html, "lxml")
	for tag in plain(["script", "style", "noscript", "svg", "template"]):
		tag.decompose()
	contact = _extract_contact(soup, plain)
	text = plain.get_text(" ", strip=True)
	emails |= set(EMAIL_RE.findall(text))
	emails = sorted(e for e in emails if "example" not in e.lower() and "sentry" not in e.lower() and not e.lower().endswith((".png", ".jpg")))
	parsed = urlparse(url)
	return {"company_name": name or parsed.netloc, "website": f"{parsed.scheme}://{parsed.netloc}", "email": emails[0] if emails else None,
		"phone": contact["phone"], "address": contact["address"], "city": contact["city"], "country": contact["country"],
		"social_media": social_media, "summary": meta_desc or text[:500]}


def _explain_fetch_error(e: Exception) -> str:
	if isinstance(e, PermissionError | ValueError):
		return str(e)[:140]
	if isinstance(e, requests.HTTPError) and e.response is not None:
		code = e.response.status_code
		if code in (401, 403, 406, 429, 503):
			return f"The site refuses automated access (HTTP {code}) — add the details by hand"
		return "Page not found (HTTP 404) — check the address" if code == 404 else f"The site returned HTTP {code}"
	if isinstance(e, requests.exceptions.SSLError):
		return "The site's certificate could not be verified — check the address"
	if isinstance(e, requests.exceptions.ConnectionError):
		return "Could not connect — check the address, or the site is down"
	if isinstance(e, requests.Timeout):
		return f"No answer within {REQUEST_TIMEOUT}s — the site is too slow"
	return str(e)[:140]


def _fetch_page(url: str) -> str | None:
	try:
		return _fetch(url)
	except Exception:
		return None


LOCATION_KEYS = ("address", "city", "country")


def _collect(url: str) -> tuple[dict, str | None]:
	"""The landing page plus, one hop deeper, its Contact and About/Services pages; raises if the landing page fails."""
	if not _is_safe_url(url):
		raise ValueError("Website address not found or not allowed — check the URL")
	html = _fetch(url)
	data = _extract(url, html)
	pages = _find_pages(url, html)
	contact_url = pages["contact"]
	other_url = pages["about"] or pages["csr"]
	if other_url == contact_url:
		other_url = None
	wanted = [u for u in (contact_url, other_url) if u]
	fetched = {}
	if wanted:
		with ThreadPoolExecutor(max_workers=len(wanted)) as pool:
			fetched = dict(zip(wanted, pool.map(_fetch_page, wanted)))
	contact = _extract(contact_url, fetched[contact_url]) if contact_url and fetched.get(contact_url) else {}
	other = _extract(other_url, fetched[other_url]) if other_url and fetched.get(other_url) else {}
	for source in (contact, data, other):  # the address, city and country travel together; the Contact page wins
		if source.get("address"):
			for k in LOCATION_KEYS:
				data[k] = source.get(k)
			break
	for source in (contact, data, other):
		if source.get("phone"):
			data["phone"] = source["phone"]
			break
	for k in ("email", "social_media"):
		data[k] = data.get(k) or contact.get(k) or other.get(k)
	if other.get("summary") and len(other["summary"]) > len(data.get("summary") or ""):
		data["summary"] = other["summary"]
	if data.get("address") and not data.get("city"):
		data["city"] = _city_from_address(data["address"])
	if not data.get("country"):
		data["country"] = (data.get("address") and _country_from_address(data["address"])) or _country_from_phone(data.get("phone")) or _country_from_url(url)
	return data, contact_url if contact else None


def find_one(raw: str, client_type: str | None = None):
	"""One review-queue row for a website or business name (failures are kept, with the reason)."""
	raw = raw.strip()
	doc = frappe.new_doc("Lead Prospect")
	doc.researched_on = frappe.utils.now_datetime()
	doc.client_type = client_type or "Company"
	if _looks_like_url_or_domain(raw):
		url = raw if raw.startswith(("http://", "https://")) else "https://" + raw
		doc.research_source = "Website"
	else:
		doc.company_name = raw[:140]
		try:
			url, label = _discover_official_website(raw)
		except Exception as e:
			url, label = None, None
			doc.scrape_error = f"Website lookup failed: {str(e)[:100]}"
		if not url:
			doc.scrape_error = doc.scrape_error or f'No official website found for "{raw}" — paste its web address instead'
			doc.source_url = raw[:500]
			doc.research_source = "Name lookup (no match)"
			doc.insert(ignore_permissions=True)
			return doc
		doc.research_source = (label or "Wikidata")[:140]
	doc.source_url = url
	try:
		data, contact_page = _collect(url)
		doc.contact_page = contact_page
		for k, v in data.items():
			if v:
				if k in SHORT_TEXT_FIELDS and isinstance(v, str) and len(v) > 140:
					v = v[:137] + "..."
				if k == "company_name" and doc.company_name:
					continue  # keep the name the user typed
				doc.set(k, v)
	except Exception as e:
		doc.scrape_error = _explain_fetch_error(e)
		host = (urlparse(url).hostname or "").removeprefix("www.")
		doc.company_name = doc.company_name or host
		doc.website = doc.website or (f"{urlparse(url).scheme}://{urlparse(url).netloc}" if host else None)
	doc.insert(ignore_permissions=True)
	return doc


def run(entries, client_type=None):
	entries = [e for e in (entries or []) if isinstance(e, str) and e.strip()][:MAX_URLS_PER_CALL]
	if not entries:
		frappe.throw("Paste at least one website or business name.")
	names, prev_lookup = [], False
	for i, e in enumerate(entries):
		if i and prev_lookup:
			time.sleep(DISCOVERY_PACING_SECONDS)
		prev_lookup = not _looks_like_url_or_domain(e.strip())
		names.append(find_one(e, client_type).name)
	return names


def convert(name):
	"""Approved prospect -> CRM Lead (source Lead Finder); the research summary becomes a CRM note."""
	from pakistan_tax_consultancy.services import crm
	from pakistan_tax_consultancy.utils.validators import normalize_mobile

	p = frappe.get_doc("Lead Prospect", name)
	if p.converted_lead:
		return p.converted_lead
	if not (p.phone or p.email):
		frappe.throw("Add a phone number or email before converting.")
	mobile = None
	if p.phone:
		try:
			mobile = normalize_mobile(p.phone)
		except ValueError:
			mobile = p.phone  # landlines stay as written
	lead = crm.make_lead(p.company_name or p.website, mobile, p.email, source="Lead Finder", owner=frappe.session.user,
		client_type=p.client_type,
		note="\n".join(filter(None, [f"Found by Lead Finder from {p.source_url}", p.address, p.summary and p.summary[:800], p.notes])))
	frappe.db.set_value("CRM Lead", lead, {"organization": (p.company_name or "")[:140], "website": p.website})
	p.db_set({"converted_lead": lead, "status": "Converted"})
	return lead
