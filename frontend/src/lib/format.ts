/** Formatting helpers (PKR currency, dates) shared across pages. */

const currencyFmt = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

export function formatCurrency(value?: number | null): string {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return "—";
  return `PKR ${currencyFmt.format(Number(value))}`;
}

export function formatDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/** Normalize SDK/REST payloads: some unwrap `message`, some don't. */
export function unwrap<T>(data: unknown): T | undefined {
  if (data === undefined || data === null) return undefined;
  if (typeof data === "object" && "message" in (data as Record<string, unknown>)) {
    return (data as { message: T }).message;
  }
  return data as T;
}
