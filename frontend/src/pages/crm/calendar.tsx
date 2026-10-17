/**
 * Activity calendar (ported from the wise site's CRM CalendarPage): month grid of meetings, calls and reminders
 * (Event) plus CRM follow-ups (CRM Task), and a "Schedule an activity" panel linked to a lead, deal or client.
 */
import { CalendarDays, CalendarPlus, Check, ChevronLeft, ChevronRight, Link2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { InlineError } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { SelectInput } from "@/components/ui/field";
import { RichTextEditor } from "@/components/forms/rich-text-editor";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/cn";
import { useApi } from "@/lib/use-api";
import { apiCall } from "@/services/frappe";

const A = "pakistan_tax_consultancy.api.crm_activity";
const CATEGORIES = [["Meeting", "Meeting"], ["Call", "Call"], ["Event", "Reminder"], ["Other", "Other"]] as const;
const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const BAR: Record<string, string> = { Meeting: "bg-amber-500", Call: "bg-sky-500", Event: "bg-indigo-500", Other: "bg-slate-400", "Follow-up": "bg-violet-500" };

interface Activity { id: string; kind: "event" | "task"; category: string; title: string; start: string; status: string; priority?: string; note?: string;
  who?: string; ref_doctype?: string | null; ref_name?: string | null; ref_label?: string | null }

const ymd = (d: Date) => `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
const parse = (v?: string) => (v ? new Date(v.replace(" ", "T")) : undefined);
const hhmm = (v?: string) => { const d = parse(v); return d ? `${`${d.getHours()}`.padStart(2, "0")}:${`${d.getMinutes()}`.padStart(2, "0")}` : ""; };
/** Monday-first 6-week grid containing every day of the month. */
function monthGrid(view: Date) {
  const first = new Date(view.getFullYear(), view.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
}
const refPath = (a: Activity) => a.ref_doctype === "CRM Lead" ? `/crm/leads/${a.ref_name}` : a.ref_doctype === "CRM Deal" ? `/crm/deals/${a.ref_name}`
  : a.ref_doctype === "Tax Client" ? `/staff/clients/${a.ref_name}` : null;
const closed = (a: Activity) => ["Done", "Completed", "Canceled", "Cancelled", "Closed"].includes(a.status);

export function CrmCalendarPage() {
  const today = ymd(new Date());
  const [view, setView] = useState(() => new Date(`${today}T00:00:00`));
  const [selected, setSelected] = useState(today);
  const [mine, setMine] = useState(false);
  const cells = useMemo(() => monthGrid(view), [view]);
  const { data, mutate } = useApi<Activity[]>(`${A}.calendar`, { start: ymd(cells[0]), end: ymd(cells[41]), mine: mine ? 1 : 0 });
  const [q, setQ] = useState("");
  const options = useApi<{ doctype: string; name: string; label: string }[]>(`${A}.link_options`, { q: q || undefined });
  const [f, setF] = useState({ category: "Meeting", date: today, time: "10:00", minutes: "60", linked: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [ok, setOk] = useState<string | null>(null);

  const byDay = useMemo(() => {
    const map: Record<string, Activity[]> = {};
    for (const a of data ?? []) { const d = parse(a.start); if (d) (map[ymd(d)] ??= []).push(a); }
    Object.values(map).forEach((l) => l.sort((a, b) => a.start.localeCompare(b.start)));
    return map;
  }, [data]);
  const list = byDay[selected] ?? [];
  const shift = (n: number) => { const d = new Date(view); d.setMonth(d.getMonth() + n); setView(d); };

  const schedule = async () => {
    setBusy(true); setErr(null); setOk(null);
    const [ref_doctype, ref_name] = f.linked ? f.linked.split("::") : [undefined, undefined];
    try {
      await apiCall(`${A}.schedule`, { category: f.category, starts_on: `${f.date} ${f.time}:00`, note: f.note, minutes: Number(f.minutes), ref_doctype, ref_name });
      setOk("Activity scheduled"); setF({ ...f, note: "" }); setSelected(f.date); void mutate();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const mark = (a: Activity, status: string) => apiCall(a.kind === "task" ? `${A}.set_task_status` : `${A}.set_event_status`,
    a.kind === "task" ? { task: a.id, status } : { event: a.id, status }).then(() => mutate()).catch(setErr);

  return (
    <div className="page-container space-y-5">
      <PageHeader title="Activity calendar" subtitle="Meetings, calls, reminders and follow-ups" icon={<CalendarDays className="h-5 w-5" />}
        actions={<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Mine only</label>} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-base font-semibold">{view.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</h2>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="outline" size="sm" onClick={() => { setView(new Date(`${today}T00:00:00`)); setSelected(today); }}>Today</Button>
              <Button variant="outline" size="sm" onClick={() => shift(1)} aria-label="Next month"><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
          <div className="grid grid-cols-7 border-b bg-muted/50">
            {WEEKDAYS.map((d) => <div key={d} className="px-2 py-2 text-[11px] font-semibold tracking-wider text-muted-foreground">{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((d) => {
              const key = ymd(d);
              const items = byDay[key] ?? [];
              const inMonth = d.getMonth() === view.getMonth();
              return (
                <button key={key} type="button" onClick={() => { setSelected(key); setF((x) => ({ ...x, date: key })); }}
                  className={cn("flex min-h-[96px] flex-col items-stretch gap-1 border-b border-r p-1.5 text-start transition-colors hover:bg-muted/40",
                    !inMonth && "bg-muted/20 text-muted-foreground/60", key === selected && "bg-primary/5 ring-1 ring-inset ring-primary/40")}>
                  <span className={cn("flex h-6 w-6 items-center justify-center rounded-md text-xs font-semibold", key === today ? "bg-foreground text-background" : "")}>{d.getDate()}</span>
                  {items.slice(0, 3).map((a) => (
                    <span key={a.kind + a.id} className={cn("flex items-center gap-1 overflow-hidden rounded bg-muted/70 px-1 py-0.5 text-[10.5px] leading-tight", closed(a) && "opacity-50 line-through")}>
                      <span className={cn("h-3 w-[3px] shrink-0 rounded-full", BAR[a.category] ?? "bg-slate-400")} />
                      <span className="truncate"><span className="font-semibold">{hhmm(a.start)}</span> {a.title}</span>
                    </span>
                  ))}
                  {items.length > 3 && <span className="px-1 text-[10px] font-medium text-muted-foreground">+{items.length - 3} more</span>}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-3 border-t px-4 py-2 text-xs text-muted-foreground">
            {Object.entries(BAR).map(([k, c]) => <span key={k} className="flex items-center gap-1.5"><span className={cn("h-2 w-2 rounded-full", c)} />{k === "Event" ? "Reminder" : k}</span>)}
          </div>
        </div>

        <aside className="space-y-5">
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Schedule an activity</h3>
            <div className="space-y-3">
              <label className="block text-xs font-medium text-muted-foreground">Type
                <SelectInput className="mt-1" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
                  {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</SelectInput></label>
              <div className="grid grid-cols-3 gap-2">
                <label className="col-span-2 text-xs font-medium text-muted-foreground">Date<input type="date" className="field mt-1" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
                <label className="text-xs font-medium text-muted-foreground">Time<input type="time" className="field mt-1" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></label>
              </div>
              <label className="block text-xs font-medium text-muted-foreground"><span className="flex items-center gap-1"><Link2 className="h-3 w-3" /> Linked to</span>
                <input className="field mt-1 h-8 text-xs" placeholder="Search lead, deal or client" value={q} onChange={(e) => setQ(e.target.value)} />
                <SelectInput className="mt-1" value={f.linked} onChange={(e) => setF({ ...f, linked: e.target.value })}>
                  <option value="">Nothing linked</option>
                  {(options.data ?? []).map((o) => <option key={o.doctype + o.name} value={`${o.doctype}::${o.name}`}>{o.label}</option>)}
                </SelectInput></label>
              <label className="block text-xs font-medium text-muted-foreground">Note
                <div className="mt-1"><RichTextEditor value={f.note} onChange={(html) => setF((x) => ({ ...x, note: html }))} minHeight={110} placeholder="Agenda, next step, reminder text" /></div></label>
              {ok && <p className="text-xs font-medium text-emerald-600">{ok}</p>}
              <InlineError error={err} />
              <Button className="w-full" loading={busy} onClick={() => void schedule()}>{!busy && <CalendarPlus className="h-4 w-4" />} Schedule activity</Button>
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {new Date(`${selected}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long" })} · {list.length} {list.length === 1 ? "activity" : "activities"}
            </h3>
            {!list.length ? <p className="py-4 text-center text-sm text-muted-foreground">Nothing scheduled for this day</p> : (
              <ul className="divide-y">
                {list.map((a) => {
                  const path = refPath(a);
                  return (
                    <li key={a.kind + a.id} className="py-2.5 first:pt-0 last:pb-0">
                      <p className={cn("text-sm font-semibold", closed(a) && "line-through opacity-60")}>{a.title}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <span className={cn("h-2 w-2 rounded-full", BAR[a.category] ?? "bg-slate-400")} />
                        {a.category === "Event" ? "Reminder" : a.category} · {hhmm(a.start)}{a.who ? ` · ${a.who}` : ""}
                        {path && <Link className="text-primary hover:underline" to={path}>· {a.ref_label}</Link>}
                      </p>
                      {!closed(a) && (
                        <div className="mt-1.5 flex gap-1.5">
                          <Button size="sm" variant="outline" onClick={() => void mark(a, a.kind === "task" ? "Done" : "Completed")}><Check className="h-3.5 w-3.5" /> Done</Button>
                          <Button size="sm" variant="ghost" onClick={() => void mark(a, a.kind === "task" ? "Canceled" : "Cancelled")}><X className="h-3.5 w-3.5" /> Cancel</Button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
