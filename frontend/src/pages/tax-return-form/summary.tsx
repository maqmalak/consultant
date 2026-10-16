import { Card, CardContent } from "@/components/ui/card";
import { STEPS } from "./config";

export function StepSummary({ activeStep }: { activeStep: number }) {
  return (
    <Card>
      <CardContent className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-1.5 text-xs">
              <div
                className={`h-2 w-2 rounded-full ${i === activeStep ? "bg-brand-600" : i < activeStep ? "bg-green-500" : "bg-slate-300"}`}
                aria-hidden="true"
              />
              <span className={i === activeStep ? "font-medium text-slate-800" : "text-slate-500"}>{s}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
