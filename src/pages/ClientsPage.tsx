import { AdminOnly } from "@/lib/auth";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Badge, Button, EmptyState, ErrorBanner, Input } from "@/components/ui/primitives";
import { useApi } from "@/lib/api";
import { currentMonth } from "@/lib/utils";
import { FilterBar, Kpi, KpiRow, MonthPicker, PageHeader, Panel, RefreshButton, Sub, Table, TableSkeleton, THead } from "@/features/shared/common";
import { ClientDialog } from "@/features/clients/ClientDialog";

export default function ClientsPage() {
  const [sp, setSp] = useSearchParams();
  const month = /^\d{4}-\d{2}$/.test(sp.get("month") ?? "") ? sp.get("month")! : currentMonth();
  const missing = sp.get("missing") === "1";
  const setMonth = (m: string) => { sp.set("month", m); setSp(sp, { replace: true }); };
  const setMissing = (v: boolean) => { v ? sp.set("missing", "1") : sp.delete("missing"); setSp(sp, { replace: true }); };
  const { data, error, loading, reload } = useApi(`/clients?month=${month}`);
  const [q, setQ] = useState(""); const [adding, setAdding] = useState(false);
  const nav = useNavigate();
  const rows = (data?.rows ?? []).filter((r: any) => `${r.name} ${r.domain} ${r.cluster}`.toLowerCase().includes(q.toLowerCase()) && (!missing || r.remaining > 0))
    .sort((a: any, b: any) => (missing ? b.remaining - a.remaining : 0));
  const t = data?.totals;
  return (
    <>
      <PageHeader title="Clients" description="Target backlinks vs. relevant links received, per client and month." actions={<>
        <MonthPicker month={month} onChange={setMonth} /><RefreshButton onClick={reload} loading={loading} />
        <AdminOnly><Button variant="outline" onClick={() => setAdding(true)}>Add website</Button></AdminOnly>
      </>} />
      {error && <div className="mb-4"><ErrorBanner message={error} onRetry={reload} /></div>}
      <KpiRow cols={5}>
        <Kpi label="Clients" value={t?.clients} loading={loading} /><Kpi label="Target pages" value={t?.targetPages} loading={loading} />
        <Kpi label="Target backlinks" value={t?.target} loading={loading} /><Kpi label="Received" value={t?.received} loading={loading} tone="green" />
        <Kpi label="Remaining" value={t?.remaining} loading={loading} tone="amber" />
      </KpiRow>
      <Panel>
        <FilterBar dirty={!!q || missing} onClear={() => { setQ(""); setMissing(false); }}><Input className="w-64" placeholder="Search clients…" value={q} onChange={(e) => setQ(e.target.value)} />
          <Button variant={missing ? "default" : "outline"} onClick={() => setMissing(!missing)}>{missing ? "Showing clients missing links" : "Only clients missing links"}</Button></FilterBar>
        {loading && !data ? <TableSkeleton /> : !rows.length ? <EmptyState title={missing ? "Every client has hit this month's target" : "No clients found"} /> : (
          <Table>
            <THead cols={["Client", "Cluster", "Target pages", "Target backlinks", "Received", "Remaining"]} />
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.id} className="cursor-pointer" onClick={() => nav(missing ? `/clients/${r.id}/${month}` : `/clients/${r.id}`)}>
                  <td><div className="font-medium">{r.name}</div><Sub>{r.domain}</Sub></td>
                  <td><Badge>{r.cluster}</Badge></td>
                  <td>{r.targetPages}</td><td>{r.target}</td>
                  <td className="font-medium text-blue-600">{r.received}</td>
                  <td>{r.remaining > 0 ? <span className="text-amber-700">{r.remaining} remaining</span> : <Badge tone="green">At target</Badge>}</td>
                </tr>
              ))}
              <tr className="bg-zinc-50 font-medium"><td>Total</td><td /><td>{t?.targetPages}</td><td>{t?.target}</td><td className="text-blue-600">{t?.received}</td><td>{t?.remaining} remaining</td></tr>
            </tbody>
          </Table>
        )}
      </Panel>
      <ClientDialog open={adding} onOpenChange={setAdding} onSaved={reload} />
    </>
  );
}
