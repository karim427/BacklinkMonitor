import { useState } from "react";
import { AdminOnly } from "@/lib/auth";
import { Badge, Button, Card, ErrorBanner, Field, Input } from "@/components/ui/primitives";
import { put, useApi } from "@/lib/api";

/** Firecrawl reads donor blogs (including pages that need JavaScript) so the app can check they really fit the client. */
export function FirecrawlCard() {
  const { data: u, reload } = useApi("/firecrawl/usage");
  const [key, setKey] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null);
  async function save(remove = false) {
    setBusy(true); setErr(null); setMsg(null);
    try { const r = await put("/settings/firecrawl-key", { key: remove ? null : key }); setMsg(remove ? "Firecrawl key removed." : r.verified ? `Firecrawl key saved and verified${r.remaining != null ? `: ${Number(r.remaining).toLocaleString("en-US")} credits left` : ""}.` : "Firecrawl key saved, but it could not be verified right now."); setKey(""); reload(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <Card className="mb-6 p-5">
      <h2 className="mb-1 text-sm font-semibold">Firecrawl (reads donor blogs)</h2>
      <p className="mb-3 text-xs text-zinc-500">Used by <b>Check blog</b> on the Donors page: it reads a few real posts from a donor's site, then the AI says what the site is about and how well it fits each client. About 6 Firecrawl credits per donor.</p>
      <div className="mb-3 space-y-1 text-sm">
        <div className="flex justify-between"><span className="text-zinc-500">Status</span><Badge tone={u?.hasKey ? "green" : "amber"}>{u?.hasKey ? "Connected" : "No key"}</Badge></div>
        {u?.hasKey && <div className="flex justify-between"><span className="text-zinc-500">API key</span><span>•••• {u.last4} ({u.source === "settings" ? "saved here" : "server setting"})</span></div>}
        {u?.hasKey && !u.error && u.remaining != null && <div className="flex justify-between"><span className="text-zinc-500">Credits left</span><span><b>{Number(u.remaining).toLocaleString("en-US")}</b>{u.plan ? ` of ${Number(u.plan).toLocaleString("en-US")}` : ""}{u.periodEnd ? ` · resets ${new Date(u.periodEnd).toLocaleDateString()}` : ""}</span></div>}
        {u?.error && <p className="text-xs text-red-700">{u.error}</p>}
      </div>
      {msg && <p className="mb-2 rounded-md bg-green-50 px-3 py-2 text-xs text-green-800">{msg}</p>}
      {err && <div className="mb-2"><ErrorBanner message={err} /></div>}
      <AdminOnly>
        <form className="space-y-2 border-t border-zinc-100 pt-3" onSubmit={(e) => { e.preventDefault(); if (key.trim()) save(); }}>
          <Field label={u?.hasKey ? "Replace Firecrawl API key" : "Firecrawl API key"} hint="Stored encrypted on the server. It is never shown again after saving.">
            <Input type="password" autoComplete="off" spellCheck={false} placeholder="fc-…" value={key} onChange={(e) => setKey(e.target.value)} />
          </Field>
          <div className="flex gap-2"><Button disabled={busy || key.trim().length < 8}>{busy ? "Checking…" : "Save key"}</Button>{u?.source === "settings" && <Button type="button" variant="ghost" disabled={busy} onClick={() => save(true)}>Remove key</Button>}</div>
        </form>
      </AdminOnly>
    </Card>
  );
}
