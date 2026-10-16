import { Check, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import { STEPS } from "./progress-tracker";

/**
 * Compact circle chain for tables: one dot per step of the client journey (Account → … → Acknowledgment received).
 * Done = filled, current = ringed, ahead = hollow; `problem` marks the current step red (changes required / filing error).
 */
export function StepChain({ step, problem = false, label }: { step: number; problem?: boolean; label?: string }) {
  const { t } = useTranslation();
  const finished = step >= STEPS.length - 1;
  const title = `${label ? label + " · " : ""}${t(STEPS[Math.min(step, STEPS.length - 1)])}`;
  return (
    <div className="flex items-center" role="img" aria-label={title} title={title}>
      {STEPS.map((name, i) => {
        const done = i < step || finished;
        const current = i === step && !finished;
        return (
          <span key={name} className="flex items-center">
            {i > 0 && <span className={cn("h-0.5 w-2.5 sm:w-3.5", i <= step ? (problem && i === step ? "bg-destructive" : "bg-primary") : "bg-border")} />}
            <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 text-[8px] font-bold",
              done && "border-primary bg-primary text-primary-foreground",
              current && !problem && "border-primary bg-primary/15 ring-2 ring-primary/25",
              current && problem && "border-destructive bg-destructive text-white ring-2 ring-destructive/25",
              !done && !current && "border-border bg-card")}>
              {done ? <Check className="h-2.5 w-2.5" strokeWidth={3.5} /> : current && problem ? <X className="h-2.5 w-2.5" strokeWidth={3.5} /> : null}
            </span>
          </span>
        );
      })}
    </div>
  );
}

/** Same mapping as api/portal.py STEP_OF: workflow state -> step of the client journey. */
export const STATE_STEP: Record<string, number> = {
  "Documents Pending": 1, Draft: 2, "Changes Required": 2, "Pending Review": 3, "Under Review": 3, Reviewed: 3,
  "Awaiting Client Confirmation": 4, Approved: 5, "Submitted to FBR": 5, "Filing Error": 5, Acknowledged: 6, Closed: 6,
};
export const PROBLEM_STATES = ["Changes Required", "Filing Error"];
