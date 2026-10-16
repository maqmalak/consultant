/**
 * Website & rules manager for non-technical admins: services and prices, packages, FAQ, tax updates, testimonials,
 * tax years, document types and promo codes — list, add, edit, delete in plain forms (no desk needed).
 * Server permissions apply (Tax Admin edits; others read).
 */
import { BookOpen, CalendarRange, FileStack, HelpCircle, LayoutTemplate, Newspaper, Package, Pencil, Plus, Star, Tag, Trash2 } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { Empty, ErrorState, InlineError, Loading } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, SelectInput, TextArea, TextInput } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import { apiCall, getList, http } from "@/services/frappe";

type Rec = Record<string, any>;
type Kind = "text" | "textarea" | "html" | "number" | "money" | "check" | "date" | "select" | "lines" | "link";

interface FieldSpec { key: string; label: string; kind: Kind; options?: string[]; link?: string; hint?: string; required?: boolean; child?: { table: string; field: string } }
interface Manager {
  key: string; label: string; doctype: string; icon: typeof Package; hint: string;
  columns: { key: string; label: string; money?: boolean; check?: boolean }[]; fields: FieldSpec[]; orderBy?: string; nameField: string;
}

const MANAGERS: Manager[] = [
  { key: "packages", label: "Packages & prices", doctype: "Service Package", icon: Package, nameField: "package_name", orderBy: "display_order",
    hint: "The price cards on the website and in the client portal.",
    columns: [{ key: "package_name", label: "Package" }, { key: "service", label: "Service" }, { key: "price", label: "Price", money: true },
      { key: "turnaround", label: "Turnaround" }, { key: "most_popular", label: "Popular", check: true }, { key: "active", label: "Active", check: true }],
    fields: [{ key: "package_name", label: "Package name", kind: "text", required: true }, { key: "service", label: "Service", kind: "link", link: "Service", required: true },
      { key: "price", label: "Price (Rs)", kind: "money", required: true }, { key: "turnaround", label: "Turnaround", kind: "text", hint: "e.g. 3–5 working days" },
      { key: "for_whom", label: "Who is it for", kind: "textarea" },
      { key: "inclusions", label: "What's included (one per line)", kind: "lines", child: { table: "Service Package Inclusion", field: "item" } },
      { key: "most_popular", label: "Mark as most popular", kind: "check" }, { key: "active", label: "Show on website", kind: "check" },
      { key: "display_order", label: "Order", kind: "number" }] },
  { key: "services", label: "Services", doctype: "Service", icon: LayoutTemplate, nameField: "title", orderBy: "display_order",
    hint: "Each service gets its own page at /services/<slug>.",
    columns: [{ key: "title", label: "Service" }, { key: "category", label: "Category" }, { key: "price_from", label: "From", money: true }, { key: "published", label: "On website", check: true }],
    fields: [{ key: "title", label: "Service name", kind: "text", required: true }, { key: "slug", label: "Web address", kind: "text", hint: "e.g. ntn-registration" },
      { key: "category", label: "Category", kind: "select", options: ["Tax Filing", "Registration", "Corporate", "Advisory"] },
      { key: "summary", label: "One-line summary", kind: "textarea" }, { key: "details", label: "Page text", kind: "html", hint: "Plain text is fine; blank lines make paragraphs" },
      { key: "price_from", label: "Price from (Rs)", kind: "money", hint: "Leave blank to use the cheapest package" },
      { key: "required_document_types", label: "Documents needed (one per line, must match a Document Type)", kind: "lines", child: { table: "Service Document Type", field: "document_type" } },
      { key: "published", label: "Show on website", kind: "check" }, { key: "is_active", label: "Clients can order it", kind: "check" },
      { key: "display_order", label: "Order", kind: "number" }] },
  { key: "faq", label: "FAQ", doctype: "FAQ", icon: HelpCircle, nameField: "question", orderBy: "display_order",
    hint: "Questions on /faq (also used for Google's FAQ results).",
    columns: [{ key: "question", label: "Question" }, { key: "category", label: "Category" }, { key: "language", label: "Lang" }, { key: "published", label: "Published", check: true }],
    fields: [{ key: "question", label: "Question", kind: "text", required: true }, { key: "answer", label: "Answer", kind: "html", required: true },
      { key: "category", label: "Category", kind: "select", options: ["General", "Filing", "Documents", "Payments", "NTN & Registration", "Privacy"] },
      { key: "language", label: "Language", kind: "select", options: ["en", "ur"] }, { key: "published", label: "Published", kind: "check" },
      { key: "display_order", label: "Order", kind: "number" }] },
  { key: "updates", label: "Tax updates (blog)", doctype: "Tax Update", icon: Newspaper, nameField: "title", orderBy: "published_on",
    hint: "Articles on /tax-updates. Write simply — clients are not tax experts.",
    columns: [{ key: "title", label: "Title" }, { key: "category", label: "Category" }, { key: "published_on", label: "Date" }, { key: "published", label: "Published", check: true }],
    fields: [{ key: "title", label: "Title", kind: "text", required: true }, { key: "route", label: "Web address", kind: "text", hint: "e.g. filing-deadline-2026 (blank = from title)" },
      { key: "category", label: "Category", kind: "select", options: ["Tax Updates", "Guides", "Deadlines", "FBR Notices"] },
      { key: "summary", label: "Summary", kind: "textarea" }, { key: "content", label: "Article", kind: "html" },
      { key: "author", label: "Author", kind: "text" }, { key: "published_on", label: "Date", kind: "date" },
      { key: "published", label: "Published", kind: "check" }, { key: "language", label: "Language", kind: "select", options: ["en", "ur"] }] },
  { key: "testimonials", label: "Testimonials", doctype: "Testimonial", icon: Star, nameField: "display_name",
    hint: "Only real reviews. The website shows one only when the client's consent is ticked.",
    columns: [{ key: "display_name", label: "Name" }, { key: "rating", label: "Rating" }, { key: "client_consent", label: "Consent", check: true }, { key: "published", label: "Published", check: true }],
    fields: [{ key: "display_name", label: "Name or initials (as the client agreed)", kind: "text", required: true }, { key: "city", label: "City", kind: "text" },
      { key: "text", label: "What they said", kind: "textarea", required: true },
      { key: "rating", label: "Stars (1–5)", kind: "select", options: ["", "1", "2", "3", "4", "5"] },
      { key: "client_consent", label: "The client agreed to publish this", kind: "check" }, { key: "published", label: "Show on website", kind: "check" }] },
  { key: "years", label: "Tax years", doctype: "Tax Year", icon: CalendarRange, nameField: "tax_year_name", orderBy: "end_date",
    hint: "The due date drives the website countdown and the deadline reminders.",
    columns: [{ key: "tax_year_name", label: "Tax year" }, { key: "start_date", label: "From" }, { key: "end_date", label: "To" }, { key: "return_due_date", label: "Due date" }, { key: "is_active", label: "Open", check: true }],
    fields: [{ key: "tax_year_name", label: "Tax year", kind: "text", required: true, hint: "e.g. 2027" }, { key: "start_date", label: "Starts", kind: "date", required: true },
      { key: "end_date", label: "Ends", kind: "date", required: true }, { key: "return_due_date", label: "Return due date", kind: "date" },
      { key: "is_active", label: "Open for filing", kind: "check" }] },
  { key: "doctypes", label: "Document types", doctype: "Document Type", icon: FileStack, nameField: "document_type_name", orderBy: "display_order",
    hint: "The documents clients can be asked for, with the hint they see.",
    columns: [{ key: "document_type_name", label: "Document" }, { key: "category", label: "Category" }, { key: "is_active", label: "Active", check: true }],
    fields: [{ key: "document_type_name", label: "Document name", kind: "text", required: true },
      { key: "category", label: "Category", kind: "select", options: ["Identity", "Income", "Withholding", "Banking", "Property", "Business", "Wealth", "Previous Returns", "Utility", "Other"] },
      { key: "client_hint", label: "Hint for the client", kind: "textarea" }, { key: "is_sensitive", label: "Sensitive (CNIC, bank…)", kind: "check" },
      { key: "is_active", label: "Active", kind: "check" }, { key: "display_order", label: "Order", kind: "number" }] },
  { key: "promo", label: "Promo codes", doctype: "Promo Code", icon: Tag, nameField: "code",
    hint: "Discount codes clients can enter when they choose a package.",
    columns: [{ key: "code", label: "Code" }, { key: "discount_type", label: "Type" }, { key: "value", label: "Value" }, { key: "valid_to", label: "Valid to" }, { key: "used_count", label: "Used" }, { key: "active", label: "Active", check: true }],
    fields: [{ key: "code", label: "Code", kind: "text", required: true, hint: "Capital letters, e.g. EID2026" }, { key: "discount_type", label: "Discount", kind: "select", options: ["Percent", "Amount"] },
      { key: "value", label: "Percent or rupees", kind: "number", required: true }, { key: "valid_from", label: "Valid from", kind: "date" },
      { key: "valid_to", label: "Valid to", kind: "date" }, { key: "max_uses", label: "Max uses (0 = unlimited)", kind: "number" },
      { key: "service", label: "Only for service", kind: "link", link: "Service" }, { key: "active", label: "Active", kind: "check" }] },
];

function toHtml(text: string) {
  if (/<\/?[a-z][\s\S]*>/i.test(text)) return text;
  return text.split(/\n{2,}/).map((p) => `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>`).join("");
}
function fromHtml(html: string) {
  return (html || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>\s*<p>/gi, "\n\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
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

  async function save() {
    if (!doc) return;
    const missing = m.fields.filter((f) => f.required && !String(f.kind === "lines" ? lineValue(f) : doc[f.key] ?? "").trim());
    if (missing.length) { setErr(`Please fill: ${missing.map((f) => f.label).join(", ")}`); return; }
    setBusy(true);
    setErr(null);
    try {
      await apiCall("frappe.client.save", { doc: { ...doc, doctype: m.doctype } });
      onSaved();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  }

  return (
    <Dialog open onClose={onClose} title={isNew ? `Add ${m.label.toLowerCase()}` : `Edit ${doc?.[m.nameField] ?? ""}`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={!doc} onClick={() => void save()}>Save</Button></>}>
      {error ? <ErrorState error={error} /> : !doc ? <Loading /> : (
        <div className="space-y-4">
          {m.fields.map((f) => {
            if (f.kind === "check") return (
              <label key={f.key} className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={!!doc[f.key]}
                onChange={(e) => set(f.key, e.target.checked ? 1 : 0)} /> {f.label}</label>);
            return (
              <Field key={f.key} label={f.label} hint={f.hint} required={f.required}>{(id) => {
                if (f.kind === "select") return (
                  <SelectInput id={id} value={f.key === "rating" ? String(Math.round((doc[f.key] || 0) * 5) || "") : doc[f.key] ?? ""}
                    onChange={(e) => set(f.key, f.key === "rating" ? Number(e.target.value) / 5 : e.target.value)}>
                    {(f.options ?? []).map((o) => <option key={o} value={o}>{o || "—"}</option>)}</SelectInput>);
                if (f.kind === "link") return (
                  <SelectInput id={id} value={doc[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)}>
                    <option value="">—</option>{(linkOptions?.[f.link!] ?? []).map((o: string) => <option key={o}>{o}</option>)}</SelectInput>);
                if (f.kind === "textarea") return <TextArea id={id} value={doc[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />;
                if (f.kind === "html") return <TextArea id={id} className="min-h-[160px]" value={fromHtml(doc[f.key] ?? "")} onChange={(e) => set(f.key, toHtml(e.target.value))} />;
                if (f.kind === "lines") return (
                  <TextArea id={id} value={lineValue(f)} onChange={(e) => set(f.key, e.target.value.split("\n").map((v) => v.trim()).filter(Boolean)
                    .map((v) => ({ doctype: f.child!.table, [f.child!.field]: v })))} />);
                return <TextInput id={id} type={f.kind === "date" ? "date" : f.kind === "number" || f.kind === "money" ? "number" : "text"}
                  value={doc[f.key] ?? ""} onChange={(e) => set(f.key, f.kind === "number" || f.kind === "money" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value)} />;
              }}</Field>
            );
          })}
          <InlineError error={err} />
        </div>
      )}
    </Dialog>
  );
}

function ManagerView({ m }: { m: Manager }) {
  const { data, error, isLoading, mutate } = useSWR(["list", m.doctype], () => getList<Rec>(m.doctype, {
    fields: ["name", ...m.columns.map((c) => c.key)], limit: 500, orderBy: m.orderBy ?? "modified", order: m.orderBy === "display_order" ? "asc" : "desc" }));
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Rec | null>(null);
  const [err, setErr] = useState<unknown>(null);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{m.hint}</p>
        <Button onClick={() => setEditing("__new__")}><Plus className="h-4 w-4" /> Add</Button>
      </div>
      <InlineError error={err} />
      {isLoading && <Loading />}
      {error && <ErrorState error={error} onRetry={() => void mutate()} />}
      {data && !data.length && <Empty title="Nothing here yet" hint="Use Add to create the first one." />}
      {data && data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/50"><tr>{m.columns.map((c) => <th key={c.key} className="px-4 py-2.5 text-start text-xs font-semibold uppercase tracking-wider text-muted-foreground">{c.label}</th>)}<th /></tr></thead>
            <tbody className="divide-y">
              {data.map((r) => (
                <tr key={r.name} className="hover:bg-muted/40">
                  {m.columns.map((c, i) => (
                    <td key={c.key} className={cn("px-4 py-2.5", i === 0 && "font-medium")}>
                      {c.check ? (r[c.key] ? "✓" : "—") : c.money ? (r[c.key] ? money(r[c.key]) : "—") : c.key === "rating" ? (r[c.key] ? "★".repeat(Math.round(r[c.key] * 5)) : "—") : String(r[c.key] ?? "—")}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-2 text-end">
                    <button onClick={() => setEditing(r.name)} className="rounded-md p-2 text-muted-foreground hover:bg-accent" aria-label="Edit"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => setDeleting(r)} className="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <Editor m={m} name={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void mutate(); }} />}
      <Dialog open={!!deleting} onClose={() => setDeleting(null)} title="Delete?"
        footer={<><Button variant="ghost" onClick={() => setDeleting(null)}>Keep</Button>
          <Button variant="danger" onClick={() => deleting && apiCall("frappe.client.delete", { doctype: m.doctype, name: deleting.name })
            .then(() => { setDeleting(null); void mutate(); }).catch((e) => { setDeleting(null); setErr(e); })}>Delete</Button></>}>
        <p className="text-sm">Delete <b>{deleting?.[m.nameField]}</b>? If it is already used (e.g. by a client's order), the system keeps it and tells you — untick “active” instead.</p>
      </Dialog>
    </div>
  );
}

export function ContentPage() {
  const [tab, setTab] = useState(MANAGERS[0].key);
  const m = MANAGERS.find((x) => x.key === tab)!;
  return (
    <div className="page-container space-y-5">
      <PageHeader title="Website & rules" subtitle="Prices, services, FAQ, articles, tax years — change them here, the website updates by itself" icon={<BookOpen className="h-5 w-5" />} />
      <div role="tablist" className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
        {MANAGERS.map((x) => (
          <button key={x.key} role="tab" aria-selected={tab === x.key} onClick={() => setTab(x.key)}
            className={cn("flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition",
              tab === x.key ? "bg-card text-foreground shadow" : "text-muted-foreground hover:text-foreground")}>
            <x.icon className="h-4 w-4" /> {x.label}
          </button>
        ))}
      </div>
      <ManagerView key={m.key} m={m} />
    </div>
  );
}
