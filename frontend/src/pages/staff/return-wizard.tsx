/**
 * Staff Tax Return wizard: Client & Year → Taxpayer → Income → Deductions → Tax paid → Wealth → Documents →
 * Calculation → Validation → Workflow. Autosaves while the return is in preparation; every rule is re-checked
 * on the server (services/workflow.py), so the buttons here are conveniences, not the security boundary.
 */
import { AlertTriangle, Calculator, Check, CheckCircle2, CircleDashed, Download, ExternalLink, FileCheck2, Save, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import useSWR from "swr";
import { ChildTable, type Col } from "@/components/common/child-table";
import { FileUpload } from "@/components/common/file-upload";
import { FilingProgress } from "@/components/common/filing-progress";
import { StateBadge } from "@/components/common/state-badge";
import { ErrorState, InlineError, Loading } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, SelectInput, TextArea, TextInput } from "@/components/ui/field";
import { useAuth } from "@/hooks/useAuth";
import { downloadUrl, M, staff, type ChecklistItem } from "@/lib/api";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { apiCall, apiGet, humanizeError, http } from "@/services/frappe";
import { QUESTIONS } from "../client/return";
import { RejectDialog } from "./queue";

type Doc = Record<string, any>;
type Meta = Record<string, Record<string, { options?: string; fieldtype: string; label: string }>>;

const EDITABLE = ["Documents Pending", "Draft", "Changes Required"];
const STEPS = [
  ["client", "Client & Year"], ["taxpayer", "Taxpayer info"], ["income", "Income"], ["deductions", "Deductions & credits"],
  ["paid", "Tax deducted / paid"], ["wealth", "Assets, liabilities & expenses"], ["documents", "Documents"],
  ["calculation", "Calculation"], ["validation", "Validation checklist"], ["workflow", "Review · approve · file"],
] as const;
type Step = (typeof STEPS)[number][0];

/** frappe.desk.form.load.getdoctype returns {docs} at top level (not under message). */
async function loadMeta(): Promise<Meta> {
  const res = await http.get("/api/method/frappe.desk.form.load.getdoctype", { params: { doctype: "Tax Return" } });
  const docs = (res.data?.docs ?? []) as any[];
  const out: Meta = {};
  for (const d of docs) out[d.name] = Object.fromEntries((d.fields ?? []).map((f: any) => [f.fieldname, f]));
  return out;
}

function opts(meta: Meta | undefined, doctype: string, field: string, blank = false): string[] {
  const o = (meta?.[doctype]?.[field]?.options ?? "").split("\n");
  return blank ? o : o.filter(Boolean);
}

function Section({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <section className="form-card">
      <div className="form-card-head">{title}</div>
      <div className="form-card-body space-y-4">{hint && <p className="text-sm text-muted-foreground">{hint}</p>}{children}</div>
    </section>
  );
}

export function ReturnWizard() {
  const { name = "" } = useParams();
  const { hasRole } = useAuth();
  const { data: meta } = useSWR<Meta>("meta:Tax Return", loadMeta, { revalidateOnFocus: false });
  const { data: server, error, isLoading, mutate } = useSWR<Doc>(["doc", name],
    () => http.get(`/api/resource/Tax Return/${encodeURIComponent(name)}`).then((r) => r.data.data));
  const overview = useApi<Record<string, any>>(`${M.STAFF}.return_overview`, { tax_return: name });
  const { data: sections } = useSWR("wht-sections", () => apiGet<any>("frappe.client.get_list",
    { doctype: "Withholding Tax Section", fields: JSON.stringify(["name", "section_code", "description"]), limit_page_length: 100 }));

  const [doc, setDoc] = useState<Doc | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [step, setStep] = useState<Step>("client");
  const timer = useRef<number>();

  useEffect(() => { if (server && !dirty) setDoc(server); }, [server, dirty]);
  const editable = !!doc && EDITABLE.includes(doc.workflow_state) && hasRole("Tax Consultant", "Tax Admin", "System Manager");

  const save = useCallback(async (d?: Doc) => {
    const current = d ?? doc;
    if (!current) return;
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await apiCall<Doc>("frappe.client.save", { doc: current });
      setDoc(saved);
      setDirty(false);
      await mutate(saved, { revalidate: false });
      void overview.mutate();
    } catch (e) {
      setSaveError(e);
    } finally {
      setSaving(false);
    }
  }, [doc, mutate, overview]);

  const change = (patch: Doc) => {
    setDoc((d) => ({ ...(d as Doc), ...patch }));
    setDirty(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setAutosave((n) => n + 1), 2500);
  };
  const [autosave, setAutosave] = useState(0);
  useEffect(() => { if (autosave && dirty && editable && !saving) void save(); }, [autosave]); // eslint-disable-line react-hooks/exhaustive-deps

  const whtOptions = useMemo(() => ["", ...((sections ?? []) as any[]).map((s) => s.name)], [sections]);

  if (isLoading || !doc) return error ? <div className="page-container"><ErrorState error={error} onRetry={() => void mutate()} /></div> : <Loading />;
  const ov = overview.data;
  const T = (table: string) => `Tax Return ${table}`;
  const cols: Record<string, Col[]> = {
    income_sources: [
      { fieldname: "income_category", label: "Category", type: "select", options: opts(meta, "Tax Return Income Source", "income_category"), required: true },
      { fieldname: "payer_or_employer", label: "Payer / employer", type: "data" },
      { fieldname: "tax_treatment", label: "Treatment", type: "select", options: opts(meta, "Tax Return Income Source", "tax_treatment") },
      { fieldname: "gross_amount", label: "Gross", type: "currency", required: true },
      { fieldname: "exempt_amount", label: "Exempt", type: "currency" },
      { fieldname: "taxable_amount", label: "Taxable (auto)", type: "currency" },
      { fieldname: "tax_rate_percent", label: "Rate % (final/separate)", type: "percent" },
    ],
    deduction_lines: [
      { fieldname: "deduction_type", label: "Type", type: "select", options: opts(meta, "Tax Return Deduction", "deduction_type") },
      { fieldname: "description", label: "Description", type: "data" },
      { fieldname: "section_reference", label: "Section", type: "data", width: "90px" },
      { fieldname: "amount", label: "Amount", type: "currency", required: true },
    ],
    credit_lines: [
      { fieldname: "credit_type", label: "Type", type: "select", options: opts(meta, "Tax Return Credit", "credit_type") },
      { fieldname: "eligible_amount", label: "Eligible amount", type: "currency" },
      { fieldname: "credit_amount", label: "Credit claimed", type: "currency" },
    ],
    withholding_lines: [
      { fieldname: "section", label: "Section", type: "select", options: whtOptions },
      { fieldname: "payer", label: "Payer / agent", type: "data" },
      { fieldname: "payer_ntn", label: "Payer NTN", type: "data" },
      { fieldname: "amount", label: "Tax deducted", type: "currency", required: true },
    ],
    advance_tax_lines: [
      { fieldname: "cpr_no", label: "CPR no.", type: "data", required: true },
      { fieldname: "payment_date", label: "Date", type: "date" },
      { fieldname: "section", label: "Section", type: "data", width: "80px" },
      { fieldname: "amount", label: "Amount", type: "currency", required: true },
    ],
    asset_lines: [
      { fieldname: "asset_type", label: "Asset", type: "select", options: opts(meta, "Tax Return Asset", "asset_type") },
      { fieldname: "description", label: "Description", type: "data" },
      { fieldname: "acquisition_date", label: "Acquired", type: "date" },
      { fieldname: "cost_value", label: "Cost / value", type: "currency", required: true },
    ],
    liability_lines: [
      { fieldname: "liability_type", label: "Liability", type: "select", options: opts(meta, "Tax Return Liability", "liability_type") },
      { fieldname: "creditor", label: "Creditor", type: "data" },
      { fieldname: "amount", label: "Amount", type: "currency", required: true },
    ],
    personal_expense_lines: [
      { fieldname: "expense_type", label: "Expense", type: "select", options: opts(meta, "Tax Return Personal Expense", "expense_type") },
      { fieldname: "description", label: "Description", type: "data" },
      { fieldname: "amount", label: "Amount", type: "currency", required: true },
    ],
  };
  const table = (field: string, totalOf = "amount", hint?: string) => (
    <ChildTable cols={cols[field]} rows={doc[field] ?? []} readOnly={!editable} totalOf={totalOf} emptyHint={hint}
      onChange={(rows) => change({ [field]: rows.map((r, i) => ({ ...r, idx: i + 1, doctype: T(field), parentfield: field })) })} />
  );

  // what is still missing (client-side preview; the server enforces the real rules)
  const missing: string[] = [];
  if (!doc.income_sources?.length) missing.push("At least one income source");
  if (ov?.documents && ov.documents.total > ov.documents.verified) missing.push(`${ov.documents.total - ov.documents.verified} required document(s) not verified`);
  if (!ov?.calculation_current) missing.push("Calculation is out of date — recalculate");
  if (doc.wealth_statement_required && !doc.asset_lines?.length) missing.push("Wealth statement has no assets");
  for (const r of doc.income_sources ?? []) {
    if (["Final / Fixed", "Separate Block"].includes(r.tax_treatment) && !Number(r.tax_rate_percent) && Number(r.gross_amount))
      missing.push(`${r.income_category}${r.payer_or_employer ? ` (${r.payer_or_employer})` : ""}: enter its tax rate from the Finance Act — without it no tax is charged but its withholding still counts`);
  }
  for (const c of doc.credit_lines ?? []) if (Number(c.eligible_amount) && !Number(c.credit_amount)) missing.push(`${c.credit_type}: the credit amount is still 0`);
  const noSection = (doc.withholding_lines ?? []).filter((w: any) => !w.section).length;
  if (noSection) missing.push(`${noSection} withholding line(s) have no tax section (e.g. 149 salary, 151 bank profit)`);
  if (ov?.engagement && !["Paid", "Waived"].includes(ov.engagement.payment_status)) missing.push(`Fee ${ov.engagement.payment_status.toLowerCase()} (check firm payment policy)`);

  const stepDone: Record<Step, boolean> = {
    client: true, taxpayer: !!doc.taxpayer_type, income: !!doc.income_sources?.length, deductions: true,
    paid: !!(doc.withholding_lines?.length || doc.advance_tax_lines?.length), wealth: !doc.wealth_statement_required || !!doc.asset_lines?.length,
    documents: !!ov?.documents && ov.documents.total === ov.documents.verified, calculation: !!ov?.calculation_current,
    validation: missing.length === 0, workflow: ["Acknowledged", "Closed"].includes(doc.workflow_state),
  };

  return (
    <div className="page-container space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <Link to={`/staff/clients/${doc.tax_client}`} className="hover:underline">{doc.client_name}</Link> · Tax year {doc.tax_year}
            {doc.return_type === "Revised" ? ` · Revised (of ${doc.amended_from})` : ""}
          </p>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 text-2xl font-semibold">{doc.name} <StateBadge state={doc.workflow_state} /></h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {saving ? "Saving…" : dirty ? "Unsaved changes" : editable ? "All changes saved" : "Read-only in this state"}
          </span>
          {editable && <Button size="default" variant="outline" loading={saving} disabled={!dirty} onClick={() => void save()}><Save className="h-4 w-4" /> Save draft</Button>}
          <a href={`/app/tax-return/${doc.name}`} className="inline-flex h-9 items-center gap-1 rounded-md px-3 text-sm text-muted-foreground hover:bg-accent">Desk <ExternalLink className="h-3.5 w-3.5" /></a>
        </div>
      </div>
      <InlineError error={saveError} />
      {doc.approval_status === "Invalidated" && (
        <p className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          <AlertTriangle className="h-4 w-4 text-amber-600" /> Figures changed after approval — the approval was cancelled and the return went back to review.</p>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[250px_1fr]">
        <div className="space-y-4">
        <nav aria-label="Steps" className="flex gap-1 overflow-x-auto lg:flex-col">
          {STEPS.map(([key, label], i) => (
            <button key={key} onClick={() => setStep(key)} aria-current={step === key ? "step" : undefined}
              className={cn("flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-start text-sm transition",
                step === key ? "bg-primary text-primary-foreground" : "hover:bg-accent")}>
              {stepDone[key] ? <CheckCircle2 className={cn("h-4 w-4", step === key ? "" : "text-success")} /> : <CircleDashed className="h-4 w-4 opacity-60" />}
              <span className="whitespace-nowrap">{i + 1}. {label}</span>
            </button>
          ))}
        </nav>
        {ov && <FilingProgress className="hidden lg:block" step={ov.step} dates={ov.step_dates}
          problem={["Changes Required", "Filing Error"].includes(doc.workflow_state)} title="Client journey" />}
        </div>

        <div className="min-w-0 space-y-5">
          {step === "client" && (
            <>
              <Section title="Client & year">
                <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  <div><dt className="text-muted-foreground">Client</dt><dd className="font-medium">{doc.client_name} ({doc.tax_client})</dd></div>
                  <div><dt className="text-muted-foreground">Tax year</dt><dd>{doc.tax_year} · {doc.period_from} → {doc.period_to}</dd></div>
                  <div><dt className="text-muted-foreground">Return type</dt><dd>{doc.return_type}</dd></div>
                  <div><dt className="text-muted-foreground">Engagement</dt><dd>{ov?.engagement ? <>{ov.engagement.service_package ?? ov.engagement.name} · <StateBadge state={ov.engagement.payment_status} /></> : "—"}</dd></div>
                </dl>
              </Section>
              <ClientDetailsPanel doc={doc} editable={editable} onDone={async () => { await mutate(); void overview.mutate(); }} />
              <Section title="Questionnaire" hint="Answers decide the document checklist. Rebuild the checklist after changing them.">
                <div className="grid gap-2 sm:grid-cols-2">
                  {QUESTIONS.map(([key, q]) => (
                    <label key={key} className={cn("flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors",
                      doc[key] ? "border-primary/60 bg-primary/10 font-medium text-foreground" : "text-muted-foreground",
                      editable ? "cursor-pointer hover:border-primary/40" : "cursor-default")}>
                      <input type="checkbox" disabled={!editable} checked={!!doc[key]} onChange={(e) => change({ [key]: e.target.checked ? 1 : 0 })} />
                      <span className="flex-1">{q}</span>
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", doc[key] ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{doc[key] ? "Yes" : "No"}</span>
                    </label>
                  ))}
                </div>
                {editable && <Button size="sm" variant="outline" onClick={async () => { await save(); await staff.regenerateChecklist(doc.name); void overview.mutate(); }}>
                  Save & rebuild checklist</Button>}
              </Section>
            </>
          )}

          {step === "taxpayer" && (
            <Section title="Taxpayer information">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Taxpayer type" hint="Decides which slab setting applies">{(id) => (
                  <SelectInput id={id} disabled={!editable} value={doc.taxpayer_type ?? ""} onChange={(e) => change({ taxpayer_type: e.target.value })}>
                    {opts(meta, "Tax Return", "taxpayer_type").map((o) => <option key={o}>{o}</option>)}
                  </SelectInput>)}</Field>
                <Field label="Tax regime">{(id) => <TextInput id={id} disabled={!editable} value={doc.tax_regime ?? ""} onChange={(e) => change({ tax_regime: e.target.value })} placeholder="Normal Tax Regime" />}</Field>
                {(["assigned_consultant", "reviewer", "approver", "filing_officer"] as const).map((f) => (
                  <Field key={f} label={f.replace("_", " ").replace(/^\w/, (c) => c.toUpperCase())}>{(id) => (
                    <TextInput id={id} disabled={!editable} value={doc[f] ?? ""} onChange={(e) => change({ [f]: e.target.value })} placeholder="user@…" />)}</Field>
                ))}
              </div>
            </Section>
          )}

          {step === "income" && <Section title="Income sources" hint="Taxable defaults to gross − exempt. Final / separate-block income needs its Finance Act rate.">{table("income_sources", "gross_amount", "Add salary, business, rent, profit on debt…")}</Section>}
          {step === "deductions" && (
            <>
              <Section title="Deductible allowances">{table("deduction_lines")}</Section>
              <Section title="Tax credits">{table("credit_lines", "credit_amount")}</Section>
            </>
          )}
          {step === "paid" && (
            <>
              <Section title="Tax deducted / withholding" hint="Match each line with its certificate in Documents.">{table("withholding_lines")}</Section>
              <Section title="Advance tax paid (CPR)">{table("advance_tax_lines")}</Section>
            </>
          )}
          {step === "wealth" && (
            <>
              <Section title="Assets">{table("asset_lines", "cost_value")}</Section>
              <Section title="Liabilities">{table("liability_lines")}</Section>
              <Section title="Personal expenses">{table("personal_expense_lines")}</Section>
              <Section title="Reconciliation">
                <div className="grid gap-4 sm:grid-cols-3 text-sm">
                  <p>Net wealth (this year): <b>{money(doc.net_wealth)}</b></p>
                  <Field label="Net wealth last year">{(id) => (
                    <TextInput id={id} type="number" disabled={!editable} value={doc.net_wealth_previous_year ?? 0}
                      onChange={(e) => change({ net_wealth_previous_year: Number(e.target.value) })} />)}</Field>
                  <p>Increase: <b>{money((doc.net_wealth ?? 0) - (doc.net_wealth_previous_year ?? 0))}</b></p>
                </div>
              </Section>
            </>
          )}

          {step === "documents" && <DocumentsStep name={doc.name} items={ov?.checklist ?? []} onChange={() => void overview.mutate()} />}
          {step === "calculation" && <CalculationStep doc={doc} ov={ov} dirty={dirty} save={save} onDone={async () => { await mutate(); void overview.mutate(); }} />}
          {step === "validation" && (
            <Section title="Validation checklist">
              {missing.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-success"><CheckCircle2 className="h-5 w-5" /> Ready for review.</p>
              ) : (
                <ul className="space-y-2">
                  {missing.map((m) => <li key={m} className="flex items-center gap-2 text-sm"><AlertTriangle className="h-4 w-4 text-amber-600" /> {m}</li>)}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">The server re-checks every rule when you submit.</p>
            </Section>
          )}
          {step === "workflow" && <WorkflowStep doc={doc} ov={ov} onDone={async () => { await mutate(); void overview.mutate(); }} />}

          <div className="flex justify-between">
            <Button variant="ghost" disabled={step === STEPS[0][0]} onClick={() => setStep(STEPS[Math.max(0, STEPS.findIndex(([k]) => k === step) - 1)][0])}>Back</Button>
            <Button variant="outline" disabled={step === STEPS[STEPS.length - 1][0]}
              onClick={async () => { if (dirty && editable) await save(); setStep(STEPS[Math.min(STEPS.length - 1, STEPS.findIndex(([k]) => k === step) + 1)][0]); }}>Next</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DocumentsStep({ name, items, onChange }: { name: string; items: ChecklistItem[]; onChange: () => void }) {
  const [rejecting, setRejecting] = useState<ChecklistItem | null>(null);
  const [err, setErr] = useState<unknown>(null);
  return (
    <Section title="Documents" hint="Verify each upload against the return. Rejections go back to the client with your reason.">
      <InlineError error={err} />
      <ul className="divide-y rounded-lg border">
        {items.map((d) => (
          <li key={d.name} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <span className="font-medium">{d.document_type}</span> <span className="text-xs text-muted-foreground">{d.is_required ? "required" : "optional"}</span>
              {d.rejection_reason && <p className="text-xs text-destructive">{d.rejection_reason}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StateBadge state={d.status} />
              {d.has_file && <a className="rounded-md p-1.5 text-muted-foreground hover:bg-accent" aria-label="Download" target="_blank" rel="noopener"
                href={downloadUrl("Tax Document", d.name, "file", true)}><Download className="h-4 w-4" /></a>}
              {d.status === "Pending" && <>
                <Button size="sm" variant="success" onClick={() => staff.verifyDocument(d.name, "Verified").then(onChange).catch(setErr)}><FileCheck2 className="h-4 w-4" /> Verify</Button>
                <Button size="sm" variant="outline" onClick={() => setRejecting(d)}><X className="h-4 w-4" /> Reject</Button>
              </>}
              {d.status !== "Verified" && <FileUpload label="Upload for client" camera={false} onUpload={(b, n) => staff.uploadDocument(d.name, b, n)} onDone={onChange} />}
            </div>
          </li>
        ))}
        {!items.length && <li className="px-3 py-6 text-center text-sm text-muted-foreground">No checklist items — check the questionnaire.</li>}
      </ul>
      {rejecting && <RejectDialog title={`Reject ${rejecting.document_type}`} onClose={() => setRejecting(null)}
        onReject={(reason) => staff.verifyDocument(rejecting.name, "Rejected", reason).then(onChange)} />}
      <p className="text-xs text-muted-foreground">Return {name}</p>
    </Section>
  );
}

function CalculationStep({ doc, ov, dirty, save, onDone }: { doc: Doc; ov: any; dirty: boolean; save: () => Promise<void>; onDone: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [result, setResult] = useState<Record<string, any> | null>(null);
  const rows: [string, number][] = [["Total income", doc.total_income], ["Deductions", doc.total_deductions], ["Taxable income", doc.taxable_income],
    ["Tax credits", doc.total_tax_credits], ["Tax liability", doc.tax_liability], ["Tax withheld", doc.total_tax_withheld],
    ["Advance tax", doc.total_advance_tax], ["Net payable", doc.net_tax_payable], ["Refund due", doc.refund_due]];
  return (
    <Section title="Calculation summary">
      <div className="flex flex-wrap items-center gap-3">
        <Button loading={busy} onClick={async () => {
          setBusy(true);
          setErr(null);
          try { if (dirty) await save(); setResult(await staff.calculate(doc.name)); await onDone(); } catch (e) { setErr(e); } finally { setBusy(false); }
        }}><Calculator className="h-4 w-4" /> Calculate tax</Button>
        {ov?.calculation_current ? <span className="flex items-center gap-1 text-sm text-success"><Check className="h-4 w-4" /> Current (v{doc.calculation_version})</span>
          : <span className="text-sm text-amber-700 dark:text-amber-300">Figures changed since the last calculation</span>}
      </div>
      <InlineError error={err} />
      {(result?.rules_are_demo || ov?.calculations?.[0]?.rules_are_demo) ? (
        <p className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          <AlertTriangle className="h-4 w-4 text-amber-600" /> Slabs are DEMO values (not validated against the Finance Act). Verify before filing.</p>
      ) : null}
      <dl className="divide-y rounded-lg border text-sm">
        {rows.map(([k, v]) => <div key={k} className="flex justify-between px-3 py-2"><dt>{k}</dt><dd className="font-medium tabular-nums">{money(v)}</dd></div>)}
      </dl>
      {ov?.calculations?.length > 0 && (
        <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Calculation history ({ov.calculations.length})</summary>
          <ul className="mt-2 space-y-1">{ov.calculations.map((c: any) => (
            <li key={c.name} className="flex justify-between"><span>v{c.calculation_version} · {new Date(c.calculated_on).toLocaleString("en-GB")} · {c.calculated_by}</span>
              <span className="tabular-nums">{money(c.tax_liability)}</span></li>))}</ul>
        </details>
      )}
    </Section>
  );
}

const NEEDS_COMMENT = ["Request Changes", "Report Filing Error", "Reopen for Review"];

function WorkflowStep({ doc, ov, onDone }: { doc: Doc; ov: any; onDone: () => Promise<void> }) {
  const { hasRole } = useAuth();
  const [action, setAction] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [note, setNote] = useState("");
  const [visible, setVisible] = useState(false);
  async function run(a: string, c?: string) {
    setBusy(true);
    setErr(null);
    try {
      if (a === "Report Filing Error" && c) await apiCall("frappe.client.set_value", { doctype: "Tax Return", name: doc.name, fieldname: "filing_error_notes", value: c });
      await staff.transition(doc.name, a, c);
      setAction(null);
      setComment("");
      await onDone();
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  }
  const transitions: { action: string; next_state: string }[] = ov?.transitions ?? [];
  return (
    <div className="space-y-5">
      <Section title="Next steps" hint="Only the actions your role may take from this state are shown.">
        <InlineError error={err} />
        {transitions.length ? (
          <div className="flex flex-wrap gap-2">
            {transitions.map((t) => (
              <Button key={t.action} variant={/Request|Error|Question/.test(t.action) ? "outline" : "primary"} loading={busy && action === t.action}
                onClick={() => (NEEDS_COMMENT.includes(t.action) ? setAction(t.action) : (setAction(t.action), void run(t.action)))}>
                {t.action} <span className="text-xs opacity-75">→ {t.next_state}</span>
              </Button>
            ))}
          </div>
        ) : <p className="text-sm text-muted-foreground">Nothing for you to do in “{doc.workflow_state}”.</p>}
        {doc.workflow_state === "Awaiting Client Confirmation" && (
          <p className="text-sm">{doc.client_confirmed ? <span className="text-success">✔ Client confirmed on {new Date(doc.client_confirmed_on).toLocaleString("en-GB")}</span>
            : "Waiting for the client to confirm in the portal."}</p>
        )}
      </Section>

      {["Pending Review", "Under Review"].includes(doc.workflow_state) && hasRole("Tax Reviewer", "Tax Admin", "System Manager") && (
        <ReviewPanel doc={doc} review={ov?.review} onDone={onDone} />
      )}
      {["Submitted to FBR", "Filing Error"].includes(doc.workflow_state) && hasRole("Filing Officer", "Tax Admin", "System Manager") && (
        <FilingPanel doc={doc} onDone={onDone} />
      )}

      <Section title="Comments">
        <ul className="space-y-2">
          {(ov?.comments ?? []).map((c: any) => (
            <li key={c.name} className={cn("rounded-lg px-3 py-2 text-sm", c.from_client ? "bg-primary/10" : "bg-muted")}>
              <p className="whitespace-pre-wrap">{c.comment}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{c.from_client ? "Client" : c.user} · {c.stage} · {new Date(c.creation).toLocaleString("en-GB")}
                {c.visible_to_client ? " · visible to client" : ""}</p>
            </li>
          ))}
        </ul>
        <TextArea aria-label="Add comment" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" />
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} /> Visible to client</label>
          <Button size="sm" disabled={!note.trim()} onClick={() => staff.addComment(doc.name, note.trim(), visible ? 1 : 0).then(() => { setNote(""); void onDone(); }).catch(setErr)}>Add comment</Button>
        </div>
      </Section>

      {ov?.audit?.length > 0 && (
        <Section title="History">
          <ul className="space-y-1 text-xs">{ov.audit.map((a: any, i: number) => (
            <li key={i} className="flex flex-wrap gap-x-2"><span className="text-muted-foreground">{new Date(a.timestamp).toLocaleString("en-GB")}</span>
              <span>{a.event_type}</span>{a.from_state && <span>{a.from_state} → {a.to_state}</span>}<span className="text-muted-foreground">{a.user}</span></li>))}</ul>
        </Section>
      )}

      <Dialog open={!!action && NEEDS_COMMENT.includes(action)} onClose={() => setAction(null)} title={action ?? ""}
        footer={<><Button variant="ghost" onClick={() => setAction(null)}>Cancel</Button>
          <Button loading={busy} disabled={!comment.trim()} onClick={() => action && void run(action, comment.trim())}>{action}</Button></>}>
        <TextArea aria-label="Comment" value={comment} onChange={(e) => setComment(e.target.value)}
          placeholder={action === "Report Filing Error" ? "What went wrong on IRIS?" : action === "Reopen for Review" ? "Why is the reviewed return being reopened?" : "What needs to change?"} />
        <InlineError error={err} />
      </Dialog>
    </div>
  );
}

const RESULTS = ["", "Pass", "Fail", "N/A"];

function ReviewPanel({ doc, review, onDone }: { doc: Doc; review: any; onDone: () => Promise<void> }) {
  const [items, setItems] = useState<{ check_item: string; result: string; remarks?: string }[]>(review?.checklist ?? []);
  const [verified, setVerified] = useState<boolean>(!!review?.calculation_verified);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  useEffect(() => { setItems(review?.checklist ?? []); setVerified(!!review?.calculation_verified); }, [review]);
  if (!review) {
    return (
      <Section title="Review checklist">
        <Button onClick={() => staff.startReview(doc.name).then(onDone).catch(setErr)}>Open review checklist</Button>
        <InlineError error={err} />
      </Section>
    );
  }
  return (
    <Section title={`Review checklist · ${review.decision || "open"}`}>
      <ul className="divide-y rounded-lg border">
        {items.map((it, i) => (
          <li key={it.check_item} className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm">{it.check_item}</span>
            <div className="flex gap-1">{RESULTS.slice(1).map((r) => (
              <button key={r} type="button" aria-pressed={it.result === r} onClick={() => setItems(items.map((x, j) => (j === i ? { ...x, result: r } : x)))}
                className={cn("rounded-md border px-3 py-1 text-xs font-medium", it.result === r
                  ? r === "Fail" ? "border-destructive bg-destructive text-destructive-foreground" : "border-primary bg-primary text-primary-foreground" : "bg-card")}>{r}</button>
            ))}</div>
          </li>
        ))}
      </ul>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} /> I checked the calculation against the slab setting</label>
      <InlineError error={err} />
      <Button variant="outline" loading={busy} onClick={async () => {
        setBusy(true);
        try { await staff.saveReview(review.name, items, verified ? 1 : 0); await onDone(); } catch (e) { setErr(e); } finally { setBusy(false); }
      }}>Save review</Button>
    </Section>
  );
}

function FilingPanel({ doc, onDone }: { doc: Doc; onDone: () => Promise<void> }) {
  const [ack, setAck] = useState(doc.iris_acknowledgment_no ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  return (
    <Section title="IRIS acknowledgment" hint="Never mark a return filed without the IRIS acknowledgment and the FBR receipt.">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="IRIS acknowledgment no." required>{(id) => <TextInput id={id} value={ack} onChange={(e) => setAck(e.target.value)} />}</Field>
        <Field label="FBR receipt (PDF / image)" required hint={doc.fbr_receipt ? "A receipt is attached — upload again to replace it" : undefined}>{(id) => (
          <input id={id} type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />)}</Field>
      </div>
      <InlineError error={err} />
      <Button loading={busy} disabled={!ack.trim() || (!file && !doc.fbr_receipt)} onClick={async () => {
        setBusy(true);
        setErr(null);
        try {
          if (file) await staff.uploadReceipt(doc.name, file, ack.trim());
          else await apiCall("frappe.client.set_value", { doctype: "Tax Return", name: doc.name, fieldname: "iris_acknowledgment_no", value: ack.trim() });
          await onDone();
        } catch (e) { setErr(humanizeError(e)); } finally { setBusy(false); }
      }}>Save evidence</Button>
      <p className="text-xs text-muted-foreground">Then use “Record Acknowledgment” above.</p>
    </Section>
  );
}

/** What the client typed in "My details", with one click to copy it into the schedules. */
function ClientDetailsPanel({ doc, editable, onDone }: { doc: Doc; editable: boolean; onDone: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [done, setDone] = useState<number | null>(null);
  const d = (typeof doc.client_details === "string" ? JSON.parse(doc.client_details || "{}") : doc.client_details) || {};
  const sections = Object.entries(d).filter(([, v]) => Array.isArray(v) && (v as unknown[]).length) as [string, Record<string, unknown>[]][];
  const extras = (["cash_in_hand", "household_expenses_monthly", "notes"] as const).filter((k) => d[k]);
  return (
    <Section title="What the client told us" hint={doc.client_details_updated_on ? `Entered in the portal · last change ${new Date(doc.client_details_updated_on).toLocaleString("en-GB")}${doc.client_details_imported_on ? ` · copied ${new Date(doc.client_details_imported_on).toLocaleString("en-GB")}` : ""}` : "The client has not entered anything yet — they can use “My details” in the portal."}>
      {sections.length || extras.length ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {sections.map(([key, rows]) => (
              <div key={key} className="rounded-md border p-3 text-sm">
                <p className="mb-1 font-semibold capitalize">{key.replace(/_/g, " ")}</p>
                {rows.map((r, i) => (
                  <p key={i} className="text-muted-foreground">{Object.entries(r).filter(([, v]) => v).map(([k, v]) =>
                    typeof v === "number" ? `${k.replace(/_/g, " ")} ${money(v)}` : String(v)).join(" · ")}</p>
                ))}
              </div>
            ))}
            {extras.map((k) => (
              <div key={k} className="rounded-md border p-3 text-sm"><p className="font-semibold capitalize">{k.replace(/_/g, " ")}</p>
                <p className="whitespace-pre-wrap text-muted-foreground">{typeof d[k] === "number" ? money(d[k]) : String(d[k])}</p></div>
            ))}
          </div>
          <InlineError error={err} />
          {editable && (
            <div className="flex flex-wrap items-center gap-3">
              <Button loading={busy} onClick={async () => {
                setBusy(true);
                setErr(null);
                try { setDone((await apiCall<{ rows: number }>(`${M.STAFF}.import_client_details`, { tax_return: doc.name })).rows); await onDone(); }
                catch (e) { setErr(e); } finally { setBusy(false); }
              }}>Copy into return</Button>
              <span className="text-xs text-muted-foreground">Adds rows marked “(from client)” to income, tax deducted and wealth; copying again replaces them. Check bank-profit rates afterwards.</span>
              {done !== null && <span className="text-sm text-success">{done} rows added</span>}
            </div>
          )}
        </>
      ) : null}
    </Section>
  );
}
