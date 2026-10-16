/** Staff logins and their roles, in plain words (Tax Admin only). */
import { Copy, KeyRound, Pencil, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { StateBadge } from "@/components/common/state-badge";
import { Empty, ErrorState, InlineError, Loading } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, TextInput } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TD, TH, TR } from "@/components/ui/table";
import { useApi } from "@/lib/use-api";
import { apiCall } from "@/services/frappe";

const S = "pakistan_tax_consultancy.api.settings";
const ROLES: [string, string][] = [
  ["Tax Admin", "Runs the office: payments, website, settings, team"],
  ["Tax Consultant", "Prepares returns for their own clients"],
  ["Tax Reviewer", "Checks returns before they go to the client"],
  ["Tax Approver", "Approves returns the client confirmed"],
  ["Filing Officer", "Files on FBR IRIS and records the acknowledgment"],
  ["Field Officer", "Registers new clients on visits"],
];

interface Member { name: string; full_name: string; enabled: number; mobile_no: string | null; roles: string[]; open_returns: number }

function MemberDialog({ member, onClose, onSaved }: { member: Member | null; onClose: () => void; onSaved: (link?: string | null) => void }) {
  const [email, setEmail] = useState(member?.name ?? "");
  const [name, setName] = useState(member?.full_name ?? "");
  const [mobile, setMobile] = useState(member?.mobile_no ?? "");
  const [roles, setRoles] = useState<string[]>(member?.roles ?? ["Tax Consultant"]);
  const [enabled, setEnabled] = useState(member ? !!member.enabled : true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  return (
    <Dialog open onClose={onClose} title={member ? `Edit ${member.full_name}` : "Add a team member"}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button loading={busy} onClick={async () => {
          setBusy(true);
          setErr(null);
          try {
            const r = await apiCall<{ link: string | null }>(`${S}.save_member`, { email, full_name: name, roles, mobile_no: mobile, enabled: enabled ? 1 : 0 });
            onSaved(r.link);
          } catch (e) { setErr(e); } finally { setBusy(false); }
        }}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Full name" required>{(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Email (login)" required>{(id) => <TextInput id={id} type="email" disabled={!!member} value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
        <Field label="Mobile">{(id) => <TextInput id={id} type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} />}</Field>
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-semibold">What do they do?</legend>
          {ROLES.map(([role, hint]) => (
            <label key={role} className="flex items-start gap-2.5 rounded-md border p-2.5 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={roles.includes(role)}
                onChange={(e) => setRoles(e.target.checked ? [...roles, role] : roles.filter((r) => r !== role))} />
              <span><b>{role}</b><span className="block text-xs text-muted-foreground">{hint}</span></span>
            </label>
          ))}
        </fieldset>
        {member && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Can log in</label>}
        <InlineError error={err} />
      </div>
    </Dialog>
  );
}

export function TeamPage() {
  const { data, error, isLoading, mutate } = useApi<Member[]>(`${S}.team`);
  const [editing, setEditing] = useState<Member | null | "new">(null);
  const [link, setLink] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  return (
    <div className="page-container space-y-5">
      <PageHeader title="Team" subtitle="Who can log in and what they may do" icon={<Users className="h-5 w-5" />}
        actions={<Button onClick={() => setEditing("new")}><UserPlus className="h-4 w-4" /> Add member</Button>} />
      <InlineError error={err} />
      {isLoading && <Loading />}
      {error && <ErrorState error={error} onRetry={() => void mutate()} />}
      {data && !data.length && <Empty title="No staff yet" />}
      {data && data.length > 0 && (
        <Table>
          <thead><tr><TH>Name</TH><TH>Roles</TH><TH>Open returns</TH><TH>Status</TH><TH className="text-end">Action</TH></tr></thead>
          <tbody>{data.map((m) => (
            <TR key={m.name}>
              <TD className="font-medium">{m.full_name}<p className="text-xs text-muted-foreground">{m.name}</p></TD>
              <TD><div className="flex flex-wrap gap-1">{m.roles.map((r) => <StateBadge key={r} state="Scheduled" label={r} />)}</div></TD>
              <TD className="tabular-nums">{m.open_returns || "—"}</TD>
              <TD>{m.enabled ? <StateBadge state="Verified" label="Active" /> : <StateBadge state="Cancelled" label="Disabled" />}</TD>
              <TD className="whitespace-nowrap text-end">
                <button className="rounded-md p-2 text-muted-foreground hover:bg-accent" aria-label="Edit" onClick={() => setEditing(m)}><Pencil className="h-4 w-4" /></button>
                <button className="rounded-md p-2 text-muted-foreground hover:bg-accent" aria-label="Password link" title="New set-password link"
                  onClick={() => apiCall<{ link: string }>(`${S}.reset_link`, { email: m.name }).then((r) => setLink(r.link)).catch(setErr)}><KeyRound className="h-4 w-4" /></button>
              </TD>
            </TR>
          ))}</tbody>
        </Table>
      )}
      {editing && <MemberDialog member={editing === "new" ? null : editing} onClose={() => setEditing(null)}
        onSaved={(l) => { setEditing(null); if (l) setLink(l); void mutate(); }} />}
      <Dialog open={!!link} onClose={() => setLink(null)} title="Set-password link">
        <p className="mb-2 text-sm">Send this link to the team member (email is not set up yet, so share it on WhatsApp). It works once.</p>
        <div className="flex items-center gap-2 rounded-md bg-muted p-2"><code className="flex-1 break-all text-xs">{link}</code>
          <Button size="sm" variant="ghost" aria-label="Copy" onClick={() => void navigator.clipboard?.writeText(link ?? "")}><Copy className="h-4 w-4" /></Button></div>
      </Dialog>
    </div>
  );
}
