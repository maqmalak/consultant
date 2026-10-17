/**
 * Lead Finder (ported from the mm_core / realestate CRM prospect scraper): paste business websites or names, the
 * server reads their public pages for name, phone, email and address, and every result waits here for a person to
 * check, edit, approve or reject before it becomes a CRM lead.
 */
import { AlertTriangle, CheckCircle2, Download, ExternalLink, Globe, Loader2, MapPin, Pencil, Radar, Search, Star, Trash2, UserPlus, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { StatCard } from "@/components/common/stat-card";
import { Empty, ErrorState, InlineError, Loading } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { SelectInput, TextArea } from "@/components/ui/field";
import { RichText, RichTextEditor } from "@/components/forms/rich-text-editor";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/cn";
import { useApi } from "@/lib/use-api";
import { apiCall } from "@/services/frappe";

const F = "pakistan_tax_consultancy.api.lead_finder";
type Status = "Pending Review" | "Approved" | "Converted" | "Rejected";
interface Prospect { name: string; company_name: string | null; status: Status; client_type: string; phone: string | null; email: string | null;
  website: string | null; address: string | null; city: string | null; country: string | null; summary: string | null; notes: string | null;
  scrape_error: string | null; converted_lead: string | null; source_url: string | null; research_source: string | null; social_media: string | null;
  category: string | null; rating: number | null; reviews: number | null; maps_url: string | null }
const STATUSES: Status[] = ["Pending Review", "Approved", "Converted", "Rejected"];
const TONE: Record<Status, string> = { "Pending Review": "bg-amber-500/15 text-amber-700 dark:text-amber-300", Approved: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  Converted: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", Rejected: "bg-rose-500/15 text-rose-700 dark:text-rose-300" };
const CLIENT_TYPES = ["Company", "Individual-Business", "AOP", "Individual-Salaried", "Other"];

function EditDialog({ p, onClose, onSaved }: { p: Prospect | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Partial<Prospect>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const v = { ...p, ...f } as Prospect;
  const set = (k: keyof Prospect) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    if (!p) return;
    setBusy(true); setErr(null);
    try { await apiCall(`${F}.update`, { name: p.name, data: f }); setF({}); onSaved(); onClose(); } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <Dialog open={!!p} onClose={() => { setF({}); onClose(); }} title="Check the details" size="lg"
      footer={<><Button variant="ghost" onClick={() => { setF({}); onClose(); }}>Cancel</Button><Button loading={busy} onClick={() => void save()}>Save</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2 text-sm font-medium">Business<input className="field mt-1" value={v.company_name ?? ""} onChange={set("company_name")} /></label>
        <label className="text-sm font-medium">Phone<input className="field mt-1" value={v.phone ?? ""} onChange={set("phone")} /></label>
        <label className="text-sm font-medium">Email<input className="field mt-1" value={v.email ?? ""} onChange={set("email")} /></label>
        <label className="text-sm font-medium">City<input className="field mt-1" value={v.city ?? ""} onChange={set("city")} /></label>
        <label className="text-sm font-medium">Client type<SelectInput className="mt-1" value={v.client_type} onChange={set("client_type")}>{CLIENT_TYPES.map((c) => <option key={c}>{c}</option>)}</SelectInput></label>
        <label className="sm:col-span-2 text-sm font-medium">Address<TextArea className="mt-1" rows={2} value={v.address ?? ""} onChange={set("address")} /></label>
        <div className="sm:col-span-2 text-sm font-medium">Notes<div className="mt-1"><RichTextEditor value={v.notes ?? ""} onChange={(html) => setF((x) => ({ ...x, notes: html }))} minHeight={120} placeholder="Why they may need tax help" /></div></div>
      </div>
      <InlineError error={err} />
    </Dialog>
  );
}

const SUGGESTIONS = ["restaurant", "textile mill", "pharmacy", "school", "hospital", "real estate agency", "car dealer", "wholesale", "bakery", "clinic"];
interface RunState { run: string; status: string; category?: string; location?: string; result?: { added: number; skipped: number } }

/** Google Maps search through Apify: business type + city -> a run on the firm's Apify account -> review queue. */
function MapsSearch({ ready, onImported }: { ready: boolean; onImported: () => void }) {
  const [category, setCategory] = useState("restaurant");
  const [location, setLocation] = useState("Faisalabad, Pakistan");
  const [max, setMax] = useState("50");
  const [clientType, setClientType] = useState("Individual-Business");
  const [run, setRun] = useState<RunState | null>(null);
  const [importLink, setImportLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const timer = useRef<number | null>(null);

  const finish = async (id: string) => {
    const result = await apiCall<{ added: number; skipped: number }>(`${F}.maps_import`, { run: id, client_type: clientType });
    setRun((r) => ({ ...(r ?? { run: id }), run: id, status: "IMPORTED", result }));
    onImported();
  };
  const poll = (id: string) => {
    timer.current = window.setTimeout(async () => {
      try {
        const st = await apiCall<{ status: string }>(`${F}.maps_status`, { run: id });
        setRun((r) => (r ? { ...r, status: st.status } : r));
        if (st.status === "SUCCEEDED") await finish(id);
        else if (["FAILED", "ABORTED", "TIMED-OUT"].includes(st.status)) setErr(new Error(`The Apify run ${st.status.toLowerCase()}.`));
        else poll(id);
      } catch (e) { setErr(e); }
    }, 5000);
  };
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const start = async () => {
    setBusy(true); setErr(null); setRun(null);
    try {
      const r = await apiCall<RunState>(`${F}.maps_search`, { category, location, max_places: Number(max) });
      setRun(r); poll(r.run);
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const importExisting = async () => {
    setBusy(true); setErr(null);
    try { await finish(importLink); setImportLink(""); } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const working = !!run && !["IMPORTED", "FAILED", "ABORTED", "TIMED-OUT"].includes(run.status);

  if (!ready) return (
    <div className="rounded-2xl border border-dashed bg-card p-5 text-sm">
      <p className="flex items-center gap-2 font-semibold"><MapPin className="h-4 w-4 text-primary" /> Google Maps search (business type + city)</p>
      <p className="mt-1 text-muted-foreground">Add the Apify API token in <Link className="text-primary hover:underline" to="/staff/settings">Settings → Lead Finder</Link> to search e.g. "restaurant" in "Faisalabad, Pakistan".</p>
    </div>
  );
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <h2 className="flex items-center gap-2 font-semibold"><MapPin className="h-4 w-4 text-primary" /> Google Maps — business type and city</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_6rem]">
        <label className="text-xs font-medium text-muted-foreground">Business type<input className="field mt-1" list="ptc-cats" value={category} onChange={(e) => setCategory(e.target.value)} />
          <datalist id="ptc-cats">{SUGGESTIONS.map((c) => <option key={c} value={c} />)}</datalist></label>
        <label className="text-xs font-medium text-muted-foreground">City<input className="field mt-1" value={location} onChange={(e) => setLocation(e.target.value)} /></label>
        <label className="text-xs font-medium text-muted-foreground">Max<input className="field mt-1" type="number" min={1} max={200} value={max} onChange={(e) => setMax(e.target.value)} /></label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="text-sm">Treat as <SelectInput className="ms-1 inline-block h-9 w-48" value={clientType} onChange={(e) => setClientType(e.target.value)}>
          {CLIENT_TYPES.map((c) => <option key={c}>{c}</option>)}</SelectInput></label>
        <Button loading={busy && !run} disabled={working || !category.trim() || !location.trim()} onClick={() => void start()}>{!busy && <Search className="h-4 w-4" />} Search Google Maps</Button>
      </div>
      {run && (
        <div className={cn("mt-3 flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-sm", run.status === "IMPORTED" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-muted/60")}>
          {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          {run.status === "IMPORTED" && run.result
            ? <span><b>{run.result.added}</b> new places added to review{run.result.skipped ? `, ${run.result.skipped} already known or without a name` : ""}.</span>
            : <span>Apify run {run.run}: {run.status.toLowerCase()}… results are imported automatically (usually 1–3 minutes).</span>}
        </div>
      )}
      <div className="mt-4 border-t pt-3">
        <p className="text-xs font-medium text-muted-foreground">Or import a finished Apify run</p>
        <div className="mt-1 flex gap-2">
          <input className="field h-9 flex-1 text-sm" placeholder="https://console.apify.com/actors/…/runs/…" value={importLink} onChange={(e) => setImportLink(e.target.value)} />
          <Button size="sm" variant="outline" loading={busy && !!importLink} disabled={!importLink.trim()} onClick={() => void importExisting()}><Download className="h-3.5 w-3.5" /> Import</Button>
        </div>
      </div>
      <InlineError error={err} />
    </div>
  );
}

export function LeadFinderPage() {
  const [text, setText] = useState("");
  const [clientType, setClientType] = useState("Company");
  const [status, setStatus] = useState<Status | "">("Pending Review");
  const [q, setQ] = useState("");
  const { data, error, isLoading, mutate } = useApi<{ rows: Prospect[]; counts: Record<Status, number>; max_per_run: number; apify_ready: boolean }>(`${F}.prospects`,
    { status: status || undefined, q: q || undefined });
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [editing, setEditing] = useState<Prospect | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const entries = [...new Set(text.split(/[\n,]/).map((s) => s.trim()).filter(Boolean))];
  const max = data?.max_per_run ?? 10;

  const find = async () => {
    setRunning(true); setErr(null); setDone(null);
    try {
      const names = await apiCall<string[]>(`${F}.run`, { entries: JSON.stringify(entries.slice(0, max)), client_type: clientType });
      setDone(`${names.length} checked — review them below.`); setText(""); setStatus("Pending Review"); void mutate();
    } catch (e) { setErr(e); } finally { setRunning(false); }
  };
  const act = async (p: Prospect, method: string, args: Record<string, unknown> = {}) => {
    setBusy(p.name); setErr(null);
    try { await apiCall(`${F}.${method}`, { name: p.name, ...args }); void mutate(); } catch (e) { setErr(e); } finally { setBusy(null); }
  };

  return (
    <div className="page-container space-y-5">
      <PageHeader title="Lead Finder" subtitle="Find businesses that may need tax help — every result is checked by a person first" icon={<Radar className="h-5 w-5" />} />

      <MapsSearch ready={!!data?.apify_ready} onImported={() => { setStatus("Pending Review"); void mutate(); }} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <h2 className="flex items-center gap-2 font-semibold"><Globe className="h-4 w-4 text-primary" /> Websites or business names</h2>
          <p className="mt-1 text-sm text-muted-foreground">One per line — e.g. <code>example-traders.pk</code> or <code>Interloop Limited</code>. Up to {max} at a time.</p>
          <TextArea className="mt-3 font-mono text-sm" rows={6} value={text} onChange={(e) => setText(e.target.value)}
            placeholder={"faisalabadtextile.com\nhttps://www.some-business.pk\nCrescent Textile Mills"} />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="text-sm">Treat as <SelectInput className="ms-1 inline-block h-9 w-48" value={clientType} onChange={(e) => setClientType(e.target.value)}>
              {CLIENT_TYPES.map((c) => <option key={c}>{c}</option>)}</SelectInput></label>
            <Button loading={running} disabled={!entries.length} onClick={() => void find()}>{!running && <Search className="h-4 w-4" />} Find {entries.length ? Math.min(entries.length, max) : ""} lead{entries.length === 1 ? "" : "s"}</Button>
            {entries.length > max && <span className="text-xs text-amber-600">Only the first {max} run now.</span>}
            {running && <span className="text-xs text-muted-foreground">Reading public pages — this can take a minute…</span>}
            {done && <span className="flex items-center gap-1 text-sm text-emerald-600"><CheckCircle2 className="h-4 w-4" />{done}</span>}
          </div>
        </div>
        <div className="rounded-2xl border bg-muted/30 p-5 text-sm">
          <p className="font-semibold">Fair use</p>
          <ul className="mt-2 list-disc space-y-1.5 ps-5 text-muted-foreground">
            <li>Only public business pages are read; sites that ask robots not to visit are skipped.</li>
            <li>Nothing becomes a lead until you approve it.</li>
            <li>Contact people respectfully and stop when they ask — mark the lead "Junk" in the CRM.</li>
          </ul>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {STATUSES.map((s) => (
          <StatCard key={s} label={s} value={data?.counts[s] ?? 0} onClick={() => setStatus(status === s ? "" : s)} active={status === s}
            tone={s === "Converted" ? "emerald" : s === "Rejected" ? "rose" : s === "Approved" ? "sky" : "amber"}
            icon={s === "Converted" ? <UserPlus className="h-4 w-4" /> : s === "Rejected" ? <XCircle className="h-4 w-4" /> : s === "Approved" ? <CheckCircle2 className="h-4 w-4" /> : <Radar className="h-4 w-4" />} />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72"><Search className="absolute start-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input className="field h-9 ps-8 text-sm" placeholder="Search results" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <span className="text-sm text-muted-foreground">{status || "All results"}</span>
      </div>
      <InlineError error={err} />

      {isLoading ? <Loading /> : error ? <ErrorState error={error} onRetry={() => void mutate()} /> : !data?.rows.length ? <Empty title="Nothing here" hint="Paste a few business websites above to start." /> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.rows.map((p) => (
            <div key={p.name} className="flex flex-col rounded-2xl border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{p.company_name || p.source_url}</p>
                  {p.website && <a className="flex items-center gap-1 truncate text-xs text-primary hover:underline" href={p.website} target="_blank" rel="noopener noreferrer">{p.website.replace(/^https?:\/\//, "")} <ExternalLink className="h-3 w-3" /></a>}
                </div>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", TONE[p.status])}>{p.status}</span>
              </div>
              {p.scrape_error && <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-300"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{p.scrape_error}</p>}
              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex gap-2"><dt className="w-14 shrink-0 text-muted-foreground">Phone</dt><dd className="truncate">{p.phone ?? "—"}</dd></div>
                <div className="flex gap-2"><dt className="w-14 shrink-0 text-muted-foreground">Email</dt><dd className="truncate">{p.email ?? "—"}</dd></div>
                <div className="flex gap-2"><dt className="w-14 shrink-0 text-muted-foreground">Where</dt><dd className="line-clamp-2">{[p.address, p.city].filter(Boolean).join(", ") || "—"}</dd></div>
              </dl>
              {(p.category || p.rating) && (
                <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {p.category && <span className="rounded-full bg-muted px-2 py-0.5">{p.category}</span>}
                  {!!p.rating && <span className="flex items-center gap-0.5"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{p.rating} ({p.reviews ?? 0})</span>}
                  {p.maps_url && <a className="flex items-center gap-0.5 text-primary hover:underline" href={p.maps_url} target="_blank" rel="noopener noreferrer"><MapPin className="h-3 w-3" />Map</a>}
                </p>
              )}
              {p.summary && !p.category && <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">{p.summary}</p>}
              {p.notes && <RichText html={p.notes} className="mt-2 line-clamp-3 rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs" />}
              <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
                {p.status === "Converted" && p.converted_lead
                  ? <Link className="inline-flex h-8 items-center gap-1 rounded-md bg-emerald-500/15 px-2.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300" to={`/crm/leads/${p.converted_lead}`}>Open lead →</Link>
                  : <>
                    <Button size="sm" loading={busy === p.name} disabled={!p.phone && !p.email} title={!p.phone && !p.email ? "Add a phone or email first" : undefined}
                      onClick={() => void act(p, "convert")}><UserPlus className="h-3.5 w-3.5" /> Make lead</Button>
                    <Button size="sm" variant="outline" onClick={() => setEditing(p)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                    {p.status !== "Rejected"
                      ? <Button size="sm" variant="ghost" onClick={() => void act(p, "set_status", { status: "Rejected" })}><XCircle className="h-3.5 w-3.5" /> Reject</Button>
                      : <Button size="sm" variant="ghost" onClick={() => void act(p, "set_status", { status: "Pending Review" })}>Restore</Button>}
                    <button className="ms-auto rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Delete" onClick={() => void act(p, "delete")}><Trash2 className="h-4 w-4" /></button>
                  </>}
              </div>
            </div>
          ))}
        </div>
      )}
      <EditDialog p={editing} onClose={() => setEditing(null)} onSaved={() => void mutate()} />
    </div>
  );
}
