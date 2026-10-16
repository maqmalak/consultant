import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/format";

export type Col = {
  fieldname: string;
  label: string;
  type: "data" | "currency" | "percent" | "date" | "select";
  options?: string[];
  width?: string;
  required?: boolean;
};

type Row = Record<string, any>;

/** Editable grid for a Frappe child table. Rows keep their `name` so the server updates instead of re-inserting. */
export function ChildTable({ cols, rows, onChange, readOnly, totalOf, emptyHint }: {
  cols: Col[]; rows: Row[]; onChange: (rows: Row[]) => void; readOnly?: boolean; totalOf?: string; emptyHint?: string;
}) {
  const update = (i: number, field: string, value: unknown) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  const add = () => onChange([...rows, Object.fromEntries(cols.map((c) => [c.fieldname, c.type === "select" ? c.options?.[0] ?? "" : c.type === "currency" || c.type === "percent" ? 0 : ""]))]);
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));
  const total = totalOf ? rows.reduce((s, r) => s + (Number(r[totalOf]) || 0), 0) : null;
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="w-8 px-2 py-2 text-start text-xs font-semibold text-muted-foreground">#</th>
              {cols.map((c) => (
                <th key={c.fieldname} className="px-2 py-2 text-start text-xs font-semibold text-muted-foreground" style={{ minWidth: c.width ?? "120px" }}>
                  {c.label}{c.required && <span className="text-destructive"> *</span>}
                </th>
              ))}
              {!readOnly && <th className="w-10" />}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 && (
              <tr><td colSpan={cols.length + 2} className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyHint ?? "No rows yet."}</td></tr>
            )}
            {rows.map((r, i) => (
              <tr key={r.name ?? `new-${i}`}>
                <td className="px-2 py-1.5 text-xs text-muted-foreground">{i + 1}</td>
                {cols.map((c) => (
                  <td key={c.fieldname} className="px-1.5 py-1">
                    {readOnly ? (
                      <span className={c.type === "currency" ? "tabular-nums" : ""}>{c.type === "currency" ? money(r[c.fieldname]) : r[c.fieldname] ?? ""}</span>
                    ) : c.type === "select" ? (
                      <select aria-label={c.label} className="field h-9 px-2" value={r[c.fieldname] ?? ""} onChange={(e) => update(i, c.fieldname, e.target.value)}>
                        {(c.options ?? []).map((o) => <option key={o} value={o}>{o || "—"}</option>)}
                      </select>
                    ) : (
                      <input aria-label={c.label} className={`field h-9 px-2 ${c.type === "currency" || c.type === "percent" ? "text-end tabular-nums" : ""}`}
                        type={c.type === "date" ? "date" : c.type === "data" ? "text" : "number"} step={c.type === "percent" ? "0.01" : "1"} min={c.type === "data" || c.type === "date" ? undefined : 0}
                        value={r[c.fieldname] ?? ""} onChange={(e) => update(i, c.fieldname, c.type === "currency" || c.type === "percent"
                          ? (e.target.value === "" ? 0 : Number(e.target.value)) : e.target.value)} />
                    )}
                  </td>
                ))}
                {!readOnly && (
                  <td className="px-1"><button type="button" onClick={() => remove(i)} aria-label={`Remove row ${i + 1}`}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-4 w-4" /></button></td>
                )}
              </tr>
            ))}
          </tbody>
          {total !== null && rows.length > 0 && (
            <tfoot><tr className="border-t bg-muted/40 font-semibold">
              <td colSpan={cols.findIndex((c) => c.fieldname === totalOf) + 1} className="px-3 py-2 text-end text-xs">Total</td>
              <td className="px-3 py-2 tabular-nums">{money(total)}</td><td colSpan={cols.length} />
            </tr></tfoot>
          )}
        </table>
      </div>
      {!readOnly && <Button type="button" size="sm" variant="outline" onClick={add}><Plus className="h-4 w-4" /> Add row</Button>}
    </div>
  );
}
