/**
 * Team WhatsApp inbox (ported from the realestate app): views Mine / Unassigned / Unread / All / Resolved, the thread with
 * delivery ticks, reply box with /quick replies and attachments, assignment, resolve / reopen, opt-out.
 * Polls every few seconds. In test mode, "Simulate client reply" injects a message through the real webhook code.
 */
import { Ban, Check, CheckCheck, CheckCircle2, Clock, ExternalLink, FlaskConical, MessageCircle, Paperclip, RotateCcw, Search, Send, TriangleAlert, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { StateBadge } from "@/components/common/state-badge";
import { Empty, InlineError, Loading } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { SelectInput, TextArea } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { useApi } from "@/lib/use-api";
import { apiCall, apiUpload } from "@/services/frappe";

const W = "pakistan_tax_consultancy.api.whatsapp";
interface Conversation { name: string; contact_name: string; phone: string; tax_client: string | null; lead: string | null; agent: string | null;
  status: string; unread_count: number; last_message: string | null; last_message_at: string | null; last_direction: string | null; opted_out: number }
interface Message { name: string; direction: "Incoming" | "Outgoing"; message: string; status: string | null; at: string; file_url?: string; file_name?: string; error?: string; agent?: string | null }
interface Ctx { mock: boolean; wa_link: string; client: { name: string; client_name: string; client_type: string } | null; returns: { name: string; tax_year: string; workflow_state: string }[] }
type View = "mine" | "unassigned" | "unread" | "all" | "resolved";
const VIEWS: [View, string][] = [["mine", "Mine"], ["unassigned", "Unassigned"], ["unread", "Unread"], ["all", "All open"], ["resolved", "Resolved"]];

const initials = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
const at = (v: string | null) => (v ? new Date(v.replace(" ", "T")).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }) : "");

function Ticks({ status }: { status: string | null }) {
  const s = status?.toLowerCase();
  if (s === "read") return <CheckCheck className="h-3.5 w-3.5 text-sky-300" />;
  if (s === "delivered") return <CheckCheck className="h-3.5 w-3.5 opacity-70" />;
  if (s === "sent") return <Check className="h-3.5 w-3.5 opacity-70" />;
  if (s === "failed") return <TriangleAlert className="h-3.5 w-3.5 text-red-200" />;
  return <Clock className="h-3.5 w-3.5 opacity-60" />;
}

function Thread({ conv, agents, onChanged }: { conv: Conversation; agents: { name: string; full_name: string }[]; onChanged: () => void }) {
  const { data: msgs, mutate } = useApi<Message[]>(`${W}.get_thread`, { conversation: conv.name }, { refreshInterval: 4000 });
  const { data: ctx } = useApi<Ctx>(`${W}.get_context`, { conversation: conv.name });
  const { data: replies } = useApi<{ title: string; shortcut: string; message: string }[]>(`${W}.quick_replies`);
  const [text, setText] = useState("");
  const [quick, setQuick] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [simOpen, setSimOpen] = useState(false);
  const [simText, setSimText] = useState("Assalam o Alaikum, what documents do I still need to send?");
  const bottom = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (conv.unread_count) void apiCall(`${W}.mark_read`, { conversation: conv.name }).then(onChanged); }, [conv.name, conv.unread_count]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [msgs?.length, conv.name]);
  const refresh = () => { void mutate(); onChanged(); };
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try { await fn(); refresh(); } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const matches = (replies ?? []).filter((r) => !text.startsWith("/") || `/${r.shortcut.replace(/^\//, "")}`.startsWith(text.toLowerCase())
    || r.title.toLowerCase().includes(text.slice(1).toLowerCase()));
  const sendText = () => text.trim() && run(async () => { await apiCall(`${W}.send`, { conversation: conv.name, message: text }); setText(""); });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b bg-card px-4 py-3">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-[#128C7E] text-sm font-bold text-white">{initials(conv.contact_name)}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{conv.contact_name}</p>
          <p className="truncate text-xs text-muted-foreground" dir="ltr">+{conv.phone}
            {ctx?.client && <> · <Link className="text-primary hover:underline" to={`/staff/clients/${ctx.client.name}`}>{ctx.client.name}</Link></>}
            {!ctx?.client && conv.lead && <> · Lead {conv.lead}</>}
          </p>
        </div>
        <SelectInput aria-label="Assigned to" className="h-9 w-44" value={conv.agent ?? ""}
          onChange={(e) => void run(() => apiCall(`${W}.assign`, { conversation: conv.name, agent: e.target.value }))}>
          <option value="">Unassigned</option>{agents.map((a) => <option key={a.name} value={a.name}>{a.full_name}</option>)}
        </SelectInput>
        {ctx?.wa_link && <a href={ctx.wa_link} target="_blank" rel="noopener" className="inline-flex h-8 items-center gap-1 rounded-md border px-3 text-xs hover:bg-accent"><ExternalLink className="h-3.5 w-3.5" /> wa.me</a>}
        {conv.status === "Open"
          ? <Button size="sm" variant="success" onClick={() => void run(() => apiCall(`${W}.assign`, { conversation: conv.name, status: "Resolved" }))}><CheckCircle2 className="h-4 w-4" /> Resolve</Button>
          : <Button size="sm" variant="outline" onClick={() => void run(() => apiCall(`${W}.assign`, { conversation: conv.name, status: "Open" }))}><RotateCcw className="h-4 w-4" /> Reopen</Button>}
      </div>
      {ctx?.returns?.length ? (
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-4 py-2 text-xs">
          {ctx.returns.map((r) => <Link key={r.name} to={`/staff/returns/${r.name}`} className="flex items-center gap-1.5 hover:underline">TY{r.tax_year} <StateBadge state={r.workflow_state} /></Link>)}
        </div>
      ) : null}
      {conv.opted_out ? (
        <div className="flex items-center justify-between gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm">
          <span className="flex items-center gap-2"><Ban className="h-4 w-4" /> Opted out — automatic updates skip this number.</span>
          <Button size="sm" variant="outline" onClick={() => void run(() => apiCall(`${W}.set_opted_out`, { conversation: conv.name, opted_out: 0 }))}>Opt back in</Button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-[radial-gradient(circle_at_1px_1px,hsl(var(--muted))_1px,transparent_0)] bg-[length:18px_18px] px-4 py-4">
        {!msgs && <Loading />}
        {msgs?.map((m) => {
          const out = m.direction === "Outgoing";
          return (
            <div key={m.name} className={cn("flex", out ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm", out ? "rounded-ee-sm bg-[#128C7E] text-white" : "rounded-es-sm border bg-card")}>
                <p className="whitespace-pre-wrap break-words">{m.message}</p>
                {m.file_url && (/\.(png|jpe?g|webp|gif)$/i.test(m.file_url)
                  ? <a href={m.file_url} target="_blank" rel="noopener" className="mt-1 block"><img src={m.file_url} alt={m.file_name ?? ""} className="max-h-56 rounded-lg" loading="lazy" /></a>
                  : <a href={m.file_url} target="_blank" rel="noopener" className="mt-1 block truncate text-xs underline">📎 {m.file_name ?? "attachment"}</a>)}
                {m.error && <p className="mt-1 text-xs text-red-200">⚠ {m.error}</p>}
                <p className={cn("mt-1 flex items-center justify-end gap-1 text-[10px]", out ? "text-white/75" : "text-muted-foreground")}>
                  {m.agent && <span>{m.agent} ·</span>}{at(m.at)}{out && <Ticks status={m.status} />}
                </p>
              </div>
            </div>
          );
        })}
        {msgs && !msgs.length && <Empty title="No messages yet" hint="WhatsApp lets you reply freely within 24 hours of the client's last message; after that use an approved template." />}
        <div ref={bottom} />
      </div>

      <div className="relative border-t bg-card p-3">
        {quick && matches.length > 0 && (
          <div className="absolute inset-x-3 bottom-full mb-2 max-h-60 overflow-y-auto rounded-xl border bg-popover shadow-xl">
            {matches.map((r) => (
              <button key={r.title} type="button" className="block w-full px-3 py-2 text-start text-sm hover:bg-accent" onClick={() => { setText(r.message); setQuick(false); }}>
                <span className="font-medium">/{r.shortcut?.replace(/^\//, "")}</span> <span className="text-muted-foreground">{r.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{r.message}</span>
              </button>
            ))}
          </div>
        )}
        <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void sendText(); }}>
          <Button type="button" size="icon" variant="outline" title="Quick replies (type /)" onClick={() => setQuick((q) => !q)}><Zap className="h-4 w-4" /></Button>
          <input ref={fileRef} type="file" className="hidden" accept="image/*,application/pdf"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void run(async () => {
              const up = await apiUpload<{ file_url: string }>("upload_file", f, { is_private: "1", folder: "Home/Attachments" });
              await apiCall(`${W}.send`, { conversation: conv.name, attach: up.file_url, message: text }); setText(""); }); }} />
          <Button type="button" size="icon" variant="outline" title="Send a document or image" disabled={!!conv.opted_out || busy} onClick={() => fileRef.current?.click()}><Paperclip className="h-4 w-4" /></Button>
          <TextArea aria-label="Message" rows={1} className="max-h-32 min-h-[40px] flex-1 resize-none" disabled={!!conv.opted_out}
            placeholder={conv.opted_out ? "Client opted out" : "Message · type / for quick replies"} value={text}
            onChange={(e) => { setText(e.target.value); setQuick(e.target.value.startsWith("/")); }}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.shiftKey) return;
              e.preventDefault();
              if (quick && matches[0]) { setText(matches[0].message); setQuick(false); } else void sendText();
            }} />
          <Button type="submit" size="icon" loading={busy} disabled={!text.trim() || !!conv.opted_out} aria-label="Send">{!busy && <Send className="h-4 w-4" />}</Button>
        </form>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          {!conv.opted_out && <Button size="sm" variant="ghost" onClick={() => void run(() => apiCall(`${W}.set_opted_out`, { conversation: conv.name, opted_out: 1 }))}><Ban className="h-3.5 w-3.5" /> Mark opted out</Button>}
          {ctx?.mock && <Button size="sm" variant="ghost" className="ms-auto" onClick={() => setSimOpen(true)}><FlaskConical className="h-3.5 w-3.5" /> Simulate client reply (test mode)</Button>}
        </div>
        <InlineError error={err} />
      </div>
      <Dialog open={simOpen} onClose={() => setSimOpen(false)} title="Simulate a client message"
        footer={<><Button variant="ghost" onClick={() => setSimOpen(false)}>Cancel</Button>
          <Button loading={busy} onClick={() => void run(async () => { await apiCall(`${W}.simulate_incoming`, { phone: conv.phone, text: simText, name: conv.contact_name }); setSimOpen(false); })}>Simulate</Button></>}>
        <p className="mb-2 text-sm text-muted-foreground">Test mode only: this goes through the same code a real WhatsApp message would.</p>
        <TextArea aria-label="Message" value={simText} onChange={(e) => setSimText(e.target.value)} />
      </Dialog>
    </div>
  );
}

export function InboxPage() {
  const [params, setParams] = useSearchParams();
  const view = (params.get("view") as View) || "mine";
  const selected = params.get("c");
  const [search, setSearch] = useState("");
  const counts = useApi<Record<string, number>>(`${W}.get_counts`, undefined, { refreshInterval: 10_000 });
  const convs = useApi<Conversation[]>(`${W}.get_conversations`, { view, search: search || undefined, limit: 200 }, { refreshInterval: 8000 });
  const picked = useApi<Conversation[]>(selected && !convs.data?.some((c) => c.name === selected) ? `${W}.get_conversations` : null,
    { view: "everything", search: selected ?? undefined, limit: 1 });
  const { data: agents } = useApi<{ name: string; full_name: string }[]>(`${W}.agents`);
  const conv = useMemo(() => convs.data?.find((c) => c.name === selected) ?? picked.data?.find((c) => c.name === selected), [convs.data, picked.data, selected]);
  const set = (k: string, v: string | null) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }); };
  const agentName = (u: string | null) => agents?.find((a) => a.name === u)?.full_name ?? u;
  const refresh = () => { void convs.mutate(); void counts.mutate(); };

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold"><MessageCircle className="h-5 w-5 text-[#128C7E]" /> WhatsApp inbox</h1>
          <p className="text-xs text-muted-foreground">Shared team inbox · {counts.data?.unread ?? 0} unread · {counts.data?.unassigned ?? 0} unassigned</p>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 md:grid-cols-[22rem_1fr]">
        <aside className={cn("flex min-h-0 flex-col border-e", conv && "hidden md:flex")}>
          <div className="space-y-2 border-b p-3">
            <div className="flex flex-wrap gap-1">
              {VIEWS.map(([v, label]) => (
                <button key={v} onClick={() => set("view", v)} className={cn("rounded-full px-2.5 py-1 text-xs font-medium",
                  view === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground")}>
                  {label}{counts.data?.[v] ? ` ${counts.data[v]}` : ""}
                </button>
              ))}
            </div>
            <div className="relative"><Search className="absolute start-2.5 top-3 h-4 w-4 text-muted-foreground" />
              <input aria-label="Search chats" className="field ps-8" placeholder="Name, phone or client" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          </div>
          <div className="min-h-0 flex-1 divide-y overflow-y-auto">
            {!convs.data && <Loading />}
            {convs.data?.map((c) => (
              <button key={c.name} onClick={() => set("c", c.name)} className={cn("flex w-full items-start gap-3 px-3 py-2.5 text-start hover:bg-accent", c.name === selected && "bg-accent")}>
                <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold text-white", c.opted_out ? "bg-slate-400" : "bg-[#128C7E]")}>{initials(c.contact_name)}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className={cn("truncate text-sm", c.unread_count ? "font-bold" : "font-medium")}>{c.contact_name}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{at(c.last_message_at)}</span>
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-muted-foreground">{c.last_direction === "Outgoing" ? "You: " : ""}{c.last_message}</span>
                    {c.unread_count > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-[#25D366] px-1 text-[10px] font-bold text-white">{c.unread_count}</span>}
                  </span>
                  <span className="mt-0.5 flex flex-wrap gap-1 text-[10px]">
                    {c.tax_client ? <StateBadge state="Scheduled" label="Client" /> : c.lead ? <StateBadge state="Contacted" label="Lead" /> : null}
                    {c.agent ? <span className="text-muted-foreground">→ {agentName(c.agent)}</span> : <StateBadge state="Pending" label="Unassigned" />}
                    {c.opted_out ? <StateBadge state="Rejected" label="Opted out" /> : null}
                  </span>
                </span>
              </button>
            ))}
            {convs.data && !convs.data.length && <Empty title="No chats here" hint="Try another view." />}
          </div>
        </aside>
        <section className={cn("min-h-0", !conv && "hidden md:block")}>
          {conv ? (
            <div className="flex h-full min-h-0 flex-col">
              <button className="border-b px-4 py-2 text-start text-sm text-primary md:hidden" onClick={() => set("c", null)}>← All chats</button>
              <div className="min-h-0 flex-1"><Thread conv={conv} agents={agents ?? []} onChanged={refresh} /></div>
            </div>
          ) : (
            <div className="grid h-full place-items-center text-center text-muted-foreground">
              <div><MessageCircle className="mx-auto mb-2 h-10 w-10 opacity-40" /><p className="text-sm">Pick a conversation</p></div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
