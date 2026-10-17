import { Loader2, MessageCircle } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/cn";
import { apiCall, humanizeError } from "@/services/frappe";

/** WhatsApp for a CRM lead / deal: opens (or starts) their chat in the team inbox — never wa.me, which only shows
 * WhatsApp's "open the app" page in a browser. */
export function useOpenWhatsApp() {
  const navigate = useNavigate();
  return (doctype: "CRM Lead" | "CRM Deal", name: string) =>
    apiCall<string>("pakistan_tax_consultancy.api.whatsapp.open_crm_conversation", { doctype, name })
      .then((c) => navigate(`/staff/inbox?view=all&c=${encodeURIComponent(c)}`));
}

export function WhatsAppButton({ doctype, name, label, className }: { doctype: "CRM Lead" | "CRM Deal"; name: string; label?: string; className?: string }) {
  const open = useOpenWhatsApp();
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" title="Open in the team WhatsApp inbox" aria-label={label ?? "WhatsApp"} disabled={busy}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setBusy(true); open(doctype, name).catch((err) => window.alert(humanizeError(err))).finally(() => setBusy(false)); }}
      className={cn("inline-flex items-center gap-1.5 text-[#128C7E] hover:bg-accent dark:text-[#25D366]", className)}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}{label}
    </button>
  );
}
