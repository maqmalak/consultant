import { BookMarked, CheckCircle2, Download, FileSpreadsheet, PlayCircle, Upload } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { StateBadge } from "@/components/common/state-badge";
import { InlineError } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TD, TH, TR } from "@/components/ui/table";
import { M } from "@/lib/api";
import { cn } from "@/lib/cn";
import { apiUpload } from "@/services/frappe";

type Status = "new" | "update" | "unchanged" | "error";
interface Row { row: number; label: string; status: Status; messages: string[]; name: string | null }
interface Result {
  dry_run: number; clients: Row[]; returns: Row[];
  summary: Record<"clients" | "returns", Record<Status, number>>;
}

const LABEL: Record<Status, string> = { new: "New", update: "Fill empty fields", unchanged: "No change", error: "Error" };
const BADGE: Record<Status, string> = { new: "Verified", update: "Pending", unchanged: "Draft", error: "Rejected" };
const DONE: Record<Status, string> = { new: "Created", update: "Updated", unchanged: "No change", error: "Not imported" };

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#141416] text-xs font-bold text-[#f3d77a]">{n}</span>
      <div className="min-w-0 flex-1 space-y-2"><p className="font-medium">{title}</p>{children}</div>
    </div>
  );
}

export function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [tab, setTab] = useState<"clients" | "returns">("clients");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);

  async function run(dry: number) {
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await apiUpload<Result>(`${M.STAFF}.import_excel`, file, { dry_run: String(dry) });
      setResult(r);
      if (!r.clients.length && r.returns.length) setTab("returns");
    } catch (e) { setErr(e); } finally { setBusy(false); }
  }
  const toSave = result ? (["clients", "returns"] as const).reduce((n, s) => n + result.summary[s].new + result.summary[s].update, 0) : 0;
  const rows = result?.[tab] ?? [];

  return (
    <div className="page-container space-y-5">
      <PageHeader title="Import data from Excel" subtitle="Your clients and their past and current returns · preview first, nothing is saved until you import"
        icon={<FileSpreadsheet className="h-5 w-5" />} />
      <Card className="space-y-5 p-5">
        <Step n={1} title="Download the template">
          <a className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent" href={`/api/method/${M.STAFF}.excel_template`}>
            <Download className="h-4 w-4" /> VVS_data_import_template.xlsx</a>
          <div className="flex flex-wrap gap-2 text-sm">
            <a className="inline-flex items-center gap-1.5 rounded-md border border-dashed px-3 py-1.5 hover:bg-accent" href="/assets/pakistan_tax_consultancy/help/VVS_import_example.xlsx">
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Filled example (7 clients, 13 returns)</a>
            <Link className="inline-flex items-center gap-1.5 rounded-md border border-dashed px-3 py-1.5 hover:bg-accent" to="/staff/help/guides?g=excel-import&play=1">
              <PlayCircle className="h-4 w-4 text-[#9c7a22]" /> Watch the video</Link>
            <a className="inline-flex items-center gap-1.5 rounded-md border border-dashed px-3 py-1.5 hover:bg-accent" href="/assets/pakistan_tax_consultancy/help/excel-import.pdf" target="_blank" rel="noreferrer">
              <BookMarked className="h-4 w-4 text-[#9c7a22]" /> Step-by-step guide (PDF)</a>
          </div>
          <p className="text-sm text-muted-foreground">Sheets: <b>Clients</b> (one row per client) and <b>Returns</b> (one row per client and tax year).
            The Instructions sheet explains every column; the coloured headers with * are required.</p>
        </Step>
        <Step n={2} title="Fill it in Excel">
          <ul className="list-disc space-y-1 ps-5 text-sm text-muted-foreground">
            <li><b>Filed</b>: a past return already filed on IRIS. It needs the IRIS acknowledgment number and the filing date, and is recorded as history.</li>
            <li><b>In progress</b>: this year's return. It starts in the portal with its document checklist.</li>
            <li>A client already in the portal (same CNIC, NTN, mobile or email) only gets its empty fields filled; nothing is overwritten.</li>
          </ul>
        </Step>
        <Step n={3} title="Upload, check the preview, then import">
          <input type="file" accept=".xlsx,.csv" aria-label="Filled template" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }}
            className="block text-sm file:me-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground" />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="default" disabled={!file} loading={busy && !result} onClick={() => void run(1)}><Upload className="h-4 w-4" /> Preview</Button>
            <Button size="default" disabled={!file || !result?.dry_run || !toSave} loading={busy && !!result} onClick={() => void run(0)}>
              Import {toSave} {toSave === 1 ? "row" : "rows"}</Button>
          </div>
          <InlineError error={err} />
        </Step>
      </Card>

      {result && (
        <div className="space-y-3">
          {!result.dry_run && (
            <p className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Import finished. Rows with an error were skipped: fix them in the file and import it again
              (rows already imported show as “No change”). <Link className="ms-auto font-medium text-primary hover:underline" to="/staff/clients">Clients →</Link>
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {(["clients", "returns"] as const).map((s) => (
              <button key={s} type="button" onClick={() => setTab(s)}
                className={cn("rounded-xl border px-4 py-2 text-start text-sm transition", tab === s ? "border-[#d4af37] bg-[#d4af37]/10" : "hover:bg-accent")}>
                <span className="block font-semibold capitalize">{s} · {result[s].length}</span>
                <span className="text-xs text-muted-foreground">
                  {result.summary[s].new} new · {result.summary[s].update} to fill · {result.summary[s].unchanged} no change ·{" "}
                  <span className={cn(result.summary[s].error && "font-semibold text-rose-600")}>{result.summary[s].error} errors</span></span>
              </button>
            ))}
          </div>
          {rows.length ? (
            <Table>
              <thead><tr><TH>Excel row</TH><TH>{tab === "clients" ? "Client" : "Return"}</TH><TH>{result.dry_run ? "Will be" : "Result"}</TH><TH>Details</TH></tr></thead>
              <tbody>{rows.map((r) => (
                <TR key={r.row}>
                  <TD className="tabular-nums">{r.row}</TD>
                  <TD>{r.label}{r.name && !result.dry_run ? <span className="ms-2 text-xs text-muted-foreground">{r.name}</span> : null}</TD>
                  <TD><StateBadge state={BADGE[r.status]} label={result.dry_run ? LABEL[r.status] : DONE[r.status]} /></TD>
                  <TD className={cn("text-xs", r.status === "error" && "text-rose-600")}>{r.messages.join(" · ") || "—"}</TD>
                </TR>
              ))}</tbody>
            </Table>
          ) : <p className="text-sm text-muted-foreground">No rows in the {tab} sheet.</p>}
        </div>
      )}
    </div>
  );
}
