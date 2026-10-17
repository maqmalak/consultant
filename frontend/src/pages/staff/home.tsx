import { LayoutGrid, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { STAFF_NAV } from "@/app/nav";
import { HomePanel } from "@/components/staff/home-panel";
import { GlossyIcon } from "@/components/ui/app-icon";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/cn";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** Staff launcher: glossy icons grouped like the sidebar, filtered by role; Enter opens the first match. */
export function StaffHome() {
  const { me, hasRole } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    return STAFF_NAV.map((g) => ({ ...g, items: g.items.filter((i) => hasRole(...i.roles)
      && (!term || `${i.label} ${i.hint} ${g.title}`.toLowerCase().includes(term))) })).filter((g) => g.items.length);
  }, [q, hasRole]);
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  return (
    <div className="grid items-start gap-6 p-4 sm:p-6 xl:grid-cols-[minmax(0,1fr)_380px]">
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{greeting()}, {(me?.full_name ?? "").split(" ")[0]}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{total} places you can open</p>
        </div>
        <div className="relative w-64">
          <Search className="absolute start-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input aria-label="Find a page" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find… (Enter opens)"
            onKeyDown={(e) => { const hit = groups[0]?.items[0]; if (e.key === "Enter" && hit) navigate(hit.path); }}
            className="field h-9 ps-8 text-sm" />
        </div>
      </div>
      {groups.map((g) => (
        <section key={g.title}>
          <div className="mb-2.5 flex items-center gap-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{g.title}</h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">{g.items.length}</span>
            <span className="h-px flex-1 bg-border" aria-hidden />
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-x-2 gap-y-4 sm:grid-cols-[repeat(auto-fill,120px)]">
            {g.items.map((i) => (
              <Link key={i.path} to={i.path} title={`${i.label} — ${i.hint}`} className={cn(
                "group flex w-full flex-col items-center gap-1.5 rounded-2xl p-2 text-center outline-none transition",
                "hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-primary")}>
                <GlossyIcon icon={i.icon ?? LayoutGrid} hue={i.hue} />
                <span className="w-full truncate text-[13px] font-semibold leading-tight">{i.label}</span>
                <span className="-mt-1 w-full truncate text-[10px] text-muted-foreground">{i.hint}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
    <aside className="xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto xl:pe-1 scrollbar-thin">
      <HomePanel />
    </aside>
    </div>
  );
}
