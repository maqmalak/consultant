export const CLIENTS_METHOD = "frappe.client.get_list";
export const DOC_GET_METHOD = "frappe.client.get_value";
export const DOC_INSERT_METHOD = "frappe.client.insert_doc";
export const DOC_UPDATE_METHOD = "frappe.client.update_doc";

export const STEPS = [
  "Taxpayer & engagement",
  "Period & parties",
  "Income",
  "Deductions",
  "Credits & payments",
  "Computation",
  "Wealth & notes",
  "Review & approvals",
  "Submission & FBR receipt",
  "Filing & finalize",
] as const;

export type TStep = (typeof STEPS)[number];

export const STATUS_ORDER = ["Draft", "Submitted", "Under Review", "Approved", "Rejected", "Filed"] as const;
export type TStatus = (typeof STATUS_ORDER)[number];
