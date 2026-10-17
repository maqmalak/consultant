/**
 * Website & rules manager for non-technical admins: services and prices, packages, FAQ, tax updates, testimonials,
 * tax years, document types and promo codes. Each kind is shown the way the website shows it (price cards, article
 * cards, an FAQ accordion, coupon cards…), with a table view, search, a live / hidden filter, one-click publish and a
 * roomy editor. Server permissions apply (Tax Admin edits; others read).
 */
import {
  BookOpen, CalendarClock, CalendarRange, Check, ChevronDown, Clock, Copy, ExternalLink, Eye, EyeOff, FileStack, Globe, HelpCircle, LayoutGrid,
  LayoutTemplate, List, Lock, Newspaper, Package, Pencil, Plus, Quote, Search, Sparkles, Star, Tag, Trash2, type LucideIcon,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import useSWR from "swr";
import { Empty, ErrorState, InlineError, Loading } from "@/components/common/states";
import { RichTextEditor } from "@/components/forms/rich-text-editor";
import { Button } from "@/components/ui/button";
import { ColorTabs, type TabTone } from "@/components/ui/color-tabs";
import { Dialog } from "@/components/ui/dialog";
import { Field, SelectInput, TextArea, TextInput } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import { apiCall, getList, http } from "@/services/frappe";

type Rec = Record<string, any>;
type Kind = "text" | "textarea" | "html" | "number" | "money" | "check" | "date" | "select" | "lines" | "link";

interface FieldSpec { key: string; label: string; kind: Kind; options?: string[]; link?: string; hint?: string; required?: boolean; wide?: boolean; child?: { table: string; field: string } }
interface Manager {
  key: string; noun: string; label: string; doctype: string; icon: LucideIcon; tone: TabTone; hint: string;
  columns: { key: string; label: string; money?: boolean; check?: boolean }[]; fields: FieldSpec[]; orderBy?: string; nameField: string;
  /** field that makes a record visible on the website / usable */
  live: string; liveLabel: [string, string];
  /** extra fields the card view reads */
  extra?: string[];
}

const MANAGERS: Manager[] = [
  { key: "packages", noun: "package", label: "Packages & prices", doctype: "Service Package", icon: Package, tone: "gold", nameField: "package_name", orderBy: "display_order",
    hint: "The price cards on the website and in the client portal.", live: "active", liveLabel: ["On sale", "Hidden"], extra: ["for_whom"],
    columns: [{ key: "package_name", label: "Package" }, { key: "service", label: "Service" }, { key: "price", label: "Price", money: true },
      { key: "turnaround", label: "Turnaround" }, { key: "most_popular", label: "Popular", check: true }, { key: "active", label: "Active", check: true }],
    fields: [{ key: "package_name", label: "Package name", kind: "text", required: true }, { key: "service", label: "Service", kind: "link", link: "Service", required: true },
      { key: "price", label: "Price (Rs)", kind: "money", required: true }, { key: "turnaround", label: "Turnaround", kind: "text", hint: "e.g. 3–5 working days" },
      { key: "for_whom", label: "Who is it for", kind: "textarea", wide: true },
      { key: "inclusions", label: "What's included (one per line)", kind: "lines", wide: true, child: { table: "Service Package Inclusion", field: "item" } },
      { key: "display_order", label: "Order", kind: "number" },
      { key: "most_popular", label: "Mark as most popular", kind: "check" }, { key: "active", label: "Show on website", kind: "check" }] },
  { key: "services", noun: "service", label: "Services", doctype: "Service", icon: LayoutTemplate, tone: "sky", nameField: "title", orderBy: "display_order",
    hint: "Each service gets its own page at /services/<slug>.", live: "published", liveLabel: ["On website", "Hidden"], extra: ["slug", "summary", "is_active"],
    columns: [{ key: "title", label: "Service" }, { key: "category", label: "Category" }, { key: "price_from", label: "From", money: true }, { key: "published", label: "On website", check: true }],
    fields: [{ key: "title", label: "Service name", kind: "text", required: true }, { key: "slug", label: "Web address", kind: "text", hint: "e.g. ntn-registration" },
      { key: "category", label: "Category", kind: "select", options: ["Tax Filing", "Registration", "Corporate", "Advisory"] },
      { key: "price_from", label: "Price from (Rs)", kind: "money", hint: "Leave blank to use the cheapest package" },
      { key: "summary", label: "One-line summary", kind: "textarea", wide: true }, { key: "details", label: "Page text", kind: "html", wide: true },
      { key: "required_document_types", label: "Documents needed (one per line, must match a Document Type)", kind: "lines", wide: true, child: { table: "Service Document Type", field: "document_type" } },
      { key: "display_order", label: "Order", kind: "number" },
      { key: "published", label: "Show on website", kind: "check" }, { key: "is_active", label: "Clients can order it", kind: "check" }] },
  { key: "faq", noun: "question", label: "FAQ", doctype: "FAQ", icon: HelpCircle, tone: "violet", nameField: "question", orderBy: "display_order",
    hint: "Questions on /faq (also used for Google's FAQ results).", live: "published", liveLabel: ["Published", "Draft"], extra: ["answer"],
    columns: [{ key: "question", label: "Question" }, { key: "category", label: "Category" }, { key: "language", label: "Lang" }, { key: "published", label: "Published", check: true }],
    fields: [{ key: "question", label: "Question", kind: "text", required: true, wide: true }, { key: "answer", label: "Answer", kind: "html", required: true, wide: true },
      { key: "category", label: "Category", kind: "select", options: ["General", "Filing", "Documents", "Payments", "NTN & Registration", "Privacy"] },
      { key: "language", label: "Language", kind: "select", options: ["en", "ur"] }, { key: "display_order", label: "Order", kind: "number" },
      { key: "published", label: "Published", kind: "check" }] },
  { key: "updates", noun: "article", label: "Tax updates", doctype: "Tax Update", icon: Newspaper, tone: "emerald", nameField: "title", orderBy: "published_on",
    hint: "Articles on /tax-updates. Write simply — clients are not tax experts.", live: "published", liveLabel: ["Published", "Draft"],
    extra: ["route", "summary", "cover_image", "author", "language"],
    columns: [{ key: "title", label: "Title" }, { key: "category", label: "Category" }, { key: "published_on", label: "Date" }, { key: "published", label: "Published", check: true }],
    fields: [{ key: "title", label: "Title", kind: "text", required: true, wide: true }, { key: "route", label: "Web address", kind: "text", hint: "e.g. filing-deadline-2026 (blank = from title)" },
      { key: "category", label: "Category", kind: "select", options: ["Tax Updates", "Guides", "Deadlines", "FBR Notices"] },
      { key: "summary", label: "Summary", kind: "textarea", wide: true }, { key: "content", label: "Article", kind: "html", wide: true },
      { key: "author", label: "Author", kind: "text" }, { key: "published_on", label: "Date", kind: "date" },
      { key: "language", label: "Language", kind: "select", options: ["en", "ur"] }, { key: "published", label: "Published", kind: "check" }] },
  { key: "testimonials", noun: "testimonial", label: "Testimonials", doctype: "Testimonial", icon: Star, tone: "amber", nameField: "display_name",
    hint: "Only real reviews. The website shows one only when the client's consent is ticked.", live: "published", liveLabel: ["Published", "Hidden"], extra: ["text", "city"],
    columns: [{ key: "display_name", label: "Name" }, { key: "rating", label: "Rating" }, { key: "client_consent", label: "Consent", check: true }, { key: "published", label: "Published", check: true }],
    fields: [{ key: "display_name", label: "Name or initials (as the client agreed)", kind: "text", required: true }, { key: "city", label: "City", kind: "text" },
      { key: "text", label: "What they said", kind: "textarea", required: true, wide: true },
      { key: "rating", label: "Stars (1–5)", kind: "select", options: ["", "1", "2", "3", "4", "5"] },
      { key: "client_consent", label: "The client agreed to publish this", kind: "check" }, { key: "published", label: "Show on website", kind: "check" }] },
  { key: "years", noun: "tax year", label: "Tax years", doctype: "Tax Year", icon: CalendarRange, tone: "indigo", nameField: "tax_year_name", orderBy: "end_date",
    hint: "The due date drives the website countdown and the deadline reminders.", live: "is_active", liveLabel: ["Open", "Closed"], extra: ["notes"],
    columns: [{ key: "tax_year_name", label: "Tax year" }, { key: "start_date", label: "From" }, { key: "end_date", label: "To" }, { key: "return_due_date", label: "Due date" }, { key: "is_active", label: "Open", check: true }],
    fields: [{ key: "tax_year_name", label: "Tax year", kind: "text", required: true, hint: "e.g. 2027" }, { key: "return_due_date", label: "Return due date", kind: "date" },
      { key: "start_date", label: "Starts", kind: "date", required: true }, { key: "end_date", label: "Ends", kind: "date", required: true },
      { key: "is_active", label: "Open for filing", kind: "check" }] },
  { key: "doctypes", noun: "document type", label: "Document types", doctype: "Document Type", icon: FileStack, tone: "slate", nameField: "document_type_name", orderBy: "display_order",
    hint: "The documents clients can be asked for, with the hint they see.", live: "is_active", liveLabel: ["Active", "Off"], extra: ["client_hint", "is_sensitive"],
    columns: [{ key: "document_type_name", label: "Document" }, { key: "category", label: "Category" }, { key: "is_active", label: "Active", check: true }],
    fields: [{ key: "document_type_name", label: "Document name", kind: "text", required: true },
      { key: "category", label: "Category", kind: "select", options: ["Identity", "Income", "Withholding", "Banking", "Property", "Business", "Wealth", "Previous Returns", "Utility", "Other"] },
      { key: "client_hint", label: "Hint for the client", kind: "textarea", wide: true }, { key: "display_order", label: "Order", kind: "number" },
      { key: "is_sensitive", label: "Sensitive (CNIC, bank…)", kind: "check" }, { key: "is_active", label: "Active", kind: "check" }] },
  { key: "promo", noun: "promo code", label: "Promo codes", doctype: "Promo Code", icon: Tag, tone: "rose", nameField: "code",
    hint: "Discount codes clients can enter when they choose a package.", live: "active", liveLabel: ["Active", "Off"], extra: ["max_uses", "valid_from", "service"],
    columns: [{ key: "code", label: "Code" }, { key: "discount_type", label: "Type" }, { key: "value", label: "Value" }, { key: "valid_to", label: "Valid to" }, { key: "used_count", label: "Used" }, { key: "active", label: "Active", check: true }],
    fields: [{ key: "code", label: "Code", kind: "text", required: true, hint: "Capital letters, e.g. EID2026" }, { key: "discount_type", label: "Discount", kind: "select", options: ["Percent", "Amount"] },
      { key: "value", label: "Percent or rupees", kind: "number", required: true }, { key: "max_uses", label: "Max uses (0 = unlimited)", kind: "number" },
      { key: "valid_from", label: "Valid from", kind: "date" }, { key: "valid_to", label: "Valid to", kind: "date" },
      { key: "service", label: "Only for service", kind: "link", link: "Service" }, { key: "active", label: "Active", kind: "check" }] },
];

const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
const daysTo = (d?: string) => (d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000) : null);
const stripHtml = (h?: string) => (h ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

// ------------------------------------------------------------------------------------------------ editor
function Switch({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)}
      className={cn("flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-start transition", on ? "border-emerald-500/40 bg-emerald-500/5" : "hover:bg-accent")}>
      <span className="min-w-0"><span className="block text-sm font-medium">{label}</span>{hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}</span>
      <span className={cn("relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors", on ? "bg-emerald-500" : "bg-muted-foreground/25")}>
        <span className={cn("inline-block h-4 w-4 rounded-full bg-white shadow transition-transform", on ? "translate-x-[18px] rtl:-translate-x-[18px]" : "translate-x-0.5 rtl:-translate-x-0.5")} />
      </span>
    </button>
  );
}

function Editor({ m, name, onClose, onSaved }: { m: Manager; name: string | null; onClose: () => void; onSaved: () => void }) {
  const isNew = name === "__new__";
  const { data: original, error } = useSWR(isNew ? null : ["doc", m.doctype, name], () =>
    http.get(`/api/resource/${m.doctype}/${encodeURIComponent(name!)}`).then((r) => r.data.data as Rec));
  const links = m.fields.filter((f) => f.kind === "link").map((f) => f.link!);
  const { data: linkOptions } = useSWR(links.length ? ["links", ...links] : null, async () =>
    Object.fromEntries(await Promise.all(links.map(async (l) => [l, (await getList<{ name: string }>(l, { limit: 200, orderBy: "name", order: "asc" })).map((r) => r.name)]))));
  const [form, setForm] = useState<Rec | null>(isNew ? { active: 1, published: 1, is_active: 1 } : null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const doc = form ?? (original ? { ...original } : null);
  const set = (k: string, v: unknown) => setForm({ ...(doc as Rec), [k]: v });
  const lineValue = (f: FieldSpec) => ((doc?.[f.key] ?? []) as Rec[]).map((r) => r[f.child!.field]).join("\n");
  const checks = m.fields.filter((f) => f.kind === "check");
  const others = m.fields.filter((f) => f.kind !== "check");

  async function save() {
    if (!doc) return;
    const missing = m.fields.filter((f) => f.required && !stripHtml(String(f.kind === "lines" ? lineValue(f) : doc[f.key] ?? "")));
    if (missing.length) { setErr(`Please fill: ${missing.map((f) => f.label).join(", ")}`); return; }
    setBusy(true); setErr(null);
    try { await apiCall("frappe.client.save", { doc: { ...doc, doctype: m.doctype } }); onSaved(); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  }

  return (
    <Dialog open size="xl" onClose={onClose} title={isNew ? `New ${m.noun}` : `Edit · ${doc?.[m.nameField] ?? ""}`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={!doc} onClick={() => void save()}>{!busy && <Check className="h-4 w-4" />} Save</Button></>}>
      {error ? <ErrorState error={error} /> : !doc ? <Loading /> : (
        <div className="space-y-5">
          <div className="flex items-center gap-3 rounded-xl bg-muted/50 px-3.5 py-2.5">
            <span className={cn("grid h-9 w-9 place-items-center rounded-lg", TONE_TILE[m.tone])}><m.icon className="h-4 w-4" /></span>
            <p className="text-xs text-muted-foreground">{m.hint}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {others.map((f) => (
              <div key={f.key} className={cn((f.wide || f.kind === "html" || f.kind === "lines") && "sm:col-span-2")}>
                <Field label={f.label} hint={f.hint} required={f.required}>{(id) => {
                  if (f.kind === "select") return (
                    <SelectInput id={id} value={f.key === "rating" ? String(Math.round((doc[f.key] || 0) * 5) || "") : doc[f.key] ?? ""}
                      onChange={(e) => set(f.key, f.key === "rating" ? Number(e.target.value) / 5 : e.target.value)}>
                      {(f.options ?? []).map((o) => <option key={o} value={o}>{o || "—"}</option>)}</SelectInput>);
                  if (f.kind === "link") return (
                    <SelectInput id={id} value={doc[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)}>
                      <option value="">—</option>{(linkOptions?.[f.link!] ?? []).map((o: string) => <option key={o}>{o}</option>)}</SelectInput>);
                  if (f.kind === "textarea") return <TextArea id={id} rows={3} value={doc[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />;
                  if (f.kind === "html") return <RichTextEditor value={doc[f.key] ?? ""} onChange={(html) => set(f.key, html)} minHeight={f.key === "content" ? 280 : 160} />;
                  if (f.kind === "lines") return (
                    <TextArea id={id} rows={5} value={lineValue(f)} onChange={(e) => set(f.key, e.target.value.split("\n").map((v) => v.trim()).filter(Boolean)
                      .map((v) => ({ doctype: f.child!.table, [f.child!.field]: v })))} />);
                  return <TextInput id={id} type={f.kind === "date" ? "date" : f.kind === "number" || f.kind === "money" ? "number" : "text"}
                    value={doc[f.key] ?? ""} onChange={(e) => set(f.key, f.kind === "number" || f.kind === "money" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value)} />;
                }}</Field>
              </div>
            ))}
          </div>
          {checks.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {checks.map((f) => <Switch key={f.key} on={!!doc[f.key]} onChange={(v) => set(f.key, v ? 1 : 0)} label={f.label} />)}
            </div>
          )}
          <InlineError error={err} />
        </div>
      )}
    </Dialog>
  );
}

// ------------------------------------------------------------------------------------------------ cards
const TONE_TILE: Record<TabTone, string> = {
  gold: "bg-[#d4af37]/15 text-[#b8912a] dark:text-[#f3d77a]", sky: "bg-sky-500/15 text-sky-600 dark:text-sky-400", emerald: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  violet: "bg-violet-500/15 text-violet-600 dark:text-violet-400", rose: "bg-rose-500/15 text-rose-600 dark:text-rose-400", amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  whatsapp: "bg-[#25D366]/15 text-[#128C7E]", slate: "bg-slate-500/15 text-slate-600 dark:text-slate-300", indigo: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
};

interface CardProps { r: Rec; m: Manager; onEdit: () => void; onDelete: () => void; onToggle: () => void; busy: boolean }

function LivePill({ r, m, onToggle, busy }: Pick<CardProps, "r" | "m" | "onToggle" | "busy">) {
  const on = !!r[m.live];
  return (
    <button type="button" onClick={onToggle} disabled={busy} title={on ? "Click to hide" : "Click to show"}
      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold transition disabled:opacity-50",
        on ? "bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 dark:text-emerald-300" : "bg-muted text-muted-foreground hover:bg-accent")}>
      {on ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}{on ? m.liveLabel[0] : m.liveLabel[1]}
    </button>
  );
}

function Actions({ onEdit, onDelete, extra }: { onEdit: () => void; onDelete: () => void; extra?: ReactNode }) {
  return (
    <div className="flex items-center gap-0.5">
      {extra}
      <button type="button" onClick={onEdit} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Edit"><Pencil className="h-4 w-4" /></button>
      <button type="button" onClick={onDelete} className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
    </div>
  );
}

function Shell({ r, m, children, className, ...p }: CardProps & { children: ReactNode; className?: string }) {
  return (
    <div className={cn("group relative flex flex-col rounded-2xl border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md", !r[m.live] && "opacity-70", className)}>
      {children}
      <div className="mt-auto flex items-center justify-between gap-2 pt-3">
        <LivePill r={r} m={m} onToggle={p.onToggle} busy={p.busy} />
        <Actions onEdit={p.onEdit} onDelete={p.onDelete} />
      </div>
    </div>
  );
}

function PackageCard(p: CardProps) {
  const { r } = p;
  return (
    <Shell {...p} className={cn(r.most_popular && "border-[#d4af37]/70 shadow-[0_8px_30px_-12px_rgba(212,175,55,0.5)]")}>
      {r.most_popular ? <span className="absolute -top-2.5 start-4 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#f3d77a] to-[#d4af37] px-2.5 py-0.5 text-[11px] font-bold text-[#141416] shadow"><Sparkles className="h-3 w-3" /> Most popular</span> : null}
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{r.service}</p>
      <p className="mt-1 text-lg font-semibold">{r.package_name}</p>
      <p className="mt-2 font-display text-3xl font-bold text-[#b8912a] dark:text-[#f3d77a]">{money(r.price)}</p>
      {r.turnaround && <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5" /> {r.turnaround}</p>}
      {r.for_whom && <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{r.for_whom}</p>}
    </Shell>
  );
}

function ServiceCard(p: CardProps) {
  const { r } = p;
  return (
    <Shell {...p}>
      <div className="flex items-start justify-between gap-2">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-400"><LayoutTemplate className="h-5 w-5" /></span>
        {r.category && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">{r.category}</span>}
      </div>
      <p className="mt-3 font-semibold">{r.title}</p>
      {r.summary && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{r.summary}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        {r.price_from ? <span className="font-semibold">from {money(r.price_from)}</span> : <span className="text-muted-foreground">price from packages</span>}
        {!r.is_active && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-medium text-amber-700 dark:text-amber-300">Not orderable</span>}
        {r.slug && r.published ? <a href={`/services/${r.slug}`} target="_blank" rel="noreferrer" className="ms-auto inline-flex items-center gap-1 font-medium text-primary hover:underline">/services/{r.slug} <ExternalLink className="h-3 w-3" /></a> : null}
      </div>
    </Shell>
  );
}

function ArticleCard(p: CardProps) {
  const { r } = p;
  return (
    <Shell {...p} className="overflow-hidden p-0">
      <div className="relative h-36 bg-gradient-to-br from-[#141416] via-[#1f2230] to-[#3a2f12]">
        {r.cover_image && <img src={r.cover_image} alt="" className="h-full w-full object-cover" loading="lazy" />}
        {r.category && <span className="absolute start-3 top-3 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-[#f3d77a] backdrop-blur">{r.category}</span>}
        {r.language === "ur" && <span className="absolute end-3 top-3 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">اردو</span>}
      </div>
      <div className="flex flex-1 flex-col px-4 pt-3">
        <p className="text-[11px] text-muted-foreground">{fmtDate(r.published_on)}{r.author ? ` · ${r.author}` : ""}</p>
        <p className="mt-1 line-clamp-2 font-semibold leading-snug">{r.title}</p>
        {r.summary && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{r.summary}</p>}
        {r.published && r.route ? <a href={`/${String(r.route).replace(/^\/+/, "")}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">Read on website <ExternalLink className="h-3 w-3" /></a> : null}
      </div>
      <div className="px-4 pb-4" />
    </Shell>
  );
}

function TestimonialCard(p: CardProps) {
  const { r } = p;
  const stars = Math.round((r.rating || 0) * 5);
  return (
    <Shell {...p}>
      <Quote className="h-6 w-6 text-[#d4af37]/60" />
      <p className="mt-2 line-clamp-5 text-sm italic leading-relaxed">“{r.text}”</p>
      <div className="mt-3 flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-[#f3d77a] via-[#d4af37] to-[#9c7a22] text-xs font-bold text-[#141416]">{String(r.display_name ?? "?").slice(0, 2).toUpperCase()}</span>
        <div className="min-w-0"><p className="truncate text-sm font-semibold">{r.display_name}</p><p className="text-[11px] text-muted-foreground">{r.city || "—"}</p></div>
        <span className="ms-auto text-amber-500">{"★".repeat(stars)}<span className="text-muted-foreground/30">{"★".repeat(5 - stars)}</span></span>
      </div>
      {!r.client_consent && <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:text-rose-300"><Lock className="h-3 w-3" /> No consent — never shown</p>}
    </Shell>
  );
}

function YearCard(p: CardProps) {
  const { r } = p;
  const left = daysTo(r.return_due_date);
  const tone = left === null ? "bg-muted text-muted-foreground" : left < 0 ? "bg-muted text-muted-foreground" : left <= 14 ? "bg-rose-500/15 text-rose-700 dark:text-rose-300" : left <= 45 ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  return (
    <Shell {...p}>
      <div className="flex items-start justify-between gap-2">
        <div><p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tax year</p><p className="font-display text-3xl font-bold">{r.tax_year_name}</p></div>
        <span className={cn("rounded-xl px-2.5 py-1.5 text-center text-xs font-semibold", tone)}>
          {left === null ? "No due date" : left < 0 ? "Deadline passed" : <><span className="block text-lg leading-none">{left}</span>days left</>}
        </span>
      </div>
      <div className="mt-3 space-y-1 text-sm">
        <p className="flex items-center gap-2 text-muted-foreground"><CalendarRange className="h-4 w-4" /> {fmtDate(r.start_date)} → {fmtDate(r.end_date)}</p>
        <p className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-[#d4af37]" /> Return due <b>{fmtDate(r.return_due_date)}</b></p>
      </div>
    </Shell>
  );
}

function PromoCard(p: CardProps) {
  const { r } = p;
  const [copied, setCopied] = useState(false);
  const expired = r.valid_to && daysTo(r.valid_to)! < 0;
  const cap = Number(r.max_uses) || 0;
  return (
    <Shell {...p} className="border-dashed border-rose-400/50">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xl font-bold tracking-widest">{r.code}</span>
        <button type="button" onClick={() => { void navigator.clipboard?.writeText(r.code); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent" aria-label="Copy code">{copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}</button>
      </div>
      <p className="mt-1 text-2xl font-bold text-rose-600 dark:text-rose-400">{r.discount_type === "Percent" ? `${r.value}% off` : `${money(r.value)} off`}</p>
      <p className="mt-1 text-xs text-muted-foreground">{r.service ? `Only for ${r.service}` : "Any service"} · {r.valid_from || r.valid_to ? `${fmtDate(r.valid_from)} – ${fmtDate(r.valid_to)}` : "no end date"}</p>
      {expired && <p className="mt-1 text-xs font-semibold text-rose-600">Expired</p>}
      <div className="mt-3">
        <div className="flex justify-between text-[11px] text-muted-foreground"><span>Used {r.used_count || 0}{cap ? ` of ${cap}` : ""}</span>{!cap && <span>unlimited</span>}</div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-rose-500" style={{ width: `${cap ? Math.min(100, ((r.used_count || 0) * 100) / cap) : 0}%` }} /></div>
      </div>
    </Shell>
  );
}

function FaqList({ rows, m, onEdit, onDelete, onToggle, busy }: { rows: Rec[]; m: Manager; onEdit: (r: Rec) => void; onDelete: (r: Rec) => void; onToggle: (r: Rec) => void; busy: string | null }) {
  const [open, setOpen] = useState<string | null>(null);
  const groups = useMemo(() => {
    const g = new Map<string, Rec[]>();
    rows.forEach((r) => g.set(r.category || "General", [...(g.get(r.category || "General") ?? []), r]));
    return [...g];
  }, [rows]);
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {groups.map(([cat, list]) => (
        <section key={cat} className="rounded-2xl border bg-card p-2 shadow-sm">
          <h3 className="flex items-center justify-between px-3 py-2 text-xs font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400">{cat}<span className="rounded-full bg-muted px-2 text-muted-foreground">{list.length}</span></h3>
          {list.map((r) => (
            <div key={r.name} className={cn("rounded-xl transition", open === r.name && "bg-muted/50")}>
              <div className="flex items-center gap-2 px-3 py-2">
                <button type="button" onClick={() => setOpen(open === r.name ? null : r.name)} className="flex min-w-0 flex-1 items-center gap-2 text-start">
                  <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open === r.name && "rotate-180")} />
                  <span className={cn("text-sm font-medium", !r.published && "text-muted-foreground")}>{r.question}</span>
                  {r.language === "ur" && <span className="shrink-0 rounded bg-muted px-1 text-[10px]">اردو</span>}
                </button>
                <LivePill r={r} m={m} onToggle={() => onToggle(r)} busy={busy === r.name} />
                <Actions onEdit={() => onEdit(r)} onDelete={() => onDelete(r)} />
              </div>
              {open === r.name && <div className="prose prose-sm max-w-none px-9 pb-3 text-sm text-muted-foreground dark:prose-invert" dangerouslySetInnerHTML={{ __html: r.answer || "" }} />}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function DocTypeBoard({ rows, m, onEdit, onToggle, busy }: { rows: Rec[]; m: Manager; onEdit: (r: Rec) => void; onToggle: (r: Rec) => void; busy: string | null }) {
  const groups = useMemo(() => {
    const g = new Map<string, Rec[]>();
    rows.forEach((r) => g.set(r.category || "Other", [...(g.get(r.category || "Other") ?? []), r]));
    return [...g];
  }, [rows]);
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {groups.map(([cat, list]) => (
        <section key={cat} className="rounded-2xl border bg-card p-4 shadow-sm">
          <h3 className="mb-3 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-muted-foreground">{cat}<span className="rounded-full bg-muted px-2">{list.length}</span></h3>
          <div className="space-y-1.5">
            {list.map((r) => (
              <div key={r.name} className={cn("group flex items-start gap-2 rounded-xl border px-3 py-2", !r.is_active && "opacity-60")}>
                {r.is_sensitive ? <Lock className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" /> : <FileStack className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                <button type="button" onClick={() => onEdit(r)} className="min-w-0 flex-1 text-start">
                  <span className="block text-sm font-medium">{r.document_type_name}</span>
                  {r.client_hint && <span className="line-clamp-1 block text-[11px] text-muted-foreground">{r.client_hint}</span>}
                </button>
                <LivePill r={r} m={m} onToggle={() => onToggle(r)} busy={busy === r.name} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

const CARD: Record<string, (p: CardProps) => ReactNode> = {
  packages: PackageCard, services: ServiceCard, updates: ArticleCard, testimonials: TestimonialCard, years: YearCard, promo: PromoCard,
};

// ------------------------------------------------------------------------------------------------ manager view
function ManagerView({ m }: { m: Manager }) {
  const fields = useMemo(() => [...new Set(["name", m.nameField, m.live, ...m.columns.map((c) => c.key), ...(m.extra ?? [])])], [m]);
  const { data, error, isLoading, mutate } = useSWR(["list", m.doctype], () => getList<Rec>(m.doctype, {
    fields, limit: 500, orderBy: m.orderBy ?? "modified", order: m.orderBy === "display_order" ? "asc" : "desc" }));
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Rec | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [q, setQ] = useState("");
  const [show, setShow] = useState<"all" | "live" | "hidden">("all");
  const [view, setView] = useState<"cards" | "table">("cards");
  const [busy, setBusy] = useState<string | null>(null);

  const rows = useMemo(() => (data ?? []).filter((r) => (show === "all" || (show === "live") === !!r[m.live])
    && (!q || fields.some((f) => String(r[f] ?? "").toLowerCase().includes(q.toLowerCase())))), [data, show, q, m, fields]);
  const liveCount = (data ?? []).filter((r) => r[m.live]).length;

  const toggle = async (r: Rec) => {
    setBusy(r.name); setErr(null);
    try { await apiCall("frappe.client.set_value", { doctype: m.doctype, name: r.name, fieldname: m.live, value: r[m.live] ? 0 : 1 }); await mutate(); }
    catch (e) { setErr(e); } finally { setBusy(null); }
  };
  const Card = CARD[m.key];
  const cardsPossible = !!Card || m.key === "faq" || m.key === "doctypes";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-2.5 shadow-sm">
        <span className={cn("grid h-9 w-9 place-items-center rounded-lg", TONE_TILE[m.tone])}><m.icon className="h-4 w-4" /></span>
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">{m.hint}</p>
        <label className="flex items-center gap-2 rounded-lg border bg-input-bg px-2.5 focus-within:ring-2 focus-within:ring-ring/30">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input className="h-9 w-40 bg-transparent text-sm outline-none sm:w-52" placeholder={`Search ${m.label.toLowerCase()}`} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="inline-flex rounded-lg border bg-muted/40 p-0.5 text-xs font-semibold">
          {([["all", `All ${data?.length ?? ""}`], ["live", `${m.liveLabel[0]} ${liveCount}`], ["hidden", `${m.liveLabel[1]} ${(data?.length ?? 0) - liveCount}`]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setShow(k)} className={cn("rounded-md px-2.5 py-1.5 transition", show === k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{l}</button>
          ))}
        </div>
        {cardsPossible && (
          <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
            {([["cards", LayoutGrid], ["table", List]] as const).map(([k, Icon]) => (
              <button key={k} type="button" onClick={() => setView(k)} aria-label={`${k} view`} className={cn("rounded-md p-1.5 transition", view === k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}><Icon className="h-4 w-4" /></button>
            ))}
          </div>
        )}
        <Button onClick={() => setEditing("__new__")}><Plus className="h-4 w-4" /> Add</Button>
      </div>
      <InlineError error={err} />
      {isLoading && <Loading />}
      {error && <ErrorState error={error} onRetry={() => void mutate()} />}
      {data && !data.length && <Empty title="Nothing here yet" hint="Use Add to create the first one." />}
      {data && data.length > 0 && !rows.length && <Empty title="No match" hint="Try another search or filter." />}

      {rows.length > 0 && (view === "table" || !cardsPossible ? (
        <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/50"><tr>{m.columns.map((c) => <th key={c.key} className="px-4 py-2.5 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{c.label}</th>)}<th /></tr></thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.name} className="hover:bg-muted/40">
                  {m.columns.map((c, i) => (
                    <td key={c.key} className={cn("px-4 py-2.5", i === 0 && "font-medium")}>
                      {c.key === m.live ? <LivePill r={r} m={m} onToggle={() => void toggle(r)} busy={busy === r.name} />
                        : c.check ? (r[c.key] ? <Check className="h-4 w-4 text-emerald-500" /> : <span className="text-muted-foreground">—</span>)
                        : c.money ? (r[c.key] ? money(r[c.key]) : "—") : c.key === "rating" ? (r[c.key] ? <span className="text-amber-500">{"★".repeat(Math.round(r[c.key] * 5))}</span> : "—") : String(r[c.key] ?? "—")}
                    </td>
                  ))}
                  <td className="px-2 text-end"><Actions onEdit={() => setEditing(r.name)} onDelete={() => setDeleting(r)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : m.key === "faq" ? (
        <FaqList rows={rows} m={m} onEdit={(r) => setEditing(r.name)} onDelete={setDeleting} onToggle={(r) => void toggle(r)} busy={busy} />
      ) : m.key === "doctypes" ? (
        <DocTypeBoard rows={rows} m={m} onEdit={(r) => setEditing(r.name)} onToggle={(r) => void toggle(r)} busy={busy} />
      ) : (
        <div className={cn("grid gap-4 sm:grid-cols-2", m.key === "updates" || m.key === "testimonials" ? "xl:grid-cols-3" : "lg:grid-cols-3 xl:grid-cols-4")}>
          {rows.map((r) => <div key={r.name} className="flex"><div className="flex w-full flex-col [&>*]:flex-1">{Card({ r, m, busy: busy === r.name, onEdit: () => setEditing(r.name), onDelete: () => setDeleting(r), onToggle: () => void toggle(r) })}</div></div>)}
          <button type="button" onClick={() => setEditing("__new__")} className="flex min-h-[10rem] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-sm font-medium text-muted-foreground transition hover:border-primary/50 hover:text-foreground">
            <Plus className="h-6 w-6" /> Add {m.noun}
          </button>
        </div>
      ))}

      {editing && <Editor m={m} name={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void mutate(); }} />}
      <Dialog open={!!deleting} onClose={() => setDeleting(null)} title="Delete?"
        footer={<><Button variant="ghost" onClick={() => setDeleting(null)}>Keep</Button>
          <Button variant="danger" onClick={() => deleting && apiCall("frappe.client.delete", { doctype: m.doctype, name: deleting.name })
            .then(() => { setDeleting(null); void mutate(); }).catch((e) => { setDeleting(null); setErr(e); })}>Delete</Button></>}>
        <p className="text-sm">Delete <b>{deleting?.[m.nameField]}</b>? If it is already used (e.g. by a client's order), the system keeps it and tells you — switch it to “{m.liveLabel[1]}” instead.</p>
      </Dialog>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ page
export function ContentPage() {
  const [tab, setTab] = useState(MANAGERS[0].key);
  const m = MANAGERS.find((x) => x.key === tab)!;
  const { data: counts } = useSWR(["content-counts"], async () =>
    Object.fromEntries(await Promise.all(MANAGERS.map(async (x) => [x.key, await apiCall<number>("frappe.client.get_count", { doctype: x.doctype }).catch(() => 0)]))));
  const { data: years } = useSWR(["content-year"], () => getList<Rec>("Tax Year", { fields: ["tax_year_name", "return_due_date"], filters: { is_active: 1 }, orderBy: "return_due_date", order: "asc", limit: 10 }));
  // the next deadline still ahead (falls back to the latest open year)
  const due = years?.find((y) => (daysTo(y.return_due_date) ?? -1) >= 0) ?? years?.[years.length - 1];
  const left = daysTo(due?.return_due_date);
  return (
    <div className="page-container space-y-5">
      <div className="hero-dark relative overflow-hidden rounded-2xl p-5 text-white shadow-lg sm:p-6">
        <div aria-hidden className="pointer-events-none absolute -end-16 -top-16 h-56 w-56 rounded-full bg-[#d4af37]/20 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-[#f3d77a] via-[#d4af37] to-[#9c7a22] text-[#141416]"><BookOpen className="h-6 w-6" /></span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#f3d77a]">Website & rules</p>
              <h1 className="font-display text-2xl font-semibold">What clients see, in one place</h1>
              <p className="text-sm text-white/60">Prices, services, FAQ, articles and tax years — change them here and the website updates by itself.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {due && <span className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm"><CalendarClock className="h-4 w-4 text-[#f3d77a]" /> TY{due.tax_year_name} due {fmtDate(due.return_due_date)}{left !== null && left >= 0 && <b className="text-[#f3d77a]">· {left} days</b>}</span>}
            <a href="/" target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-br from-[#f3d77a] via-[#d4af37] to-[#b8912a] px-4 text-sm font-semibold text-[#141416] shadow"><Globe className="h-4 w-4" /> View website</a>
          </div>
        </div>
      </div>
      <ColorTabs value={tab} onChange={setTab} className="flex-wrap" tabs={MANAGERS.map((x) => ({ key: x.key, label: x.label, icon: x.icon, tone: x.tone, count: counts?.[x.key] ?? null }))} />
      <ManagerView key={m.key} m={m} />
    </div>
  );
}
