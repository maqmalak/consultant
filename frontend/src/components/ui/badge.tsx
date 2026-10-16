import { cn } from "@/lib/cn";

type Variant = "neutral" | "info" | "success" | "warning" | "danger" | "brand";

const variants: Record<Variant, string> = {
  neutral: "bg-muted text-muted-foreground ring-border",
  info: "bg-blue-500/15 text-blue-700 ring-blue-500/30 dark:text-blue-300",
  success: "bg-emerald-500/15 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300",
  warning: "bg-amber-500/15 text-amber-800 ring-amber-500/30 dark:text-amber-300",
  danger: "bg-red-500/15 text-red-700 ring-red-500/30 dark:text-red-300",
  brand: "bg-primary/15 text-primary ring-primary/30",
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
