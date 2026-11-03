import { LayoutGrid, Moon, Search, Sun, Sunrise, Sunset } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { STAFF_NAV } from "@/app/nav";
import { HomePanel } from "@/components/staff/home-panel";
import { GlossyIcon } from "@/components/ui/app-icon";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/cn";

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? ["Good evening", Moon] as const : h < 12 ? ["Good morning", Sunrise] as const
    : h < 17 ? ["Good afternoon", Sun] as const : h < 20 ? ["Good evening", Sunset] as const : ["Good evening", Moon] as const;
}
const STAFF_ROLES = ["Tax Admin", "Tax Consultant", "Tax Reviewer", "Tax Approver", "Filing Officer", "Field Officer", "Data Entry Officer"];

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
  const [hello, GreetIcon] = greeting();
  const first = (me?.full_name ?? "").split(" ")[0];
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const myRoles = STAFF_ROLES.filter((r) => (me?.roles ?? []).includes(r));
  return (
    <div className="grid items-start gap-6 p-4 sm:p-6 xl:grid-cols-[minmax(0,1fr)_380px]">
    <div className="flex min-w-0 flex-col gap-6">
      <section className="relative overflow-hidden rounded-3xl hero-dark p-6 text-white shadow-lg sm:p-8">
        <div aria-hidden className="pointer-events-none absolute -end-16 -top-20 h-72 w-72 rounded-full bg-[#d4af37]/25 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 start-1/3 h-56 w-56 rounded-full bg-sky-500/10 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#d4af37]/60 to-transparent" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-[#f3d77a] via-[#d4af37] to-[#9c7a22] text-[#141416] shadow-md ring-1 ring-white/20">
                <GreetIcon className="size-5" strokeWidth={2.2} /></span>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#d4af37]">Welcome back</div>
                <div className="text-xs text-white/50">{today}</div>
              </div>
            </div>
            <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              {hello},{" "}
              <span className="bg-gradient-to-r from-[#f3d77a] via-[#d4af37] to-[#f3d77a] bg-clip-text text-transparent">{first || "there"}</span>
            </h1>
            <p className="mt-1.5 max-w-xl text-sm text-white/60">Everything you need for today, in one place — pick up where you left off.</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#d4af37]/40 bg-[#d4af37]/10 px-3 py-1 text-xs font-semibold text-[#f3d77a]">
                <LayoutGrid className="size-3.5" />{total} places you can open</span>
              {myRoles.map((r) => (
                <span key={r} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/70">{r}</span>))}
            </div>
          </div>
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute start-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-white/50" />
            <input aria-label="Find a page" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a page… (Enter opens)"
              onKeyDown={(e) => { const hit = groups[0]?.items[0]; if (e.key === "Enter" && hit) navigate(hit.path); }}
              className="h-11 w-full rounded-xl border border-white/15 bg-white/[0.07] pe-3 ps-10 text-sm text-white placeholder:text-white/40 outline-none backdrop-blur transition focus:border-[#d4af37]/60 focus:ring-4 focus:ring-[#d4af37]/20" />
          </div>
        </div>
      </section>
      {groups.map((g) => (
        <section key={g.title}>
          <div className="mb-2.5 flex items-center gap-3">
            <span className="h-4 w-1 rounded-full bg-gradient-to-b from-[#f3d77a] to-[#9c7a22]" aria-hidden />
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{g.title}</h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">{g.items.length}</span>
            <span className="h-px flex-1 bg-gradient-to-r from-border to-transparent" aria-hidden />
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
