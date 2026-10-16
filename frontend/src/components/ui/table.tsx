import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import { cn } from "@/lib/cn";

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className={cn("min-w-full divide-y divide-slate-200 text-sm", className)}>
        {children}
      </table>
    </div>
  );
}

export function TH({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500",
        className,
      )}
      scope="col"
    >
      {children}
    </th>
  );
}

export function TD({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3 align-middle text-slate-700", className)}>{children}</td>;
}

export function TR({ children, className }: { children: ReactNode; className?: string }) {
  return <tr className={cn("border-b border-slate-100 last:border-0", className)}>{children}</tr>;
}

/** Empty / no-results state row spanning the full table width. */
export function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-slate-400">
        <Inbox className="mx-auto mb-2 h-6 w-6" aria-hidden="true" />
        {message}
      </td>
    </tr>
  );
}

/** Simple offset pagination for server-side limits (20 rows/page). */
export function Pagination({
  start,
  limit,
  total,
  onChange,
}: {
  start: number;
  limit: number;
  total?: number;
  onChange: (start: number) => void;
}) {
  const page = Math.floor(start / limit) + 1;
  const hasPrev = start > 0;
  const hasNext = total !== undefined ? start + limit < total : true;
  return (
    <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
      <span>
        Page {page}
        {total !== undefined ? ` of ${Math.max(1, Math.ceil(total / limit))}` : ""}
        {total !== undefined ? ` · ${total} records` : ""}
      </span>
      <div className="flex gap-2">
        <button
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          disabled={!hasPrev}
          onClick={() => onChange(Math.max(0, start - limit))}
        >
          <ChevronLeft className="h-4 w-4" /> Prev
        </button>
        <button
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          disabled={!hasNext}
          onClick={() => onChange(start + limit)}
        >
          Next <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
