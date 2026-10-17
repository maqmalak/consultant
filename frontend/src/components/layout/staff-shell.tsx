import { LayoutGrid, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { STAFF_NAV } from "@/app/nav";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/cn";
import { Brand } from "./brand";
import { LanguageToggle } from "./language-toggle";
import { AppSwitcher } from "./app-switcher";
import { AwesomeBar, NotificationsBell, UserMenu } from "./header-tools";
import { ThemeCustomizer } from "./theme-provider";

const link = ({ isActive }: { isActive: boolean }) => cn(
  "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
  isActive ? "bg-primary/90 text-white hover:bg-primary" : "text-sidebar-foreground/80 hover:bg-white/10 hover:text-sidebar-foreground");

function Sidebar() {
  const { hasRole } = useAuth();
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center border-b border-white/10 px-4"><Brand dark /></div>
      <div className="border-b border-white/10 px-3 py-3">
        <NavLink to="/staff" end className={link}><LayoutGrid className="h-4 w-4" /> Home</NavLink>
      </div>
      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4 scrollbar-thin">
        {STAFF_NAV.filter((g) => !g.homeOnly).map((g) => {
          const items = g.items.filter((i) => hasRole(...i.roles));
          if (!items.length) return null;
          return (
            <div key={g.title}>
              <p className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-sidebar-muted" title={g.title}>{g.short ?? g.title}</p>
              <div className="space-y-0.5">
                {items.map((i) => (
                  <NavLink key={i.path} to={i.path} className={link}><i.icon className="h-4 w-4 shrink-0" />{i.label}</NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </nav>
      <a href="/app/pakistan-income-tax-consultancy" className="border-t border-white/10 px-5 py-3 text-xs text-sidebar-muted hover:text-sidebar-foreground">
        Open ERPNext desk ↗
      </a>
    </div>
  );
}

export function StaffShell() {
  const { me } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => { setOpen(false); }, [location.pathname]);
  const role = (me?.roles ?? []).find((r) => ["Tax Admin", "Tax Consultant", "Tax Reviewer", "Tax Approver",
    "Filing Officer", "Field Officer", "System Manager"].includes(r));
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-64 border-e border-white/5 lg:block"><Sidebar /></aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 start-0 w-72 shadow-xl">
            <button className="absolute end-3 top-4 z-10 rounded-lg p-1 text-sidebar-muted hover:bg-white/10" onClick={() => setOpen(false)}
              aria-label="Close menu"><X className="h-5 w-5" /></button>
            <Sidebar />
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col lg:ps-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur sm:px-6">
          <button className="rounded-lg p-2 text-muted-foreground hover:bg-accent lg:hidden" onClick={() => setOpen(true)}
            aria-label="Open menu"><Menu className="h-5 w-5" /></button>
          <AppSwitcher />
          <AwesomeBar staff />
          <div className="ms-auto flex items-center gap-1">
            {role && <Badge variant="brand" className="me-1 hidden xl:inline-flex">{role}</Badge>}
            <LanguageToggle />
            <ThemeCustomizer />
            <NotificationsBell />
            <UserMenu staff />
          </div>
        </header>
        <main className="flex-1"><Outlet /></main>
      </div>
    </div>
  );
}
