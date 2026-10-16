/**
 * Mirror of the server-side workflow map (`pakistan_tax_consultancy/api/workflow.py`).
 *
 * UI-only: the server independently validates every transition and role, so
 * hiding buttons is never a security control. Kept here so buttons appear
 * only when the server would actually accept the action.
 */

export const VALID_TRANSITIONS: Record<string, string[]> = {
  Draft: ["Submitted"],
  Submitted: ["Under Review"],
  "Under Review": ["Approved", "Rejected"],
  Rejected: ["Draft"],
  Approved: ["Filed"],
  Filed: [],
};

export const TRANSITION_ROLES: Record<string, string[]> = {
  "Draft -> Submitted": ["Tax Consultant", "Tax Admin"],
  "Submitted -> Under Review": ["Tax Consultant", "Tax Admin"],
  "Under Review -> Approved": ["Tax Reviewer", "Tax Admin"],
  "Under Review -> Rejected": ["Tax Reviewer", "Tax Admin"],
  "Rejected -> Draft": ["Tax Consultant", "Tax Admin"],
  "Approved -> Filed": ["Filing Officer", "Tax Admin"],
};

export interface TransitionAction {
  target: string;
  label: string;
  variant: "primary" | "outline" | "danger";
}

const LABELS: Record<string, TransitionAction> = {
  Submitted: { target: "Submitted", label: "Submit for review", variant: "primary" },
  "Under Review": { target: "Under Review", label: "Start review", variant: "primary" },
  Approved: { target: "Approved", label: "Approve", variant: "primary" },
  Rejected: { target: "Rejected", label: "Reject", variant: "danger" },
  Draft: { target: "Draft", label: "Return to draft", variant: "outline" },
  Filed: { target: "Filed", label: "Mark filed", variant: "primary" },
};

/** Actions allowed from `state`, filtered to what `roles` may perform. */
export function actionsFor(state: string | undefined, roles: string[]): TransitionAction[] {
  if (!state) return [];
  const targets = VALID_TRANSITIONS[state] ?? [];
  return targets
    .filter((t) => {
      const needed = TRANSITION_ROLES[`${state} -> ${t}`] ?? [];
      if (needed.length === 0) return false;
      return needed.some((r) => roles.includes(r)) || roles.includes("System Manager");
    })
    .map((t) => LABELS[t])
    .filter((a): a is TransitionAction => Boolean(a));
}

/** Method path for the whitelisted transition API. */
export const TRANSITION_METHOD = "pakistan_tax_consultancy.api.workflow.transition_tax_return";
