import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge, Button, Card, ErrorBanner, Field, Input } from "@/components/ui/primitives";
import { ClientDialog } from "@/features/clients/ClientDialog";
import { ConfirmDialog, RowMenu } from "@/components/ui/overlays";
import { del, post, put, useApi } from "@/lib/api";
import { fmtDate } from "@/lib/utils";
import { PageHeader, Table, THead } from "@/features/shared/common";
import { CLUSTERS, CLUSTER_NICHES, DEFAULT_ANCHOR_BANDS, DEFAULT_SETTINGS } from "@server/services/constants";

const CATS = ["Domain", "Niche", "Quality", "Link", "Reuse"];

export default function SettingsPage() {
  const { data, error, reload } = useApi("/settings"); const { data: cl, reload: reloadClients } = useApi("/clients");
  const [s, setS] = useState<any>(DEFAULT_SETTINGS); const [msg, setMsg] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ c: any } | null>(null); const [delT, setDelT] = useState<any>(null); const [syncing, setSyncing] = useState(false);
  const [openCluster, setOpenCluster] = useState<Record<string, boolean>>({});
  useEffect(() => { if (data) setS(data.settings); }, [data]);
  const save = async (body: any, label: string) => { setErr(null); setMsg(null); try { await put("/settings", body); setMsg(`${label} saved.`); reload(); } catch (e: any) { setErr(e.message); } };
  const band = (k: string, side: "min" | "max", v: number) => setS({ ...s, anchorBands: { ...s.anchorBands, [k]: { ...s.anchorBands[k], [side]: v } } });
  const bandErr = Object.entries(s.anchorBands as Record<string, any>).find(([, b]) => b.min < 0 || b.max > 100 || b.min > b.max);
  const clients: any[] = cl?.rows ?? []; const ah = data?.ahrefs;
  return (
    <>
      <PageHeader title="Settings" description="Clients, integrations, anchor mix targets, verification defaults and the reject list." />
      {(error || err) && <div className="mb-4"><ErrorBanner message={(error || err)!} onRetry={reload} /></div>}
      {msg && <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800">{msg}</div>}

      <Card className="mb-6 overflow-hidden">
        <div className="flex items-center justify-between p-4"><h2 className="text-sm font-semibold">Clients &amp; clusters</h2><Button size="sm" onClick={() => setEdit({ c: null })}>Add client</Button></div>
        {CLUSTERS.map((c) => (
          <div key={c} className="border-t border-zinc-200">
            <button type="button" aria-expanded={!!openCluster[c]} onClick={() => setOpenCluster({ ...openCluster, [c]: !openCluster[c] })}
              className="flex w-full items-center gap-2 bg-zinc-50 px-4 py-3 text-left hover:bg-zinc-100">
              <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${openCluster[c] ? "" : "-rotate-90"}`} />
              <span className="text-sm font-medium">{c}</span><Badge>{clients.filter((x) => x.cluster === c).length}</Badge>
              <span className="ml-1 hidden truncate text-xs text-zinc-500 sm:inline">Niches: {CLUSTER_NICHES[c].join(", ")}</span>
            </button>
            {openCluster[c] && <Table><THead cols={["Client", "City / state", "Cash buyer", "Monthly target", "GBP", ""]} /><tbody>
              {clients.filter((x) => x.cluster === c).map((x) => { const g = [x.gbpName, x.gbpAddress, x.gbpPhone].filter(Boolean).length; return (
                <tr key={x.id}><td><div className="font-medium">{x.name}</div><div className="text-xs text-zinc-500">{x.domain} · {x.slug}</div></td><td>{x.city}{x.state && `, ${x.state}`}</td><td>{x.isCashBuyer ? "Yes" : "No"}</td><td>{x.defaultMonthlyTarget}</td>
                  <td><Badge tone={g === 3 ? "green" : "amber"}>GBP {g}/3</Badge></td><td><RowMenu items={[{ label: "Edit", onSelect: () => setEdit({ c: x }) }, { label: "Delete", danger: true, onSelect: () => setDelT(x) }]} /></td></tr>); })}
            </tbody></Table>}
          </div>
        ))}
      </Card>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-5"><h2 className="mb-3 text-sm font-semibold">Ahrefs API</h2>
          <div className="space-y-1.5 text-sm"><div className="flex justify-between"><span className="text-zinc-500">Status</span><Badge tone={ah?.credentialLoaded ? "green" : "amber"}>{ah?.credentialLoaded ? "Connected" : "No key — using mock data"}</Badge></div>
            <div className="flex justify-between"><span className="text-zinc-500">Credential loaded</span><span>{ah?.credentialLoaded ? "Yes (hidden)" : "No"}</span></div>
            <div className="flex justify-between"><span className="text-zinc-500">Donors synced</span><span>{ah?.donorsSynced} / {ah?.donorsTotal}</span></div>
            <div className="flex justify-between"><span className="text-zinc-500">Last sync</span><span>{fmtDate(ah?.lastSync)}</span></div></div>
          <Button className="mt-4" variant="outline" disabled={syncing} onClick={async () => { setSyncing(true); try { const r = await post("/donors/sync-ahrefs"); setMsg(`Synced ${r.synced}/${r.total} donors${r.mock ? " (mock)" : ""}.`); reload(); } catch (e: any) { setErr(e.message); } finally { setSyncing(false); } }}>{syncing ? "Syncing…" : "Sync donors"}</Button></Card>
        <Card className="p-5"><h2 className="mb-3 text-sm font-semibold">Verification defaults</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Field label="Verifier user agent"><Input value={s.verifierUserAgent} onChange={(e) => setS({ ...s, verifierUserAgent: e.target.value })} /></Field></div>
            {([["firstRecheckDays", "First recheck (days)"], ["nextRecheckDays", "Then every (days)"], ["fixWindowDays", "Fix window (days)"], ["defaultMonthlyTarget", "Default monthly target"]] as const).map(([k, l]) => <Field key={k} label={l}><Input type="number" min={1} value={s[k]} onChange={(e) => setS({ ...s, [k]: Number(e.target.value) })} /></Field>)}
          </div>
          <Button className="mt-4" onClick={() => save({ verifierUserAgent: s.verifierUserAgent, firstRecheckDays: s.firstRecheckDays, nextRecheckDays: s.nextRecheckDays, fixWindowDays: s.fixWindowDays, defaultMonthlyTarget: s.defaultMonthlyTarget }, "Verification defaults")}>Save</Button></Card>
      </div>

      <Card className="mb-6 p-5"><h2 className="mb-1 text-sm font-semibold">Anchor mix targets</h2><p className="mb-3 text-xs text-zinc-500">Rolling 3 months per target URL. Checklist: Branded 40–50%, Partial 20–30%, Natural 15–25%, Exact 0–10%.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Object.keys(DEFAULT_ANCHOR_BANDS).map((k) => (
          <div key={k} className="rounded-lg border border-zinc-200 p-3"><div className="mb-2 text-sm font-medium">{k}</div><div className="flex items-center gap-2">
            <Input type="number" aria-label={`${k} min`} value={s.anchorBands[k].min} onChange={(e) => band(k, "min", Number(e.target.value))} /><span>–</span><Input type="number" aria-label={`${k} max`} value={s.anchorBands[k].max} onChange={(e) => band(k, "max", Number(e.target.value))} /></div></div>))}</div>
        {bandErr && <p className="mt-2 text-sm text-red-600">{bandErr[0]}: values must be 0–100 and min ≤ max.</p>}
        <div className="mt-4 flex gap-2"><Button variant="outline" onClick={() => setS({ ...s, anchorBands: DEFAULT_ANCHOR_BANDS })}>Reset to defaults</Button><Button disabled={!!bandErr} onClick={() => save({ anchorBands: s.anchorBands }, "Anchor mix")}>Save anchor mix</Button></div></Card>

      <Card className="p-5"><h2 className="mb-1 text-sm font-semibold">Reject list</h2><p className="mb-3 text-xs text-zinc-500">Any one item rejects the link, even if every check above passes.</p>
        <div className="grid gap-4 md:grid-cols-2">{CATS.map((c) => { const rs = (data?.rejectRules ?? []).filter((r: any) => r.category === c); return (
          <div key={c} className="rounded-lg border border-zinc-200 p-3"><div className="mb-2 text-sm font-medium">{c} <Badge>{rs.length}</Badge></div>
            {rs.map((r: any) => <div key={r.code} className="border-t border-zinc-100 py-1.5 text-sm first:border-0">{r.label}{r.fixable && <div className="text-[11px] text-zinc-400">Fixable · 14-day window</div>}</div>)}</div>); })}</div></Card>

      <ClientDialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)} client={edit?.c} onSaved={() => { reloadClients(); reload(); }} />
      <ConfirmDialog open={!!delT} onOpenChange={(o) => !o && setDelT(null)} title="Delete client?" description={delT && `${delT.name} and all of its links, target pages and citations will be removed.`} onConfirm={async () => { await del(`/clients/${delT.id}`); reloadClients(); }} />
    </>
  );
}
