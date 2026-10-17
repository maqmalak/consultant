/**
 * Tax Portal ⇄ CRM: two apps, one login. A segmented switch with a sliding gold highlight, plus an app launcher
 * (Tax Portal, CRM, Frappe CRM, website, ERPNext desk) for everything else.
 */
import { Briefcase, Check, ExternalLink, Globe, Grid3x3, Handshake, LayoutDashboard, Server, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/cn";

const CRM_ROLES = ["Tax Admin", "Tax Consultant", "Tax Reviewer", "Field Officer", "System Manager"];

type AppKey = "portal" | "crm";
const APPS: { key: AppKey; label: string; hint: string; to: string; icon: LucideIcon; tile: string }[] = [
  { key: "portal", label: "Tax Portal", hint: "Clients · returns · filing", to: "/staff", icon: Briefcase,
    tile: "from-[#f3d77a] via-[#d4af37] to-[#9c7a22] text-[#141416]" },
  { key: "crm", label: "CRM", hint: "Leads · deals · campaigns", to: "/crm", icon: Handshake,
    tile: "from-sky-400 via-indigo-500 to-violet-600 text-white" },
];

function useOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", click);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", click); document.removeEventListener("keydown", esc); };
  }, [open, close]);
  return ref;
}

/** Everything else the team opens: the full Frappe CRM, the public website, the ERPNext desk. */
function Launcher({ current }: { current: AppKey }) {
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const box = useOutside(open, () => setOpen(false));
  const admin = hasRole("Tax Admin", "System Manager");
  const external: { label: string; hint: string; href: string; icon: LucideIcon; tile: string; show: boolean }[] = [
    { label: "Frappe CRM", hint: "Full CRM: emails, calls, views", href: "/crm", icon: LayoutDashboard, tile: "bg-violet-500/15 text-violet-600 dark:text-violet-300", show: true },
    { label: "Website", hint: "What clients see", href: "/", icon: Globe, tile: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300", show: true },
    { label: "ERPNext desk", hint: "Accounts, setup, everything", href: "/app/pakistan-income-tax-consultancy", icon: Server, tile: "bg-slate-500/15 text-slate-600 dark:text-slate-300", show: admin },
  ];
  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label="All apps" aria-expanded={open} title="All apps"
        className={cn("grid h-9 w-9 place-items-center rounded-xl border bg-card text-muted-foreground transition hover:border-[#d4af37]/60 hover:text-foreground",
          open && "border-[#d4af37]/60 text-foreground shadow-[0_0_0_3px_rgba(212,175,55,0.15)]")}>
        <Grid3x3 className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute start-0 top-full z-50 mt-2 w-[22rem] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border bg-popover shadow-2xl">
          <div className="border-b bg-gradient-to-br from-[#d4af37]/20 via-[#d4af37]/5 to-transparent px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8a6914] dark:text-[#f3d77a]">VVS workspace</p>
            <p className="text-sm text-muted-foreground">One login — pick where to work</p>
          </div>
          <div className="grid grid-cols-2 gap-2 p-3">
            {APPS.map((a) => (
              <button key={a.key} type="button" onClick={() => { setOpen(false); navigate(a.to); }}
                className={cn("relative flex flex-col items-start gap-2 rounded-xl border p-3 text-start transition hover:-translate-y-0.5 hover:shadow-md",
                  a.key === current ? "border-[#d4af37]/60 bg-[#d4af37]/5" : "hover:border-primary/40")}>
                <span className={cn("grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br shadow-sm", a.tile)}><a.icon className="h-5 w-5" /></span>
                <span><span className="block text-sm font-semibold">{a.label}</span><span className="block text-[11px] text-muted-foreground">{a.hint}</span></span>
                {a.key === current && <span className="absolute end-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-[#d4af37] text-[#141416]"><Check className="h-3 w-3" strokeWidth={3} /></span>}
              </button>
            ))}
          </div>
          <div className="border-t p-1.5">
            {external.filter((x) => x.show).map((x) => (
              <a key={x.label} href={x.href} className="flex items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-accent">
                <span className={cn("grid h-8 w-8 place-items-center rounded-lg", x.tile)}><x.icon className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{x.label}</span><span className="block text-[11px] text-muted-foreground">{x.hint}</span></span>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function AppSwitcher() {
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  if (!hasRole(...CRM_ROLES)) return null;
  const current: AppKey = pathname.startsWith("/crm") ? "crm" : "portal";
  const index = APPS.findIndex((a) => a.key === current);
  const rtl = typeof document !== "undefined" && document.documentElement.dir === "rtl";
  return (
    <div className="flex items-center gap-2">
      <Launcher current={current} />
      <nav aria-label="Switch app" className="relative grid grid-cols-2 rounded-xl border border-white/5 bg-[#141416] p-1 shadow-inner dark:bg-black/40">
        {/* sliding highlight */}
        <span aria-hidden className="absolute inset-y-1 start-1 w-[calc(50%-0.25rem)] rounded-lg bg-gradient-to-br from-[#f3d77a] via-[#d4af37] to-[#b8912a] shadow-[0_4px_14px_-4px_rgba(212,175,55,0.8)] transition-transform duration-300 ease-out"
          style={{ transform: `translateX(${(rtl ? -1 : 1) * index * 100}%)` }} />
        {APPS.map((a) => {
          const on = a.key === current;
          return (
            <button key={a.key} type="button" onClick={() => !on && navigate(a.to)} aria-current={on ? "page" : undefined} title={a.hint}
              className={cn("relative z-10 flex items-center justify-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-semibold transition-colors sm:px-3.5",
                on ? "text-[#141416]" : "text-white/60 hover:text-white")}>
              <a.icon className="h-4 w-4" />
              <span className="hidden sm:inline">{a.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
