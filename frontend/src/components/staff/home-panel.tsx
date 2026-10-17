/**
 * Staff home side panel: Approval inbox (what waits for *my* action, by role), Needs attention (problems and overdue
 * work) and Recent activity — each item opens the return, queue or page it is about.
 */
import {
  AlertOctagon, AlertTriangle, BadgeCheck, CheckCircle2, ChevronDown, ClipboardCheck, Clock, FileCheck2, FileSearch, Info,
  Inbox, PencilLine, Send, Sparkles, Wallet, type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import { useApi } from "@/lib/use-api";

interface InboxItem { name: string; client: string; tax_year: string; waiting: string; amount: number; refund: boolean; payment?: boolean }
interface InboxGroup { key: string; verb: string; title: string; count: number; link: string; items: InboxItem[] }
interface Attention { key: string; tone: "critical" | "serious" | "warning" | "info"; title: string; hint: string; count: number; link: string }
interface Activity { type: string; doctype: string; name: string; from: string | null; to: string | null; user: string; client: string; when: string; ago: string }
interface Panel { inbox: InboxGroup[]; inbox_total: number; attention: Attention[]; activity: Activity[] }

const INBOX_ICON: Record<string, LucideIcon> = { approve: BadgeCheck, review: ClipboardCheck, in_review: ClipboardCheck, file: Send, ack: FileCheck2,
  changes: PencilLine, verify: FileSearch, payments: Wallet };
const TONE: Record<Attention["tone"], { icon: LucideIcon; tile: string; pill: string; label: string }> = {
  critical: { icon: AlertOctagon, tile: "bg-rose-500/15 text-rose-600 dark:text-rose-400", pill: "bg-rose-500 text-white", label: "Critical" },
  serious: { icon: AlertTriangle, tile: "bg-orange-500/15 text-orange-600 dark:text-orange-400", pill: "bg-orange-500 text-white", label: "Serious" },
  warning: { icon: Clock, tile: "bg-amber-500/15 text-amber-700 dark:text-amber-400", pill: "bg-amber-500/90 text-[#141416]", label: "Warning" },
  info: { icon: Info, tile: "bg-sky-500/15 text-sky-600 dark:text-sky-400", pill: "bg-sky-500 text-white", label: "Info" },
};
const VERB: Record<string, string> = { Review: "saved a review", Approval: "signed off", Filing: "updated the filing record" };
const STATE_TONE: Record<string, string> = {
  Acknowledged: "bg-emerald-500", "Submitted to FBR": "bg-indigo-500", Approved: "bg-emerald-500", "Awaiting Client Confirmation": "bg-pink-500",
  Reviewed: "bg-violet-500", "Under Review": "bg-sky-500", "Pending Review": "bg-sky-500", "Changes Required": "bg-orange-500",
  "Filing Error": "bg-rose-500", Draft: "bg-slate-400", "Documents Pending": "bg-amber-500",
};

function Card({ icon: Icon, title, badge, children, tone }: { icon: LucideIcon; title: string; badge?: number; children: React.ReactNode; tone: string }) {
  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <header className="flex items-center gap-2.5 border-b bg-gradient-to-br from-[#d4af37]/12 via-[#d4af37]/4 to-transparent px-4 py-3">
        <span className={cn("grid h-8 w-8 place-items-center rounded-lg", tone)}><Icon className="h-4 w-4" /></span>
        <h2 className="flex-1 text-sm font-semibold">{title}</h2>
        {badge ? <span className="rounded-full bg-gradient-to-r from-[#f3d77a] to-[#d4af37] px-2.5 py-0.5 text-xs font-bold tabular-nums text-[#141416]">{badge}</span> : null}
      </header>
      {children}
    </section>
  );
}

function InboxCard({ groups, total }: { groups: InboxGroup[]; total: number }) {
  const [open, setOpen] = useState<string | null>(groups[0]?.key ?? null);
  return (
    <Card icon={Inbox} title="Approval inbox" badge={total} tone="bg-[#d4af37]/15 text-[#8a6914] dark:text-[#f3d77a]">
      {!groups.length ? (
        <p className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Nothing is waiting for you.</p>
      ) : (
        <ul className="divide-y">
          {groups.map((g) => {
            const Icon = INBOX_ICON[g.key] ?? Inbox;
            const isOpen = open === g.key;
            return (
              <li key={g.key}>
                <button type="button" onClick={() => setOpen(isOpen ? null : g.key)} aria-expanded={isOpen}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-start transition hover:bg-muted/50">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="h-3.5 w-3.5" /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{g.title}</span></span>
                  <span className="rounded-full bg-muted px-2 text-xs font-bold tabular-nums">{g.count}</span>
                  <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                </button>
                {isOpen && (
                  <div className="space-y-1.5 px-3 pb-3">
                    {g.items.map((i) => (
                      <Link key={i.name} to={i.payment ? g.link : `/staff/returns/${i.name}`}
                        className="group flex items-center gap-3 rounded-xl border bg-background/60 px-3 py-2 transition hover:border-primary/40 hover:shadow-sm">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{i.client}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">{i.payment ? i.tax_year : `TY${i.tax_year}`} · idle {i.waiting.replace(/ ago$/, "")}</span>
                        </span>
                        {i.amount ? <span className={cn("shrink-0 text-xs font-semibold tabular-nums", i.refund ? "text-emerald-600 dark:text-emerald-400" : "")}>{i.refund ? "↩ " : ""}{money(i.amount, { compact: true })}</span> : null}
                        <span className="shrink-0 rounded-md bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground opacity-80 transition group-hover:opacity-100">{g.verb}</span>
                      </Link>
                    ))}
                    {g.count > g.items.length && <Link to={g.link} className="block px-1 pt-0.5 text-xs font-semibold text-primary hover:underline">All {g.count} →</Link>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function AttentionCard({ rows }: { rows: Attention[] }) {
  return (
    <Card icon={AlertTriangle} title="Needs attention" badge={rows.reduce((n, r) => n + r.count, 0)} tone="bg-amber-500/15 text-amber-700 dark:text-amber-400">
      {!rows.length ? (
        <p className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground"><Sparkles className="h-4 w-4 text-emerald-500" /> All clear.</p>
      ) : (
        <ul className="space-y-1.5 p-3">
          {rows.map((r) => {
            const t = TONE[r.tone];
            return (
              <li key={r.key}>
                <Link to={r.link} className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-muted/60" title={`${t.label}: ${r.title}`}>
                  <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", t.tile)}><t.icon className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{r.title}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{r.hint}</span>
                  </span>
                  <span className={cn("min-w-[1.75rem] rounded-full px-2 py-0.5 text-center text-xs font-bold tabular-nums", t.pill)}>{r.count}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function ActivityCard({ rows }: { rows: Activity[] }) {
  return (
    <Card icon={Clock} title="Recent activity" tone="bg-sky-500/15 text-sky-600 dark:text-sky-400">
      {!rows.length ? <p className="px-4 py-6 text-sm text-muted-foreground">No activity yet.</p> : (
        <ol className="relative px-4 py-3">
          <span aria-hidden className="absolute bottom-5 start-[1.4rem] top-5 w-px bg-border" />
          {rows.map((a, i) => {
            const created = a.type === "Create";
            const href = a.doctype === "Tax Return" ? `/staff/returns/${a.name}` : a.doctype === "Tax Client" ? `/staff/clients/${a.name}` : null;
            const body = (
              <>
                <span className={cn("relative z-10 mt-1 h-3 w-3 shrink-0 rounded-full ring-4 ring-card", created ? "bg-[#d4af37]" : STATE_TONE[a.to ?? ""] ?? "bg-slate-400")} />
                <span className="min-w-0 flex-1 text-[13px] leading-snug">
                  <span className="font-semibold">{a.user}</span>{" "}
                  <span className="text-muted-foreground">{created ? `created ${a.doctype.toLowerCase()}` : a.to ? "moved to" : VERB[a.type] ?? a.type.toLowerCase()}</span>{" "}
                  {a.to && <span className="font-medium">{a.to}</span>}
                  <span className="block truncate text-[11px] text-muted-foreground">{a.client} · {a.ago}</span>
                </span>
              </>
            );
            return (
              <li key={i} className="py-1.5">
                {href ? <Link to={href} className="flex items-start gap-3 rounded-lg transition hover:bg-muted/40">{body}</Link> : <div className="flex items-start gap-3">{body}</div>}
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

export function HomePanel() {
  const { data, error } = useApi<Panel>("pakistan_tax_consultancy.api.home.panel", undefined, { refreshInterval: 60_000 });
  if (error) return null;
  if (!data) return <div className="space-y-4">{[0, 1, 2].map((i) => <div key={i} className="h-40 animate-pulse rounded-2xl bg-muted/60" />)}</div>;
  return (
    <div className="space-y-4">
      <InboxCard groups={data.inbox} total={data.inbox_total} />
      <AttentionCard rows={data.attention} />
      <ActivityCard rows={data.activity} />
    </div>
  );
}
