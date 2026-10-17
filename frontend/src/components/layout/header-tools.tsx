/**
 * Portal header tools (ported from the realestate header): notification bell (Frappe Notification Log), the user menu
 * with sign out / switch account, and the awesome bar — Ctrl+K search over pages, quick actions and records.
 */
import {
  Bell, BellRing, CheckCheck, CornerDownLeft, ExternalLink, FilePlus2, FileText, Globe, LayoutGrid, LogOut, MessageCircle, Search,
  Settings2, ShieldCheck, Upload, User, UserPlus, Users, type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { CLIENT_NAV, STAFF_NAV } from "@/app/nav";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/cn";
import { useApi } from "@/lib/use-api";
import { apiCall } from "@/services/frappe";
import { useSite } from "./brand";

const N = "pakistan_tax_consultancy.api.notifications";

function useOutside(open: boolean, close: () => void) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) close(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", click);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", click); document.removeEventListener("keydown", esc); };
  }, [open, close]);
  return box;
}

const ago = (v: string) => {
  const s = (Date.now() - new Date(v.replace(" ", "T")).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(v.replace(" ", "T")).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

// ------------------------------------------------------------------------------------------------ bell
interface Note { name: string; subject: string; email_content: string; type: string; read: number; creation: string; href: string | null }

export function NotificationsBell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { data, mutate } = useApi<{ items: Note[]; unread: number }>(`${N}.bell`, undefined, { refreshInterval: 30_000 });
  const box = useOutside(open, () => setOpen(false));
  const unread = data?.unread ?? 0;
  const read = async (n?: Note) => {
    if (!n || !n.read) await apiCall(`${N}.mark_read`, n ? { name: n.name } : {}).catch(() => null);
    void mutate();
    if (n?.href) { setOpen(false); navigate(n.href); }
  };
  return (
    <div ref={box} className="relative">
      <button className="relative rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={t("Notifications")}
        aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {unread ? <BellRing className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
        {unread > 0 && <span className="absolute end-1 top-1 grid min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-4 text-white">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <div className="absolute end-0 top-full z-50 mt-2 w-[22rem] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border bg-popover shadow-2xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-semibold">{t("Notifications")}
              {unread > 0 && <span className="rounded-full bg-primary/10 px-1.5 text-[10px] text-primary">{unread} {t("new")}</span>}</p>
            {unread > 0 && <button className="flex items-center gap-1 text-xs font-medium text-primary hover:underline" onClick={() => void read()}>
              <CheckCheck className="h-3.5 w-3.5" /> {t("Mark all read")}</button>}
          </div>
          <ul className="max-h-[26rem] divide-y overflow-y-auto">
            {!data?.items.length && <li className="px-4 py-10 text-center text-sm text-muted-foreground"><Bell className="mx-auto mb-2 h-6 w-6 opacity-40" />{t("You're all caught up")}</li>}
            {data?.items.map((n) => (
              <li key={n.name}>
                <button className={cn("flex w-full gap-3 px-4 py-3 text-start hover:bg-accent", !n.read && "bg-primary/[0.04]")} onClick={() => void read(n)}>
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-primary")} />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-sm leading-snug", !n.read && "font-semibold")}>{n.subject}</span>
                    {n.email_content && n.email_content !== n.subject && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{n.email_content}</span>}
                    <span className="mt-1 block text-[11px] text-muted-foreground">{ago(n.creation)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ user menu
export function UserMenu({ staff }: { staff: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { me, logout, hasRole } = useAuth();
  const [open, setOpen] = useState(false);
  const box = useOutside(open, () => setOpen(false));
  const name = me?.full_name || me?.user || "";
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
  const role = (me?.roles ?? []).find((r) => ["Tax Admin", "Tax Consultant", "Tax Reviewer", "Tax Approver", "Filing Officer", "Field Officer", "System Manager"].includes(r));
  // a full reload after sign-out drops every cached screen of the previous user; sign out even if the call fails
  const signOut = (switching = false) => {
    setOpen(false);
    void logout().catch(() => undefined).finally(() => window.location.assign(`/portal/login${switching ? "?switch=1" : ""}`));
  };
  const item = "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-accent";
  const go = (to: string) => { setOpen(false); navigate(to); };
  return (
    <div ref={box} className="relative">
      <button className="flex items-center gap-2 rounded-full p-0.5 pe-2 hover:bg-accent" aria-label={t("Account")} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-[#f3d77a] via-[#d4af37] to-[#9c7a22] text-xs font-bold text-[#141416]">{initials}</span>
        <span className="hidden max-w-[9rem] truncate text-sm font-medium md:block">{name.split(" ")[0]}</span>
      </button>
      {open && (
        <div className="absolute end-0 top-full z-50 mt-2 w-64 rounded-2xl border bg-popover p-1.5 shadow-2xl">
          <div className="flex items-center gap-3 px-3 py-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#f3d77a] via-[#d4af37] to-[#9c7a22] text-sm font-bold text-[#141416]">{initials}</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{name}</p>
              <p className="truncate text-xs text-muted-foreground">{me?.user}</p>
              <p className="mt-0.5 text-[11px] font-medium text-primary">{staff ? role ?? t("Staff") : t("Client")}</p>
            </div>
          </div>
          <div className="my-1 h-px bg-border" />
          {staff ? (
            <>
              <button className={item} onClick={() => go("/staff")}><LayoutGrid className="h-4 w-4 text-muted-foreground" /> {t("Home")}</button>
              <button className={item} onClick={() => go("/staff/vault")}><ShieldCheck className="h-4 w-4 text-muted-foreground" /> {t("Document vault")}</button>
              {hasRole("Tax Admin", "System Manager") && <button className={item} onClick={() => go("/staff/settings")}><Settings2 className="h-4 w-4 text-muted-foreground" /> {t("Settings")}</button>}
              {hasRole("Tax Admin", "System Manager") && <a className={item} href="/app/pakistan-income-tax-consultancy"><ExternalLink className="h-4 w-4 text-muted-foreground" /> {t("ERPNext desk")}</a>}
            </>
          ) : (
            <>
              <button className={item} onClick={() => go("/profile")}><User className="h-4 w-4 text-muted-foreground" /> {t("My profile")}</button>
              <button className={item} onClick={() => go("/vault")}><ShieldCheck className="h-4 w-4 text-muted-foreground" /> {t("Document vault")}</button>
            </>
          )}
          <a className={item} href="/"><Globe className="h-4 w-4 text-muted-foreground" /> {t("Visit website")}</a>
          <div className="my-1 h-px bg-border" />
          <button className={item} onClick={() => signOut(true)}><Users className="h-4 w-4 text-muted-foreground" /> {t("Sign in as someone else")}</button>
          <button className={cn(item, "text-rose-600 dark:text-rose-400")} onClick={() => signOut()}><LogOut className="h-4 w-4" /> {t("Sign out")}</button>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ awesome bar
interface Hit { kind: string; title: string; hint?: string; href: string; icon?: LucideIcon; external?: boolean }

function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => { const id = setTimeout(() => setV(value), ms); return () => clearTimeout(id); }, [value, ms]);
  return v;
}

export function AwesomeBar({ staff }: { staff: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const site = useSite().data;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const query = useDebounced(q.trim());
  const remote = useApi<Hit[]>(open && query.length >= 2 ? `${N}.search` : null, { q: query });

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
      else if (e.key === "/" && !open && !(e.target as HTMLElement)?.closest("input,textarea,select,[contenteditable]")) { e.preventDefault(); setOpen(true); }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [open]);
  useEffect(() => { if (!open) { setQ(""); setActive(0); } }, [open]);

  const local = useMemo<Hit[]>(() => {
    const pages: Hit[] = staff
      ? STAFF_NAV.flatMap((g) => g.items).filter((i) => hasRole(...i.roles)).map((i) => ({ kind: "Page", title: i.label, hint: i.hint, href: i.path, icon: i.icon }))
      : CLIENT_NAV.map((i) => ({ kind: "Page", title: t(i.label), href: i.path, icon: i.icon }));
    const wa = site?.whatsapp ? `https://wa.me/${site.whatsapp.replace(/\D/g, "")}` : null;
    const actions: Hit[] = staff
      ? [
          hasRole("Tax Admin", "Tax Consultant", "Field Officer", "System Manager") && { kind: "Action", title: "New client", hint: "Register in the office", href: "/staff/clients/new", icon: UserPlus },
          { kind: "Action", title: "Generate a document", hint: "Authority letter, summary, checklist…", href: "/staff/vault", icon: FilePlus2 },
          hasRole("Tax Admin", "Tax Consultant", "Tax Reviewer", "Field Officer", "System Manager") && { kind: "Action", title: "WhatsApp inbox", hint: "Team chats", href: "/staff/inbox", icon: MessageCircle },
        ].filter(Boolean) as Hit[]
      : [
          { kind: "Action", title: t("Upload documents"), href: "/documents", icon: Upload },
          { kind: "Action", title: t("Generate a document"), hint: t("Authority letter, summary, checklist…"), href: "/vault", icon: FilePlus2 },
          ...(wa ? [{ kind: "Action", title: t("WhatsApp us"), href: wa, icon: MessageCircle, external: true }] : []),
        ];
    const needle = q.trim().toLowerCase();
    return [...actions, ...pages].filter((h) => !needle || `${h.title} ${h.hint ?? ""}`.toLowerCase().includes(needle)).slice(0, needle ? 8 : 12);
  }, [staff, hasRole, t, q, site?.whatsapp]);

  const hits = [...local, ...(query.length >= 2 ? remote.data ?? [] : [])];
  const pick = (h: Hit) => {
    setOpen(false);
    if (h.external || h.href.startsWith("http") || (!staff && h.href === "/faq")) window.open(h.href, h.href.startsWith("http") ? "_blank" : "_self");
    else navigate(h.href);
  };
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <>
      <button onClick={() => setOpen(true)} aria-label={t("Search")}
        className="flex h-9 items-center gap-2 rounded-lg border bg-muted/40 px-2.5 text-sm text-muted-foreground transition hover:border-primary/40 hover:bg-accent sm:w-56 lg:w-72">
        <Search className="h-4 w-4" />
        <span className="hidden flex-1 text-start sm:block">{staff ? t("Search clients, returns…") : t("Search…")}</span>
        <kbd className="hidden rounded border bg-background px-1.5 text-[10px] font-semibold sm:block">{isMac ? "⌘" : "Ctrl"} K</kbd>
      </button>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 p-3 pt-[10vh] backdrop-blur-sm" onMouseDown={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label={t("Search")} onMouseDown={(e) => e.stopPropagation()}
            className="w-full max-w-xl overflow-hidden rounded-2xl border bg-popover shadow-2xl">
            <div className="flex items-center gap-3 border-b px-4">
              <Search className="h-5 w-5 text-muted-foreground" />
              <input autoFocus className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
                placeholder={staff ? t("Type a name, CNIC, return or page…") : t("Search pages, returns, documents…")} value={q}
                onChange={(e) => { setQ(e.target.value); setActive(0); }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                  else if (e.key === "Enter" && hits[active]) { e.preventDefault(); pick(hits[active]); }
                  else if (e.key === "Escape") setOpen(false);
                }} />
              <kbd className="rounded border px-1.5 text-[10px] font-semibold text-muted-foreground">Esc</kbd>
            </div>
            <ul className="max-h-[60vh] overflow-y-auto p-2">
              {hits.map((h, i) => {
                const Icon = h.icon ?? (h.kind === "Client" ? Users : h.kind === "Document" ? FileText : h.kind === "Tax return" ? FileText : Search);
                const header = i === 0 || hits[i - 1].kind !== h.kind;
                return (
                  <li key={`${h.kind}:${h.href}:${h.title}`}>
                    {header && <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{t(h.kind === "Page" ? "Pages" : h.kind === "Action" ? "Quick actions" : h.kind)}</p>}
                    <button onMouseEnter={() => setActive(i)} onClick={() => pick(h)}
                      className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start", i === active ? "bg-accent" : "hover:bg-accent/60")}>
                      <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", h.kind === "Action" ? "bg-[#d4af37]/15 text-[#8a6914] dark:text-[#f3d77a]" : "bg-muted text-muted-foreground")}><Icon className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{h.title}</span>
                        {h.hint && <span className="block truncate text-xs text-muted-foreground">{h.hint}</span>}</span>
                      {i === active && <CornerDownLeft className="h-4 w-4 text-muted-foreground" />}
                    </button>
                  </li>
                );
              })}
              {(q.trim() !== query || remote.isLoading) && q.trim().length >= 2 && <li className="px-3 py-3 text-sm text-muted-foreground">{t("Searching…")}</li>}
              {!hits.length && q.trim() === query && !remote.isLoading && <li className="px-3 py-10 text-center text-sm text-muted-foreground">{t("No results for")} “{q}”</li>}
            </ul>
            <div className="flex items-center gap-4 border-t px-4 py-2 text-[11px] text-muted-foreground">
              <span>↑↓ {t("to move")}</span><span>↵ {t("to open")}</span><span className="ms-auto">{t("Tip: press / anywhere")}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
