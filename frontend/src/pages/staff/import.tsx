import { Download, Upload } from "lucide-react";
import { useState } from "react";
import { StateBadge } from "@/components/common/state-badge";
import { InlineError } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TD, TH, TR } from "@/components/ui/table";
import { M, staff } from "@/lib/api";

type Result = { rows: { row: number; client_name: string; status: string; errors: string[]; duplicates: string[]; name?: string }[];
  summary: Record<string, number>; dry_run: number };

export function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  async function run(dry: number) {
    if (!file) return;
    setBusy(true);
    setErr(null);
    try { setResult(await staff.importClients(file, dry)); } catch (e) { setErr(e); } finally { setBusy(false); }
  }
  return (
    <div className="page-container space-y-5">
      <PageHeader title="Import existing clients" subtitle="CSV with a header row · preview first, nothing is saved until you import"
        icon={<Upload className="h-5 w-5" />} />
      <Card className="space-y-4 p-4">
        <a className="inline-flex items-center gap-1.5 text-sm font-medium text-primary" href={`/api/method/${M.STAFF}.import_template`}>
          <Download className="h-4 w-4" /> Download template</a>
        <p className="text-sm text-muted-foreground">Columns: client_name, client_type (Individual-Salaried, Individual-Business, AOP, Company, Other), cnic, ntn, mobile,
          email, city, province, business_name, residential_address, assigned_consultant, fbr_registration_status. Duplicates are
          detected on CNIC, NTN, email and mobile (normalised), against existing clients and within the file.</p>
        <input type="file" accept=".csv,text/csv" aria-label="CSV file" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }}
          className="block text-sm file:me-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground" />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="default" disabled={!file} loading={busy} onClick={() => void run(1)}>Preview (dry run)</Button>
          <Button size="default" disabled={!file || !result?.dry_run || !result.summary.ok} loading={busy} onClick={() => void run(0)}>
            Import {result?.summary.ok ?? 0} valid rows</Button>
        </div>
        <InlineError error={err} />
      </Card>
      {result && (
        <>
          <p className="text-sm">{result.dry_run ? "Preview" : "Imported"}: <b>{result.summary.ok}</b> ok · <b>{result.summary.duplicate}</b> duplicates (skipped) · <b>{result.summary.error}</b> errors (skipped)</p>
          <Table>
            <thead><tr><TH>Row</TH><TH>Client</TH><TH>Status</TH><TH>Details</TH></tr></thead>
            <tbody>{result.rows.map((r) => (
              <TR key={r.row}>
                <TD>{r.row}</TD><TD>{r.client_name}{r.name ? <span className="ms-2 text-xs text-muted-foreground">{r.name}</span> : null}</TD>
                <TD><StateBadge state={r.status === "ok" ? "Verified" : r.status === "duplicate" ? "Pending" : "Rejected"} label={r.status} /></TD>
                <TD className="text-xs">{[...r.errors, ...r.duplicates].join(" · ") || "—"}</TD>
              </TR>
            ))}</tbody>
          </Table>
        </>
      )}
    </div>
  );
}
