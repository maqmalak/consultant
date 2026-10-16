import type { Control, FieldValues, UseFormSetValue } from "react-hook-form";
import { ChildTableEditor } from "@/components/tax-return/child-table-editor";
import { NumberInput } from "@/components/tax-return/form-controls";
import { STEPS } from "./config";

export interface StepBodyProps {
  control: Control<any, FieldValues>;
  setValue: UseFormSetValue<any>;
  values: any;
  errors: any;
  doc: any;
  docId: string | undefined;
  mode: "create" | "edit" | "view";
  onTransition?: (target: string, comments?: string) => void;
  onUpload?: (file: File) => Promise<any>;
}

function field(label: string, children: React.ReactNode) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-slate-600">{label}</label>
      {children}
    </div>
  );
}

export function StepBody({ control, setValue, values, errors, doc, docId, mode, onTransition }: StepBodyProps) {
  return <div className="space-y-6">{stepContents()}</div>;
}

function stepContents() {
  switch (activeStep) {
    case 0:
      return (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <div className="sm:col-span-2">{field("Client", <select className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">Select client…</option></select>)}</div>
          <div className="sm:col-span-2">{field("Tax engagement", <input className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" placeholder="Optional" />)}</div>
          <div className="sm:col-span-2">{field("Taxpayer type", <select className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option>Salaried Individual</option><option>Non-Salaried Individual</option><option>Sole Proprietor</option><option>AOP/Partnership</option><option>Company</option><option>Other</option></select>)}</div>
          <div className="sm:col-span-2">{field("Applicable tax regime", <select className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option>Schedule S</option><option>Schedule R</option></select>)}</div>
          <div className="sm:col-span-2">{field("Return type", <select className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option>Original</option><option>Revised</option><option>Amended</option></select>)}</div>
        </div>
      );
    case 1:
      return (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="sm:col-span-2">{field("Period from", <input className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" placeholder="YYYY-MM-DD" />)}</div>
          <div className="sm:col-span-2">{field("Period to", <input className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" placeholder="YYYY-MM-DD" />)}</div>
          <div className="sm:col-span-2">{field("Team", <input className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" placeholder="e.g. FBR Training Team" />)}</div>
          <div className="sm:col-span-2">{field("Assigned consultant", <select className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option>—</option></select>)}</div>
          <div className="sm:col-span-2">{field("Reviewer", <select className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option>—</option></select>)}</div>
          <div className="sm:col-span-2">{field("Approver", <select className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option>—</option></select>)}</div>
          <div className="sm:col-span-2">{field("Filing officer", <select className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option>—</option></select>)}</div>
        </div>
      );
    case 2:
      return <ChildTableEditor name="Tax Return Income" control={control} label="Income" flex={1} />;
    case 3:
      return <ChildTableEditor name="Tax Return Deduction" control={control} label="Deductions" flex={1} />;
    case 4:
      return (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChildTableEditor name="Tax Return Credit" control={control} label="Credits" flex={1} />
          <ChildTableEditor name="Tax Return Payment" control={control} label="Payments" flex={1} />
        </div>
      );
    case 5:
      return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <NumberInput field={{ value: values.total_income ?? 0 }} label="Total income (PKR)" />
          <NumberInput field={{ value: values.total_deductions ?? 0 }} label="Total deductions (PKR)" />
          <NumberInput field={{ value: values.total_tax_credits ?? 0 }} label="Total credits (PKR)" />
          <NumberInput field={{ value: values.total_tax_withheld ?? 0 }} label="Total tax withheld (PKR)" />
          <NumberInput field={{ value: values.total_advance_tax ?? 0 }} label="Total advance tax (PKR)" className="sm:col-span-2" />
          <NumberInput field={{ value: values.taxable_income ?? 0 }} label="Taxable income (PKR)" />
          <NumberInput field={{ value: values.tax_liability ?? 0 }} label="Tax liability (PKR)" />
          <NumberInput field={{ value: values.net_tax_payable ?? 0 }} label="Net tax payable (PKR)" />
          <NumberInput field={{ value: values.refund_due ?? 0 }} label="Refund due (PKR)" />
        </div>
      );
    case 6:
      return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <NumberInput field={{ value: values.total_assets ?? 0 }} label="Total assets (PKR)" />
          <NumberInput field={{ value: values.total_liabilities ?? 0 }} label="Total liabilities (PKR)" />
          <NumberInput field={{ value: values.net_wealth ?? 0 }} label="Net wealth (PKR)" />
          <NumberInput field={{ value: values.net_wealth_previous_year ?? 0 }} label="Net wealth PY (PKR)" />
          <div className="sm:col-span-2">{field("Wealth statement required", <select className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option>No</option><option>Yes</option></select>)}</div>
          <div className="sm:col-span-2">{field("Client action requests", <textarea className="h-24 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />)}</div>
          <div className="sm:col-span-2">{field("Preparation notes", <textarea className="h-24 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />)}</div>
        </div>
      );
    case 7:
      return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">{field("Review comments", <textarea className="h-24 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />)}</div>
          <div className="sm:col-span-1">{field("Approval status", <select className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option>Pending</option><option>Approved</option><option>Rejected</option></select>)}</div>
          <div className="sm:col-span-1">{field("Approved by", <input className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" />)}</div>
          <div className="sm:col-span-1">{field("Approved on", <input className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" />)}</div>
        </div>
      );
    case 8:
      return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>{field("FBR submission status", <select className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option>Not submitted</option><option>Submitted</option><option>Filed</option></select>)}</div>
          <div>{field("FBR acknowledgment", <input className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" />)}</div>
          <div className="sm:col-span-2">{field("FBR receipt / evidence", <input type="file" className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:text-brand-700 hover:file:bg-brand-100" />)}</div>
        </div>
      );
    case 9:
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between border border-slate-200 rounded-lg px-4 py-3">
            <div>
              <p className="text-sm font-medium text-slate-800">Content hash</p>
              <p className="text-xs text-slate-500 font-mono">{values.content_hash ?? "—"}</p>
            </div>
            <Button variant="outline" size="sm">Regenerate</Button>
          </div>
          <div className="flex items-center justify-between border border-slate-200 rounded-lg px-4 py-3">
            <div>
              <p className="text-sm font-medium text-slate-800">Version</p>
              <p className="text-xs text-slate-500">{doc?.version ?? 1}</p>
            </div>
            <Button variant="primary" size="sm" onClick={() => onTransition?.("Filed")}>
              File to FBR
            </Button>
          </div>
          <div className="flex items-center justify-between border border-slate-200 rounded-lg px-4 py-3">
            <div>
              <p className="text-sm font-medium text-slate-800">Approval hash</p>
              <p className="text-xs text-slate-500 font-mono">{values.approved_content_hash ?? "—"}</p>
            </div>
          </div>
          <div className="flex items-center justify-between border border-slate-200 rounded-lg px-4 py-3">
            <div>
              <p className="text-sm font-medium text-slate-800">Filing error details</p>
              <p className="text-xs text-slate-500">{values.filing_error_details ?? "—"}</p>
            </div>
          </div>
        </div>
      );
    default:
      return null;
  }
}

