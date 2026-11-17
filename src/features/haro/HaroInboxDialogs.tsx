import { useState } from "react";
import { Dialog } from "@/components/ui/overlays";
import { Button, ErrorBanner, Textarea } from "@/components/ui/primitives";
import { get, post } from "@/lib/api";

/** Paste a whole email, even a digest with many requests: each journalist request becomes its own entry. Duplicates are skipped. */
export function HaroImportDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const [text, setText] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null);
  async function go() {
    setBusy(true); setErr(null); setMsg(null);
    try { const r = await post("/haro/import", { text }); setMsg(`Found ${r.found} request${r.found === 1 ? "" : "s"}: ${r.created} added${r.duplicates ? `, ${r.duplicates} already here` : ""}.`); setText(""); onDone(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setMsg(null); setErr(null); } }} wide title="Import email" description="Paste a whole HARO-style email. It can hold many requests: each one is split out for you.">
      <Textarea rows={12} placeholder="Paste the email text here…" value={text} onChange={(e) => setText(e.target.value)} />
      {err && <div className="mt-3"><ErrorBanner message={err} /></div>}
      {msg && <p className="mt-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">{msg}</p>}
      <div className="mt-3 flex justify-end gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button><Button disabled={busy || text.trim().length < 20} onClick={go}>{busy ? "Reading…" : "Import requests"}</Button></div>
    </Dialog>
  );
}

/** Where to sign up and how to make the emails arrive in the app on their own. */
export function HaroConnectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [token, setToken] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null); const [copied, setCopied] = useState(false);
  const url = token ? `${location.origin}/api/haro/inbound/${token}` : "";
  async function show() { setErr(null); try { setToken((await get("/haro/inbox")).token); } catch (e: any) { setErr(e.message); } }
  async function regen() { if (!window.confirm("Make a new address? The old one stops working, so update it in Zapier / Make / Zoho Flow.")) return; try { setToken((await post("/haro/inbox/regenerate", {})).token); } catch (e: any) { setErr(e.message); } }
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setToken(null); }} wide title="Get requests in automatically" description="Sign up to the services that email journalist requests, then send those emails here.">
      <ol className="space-y-4 text-sm">
        <li><b>1. Sign up (free) with an email the team can see.</b>
          <p className="mt-1 text-zinc-600">Services that send journalist requests by email: <b>Featured.com</b> (owns the HARO brand now), <b>Qwoted</b>, <b>Source of Sources</b> and <b>Help a B2B Writer</b>. Pick the topics your clients fit (tech, real estate, trades) so you only get relevant requests.</p></li>
        <li><b>2. Forward those emails to the app.</b>
          <p className="mt-1 text-zinc-600">In <b>Zapier</b>, <b>Make</b> or <b>Zoho Flow</b>: trigger on “new email” from the service, and add an action “Webhooks: POST” to the address below. Send the email's <code>subject</code> and <code>text</code> (or <code>html</code>) as the body. No DNS changes are needed.</p>
          <div className="mt-2">{!token ? <Button variant="outline" size="sm" onClick={show}>Show my private address</Button> : (
            <div className="space-y-2"><div className="break-all rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-xs">{url}</div>
              <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); }}>{copied ? "Copied" : "Copy"}</Button><Button size="sm" variant="ghost" onClick={regen}>Make a new address</Button></div>
              <p className="text-xs text-amber-800">Anyone with this address can add requests, so keep it private.</p></div>)}</div>
          {err && <div className="mt-2"><ErrorBanner message={err} /></div>}</li>
        <li><b>3. They show up here.</b>
          <p className="mt-1 text-zinc-600">A daily email with many requests is split into one entry per request. Repeats are skipped. Then match them to clients and draft a reply.</p></li>
      </ol>
      <p className="mt-4 text-xs text-zinc-500">Not set up yet? Use <b>Import email</b> to paste a whole email by hand.</p>
      <div className="mt-3 flex justify-end"><Button onClick={() => onOpenChange(false)}>Done</Button></div>
    </Dialog>
  );
}
