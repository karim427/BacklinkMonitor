import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Dialog } from "@/components/ui/overlays";
import { Button, Select } from "@/components/ui/primitives";
import { downloadText, monthLabel } from "@/lib/utils";
import { COLUMNS, STATUS_LABEL, buildCsv, slug } from "./exportCsv";

/** Pick a month and a client, tick the columns and the individual links, then download a CSV. Built from the links already loaded in the page. */
export function ExportDialog({ open, onOpenChange, links, defaultClient = "", defaultMonth = "" }: { open: boolean; onOpenChange: (o: boolean) => void; links: any[]; defaultClient?: string; defaultMonth?: string }) {
  const [client, setClient] = useState(""); const [month, setMonth] = useState(""); const [status, setStatus] = useState("");
  const [cols, setCols] = useState<Record<string, boolean>>({}); const [off, setOff] = useState<Set<number>>(new Set());
  useEffect(() => { if (open) { setClient(defaultClient); setMonth(defaultMonth); setStatus(""); setOff(new Set()); setCols(Object.fromEntries(COLUMNS.map((c) => [c.key, c.on]))); } }, [open, defaultClient, defaultMonth]);

  const clients = useMemo(() => [...new Map(links.map((l) => [String(l.clientId), l.client?.name ?? "Unknown"])).entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label)), [links]);
  const months = useMemo(() => [...new Set<string>(links.map((l) => l.month))].sort().reverse().map((m) => ({ value: m, label: monthLabel(m) })), [links]);
  const matching = useMemo(() => links.filter((l) => (!client || String(l.clientId) === client) && (!month || l.month === month) && (!status || l.action === status))
    .sort((a, b) => (a.client?.name ?? "").localeCompare(b.client?.name ?? "") || b.month.localeCompare(a.month)), [links, client, month, status]);
  const chosen = matching.filter((l) => !off.has(l.id)); const columns = COLUMNS.filter((c) => cols[c.key]);
  const toggle = (id: number) => setOff((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  function download() {
    const name = `links-${client ? slug(clients.find((c) => c.value === client)?.label ?? "client") : "all-clients"}-${month || "all-months"}.csv`;
    downloadText(name, buildCsv(chosen, columns)); onOpenChange(false);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange} wide title="Export links" description="Choose what to download. Nothing leaves the app until you click Download.">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs font-medium text-zinc-600">Month<Select className="mt-1" value={month} onChange={setMonth} placeholder="All months" options={months} /></label>
        <label className="text-xs font-medium text-zinc-600">Client<Select className="mt-1" value={client} onChange={setClient} placeholder="All clients" options={clients} /></label>
        <label className="text-xs font-medium text-zinc-600">Status<Select className="mt-1" value={status} onChange={setStatus} placeholder="Any status" options={Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))} /></label>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <div className="mb-1 flex items-center justify-between"><p className="text-xs font-medium text-zinc-600">Columns to include</p>
            <span className="text-xs"><button type="button" className="text-blue-600 hover:underline" onClick={() => setCols(Object.fromEntries(COLUMNS.map((c) => [c.key, true])))}>All</button> · <button type="button" className="text-blue-600 hover:underline" onClick={() => setCols(Object.fromEntries(COLUMNS.map((c) => [c.key, false])))}>None</button></span></div>
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-zinc-200 p-2">
            {COLUMNS.map((c) => <label key={c.key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!cols[c.key]} onChange={(e) => setCols({ ...cols, [c.key]: e.target.checked })} />{c.label}</label>)}
          </div>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between"><p className="text-xs font-medium text-zinc-600">Links ({chosen.length} of {matching.length} selected)</p>
            <span className="text-xs"><button type="button" className="text-blue-600 hover:underline" onClick={() => setOff(new Set())}>All</button> · <button type="button" className="text-blue-600 hover:underline" onClick={() => setOff(new Set(matching.map((l) => l.id)))}>None</button></span></div>
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-zinc-200 p-2">
            {!matching.length ? <p className="p-2 text-sm text-zinc-500">No links match these choices.</p> : matching.map((l) => (
              <label key={l.id} className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={!off.has(l.id)} onChange={() => toggle(l.id)} />
                <span className="min-w-0"><span className="block truncate">{l.donor?.domain ?? l.sourceUrl}</span><span className="block truncate text-xs text-zinc-500">{l.client?.name} · {monthLabel(l.month)} · {STATUS_LABEL[l.action] ?? l.action}</span></span></label>))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <p className="text-xs text-zinc-500">{chosen.length} link{chosen.length === 1 ? "" : "s"} · {columns.length} column{columns.length === 1 ? "" : "s"} · opens in Excel or Google Sheets</p>
        <div className="flex gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!chosen.length || !columns.length} onClick={download}><Download className="h-4 w-4" />Download CSV</Button></div>
      </div>
    </Dialog>
  );
}
