import { useState } from "react";
import { Dialog } from "@/components/ui/overlays";
import { Button, Card, ErrorBanner } from "@/components/ui/primitives";
import { get, post } from "@/lib/api";

/** Review and remove the sample data that came with the app (everything on reserved .example addresses). Real data is never touched. */
export function DemoDataCard({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false); const [prev, setPrev] = useState<any | null>(null);
  const [ok, setOk] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [done, setDone] = useState<string | null>(null);
  async function review() { setErr(null); setDone(null); setOk(false); try { setPrev(await get("/demo-data")); setOpen(true); } catch (e: any) { setErr(e.message); } }
  async function remove() {
    setBusy(true); setErr(null);
    try { const r = await post("/demo-data/remove", { confirm: true }); setDone(`Removed ${r.links} links, ${r.donors} donors, ${r.clients} clients, ${r.prospects} prospects and ${r.haro} HARO requests.`); setOpen(false); onDone(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  const n = prev ? prev.links.length + prev.donors.length + prev.clients.length + prev.prospects.length + prev.haro.length + prev.citations : 0;
  return (
    <Card className="mb-6 p-5">
      <h2 className="mb-1 text-sm font-semibold">Sample data</h2>
      <p className="mb-3 text-xs text-zinc-500">The app came with made-up clients, donors and links on fake addresses (ending in .example). Review them here and remove them so only your real data is left.</p>
      {done && <p className="mb-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">{done}</p>}
      {err && !open && <div className="mb-3"><ErrorBanner message={err} /></div>}
      <Button variant="outline" onClick={review}>Review sample data</Button>
      <Dialog open={open} onOpenChange={setOpen} title="Remove sample data" description="Nothing is deleted until you confirm below.">
        {prev && (n === 0 ? <p className="text-sm text-zinc-600">There is no sample data left.</p> : (
          <div className="space-y-3 text-sm">
            <p>This will delete:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li><b>{prev.links.length}</b> links on fake pages (and their check history)</li>
              <li><b>{prev.donors.length}</b> donors on fake sites</li>
              <li><b>{prev.clients.length}</b> clients with fake domains and no real links{!!prev.clients.length && <span className="block text-xs text-zinc-500">{prev.clients.map((c: any) => c.name).join(", ")}</span>}</li>
              <li><b>{prev.prospects.length}</b> prospects and <b>{prev.haro.length}</b> HARO requests that are examples</li>
              {prev.citations > 0 && <li><b>{prev.citations}</b> old citation rows (the Citations feature was removed)</li>}
            </ul>
            {!!prev.keptClients.length && <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900"><b>Kept:</b> {prev.keptClients.map((c: any) => c.name).join(", ")} has a real link but a fake domain ({prev.keptClients.map((c: any) => c.domain).join(", ")}). Edit its domain in Settings, then it is a normal client.</p>}
            <p className="text-xs text-zinc-500">Clients with a real domain, and any link on a real page, are never touched. This cannot be undone.</p>
            <label className="flex items-center gap-2"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />I understand this deletes the items above</label>
            {err && <ErrorBanner message={err} />}
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={!ok || busy} onClick={remove}>{busy ? "Removing…" : "Delete sample data"}</Button></div>
          </div>))}
      </Dialog>
    </Card>
  );
}
