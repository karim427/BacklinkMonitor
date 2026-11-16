import { useState } from "react";
import { Badge, Button, EmptyState, ErrorBanner } from "@/components/ui/primitives";
import { post, useApi } from "@/lib/api";
import { fmtDate } from "@/lib/utils";
import { DueText, PageHeader, Panel, RefreshButton, StageBadge, Sub, Table, TableSkeleton, THead, VerdictBadge, Pager, usePaged } from "@/features/shared/common";
import { cn } from "@/lib/utils";

const TABS = ["due", "overdue", "d30", "d90", "all"] as const;
const LABEL: Record<string, string> = { due: "Due", overdue: "Overdue", d30: "30-day", d90: "90-day", all: "All" };

export default function RechecksPage() {
  const { data, error, loading, reload } = useApi("/rechecks");
  const [tab, setTab] = useState<(typeof TABS)[number]>("due"); const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState<number | "all" | null>(null); const [err, setErr] = useState<string | null>(null);
  const rows: any[] = (data?.rows ?? []).filter((l: any) => {
    const due = l.due.days !== null && l.due.days <= 0;
    return (tab === "all" || (tab === "due" && due) || (tab === "overdue" && l.due.overdue) || (tab === "d30" && l.nextCheckKind === "30-day") || (tab === "d90" && l.nextCheckKind === "90-day")) && (!domain || l.donor?.domain === domain);
  });
  const pg = usePaged(rows, [tab, domain]);
  async function run(id?: number) { setBusy(id ?? "all"); setErr(null); try { id ? await post(`/links/${id}/verify`) : await post("/rechecks/run-due"); reload(); } catch (e: any) { setErr(e.message); } finally { setBusy(null); } }
  return (
    <>
      <PageHeader title="Rechecks" description="First recheck 30 days after placement, then every 90 days." actions={<><RefreshButton onClick={reload} loading={loading} /><Button disabled={busy === "all"} onClick={() => run()}>{busy === "all" ? "Running…" : "Run all due"}</Button></>} />
      {(error || err) && <div className="mb-4"><ErrorBanner message={(error || err)!} onRetry={reload} /></div>}
      {!!data?.domains.length && (
        <div className="mb-4 flex flex-wrap items-center gap-2"><span className="text-sm text-zinc-500">Domains to recheck:</span>
          {data.domains.map((d: any) => <button key={d.domain} onClick={() => setDomain(domain === d.domain ? "" : d.domain)} className={cn("rounded-full border px-3 py-1 text-xs", domain === d.domain ? "border-black bg-black text-white" : "border-zinc-200 hover:bg-zinc-50")}>{d.domain} · {d.count}</button>)}
        </div>
      )}
      <Panel>
        <div className="flex gap-1 border-b border-zinc-200 px-3 pt-2">
          {TABS.map((t) => <button key={t} onClick={() => setTab(t)} className={cn("-mb-px border-b-2 px-3 py-2 text-sm", tab === t ? "border-black font-medium" : "border-transparent text-zinc-500")}>{LABEL[t]} <Badge className="ml-1">{data?.counts[t] ?? 0}</Badge></button>)}
        </div>
        {loading && !data ? <TableSkeleton /> : !rows.length ? <EmptyState title="Nothing in this queue" /> : (
          <Table>
            <THead cols={["Client", "Donor", "Target URL", "Anchor", "Verdict", "Stage", "Placed", "Due kind", "Due", "Last checked", ""]} />
            <tbody>
              {pg.slice.map((l) => (
                <tr key={l.id}>
                  <td className="font-medium">{l.client?.name}</td><td>{l.donor?.domain}</td>
                  <td className="max-w-48"><span className="block truncate text-xs">{l.targetUrl}</span></td><td>{l.anchorText}</td>
                  <td><VerdictBadge v={l.verdict} /></td><td><StageBadge v={l.stage} /></td><td className="whitespace-nowrap">{fmtDate(l.placedAt)}</td>
                  <td><Badge>{l.nextCheckKind}</Badge></td>
                  <td><div className="whitespace-nowrap">{fmtDate(l.nextCheckAt)}</div><DueText due={l.due} /></td>
                  <td className="whitespace-nowrap">{fmtDate(l.lastCheckedAt)}</td>
                  <td><div className="flex gap-1"><Button size="sm" variant="outline" disabled={busy === l.id} onClick={() => run(l.id)}>{busy === l.id ? "…" : "Run check"}</Button>
                    <Button size="sm" variant="ghost" asChild><a href={l.sourceUrl} target="_blank" rel="noreferrer">Open</a></Button></div></td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pager p={pg} />
      </Panel>
    </>
  );
}
void Sub;
