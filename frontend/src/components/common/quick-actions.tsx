import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/cn";

export interface QuickAction {
  label: string;
  hint?: string;
  icon: LucideIcon;
  to?: string;
  href?: string;
  onClick?: () => void;
  badge?: number | string | null;
  tone?: "primary" | "amber" | "rose" | "emerald" | "sky" | "violet" | "slate" | "whatsapp";
  highlight?: boolean;
}

const TONES: Record<NonNullable<QuickAction["tone"]>, string> = {
  primary: "bg-primary/10 text-primary", amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  rose: "bg-rose-500/15 text-rose-600 dark:text-rose-400", emerald: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  sky: "bg-sky-500/15 text-sky-600 dark:text-sky-400", violet: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  slate: "bg-slate-500/15 text-slate-600 dark:text-slate-300", whatsapp: "bg-[#25D366]/15 text-[#128C7E] dark:text-[#25D366]",
};

/** Big, plain tiles for the most common jobs — one tap, a short hint, an optional count. */
export function QuickActions({ actions, title = "Quick actions", columns = "sm:grid-cols-3 lg:grid-cols-4" }: {
  actions: QuickAction[]; title?: string; columns?: string;
}) {
  const items = actions.filter(Boolean);
  if (!items.length) return null;
  return (
    <section aria-label={title} className="space-y-2.5">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{title}</h2>
      <div className={cn("grid grid-cols-2 gap-3", columns)}>
        {items.map((a) => {
          const body = (
            <>
              <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", TONES[a.tone ?? "primary"])}>
                <a.icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1 text-start">
                <span className="block truncate text-sm font-semibold">{a.label}</span>
                {a.hint && <span className="block truncate text-xs text-muted-foreground">{a.hint}</span>}
              </span>
              {a.badge ? <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground tabular-nums">{a.badge}</span> : null}
            </>
          );
          const cls = cn("flex min-h-[64px] items-center gap-3 rounded-xl border bg-card p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            a.highlight && "border-primary ring-2 ring-primary/25");
          if (a.to) return <Link key={a.label} to={a.to} className={cls}>{body}</Link>;
          if (a.href) return <a key={a.label} href={a.href} target={a.href.startsWith("http") ? "_blank" : undefined} rel="noopener" className={cls}>{body}</a>;
          return <button key={a.label} type="button" onClick={a.onClick} className={cls}>{body}</button>;
        })}
      </div>
    </section>
  );
}
