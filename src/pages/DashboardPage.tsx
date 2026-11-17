import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Badge, Button, Card, EmptyState, ErrorBanner, Progress, Skeleton } from "@/components/ui/primitives";
import { post, useApi } from "@/lib/api";
import { AdminOnly } from "@/lib/auth";
import { currentMonth, monthLabel } from "@/lib/utils";
import { InfoTip } from "@/components/InfoTip";
import { Kpi, KpiRow, MonthPicker, PageHeader, RefreshButton, VerdictBadge } from "@/features/shared/common";

export default function DashboardPage() {
  const [month, setMonth] = useState(currentMonth());
  const { data: d, error, loading, reload } = useApi(`/dashboard?month=${month}`);
  const nav = useNavigate();
  const [err, setErr] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const { data: lost, reload: reloadLost } = useApi("/lost-links?days=60");
  const [checking, setChecking] = useState(false); const [lostMsg, setLostMsg] = useState<string | null>(null);
  async function checkLost() {
    if (!window.confirm("This asks Ahrefs about each client that has links, one request per client. Each request uses API units (at least 50). Continue?")) return;
    setChecking(true); setLostMsg(null);
    try { const r = await post("/lost-links/refresh", {}); setLostMsg(`Asked Ahrefs about ${r.clients} client${r.clients === 1 ? "" : "s"} (${r.requests} request${r.requests === 1 ? "" : "s"}).`); reloadLost(); }
    catch (e: any) { setLostMsg(e.message); } finally { setChecking(false); }
  }
  const p = d?.progress;
  const pct = p && d.target ? Math.round((p.relevant / d.target) * 100) : 0;

  async function runDue() { setRunning(true); try { await post("/rechecks/run-due"); reload(); } catch (e: any) { setErr(e.message); } finally { setRunning(false); } }

  return (
    <>
      <PageHeader title="Dashboard" description="Monthly progress, anchor mix compliance and rechecks across every client." actions={<>
        <MonthPicker month={month} onChange={setMonth} /><RefreshButton onClick={reload} loading={loading} />
        <Button variant="outline" onClick={() => nav("/links")}>Open links</Button>
        <AdminOnly><Button onClick={runDue} disabled={running}>{running ? "Running…" : "Run due rechecks →"}</Button></AdminOnly>
      </>} />
      {(error || err) && <div className="mb-4"><ErrorBanner message={(error || err)!} onRetry={reload} /></div>}

      <Card className="mb-6 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2"><h2 className="text-sm font-semibold">Monthly target</h2>{d?.recurringDefault && <Badge>Recurring default</Badge>}</div>
          <AdminOnly><Button size="sm" variant="outline" asChild><Link to="/clients" title="Targets are set per client and month">Edit target</Link></Button></AdminOnly>
        </div>
        {loading && !d ? <Skeleton className="h-24 w-full" /> : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Link to={`/clients?month=${month}`} className="rounded-lg hover:bg-zinc-50" title="See each client's progress this month"><p className="text-xs text-zinc-500">Target<InfoTip text="How many relevant links you want this month across all clients. Click the number to see each client." to="/guide#dashboard" /></p><p className="text-2xl font-semibold">{d?.target}</p><p className="text-[11px] text-zinc-500">{p?.remaining} still needed</p></Link>
              <div title="Links planned but not placed yet"><p className="text-xs text-zinc-500">Pending<InfoTip text="Links you plan to get but have not placed yet." to="/guide#status" /></p><p className="text-2xl font-semibold text-zinc-600">{p?.pending}</p><p className="text-[11px] text-zinc-500">not placed yet</p></div>
              <div title="Links placed and waiting to appear on the page"><p className="text-xs text-zinc-500">In progress<InfoTip text="Links placed and waiting to appear on the page. They are checked daily until they show up." to="/guide#status" /></p><p className="text-2xl font-semibold text-amber-600">{p?.inProcess}</p><p className="text-[11px] text-zinc-500">waiting to go live</p></div>
              <div title="Links found on the page. Relevant ones passed every check and count toward the target."><p className="text-xs text-zinc-500">Live<InfoTip text="Links found on the page. Only the relevant ones (shown below) count toward the target." to="/guide#dashboard" /></p><p className="text-2xl font-semibold text-green-600">{p?.live} <span className="text-sm font-normal text-zinc-500">{pct}% of target</span></p><p className="text-[11px] text-zinc-500">{p?.relevant} relevant (count toward target)</p></div>
            </div>
            <Progress value={pct} className="mt-4" />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
              <span>{p?.relevant} / {d?.target} relevant · {pct}% · <Link to={`/clients?month=${month}`} className="underline decoration-dotted hover:text-zinc-800">{d?.clientsAtTarget} of {d?.clientCount} clients at target</Link></span>
              <span className="flex gap-1.5"><Badge>{d?.chips.unverified} Unverified</Badge><Badge tone="amber">{d?.chips.awaitingIndex} Awaiting index</Badge><Badge tone="amber">{d?.chips.partlyFixing} Partly fixing</Badge>{!!d?.chips.needsDonorNumbers && <Badge>{d.chips.needsDonorNumbers} Need donor numbers</Badge>}</span>
            </div>
          </>
        )}
      </Card>

      <KpiRow cols={3}>
        <Kpi label="Added this month" value={d?.added} loading={loading} tone="blue" />
        <Kpi label="Rejected this month" value={d?.rejected} loading={loading} tone="red" />
        <Kpi label="Overdue rechecks" value={d?.overdue.count} loading={loading} tone="red" sub={d ? `${d.overdue.count} due · ${d.overdue.next30} in the next 30 days` : undefined} />
      </KpiRow>

      <Card className="mb-6 p-5">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">Anchor mix compliance<InfoTip text="Keeps the clickable link text varied: not too many exact-keyword links. Out means that type is outside its target range." to="/guide#anchors" /></h2>
          <Badge tone={d?.anchorInBand === d?.anchorMix.length && d?.anchorMix.length ? "green" : "amber"}>{d?.anchorInBand ?? 0} / {d?.anchorMix.length ?? 0} in band</Badge></div>
        {!d?.anchorMix.length ? <EmptyState title="No anchor data yet" hint="Links assigned to a target page appear here (rolling 3 months)." /> : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {d.anchorMix.map((a: any) => (
              <div key={a.targetPageId} className="rounded-lg border border-zinc-200 p-4">
                <div className="mb-2 flex items-start justify-between gap-2"><div><p className="text-sm font-medium">{a.client}</p><p className="text-xs text-zinc-500">{a.keyword}</p></div>
                  <Badge tone={a.inBand ? "green" : "amber"}>{a.inBand ? "In band" : "Out"}</Badge></div>
                <div className="space-y-1.5">
                  {a.rows.map((r: any) => (
                    <div key={r.type} className="flex items-center justify-between text-xs">
                      <span className="w-16 text-zinc-600">{r.type}</span>
                      <span className="text-zinc-500">{r.band.min}–{r.band.max}%</span>
                      <span className="w-12 text-right font-medium">{r.pct}%</span>
                      <Badge tone={r.inBand ? "green" : "amber"} className="w-14 justify-center">{r.inBand ? "In band" : "Out"}</Badge>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-zinc-500">{a.linkCount} links · Rolling 3 months</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">Rechecks due</h2><Button size="sm" variant="outline" asChild><Link to="/rechecks">View queue</Link></Button></div>
          {!d?.rechecksDue.length ? <EmptyState title="Nothing due" hint="All rechecks are on schedule." /> : d.rechecksDue.map((l: any) => (
            <div key={l.id} className="flex items-center justify-between gap-2 border-t border-zinc-100 py-2.5 first:border-0 text-sm">
              <div className="min-w-0"><p className="truncate font-medium">{l.client?.name}</p><p className="truncate text-xs text-zinc-500">{l.donor?.domain}</p></div>
              <div className="flex items-center gap-2"><VerdictBadge v={l.verdict} /><span className="text-xs font-medium text-red-600">{l.due.label}</span><Badge>{l.nextCheckKind}</Badge></div>
            </div>
          ))}
        </Card>
        <Card className="p-5">
          <div className="mb-1 flex items-center justify-between gap-2"><h2 className="text-sm font-semibold">Lost links</h2>
            <div className="flex gap-2"><AdminOnly><Button size="sm" variant="outline" disabled={checking} onClick={checkLost}>{checking ? "Asking Ahrefs…" : "Check Ahrefs"}</Button></AdminOnly>
              <Button size="sm" variant="outline" asChild><Link to="/links?">View links</Link></Button></div></div>
          <p className="mb-2 text-xs text-zinc-500">Reported lost by Ahrefs in the last 60 days{lost?.fetchedAt ? ` · checked ${new Date(lost.fetchedAt).toLocaleDateString()}` : ""}</p>
          {lostMsg && <p className="mb-2 rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-700">{lostMsg}</p>}
          {!!lost?.errors?.length && <p className="mb-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{lost.errors.slice(0, 2).join(" · ")}</p>}
          {lost && !lost.hasKey ? <EmptyState title="Ahrefs isn't connected" hint="Add your Ahrefs API key in Settings to see links Ahrefs reports as lost." />
            : lost && !lost.fetchedAt ? <EmptyState title="Not checked yet" hint="Click “Check Ahrefs” to look up lost links for your clients." />
            : !lost?.rows.length ? <EmptyState title="No lost links" hint="Ahrefs hasn't reported any in this period." />
            : lost.rows.slice(0, 8).map((l: any) => (
              <div key={`${l.clientId}-${l.urlFrom}`} className="flex items-start justify-between gap-2 border-t border-zinc-100 py-2.5 first:border-0 text-sm">
                <div className="min-w-0"><p className="truncate font-medium">{l.client}</p>
                  <a className="block truncate text-xs text-blue-600 hover:underline" href={l.urlFrom} target="_blank" rel="noreferrer">{l.donor}</a>
                  <p className="text-xs text-zinc-500">{l.reasonLabel}{l.lostAt ? ` · ${new Date(l.lostAt).toLocaleDateString()}` : ""}</p></div>
                {l.ours ? <Badge tone="blue" title="This is a link you placed">Placed by us{l.ours.addedBy ? ` · ${l.ours.addedBy}` : ""}</Badge> : <Badge>Not tracked here</Badge>}
              </div>
            ))}
          {!!d?.lostLinks.filter((l: any) => l.stage === "Lost").length && (
            <div className="mt-3 border-t border-zinc-200 pt-3"><p className="mb-1 text-xs font-medium text-zinc-600">Found missing by our own checks</p>
              {d.lostLinks.filter((l: any) => l.stage === "Lost").map((l: any) => (
                <div key={l.id} className="flex items-center justify-between gap-2 py-1 text-sm"><span className="truncate">{l.client?.name} · <span className="text-xs text-zinc-500">{l.donor?.domain}</span></span><Badge tone="red">Lost</Badge></div>))}
            </div>)}
        </Card>
      </div>

    </>
  );
}
