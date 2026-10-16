/**
 * One lead or deal (ported from the wise CRM lead page): contact bar, status / owner, an action composer — note,
 * follow-up, WhatsApp, email, meeting or call — and the full activity timeline. Everything is stored in Frappe CRM.
 */
import {
  ArrowLeft, ArrowRightLeft, BadgeCheck, CalendarClock, CalendarPlus, Check, CheckCircle2, CircleDot, ExternalLink, Mail, MessageCircle,
  NotebookPen, Phone, PhoneCall, Send, Sparkles, Users, X, type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Empty, ErrorState, InlineError, Loading } from "@/components/common/states";
import { CRM_COLORS } from "@/components/crm/kanban-board";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { SelectInput, TextArea } from "@/components/ui/field";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { apiCall } from "@/services/frappe";

const A = "pakistan_tax_consultancy.api.crm_activity";
type Kind = "note" | "task" | "email" | "whatsapp" | "event" | "status" | "created";
interface Item { kind: Kind; at: string; by_name?: string; title?: string; body?: string; id?: string; status?: string; priority?: string;
  due?: string; assigned_name?: string; direction?: string; to?: string; category?: string }
interface Detail {
  doctype: "CRM Lead" | "CRM Deal"; name: string; person: string; status: string; statuses: { name: string; color: string; type: string }[];
  owner: string | null; owner_name: string | null; source: string | null; organization: string | null; client_type: string | null;
  tax_client: string | null; converted: number; deal: string | null; lead: string | null; value: number | null; package: string | null;
  next_step: string | null; created: string; contact: { mobile: string | null; email: string | null }; whatsapp_opted_out: number;
  email_ready: boolean; crm_url: string; timeline: Item[]; open_tasks: Item[]; upcoming: Item[]; lost_reasons: string[];
  agents: { name: string; full_name: string }[];
}

const when = (v?: string) => (v ? new Date(v.replace(" ", "T")).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const ago = (v: string) => {
  const s = (Date.now() - new Date(v.replace(" ", "T")).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return when(v);
};
const overdue = (v?: string) => !!v && new Date(v.replace(" ", "T")).getTime() < Date.now();
const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const tomorrowAt10 = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return local(d); };

const KIND: Record<Kind, { icon: LucideIcon; tone: string; label: string }> = {
  note: { icon: NotebookPen, tone: "bg-amber-500/15 text-amber-600 dark:text-amber-400", label: "Note" },
  task: { icon: CalendarClock, tone: "bg-violet-500/15 text-violet-600 dark:text-violet-400", label: "Follow-up" },
  email: { icon: Mail, tone: "bg-sky-500/15 text-sky-600 dark:text-sky-400", label: "Email" },
  whatsapp: { icon: MessageCircle, tone: "bg-[#25D366]/15 text-[#128C7E] dark:text-[#25D366]", label: "WhatsApp" },
  event: { icon: CalendarPlus, tone: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400", label: "Meeting" },
  status: { icon: CircleDot, tone: "bg-slate-500/15 text-slate-600 dark:text-slate-300", label: "Stage" },
  created: { icon: Sparkles, tone: "bg-primary/10 text-primary", label: "Created" },
};

type Tool = "note" | "task" | "whatsapp" | "email" | "event";
const TOOLS: [Tool, string, LucideIcon][] = [["note", "Note", NotebookPen], ["task", "Follow-up", CalendarClock], ["whatsapp", "WhatsApp", MessageCircle],
  ["email", "Email", Mail], ["event", "Meeting / call", CalendarPlus]];

function Composer({ d, onDone, initial }: { d: Detail; onDone: () => void; initial?: Tool }) {
  const { me } = useAuth();
  const [tool, setTool] = useState<Tool>(initial ?? "note");
  const [f, setF] = useState({ text: "", title: "", due: tomorrowAt10(), priority: "Medium", assigned_to: me?.user ?? "", subject: "",
    category: "Call", minutes: "30" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [ok, setOk] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const ref = { doctype: d.doctype, name: d.name };
  const submit = async () => {
    setBusy(true); setErr(null); setOk(null);
    try {
      if (tool === "note") await apiCall(`${A}.add_note`, { ...ref, content: f.text });
      if (tool === "task") await apiCall(`${A}.add_task`, { ...ref, title: f.title || f.text.split("\n")[0] || "Follow up", due_date: f.due.replace("T", " "), priority: f.priority, assigned_to: f.assigned_to, description: f.text });
      if (tool === "whatsapp") await apiCall(`${A}.send_whatsapp`, { ...ref, message: f.text });
      if (tool === "email") await apiCall(`${A}.send_email`, { ...ref, subject: f.subject, message: f.text });
      if (tool === "event") await apiCall(`${A}.schedule`, { category: f.category, starts_on: f.due.replace("T", " "), subject: f.title, note: f.text, minutes: Number(f.minutes), ref_doctype: d.doctype, ref_name: d.name });
      setOk({ note: "Note added", task: "Follow-up scheduled", whatsapp: "WhatsApp sent", email: "Email sent", event: "Added to the calendar" }[tool]);
      setF({ ...f, text: "", title: "", subject: "" });
      onDone();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const blocked = tool === "whatsapp" && (!d.contact.mobile || !!d.whatsapp_opted_out) ? (!d.contact.mobile ? "No mobile number on this record." : "This person opted out of WhatsApp.")
    : tool === "email" && !d.contact.email ? "No email address on this record."
    : tool === "email" && !d.email_ready ? "Set up the outgoing email account first (Settings → Email)." : null;
  return (
    <div className="rounded-2xl border bg-card shadow-sm">
      <div className="flex gap-1 overflow-x-auto border-b px-2 pt-2">
        {TOOLS.map(([k, label, Icon]) => (
          <button key={k} onClick={() => { setTool(k); setOk(null); setErr(null); }}
            className={cn("-mb-px flex shrink-0 items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium",
              tool === k ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>
      <div className="space-y-3 p-4">
        {blocked ? <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">{blocked}</p> : <>
          {(tool === "task" || tool === "event") && (
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="field sm:col-span-2" placeholder={tool === "task" ? "What to do — e.g. Call about salary certificate" : "Subject (optional)"} value={f.title} onChange={set("title")} />
              <label className="text-xs font-medium text-muted-foreground">{tool === "task" ? "Due" : "When"}<input type="datetime-local" className="field mt-1" value={f.due} onChange={set("due")} /></label>
              {tool === "task" ? (
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs font-medium text-muted-foreground">Priority<SelectInput className="mt-1" value={f.priority} onChange={set("priority")}>{["Low", "Medium", "High"].map((p) => <option key={p}>{p}</option>)}</SelectInput></label>
                  <label className="text-xs font-medium text-muted-foreground">Assign to<SelectInput className="mt-1" value={f.assigned_to} onChange={set("assigned_to")}>{d.agents.map((a) => <option key={a.name} value={a.name}>{a.full_name}</option>)}</SelectInput></label>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs font-medium text-muted-foreground">Type<SelectInput className="mt-1" value={f.category} onChange={set("category")}>
                    {[["Call", "Call"], ["Meeting", "Meeting"], ["Event", "Reminder"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</SelectInput></label>
                  <label className="text-xs font-medium text-muted-foreground">Length<SelectInput className="mt-1" value={f.minutes} onChange={set("minutes")}>
                    {[["15", "15 min"], ["30", "30 min"], ["60", "1 hour"], ["120", "2 hours"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</SelectInput></label>
                </div>
              )}
            </div>
          )}
          {tool === "email" && <input className="field" placeholder="Subject" value={f.subject} onChange={set("subject")} />}
          <TextArea rows={tool === "note" || tool === "email" ? 4 : 2} value={f.text} onChange={set("text")}
            placeholder={{ note: "What happened? What did they say?", task: "Details (optional)", whatsapp: `Message to ${d.contact.mobile ?? ""}`, email: `Message to ${d.contact.email ?? ""}`, event: "Agenda / notes (optional)" }[tool]} />
          {tool === "whatsapp" && <p className="text-xs text-muted-foreground">Free text reaches the person only within 24 hours of their last WhatsApp message; it also appears in the team inbox.</p>}
          <div className="flex flex-wrap items-center gap-3">
            <Button loading={busy} onClick={() => void submit()}
              disabled={(tool === "note" || tool === "whatsapp") ? !f.text.trim() : tool === "email" ? !f.subject.trim() || !f.text.trim() : tool === "task" ? !(f.title.trim() || f.text.trim()) || !f.due : !f.due}>
              {!busy && <Send className="h-4 w-4" />}{{ note: "Save note", task: "Schedule follow-up", whatsapp: "Send WhatsApp", email: "Send email", event: "Add to calendar" }[tool]}
            </Button>
            {ok && <span className="flex items-center gap-1 text-sm text-emerald-600"><CheckCircle2 className="h-4 w-4" />{ok}</span>}
          </div>
        </>}
        <InlineError error={err} />
      </div>
    </div>
  );
}

function Timeline({ items, onTask, onEvent }: { items: Item[]; onTask: (id: string, status: string) => void; onEvent: (id: string, status: string) => void }) {
  if (!items.length) return <Empty title="No activity yet" />;
  return (
    <ol className="relative space-y-4 before:absolute before:start-[17px] before:top-2 before:h-[calc(100%-1rem)] before:w-px before:bg-border">
      {items.map((i, n) => {
        const k = KIND[i.kind];
        const done = i.status === "Done" || i.status === "Completed";
        return (
          <li key={`${i.kind}-${i.id ?? n}`} className="relative flex gap-3">
            <span className={cn("relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full ring-4 ring-background", k.tone)}><k.icon className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1 rounded-xl border bg-card px-3.5 py-2.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{i.kind === "event" ? i.category === "Event" ? "Reminder" : i.category : k.label}</span>
                {i.kind === "whatsapp" || i.kind === "email" ? <span>{i.direction === "Incoming" || i.direction === "Received" ? "received" : "sent"}</span> : null}
                <span>· {i.by_name ?? ""} · {ago(i.at)}</span>
                {i.status && i.kind !== "whatsapp" && i.kind !== "email" && <span className={cn("rounded-full px-1.5 py-px text-[10px] font-semibold", done ? "bg-emerald-500/15 text-emerald-600" : "bg-muted")}>{i.status}</span>}
              </div>
              {i.title && <p className={cn("mt-1 text-sm font-medium", done && "line-through opacity-60")}>{i.title}</p>}
              {i.body && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{i.body}</p>}
              {(i.kind === "task" || i.kind === "event") && i.due && (
                <p className={cn("mt-1 flex items-center gap-1 text-xs", !done && overdue(i.due) ? "font-semibold text-rose-600" : "text-muted-foreground")}>
                  <CalendarClock className="h-3.5 w-3.5" />{i.kind === "task" ? "Due" : "At"} {when(i.due)}{i.assigned_name ? ` · ${i.assigned_name}` : ""}
                </p>
              )}
              {i.kind === "task" && !done && i.status !== "Canceled" && i.id && (
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => onTask(i.id!, "Done")}><Check className="h-3.5 w-3.5" /> Done</Button>
                  <Button size="sm" variant="ghost" onClick={() => onTask(i.id!, "Canceled")}><X className="h-3.5 w-3.5" /> Cancel</Button>
                </div>
              )}
              {i.kind === "event" && i.status === "Open" && i.id && (
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => onEvent(i.id!, "Completed")}><Check className="h-3.5 w-3.5" /> Held</Button>
                  <Button size="sm" variant="ghost" onClick={() => onEvent(i.id!, "Cancelled")}><X className="h-3.5 w-3.5" /> Cancel</Button>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function CrmRecordPage({ doctype }: { doctype: "CRM Lead" | "CRM Deal" }) {
  const { name = "" } = useParams();
  const navigate = useNavigate();
  const { data: d, error, isLoading, mutate } = useApi<Detail>(`${A}.detail`, { doctype, name });
  const [err, setErr] = useState<unknown>(null);
  const [lost, setLost] = useState<string | null>(null);
  const [filter, setFilter] = useState<Kind | "all">("all");
  if (isLoading) return <Loading />;
  if (error || !d) return <div className="page-container"><ErrorState error={error} onRetry={() => void mutate()} /></div>;
  const run = (p: Promise<unknown>) => p.then(() => mutate()).catch(setErr);
  const status = d.statuses.find((s) => s.name === d.status);
  const setStatus = (s: string) => {
    if (d.doctype === "CRM Deal" && d.statuses.find((x) => x.name === s)?.type === "Lost") { setLost(d.lost_reasons[0] ?? ""); return; }
    void run(apiCall(`${A}.set_status`, { doctype, name, status: s }));
  };
  const convert = () => apiCall<string>("pakistan_tax_consultancy.api.crm.convert", { lead: name }).then((deal) => navigate(`/crm/deals/${deal}`)).catch(setErr);
  const items = d.timeline.filter((i) => filter === "all" || i.kind === filter);
  const tel = d.contact.mobile?.replace(/[^\d+]/g, "");

  return (
    <div className="page-container space-y-5">
      <Link to={doctype === "CRM Lead" ? "/crm/leads" : "/crm/pipeline"} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {doctype === "CRM Lead" ? "Leads" : "Pipeline"}</Link>

      {/* header */}
      <div className="flex flex-wrap items-start gap-4 rounded-2xl border bg-card p-5 shadow-sm">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#f3d77a] via-[#d4af37] to-[#9c7a22] text-lg font-bold text-[#141416]">
          {d.person.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}</span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{doctype === "CRM Lead" ? "Lead" : "Deal"} · {d.name}</p>
          <h1 className="text-2xl font-semibold leading-tight">{d.person}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{[d.organization !== d.person ? d.organization : null, d.client_type, d.source && `via ${d.source}`].filter(Boolean).join(" · ")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {tel && <a href={`tel:${tel}`} className="inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium hover:bg-accent"><Phone className="h-3.5 w-3.5" />{d.contact.mobile}</a>}
            {tel && <a href={`https://wa.me/${tel.replace(/\D/g, "")}`} target="_blank" rel="noopener" className="inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium text-[#128C7E] hover:bg-accent dark:text-[#25D366]"><MessageCircle className="h-3.5 w-3.5" />WhatsApp</a>}
            {d.contact.email && <a href={`mailto:${d.contact.email}`} className="inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium hover:bg-accent"><Mail className="h-3.5 w-3.5" />{d.contact.email}</a>}
          </div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-56">
          <label className="text-xs font-medium text-muted-foreground">Stage
            <div className="relative mt-1">
              <span className={cn("absolute start-3 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full", CRM_COLORS[status?.color ?? "gray"])} />
              <SelectInput className="ps-7" value={d.status} onChange={(e) => setStatus(e.target.value)}>{d.statuses.map((s) => <option key={s.name}>{s.name}</option>)}</SelectInput>
            </div></label>
          <label className="text-xs font-medium text-muted-foreground">Owner
            <SelectInput className="mt-1" value={d.owner ?? ""} onChange={(e) => void run(apiCall(`${A}.set_owner`, { doctype, name, owner: e.target.value }))}>
              <option value="">Unassigned</option>{d.agents.map((a) => <option key={a.name} value={a.name}>{a.full_name}</option>)}</SelectInput></label>
        </div>
      </div>
      <InlineError error={err} />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          <Composer d={d} onDone={() => void mutate()} />
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Activity</h2>
              <div className="flex flex-wrap gap-1">
                {(["all", "note", "task", "whatsapp", "email", "event"] as const).map((k) => (
                  <button key={k} onClick={() => setFilter(k)} className={cn("rounded-full px-2.5 py-1 text-xs font-medium",
                    filter === k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground")}>
                    {k === "all" ? "All" : KIND[k].label}</button>
                ))}
              </div>
            </div>
            <Timeline items={items}
              onTask={(id, s) => void run(apiCall(`${A}.set_task_status`, { task: id, status: s }))}
              onEvent={(id, s) => void run(apiCall(`${A}.set_event_status`, { event: id, status: s }))} />
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20">
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Next steps</p>
            {doctype === "CRM Lead" && !d.converted && <Button className="w-full" onClick={() => void convert()}><ArrowRightLeft className="h-4 w-4" /> Turn into a deal</Button>}
            {doctype === "CRM Lead" && d.deal && <Link to={`/crm/deals/${d.deal}`} className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm font-semibold text-primary"><ArrowRightLeft className="h-4 w-4" /> Open the deal →</Link>}
            {doctype === "CRM Deal" && d.lead && <Link to={`/crm/leads/${d.lead}`} className="block text-sm text-primary hover:underline">← Original lead</Link>}
            {d.tax_client && <Link to={`/staff/clients/${d.tax_client}`} className="mt-2 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300"><BadgeCheck className="h-4 w-4" /> Tax client {d.tax_client} →</Link>}
            <a href={d.crm_url} className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><ExternalLink className="h-3.5 w-3.5" /> Open in Frappe CRM</a>
          </div>
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Open follow-ups · {d.open_tasks.length}</p>
            {d.open_tasks.length ? <ul className="space-y-2">{d.open_tasks.map((t) => (
              <li key={t.id} className="flex items-start gap-2">
                <button className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border hover:border-primary" aria-label="Mark done"
                  onClick={() => void run(apiCall(`${A}.set_task_status`, { task: t.id, status: "Done" }))} />
                <div className="min-w-0"><p className="truncate text-sm">{t.title}</p>
                  <p className={cn("text-xs", overdue(t.due) ? "font-semibold text-rose-600" : "text-muted-foreground")}>{when(t.due)}{t.priority === "High" ? " · High" : ""}</p></div>
              </li>))}</ul> : <p className="text-sm text-muted-foreground">Nothing open — add a follow-up.</p>}
          </div>
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Upcoming meetings & calls</p>
            {d.upcoming.length ? <ul className="space-y-2">{d.upcoming.map((e) => (
              <li key={e.id} className="flex items-start gap-2 text-sm">{e.category === "Call" ? <PhoneCall className="mt-0.5 h-4 w-4 text-indigo-500" /> : <Users className="mt-0.5 h-4 w-4 text-indigo-500" />}
                <div><p>{e.title}</p><p className="text-xs text-muted-foreground">{when(e.due)}</p></div></li>))}</ul>
              : <p className="text-sm text-muted-foreground">None scheduled. <Link className="text-primary hover:underline" to="/crm/calendar">Calendar →</Link></p>}
          </div>
          <dl className="grid grid-cols-2 gap-3 rounded-2xl border bg-card p-4 text-sm shadow-sm">
            {doctype === "CRM Deal" && <><dt className="text-muted-foreground">Value</dt><dd className="text-end font-semibold">{money(d.value ?? 0)}</dd></>}
            {d.package && <><dt className="text-muted-foreground">Package</dt><dd className="text-end">{d.package}</dd></>}
            {d.next_step && <><dt className="text-muted-foreground">Next step</dt><dd className="text-end">{d.next_step}</dd></>}
            <dt className="text-muted-foreground">Source</dt><dd className="text-end">{d.source ?? "—"}</dd>
            <dt className="text-muted-foreground">Created</dt><dd className="text-end">{when(d.created)}</dd>
          </dl>
        </aside>
      </div>

      <Dialog open={lost !== null} onClose={() => setLost(null)} title="Why was this deal lost?"
        footer={<><Button variant="ghost" onClick={() => setLost(null)}>Cancel</Button>
          <Button onClick={() => { void run(apiCall(`${A}.set_status`, { doctype, name, status: "Lost", lost_reason: lost })); setLost(null); }}>Mark lost</Button></>}>
        <SelectInput value={lost ?? ""} onChange={(e) => setLost(e.target.value)}>{d.lost_reasons.map((r) => <option key={r}>{r}</option>)}</SelectInput>
      </Dialog>
    </div>
  );
}
