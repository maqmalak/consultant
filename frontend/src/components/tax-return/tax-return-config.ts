import type { ChildTableConfig } from "./child-table-config";

export type GridField = {
  label: string;
  fieldname: string;
  type: "Select" | "Currency" | "Data" | "Link";
  options?: string;
};

export type ChildTableConfig = {
  doctype: string;
  label: string;
  fields: GridField[];
  required: string[];
};

export const INCOME_FIELDS: GridField[] = [
  { label: "Category", fieldname: "income_category", type: "Select", options: "Salary\nBusiness\nProperty (Rent)\nCapital Gains\nProfit on Debt\nDividend\nForeign Income\nAgricultural Income\nOther Sources" },
  { label: "Description", fieldname: "description", type: "Data" },
  { label: "Payer / Employer", fieldname: "payer_or_employer", type: "Data" },
  { label: "Tax treatment", fieldname: "tax_treatment", type: "Select", options: "Normal\nFinal / Fixed\nSeparate Block\nExempt" },
  { label: "Gross amount (PKR)", fieldname: "gross_amount", type: "Currency" },
  { label: "Exempt amount (PKR)", fieldname: "exempt_amount", type: "Currency" },
  { label: "Taxable amount (PKR)", fieldname: "taxable_amount", type: "Currency" },
  { label: "Supporting document", fieldname: "supporting_document", type: "Link", options: "Tax Document" },
];

export const DEDUCTION_FIELDS: GridField[] = [
  { label: "Deduction type", fieldname: "deduction_type", type: "Select", options: "Business Expense\nZakat\nWorkers Welfare Fund\nWorkers Participation Fund\nProfit on Debt (House Loan)\nEducational Expense\nOther Allowable Deduction" },
  { label: "Description", fieldname: "description", type: "Data" },
  { label: "Section reference", fieldname: "section_reference", type: "Data" },
  { label: "Amount (PKR)", fieldname: "amount", type: "Currency" },
  { label: "Supporting document", fieldname: "supporting_document", type: "Link", options: "Tax Document" },
];

export const CREDIT_FIELDS: GridField[] = [
  { label: "Credit type", fieldname: "credit_type", type: "Select", options: "Tax Paid Abroad\nTax Deducted at Source\nAdvance Tax\nSurcharge\nHealth & Education Cess\nOther Credit" },
  { label: "Description", fieldname: "description", type: "Data" },
  { label: "Section reference", fieldname: "section_reference", type: "Data" },
  { label: "Amount (PKR)", fieldname: "amount", type: "Currency" },
  { label: "Supporting document", fieldname: "supporting_document", type: "Link", options: "Tax Document" },
];

export const PAYMENT_FIELDS: GridField[] = [
  { label: "Payment type", fieldname: "payment_type", type: "Select", options: "Self Assessment Tax\nAdvance Tax\nTDS\nTSS\nOther Payment" },
  { label: "Bank / Chäl", fieldname: "bank", type: "Data" },
  { label: "Description", fieldname: "description", type: "Data" },
  { label: "Amount (PKR)", fieldname: "amount", type: "Currency" },
  { label: "Supporting document", fieldname: "supporting_document", type: "Link", options: "Tax Document" },
];

export const ASSET_FIELDS: GridField[] = [
  { label: "Asset type", fieldname: "asset_type", type: "Select", options: "Land\nBuilding\nPlant & Machinery\nMotor Vehicle\nInsurance Policy\nJewellery\nInvestments\nOther Assets" },
  { label: "Description", fieldname: "description", type: "Data" },
  { label: "Value (PKR)", fieldname: "value", type: "Currency" },
  { label: "Supporting document", fieldname: "supporting_document", type: "Link", options: "Tax Document" },
];

export const LIABILITY_FIELDS: GridField[] = [
  { label: "Liability type", fieldname: "liability_type", type: "Select", options: "Vendor Invoice\nLoan\nTax Payable\nCredit Card\nHire Purchase\nOther Liability" },
  { label: "Description", fieldname: "description", type: "Data" },
  { label: "Amount (PKR)", fieldname: "amount", type: "Currency" },
  { label: "Supporting document", fieldname: "supporting_document", type: "Link", options: "Tax Document" },
];

export const CHILD_TABLES: ChildTableConfig[] = [
  { doctype: "Tax Return Income Source", label: "Income", fields: INCOME_FIELDS, required: ["income_category", "gross_amount"] },
  { doctype: "Tax Return Deduction", label: "Deductions", fields: DEDUCTION_FIELDS, required: ["deduction_type", "amount"] },
  { doctype: "Tax Return Credit", label: "Credits", fields: CREDIT_FIELDS, required: ["credit_type", "amount"] },
  { doctype: "Tax Return Payment", label: "Payments", fields: PAYMENT_FIELDS, required: ["payment_type", "amount"] },
  { doctype: "Tax Return Asset", label: "Assets", fields: ASSET_FIELDS, required: ["asset_type"] },
  { doctype: "Tax Return Liability", label: "Liabilities", fields: LIABILITY_FIELDS, required: ["liability_type", "amount"] },
];

export function configFor(doctype: string): ChildTableConfig | undefined {
  return CHILD_TABLES.find((c) => c.doctype === doctype);
}


