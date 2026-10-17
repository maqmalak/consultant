/** Typed wrappers around the app's whitelisted methods (pakistan_tax_consultancy.api.*). */
import { apiCall, apiUpload } from "@/services/frappe";

const PUB = "pakistan_tax_consultancy.api.public";
const AUTH = "pakistan_tax_consultancy.api.auth";
const PORTAL = "pakistan_tax_consultancy.api.portal";
const STAFF = "pakistan_tax_consultancy.api.staff";

export const M = { PUB, AUTH, PORTAL, STAFF } as const;

// ------------------------------------------------------------------------------------------------ types
export interface SiteInfo {
  firm_name: string | null;
  brand_color: string | null;
  tagline: string | null;
  logo: string | null;
  phone: string | null;
  whatsapp: string | null;
  whatsapp_message: string | null;
  email: string | null;
  address: string | null;
  office_hours: string | null;
  tax_year: string | null;
  tax_years: string[];
  filing_deadline: string | null;
  work_before_payment: number;
}

export interface Me {
  user: string;
  full_name?: string;
  roles: string[];
  is_staff?: boolean;
  client?: { name: string; client_name: string; email_verified: number; mobile_verified: number } | null;
  home: string;
}

export interface ReturnCard {
  name: string;
  tax_year: string;
  return_type: string;
  state: string;
  status: string;
  step: number;
  net_tax_payable: number;
  refund_due: number;
  iris_acknowledgment_no: string | null;
  has_receipt: boolean;
  action_needed: boolean;
}

export interface ProofRow {
  name: string;
  method: string;
  amount: number;
  reference: string | null;
  status: "Pending" | "Verified" | "Rejected";
  rejection_reason: string | null;
  creation: string;
}

export interface EngagementRow {
  name: string;
  service: string;
  service_package: string | null;
  tax_year: string | null;
  agreed_fee: number;
  discount: number;
  net_fee: number;
  payment_status: string;
  sales_invoice: string | null;
  tax_return: string | null;
  status: string;
  outstanding: number;
  proofs: ProofRow[];
}

export interface ClientDashboard {
  steps: string[];
  client: {
    name: string;
    client_name: string;
    client_type: string;
    cnic_masked: string | null;
    ntn: string | null;
    mobile: string | null;
    email: string | null;
    email_verified: number;
    mobile_verified: number;
    consultant: string | null;
  };
  returns: ReturnCard[];
  documents_to_upload: number;
  documents_rejected: number;
  unread_messages: number;
  engagements: EngagementRow[];
  current_tax_year: string | null;
  filing_deadline: string | null;
}

export interface ChecklistItem {
  name: string;
  document_type: string;
  document_name: string;
  status: "Requested" | "Pending" | "Verified" | "Rejected";
  is_required: number;
  rejection_reason: string | null;
  upload_date: string | null;
  is_client_upload: number;
  category: string | null;
  hint: string | null;
  has_file: boolean;
}

export interface ReturnSummary {
  income: { category: string; amount: number }[];
  total_income: number;
  total_deductions: number;
  taxable_income: number;
  tax_liability: number;
  total_tax_credits: number;
  total_tax_withheld: number;
  total_advance_tax: number;
  net_tax_payable: number;
  refund_due: number;
  total_assets: number;
  total_liabilities: number;
  net_wealth: number;
  withholding: { section: string | null; payer: string | null; amount: number }[];
  assets: { type: string; description: string | null; value: number }[];
}

export interface ReturnDetail extends ReturnCard {
  questions: Record<string, number>;
  can_edit_answers: boolean;
  checklist: ChecklistItem[];
  client_confirmed: number;
  client_confirmed_on: string | null;
  comments: { comment: string; from_client: number; creation: string; stage: string }[];
  summary?: ReturnSummary;
  step_dates: (string | null)[];
  problem: boolean;
  client_details?: Record<string, any> | null;
}

export interface Pkg {
  name: string;
  package_name: string;
  service: string;
  price: number;
  turnaround: string | null;
  for_whom: string | null;
  most_popular: number;
  inclusions: string[];
}

export interface ServiceRow {
  name: string;
  title: string;
  slug: string;
  category: string;
  icon: string | null;
  summary: string | null;
  price_from: number | null;
}

export interface Message {
  name: string;
  message: string;
  from_client: number;
  sender: string;
  sender_name?: string;
  creation: string;
  tax_return: string | null;
}

export interface PaymentDetails {
  bank_name: string | null;
  bank_account_title: string | null;
  bank_account_no: string | null;
  bank_iban: string | null;
  raast_id: string | null;
  jazzcash_number: string | null;
  jazzcash_title: string | null;
  easypaisa_number: string | null;
  easypaisa_title: string | null;
}

// ------------------------------------------------------------------------------------------------ calls
export const auth = {
  requestOtp: (mobile: string, channel?: "sms") =>
    apiCall<{ request: string; channel: string; to: string; sms_available: boolean }>(`${AUTH}.request_otp`, { mobile, purpose: "Signup", channel }),
  verifyOtp: (request: string, mobile: string, code: string) =>
    apiCall<{ verified: boolean }>(`${AUTH}.verify_otp`, { request, mobile, code }),
  signup: (data: Record<string, unknown>) => apiCall<{ user: string; client: string; home: string }>(`${AUTH}.signup`, data),
  login: (usr: string, pwd: string) => apiCall<{ message: string; home_page: string }>("login", { usr, pwd }),
  logout: () => apiCall("logout"),  // POST only on Frappe v16 (GET answers 403)
  resetPassword: (user: string) => apiCall("frappe.core.doctype.user.user.reset_password", { user }),
  resendVerification: () => apiCall(`${AUTH}.resend_email_verification`),
};

export const portal = {
  order: (pkg: string, tax_year?: string, promo_code?: string) =>
    apiCall<{ engagement: string; tax_return: string | null; net_fee?: number; existing?: boolean }>(`${PORTAL}.order`,
      { package: pkg, tax_year, promo_code }),
  checkPromo: (pkg: string, promo_code: string) =>
    apiCall<{ discount: number; error: string | null; net_fee: number }>(`${PORTAL}.check_promo`, { package: pkg, promo_code }),
  saveAnswers: (tax_return: string, answers: Record<string, number>) =>
    apiCall<{ required_documents: number }>(`${PORTAL}.save_answers`, { tax_return, answers }),
  upload: (tax_document: string, file: File | Blob, filename?: string) =>
    apiUpload<{ name: string; status: string }>(`${PORTAL}.upload`, file, { tax_document }, filename),
  addDocument: (document_type: string, tax_return?: string, note?: string) =>
    apiCall<{ name: string }>(`${PORTAL}.add_document`, { document_type, tax_return, note }),
  confirm: (tax_return: string) => apiCall(`${PORTAL}.confirm`, { tax_return }),
  ask: (tax_return: string, question: string) => apiCall(`${PORTAL}.ask_question`, { tax_return, question }),
  sendMessage: (message: string, tax_return?: string) => apiCall(`${PORTAL}.send_message`, { message, tax_return }),
  submitPayment: (fields: Record<string, string>, file?: File | Blob) =>
    file ? apiUpload<{ name: string }>(`${PORTAL}.submit_payment`, file, fields)
      : apiCall<{ name: string }>(`${PORTAL}.submit_payment`, fields),
  updateProfile: (data: Record<string, unknown>) => apiCall(`${PORTAL}.update_profile`, data),
};

export const staff = {
  transition: (tax_return: string, action: string, comment?: string) =>
    apiCall<{ workflow_state: string }>(`${STAFF}.transition`, { tax_return, action, comment }),
  calculate: (tax_return: string) => apiCall<Record<string, any>>(`${STAFF}.calculate`, { tax_return }),
  startReview: (tax_return: string) => apiCall<string>(`${STAFF}.start_review`, { tax_return }),
  saveReview: (review: string, checklist: { check_item: string; result: string; remarks?: string }[],
    calculation_verified: number, comments?: string) =>
    apiCall(`${STAFF}.save_review`, { review, checklist, calculation_verified, comments }),
  addComment: (tax_return: string, comment: string, visible_to_client = 0) =>
    apiCall(`${STAFF}.add_comment`, { tax_return, comment, visible_to_client }),
  regenerateChecklist: (tax_return: string) => apiCall(`${STAFF}.regenerate_checklist`, { tax_return }),
  uploadReceipt: (tax_return: string, file: File, iris_acknowledgment_no: string) =>
    apiUpload(`${STAFF}.upload_receipt`, file, { tax_return, iris_acknowledgment_no }),
  uploadDocument: (tax_document: string, file: File | Blob, filename?: string) =>
    apiUpload(`${STAFF}.upload_document`, file, { tax_document }, filename),
  createReturn: (tax_client: string, tax_year: string) =>
    apiCall<string>(`${STAFF}.create_return`, { tax_client, tax_year }),
  verifyDocument: (tax_document: string, decision: "Verified" | "Rejected", reason?: string) =>
    apiCall(`${STAFF}.verify_document`, { tax_document, decision, reason }),
  verifyPayment: (payment_proof: string, decision: "Verified" | "Rejected", reason?: string) =>
    apiCall<Record<string, any>>(`${STAFF}.verify_payment`, { payment_proof, decision, reason }),
  invite: (tax_client: string) =>
    apiCall<{ user: string; emailed: boolean; link: string }>(`${STAFF}.invite`, { tax_client }),
  convertVisit: (site_visit: string, send_invite = 0) =>
    apiCall<{ tax_client: string }>(`${STAFF}.convert_visit`, { site_visit, send_invite }),
  importClients: (file: File, dry_run: number) =>
    apiUpload<{ rows: any[]; summary: Record<string, number>; dry_run: number }>(`${STAFF}.import_clients`, file,
      { dry_run: String(dry_run) }),
  reply: (tax_client: string, message: string) => apiCall(`${STAFF}.reply`, { tax_client, message }),
  updateConsultation: (name: string, data: Record<string, unknown>) =>
    apiCall(`${STAFF}.update_consultation`, { name, ...data }),
};

/** Same-origin download link for a private file (permission-checked and audited on the server). */
export function downloadUrl(doctype: string, name: string, fieldname: string, asStaff = false): string {
  const base = asStaff ? STAFF : PORTAL;
  const q = new URLSearchParams({ doctype, name, fieldname });
  return `/api/method/${base}.download?${q.toString()}`;
}

export function whatsappLink(number: string | null | undefined, text?: string | null): string | null {
  const digits = (number ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
