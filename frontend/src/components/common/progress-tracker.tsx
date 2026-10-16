import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";

export const STEPS = ["Account", "Documents", "In preparation", "In review", "Your confirmation", "Filed", "Acknowledgment received"];

/** Where a return is, from account to IRIS acknowledgment. `step` is the index of the current step. */
export function ProgressTracker({ step, compact = false }: { step: number; compact?: boolean }) {
  const { t } = useTranslation();
  return (
    <ol className={cn("grid gap-1", compact ? "grid-cols-7" : "grid-cols-7")} aria-label="Progress">
      {STEPS.map((label, i) => {
        const done = i < step || step === STEPS.length - 1;
        const current = i === step && step !== STEPS.length - 1;
        return (
          <li key={label} className="flex min-w-0 flex-col items-center gap-1.5 text-center" aria-current={current ? "step" : undefined}>
            <div className="flex w-full items-center">
              <span className={cn("h-0.5 flex-1", i === 0 ? "invisible" : done || current ? "bg-primary" : "bg-border")} />
              <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold",
                done ? "border-primary bg-primary text-primary-foreground" : current
                  ? "border-primary bg-primary/15 text-primary ring-4 ring-primary/15" : "border-border bg-card text-muted-foreground")}>
                {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={cn("h-0.5 flex-1", i === STEPS.length - 1 ? "invisible" : done ? "bg-primary" : "bg-border")} />
            </div>
            {!compact && (
              <span className={cn("hidden text-[11px] leading-tight sm:block", current ? "font-semibold text-foreground" : "text-muted-foreground")}>
                {t(label)}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
