import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export interface AuditRow {
  at: string;
  action: string;
  from: string;
  to: string;
  comments: string;
}

export function TransitionBanner({
  error,
  submitting,
  onDismiss,
}: {
  error: Error | null;
  submitting: boolean;
  onDismiss: () => void;
}) {
  if (!error) return null;
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {submitting ? (
        <>
          <Spinner className="h-4 w-4 animate-spin" />
          Transitioning…
        </>
      ) : (
        <>
          {error.message}{" "}
          <button className="underline" onClick={onDismiss}>Dismiss</button>
        </>
      )}
    </div>
  );
}

export function AuditLog({ rows }: { rows: AuditRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4">
      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Transition log</p>
      <ul className="mt-2 space-y-2 text-sm">
        {rows.map((r, i) => (
          <li key={i} className="flex gap-2 text-slate-600">
            <span className="font-mono text-xs text-slate-400">{r.at}</span>
            <span className="text-slate-700">{r.action}</span>
            <span className="ml-auto text-xs text-slate-400">{r.from} → {r.to}</span>
            {r.comments ? <span className="text-xs text-slate-400">({r.comments})</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
