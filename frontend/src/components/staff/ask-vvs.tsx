/**
 * Ask VVS — the Ask ALYF assistant in the staff portal. A header button opens a right-hand drawer: ask about any data
 * the user may see (answers, tables, charts), or in Agent mode let it propose changes that the user approves.
 * All model output arrives as sanitised HTML from pakistan_tax_consultancy.api.ask_vvs; nothing is rendered raw here.
 */
import {
  ArrowUp, Check, ChevronDown, History, Loader2, MessageSquarePlus, Settings2, Sparkles, Square, Wand2, X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { InlineError } from "@/components/common/states";
import { useSite } from "@/components/layout/brand";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/cn";
import { useApi } from "@/lib/use-api";
import { apiCall, apiGet } from "@/services/frappe";

const A = "pakistan_tax_consultancy.api.ask_vvs";
const STORE = "ask-vvs:conversation";

interface Status { installed: boolean; has_access: boolean; can_manage: boolean; configured: boolean; enabled: boolean; agent_mode: boolean }
interface Step { label: string; status?: string }
interface FrappeChart { type?: string; title?: string; colors?: string[]; data?: { labels?: string[]; datasets?: { name?: string; values?: number[]; chartType?: string }[] } }
interface Msg { id: string; role: "user" | "assistant" | "system"; text?: string; html?: string; charts?: FrappeChart[]; steps?: Step[]; files?: { name: string; url: string }[] }
interface Pending { call_id: string; summary: string; tool: string; needs_confirmation: boolean }
interface PortalLink { label: string; to: string; desk?: boolean }
interface Conversation { name: string; title: string; messages: Msg[]; pending: Pending[]; links: PortalLink[] }
interface Job { conversation: string; user_message_id: string; job_id: string }

const PALETTE = ["#d4af37", "#2a78d6", "#1baf7a", "#eb6834", "#8b5cf6", "#dc2626", "#0ea5e9", "#64748b"];

const store = {
  get: () => { try { return localStorage.getItem(STORE); } catch { return null; } },
  set: (v: string | null) => { try { if (v) localStorage.setItem(STORE, v); else localStorage.removeItem(STORE); } catch { /* private mode */ } },
};

function suggestions(path: string): string[] {
  if (/^\/staff\/returns\/[^/]+/.test(path)) return ["Summarise this return", "Which documents are still missing?", "Explain how the tax was worked out"];
  if (/^\/staff\/clients\/[^/]+/.test(path)) return ["Summarise this client", "Show this client's returns and their status", "Any unpaid fees for this client?"];
  if (path.startsWith("/crm")) return ["How many open leads by source?", "Which deals are expected to close this month?", "List leads with no follow-up for 7 days"];
  return ["How many returns are waiting for approval?", "Chart: returns acknowledged per month this year", "Which clients have rejected documents?",
    "Top 10 clients by tax payable"];
}

// ----------------------------------------------------------------------------------------------- charts
function ChartView({ chart }: { chart: FrappeChart }) {
  const labels = chart.data?.labels ?? [];
  const sets = chart.data?.datasets ?? [];
  const colors = chart.colors?.length ? chart.colors : PALETTE;
  const rows = labels.map((label, i) => Object.fromEntries([["label", label], ...sets.map((d, j) => [d.name || `Series ${j + 1}`, Number(d.values?.[i] ?? 0)])]));
  const keys = sets.map((d, j) => d.name || `Series ${j + 1}`);
  const type = (chart.type || "bar").toLowerCase();
  const fmt = (v: number) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : String(v));
  return (
    <figure className="rounded-xl border bg-background/70 p-3">
      {chart.title && <figcaption className="mb-2 text-xs font-semibold text-muted-foreground">{chart.title}</figcaption>}
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          {type === "pie" || type === "donut" || type === "percentage" ? (
            <PieChart>
              <Pie data={labels.map((l, i) => ({ name: l, value: Number(sets[0]?.values?.[i] ?? 0) }))} dataKey="value" nameKey="name"
                innerRadius={type === "pie" ? 0 : 48} outerRadius={80} paddingAngle={1}>
                {labels.map((l, i) => <Cell key={l} fill={colors[i % colors.length]} />)}
              </Pie>
              <Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          ) : type === "line" || type === "axis-mixed" && sets.every((d) => d.chartType === "line") ? (
            <LineChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.4} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} tickFormatter={fmt} width={44} />
              <Tooltip />{keys.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
              {keys.map((k, j) => <Line key={k} type="monotone" dataKey={k} stroke={colors[j % colors.length]} strokeWidth={2} dot={false} />)}
            </LineChart>
          ) : (
            <BarChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.4} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} tickFormatter={fmt} width={44} />
              <Tooltip />{keys.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
              {keys.map((k, j) => <Bar key={k} dataKey={k} fill={colors[j % colors.length]} radius={[4, 4, 0, 0]} />)}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

// ----------------------------------------------------------------------------------------------- messages
function Steps({ steps, live }: { steps: Step[]; live?: boolean }) {
  const [open, setOpen] = useState(!!live);
  if (!steps.length) return null;
  return (
    <div className="text-xs">
      <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground">
        {live ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 text-emerald-500" />}
        {live ? steps[steps.length - 1]?.label || "Working…" : `${steps.length} step${steps.length === 1 ? "" : "s"}`}
        {!live && <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />}
      </button>
      {(open || live) && (
        <ol className="mt-1.5 space-y-0.5 border-s ps-3 text-muted-foreground">
          {steps.map((s, i) => <li key={i} className="truncate">{s.label}</li>)}
        </ol>
      )}
    </div>
  );
}

function Bubble({ m }: { m: Msg }) {
  if (m.role === "user") {
    return <div className="ms-10 self-end whitespace-pre-wrap rounded-2xl rounded-ee-md bg-primary px-3.5 py-2 text-sm text-primary-foreground shadow-sm">{m.text}</div>;
  }
  if (m.role === "system") {
    return m.files?.length ? <p className="self-center text-xs text-muted-foreground">📎 {m.files.map((f) => f.name).join(", ")}</p> : null;
  }
  return (
    <div className="me-4 space-y-2">
      {!!m.steps?.length && <Steps steps={m.steps} />}
      {/* sanitised on the server (api/ask_vvs.py _html) */}
      <div className="ask-html rounded-2xl rounded-es-md border bg-card px-3.5 py-2.5 text-sm shadow-sm" dangerouslySetInnerHTML={{ __html: m.html || "" }} />
      {m.charts?.map((c, i) => <ChartView key={i} chart={c} />)}
    </div>
  );
}

// ----------------------------------------------------------------------------------------------- drawer
function Drawer({ status, onClose }: { status: Status; onClose: () => void }) {
  const { pathname } = useLocation();
  const path = pathname.replace(/^\/portal/, "");
  const { data: site } = useSite();
  const [conv, setConv] = useState<Conversation | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"Ask" | "Agent">("Ask");
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const history = useApi<{ name: string; title: string; modified: string }[]>(showHistory ? `${A}.conversations` : null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const open = useCallback(async (name?: string | null) => {
    setErr(null);
    try {
      const c = await apiGet<Conversation>(`${A}.open_conversation`, name ? { conversation: name } : undefined);
      setConv(c);
      store.set(c.name);
    } catch (e) {
      if (name) { store.set(null); void open(null); } else setErr(e);
    }
  }, []);

  useEffect(() => { void open(store.get()); }, [open]);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }); }, [conv?.messages.length, steps.length, job]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  // poll the background run until the answer lands
  useEffect(() => {
    if (!job) return;
    let alive = true;
    let misses = 0;
    const tick = async () => {
      if (!alive) return;
      try {
        const r = await apiGet<{ status: string; steps?: Step[]; conversation?: Conversation }>(`${A}.poll`, { ...job, mode });
        if (!alive) return;
        if (r.status === "pending") { setSteps(r.steps ?? []); misses = 0; }
        else if (r.status === "completed" && r.conversation) { setConv(r.conversation); setJob(null); setSteps([]); return; }
        else if (r.status === "missing" && ++misses < 8) { /* job not picked up yet */ }
        else { setErr(new Error(r.status === "failed" ? "Ask VVS could not finish this answer. Try again or rephrase." : "The answer was lost — is the background worker running?")); setJob(null); setSteps([]); void open(job.conversation); return; }
      } catch (e) { if (++misses > 8) { setErr(e); setJob(null); return; } }
      setTimeout(tick, 1200);
    };
    const t = setTimeout(tick, 900);
    return () => { alive = false; clearTimeout(t); };
  }, [job, mode, open]);

  async function send(message: string) {
    const msg = message.trim();
    if (!msg || job || !conv) return;
    setErr(null);
    setText("");
    setConv({ ...conv, messages: [...conv.messages, { id: `local-${Date.now()}`, role: "user", text: msg }], pending: [], links: [] });
    try {
      const r = await apiCall<Job & { conversation: string }>(`${A}.send`, { message: msg, conversation: conv.name, mode, path });
      setJob({ conversation: r.conversation, user_message_id: r.user_message_id, job_id: r.job_id });
    } catch (e) { setErr(e); void open(conv.name); }
  }

  async function decide(p: Pending, approve: boolean) {
    if (!conv) return;
    setBusy(true);
    setErr(null);
    try { setConv(await apiCall<Conversation>(`${A}.decide`, { conversation: conv.name, call_id: p.call_id, approve: approve ? 1 : 0, mode: "Agent" })); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  }

  const empty = conv && !conv.messages.some((m) => m.role !== "system");
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Ask VVS">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px] sm:bg-black/20" onClick={onClose} aria-hidden />
      <section className="relative flex h-full w-full flex-col border-s bg-background shadow-2xl sm:w-[460px]">
        {/* header */}
        <header className="flex items-center gap-3 border-b bg-gradient-to-br from-[#d4af37]/15 via-[#d4af37]/5 to-transparent px-4 py-3">
          {site?.logo ? <img src={site.logo} alt="" className="h-9 w-9 rounded-xl object-contain" />
            : <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[#f3d77a] to-[#b8912a] text-[#141416]"><Sparkles className="h-5 w-5" /></span>}
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-1.5 text-base font-semibold">Ask VVS <Sparkles className="h-3.5 w-3.5 text-[#d4af37]" /></h2>
            <p className="truncate text-[11px] text-muted-foreground">{conv && !empty ? conv.title : "AI assistant · answers only from data you can see"}</p>
          </div>
          <button type="button" className="rounded-lg p-2 text-muted-foreground hover:bg-accent" title="Earlier chats" aria-label="Earlier chats"
            onClick={() => setShowHistory(!showHistory)}><History className="h-4 w-4" /></button>
          <button type="button" className="rounded-lg p-2 text-muted-foreground hover:bg-accent" title="New chat" aria-label="New chat" disabled={!!job}
            onClick={async () => { setShowHistory(false); try { const c = await apiCall<Conversation>(`${A}.new_conversation`); setConv(c); store.set(c.name); } catch (e) { setErr(e); } }}>
            <MessageSquarePlus className="h-4 w-4" /></button>
          <button type="button" className="rounded-lg p-2 text-muted-foreground hover:bg-accent" aria-label="Close" onClick={onClose}><X className="h-4 w-4" /></button>
        </header>

        {showHistory && (
          <div className="max-h-72 overflow-y-auto border-b bg-muted/30 p-2">
            {!history.data?.length ? <p className="p-3 text-sm text-muted-foreground">{history.isLoading ? "Loading…" : "No earlier chats."}</p> : history.data.map((h) => (
              <button key={h.name} type="button" disabled={!!job} onClick={() => { setShowHistory(false); void open(h.name); }}
                className={cn("block w-full truncate rounded-lg px-3 py-2 text-start text-sm hover:bg-accent", h.name === conv?.name && "bg-accent font-medium")}>
                {h.title}<span className="block text-[11px] text-muted-foreground">{new Date(h.modified).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>
              </button>
            ))}
          </div>
        )}

        {/* messages */}
        <div ref={listRef} className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
          {!conv && !err && <div className="m-auto"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
          {empty && (
            <div className="my-auto space-y-4 text-center">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[#f3d77a] via-[#d4af37] to-[#9c7a22] text-[#141416] shadow-lg shadow-[#d4af37]/30">
                <Sparkles className="h-7 w-7" /></span>
              <div>
                <p className="text-lg font-semibold">How can I help?</p>
                <p className="mx-auto max-w-xs text-sm text-muted-foreground">Ask about clients, returns, documents, payments or CRM — I only read what your role may see.</p>
              </div>
              <div className="flex flex-col gap-2">
                {suggestions(path).map((s) => (
                  <button key={s} type="button" onClick={() => void send(s)}
                    className="rounded-xl border bg-card px-3 py-2 text-start text-sm transition hover:border-primary/50 hover:bg-primary/5">{s}</button>
                ))}
              </div>
            </div>
          )}
          {conv?.messages.map((m) => <Bubble key={m.id} m={m} />)}
          {job && (
            <div className="me-4 rounded-2xl rounded-es-md border bg-card px-3.5 py-2.5 shadow-sm">
              <Steps steps={steps.length ? steps : [{ label: "Thinking…" }]} live />
            </div>
          )}
          {!job && conv?.pending.map((p) => (
            <div key={p.call_id} className="me-4 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
              <p className="flex items-center gap-1.5 font-semibold"><Wand2 className="h-4 w-4 text-amber-600" /> Proposed change</p>
              <p className="mt-1 text-muted-foreground">{p.summary}</p>
              <div className="mt-2.5 flex gap-2">
                <button type="button" disabled={busy} onClick={() => void decide(p, true)}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60">Approve</button>
                <button type="button" disabled={busy} onClick={() => void decide(p, false)}
                  className="rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-accent disabled:opacity-60">Reject</button>
              </div>
            </div>
          ))}
          {!job && !!conv?.links.length && (
            <div className="flex flex-wrap gap-2">
              {conv.links.map((l) => l.desk
                ? <a key={l.to} href={l.to} target="_blank" rel="noreferrer" className="rounded-full border px-3 py-1 text-xs font-semibold hover:bg-accent">{l.label} ↗</a>
                : <Link key={l.to} to={l.to} onClick={onClose} className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/15">Open {l.label} →</Link>)}
            </div>
          )}
          <InlineError error={err} />
        </div>

        {/* composer */}
        <form className="border-t bg-background p-3" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
          <div className="rounded-2xl border bg-card p-2 shadow-sm focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20">
            <textarea ref={inputRef} rows={2} value={text} onChange={(e) => setText(e.target.value)} disabled={!conv}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(text); } }}
              placeholder={mode === "Agent" ? "Ask, or tell me what to change…" : "Ask about your clients, returns, documents…"}
              className="max-h-40 w-full resize-none bg-transparent px-1.5 py-1 text-sm outline-none placeholder:text-muted-foreground" />
            <div className="flex items-center gap-2">
              {status.agent_mode && (
                <div className="flex rounded-lg bg-muted p-0.5 text-[11px] font-semibold" role="radiogroup" aria-label="Mode">
                  {(["Ask", "Agent"] as const).map((m) => (
                    <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} disabled={!!job}
                      className={cn("rounded-md px-2.5 py-1 transition", mode === m ? "bg-background shadow-sm" : "text-muted-foreground")}>{m}</button>
                  ))}
                </div>
              )}
              <p className="flex-1 truncate text-[10px] text-muted-foreground">{mode === "Agent" ? "Changes need your approval" : "Read-only · answers may be wrong — check key figures"}</p>
              {job ? (
                <button type="button" aria-label="Stop" title="Stop" onClick={() => void apiCall(`${A}.stop`, { ...job }).catch(setErr)}
                  className="grid h-8 w-8 place-items-center rounded-lg bg-foreground text-background"><Square className="h-3.5 w-3.5" /></button>
              ) : (
                <button type="submit" aria-label="Send" disabled={!text.trim() || !conv}
                  className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground transition disabled:opacity-40"><ArrowUp className="h-4 w-4" /></button>
              )}
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}

function Unavailable({ status, onClose, onGranted }: { status: Status; onClose: () => void; onGranted: () => void }) {
  const { me } = useAuth();
  const [err, setErr] = useState<unknown>(null);
  const needsSetup = !status.configured || !status.enabled;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Ask VVS">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} aria-hidden />
      <section className="relative flex h-full w-full flex-col border-s bg-background p-6 shadow-2xl sm:w-[460px]">
        <button type="button" className="absolute end-3 top-3 rounded-lg p-2 text-muted-foreground hover:bg-accent" aria-label="Close" onClick={onClose}><X className="h-4 w-4" /></button>
        <div className="my-auto space-y-4 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[#f3d77a] via-[#d4af37] to-[#9c7a22] text-[#141416]"><Sparkles className="h-7 w-7" /></span>
          <h2 className="text-lg font-semibold">Ask VVS</h2>
          {needsSetup ? (
            <p className="text-sm text-muted-foreground">The assistant needs an AI provider before it can answer.
              {status.can_manage ? " Open Ask ALYF Settings in Desk, tick Enabled and add a provider, API key and model." : " Ask your admin to set it up."}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Ask VVS is not switched on for your account.{status.can_manage ? "" : " Ask your admin to turn it on for you on the Team page."}</p>
          )}
          <InlineError error={err} />
          <div className="flex justify-center gap-2">
            {status.can_manage && needsSetup && (
              <a href="/app/ask-alyf-settings" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
                <Settings2 className="h-4 w-4" /> Open settings</a>
            )}
            {status.can_manage && !status.has_access && me?.user && (
              <button type="button" onClick={() => apiCall(`${A}.set_access`, { user: me.user, enabled: 1 }).then(onGranted).catch(setErr)}
                className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-accent">Give me access</button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

/** Header button + drawer. Hidden when the app is not installed, or for staff without access when they cannot manage it. */
export function AskVvs() {
  const { data: status, mutate } = useApi<Status>(`${A}.status`, undefined, { revalidateIfStale: false });
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") { e.preventDefault(); setOpen((o) => !o); } };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  if (!status?.installed || (!status.has_access && !status.can_manage)) return null;
  const ready = status.has_access && status.configured && status.enabled;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title="Ask VVS (Ctrl+J)"
        className="me-1 hidden items-center gap-1.5 rounded-full bg-gradient-to-r from-[#f3d77a] via-[#d4af37] to-[#b8912a] px-3 py-1.5 text-xs font-bold text-[#141416] shadow-sm shadow-[#d4af37]/30 transition hover:brightness-105 sm:inline-flex">
        <Sparkles className="h-3.5 w-3.5" /> Ask VVS
      </button>
      <button type="button" onClick={() => setOpen(true)} aria-label="Ask VVS" className="rounded-lg p-2 text-[#b8912a] hover:bg-accent sm:hidden"><Sparkles className="h-5 w-5" /></button>
      {/* portalled to <body>: the header's backdrop-blur would otherwise trap position:fixed inside the header */}
      {open && createPortal(ready ? <Drawer status={status} onClose={() => setOpen(false)} />
        : <Unavailable status={status} onClose={() => setOpen(false)} onGranted={() => void mutate()} />, document.body)}
    </>
  );
}
