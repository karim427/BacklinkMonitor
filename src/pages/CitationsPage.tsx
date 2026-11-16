import { useEffect, useState } from "react";
import { Badge, Button, EmptyState, ErrorBanner, Field, Input, Select } from "@/components/ui/primitives";
import { ConfirmDialog, Dialog, Drawer, RowMenu } from "@/components/ui/overlays";
import { del, get, post, put, useApi } from "@/lib/api";
import { cn, fmtDate } from "@/lib/utils";
import { FilterBar, Kpi, KpiRow, PageHeader, Panel, Pager, RefreshButton, Table, TableSkeleton, THead, usePaged } from "@/features/shared/common";

function CitationDialog({ open, onOpenChange, row, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; row: any; onSaved: () => void }) {
  const [clients, setClients] = useState<any[]>([]); const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState<any>({ clientId: "", directory: "", name: "", address: "", phone: "" });
  useEffect(() => { if (open) { setErr(null); get("/clients").then((c) => setClients(c.rows)); setF(row ? { clientId: String(row.clientId), directory: row.directory, name: row.name, address: row.address, phone: row.phone } : { clientId: "", directory: "", name: "", address: "", phone: "" }); } }, [open, row]);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const fillGbp = () => { const c = clients.find((x) => String(x.id) === f.clientId); if (c) setF((p: any) => ({ ...p, name: c.gbpName ?? "", address: c.gbpAddress ?? "", phone: c.gbpPhone ?? "" })); };
  async function submit(e: React.FormEvent) { e.preventDefault(); const b = { ...f, clientId: Number(f.clientId) }; try { row ? await put(`/citations/${row.id}`, b) : await post("/citations", b); onSaved(); onOpenChange(false); } catch (e: any) { setErr(e.message); } }
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={row ? "Edit citation" : "Add citation"} description="NAP is compared to the client's Google Business Profile. Citations never count toward the link target.">
      <form onSubmit={submit} className="space-y-3">{err && <ErrorBanner message={err} />}
        <Field label="Client *"><Select value={f.clientId} onChange={(v) => set("clientId", v)} placeholder="Select client" options={clients.map((c) => ({ value: c.id, label: c.name }))} /></Field>
        <Field label="Directory *"><Input required value={f.directory} onChange={(e) => set("directory", e.target.value)} placeholder="Yelp" /></Field>
        <div className="flex justify-end"><Button type="button" size="sm" variant="ghost" disabled={!f.clientId} onClick={fillGbp}>Fill from GBP</Button></div>
        <Field label="Name *"><Input required value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Address *"><Input required value={f.address} onChange={(e) => set("address", e.target.value)} /></Field>
        <Field label="Phone *"><Input required value={f.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!f.clientId}>Save</Button></div>
      </form>
    </Dialog>
  );
}

export default function CitationsPage() {
  const { data, error, loading, reload } = useApi("/citations");
  const [f, setF] = useState({ q: "", client: "", status: "" }); const [dlg, setDlg] = useState<{ row: any } | null>(null); const [view, setView] = useState<any>(null); const [delT, setDelT] = useState<any>(null);
  const rows: any[] = (data?.rows ?? []).filter((r: any) => (!f.q || `${r.directory} ${r.name} ${r.address}`.toLowerCase().includes(f.q.toLowerCase())) && (!f.client || String(r.clientId) === f.client) && (!f.status || r.status === f.status));
  const pg = usePaged(rows, [f]); const t = data?.totals;
  const clients = [...new Map((data?.rows ?? []).map((r: any) => [r.clientId, r.client?.name])).entries()].map(([value, label]) => ({ value: value as number, label: label as string }));
  const bad = (ok: boolean) => (ok ? "" : "font-medium text-red-600");
  return (
    <>
      <PageHeader title="Citations" description="Directory listings checked against each client's Google Business Profile (name, address, phone)." actions={<><RefreshButton onClick={reload} loading={loading} /><Button onClick={() => setDlg({ row: null })}>Add citation</Button></>} />
      {error && <div className="mb-4"><ErrorBanner message={error} onRetry={reload} /></div>}
      <KpiRow cols={3}><Kpi label="Total" value={t?.total} loading={loading} /><Kpi label="Matched NAP" value={t?.matched} tone="green" loading={loading} /><Kpi label="Mismatches" value={t?.mismatches} tone="red" loading={loading} /></KpiRow>
      <Panel>
        <FilterBar dirty={Object.values(f).some(Boolean)} onClear={() => setF({ q: "", client: "", status: "" })}>
          <Input className="w-56" placeholder="Search citations…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
          <Select className="w-44" value={f.client} onChange={(v) => setF({ ...f, client: v })} placeholder="All clients" options={clients} />
          <Select className="w-36" value={f.status} onChange={(v) => setF({ ...f, status: v })} placeholder="All statuses" options={["Logged", "Mismatch"].map((s) => ({ value: s, label: s }))} />
        </FilterBar>
        {loading && !data ? <TableSkeleton /> : !rows.length ? <EmptyState title="No citations" /> : (
          <Table><THead cols={["Directory", "Client", "Name", "Address", "Phone", "GBP match", "Status", "Updated", ""]} />
            <tbody>{pg.slice.map((r) => (
              <tr key={r.id}><td className="font-medium">{r.directory}</td><td>{r.client?.name}</td><td className={bad(r.fields.name)}>{r.name}</td><td className={bad(r.fields.address)}>{r.address}</td><td className={bad(r.fields.phone)}>{r.phone}</td>
                <td><Badge tone={r.gbpMatch === "Matched" ? "green" : "red"}>{r.gbpMatch}</Badge></td><td><Badge tone={r.status === "Logged" ? "neutral" : "red"}>{r.status}</Badge></td><td>{fmtDate(r.updatedAt)}</td>
                <td><RowMenu items={[{ label: "Details", onSelect: () => setView(r) }, { label: "Edit", onSelect: () => setDlg({ row: r }) }, { label: "Delete", danger: true, onSelect: () => setDelT(r) }]} /></td></tr>
            ))}</tbody></Table>
        )}
        <Pager p={pg} />
      </Panel>
      <CitationDialog open={!!dlg} onOpenChange={(o) => !o && setDlg(null)} row={dlg?.row} onSaved={reload} />
      <Drawer open={!!view} onOpenChange={(o) => !o && setView(null)} title={view ? `${view.directory} · ${view.client?.name}` : ""}>
        {view && <div className="space-y-3 text-sm">{(["name", "address", "phone"] as const).map((k) => (
          <div key={k} className={cn("rounded-lg border p-3", view.fields[k] ? "border-zinc-200" : "border-red-300 bg-red-50")}>
            <p className="text-xs font-medium capitalize text-zinc-500">{k} {view.fields[k] ? "✓ matches" : "✗ differs"}</p>
            <p>Citation: {view[k]}</p><p className="text-zinc-500">GBP: {view.gbp[k] || "—"}</p></div>
        ))}</div>}
      </Drawer>
      <ConfirmDialog open={!!delT} onOpenChange={(o) => !o && setDelT(null)} title="Delete citation?" description={delT?.directory} onConfirm={async () => { await del(`/citations/${delT.id}`); reload(); }} />
    </>
  );
}
