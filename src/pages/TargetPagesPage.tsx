import { AdminOnly } from "@/lib/auth";
import { useEffect, useState } from "react";
import { Badge, Button, EmptyState, ErrorBanner, Field, Input, Select } from "@/components/ui/primitives";
import { ConfirmDialog, Dialog, RowMenu } from "@/components/ui/overlays";
import { del, get, post, put, useApi } from "@/lib/api";
import { FilterBar, Kpi, KpiRow, PageHeader, Panel, Pager, RefreshButton, Sub, Table, TableSkeleton, THead, usePaged } from "@/features/shared/common";

const tone = (s: string) => (s === "Approved" ? "green" : s === "Rejected" ? "red" : "amber");

function TargetPageDialog({ open, onOpenChange, row, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; row: any; onSaved: () => void }) {
  const [clients, setClients] = useState<any[]>([]);
  const [f, setF] = useState<any>({ clientId: "", url: "", keyword: "", currentRDs: 0, rdsNeeded: 0 });
  const [prev, setPrev] = useState<any>(null); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) { setErr(null); get("/clients").then((c) => setClients(c.rows)); setF(row ? { clientId: String(row.clientId), url: row.url, keyword: row.keyword, currentRDs: row.currentRDs, rdsNeeded: row.rdsNeeded } : { clientId: "", url: "", keyword: "", currentRDs: 0, rdsNeeded: 0 }); } }, [open, row]);
  useEffect(() => { if (open) post("/target-pages/preview", { rdsNeeded: Number(f.rdsNeeded) || 0, currentRDs: Number(f.currentRDs) || 0 }).then(setPrev).catch(() => {}); }, [f.rdsNeeded, f.currentRDs, open]);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = { clientId: Number(f.clientId), url: f.url, keyword: f.keyword, currentRDs: Number(f.currentRDs), rdsNeeded: Number(f.rdsNeeded) };
    try { row ? await put(`/target-pages/${row.id}`, body) : await post("/target-pages", body); onSaved(); onOpenChange(false); } catch (e: any) { setErr(e.message); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={row ? "Edit target page" : "Add target page"} description="Stage 1: approve only if the RD gap closes in ≤ 6 months at 4 links/month.">
      <form onSubmit={submit} className="space-y-3">
        {err && <ErrorBanner message={err} />}
        <Field label="Client *"><Select value={f.clientId} onChange={(v) => set("clientId", v)} placeholder="Select client" options={clients.map((c) => ({ value: c.id, label: c.name }))} /></Field>
        <Field label="Page URL *"><Input required type="url" value={f.url} onChange={(e) => set("url", e.target.value)} /></Field>
        <Field label="Keyword *"><Input required value={f.keyword} onChange={(e) => set("keyword", e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Current RDs"><Input type="number" min={0} value={f.currentRDs} onChange={(e) => set("currentRDs", e.target.value)} /></Field>
          <Field label="RDs needed (gap)"><Input type="number" min={0} value={f.rdsNeeded} onChange={(e) => set("rdsNeeded", e.target.value)} /></Field>
        </div>
        {prev && <div className={`rounded-lg border p-3 text-sm ${prev.suggestion === "Approved" ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800"}`}>
          {prev.linksNeeded} links needed · {prev.monthsToClose} month(s) to close → suggest <b>{prev.suggestion === "Approved" ? "approve" : "reject"}</b>{prev.reason && ` — ${prev.reason}`}</div>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!f.clientId}>Save</Button></div>
      </form>
    </Dialog>
  );
}

export default function TargetPagesPage() {
  const { data, error, loading, reload } = useApi("/target-pages");
  const [f, setF] = useState({ q: "", client: "", status: "", month: "" });
  const [dlg, setDlg] = useState<{ row: any } | null>(null); const [delT, setDelT] = useState<any>(null); const [err, setErr] = useState<string | null>(null);
  const rows: any[] = (data?.rows ?? []).filter((r: any) => (!f.q || `${r.keyword} ${r.url}`.toLowerCase().includes(f.q.toLowerCase())) && (!f.client || String(r.clientId) === f.client) && (!f.status || r.status === f.status) && (!f.month || r.approvalMonth === f.month));
  const pg = usePaged(rows, [f]); const t = data?.totals;
  const clients = [...new Map((data?.rows ?? []).map((r: any) => [r.clientId, r.client?.name])).entries()].map(([value, label]) => ({ value: value as number, label: label as string }));
  const months = [...new Set<string>((data?.rows ?? []).map((r: any) => r.approvalMonth).filter(Boolean))];
  const setStatus = async (r: any, status: string) => { try { await put(`/target-pages/${r.id}`, { status }); reload(); } catch (e: any) { setErr(e.message); } };
  const dirty = Object.values(f).some(Boolean);
  return (
    <>
      <PageHeader title="Target pages" description="Stage 1 — approve pages whose RD gap closes in ≤ 6 months." actions={<><RefreshButton onClick={reload} loading={loading} /><AdminOnly><Button onClick={() => setDlg({ row: null })}>Add target page</Button></AdminOnly></>} />
      {(error || err) && <div className="mb-4"><ErrorBanner message={(error || err)!} onRetry={reload} /></div>}
      <KpiRow><Kpi label="Approved" value={t?.approved} tone="green" loading={loading} /><Kpi label="Pending" value={t?.pending} tone="amber" loading={loading} /><Kpi label="Rejected" value={t?.rejected} tone="red" loading={loading} /><Kpi label="Links needed" value={t?.linksNeeded} loading={loading} /></KpiRow>
      <Panel>
        <FilterBar dirty={dirty} onClear={() => setF({ q: "", client: "", status: "", month: "" })}>
          <Input className="w-56" placeholder="Search…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
          <Select className="w-40" value={f.client} onChange={(v) => setF({ ...f, client: v })} placeholder="All clients" options={clients} />
          <Select className="w-36" value={f.status} onChange={(v) => setF({ ...f, status: v })} placeholder="All statuses" options={["Pending", "Approved", "Rejected"].map((s) => ({ value: s, label: s }))} />
          <Select className="w-40" value={f.month} onChange={(v) => setF({ ...f, month: v })} placeholder="Approval month" options={months.map((m) => ({ value: m, label: m }))} />
        </FilterBar>
        {loading && !data ? <TableSkeleton /> : !rows.length ? <EmptyState title="No target pages" /> : (
          <Table><THead cols={["Client", "Keyword", "RDs needed", "Links needed", "Months", "Status", "Approval month", ""]} />
            <tbody>{pg.slice.map((r) => (
              <tr key={r.id}><td className="font-medium">{r.client?.name}</td><td className="max-w-64"><div>{r.keyword}</div><Sub><span className="block truncate">{r.url}</span></Sub></td>
                <td>{r.rdsNeeded}</td><td>{r.linksNeeded}</td><td>{r.monthsToClose}</td><td><Badge tone={tone(r.status)}>{r.status}</Badge></td><td>{r.approvalMonth ?? "—"}</td>
                <td><AdminOnly><RowMenu items={[{ label: "Approve", onSelect: () => setStatus(r, "Approved"), hidden: r.status === "Approved" }, { label: "Reject", onSelect: () => setStatus(r, "Rejected"), hidden: r.status === "Rejected" }, { label: "Edit", onSelect: () => setDlg({ row: r }) }, { label: "Delete", danger: true, onSelect: () => setDelT(r) }]} /></AdminOnly></td></tr>
            ))}</tbody></Table>
        )}
        <Pager p={pg} />
      </Panel>
      <TargetPageDialog open={!!dlg} onOpenChange={(o) => !o && setDlg(null)} row={dlg?.row} onSaved={reload} />
      <ConfirmDialog open={!!delT} onOpenChange={(o) => !o && setDelT(null)} title="Delete target page?" description={delT?.keyword} onConfirm={async () => { await del(`/target-pages/${delT.id}`); reload(); }} />
    </>
  );
}
