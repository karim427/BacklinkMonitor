import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Button, EmptyState, ErrorBanner, Select } from "@/components/ui/primitives";
import { del, useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ConfirmDialog, RowMenu } from "@/components/ui/overlays";
import { LinkDialog } from "@/features/links/LinkDialog";
import { downloadText, monthLabel } from "@/lib/utils";
import { ActionBadge, FilterBar, PageHeader, Panel, RefreshButton, Sub, TableSkeleton } from "@/features/shared/common";

const COLS = ["A · Link from", "B · Anchor text", "C · Link to", "D · DR", "E · Action", "F · Name", "G · Client"];

export default function TargetLinksPage() {
  const { data, error, loading, reload } = useApi("/links");
  const { isAdmin } = useAuth();
  const [edit, setEdit] = useState<any | null>(null); const [delTarget, setDel] = useState<any | null>(null);
  const [client, setClient] = useState(""); const [month, setMonth] = useState("");
  const rows: any[] = data?.rows ?? [];
  const filtered = rows.filter((l) => (!client || String(l.clientId) === client) && (!month || l.month === month));
  const months = useMemo(() => { const m = new Map<string, number>(); rows.filter((l) => !client || String(l.clientId) === client).forEach((l) => m.set(l.month, (m.get(l.month) ?? 0) + 1)); return [...m].sort().reverse(); }, [rows, client]);
  const groups = [...new Set<string>(filtered.map((l) => l.month))].sort().reverse();
  const clients = [...new Map(rows.map((l) => [l.clientId, l.client?.name])).entries()].map(([value, label]) => ({ value, label }));
  const exportCsv = () => {
    const q = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    downloadText("target-links.csv", [["Month", "Link from", "Anchor", "Link to", "DR", "Action", "Name", "Client"].map(q).join(","), ...filtered.map((l) => [l.month, l.sourceUrl, l.anchorText, l.targetUrl, l.donor?.dr, l.action, l.reviewer, l.client?.name].map(q).join(","))].join("\n"));
  };
  return (
    <>
      <PageHeader title="Target links" description="The team's link sheet, grouped by month." actions={<><RefreshButton onClick={reload} loading={loading} /><Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4" />Export CSV</Button></>} />
      {error && <div className="mb-4"><ErrorBanner message={error} onRetry={reload} /></div>}
      <Panel className="mb-4"><FilterBar dirty={!!client || !!month} onClear={() => { setClient(""); setMonth(""); }}>
        <Select className="w-48" value={client} onChange={setClient} placeholder="All clients" options={clients} />
        <Select className="w-52" value={month} onChange={setMonth} placeholder="Jump to month" options={months.map(([m, n]) => ({ value: m, label: `${monthLabel(m)} (${n})` }))} />
      </FilterBar></Panel>
      {loading && !data ? <TableSkeleton /> : !groups.length ? <Panel><EmptyState title="No links" /></Panel> : groups.map((g) => {
        const ls = filtered.filter((l) => l.month === g);
        return (
          <Panel key={g} className="mb-4">
            <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-medium">{monthLabel(g)} <span className="ml-2 font-normal text-zinc-500">{ls.length} links · {ls.filter((l) => l.action === "LIVE").length} live · {ls.filter((l) => l.action === "REPLACE").length} to replace</span></div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm [&_td]:border [&_td]:border-zinc-100 [&_td]:px-3 [&_td]:py-2 [&_th]:border [&_th]:border-zinc-200 [&_th]:bg-zinc-50 [&_th]:px-3 [&_th]:py-1.5 [&_th]:text-left [&_th]:text-xs [&_th]:font-medium [&_th]:text-zinc-500">
                <thead><tr>{COLS.map((c) => <th key={c}>{c}</th>)}{isAdmin && <th className="w-10" />}</tr></thead>
                <tbody>{ls.map((l) => (
                  <tr key={l.id}><td className="max-w-60"><span className="block truncate">{l.sourceUrl}</span></td><td>{l.anchorText}</td>
                    <td className="max-w-60"><Sub>{l.targetPage?.keyword}</Sub><span className="block truncate">{l.targetUrl}</span></td>
                    <td>{l.donor?.dr}</td><td><ActionBadge v={l.action} /></td><td>{l.reviewer}</td><td>{l.client?.name}</td>
                    {isAdmin && <td><RowMenu items={[{ label: "Edit link", onSelect: () => setEdit(l) }, { label: "Delete", danger: true, onSelect: () => setDel(l) }]} /></td>}</tr>
                ))}</tbody>
              </table>
            </div>
            <div className="divide-y divide-zinc-100 md:hidden">{ls.map((l) => (
              <div key={l.id} className="space-y-1 p-3 text-sm"><div className="flex justify-between"><span className="font-medium">{l.client?.name}</span><ActionBadge v={l.action} /></div>
                <div className="truncate text-xs text-zinc-500">{l.sourceUrl}</div><div>{l.anchorText} · DR {l.donor?.dr}</div></div>
            ))}</div>
          </Panel>
        );
      })}
      {isAdmin && <>
        <LinkDialog open={!!edit} link={edit} onOpenChange={(o) => !o && setEdit(null)} onSaved={reload} />
        <ConfirmDialog open={!!delTarget} onOpenChange={(o) => !o && setDel(null)} title="Delete this link?" description={delTarget?.sourceUrl} onConfirm={async () => { await del(`/links/${delTarget.id}`); reload(); }} />
      </>}
    </>
  );
}
