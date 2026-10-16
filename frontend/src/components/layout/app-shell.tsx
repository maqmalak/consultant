import * as React from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Menu, X, LogOut, ChevronRight, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { ALL_NAV, PORTAL_NAV, QUEUE_NAV, ROLES, WORKSPACE_NAV, type NavItem } from "@/app/nav";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";

function NavSection({ title, items }: { title: string; items: NavItem[] }) {
  const { hasRole } = useAuth();
  const visible = items.filter((i) => hasRole(...i.roles));
  if (visible.length === 0) return null;
  return (
    <div className="mb-4">
      <p className="px-3 mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        {title}
      </p>
      <nav className="space-y-0.5">
        {visible.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/portal"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              )
            }
          >
            <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function SidebarContent() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-slate-900">Pakistan Tax</p>
          <p className="text-[11px] text-slate-500">Consultancy</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <NavSection title="Workspace" items={WORKSPACE_NAV} />
        <NavSection title="Queues" items={QUEUE_NAV} />
        <NavSection title="Client Portal" items={PORTAL_NAV} />
      </div>
    </div>
  );
}

/** Breadcrumb from the pathname using known nav labels. */
function Breadcrumbs() {
  const { pathname } = useLocation();
  const known = [...ALL_NAV, { path: "/portal", label: "My Overview" }] as {
    path: string;
    label: string;
  }[];
  const match = known.find((i) => i.path === pathname);
  const label =
    match?.label ??
    (pathname === "/"
      ? "Home"
      : pathname
          .split("/")
          .filter(Boolean)
          .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
          .join(" / "));
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-slate-500">
      <Link to="/" className="hover:text-slate-800">
        Home
      </Link>
      <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="font-medium text-slate-800">{label}</span>
    </nav>
  );
}

/** Primary (most specific) custom role of the current user for display. */
function primaryRole(roles: string[]): string {
  const order = Object.values(ROLES);
  return order.find((r) => roles.includes(r)) ?? roles[0] ?? "User";
}

export function AppShell() {
  const { user, currentUser, roles, logout, isAuthenticated } = useAuth();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const location = useLocation();

  // Close the mobile drawer on navigation.
  React.useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  if (!isAuthenticated) return null;

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-slate-200 bg-white lg:block">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl">
            <button
              className="absolute right-3 top-4 rounded-lg p-1 text-slate-500 hover:bg-slate-100"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent />
          </aside>
        </div>
      ) : null}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
          <button
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Breadcrumbs />
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-slate-800">
                {user?.full_name ?? currentUser ?? ""}
              </p>
              <Badge variant="brand">{primaryRole(roles)}</Badge>
            </div>
            <button
              onClick={() => {
                void logout();
              }}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </header>

        <main className="flex-1">
          <Outlet />
        </main>

        <footer className="border-t border-slate-200 px-4 py-3 text-center text-xs text-slate-400">
          Pakistan Income Tax Consultancy — internal & client portal
        </footer>
      </div>
    </div>
  );
}
