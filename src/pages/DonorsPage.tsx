import { AdminOnly } from "@/lib/auth";
import { useEffect, useState } from "react";
import { Badge, Button, EmptyState, ErrorBanner, Field, Input, Select } from "@/components/ui/primitives";
import { ConfirmDialog, Dialog, Drawer } from "@/components/ui/overlays";
import { del, get, post, useApi } from "@/lib/api";
import { fmtDate, fmtNum } from "@/lib/utils";
import { FilterBar, Kpi, KpiRow, PageHeader, Panel, Pager, RefreshButton, Sub, Table, TableSkeleton, THead, VerdictBadge, usePaged } from "@/features/shared/common";
import { CLUSTERS } from "@server/services/constants";

function DonorDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const blank = { domain: "", name: "", dr: 0, usTrafficPct: 0, organicTraffic: 0, referringDomains: 0, linkedDomains: 0, cluster: CLUSTERS[0] as string, niche: "", isLocal: false, localArea: "" };
  const [f, setF] = useState<any>(blank); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) { setF(blank); setErr(null); } }, [open]); // eslint-disable-line
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const num = (k: string, label: string) => <Field label={label}><Input type="number" min={0} value={f[k]} onChange={(e) => set(k, Number(e.target.value))} /></Field>;
  async function submit(e: React.FormEvent) { e.preventDefault(); try { await post("/donors", { ...f, name: f.name || null, niche: f.niche || null, localArea: f.localArea || null }); onSaved(); onOpenChange(false); } catch (e: any) { setErr(e.message); } }
  return (
    <Dialog open={open} onOpenChange={onOpenChange} wide title="Add donor" description="Metrics can be refreshed later with Sync from Ahrefs.">
      <form onSubmit={submit} className="space-y-3">{err && <ErrorBanner message={err} />}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Domain *"><Input required value={f.domain} onChange={(e) => set("domain", e.target.value)} /></Field>
          <Field label="Name"><Input value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="Cluster"><Select value={f.cluster} onChange={(v) => set("cluster", v)} options={CLUSTERS.map((c) => ({ value: c, label: c }))} /></Field>
          <Field label="Niche"><Input value={f.niche} onChange={(e) => set("niche", e.target.value)} /></Field>
          {num("dr", "DR")}{num("usTrafficPct", "US traffic %")}{num("organicTraffic", "Organic traffic")}{num("referringDomains", "Referring domains")}{num("linkedDomains", "Linked domains")}
          <Field label="Local area"><Input value={f.localArea} onChange={(e) => set("localArea", e.target.value)} placeholder="Houston, TX" /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.isLocal} onChange={(e) => set("isLocal", e.target.checked)} />Local donor (min traffic 300)</label>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button>Add donor</Button></div>
      </form>
    </Dialog>
  );
}

function DonorDrawer({ id, onClose }: { id: number | null; onClose: () => void }) {
  const [d, setD] = useState<any>(null);
  useEffect(() => { setD(null); if (id) get(`/donors/${id}`).then(setD).catch(() => {}); }, [id]);
  return (
    <Drawer open={!!id} onOpenChange={(o) => !o && onClose()} title={d?.donor.domain ?? "Donor"}>
      {!d ? <TableSkeleton rows={4} /> : (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-2 text-sm">{[["DR", d.donor.dr], ["US traffic", `${d.donor.usTrafficPct}%`], ["Organic", fmtNum(d.donor.organicTraffic)], ["Ref. domains", fmtNum(d.donor.referringDomains)], ["Linked", fmtNum(d.donor.linkedDomains)], ["Synced", fmtDate(d.donor.ahrefsSyncedAt)]].map(([k, v]) => <div key={k as string} className="rounded-lg border border-zinc-200 p-2"><Sub>{k}</Sub><div className="font-medium">{v}</div></div>)}</div>
          <div><h3 className="mb-2 text-sm font-semibold">Check A <Badge tone={d.checkA.passed ? "green" : "red"}>{d.checkA.passed ? "Pass" : "Fail"}</Badge></h3>
            {d.checkA.criteria.map((c: any) => <div key={c.key} className="flex justify-between border-t border-zinc-100 py-1.5 text-sm"><span>{c.label}</span><span className={c.pass ? "text-green-700" : "text-red-600"}>{c.pass ? "✓" : "✗"} {c.detail}</span></div>)}</div>
          <div><h3 className="mb-2 text-sm font-semibold">Links using this donor ({d.links.length})</h3>
            {d.links.map((l: any) => <div key={l.id} className="flex items-center justify-between border-t border-zinc-100 py-1.5 text-sm"><span>{l.client?.name}</span><VerdictBadge v={l.verdict} /></div>)}</div>
        </div>
      )}
    </Drawer>
  );
}

export default function DonorsPage() {
  const [preview, setPreview] = useState(""); const [f, setF] = useState({ q: "", cluster: "", local: false });
  const { data, error, loading, reload } = useApi(`/donors${preview ? `?previewClient=${preview}` : ""}`);
  const { data: cl } = useApi("/clients");
  const [adding, setAdding] = useState(false); const [view, setView] = useState<number | null>(null); const [delT, setDelT] = useState<any>(null);
  const [syncing, setSyncing] = useState(false); const [msg, setMsg] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  const rows: any[] = (data?.rows ?? []).filter((r: any) => (!f.q || `${r.domain} ${r.name}`.toLowerCase().includes(f.q.toLowerCase())) && (!f.cluster || r.cluster === f.cluster) && (!f.local || r.isLocal));
  const pg = usePaged(rows, [f, preview]); const t = data?.totals;
  async function sync() { setSyncing(true); setErr(null); try { const r = await post("/donors/sync-ahrefs"); setMsg(`Synced ${r.synced}/${r.total} donors${r.mock ? " (mock data — no AHREFS_API_KEY set)" : ""}.`); reload(); } catch (e: any) { setErr(e.message); } finally { setSyncing(false); } }
  return (
    <>
      <PageHeader title="Donors" description="Check A registry: US traffic, DR, niche, traffic floor and reuse." actions={<><RefreshButton onClick={reload} loading={loading} /><AdminOnly><Button variant="outline" disabled={syncing} onClick={sync}>{syncing ? "Syncing…" : "Sync from Ahrefs"}</Button><Button onClick={() => setAdding(true)}>Add donor</Button></AdminOnly></>} />
      {(error || err) && <div className="mb-4"><ErrorBanner message={(error || err)!} onRetry={reload} /></div>}
      {msg && <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800">{msg}</div>}
      <KpiRow><Kpi label="Donors" value={t?.donors} loading={loading} /><Kpi label="Average DR" value={t?.avgDr} loading={loading} /><Kpi label="Local donors" value={t?.local} loading={loading} /><Kpi label="Reuse warnings" value={t?.reuseWarnings} tone="amber" loading={loading} /></KpiRow>
      <Panel>
        <FilterBar dirty={!!f.q || !!f.cluster || f.local || !!preview} onClear={() => { setF({ q: "", cluster: "", local: false }); setPreview(""); }}>
          <Input className="w-56" placeholder="Search donors…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
          <Select className="w-44" value={f.cluster} onChange={(v) => setF({ ...f, cluster: v })} placeholder="All clusters" options={CLUSTERS.map((c) => ({ value: c, label: c }))} />
          <Select className="w-56" value={preview} onChange={setPreview} placeholder="Preview reuse for a client" options={(cl?.rows ?? []).map((c: any) => ({ value: c.id, label: c.name }))} />
          <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={f.local} onChange={(e) => setF({ ...f, local: e.target.checked })} />Local only</label>
        </FilterBar>
        {loading && !data ? <TableSkeleton /> : !rows.length ? <EmptyState title="No donors" /> : (
          <Table><THead cols={["Donor", "DR", "US %", "Organic traffic", "Local area", "Clients", "Last used", ""]} />
            <tbody>{pg.slice.map((r) => (
              <tr key={r.id}><td><div className="font-medium">{r.domain}</div><Sub>{r.name} · {r.cluster}</Sub></td><td>{r.dr}</td>
                <td className={r.usTrafficPct < 60 ? "text-red-600" : ""}>{r.usTrafficPct}%</td>
                <td><div className={r.organicTraffic < r.minTraffic ? "text-red-600" : ""}>{fmtNum(r.organicTraffic)}</div><Sub>min {fmtNum(r.minTraffic)}{r.isLocal && " · local"}</Sub></td>
                <td>{r.localArea ?? "—"}</td>
                <td><Badge tone={r.reuseWarning ? "amber" : "neutral"}>{r.clientsLinked} / 3</Badge>{r.reuseForPreview && <Sub>reused &lt; 6 mo</Sub>}</td>
                <td>{fmtDate(r.lastUsedAt)}</td>
                <td className="whitespace-nowrap"><Button size="sm" variant="outline" onClick={() => setView(r.id)}>View</Button> <AdminOnly><Button size="sm" variant="ghost" onClick={() => setDelT(r)}>Delete</Button></AdminOnly></td></tr>
            ))}</tbody></Table>
        )}
        <Pager p={pg} />
      </Panel>
      <DonorDialog open={adding} onOpenChange={setAdding} onSaved={reload} /><DonorDrawer id={view} onClose={() => setView(null)} />
      <ConfirmDialog open={!!delT} onOpenChange={(o) => !o && setDelT(null)} title="Delete donor?" description={delT && `${delT.domain} — blocked if links still use it.`} onConfirm={async () => { try { await del(`/donors/${delT.id}`); reload(); } catch (e: any) { setErr(e.message); } }} />
    </>
  );
}
