/** The CRM app: its own sidebar and header (switch back to the Tax Portal from the header). */
import { CalendarDays, Handshake, Layers, LayoutDashboard, ListTodo, Mail, Megaphone, Menu, Radar, Target, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { cn } from "@/lib/cn";
import { useApi } from "@/lib/use-api";
import { AppSwitcher } from "./app-switcher";
import { AwesomeBar, NotificationsBell, UserMenu } from "./header-tools";
import { LanguageToggle } from "./language-toggle";
import { ThemeCustomizer } from "./theme-provider";

export const CRM_NAV = [
  { path: "/crm", label: "Dashboard", icon: LayoutDashboard, end: true },
  { path: "/crm/leads", label: "Leads", icon: Users },
  { path: "/crm/pipeline", label: "Deals", icon: Target },
  { path: "/crm/follow-ups", label: "Follow-ups", icon: ListTodo, badge: true },
  { path: "/crm/calendar", label: "Calendar", icon: CalendarDays },
  { path: "/crm/finder", label: "Lead Finder", icon: Radar },
  { path: "/crm/broadcast", label: "WhatsApp Broadcast", icon: Megaphone },
  { path: "/crm/email-templates", label: "Email Templates", icon: Mail },
  { path: "/crm/masters", label: "Masters", icon: Layers },
];

const link = ({ isActive }: { isActive: boolean }) => cn(
  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
  isActive ? "bg-primary/90 text-primary-foreground hover:bg-primary" : "text-sidebar-foreground/80 hover:bg-white/10 hover:text-sidebar-foreground");

function Sidebar() {
  const due = useApi<unknown[]>("pakistan_tax_consultancy.api.crm_activity.follow_ups", { scope: "mine", status: "open" }, { refreshInterval: 60_000 });
  const overdue = (due.data as { due_date: string | null }[] | undefined)?.filter((t) => t.due_date && new Date(t.due_date.replace(" ", "T")) < new Date()).length ?? 0;
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center gap-2.5 border-b border-white/10 px-4">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[#f3d77a] via-[#d4af37] to-[#9c7a22] text-[#141416]"><Handshake className="h-5 w-5" /></span>
        <div className="leading-tight"><p className="font-semibold">VVS CRM</p><p className="text-[11px] text-sidebar-muted">Leads · Deals · Activities</p></div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {CRM_NAV.map((i) => (
          <NavLink key={i.path} to={i.path} end={i.end} className={link}>
            <i.icon className="h-4 w-4 shrink-0" /><span className="flex-1">{i.label}</span>
            {i.badge && overdue > 0 && <span className="rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">{overdue}</span>}
          </NavLink>
        ))}
      </nav>
      <a href="/crm" className="border-t border-white/10 px-5 py-3 text-xs text-sidebar-muted hover:text-sidebar-foreground">Open Frappe CRM ↗</a>
    </div>
  );
}

export function CrmShell() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => { setOpen(false); }, [location.pathname]);
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-60 border-e border-white/5 lg:block"><Sidebar /></aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 start-0 w-64 shadow-xl">
            <button className="absolute end-3 top-4 z-10 rounded-lg p-1 text-sidebar-muted hover:bg-white/10" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
            <Sidebar />
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col lg:ps-60">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur sm:px-6">
          <button className="rounded-lg p-2 text-muted-foreground hover:bg-accent lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
          <AppSwitcher />
          <AwesomeBar staff />
          <div className="ms-auto flex items-center gap-1">
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
