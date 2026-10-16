import { Check, X } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import { STEPS } from "./progress-tracker";

const HINTS: Record<string, string> = {
  Account: "Account created and mobile verified",
  Documents: "Documents uploaded and checked",
  "In preparation": "Consultant prepares the return",
  "In review": "A second consultant checks it",
  "Your confirmation": "You confirm the summary",
  Filed: "Filed on FBR IRIS",
  "Acknowledgment received": "IRIS acknowledgment sent to you",
};

function when(value?: string | null) {
  if (!value) return null;
  const d = new Date(value.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Vertical progress card (one row per step of the client journey): done = filled check, current = ringed
 * (red cross when something needs attention), ahead = hollow number. Dates come from the audit trail.
 */
export function FilingProgress({ step, dates, problem = false, title, footer, className }: {
  step: number; dates?: (string | null)[]; problem?: boolean; title?: string; footer?: ReactNode; className?: string;
}) {
  const { t } = useTranslation();
  const finished = step >= STEPS.length - 1;
  return (
    <section className={cn("rounded-lg border bg-card p-5 text-card-foreground shadow-sm", className)} aria-label={title ?? t("Filing progress")}>
      <h2 className="mb-4 text-sm font-semibold">{title ?? t("Filing progress")}</h2>
      <ol>
        {STEPS.map((name, i) => {
          const done = i < step || finished;
          const current = i === step && !finished;
          const last = i === STEPS.length - 1;
          const date = when(dates?.[i]);
          return (
            <li key={name} className="relative flex gap-3 pb-5 last:pb-0" aria-current={current ? "step" : undefined}>
              {!last && (
                <span aria-hidden className={cn("absolute start-[13px] top-7 h-[calc(100%-1.75rem)] w-0.5",
                  i < step || finished ? "bg-primary" : "bg-border")} />
              )}
              <span className={cn("relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-semibold",
                done && "border-primary bg-primary text-primary-foreground",
                current && !problem && "border-primary bg-card text-primary ring-4 ring-primary/20",
                current && problem && "border-destructive bg-destructive text-white ring-4 ring-destructive/20",
                !done && !current && "border-border bg-card text-muted-foreground")}>
                {done ? <Check className="h-4 w-4" strokeWidth={3} /> : current && problem ? <X className="h-4 w-4" strokeWidth={3} /> : i + 1}
              </span>
              <div className="min-w-0 pt-0.5">
                <p className={cn("text-sm font-medium", done || current ? "text-foreground" : "text-muted-foreground")}>{t(name)}</p>
                <p className="text-xs text-muted-foreground">
                  {current ? (problem ? t("Needs attention") : t("Current stage")) : done && date ? date : t(HINTS[name] ?? "")}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      {footer && <div className="mt-4 border-t pt-3 text-sm">{footer}</div>}
    </section>
  );
}
