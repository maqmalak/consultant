import * as React from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Menu, X, LogOut, ChevronRight, ShieldCheck, LayoutGrid } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { ALL_NAV, PORTAL_NAV, QUEUE_NAV, ROLES, WORKSPACE_NAV, type NavItem } from "@/app/nav";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { ThemeCustomizer } from "@/components/layout/theme-provider";

function NavSection({ title, items }: { title: string; items: NavItem[] }) {
  const { hasRole } = useAuth();
  const visible = items.filter((i) => hasRole(...i.roles));
  if (visible.length === 0) return null;
  return (
    <div className="mb-4">
      <p className="px-3 mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sidebar-muted">
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
                "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                isActive
                  ? "bg-primary/90 text-white hover:bg-primary"
                  : "text-sidebar-foreground/80 hover:bg-card/10 hover:text-sidebar-foreground",
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

/** Always-present link back to the launcher home, above the role's own nav (as in the real-estate app). */
function HomeLink() {
  const { roles } = useAuth();
  if (roles.includes(ROLES.CLIENT)) return null;
  return (
    <div className="border-b border-white/10 px-3 py-3">
      <NavLink
        to="/home"
        end
        className={({ isActive }) =>
          cn(
            "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
            isActive ? "bg-primary/90 text-white" : "text-sidebar-foreground/80 hover:bg-card/10 hover:text-sidebar-foreground",
          )
        }
      >
        <LayoutGrid className="h-4 w-4 shrink-0" />
        Home
      </NavLink>
    </div>
  );
}

function SidebarContent() {
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center gap-2.5 border-b border-white/10 px-4">
        <div className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-primary to-primary/70 text-white shadow-lg shadow-primary/25 ring-1 ring-inset ring-white/20">
          <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent" />
          <ShieldCheck className="relative h-5 w-5" aria-hidden="true" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold">Pakistan Tax</p>
          <p className="text-[11px] text-sidebar-muted">Consultancy</p>
        </div>
      </div>
      <HomeLink />
      <div className="flex-1 overflow-y-auto px-3 py-4 scrollbar-thin">
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
  const known = [...ALL_NAV, { path: "/portal", label: "My Overview" }, { path: "/home", label: "Apps" }] as {
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
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
      <Link to="/" className="hover:text-foreground">
        Home
      </Link>
      <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="truncate font-medium text-foreground">{label}</span>
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
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-white/5 lg:block">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 w-64 shadow-xl">
            <button
              className="absolute right-3 top-4 z-10 rounded-lg p-1 text-sidebar-muted hover:bg-card/10"
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
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur sm:px-6">
          <button
            className="rounded-lg p-2 text-muted-foreground hover:bg-accent lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Breadcrumbs />
          <div className="ml-auto flex items-center gap-2">
            <ThemeCustomizer />
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-foreground">
                {user?.full_name ?? currentUser ?? ""}
              </p>
              <Badge variant="brand">{primaryRole(roles)}</Badge>
            </div>
            <button
              onClick={() => {
                void logout();
              }}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
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

        <footer className="border-t px-4 py-3 text-center text-xs text-muted-foreground">
          Pakistan Tax Consultancy — staff & client portal
        </footer>
      </div>
    </div>
  );
}
