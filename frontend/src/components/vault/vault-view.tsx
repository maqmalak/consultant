/**
 * Document vault (ported from the realestate Documents page, adapted to tax work): generate letters and summaries as
 * versioned PDFs on the firm letterhead, IRIS acknowledgments and invoices, and every uploaded document — searchable,
 * by year and category, with expiry warnings. Used by the client portal (/vault) and the staff client page.
 */
import {
  BadgeCheck, Calculator, Download, FileText, Handshake, Landmark, ListChecks, Lock, Mail, PenLine, Receipt, Search,
  ShieldCheck, Sparkles, type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { StateBadge } from "@/components/common/state-badge";
import { Empty, InlineError } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { SelectInput } from "@/components/ui/field";
import { downloadUrl, M } from "@/lib/api";
import { cn } from "@/lib/cn";

export interface VaultVersion { name: string; version: number; issued_on: string; issued_by: string; file: string | null }
export interface VaultTarget { name: string; label: string; tax_year: string | null; blocked: string | null; versions: VaultVersion[] }
export interface VaultTemplate { document_type: string; description: string; icon: string; source: string; targets: VaultTarget[] }
export interface VaultDoc { name: string; document_type: string; document_name: string | null; tax_year: string | null; tax_return: string | null;
  status: string; upload_date: string | null; expiry_date: string | null; expiry_status: string | null; category: string; is_client_upload: number }
export interface VaultData {
  client: { name: string; client_name: string; client_type: string };
  documents: VaultDoc[];
  acknowledgments: { tax_return: string; tax_year: string; ack_no: string; has_receipt: boolean }[];
  invoices: { name: string; tax_year: string; sales_invoice: string; net_fee: number; payment_status: string; service_package: string | null }[];
  generate: VaultTemplate[];
  years: string[];
  expiring: number;
}

const ICONS: Record<string, LucideIcon> = {
  "pen-line": PenLine, handshake: Handshake, "list-checks": ListChecks, calculator: Calculator, landmark: Landmark, mail: Mail, "badge-check": BadgeCheck,
};
const day = (v: string | null) => (v ? new Date(v.replace(" ", "T")).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");
const STATUS_LABEL: Record<string, string> = { Requested: "To upload", Pending: "Checking", Verified: "Verified", Rejected: "Upload again" };

function GenerateCard({ tpl, staff, onGenerate }: { tpl: VaultTemplate; staff: boolean; onGenerate: (type: string, ref: string) => Promise<{ name: string }> }) {
  const [ref, setRef] = useState(tpl.targets.find((t) => !t.blocked)?.name ?? tpl.targets[0]?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const target = tpl.targets.find((t) => t.name === ref);
  const latest = target?.versions[0];
  const Icon = ICONS[tpl.icon] ?? FileText;
  const go = async () => {
    // open the tab first: browsers block windows opened after an await
    const win = window.open("", "_blank");
    setBusy(true);
    setErr(null);
    try {
      const r = await onGenerate(tpl.document_type, ref);
      const url = downloadUrl("Generated Document", r.name, "file", staff);
      if (win) win.location.href = url; else window.location.href = url;
    } catch (e) {
      win?.close();
      setErr(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="group flex flex-col rounded-2xl border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[#d4af37]/60 hover:shadow-md">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#f3d77a] via-[#d4af37] to-[#9c7a22] text-[#141416] shadow-sm">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="font-semibold leading-tight">{tpl.document_type}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{tpl.description}</p>
        </div>
      </div>
      <div className="mt-auto space-y-2 pt-4">
        {tpl.targets.length > 1 ? (
          <SelectInput aria-label={`${tpl.document_type} for`} className="h-9 text-sm" value={ref} onChange={(e) => setRef(e.target.value)}>
            {tpl.targets.map((t) => <option key={t.name} value={t.name}>{t.label}</option>)}
          </SelectInput>
        ) : target ? <p className="text-xs font-medium text-muted-foreground">{target.label}</p> : null}
        {!target ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Lock className="h-3.5 w-3.5" /> {tpl.source === "Tax Engagement" ? "Available once a service is ordered." : "Available once a return is started."}</p>
        ) : target.blocked ? (
          <p className="flex items-start gap-1.5 rounded-lg bg-muted/60 px-2.5 py-2 text-xs text-muted-foreground"><Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {target.blocked}</p>
        ) : (
          <div className="flex items-center gap-2">
            <Button size="sm" className="flex-1" loading={busy} onClick={() => void go()}>{!busy && <Sparkles className="h-4 w-4" />} Generate PDF</Button>
            {latest?.file && (
              <a className="inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs font-medium hover:bg-accent" target="_blank" rel="noopener"
                href={downloadUrl("Generated Document", latest.name, "file", staff)} title={`Version ${latest.version} · ${day(latest.issued_on)}`}>
                <Download className="h-3.5 w-3.5" /> v{latest.version}
              </a>
            )}
          </div>
        )}
        <InlineError error={err} />
      </div>
    </div>
  );
}

export function VaultView({ data, staff = false, onGenerate }: {
  data: VaultData; staff?: boolean; onGenerate: (type: string, ref: string) => Promise<{ name: string }>;
}) {
  const [q, setQ] = useState("");
  const [year, setYear] = useState<string>("");
  const [cat, setCat] = useState<string>("");
  const cats = useMemo(() => [...new Set(data.documents.map((d) => d.category))].sort(), [data.documents]);
  const docs = data.documents.filter((d) => (!year || d.tax_year === year) && (!cat || d.category === cat)
    && (!q || `${d.document_name ?? ""} ${d.document_type} ${d.tax_year ?? ""}`.toLowerCase().includes(q.toLowerCase())));
  const groups = docs.reduce<Record<string, VaultDoc[]>>((acc, d) => { (acc[d.category] ??= []).push(d); return acc; }, {});
  const generated = data.generate.reduce((n, g) => n + g.targets.reduce((m, t) => m + t.versions.length, 0), 0);
  const chip = (active: boolean) => cn("rounded-full px-3 py-1 text-xs font-medium transition",
    active ? "bg-[#141416] text-[#f3d77a] dark:bg-[#d4af37] dark:text-[#141416]" : "bg-muted text-muted-foreground hover:text-foreground");

  return (
    <div className="space-y-8">
      {/* header */}
      <div className="relative overflow-hidden rounded-3xl hero-dark p-6 text-white sm:p-8">
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(600px_260px_at_90%_0%,rgba(212,175,55,0.28),transparent_60%)]" />
        <div className="relative flex flex-wrap items-center gap-5">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#d4af37]/40 bg-[#d4af37]/10 text-[#f3d77a]"><ShieldCheck className="h-7 w-7" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#d4af37]">{staff ? data.client.client_name : "Private & secure"}</p>
            <h1 className="mt-1 font-display text-2xl font-semibold sm:text-3xl">Document vault</h1>
            <p className="mt-1 max-w-xl text-sm text-white/65">Every document {staff ? "this client shared" : "you shared"}, every letter we prepared and every FBR acknowledgment — in one place.</p>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
            {[["Files", data.documents.length], ["Generated", generated], ["IRIS receipts", data.acknowledgments.length], ["Expiring", data.expiring]].map(([k, v]) => (
              <div key={k as string}><dt className="text-[11px] uppercase tracking-wider text-white/50">{k}</dt>
                <dd className={cn("font-display text-2xl font-semibold", k === "Expiring" && Number(v) > 0 && "text-amber-300")}>{v}</dd></div>
            ))}
          </dl>
        </div>
      </div>

      {/* generate */}
      <section aria-labelledby="gen" className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 id="gen" className="text-lg font-semibold">Generate a document</h2>
            <p className="text-sm text-muted-foreground">Ready on the {staff ? "firm" : "VVS"} letterhead as a PDF. Each one is saved here, so you can download it again any time.</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.generate.map((tpl) => <GenerateCard key={tpl.document_type} tpl={tpl} staff={staff} onGenerate={onGenerate} />)}
        </div>
      </section>

      {/* official records */}
      {(data.acknowledgments.length > 0 || data.invoices.length > 0) && (
        <section aria-labelledby="official" className="space-y-3">
          <h2 id="official" className="text-lg font-semibold">Official records</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.acknowledgments.map((a) => (
              <div key={a.tax_return} className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                <BadgeCheck className="h-9 w-9 shrink-0 text-emerald-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">IRIS acknowledgment · TY{a.tax_year}</p>
                  <p className="truncate font-mono text-sm font-semibold">{a.ack_no}</p>
                </div>
                {a.has_receipt && <a className="rounded-md border bg-card p-2 hover:bg-accent" aria-label="Download acknowledgment" target="_blank" rel="noopener"
                  href={downloadUrl("Tax Return", a.tax_return, "fbr_receipt", staff)}><Download className="h-4 w-4" /></a>}
              </div>
            ))}
            {data.invoices.map((i) => (
              <div key={i.name} className="flex items-center gap-3 rounded-2xl border bg-card p-4">
                <Receipt className="h-9 w-9 shrink-0 text-sky-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Invoice · TY{i.tax_year}</p>
                  <p className="truncate text-sm font-semibold">{i.sales_invoice} · Rs {Math.round(i.net_fee).toLocaleString()}</p>
                </div>
                <StateBadge state={i.payment_status} />
                {staff
                  ? <a className="rounded-md border p-2 hover:bg-accent" aria-label="Open invoice" target="_blank" rel="noopener" href={`/app/sales-invoice/${encodeURIComponent(i.sales_invoice)}`}><Download className="h-4 w-4" /></a>
                  : <a className="rounded-md border p-2 hover:bg-accent" aria-label="Download invoice" target="_blank" rel="noopener" href={`/api/method/${M.PORTAL}.invoice_pdf?tax_engagement=${encodeURIComponent(i.name)}`}><Download className="h-4 w-4" /></a>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* uploaded documents */}
      <section aria-labelledby="mine" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="mine" className="text-lg font-semibold">{staff ? "Client documents" : "My documents"}</h2>
            <p className="text-sm text-muted-foreground">{docs.length} of {data.documents.length} files</p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute start-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input aria-label="Search documents" className="field h-9 ps-8 text-sm" placeholder="Search documents" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button className={chip(!year)} onClick={() => setYear("")}>All years</button>
          {data.years.map((y) => <button key={y} className={chip(year === y)} onClick={() => setYear(y)}>TY{y}</button>)}
          <span className="mx-1 w-px self-stretch bg-border" />
          <button className={chip(!cat)} onClick={() => setCat("")}>All types</button>
          {cats.map((c) => <button key={c} className={chip(cat === c)} onClick={() => setCat(c)}>{c}</button>)}
        </div>
        {!docs.length ? (
          <Empty title={data.documents.length ? "No documents match" : "Your vault is empty"}
            hint={data.documents.length ? "Try another year or type." : "Documents you upload for your return appear here."}
            action={!staff && !data.documents.length ? <Link to="/documents" className="text-sm font-semibold text-primary">Upload documents →</Link> : undefined} />
        ) : (
          <div className="space-y-5">
            {Object.entries(groups).map(([group, rows]) => (
              <div key={group}>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{group} · {rows.length}</p>
                <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
                  {rows.map((d) => (
                    <li key={d.name} className="flex items-center gap-3 px-4 py-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><FileText className="h-4 w-4" /></span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{d.document_name || d.document_type}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {d.tax_year ? `TY${d.tax_year} · ` : ""}{d.upload_date ? `added ${day(d.upload_date)}` : ""}
                          {d.expiry_date ? ` · expires ${day(d.expiry_date)}` : ""}
                        </p>
                      </div>
                      {d.expiry_status && d.expiry_status !== "Valid" && (
                        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          d.expiry_status === "Expired" ? "bg-rose-500/15 text-rose-700 dark:text-rose-300" : "bg-amber-500/15 text-amber-700 dark:text-amber-300")}>{d.expiry_status}</span>
                      )}
                      <StateBadge state={d.status} label={STATUS_LABEL[d.status] ?? d.status} />
                      <a className="rounded-md border p-2 hover:bg-accent" aria-label={`Download ${d.document_name || d.document_type}`} target="_blank" rel="noopener"
                        href={downloadUrl("Tax Document", d.name, "file", staff)}><Download className="h-4 w-4" /></a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
