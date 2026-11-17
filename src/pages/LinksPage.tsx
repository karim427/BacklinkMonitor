import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronDown, Download, Upload } from "lucide-react";
import { Button, EmptyState, ErrorBanner, Input, Select } from "@/components/ui/primitives";
import { ConfirmDialog, Dialog, RowMenu } from "@/components/ui/overlays";
import { authHeaders, del, post, useApi } from "@/lib/api";
import { cn, fmtDate, monthLabel, ruleLabel } from "@/lib/utils";
import { PageHeader, Panel, FilterBar, Kpi, KpiRow, RefreshButton, ActionBadge, Sub, Table, TableSkeleton, THead, VerdictBadge, VerifBadge, DueText, ext } from "@/features/shared/common";
import { LinkDialog } from "@/features/links/LinkDialog";
import { ExportDialog } from "@/features/links/ExportDialog";
import { StatusSelect } from "@/features/links/StatusSelect";
import { PRE_LIVE, VERDICTS, VERIFICATION_STATUSES } from "@server/services/constants";
import { InfoTip } from "@/components/InfoTip";

export default function LinksPage() {
  const { data, error, loading, reload } = useApi("/links");
  const [sp, setSp] = useSearchParams();
  const blank = { q: "", client: "", verdict: "", ver: "", donor: "", month: "", due: false };
  const [f, setF] = useState({ ...blank, client: sp.get("client") ?? "", month: sp.get("month") ?? "" });
  // Months are dropdowns: the newest (or the one picked in the Month filter) starts open.
  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>({});
  const [exporting, setExporting] = useState(false);
  const [edit, setEdit] = useState<any | null>(null); const [delTarget, setDel] = useState<any | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null); const [rowErr, setRowErr] = useState<string | null>(null);
  const [imp, setImp] = useState<{ created: number; errors: any[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));
  const dirty = JSON.stringify(f) !== JSON.stringify(blank);

  const rows: any[] = data?.rows ?? [];
  const clients = useMemo(() => [...new Map(rows.map((l) => [l.clientId, l.client?.name])).entries()].map(([value, label]) => ({ value, label })), [rows]);
  const donors = useMemo(() => [...new Map(rows.map((l) => [l.donorId, `${l.donor?.domain} (DR ${l.donor?.dr})`])).entries()].map(([value, label]) => ({ value, label })), [rows]);
  const filtered = rows.filter((l) => {
    const q = f.q.toLowerCase();
    return (!q || [l.sourceUrl, l.targetUrl, l.anchorText, l.client?.name, l.donor?.domain].join(" ").toLowerCase().includes(q)) &&
      (!f.client || String(l.clientId) === f.client) && (!f.month || l.month === f.month) && (!f.verdict || l.verdict === f.verdict) &&
      (!f.ver || l.verificationStatus === f.ver) && (!f.donor || String(l.donorId) === f.donor) && (!f.due || (l.nextCheckAt && new Date(l.nextCheckAt) <= new Date() && l.stage !== "Lost"));
  });
  const months = useMemo(() => [...new Set<string>(rows.map((l) => l.month))].sort().reverse(), [rows]);
  const groups = [...new Set<string>(filtered.map((l) => l.month))].sort().reverse();
  const isOpen = (g: string) => openMonths[g] ?? (f.month ? g === f.month : g === groups[0]);
  const t = data?.totals;

  async function verify(id: number) { setBusyId(id); setRowErr(null); try { await post(`/links/${id}/verify`); reload(); } catch (e: any) { setRowErr(e.message); } finally { setBusyId(null); } }
  async function onFile(file?: File) {
    if (!file) return;
    try { setImp(await post("/links/import", { csv: await file.text() })); reload(); } catch (e: any) { setRowErr(e.message); }
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <>
      <PageHeader title="Links" description="All your links, grouped by month. Add, import, check, edit and export them here." actions={<>
        <input ref={fileRef} type="file" accept=".csv" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" />Import CSV</Button>
        <Button variant="outline" onClick={() => setExporting(true)}><Download className="h-4 w-4" />Export…</Button>
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
        <FilterBar dirty={dirty} onClear={() => { setF(blank); setOpenMonths({}); }}>
          <Input className="w-56" placeholder="Search links…" value={f.q} onChange={(e) => set("q", e.target.value)} />
          <Select className="w-40" value={f.client} onChange={(v) => set("client", v)} placeholder="All clients" options={clients} />
          <Select className="w-44" value={f.month} onChange={(v) => set("month", v)} placeholder="All months" options={months.map((m) => ({ value: m, label: monthLabel(m) }))} />
          <Select className="w-40" value={f.verdict} onChange={(v) => set("verdict", v)} placeholder="All verdicts" options={VERDICTS.map((v) => ({ value: v, label: v }))} />
          <Select className="w-40" value={f.ver} onChange={(v) => set("ver", v)} placeholder="All verification" options={VERIFICATION_STATUSES.map((v) => ({ value: v, label: v }))} />
          <Select className="w-52" value={f.donor} onChange={(v) => set("donor", v)} placeholder="All donors" options={donors} />
          <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={f.due} onChange={(e) => set("due", e.target.checked)} />Due only</label>
        </FilterBar>
        {loading && !data ? <TableSkeleton /> : !filtered.length ? <EmptyState title="No links match" hint={rows.length ? "Try clearing the filters." : "Add your first backlink to start verifying."} /> : (
          groups.map((g) => {
            const ls = filtered.filter((l) => l.month === g);
            return (
              <div key={g} className="border-t border-zinc-200 first:border-0">
                <button type="button" aria-expanded={isOpen(g)} onClick={() => setOpenMonths({ ...openMonths, [g]: !isOpen(g) })} className="flex w-full items-center gap-2 bg-zinc-50 px-4 py-3 text-left text-sm font-medium hover:bg-zinc-100">
                  <ChevronDown className={cn("h-4 w-4 shrink-0 text-zinc-500 transition-transform", !isOpen(g) && "-rotate-90")} />{monthLabel(g)}
                  <span className="ml-1 font-normal text-zinc-500">{ls.length} link{ls.length === 1 ? "" : "s"} · {ls.filter((l) => l.action === "LIVE").length} live · {ls.filter((l) => l.action === "PENDING" || l.action === "IN_PROCESS").length} not live yet</span>
                </button>
                {isOpen(g) && (
                  <Table>
                    <THead cols={["Client", "Target page", "Donor", "Anchor",
                      <>Verdict<InfoTip text="Is the link any good? Relevant counts toward the target. Judged only once the link is live." to="/guide#verdict" /></>,
                      <>Status<InfoTip text="Where the link is: Pending, In process, Live, Replace, Lost or Rejected. Click it to change." to="/guide#status" /></>,
                      <>Check<InfoTip text="Verified only means the page was opened and read. It does not mean your link was found." to="/guide#checks" /></>,
                      "Last checked", ""]} />
                    <tbody>
              {ls.map((l) => (
                <tr key={l.id}>
                  <td><div className="font-medium">{l.client?.name}</div><Sub>{l.client?.cluster}</Sub></td>
                  <td className="max-w-56"><div className="truncate">{l.targetPage?.keyword ?? "—"}</div><Sub><span className="block truncate">{l.targetUrl}</span></Sub></td>
                  <td><div>{l.donor?.domain}</div><Sub>{l.donor && !l.donor.ahrefsSyncedAt && !l.donor.dr && !l.donor.organicTraffic ? "Traffic not checked yet" : `DR ${l.donor?.dr} · ${l.donor?.usTrafficPct}% US · ${(l.donor?.organicTraffic ?? 0).toLocaleString("en-US")} visits · ${l.donor?.referringDomains} RDs`}</Sub></td>
                  <td><div>{l.anchorText || "—"}</div><Sub>{l.anchorType}</Sub></td>
                  <td>{l.action === "REJECTED" ? <><VerdictBadge v="Not relevant" /><Sub>Rejected by hand</Sub></>
                    : PRE_LIVE.includes(l.action) ? <><span className="text-zinc-400">—</span><Sub>Judged once live</Sub></>
                    : l.verdict === "Not judged" ? <span className="inline-flex items-center"><span className="inline-flex items-center rounded-md border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">Needs donor numbers</span><InfoTip text="This site has no DR or traffic numbers yet. Add them on the Donors page (Edit) or use Look up, then click Verify now." to="/guide#verdict" /></span>
                    : <VerdictBadge v={l.verdict} />}
                    {l.verdict !== "Not judged" && !PRE_LIVE.includes(l.action) && !!l.rejectReasons?.length && <div title={l.rejectReasons.map(ruleLabel).join("\n")} className="mt-1 max-w-[14rem] space-y-0.5"><Sub><span className="line-clamp-2">{ruleLabel(l.rejectReasons[0])}</span></Sub>{l.rejectReasons.length > 1 && <Sub>+{l.rejectReasons.length - 1} more</Sub>}</div>}</td>
                  <td><div className="flex flex-col items-start gap-1"><StatusSelect link={l} onChanged={reload} />{l.stage === "Confirmed" && <span title="Passed the 30-day recheck" className="rounded-md border border-green-200 bg-green-50 px-2 py-0.5 text-xs text-green-700">✓ Confirmed</span>}</div></td>
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
              </div>
            );
          })
        )}
      </Panel>
      <ExportDialog open={exporting} onOpenChange={setExporting} links={rows} defaultClient={f.client} defaultMonth={f.month} />
      <LinkDialog open={sp.get("new") === "1" || !!edit} link={edit} onOpenChange={(o) => { if (!o) { setEdit(null); if (sp.get("new")) { sp.delete("new"); setSp(sp, { replace: true }); } } }} onSaved={reload} />
      <ConfirmDialog open={!!delTarget} onOpenChange={(o) => !o && setDel(null)} title="Delete this link?" description={delTarget?.sourceUrl} onConfirm={async () => { await del(`/links/${delTarget.id}`); reload(); }} />
      <Dialog open={!!imp} onOpenChange={(o) => !o && setImp(null)} title="Import finished" description={`${imp?.created ?? 0} link(s) created, ${imp?.errors.length ?? 0} row(s) skipped.`}>
        <ul className="max-h-48 space-y-1 overflow-y-auto text-sm text-red-700">{imp?.errors.map((e) => <li key={e.row}>Row {e.row}: {e.error}</li>)}</ul>
        <p className="mt-3 text-xs text-zinc-500">Columns it understands: Client, Link from, Link to, Anchor text, Anchor type, Placement, Name, Placed date, Status (Pending, In process, Live or Rejected). Column names can be written loosely, and a file exported from this app can be imported again. Imported links stay "Not judged yet" until you verify them.</p>
        <div className="mt-3 flex justify-end"><Button onClick={() => setImp(null)}>Done</Button></div>
      </Dialog>
    </>
  );
}
void ext;
