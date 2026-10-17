/** Follow-ups (CRM Task): overdue, today and upcoming — mine or the team's, ported from the wise FollowUpsPage idea. */
import { CalendarCheck2, CalendarClock, Check, ListTodo, User, Users, X } from "lucide-react";
import { ColorTabs } from "@/components/ui/color-tabs";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Empty, ErrorState, InlineError, Loading } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/cn";
import { useApi } from "@/lib/use-api";
import { apiCall } from "@/services/frappe";

const A = "pakistan_tax_consultancy.api.crm_activity";
interface Task { name: string; title: string; description: string; due_date: string | null; status: string; priority: string; assigned_name: string | null;
  reference_doctype: string | null; reference_docname: string | null; ref_label: string | null }

const when = (v: string | null) => (v ? new Date(v.replace(" ", "T")).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "No date");
function bucket(v: string | null) {
  if (!v) return "Later";
  const d = new Date(v.replace(" ", "T")); const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (d < today) return "Overdue";
  if (d < new Date(today.getTime() + 86_400_000)) return "Today";
  if (d < new Date(today.getTime() + 7 * 86_400_000)) return "This week";
  return "Later";
}
const ORDER = ["Overdue", "Today", "This week", "Later"];

export function FollowUpsPage() {
  const [scope, setScope] = useState<"mine" | "team">("mine");
  const [status, setStatus] = useState<"open" | "done">("open");
  const { data, error, isLoading, mutate } = useApi<Task[]>(`${A}.follow_ups`, { scope, status });
  const [err, setErr] = useState<unknown>(null);
  const mark = (t: Task, s: string) => apiCall(`${A}.set_task_status`, { task: t.name, status: s }).then(() => mutate()).catch(setErr);
  const groups = status === "open" ? ORDER.map((g) => [g, (data ?? []).filter((t) => bucket(t.due_date) === g)] as const).filter(([, l]) => l.length) : [["Done", data ?? []] as const];
  return (
    <div className="page-container mx-auto max-w-4xl space-y-5">
      <PageHeader title="Follow-ups" subtitle="Calls to make and promises to keep" icon={<ListTodo className="h-5 w-5" />} />
      <div className="flex flex-wrap gap-2">
        <ColorTabs value={scope} onChange={setScope} tabs={[{ key: "mine", label: "Mine", icon: User, tone: "gold" }, { key: "team", label: "Team", icon: Users, tone: "indigo" }]} />
        <ColorTabs value={status} onChange={setStatus} tabs={[{ key: "open", label: "Open", icon: ListTodo, tone: "violet" }, { key: "done", label: "Done", icon: CalendarCheck2, tone: "emerald" }]} />
      </div>
      <InlineError error={err} />
      {isLoading ? <Loading /> : error ? <ErrorState error={error} onRetry={() => void mutate()} /> : !data?.length ? <Empty title="All clear" hint="Add follow-ups from a lead's page." /> : (
        groups.map(([g, list]) => (
          <section key={g} className="space-y-2">
            <h2 className={cn("text-xs font-semibold uppercase tracking-[0.14em]", g === "Overdue" ? "text-rose-600" : "text-muted-foreground")}>{g} · {list.length}</h2>
            <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
              {list.map((t) => {
                const path = t.reference_doctype === "CRM Lead" ? `/crm/leads/${t.reference_docname}` : t.reference_doctype === "CRM Deal" ? `/crm/deals/${t.reference_docname}` : null;
                return (
                  <li key={t.name} className="flex items-start gap-3 px-4 py-3">
                    <CalendarClock className={cn("mt-0.5 h-5 w-5 shrink-0", g === "Overdue" ? "text-rose-500" : t.priority === "High" ? "text-amber-500" : "text-muted-foreground")} />
                    <div className="min-w-0 flex-1">
                      <p className={cn("font-medium", t.status === "Done" && "line-through opacity-60")}>{t.title}</p>
                      <p className="text-xs text-muted-foreground">{when(t.due_date)}{scope === "team" && t.assigned_name ? ` · ${t.assigned_name}` : ""}{t.priority === "High" ? " · High priority" : ""}</p>
                      {path && <Link to={path} className="text-xs font-medium text-primary hover:underline">{t.ref_label ?? t.reference_docname} →</Link>}
                      {t.description && <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>}
                    </div>
                    {status === "open" && <div className="flex shrink-0 gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => void mark(t, "Done")}><Check className="h-3.5 w-3.5" /> Done</Button>
                      <Button size="sm" variant="ghost" aria-label="Cancel" onClick={() => void mark(t, "Canceled")}><X className="h-3.5 w-3.5" /></Button>
                    </div>}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
