import { Badge } from "@/components/ui/badge";

type Variant = "neutral" | "info" | "success" | "warning" | "danger" | "brand";

const BY_STATE: Record<string, Variant> = {
  "Documents Pending": "warning", Draft: "neutral", "Changes Required": "danger", "Pending Review": "info",
  "Under Review": "info", Reviewed: "brand", "Awaiting Client Confirmation": "warning", Approved: "success",
  "Submitted to FBR": "info", "Filing Error": "danger", Acknowledged: "success", Closed: "neutral",
  Requested: "neutral", Pending: "warning", Verified: "success", Rejected: "danger", Paid: "success",
  "Partially Paid": "warning", Invoiced: "warning", Unbilled: "neutral", Waived: "neutral", New: "info",
  Contacted: "brand", Qualified: "info", Converted: "success", "Not Interested": "neutral", Scheduled: "info",
  Completed: "success", Cancelled: "neutral",
};

export function StateBadge({ state, label }: { state?: string | null; label?: string }) {
  if (!state) return null;
  return <Badge variant={BY_STATE[state] ?? "neutral"}>{label ?? state}</Badge>;
}
