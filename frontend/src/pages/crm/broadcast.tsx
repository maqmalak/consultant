/**
 * WhatsApp broadcasts (ported from the realestate RE Broadcast): pick an approved template and an audience, preview who
 * gets it (and who is skipped — no consent, opted out, no number), send in the background at a safe pace, watch progress.
 * The Templates tab creates new templates for Meta's approval and syncs their status.
 */
import { Ban, BarChart3, CheckCircle2, ChevronRight, Clock, Eye, FlaskConical, Megaphone, MessageSquareText, Plus, RefreshCw, Send, Sparkles, XCircle } from "lucide-react";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ColorTabs } from "@/components/ui/color-tabs";
import { StatCard } from "@/components/common/stat-card";
import { Empty, ErrorState, InlineError, Loading } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { SelectInput } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/cn";
import { useApi } from "@/lib/use-api";
import { apiCall } from "@/services/frappe";

const B = "pakistan_tax_consultancy.api.broadcast";
interface Template { name: string; template_label: string; status: string; template_type: string; message: string; footer: string | null;
  reference_doctype: string | null; variables: { variable_name: string; variable_field: string }[] }
interface TemplatesData { templates: Template[]; fields: Record<string, string[]>; mock: boolean; account: string | null; audiences: Record<string, string> }
interface Campaign { name: string; title: string; template_label: string; status: string; audience: string; total_recipients: number; sent_count: number;
  failed_count: number; skipped_count: number; started_on: string | null; completed_on: string | null; creation: string }
interface Preview { total: number; will_send: number; skipped: Record<string, number>; preview_text: string; minutes: number;
  sample: { name: string; phone: string | null; status: string; reason: string | null }[] }

const WHO: Record<string, string> = { "Tax Client": "Clients", "CRM Lead": "Leads", "CRM Deal": "Deals" };
const STATUS_TONE: Record<string, string> = { Approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", Pending: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  Rejected: "bg-rose-500/15 text-rose-700 dark:text-rose-300", Completed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  Running: "bg-sky-500/15 text-sky-700 dark:text-sky-300", Queued: "bg-sky-500/15 text-sky-700 dark:text-sky-300", Cancelled: "bg-muted text-muted-foreground", Draft: "bg-muted text-muted-foreground" };
const Pill = ({ s }: { s: string }) => <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_TONE[s] ?? "bg-muted")}>{s}</span>;
const when = (v: string | null) => (v ? new Date(v.replace(" ", "T")).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

function Bubble({ text, footer }: { text: string; footer?: string | null }) {
  return (
    <div className="max-w-md rounded-2xl rounded-ss-sm bg-[#DCF8C6] px-3.5 py-2.5 text-sm text-[#111b21] shadow-sm dark:bg-[#005c4b] dark:text-[#e9edef]">
      <p className="whitespace-pre-wrap">{text}</p>
      {footer && <p className="mt-1.5 text-[11px] opacity-60">{footer}</p>}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ new broadcast
function NewBroadcast({ open, onClose, tpl, onStarted, preset }: { open: boolean; onClose: () => void; tpl?: TemplatesData; onStarted: (name: string) => void; preset?: Template | null }) {
  const approved = (tpl?.templates ?? []).filter((t) => t.status === "Approved");
  const firstAudience = preset ? Object.entries(tpl?.audiences ?? {}).find(([, dt]) => dt === preset.reference_doctype)?.[0] : undefined;
  const [f, setF] = useState({ title: "", template: preset?.name ?? "", audience: firstAudience ?? "Clients - All Opted In", tax_year: "", lead_status: "", lead_source: "", deal_status: "", rate_per_minute: "30" });
  const meta = useApi<{ statuses: { name: string }[]; sources: string[] }>(open ? "pakistan_tax_consultancy.api.crm.lead_statuses" : null);
  const deals = useApi<{ statuses: { name: string }[] }>(open && f.audience === "Deals" ? "pakistan_tax_consultancy.api.crm.pipeline" : null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const need = tpl?.audiences[f.audience];
  const fitting = approved.filter((t) => !t.reference_doctype || t.reference_doctype === need);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setF({ ...f, [k]: e.target.value }); setPreview(null); };
  const payload = { ...f, title: f.title || `${approved.find((t) => t.name === f.template)?.template_label ?? "Broadcast"} · ${f.audience}` };
  const go = async (kind: "preview" | "start") => {
    setBusy(true); setErr(null);
    try {
      if (kind === "preview") setPreview(await apiCall<Preview>(`${B}.preview`, { data: JSON.stringify(payload) }));
      else { const n = await apiCall<string>(`${B}.start`, { data: JSON.stringify(payload) }); onStarted(n); onClose(); setPreview(null); }
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} title="New WhatsApp broadcast" size="lg"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button>
        {!preview ? <Button loading={busy} disabled={!f.template} onClick={() => void go("preview")}>{!busy && <Eye className="h-4 w-4" />} Preview</Button>
          : <Button loading={busy} disabled={!preview.will_send} onClick={() => void go("start")}>{!busy && <Send className="h-4 w-4" />} Send to {preview.will_send}</Button>}</>}>
      <div className="space-y-3">
        <label className="block text-sm font-medium">Who gets it
          <SelectInput className="mt-1" value={f.audience} onChange={(e) => { setF({ ...f, audience: e.target.value, template: "" }); setPreview(null); }}>
            {Object.keys(tpl?.audiences ?? {}).map((a) => <option key={a}>{a}</option>)}</SelectInput></label>
        {f.audience === "Leads" && (
          <div className="grid grid-cols-2 gap-2">
            <SelectInput aria-label="Lead status" value={f.lead_status} onChange={set("lead_status")}><option value="">Any status</option>{meta.data?.statuses.map((s) => <option key={s.name}>{s.name}</option>)}</SelectInput>
            <SelectInput aria-label="Lead source" value={f.lead_source} onChange={set("lead_source")}><option value="">Any source</option>{meta.data?.sources.map((s) => <option key={s}>{s}</option>)}</SelectInput>
          </div>
        )}
        {f.audience === "Deals" && (
          <SelectInput aria-label="Deal stage" value={f.deal_status} onChange={set("deal_status")}><option value="">All open stages</option>{deals.data?.statuses.map((s) => <option key={s.name}>{s.name}</option>)}</SelectInput>
        )}
        <label className="block text-sm font-medium">Template
          <SelectInput className="mt-1" value={f.template} onChange={set("template")}>
            <option value="">Choose an approved template…</option>{fitting.map((t) => <option key={t.name} value={t.name}>{t.template_label} · {t.template_type}</option>)}</SelectInput>
          {!fitting.length && <span className="mt-1 block text-xs text-amber-600">No approved template for {WHO[need ?? ""] ?? "this audience"} yet — create one in the Templates tab.</span>}</label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm font-medium">Name (optional)<input className="field mt-1" value={f.title} onChange={set("title")} placeholder="e.g. October deadline reminder" /></label>
          <label className="text-sm font-medium">Pace<SelectInput className="mt-1" value={f.rate_per_minute} onChange={set("rate_per_minute")}>
            {[["10", "10 / minute"], ["30", "30 / minute"], ["60", "60 / minute"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</SelectInput></label>
        </div>
        {preview && (
          <div className="space-y-3 rounded-2xl border bg-muted/30 p-3">
            <Bubble text={preview.preview_text} footer={approved.find((t) => t.name === f.template)?.footer} />
            <p className="text-sm"><b>{preview.will_send}</b> of {preview.total} will receive it · about {preview.minutes} min</p>
            {Object.entries(preview.skipped).map(([why, n]) => <p key={why} className="flex items-center gap-1.5 text-xs text-muted-foreground"><Ban className="h-3.5 w-3.5" />{n} skipped — {why}</p>)}
          </div>
        )}
        <InlineError error={err} />
      </div>
    </Dialog>
  );
}

// ------------------------------------------------------------------------------------------------ templates
function TemplateDetail({ t, onClose, onUse, manage }: { t: Template | null; onClose: () => void; onUse: (t: Template) => void; manage: boolean }) {
  if (!t) return null;
  return (
    <Dialog open={!!t} onClose={onClose} title={t.template_label} size="lg"
      footer={<><Button variant="ghost" onClick={onClose}>Close</Button>{manage && t.status === "Approved" && <Button onClick={() => onUse(t)}><Send className="h-4 w-4" /> Use in a broadcast</Button>}</>}>
      <div className="grid gap-5 sm:grid-cols-[1fr_15rem]">
        <div className="rounded-2xl bg-[#efeae2] p-4 dark:bg-[#0b141a]"><Bubble text={t.message} footer={t.footer} /></div>
        <dl className="space-y-3 text-sm">
          <div><dt className="text-xs text-muted-foreground">Status</dt><dd className="mt-0.5"><Pill s={t.status} /></dd></div>
          <div><dt className="text-xs text-muted-foreground">Category</dt><dd className="font-medium">{t.template_type}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Sent to</dt><dd className="font-medium">{WHO[t.reference_doctype ?? ""] ?? "Anyone"}</dd></div>
          {!!t.variables.length && <div><dt className="text-xs text-muted-foreground">Filled from</dt>
            <dd className="mt-1 space-y-1">{t.variables.map((v) => <p key={v.variable_name} className="text-xs"><code className="rounded bg-muted px-1">{`{{${v.variable_name}}}`}</code> ← {v.variable_field}</p>)}</dd></div>}
          {t.status !== "Approved" && <p className="rounded-lg bg-amber-500/10 px-2.5 py-2 text-xs text-amber-800 dark:text-amber-300">Waiting for Meta. Use "Sync status from Meta" to check again.</p>}
        </dl>
      </div>
    </Dialog>
  );
}

function Templates({ tpl, reload, manage, onUse }: { tpl?: TemplatesData; reload: () => void; manage: boolean; onUse: (t: Template) => void }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState<Template | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const act = async (m: string) => { setBusy(m); setErr(null); try { await apiCall(`${B}.${m}`); reload(); } catch (e) { setErr(e); } finally { setBusy(null); } };
  return (
    <div className="space-y-4">
      {manage && <div className="flex flex-wrap gap-2">
        <Button onClick={() => navigate("/crm/broadcast/templates/new")}><Plus className="h-4 w-4" /> New template</Button>
        <Button variant="outline" loading={busy === "sync_templates"} onClick={() => void act("sync_templates")}><RefreshCw className="h-4 w-4" /> Sync status from Meta</Button>
        {!tpl?.templates.length && <Button variant="outline" loading={busy === "starter_templates"} onClick={() => void act("starter_templates")}><Sparkles className="h-4 w-4" /> Add starter templates</Button>}
      </div>}
      <InlineError error={err} />
      {!tpl?.templates.length ? <Empty title="No templates yet" hint="Add the starter templates or create your own." /> : (
        <div className="grid gap-4 md:grid-cols-2">
          {tpl.templates.map((t) => (
            <button key={t.name} type="button" onClick={() => setOpen(t)} className="rounded-2xl border bg-card p-4 text-start shadow-sm transition hover:-translate-y-0.5 hover:border-[#25D366]/50 hover:shadow-md">
              <div className="flex items-start justify-between gap-2">
                <div><p className="font-semibold">{t.template_label}</p><p className="text-xs text-muted-foreground">{t.template_type} · for {WHO[t.reference_doctype ?? ""] ?? "anyone"}</p></div>
                <Pill s={t.status} />
              </div>
              <div className="mt-3 rounded-xl bg-[#efeae2] p-3 dark:bg-[#0b141a]"><Bubble text={t.message} footer={t.footer} /></div>
              {!!t.variables.length && <p className="mt-2 text-xs text-muted-foreground">{t.variables.map((v) => `{{${v.variable_name}}} ← ${v.variable_field}`).join(" · ")}</p>}
            </button>
          ))}
        </div>
      )}
      <TemplateDetail t={open} onClose={() => setOpen(null)} manage={manage} onUse={(t) => { setOpen(null); onUse(t); }} />
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ campaigns
function Campaign({ c, onCancel }: { c: Campaign; onCancel: () => void }) {
  const navigate = useNavigate();
  const done = c.sent_count + c.failed_count + c.skipped_count;
  const pct = c.total_recipients ? Math.round((100 * done) / c.total_recipients) : 0;
  const live = c.status === "Running" || c.status === "Queued";
  return (
    <div role="link" tabIndex={0} onClick={() => navigate(`/crm/broadcast/${c.name}`)} onKeyDown={(e) => e.key === "Enter" && navigate(`/crm/broadcast/${c.name}`)}
      className="group cursor-pointer rounded-2xl border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[#25D366]/50 hover:shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0"><p className="flex items-center gap-1.5 font-semibold">{c.title}<ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 transition group-hover:opacity-100" /></p><p className="text-xs text-muted-foreground">{c.template_label} · {c.audience} · {when(c.started_on ?? c.creation)}</p></div>
        <div className="flex items-center gap-2"><Pill s={c.status} /><span className="hidden items-center gap-1 text-xs font-medium text-primary group-hover:flex"><BarChart3 className="h-3.5 w-3.5" /> Insights</span>{live && <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); onCancel(); }}><XCircle className="h-3.5 w-3.5" /> Stop</Button>}</div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full bg-[#25D366] transition-all", live && "animate-pulse")} style={{ width: `${pct}%` }} /></div>
      <div className="mt-2 flex flex-wrap gap-4 text-xs">
        <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" />{c.sent_count} sent</span>
        {!!c.failed_count && <span className="flex items-center gap-1 text-rose-600"><XCircle className="h-3.5 w-3.5" />{c.failed_count} failed</span>}
        {!!c.skipped_count && <span className="flex items-center gap-1 text-muted-foreground"><Ban className="h-3.5 w-3.5" />{c.skipped_count} skipped</span>}
        <span className="ms-auto text-muted-foreground">{done} / {c.total_recipients}</span>
      </div>
    </div>
  );
}

export function BroadcastPage() {
  const { hasRole } = useAuth();
  const manage = hasRole("Tax Admin", "Sales Manager", "System Manager");
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") === "templates" ? "templates" : "campaigns") as "campaigns" | "templates";
  const setTab = (k: "campaigns" | "templates") => setParams(k === "templates" ? { tab: k } : {});
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [preset, setPreset] = useState<Template | null>(null);
  const tpl = useApi<TemplatesData>(`${B}.templates`);
  const list = useApi<Campaign[]>(`${B}.broadcasts`, undefined, { refreshInterval: (d?: Campaign[]) => (d?.some((c) => c.status === "Running" || c.status === "Queued") ? 3000 : 0) });
  const [err, setErr] = useState<unknown>(null);
  const totals = (list.data ?? []).reduce((a, c) => ({ sent: a.sent + c.sent_count, campaigns: a.campaigns + 1, skipped: a.skipped + c.skipped_count }), { sent: 0, campaigns: 0, skipped: 0 });
  return (
    <div className="page-container space-y-5">
      <PageHeader title="WhatsApp broadcast" subtitle="One approved message to many clients or leads — consent respected" icon={<Megaphone className="h-5 w-5" />}
        actions={manage ? <Button size="default" onClick={() => setAdding(true)} disabled={!tpl.data?.account}><Send className="h-4 w-4" /> New broadcast</Button> : undefined} />
      {tpl.data?.mock && <p className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300"><FlaskConical className="h-4 w-4" /> WhatsApp test mode — broadcasts are logged but nothing reaches real phones.</p>}
      {!tpl.isLoading && !tpl.data?.account && <p className="rounded-xl border bg-muted/40 px-3 py-2 text-sm">Set up WhatsApp first in Settings → WhatsApp.</p>}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Broadcasts" value={totals.campaigns} icon={<Megaphone className="h-4 w-4" />} tone="primary" />
        <StatCard label="Messages sent" value={totals.sent} icon={<CheckCircle2 className="h-4 w-4" />} tone="emerald" />
        <StatCard label="Approved templates" value={(tpl.data?.templates ?? []).filter((t) => t.status === "Approved").length} icon={<MessageSquareText className="h-4 w-4" />} tone="sky" />
      </div>
      <ColorTabs value={tab} onChange={setTab} tabs={[
        { key: "campaigns", label: "Broadcasts", icon: Megaphone, tone: "whatsapp", count: list.data?.length },
        { key: "templates", label: "Templates", icon: MessageSquareText, tone: "sky", count: tpl.data?.templates.length },
      ]} />
      <InlineError error={err} />
      {tab === "campaigns" ? (
        list.isLoading ? <Loading /> : list.error ? <ErrorState error={list.error} onRetry={() => void list.mutate()} /> : !list.data?.length
          ? <Empty title="No broadcasts yet" hint="Send a deadline reminder to every client who agreed to WhatsApp updates." action={manage ? <Button onClick={() => setAdding(true)}><Send className="h-4 w-4" /> New broadcast</Button> : undefined} />
          : <div className="space-y-3">{list.data.map((c) => <Campaign key={c.name} c={c} onCancel={() => void apiCall(`${B}.cancel`, { name: c.name }).then(() => list.mutate()).catch(setErr)} />)}</div>
      ) : <Templates tpl={tpl.data} reload={() => void tpl.mutate()} manage={manage} onUse={(t) => { setPreset(t); setAdding(true); }} />}
      <p className="flex items-start gap-2 text-xs text-muted-foreground"><Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />Clients receive broadcasts only if they agreed to WhatsApp updates; anyone who replied STOP is skipped automatically. Marketing templates should go only to people who contacted you.</p>
      {adding && <NewBroadcast open={adding} onClose={() => { setAdding(false); setPreset(null); }} tpl={tpl.data} preset={preset}
        onStarted={(n) => { void list.mutate(); navigate(`/crm/broadcast/${n}`); }} />}
    </div>
  );
}
