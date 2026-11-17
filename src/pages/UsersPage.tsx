import { useState } from "react";
import { Dialog, ConfirmDialog } from "@/components/ui/overlays";
import { Badge, Button, EmptyState, ErrorBanner, Field, Input, Select } from "@/components/ui/primitives";
import { del, post, put, useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageHeader, Panel, RefreshButton, Table, TableSkeleton, THead } from "@/features/shared/common";

const ROLES = [{ value: "user", label: "User — add & verify own links" }, { value: "admin", label: "Admin — full access" }];

export default function UsersPage() {
  const { user: me } = useAuth();
  const { data, error, loading, reload } = useApi("/users");
  const [inviting, setInviting] = useState(false); const [email, setEmail] = useState(""); const [name, setName] = useState(""); const [role, setRole] = useState("user");
  const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null); const [delU, setDelU] = useState<any>(null);
  const rows: any[] = data?.rows ?? [];

  async function invite(e: React.FormEvent) {
    e.preventDefault(); setErr(null);
    try { const r = await post("/users", { email, name, role }); setInviting(false); setEmail(""); setName(""); setRole("user"); setMsg(r.emailed ? `Invited ${r.email}. They can sign in now.` : `Added ${r.email}, but the invite email could not be sent. They can still sign in with their email.`); reload(); }
    catch (e: any) { setErr(e.message); }
  }
  async function patch(id: number, body: Record<string, unknown>) { setErr(null); try { await put(`/users/${id}`, body); reload(); } catch (e: any) { setErr(e.message); } }

  return (
    <>
      <PageHeader title="Users" description="Invite teammates by email. They sign in with a 6-digit code — no passwords." actions={<><RefreshButton onClick={reload} loading={loading} /><Button onClick={() => { setErr(null); setInviting(true); }}>Invite user</Button></>} />
      {(error || err) && <div className="mb-4"><ErrorBanner message={(error || err)!} onRetry={reload} /></div>}
      {msg && <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800">{msg}</div>}
      <Panel>
        {loading && !data ? <TableSkeleton /> : !rows.length ? <EmptyState title="No users yet" hint="Invite someone to get started." /> : (
          <Table>
            <THead cols={["Email", "Name", "Role", "Status", "Last sign-in", ""]} />
            <tbody>
              {rows.map((u) => {
                const isMe = u.id === me?.id;
                return (
                  <tr key={u.id}>
                    <td className="font-medium">{u.email}{isMe && <span className="ml-2 text-xs text-zinc-500">(you)</span>}</td>
                    <td>{u.name ?? "—"}</td>
                    <td><Select className="w-28" value={u.role} disabled={isMe} onChange={(v) => patch(u.id, { role: v })} options={[{ value: "user", label: "User" }, { value: "admin", label: "Admin" }]} /></td>
                    <td><Badge tone={u.active ? "green" : "neutral"}>{u.active ? "Active" : "Disabled"}</Badge></td>
                    <td className="whitespace-nowrap text-zinc-500">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "Never"}</td>
                    <td className="whitespace-nowrap text-right">
                      {!isMe && <><Button size="sm" variant="outline" onClick={() => patch(u.id, { active: !u.active })}>{u.active ? "Disable" : "Enable"}</Button> <Button size="sm" variant="ghost" onClick={() => setDelU(u)}>Remove</Button></>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Panel>
      <Dialog open={inviting} onOpenChange={setInviting} title="Invite user" description="Only invited emails can sign in.">
        <form onSubmit={invite} className="space-y-3">
          <Field label="Email"><Input type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Name (optional)"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Role"><Select value={role} onChange={setRole} options={ROLES} /></Field>
          {err && <ErrorBanner message={err} />}
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setInviting(false)}>Cancel</Button><Button disabled={!email}>Send invite</Button></div>
        </form>
      </Dialog>
      <ConfirmDialog open={!!delU} onOpenChange={(o) => !o && setDelU(null)} title="Remove user?" description={delU?.email} onConfirm={async () => { try { await del(`/users/${delU.id}`); setDelU(null); reload(); } catch (e: any) { setErr(e.message); setDelU(null); } }} />
    </>
  );
}
