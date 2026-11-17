import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Download, Upload } from "lucide-react";
import { Button, EmptyState, ErrorBanner, Input, Select } from "@/components/ui/primitives";
import { ConfirmDialog, Dialog, RowMenu } from "@/components/ui/overlays";
import { authHeaders, del, post, useApi } from "@/lib/api";
import { downloadText, fmtDate, ruleLabel } from "@/lib/utils";
import { Pager, PageHeader, Panel, FilterBar, Kpi, KpiRow, RefreshButton, ActionBadge, StageBadge, Sub, Table, TableSkeleton, THead, VerdictBadge, VerifBadge, DueText, usePaged, ext } from "@/features/shared/common";
import { LinkDialog } from "@/features/links/LinkDialog";
import { StatusSelect } from "@/features/links/StatusSelect";
import { PRE_LIVE, STAGES, VERDICTS, VERIFICATION_STATUSES } from "@server/services/constants";

export default function LinksPage() {
  const { data, error, loading, reload } = useApi("/links");
  const [sp, setSp] = useSearchParams();
  const [f, setF] = useState({ q: "", client: "", verdict: "", stage: "", ver: "", donor: "", due: false });
  const [edit, setEdit] = useState<any | null>(null); const [delTarget, setDel] = useState<any | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null); const [rowErr, setRowErr] = useState<string | null>(null);
  const [imp, setImp] = useState<{ created: number; errors: any[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));
  const dirty = JSON.stringify(f) !== JSON.stringify({ q: "", client: "", verdict: "", stage: "", ver: "", donor: "", due: false });

  const rows: any[] = data?.rows ?? [];
  const clients = useMemo(() => [...new Map(rows.map((l) => [l.clientId, l.client?.name])).entries()].map(([value, label]) => ({ value, label })), [rows]);
  const donors = useMemo(() => [...new Map(rows.map((l) => [l.donorId, `${l.donor?.domain} (DR ${l.donor?.dr})`])).entries()].map(([value, label]) => ({ value, label })), [rows]);
  const filtered = rows.filter((l) => {
    const q = f.q.toLowerCase();
    return (!q || [l.sourceUrl, l.targetUrl, l.anchorText, l.client?.name, l.donor?.domain].join(" ").toLowerCase().includes(q)) &&
      (!f.client || String(l.clientId) === f.client) && (!f.verdict || l.verdict === f.verdict) && (!f.stage || l.stage === f.stage) &&
      (!f.ver || l.verificationStatus === f.ver) && (!f.donor || String(l.donorId) === f.donor) && (!f.due || (l.nextCheckAt && new Date(l.nextCheckAt) <= new Date() && l.stage !== "Lost"));
  });
  const pg = usePaged(filtered, [f]);
  const t = data?.totals;

  async function verify(id: number) { setBusyId(id); setRowErr(null); try { await post(`/links/${id}/verify`); reload(); } catch (e: any) { setRowErr(e.message); } finally { setBusyId(null); } }
  async function exportLog() {
    try { const r = await fetch("/api/links/export", { headers: authHeaders() }); if (!r.ok) throw new Error(`Export failed (${r.status})`); downloadText("backlink-review-log.csv", await r.text()); }
    catch (e: any) { setRowErr(e.message); }
  }
  async function onFile(file?: File) {
    if (!file) return;
    try { setImp(await post("/links/import", { csv: await file.text() })); reload(); } catch (e: any) { setRowErr(e.message); }
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <>
      <PageHeader title="Links" description="Every backlink reviewed against Stage 1, checks A–C and the reject list." actions={<>
        <input ref={fileRef} type="file" accept=".csv" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" />Import CSV</Button>
        <Button variant="outline" onClick={exportLog}><Download className="h-4 w-4" />Export review log</Button>
        <RefreshButton onClick={reload} loading={loading} />
      </>} />
      {(error || rowErr) && <div className="mb-4"><ErrorBanner message={(error || rowErr)!} onRetry={reload} /></div>}
      <KpiRow cols={6}>
        <Kpi label="Total" value={t?.total} loading={loading} tone="blue" onClick={() => setF({ ...f, verdict: "", due: false })} active={!f.verdict && !f.due} />
        <Kpi label="Relevant" value={t?.relevant} loading={loading} tone="blue" onClick={() => setF({ ...f, verdict: "Relevant", due: false })} active={f.verdict === "Relevant"} />
        <Kpi label="Partly relevant" value={t?.partly} loading={loading} tone="amber" sub="14-day fix window" onClick={() => setF({ ...f, verdict: "Partly relevant", due: false })} active={f.verdict === "Partly relevant"} />
        <Kpi label="Not relevant" value={t?.notRelevant} loading={loading} tone="red" sub="Replace or drop" onClick={() => setF({ ...f, verdict: "Not relevant", due: false })} active={f.verdict === "Not relevant"} />
        <Kpi label="Not judged" value={t?.notJudged} loading={loading} tone="blue" sub="Not live yet, or no donor numbers" onClick={() => setF({ ...f, verdict: "Not judged", due: false })} active={f.verdict === "Not judged"} />
        <Kpi label="Due rechecks" value={t?.dueRechecks} loading={loading} tone="red" onClick={() => setF({ ...f, verdict: "", due: true })} active={f.due} />
      </KpiRow>
      <Panel>
        <FilterBar dirty={dirty} onClear={() => setF({ q: "", client: "", verdict: "", stage: "", ver: "", donor: "", due: false })}>
          <Input className="w-56" placeholder="Search links…" value={f.q} onChange={(e) => set("q", e.target.value)} />
          <Select className="w-40" value={f.client} onChange={(v) => set("client", v)} placeholder="All clients" options={clients} />
          <Select className="w-40" value={f.verdict} onChange={(v) => set("verdict", v)} placeholder="All verdicts" options={VERDICTS.map((v) => ({ value: v, label: v }))} />
          <Select className="w-36" value={f.stage} onChange={(v) => set("stage", v)} placeholder="All stages" options={STAGES.map((v) => ({ value: v, label: v }))} />
          <Select className="w-40" value={f.ver} onChange={(v) => set("ver", v)} placeholder="All verification" options={VERIFICATION_STATUSES.map((v) => ({ value: v, label: v }))} />
          <Select className="w-52" value={f.donor} onChange={(v) => set("donor", v)} placeholder="All donors" options={donors} />
          <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={f.due} onChange={(e) => set("due", e.target.checked)} />Due only</label>
        </FilterBar>
        {loading && !data ? <TableSkeleton /> : !filtered.length ? <EmptyState title="No links match" hint={rows.length ? "Try clearing the filters." : "Add your first backlink to start verifying."} /> : (
          <Table>
            <THead cols={["Client", "Target page", "Donor", "Anchor", "Verdict", "Status", "Check", "Last checked", ""]} />
            <tbody>
              {pg.slice.map((l) => (
                <tr key={l.id}>
                  <td><div className="font-medium">{l.client?.name}</div><Sub>{l.client?.cluster}</Sub></td>
                  <td className="max-w-56"><div className="truncate">{l.targetPage?.keyword ?? "—"}</div><Sub><span className="block truncate">{l.targetUrl}</span></Sub></td>
                  <td><div>{l.donor?.domain}</div><Sub>{l.donor && !l.donor.ahrefsSyncedAt && !l.donor.dr && !l.donor.organicTraffic ? "Traffic not checked yet" : `DR ${l.donor?.dr} · ${l.donor?.usTrafficPct}% US · ${(l.donor?.organicTraffic ?? 0).toLocaleString("en-US")} visits · ${l.donor?.referringDomains} RDs`}</Sub></td>
                  <td><div>{l.anchorText || "—"}</div><Sub>{l.anchorType}</Sub></td>
                  <td>{l.action === "REJECTED" ? <><VerdictBadge v="Not relevant" /><Sub>Rejected by hand</Sub></> : PRE_LIVE.includes(l.action) ? <><span className="text-zinc-400">—</span><Sub>Judged once the link is live</Sub></> : <VerdictBadge v={l.verdict} />}{!!l.rejectReasons?.length && <div title={l.rejectReasons.map(ruleLabel).join("\n")} className="mt-1 max-w-[16rem] space-y-0.5"><Sub>{ruleLabel(l.rejectReasons[0])}</Sub>{l.rejectReasons.length > 1 && <Sub>+{l.rejectReasons.length - 1} more</Sub>}</div>}</td>
                  <td><div className="flex flex-col items-start gap-1"><StatusSelect link={l} onChanged={reload} /><StageBadge v={l.stage} /></div></td>
                  <td><VerifBadge v={l.verificationStatus} />{PRE_LIVE.includes(l.action) && l.lastCheckedAt && <div className="mt-1 max-w-[14rem] text-xs text-zinc-500">Checked: the link isn't on the page yet</div>}{l.lastError && <div className="mt-1 max-w-[14rem] text-xs text-red-700" title="We couldn't read the page, so the verdict was left unchanged.">{l.lastError}</div>}<div><DueText due={l.due} /> {l.nextCheckKind && <Sub>{l.nextCheckKind}</Sub>}</div></td>
                  <td className="whitespace-nowrap text-zinc-600">{fmtDate(l.lastCheckedAt)}</td>
                  <td><div className="flex items-center gap-1">
                    <Button size="sm" variant="outline" disabled={busyId === l.id} onClick={() => verify(l.id)}>{busyId === l.id ? "Checking…" : "Verify now"}</Button>
                    <RowMenu items={[{ label: "Edit link", onSelect: () => setEdit(l) }, { label: "Open source", onSelect: () => window.open(l.sourceUrl, "_blank") }, { label: "Delete", danger: true, onSelect: () => setDel(l) }]} />
                  </div></td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pager p={pg} />
      </Panel>
      <LinkDialog open={sp.get("new") === "1" || !!edit} link={edit} onOpenChange={(o) => { if (!o) { setEdit(null); if (sp.get("new")) { sp.delete("new"); setSp(sp, { replace: true }); } } }} onSaved={reload} />
      <ConfirmDialog open={!!delTarget} onOpenChange={(o) => !o && setDel(null)} title="Delete this link?" description={delTarget?.sourceUrl} onConfirm={async () => { await del(`/links/${delTarget.id}`); reload(); }} />
      <Dialog open={!!imp} onOpenChange={(o) => !o && setImp(null)} title="Import finished" description={`${imp?.created ?? 0} link(s) created, ${imp?.errors.length ?? 0} row(s) skipped.`}>
        <ul className="max-h-48 space-y-1 overflow-y-auto text-sm text-red-700">{imp?.errors.map((e) => <li key={e.row}>Row {e.row}: {e.error}</li>)}</ul>
        <p className="mt-3 text-xs text-zinc-500">Expected columns: client, sourceUrl, targetUrl, anchorText, anchorType, placement, reviewer, placedAt</p>
        <div className="mt-3 flex justify-end"><Button onClick={() => setImp(null)}>Done</Button></div>
      </Dialog>
    </>
  );
}
void ext;
