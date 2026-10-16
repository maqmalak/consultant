import { PhoneCall } from "lucide-react";
import { useState } from "react";
import { StateBadge } from "@/components/common/state-badge";
import { Empty, ErrorState, InlineError, Loading } from "@/components/common/states";
import { SelectInput } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TD, TH, TR } from "@/components/ui/table";
import { staff, whatsappLink } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useQueue } from "./queue";

export function ConsultationsPage() {
  const { data, error, isLoading, mutate } = useQueue("consultations");
  const [err, setErr] = useState<unknown>(null);
  return (
    <div className="page-container">
      <PageHeader title="Consultation requests" subtitle="Bookings from the website · each also created an ERPNext Lead"
        icon={<PhoneCall className="h-5 w-5" />} />
      <InlineError error={err} />
      {isLoading && <Loading />}
      {error && <ErrorState error={error} onRetry={() => void mutate()} />}
      {data && !data.rows.length && <Empty title="No open requests" />}
      {data && data.rows.length > 0 && (
        <Table>
          <thead><tr><TH>Name</TH><TH>Contact</TH><TH>Service</TH><TH>Mode / when</TH><TH>Message</TH><TH>Status</TH></tr></thead>
          <tbody>
            {data.rows.map((r) => (
              <TR key={r.name}>
                <TD className="font-medium">{r.full_name}{r.call_preference === "Urgent" && <span className="ms-1"><StateBadge state="Rejected" label="Urgent" /></span>}</TD>
                <TD dir="ltr"><a className="text-primary hover:underline" href={`tel:${r.mobile}`}>{r.mobile}</a>
                  {whatsappLink(r.mobile) && <a className="ms-2 text-xs text-[#128C7E]" target="_blank" rel="noopener" href={whatsappLink(r.mobile)!}>WhatsApp</a>}
                  {r.email && <p className="text-xs text-muted-foreground">{r.email}</p>}</TD>
                <TD>{r.service || "—"}</TD>
                <TD>{r.mode}<p className="text-xs text-muted-foreground">{formatDate(r.preferred_date)} {r.preferred_slot || ""}</p></TD>
                <TD className="max-w-xs whitespace-pre-wrap text-xs">{r.message || "—"}</TD>
                <TD>
                  <SelectInput aria-label="Status" className="h-9 min-w-[130px]" value={r.status}
                    onChange={(e) => staff.updateConsultation(r.name, { status: e.target.value }).then(() => mutate()).catch(setErr)}>
                    {["New", "Contacted", "Scheduled", "Completed", "Cancelled"].map((s) => <option key={s}>{s}</option>)}
                  </SelectInput>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
