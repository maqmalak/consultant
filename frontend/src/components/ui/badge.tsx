import { cn } from "@/lib/cn";

type Variant = "neutral" | "info" | "success" | "warning" | "danger" | "brand";

const variants: Record<Variant, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  info: "bg-blue-50 text-blue-700 ring-blue-200",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warning: "bg-amber-50 text-amber-700 ring-amber-200",
  danger: "bg-red-50 text-red-700 ring-red-200",
  brand: "bg-brand-50 text-brand-700 ring-brand-200",
};

export function Badge({
  variant = "neutral",
  className,
  children,
}: {
  variant?: Variant;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Map a Tax Return workflow state / filing status to a badge variant. */
export function stateVariant(state?: string): Variant {
  const s = (state || "").toLowerCase();
  if (s.includes("filed") || s.includes("acknowledged") || s.includes("reviewed") || s.includes("approved"))
    return "success";
  if (s.includes("reject") || s.includes("error")) return "danger";
  if (s.includes("changes") || s.includes("pending") || s.includes("awaiting")) return "warning";
  if (s.includes("review")) return "info";
  if (s.includes("draft") || s.includes("documents")) return "neutral";
  return "brand";
}
