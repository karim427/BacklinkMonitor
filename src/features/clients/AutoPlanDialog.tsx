import { useEffect, useState } from "react";
import { Badge, Button, ErrorBanner, Select } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/overlays";
import { get, post } from "@/lib/api";

/** Picks the easiest pages from the client's sitemap by itself: reads the sitemap, checks keyword difficulty and volume, adds the best few as approved target pages and gives each to a teammate. */
export function AutoPlanDialog({ open, onOpenChange, clientId, onDone, onManual }: { open: boolean; onOpenChange: (o: boolean) => void; clientId?: number | null; onDone: () => void; onManual?: (clientId: number) => void }) {
  const [clients, setClients] = useState<any[]>([]); const [cid, setCid] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<any>(null); const [people, setPeople] = useState<any[]>([]);

  useEffect(() => { if (open) { setRes(null); setErr(null); setCid(clientId ? String(clientId) : ""); get("/clients").then((c) => setClients(c.rows)).catch(() => {}); get("/people").then((p) => setPeople(p.rows)).catch(() => {}); } }, [open, clientId]);
  useEffect(() => {
    if (!open || !cid) return;
    let live = true; setBusy(true); setErr(null); setRes(null);
    post(`/clients/${cid}/auto-plan`, {}).then((r) => { if (live) { setRes(r); onDone(); } }).catch((e) => live && setErr(e.message)).finally(() => live && setBusy(false));
    return () => { live = false; };
  }, [cid, open]); // eslint-disable-line react-hooks/exhaustive-deps
  const who = (id: number | null) => people.find((p) => p.id === id)?.name ?? "Nobody yet";

  return (
    <Dialog open={open} onOpenChange={onOpenChange} wide title="Picking pages to get links for" description="We read the website's sitemap, look up each page's keyword in Ahrefs, keep the easy wins and give each page to a teammate.">
      <div className="space-y-3">
        {!clientId && <Select value={cid} onChange={setCid} placeholder="Choose a client" options={clients.map((c) => ({ value: c.id, label: `${c.name} (${c.domain})` }))} />}
        {busy && <p className="text-sm text-zinc-500">Reading the sitemap and checking keywords. This can take up to a minute…</p>}
        {err && <><ErrorBanner message={err} />{cid && onManual && <Button variant="outline" onClick={() => { onOpenChange(false); onManual(Number(cid)); }}>Choose pages by hand instead</Button>}</>}
        {res && <>
          {res.added.length > 0 ? <>
            <p className="text-sm">Added <b>{res.added.length}</b> target page{res.added.length === 1 ? "" : "s"} from {res.considered} checked.</p>
            <div className="divide-y rounded-lg border">
              {res.added.map((p: any) => (
                <div key={p.url} className="p-3 text-sm">
                  <div className="flex items-center justify-between gap-2"><span className="font-medium">{p.keyword}</span><Badge tone="blue">{who(p.assigneeId)}</Badge></div>
                  <div className="truncate text-xs text-zinc-500">{p.url.replace(/^https?:\/\/(www\.)?/, "")}</div>
                  <div className="mt-1 text-zinc-600">{p.volume?.toLocaleString()} searches a month · difficulty {p.difficulty}/100 · needs <b>{p.rdsNeeded}</b> more linking sites ({p.monthsToClose} month{p.monthsToClose === 1 ? "" : "s"})</div>
                </div>
              ))}
            </div>
          </> : <p className="text-sm text-zinc-600">No new pages were added.</p>}
          {res.skipped.length > 0 && <ul className="list-disc space-y-0.5 pl-5 text-xs text-zinc-500">{res.skipped.slice(0, 5).map((t: string) => <li key={t}>{t}</li>)}</ul>}
        </>}
        <div className="flex justify-end gap-2">
          {res && cid && onManual && <Button variant="outline" onClick={() => { onOpenChange(false); onManual(Number(cid)); }}>Add more by hand</Button>}
          <Button onClick={() => onOpenChange(false)}>{res ? "Done" : "Close"}</Button>
        </div>
      </div>
    </Dialog>
  );
}
