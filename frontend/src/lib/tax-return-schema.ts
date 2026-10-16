import { z } from "zod";

const money = z
  .number()
  .positive("Amount must be greater than zero")
  .optional();

const text = (max = 4000) => z.string().max(max, `Must be ${max} characters or less`).optional();

export const incomeRow = z.object({
  income_category: z.string().min(1, "Category is required"),
  description: text(200),
  payer_or_employer: text(100),
  tax_treatment: z.string().optional(),
  gross_amount: z.number().positive("Amount must be greater than zero"),
  exempt_amount: z.number().nonnegative("Amount cannot be negative"),
  taxable_amount: z.number(),
  supporting_document: z.string().optional(),
});

export const deductionRow = z.object({
  deduction_type: z.string().min(1, "Type is required"),
  description: text(200),
  section_reference: text(50),
  amount: z.number().positive("Amount must be greater than zero"),
  supporting_document: z.string().optional(),
});

export const creditRow = z.object({
  credit_type: z.string().min(1, "Type is required"),
  description: text(200),
  section_reference: text(50),
  amount: z.number().positive("Amount must be greater than zero"),
  supporting_document: z.string().optional(),
});

export const paymentRow = z.object({
  payment_type: z.string().min(1, "Type is required"),
  bank: text(100),
  description: text(200),
  amount: z.number().positive("Amount must be greater than zero"),
  supporting_document: z.string().optional(),
});

export const assetRow = z.object({
  asset_type: z.string().min(1, "Type is required"),
  description: text(200),
  value: z.number().positive("Value must be greater than zero"),
  supporting_document: z.string().optional(),
});

export const liabilityRow = z.object({
  liability_type: z.string().min(1, "Type is required"),
  description: text(200),
  amount: z.number().positive("Amount must be greater than zero"),
  supporting_document: z.string().optional(),
});



/** Full-form pipeline — all top-level fields of Tax Return + child rows. */
export const taxReturnSchema = z.object({
  tax_client: z.string().min(1, "Select a client"),
  tax_engagement: z.string().optional(),
  taxpayer_type: z.string().min(1, "Select a taxpayer type"),
  tax_year: z.string().min(1, "Select a tax year"),
  tax_regime: z.string().optional(),
  return_type: z.string().min(1, "Select a return type"),
  amended_from: z.string().optional(),
  period_from: z.string().optional(),
  period_to: z.string().optional(),
  sb_team: z.string().optional(),
  assigned_consultant: z.string().optional(),
  reviewer: z.string().optional(),
  approver: z.string().optional(),
  filing_officer: z.string().optional(),
  total_income: z.number().nonnegative("Must be zero or more").optional(),
  total_deductions: z.number().nonnegative("Must be zero or more").optional(),
  total_tax_credits: z.number().nonnegative("Must be zero or more").optional(),
  total_tax_withheld: z.number().nonnegative("Must be zero or more").optional(),
  total_advance_tax: z.number().nonnegative("Must be zero or more").optional(),
  taxable_income: money,
  tax_liability: money,
  net_tax_payable: money,
  refund_due: money,
  approval_status: z.string().optional(),
  approved_by: z.string().optional(),
  approved_on: z.string().optional(),
  content_hash: z.string().optional(),
  approved_content_hash: z.string().optional(),
  fbr_submission_status: z.string().optional(),
  iris_acknowledgment_no: z.string().optional(),
  submission_timestamp: z.string().optional(),
  wealth_statement_required: z.string().optional(),
  net_wealth: money,
  total_assets: money,
  total_liabilities: money,
  net_wealth_previous_year: money,
  client_action_requests: text(5000),
  review_comments: text(5000),
  preparation_notes: text(5000),
  filing_error_notes: text(5000),
  income_sources: z.array(incomeRow),
  deduction_lines: z.array(deductionRow),
  credit_lines: z.array(creditRow),
  payment_lines: z.array(paymentRow),
  asset_lines: z.array(assetRow),
  liability_lines: z.array(liabilityRow),
});

