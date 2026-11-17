import { Fragment, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge, EmptyState, ErrorBanner } from "@/components/ui/primitives";
import { useApi } from "@/lib/api";
import { fmtDate, ruleLabel } from "@/lib/utils";
import { Kpi, KpiRow, Panel, Sub, Table, TableSkeleton, THead, VerdictBadge } from "@/features/shared/common";

const Num = ({ n, tone }: { n: number; tone?: "red" | "green" | "amber" }) =>
  <span className={n === 0 ? "text-zinc-400" : tone === "red" ? "font-medium text-red-600" : tone === "green" ? "font-medium text-green-700" : tone === "amber" ? "font-medium text-amber-700" : "font-medium"}>{n}</span>;

/** Month view of rechecks, grouped by client: what got indexed, what looked like spam, and what we lost. */
export function ClientChecks({ month, onChanged }: { month: string; onChanged?: number }) {
  const { data, error, loading, reload } = useApi(`/rechecks/summary?month=${month}&v=${onChanged ?? 0}`);
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const rows: any[] = data?.rows ?? []; const t = data?.totals;
  return (
    <>
      {error && <div className="mb-4"><ErrorBanner message={error} onRetry={reload} /></div>}
      <KpiRow cols={5}>
        <Kpi label="Links added" value={t?.added} loading={loading && !data} sub="placed this month" />
        <Kpi label="Indexed" value={t?.indexed} loading={loading && !data} tone="green" sub={t ? `${t.notIndexed} not indexed` : undefined} />
        <Kpi label="Spam links" value={t?.spam} loading={loading && !data} tone={t?.spam ? "red" : "blue"} sub="added this month" />
        <Kpi label="Lost links" value={t?.lost} loading={loading && !data} tone={t?.lost ? "red" : "blue"} sub="found missing this month" />
        <Kpi label="Due now" value={t?.due} loading={loading && !data} tone="amber" sub="waiting for a recheck" />
      </KpiRow>
      <Panel>
        {loading && !data ? <TableSkeleton /> : !rows.length ? <EmptyState title="No links or checks this month" hint="Pick another month, or add links with a placed date." /> : (
          <Table>
            <THead cols={["Client", "Added", "Checked", "Indexed", "Not indexed", "Spam", "Lost", "Due", ""]} />
            <tbody>
              {rows.map((r) => (
                <Fragment key={r.clientId}>
                  <tr className="cursor-pointer" onClick={() => setOpen({ ...open, [r.clientId]: !open[r.clientId] })}>
                    <td><div className="font-medium">{r.name}</div><Sub>{r.domain}</Sub></td>
                    <td><Num n={r.added} /></td><td><Num n={r.checked} /></td><td><Num n={r.indexed} tone="green" /></td>
                    <td><Num n={r.notIndexed} tone="amber" /></td><td><Num n={r.spam} tone="red" /></td><td><Num n={r.lost} tone="red" /></td><td><Num n={r.due} tone="amber" /></td>
                    <td><ChevronDown className={`h-4 w-4 text-zinc-500 transition-transform ${open[r.clientId] ? "" : "-rotate-90"}`} /></td>
                  </tr>
                  {open[r.clientId] && (
                    <tr><td colSpan={9} className="!p-0 bg-zinc-50/60">
                      <div className="overflow-x-auto px-4 py-3">
                        <table className="w-full text-sm [&_td]:px-3 [&_td]:py-2 [&_th]:px-3 [&_th]:py-1.5 [&_th]:text-left [&_th]:text-xs [&_th]:font-medium [&_th]:text-zinc-500">
                          <thead><tr><th>Link</th><th>Added by</th><th>Verdict</th><th>Indexed</th><th>Spam</th><th>Lost</th></tr></thead>
                          <tbody>{r.links.map((l: any) => (
                            <tr key={l.id} className="border-t border-zinc-200">
                              <td className="max-w-72"><a className="block truncate text-blue-600 hover:underline" href={l.sourceUrl} target="_blank" rel="noreferrer">{l.donor ?? l.sourceUrl}</a><Sub>{l.anchorText || "—"}</Sub></td>
                              <td>{l.addedBy ?? "—"}<Sub>{l.placedAt ? fmtDate(l.placedAt) : "not placed yet"}</Sub></td>
                              <td><VerdictBadge v={l.verdict} /></td>
                              <td>{l.indexed === true ? <Badge tone="green">Indexed</Badge> : l.indexed === false ? <Badge tone="amber">Not indexed</Badge> : <span className="text-zinc-400">Not checked</span>}</td>
                              <td>{l.spam.length ? <div className="space-y-0.5">{l.spam.map((c: string) => <div key={c} className="text-xs text-red-700">{ruleLabel(c)}</div>)}</div> : <span className="text-zinc-400">—</span>}</td>
                              <td>{l.lost ? <span className="text-red-600">Lost {fmtDate(l.lostAt)}</span> : <span className="text-zinc-400">—</span>}</td>
                            </tr>))}</tbody>
                        </table>
                      </div>
                    </td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}
