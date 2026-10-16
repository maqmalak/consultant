/**
 * Staff home (/home), styled like the real-estate launcher: glossy app icons with a label and a short hint, grouped like
 * the sidebar under "SECTION · count ———" headers and filtered by role. Built from the nav lists, so it always matches
 * the menu. Search narrows the icons; Enter opens the first match.
 */
import { LayoutGrid, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { QUEUE_NAV, WORKSPACE_NAV, type NavItem } from "@/app/nav";
import { GlossyIcon } from "@/components/ui/app-icon";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/cn";

const SECTIONS: { title: string; items: NavItem[] }[] = [
  { title: "Workspace", items: WORKSPACE_NAV },
  { title: "Queues", items: QUEUE_NAV },
];

/** A colour per destination (falls back to a per-section cycle). */
const HUE: Record<string, string> = {
  Dashboard: "blue", Clients: "violet", "Tax Returns": "emerald", "Site Visits": "amber",
  "Review Queue": "indigo", "Approval Queue": "teal", "Filing Queue": "rose",
};
const CYCLE = ["blue", "emerald", "violet", "amber", "rose", "teal", "orange", "indigo", "pink", "sky"];

/** Short hint under each icon. */
const HINT: Record<string, string> = {
  Dashboard: "KPIs · Status", Clients: "CNIC · NTN", "Tax Returns": "Draft → Filed", "Site Visits": "Field leads",
  "Review Queue": "Check & send back", "Approval Queue": "Approve version", "Filing Queue": "FBR IRIS",
};

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function SectionTitle({ children, count }: { children: React.ReactNode; count: number }) {
  return (
    <div className="mb-2.5 flex items-center gap-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{children}</h2>
      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">{count}</span>
      <span className="h-px flex-1 bg-border" aria-hidden />
    </div>
  );
}

export function HomePage() {
  const { hasRole, user, currentUser } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    return SECTIONS.map((g) => ({
      ...g,
      items: g.items.filter(
        (i) => hasRole(...i.roles) && (!term || `${i.label} ${HINT[i.label] ?? ""} ${g.title}`.toLowerCase().includes(term)),
      ),
    })).filter((g) => g.items.length > 0);
  }, [q, hasRole]);
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const first = (user?.full_name ?? currentUser ?? "there").split(" ")[0];

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-lg shadow-primary/25 ring-1 ring-inset ring-white/20">
            <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent" />
            <ShieldCheck className="relative h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{greeting()}, {first}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">Pakistan Tax Consultancy · {total} places you can open</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              aria-label="Find a page"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                const hit = groups[0]?.items[0];
                if (e.key === "Enter" && hit) navigate(hit.path);
              }}
              placeholder="Find… (Enter opens)"
              className="field h-9 pl-8 text-sm"
            />
          </div>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
          </span>
        </div>
      </div>

      {groups.map((g, gi) => (
        <section key={g.title}>
          <SectionTitle count={g.items.length}>{g.title}</SectionTitle>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-x-2 gap-y-4 sm:grid-cols-[repeat(auto-fill,120px)]">
            {g.items.map((i, ii) => (
              <Link
                key={i.path}
                to={i.path}
                title={`${i.label} — ${HINT[i.label] ?? g.title}`}
                className={cn(
                  "group flex w-full flex-col items-center gap-1.5 rounded-2xl p-2 text-center outline-none transition",
                  "hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-primary",
                )}
              >
                <GlossyIcon icon={i.icon ?? LayoutGrid} hue={HUE[i.label] ?? CYCLE[(gi * 3 + ii) % CYCLE.length]} />
                <span className="w-full truncate text-[13px] font-semibold leading-tight">{i.label}</span>
                <span className="-mt-1 w-full truncate text-[10px] text-muted-foreground">{HINT[i.label] ?? g.title}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
      {!groups.length && <p className="py-10 text-center text-sm text-muted-foreground">No page matches “{q}”.</p>}
    </div>
  );
}
