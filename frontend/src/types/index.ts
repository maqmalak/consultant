/** Frappe / Pakistan Tax Consultancy TypeScript domain types.
 *  Field names verified against the live DocType JSONs. */

export interface FrappeMeta {
  name: string;
  owner: string;
  creation: string;
  modified: string;
  modified_by: string;
  idx: number;
  docstatus: 0 | 1 | 2;
}

/** Minimal User document shape used by the auth provider. */
export interface FrappeUser extends FrappeMeta {
  doctype: "User";
  email: string;
  full_name: string;
  first_name?: string;
  user_image?: string | null;
  enabled?: 0 | 1;
}

// ---------------------------------------------------------------- Tax Client

export interface TaxClient extends FrappeMeta {
  doctype: "Tax Client";
  client_name: string;
  client_type?: string;
  cnic?: string;
  cnic_masked?: string;
  ntn?: string;
  email?: string;
  mobile?: string;
  city?: string;
  province?: string;
  business_name?: string;
  status?: string;
  assigned_consultant?: string;
  portal_user?: string;
}

// ---------------------------------------------------------------- Tax Return

export interface TaxReturn extends FrappeMeta {
  doctype: "Tax Return";
  tax_client: string;
  client_name?: string;
  tax_engagement?: string;
  taxpayer_type?: string;
  tax_year?: string;
  return_type?: string;
  tax_regime?: string;
  workflow_state?: string;
  assigned_consultant?: string;
  reviewer?: string;
  approver?: string;
  filing_officer?: string;
  total_income?: number;
  taxable_income?: number;
  tax_liability?: number;
  net_tax_payable?: number;
  refund_due?: number;
  approval_status?: string;
  content_hash?: string;
  approved_content_hash?: string;
  fbr_submission_status?: string;
  iris_acknowledgment_no?: string;
  submission_timestamp?: string;
}

// -------------------------------------------------------------- Site Visit

export interface SiteVisit extends FrappeMeta {
  doctype: "Site Visit";
  visit_type?: string;
  tax_client?: string;
  full_name?: string;
  mobile?: string;
  status?: string;
  visit_date?: string;
  purpose?: string;
  city?: string;
  field_officer?: string;
  assigned_consultant?: string;
  follow_up_date?: string;
}

// ------------------------------------------------------------------ Dashboard

/** Row shape of `tax_dashboard.get_dashboard_summary.recent_filings`. */
export interface RecentFiling {
  name: string;
  tax_client: string;
  client_name?: string;
  tax_year?: string;
  workflow_state?: string;
  net_tax_payable?: number;
  fbr_submission_status?: string;
  creation: string;
}

/** Shape of `tax_dashboard.get_dashboard_summary` (Phase 6 API). */
export interface DashboardSummary {
  total_returns: number;
  state_counts: Record<string, number>;
  total_liability: number;
  total_net_payable: number;
  total_refund_due: number;
  recent_filings: RecentFiling[];
}
