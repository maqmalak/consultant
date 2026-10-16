import { useTranslation } from "react-i18next";
import { NavLink, Outlet } from "react-router-dom";
import { CLIENT_NAV } from "@/app/nav";
import { cn } from "@/lib/cn";
import { Brand } from "./brand";
import { AwesomeBar, NotificationsBell, UserMenu } from "./header-tools";
import { LanguageToggle } from "./language-toggle";
import { ThemeToggle } from "./theme-provider";
import { WhatsAppButton } from "./whatsapp-button";

/** Client portal: top bar + tabs on desktop, bottom tab bar on phones (large tap targets). */
export function ClientShell() {
  const { t } = useTranslation();
  // Profile lives in the account menu, so the phone tab bar keeps five large targets
  const nav = CLIENT_NAV.filter((n) => n.path !== "/profile");
  const tab = ({ isActive }: { isActive: boolean }) => cn(
    "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
    isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground");
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4">
          <NavLink to="/" className="min-w-0"><Brand /></NavLink>
          <nav className="ms-6 hidden items-center gap-1 md:flex" aria-label="Main">
            {nav.map((n) => (
              <NavLink key={n.path} to={n.path} end={n.path === "/"} className={tab}>
                <n.icon className="h-4 w-4" /> {t(n.label)}
              </NavLink>
            ))}
          </nav>
          <div className="ms-auto flex items-center gap-1">
            <AwesomeBar staff={false} />
            <LanguageToggle />
            <ThemeToggle />
            <NotificationsBell />
            <UserMenu staff={false} />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-6 md:pb-10">
        <Outlet />
      </main>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t bg-background/95 backdrop-blur md:hidden">
        {nav.map((n) => (
          <NavLink key={n.path} to={n.path} end={n.path === "/"} className={({ isActive }) => cn(
            "flex min-h-[60px] flex-col items-center justify-center gap-1 text-[11px] font-medium",
            isActive ? "text-primary" : "text-muted-foreground")}>
            <n.icon className="h-5 w-5" /> {t(n.label)}
          </NavLink>
        ))}
      </nav>
      <WhatsAppButton bottomOffset />
    </div>
  );
}
