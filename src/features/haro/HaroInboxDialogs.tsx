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

const SCRIPT = (url: string) => `// Sends new journalist-request emails to the app. Runs in the Gmail account that receives them.
const APP_ADDRESS = "${url}";
function sendNewRequests() {
  const q = 'is:unread newer_than:3d (from:haro OR from:featured.com OR from:qwoted.com OR from:sourceofsources OR from:helpab2bwriter)';
  GmailApp.search(q, 0, 20).forEach(function (thread) {
    thread.getMessages().forEach(function (m) {
      if (!m.isUnread()) return;
      var r = UrlFetchApp.fetch(APP_ADDRESS, { method: "post", contentType: "application/json", muteHttpExceptions: true,
        payload: JSON.stringify({ subject: m.getSubject(), html: m.getBody() }) });
      if (r.getResponseCode() < 300) m.markRead();
    });
  });
}`;

/** Where to sign up and how to make the emails arrive in the app on their own. Works with a plain mailbox: no Zoho Flow or other trigger needed. */
export function HaroConnectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [token, setToken] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null); const [copied, setCopied] = useState("");
  const url = token ? `${location.origin}/api/haro/inbound/${token}` : "";
  async function show() { setErr(null); try { setToken((await get("/haro/inbox")).token); } catch (e: any) { setErr(e.message); } }
  async function regen() { if (!window.confirm("Make a new address? The old one stops working, so update the script or automation that uses it.")) return; try { setToken((await post("/haro/inbox/regenerate", {})).token); } catch (e: any) { setErr(e.message); } }
  const copy = (what: string, text: string) => { navigator.clipboard?.writeText(text); setCopied(what); };
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setToken(null); }} wide title="Get requests in automatically" description="Sign up to the services that email journalist requests, then send those emails here.">
      <ol className="space-y-4 text-sm">
        <li><b>1. Sign up (free) with one email address.</b>
          <p className="mt-1 text-zinc-600">Services that send journalist requests by email: <b>Featured.com</b> (owns the HARO brand now), <b>Qwoted</b>, <b>Source of Sources</b> and <b>Help a B2B Writer</b>. Pick the topics your clients fit (tech, real estate, trades) so you only get relevant ones. Easiest: use a Gmail address just for this (for example <i>yourcompany.requests@gmail.com</i>). If you use Zoho, a Zoho rule that forwards these emails to that Gmail works too.</p></li>
        <li><b>2. Show your private address.</b>
          <div className="mt-1">{!token ? <Button variant="outline" size="sm" onClick={show}>Show my private address</Button> : (
            <div className="space-y-2"><div className="break-all rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-xs">{url}</div>
              <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => copy("url", url)}>{copied === "url" ? "Copied" : "Copy address"}</Button><Button size="sm" variant="ghost" onClick={regen}>Make a new address</Button></div>
              <p className="text-xs text-amber-800">Anyone with this address can add requests, so keep it private.</p></div>)}</div>
          {err && <div className="mt-2"><ErrorBanner message={err} /></div>}</li>
        <li><b>3. Send the emails to it. Pick one way:</b>
          <div className="mt-2 space-y-3">
            <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3"><b>A. A separate inbox just for the app (no mailbox of yours, no DNS)</b>
              <p className="mt-1 text-zinc-600">Services such as <b>CloudMailin</b> or <b>Postmark</b> (inbound email) give you a new email address and forward everything sent to it to a web address. Sign up to them, then:</p>
              <ol className="mt-1 list-decimal space-y-1 pl-5 text-zinc-600"><li>Create an address and set its target to your private address above (choose JSON format if asked).</li><li>Sign up to the request services using that new address. Any confirmation email shows in the service's message log, so you can click its link there.</li><li>Check the service's free limit. A few emails a day is small.</li></ol>
              <p className="mt-1 text-xs text-zinc-500">A few sign-up forms refuse unusual addresses. If that happens, use B or C.</p></div>
            <div className="rounded-lg border border-zinc-200 p-3"><b>B. Gmail script (free, no other tools)</b>
              <ol className="mt-1 list-decimal space-y-1 pl-5 text-zinc-600"><li>Open <b>script.google.com</b> while signed in to that Gmail, click New project, and paste the script below.</li><li>Click Triggers (clock icon), Add Trigger, choose <i>sendNewRequests</i>, Time-driven, <b>Every hour</b>.</li><li>Run it once and allow access. It sends each new request email to the app and marks it read.</li></ol>
              {token ? <div className="mt-2"><pre className="max-h-40 overflow-auto rounded-md bg-zinc-900 p-3 text-[11px] leading-snug text-zinc-100">{SCRIPT(url)}</pre><Button className="mt-2" size="sm" variant="outline" onClick={() => copy("script", SCRIPT(url))}>{copied === "script" ? "Copied" : "Copy script"}</Button></div> : <p className="mt-2 text-xs text-zinc-500">Show your private address above to get the script.</p>}</div>
            <div className="rounded-lg border border-zinc-200 p-3"><b>D. Zapier, Make or similar</b>
              <p className="mt-1 text-zinc-600">If you already use one: trigger on a new email, and POST its <code>subject</code> and <code>text</code> (or <code>html</code>) to the address above.</p></div>
            <div className="rounded-lg border border-zinc-200 p-3"><b>C. By hand, any time (needs no setup)</b>
              <p className="mt-1 text-zinc-600">Copy the whole email and use <b>Import email</b>. It works with no setup.</p></div>
          </div></li>
        <li><b>4. They show up here.</b>
          <p className="mt-1 text-zinc-600">A daily email with many requests is split into one entry per request. Repeats are skipped. Then match them to clients and draft a reply.</p></li>
      </ol>
      <div className="mt-3 flex justify-end"><Button onClick={() => onOpenChange(false)}>Done</Button></div>
    </Dialog>
  );
}
