/**
 * Drag-and-drop kanban board (ported from the realestate CRM KanbanBoard; native HTML5 DnD, no extra dependency).
 * Cards are grouped by `groupField`; dropping a card on another column calls `onCardMove` so the caller persists it.
 */
import { useMemo, useState, type ReactNode } from "react";
import { Empty, Loading } from "@/components/common/states";
import { cn } from "@/lib/cn";

export interface KanbanColumnDef { value: string; title?: string; color?: string; footer?: ReactNode }

// Frappe CRM status colours -> dot / top border
export const CRM_COLORS: Record<string, string> = {
  black: "bg-slate-900 dark:bg-slate-200", gray: "bg-slate-400", blue: "bg-sky-500", green: "bg-emerald-500", red: "bg-rose-500",
  pink: "bg-pink-500", orange: "bg-orange-500", amber: "bg-amber-500", yellow: "bg-yellow-400", cyan: "bg-cyan-500",
  teal: "bg-teal-500", violet: "bg-violet-500", purple: "bg-purple-500",
};

export function KanbanBoard<T extends Record<string, any>>({ columns, rows, groupField, rowKey, renderCard, onCardMove, loading, emptyHint }: {
  columns: KanbanColumnDef[];
  rows: T[];
  groupField: keyof T;
  rowKey: (row: T) => string;
  renderCard: (row: T) => ReactNode;
  onCardMove: (row: T, column: string) => void | Promise<void>;
  loading?: boolean;
  emptyHint?: string;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const grouped = useMemo(() => {
    const map = new Map<string, T[]>(columns.map((c) => [c.value, []]));
    rows.forEach((r) => { const k = String(r[groupField] ?? ""); if (!map.has(k)) map.set(k, []); map.get(k)!.push(r); });
    return map;
  }, [rows, columns, groupField]);
  const byKey = useMemo(() => new Map(rows.map((r) => [rowKey(r), r])), [rows, rowKey]);

  const drop = (column: string) => {
    setOver(null);
    const row = dragging ? byKey.get(dragging) : undefined;
    setDragging(null);
    if (row && String(row[groupField] ?? "") !== column) void onCardMove(row, column);
  };

  if (loading) return <Loading />;
  if (!rows.length) return <Empty title="No deals yet" hint={emptyHint} />;
  return (
    <div className="flex gap-4 overflow-x-auto pb-3">
      {columns.map((col) => {
        const items = grouped.get(col.value) ?? [];
        return (
          <div key={col.value}
            className={cn("flex w-72 shrink-0 flex-col rounded-2xl border bg-muted/40 transition-colors", over === col.value && "border-primary bg-primary/5")}
            onDragOver={(e) => { e.preventDefault(); if (over !== col.value) setOver(col.value); }}
            onDragLeave={() => setOver((c) => (c === col.value ? null : c))}
            onDrop={(e) => { e.preventDefault(); drop(col.value); }}>
            <div className="flex items-center justify-between gap-2 rounded-t-2xl border-b bg-card px-3 py-2.5">
              <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", CRM_COLORS[col.color ?? "gray"] ?? CRM_COLORS.gray)} />
                <span className="truncate">{col.title ?? col.value}</span>
              </span>
              <span className="rounded-full bg-muted px-2 text-xs font-semibold text-muted-foreground">{items.length}</span>
            </div>
            {col.footer && <div className="border-b px-3 py-1.5 text-xs text-muted-foreground">{col.footer}</div>}
            <div className="flex min-h-[8rem] flex-1 flex-col gap-2 p-2">
              {items.map((row) => (
                <div key={rowKey(row)} draggable onDragStart={(e) => { setDragging(rowKey(row)); e.dataTransfer.effectAllowed = "move"; }}
                  onDragEnd={() => { setDragging(null); setOver(null); }}
                  className={cn("cursor-grab active:cursor-grabbing", dragging === rowKey(row) && "opacity-50")}>
                  {renderCard(row)}
                </div>
              ))}
              {!items.length && <p className="px-2 py-6 text-center text-xs text-muted-foreground">Drop a deal here</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
