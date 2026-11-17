import { AdminOnly } from "@/lib/auth";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Badge, Button, Card, EmptyState, ErrorBanner, Field, Input } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/overlays";
import { put, useApi } from "@/lib/api";
import { fmtDate, monthLabel } from "@/lib/utils";
import { ActionBadge, Kpi, KpiRow, PageHeader, Panel, Sub, Table, THead, TableSkeleton, VerdictBadge } from "@/features/shared/common";

export default function ClientTrackingPage() {
  const { id, month: drill } = useParams();
  const { data, error, loading, reload } = useApi(`/clients/${id}`);
  const nav = useNavigate();
  const [edit, setEdit] = useState<{ month: string; target: number } | null>(null); const [err, setErr] = useState<string | null>(null);
  if (error) return <ErrorBanner message={error} onRetry={reload} />;
  if (loading && !data) return <TableSkeleton rows={8} />;
  const { client: c, months, links, cards } = data;
  const monthsShown = drill ? months.filter((m: any) => m.month === drill) : months;
  const groups = [...new Set<string>(links.map((l: any) => l.month))].sort().reverse().filter((m) => !drill || m === drill);

  async function save(reset = false) {
    try { await put(`/clients/${id}/months/${edit!.month}`, { target: reset ? null : Number(edit!.target) }); setEdit(null); reload(); } catch (e: any) { setErr(e.message); }
  }
  return (
    <>
      <PageHeader title={drill ? `${c.name} · ${monthLabel(drill)}` : c.name} description={`${c.domain} · ${c.cluster}${c.city ? ` · ${c.city}, ${c.state}` : ""} · Default target ${c.defaultMonthlyTarget} / month`}
        actions={<><AdminOnly><Button variant="outline" onClick={() => setEdit({ month: months[0].month, target: c.defaultMonthlyTarget })}>Add month target</Button></AdminOnly>
          <Button variant="outline" asChild><Link to={`/links?client=${id}`}>View links</Link></Button>
          {drill && <Button variant="ghost" onClick={() => nav(`/clients/${id}`)}>← All months</Button>}</>} />
      {err && <div className="mb-4"><ErrorBanner message={err} /></div>}
      <KpiRow cols={5}>
        <Kpi label="This month" value={`${cards.thisMonth?.received} / ${cards.thisMonth?.target}`} />
        <Kpi label="Last month" value={`${cards.lastMonth?.received ?? 0} / ${cards.lastMonth?.target ?? 0}`} />
        <Kpi label="All-time received" value={cards.allTime} tone="green" />
        <Kpi label="Target pages" value={cards.targetPages} /><Kpi label="Active months" value={cards.activeMonths} />
      </KpiRow>
      <Panel className="mb-6">
        <Table>
          <THead cols={["Month", "Status", "Target", "Received", "Remaining", ""]} />
          <tbody>
            {monthsShown.map((m: any) => (
              <tr key={m.month}>
                <td><Link className="font-medium hover:underline" to={`/clients/${id}/${m.month}`}>{monthLabel(m.month)}</Link></td>
                <td>{m.status !== "Past" && <Badge tone={m.status === "Current" ? "blue" : "neutral"}>{m.status}</Badge>}</td>
                <td>{m.target} {m.overridden && <Sub>override</Sub>}</td><td className="text-blue-600">{m.received}</td><td>{m.remaining}</td>
                <td><AdminOnly><Button size="sm" variant="ghost" onClick={() => setEdit({ month: m.month, target: m.target })}>Edit</Button></AdminOnly></td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Panel>
      <h2 className="mb-2 text-sm font-semibold">Link sheet</h2>
      {!groups.length ? <Card><EmptyState title="No links yet" /></Card> : groups.map((g) => {
        const ls = links.filter((l: any) => l.month === g);
        return (
          <Panel key={g} className="mb-4">
            <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-medium">{monthLabel(g)} <span className="ml-2 font-normal text-zinc-500">{ls.length} links · {ls.filter((l: any) => l.action === "LIVE").length} live · {ls.filter((l: any) => l.action === "REPLACE").length} to replace</span></div>
            <Table><THead cols={["Link from", "Anchor", "Link to", "DR", "Action", "Verdict", "Placed"]} />
              <tbody>{ls.map((l: any) => (
                <tr key={l.id}><td className="max-w-56"><span className="block truncate">{l.sourceUrl}</span></td><td>{l.anchorText}</td>
                  <td className="max-w-56"><Sub>{l.targetPage?.keyword}</Sub><span className="block truncate">{l.targetUrl}</span></td><td>{l.donor?.dr}</td>
                  <td><ActionBadge v={l.action} /></td><td><VerdictBadge v={l.verdict} /></td><td>{fmtDate(l.placedAt)}</td></tr>
              ))}</tbody></Table>
          </Panel>
        );
      })}
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)} title="Month target" description="Overrides the client default for one month.">
        {edit && <div className="space-y-3">
          <Field label="Month"><Input type="month" value={edit.month} onChange={(e) => setEdit({ ...edit, month: e.target.value })} /></Field>
          <Field label="Target"><Input type="number" min={0} value={edit.target} onChange={(e) => setEdit({ ...edit, target: Number(e.target.value) })} /></Field>
          <div className="flex justify-between"><Button variant="ghost" onClick={() => save(true)}>Reset to default</Button><Button onClick={() => save()}>Save</Button></div>
        </div>}
      </Dialog>
    </>
  );
}
