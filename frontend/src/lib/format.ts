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

const pkr = new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 });

/** "Rs 1,250,000", or "Rs 12.5 Lac" / "Rs 1.25 Cr" when compact. */
export function money(value: number | null | undefined, opts: { compact?: boolean } = {}): string {
  const v = value ?? 0;
  if (opts.compact) {
    if (Math.abs(v) >= 1e7) return `Rs ${(v / 1e7).toFixed(2)} Cr`;
    if (Math.abs(v) >= 1e5) return `Rs ${(v / 1e5).toFixed(1)} Lac`;
  }
  return `Rs ${pkr.format(v)}`;
}

export function num(value: number | null | undefined): string {
  return pkr.format(value ?? 0);
}
