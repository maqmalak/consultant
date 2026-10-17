import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export type TabTone = "gold" | "sky" | "emerald" | "violet" | "rose" | "amber" | "whatsapp" | "slate" | "indigo";

const TONES: Record<TabTone, { on: string; icon: string; badge: string }> = {
  gold: { on: "bg-gradient-to-br from-[#f3d77a] via-[#d4af37] to-[#b8912a] text-[#141416] shadow-[0_6px_18px_-6px_rgba(212,175,55,0.7)]", icon: "text-[#b8912a] dark:text-[#f3d77a]", badge: "bg-[#141416]/15" },
  sky: { on: "bg-gradient-to-br from-sky-400 to-sky-600 text-white shadow-[0_6px_18px_-6px_rgba(14,165,233,0.7)]", icon: "text-sky-500", badge: "bg-white/25" },
  emerald: { on: "bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-[0_6px_18px_-6px_rgba(16,185,129,0.7)]", icon: "text-emerald-500", badge: "bg-white/25" },
  violet: { on: "bg-gradient-to-br from-violet-400 to-violet-600 text-white shadow-[0_6px_18px_-6px_rgba(139,92,246,0.7)]", icon: "text-violet-500", badge: "bg-white/25" },
  rose: { on: "bg-gradient-to-br from-rose-400 to-rose-600 text-white shadow-[0_6px_18px_-6px_rgba(244,63,94,0.7)]", icon: "text-rose-500", badge: "bg-white/25" },
  amber: { on: "bg-gradient-to-br from-amber-300 to-amber-500 text-[#141416] shadow-[0_6px_18px_-6px_rgba(245,158,11,0.7)]", icon: "text-amber-500", badge: "bg-[#141416]/15" },
  whatsapp: { on: "bg-gradient-to-br from-[#25D366] to-[#128C7E] text-white shadow-[0_6px_18px_-6px_rgba(37,211,102,0.7)]", icon: "text-[#128C7E] dark:text-[#25D366]", badge: "bg-white/25" },
  slate: { on: "bg-gradient-to-br from-slate-500 to-slate-700 text-white shadow-[0_6px_18px_-6px_rgba(71,85,105,0.7)]", icon: "text-slate-500", badge: "bg-white/25" },
  indigo: { on: "bg-gradient-to-br from-indigo-400 to-indigo-600 text-white shadow-[0_6px_18px_-6px_rgba(99,102,241,0.7)]", icon: "text-indigo-500", badge: "bg-white/25" },
};

export interface ColorTab<K extends string> { key: K; label: string; icon?: LucideIcon; tone?: TabTone; count?: number | null }

/** Rounded, coloured tab bar: each tab keeps its own colour and icon; the active one fills with it. Scrolls on phones. */
export function ColorTabs<K extends string>({ tabs, value, onChange, className }: {
  tabs: ColorTab<K>[]; value: K; onChange: (key: K) => void; className?: string;
}) {
  return (
    <div role="tablist" className={cn("flex gap-1.5 overflow-x-auto rounded-2xl border bg-muted/40 p-1.5", className)}>
      {tabs.map((t) => {
        const tone = TONES[t.tone ?? "gold"];
        const on = t.key === value;
        return (
          <button key={t.key} role="tab" aria-selected={on} type="button" onClick={() => onChange(t.key)}
            className={cn("flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all duration-200",
              on ? tone.on : "text-muted-foreground hover:bg-card hover:text-foreground hover:shadow-sm")}>
            {t.icon && <t.icon className={cn("h-4 w-4", !on && tone.icon)} />}
            {t.label}
            {t.count ? <span className={cn("rounded-full px-1.5 text-[11px] font-bold", on ? tone.badge : "bg-muted")}>{t.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
