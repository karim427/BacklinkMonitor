import { useEffect, useState } from "react";
import { Badge, Button, ErrorBanner, Input, Select } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/overlays";
import { get, post } from "@/lib/api";

/** Reads the client's sitemap and lets you tick which pages and blogs to build links to. They are added to Target pages as Pending. */
export function SitemapDialog({ open, onOpenChange, clientId, onAdded }: { open: boolean; onOpenChange: (o: boolean) => void; clientId?: number | null; onAdded: () => void }) {
  const [clients, setClients] = useState<any[]>([]); const [cid, setCid] = useState<string>("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<{ total: number; usable: number; suggestions: any[] } | null>(null);
  const [pick, setPick] = useState<Record<string, boolean>>({}); const [kw, setKw] = useState<Record<string, string>>({});

  useEffect(() => { if (open) { setRes(null); setErr(null); setCid(clientId ? String(clientId) : ""); get("/clients").then((c) => setClients(c.rows)).catch(() => {}); } }, [open, clientId]);
  async function scan(id: string) {
    setBusy(true); setErr(null); setRes(null);
    try {
      const r = await post(`/clients/${id}/sitemap-scan`, {});
      setRes(r); setPick(Object.fromEntries(r.suggestions.map((s: any) => [s.url, true]))); setKw(Object.fromEntries(r.suggestions.map((s: any) => [s.url, s.keyword])));
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  useEffect(() => { if (open && cid) scan(cid); }, [cid, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const chosen = (res?.suggestions ?? []).filter((s) => pick[s.url] && kw[s.url]?.trim());
  async function add() {
    setBusy(true); setErr(null);
    try { await post(`/clients/${cid}/sitemap-add`, { pages: chosen.map((s) => ({ url: s.url, keyword: kw[s.url].trim() })) }); onAdded(); onOpenChange(false); }
    catch (e: any) { setErr(e.message); setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange} wide title="Pages to build links to" description="We read the website's sitemap and suggest the pages and blog posts worth getting links for.">
      <div className="space-y-3">
        {!clientId && <Select value={cid} onChange={setCid} placeholder="Choose a client" options={clients.map((c) => ({ value: c.id, label: `${c.name} (${c.domain})` }))} />}
        {err && <ErrorBanner message={err} />}
        {busy && !res && <p className="text-sm text-zinc-500">Reading the sitemap…</p>}
        {res && !res.suggestions.length && <p className="text-sm text-zinc-500">Nothing new to suggest. Every useful page is already a target page.</p>}
        {res && res.suggestions.length > 0 && <>
          <p className="text-xs text-zinc-500">Found {res.total} pages in the sitemap. Tick the ones you want and fix the keyword if needed.</p>
          <div className="max-h-96 divide-y overflow-y-auto rounded-lg border">
            {res.suggestions.map((s) => (
              <label key={s.url} className="flex items-start gap-3 p-3 text-sm">
                <input type="checkbox" className="mt-1" checked={!!pick[s.url]} onChange={(e) => setPick({ ...pick, [s.url]: e.target.checked })} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2"><Badge tone={s.kind === "blog" ? "blue" : "green"}>{s.kind === "blog" ? "Blog" : "Page"}</Badge><span className="truncate text-zinc-500">{s.url.replace(/^https?:\/\/(www\.)?/, "")}</span></span>
                  <Input className="mt-1.5 h-8" value={kw[s.url] ?? ""} onChange={(e) => setKw({ ...kw, [s.url]: e.target.value })} placeholder="Keyword" />
                  {s.why && <span className="mt-1 block text-xs text-zinc-400">{s.why}</span>}
                </span>
              </label>
            ))}
          </div>
        </>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Skip</Button>{res && res.suggestions.length > 0 && <Button disabled={busy || !chosen.length} onClick={add}>Add {chosen.length} as target pages</Button>}</div>
      </div>
    </Dialog>
  );
}
