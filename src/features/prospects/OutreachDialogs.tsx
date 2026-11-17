import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Dialog } from "@/components/ui/overlays";
import { Button, ErrorBanner, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { get, post, put } from "@/lib/api";
import { toDateInput } from "@/lib/utils";

/** Who to contact, who owns it, and when to follow up. */
export function OutreachDialog({ prospect, onClose, onSaved }: { prospect: any | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<any>({}); const [people, setPeople] = useState<any[]>([]); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!prospect) return; setErr(null);
    setF({ contactName: prospect.contactName ?? "", contactEmail: prospect.contactEmail ?? "", owner: prospect.owner ?? "", notes: prospect.notes ?? "", followUpAt: toDateInput(prospect.followUpAt), lastContactedAt: toDateInput(prospect.lastContactedAt) });
    get("/people").then((r) => setPeople(r.rows)).catch(() => {});
  }, [prospect]);
  const set = (k: string, v: string) => setF((p: any) => ({ ...p, [k]: v }));
  async function save(markContacted = false) {
    setBusy(true); setErr(null);
    try {
      await put(`/prospects/${prospect.id}`, { contactName: f.contactName, contactEmail: f.contactEmail, owner: f.owner, notes: f.notes, followUpAt: f.followUpAt || null, lastContactedAt: f.lastContactedAt || null, ...(markContacted ? { status: "Contacted" } : {}) });
      onSaved(); onClose();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <Dialog open={!!prospect} onOpenChange={(o) => !o && onClose()} wide title={`Outreach: ${prospect?.domain ?? ""}`} description="Keep who you contacted and when to follow up.">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Contact name"><Input value={f.contactName ?? ""} onChange={(e) => set("contactName", e.target.value)} /></Field>
        <Field label="Contact email"><Input type="email" value={f.contactEmail ?? ""} onChange={(e) => set("contactEmail", e.target.value)} /></Field>
        <Field label="Owner (who is handling it)"><Select value={f.owner ?? ""} onChange={(v) => set("owner", v)} placeholder="Nobody yet" options={people.map((p) => ({ value: p.name, label: p.name }))} /></Field>
        <Field label="Follow up on"><Input type="date" value={f.followUpAt ?? ""} onChange={(e) => set("followUpAt", e.target.value)} /></Field>
        <Field label="Last contacted"><Input type="date" value={f.lastContactedAt ?? ""} onChange={(e) => set("lastContactedAt", e.target.value)} /></Field>
      </div>
      <div className="mt-3"><Field label="Notes"><Textarea rows={3} value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} placeholder="What you sent, what they said…" /></Field></div>
      {err && <div className="mt-3"><ErrorBanner message={err} /></div>}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button variant="outline" disabled={busy} onClick={() => save(false)}>Save</Button>
        {prospect?.status !== "Contacted" && prospect?.status !== "Won" && <Button disabled={busy} onClick={() => save(true)} title="Sets the status to Contacted and a follow-up in 7 days">Save and mark contacted</Button>}
      </div>
    </Dialog>
  );
}

/** Creates a Pending link for the prospect's client, with the donor already filled in. */
export function CreateLinkDialog({ prospect, client, onClose, onCreated }: { prospect: any | null; client: any | null; onClose: () => void; onCreated: () => void }) {
  const [pages, setPages] = useState<any[]>([]); const [pageId, setPageId] = useState(""); const [targetUrl, setTargetUrl] = useState(""); const [anchor, setAnchor] = useState("");
  const [source, setSource] = useState(""); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [done, setDone] = useState<any | null>(null);
  useEffect(() => {
    if (!prospect) return; setErr(null); setDone(null); setPageId(""); setAnchor("");
    setSource(prospect.pageUrl ?? `https://${prospect.domain}/`); setTargetUrl(client?.domain ? `https://${String(client.domain).replace(/^https?:\/\//, "").replace(/\/.*$/, "")}/` : "");
    get("/target-pages").then((r) => setPages(r.rows.filter((p: any) => p.clientId === prospect.clientId))).catch(() => {});
  }, [prospect, client]);
  async function create() {
    setBusy(true); setErr(null);
    try { const l = await post(`/prospects/${prospect.id}/to-link`, { targetUrl, targetPageId: pageId ? Number(pageId) : null, sourceUrl: source, anchorText: anchor }); setDone(l); onCreated(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <Dialog open={!!prospect} onOpenChange={(o) => !o && onClose()} wide title="Create a link" description={`For ${client?.name ?? "the client"}. It starts as Pending; mark it In process once it is placed.`}>
      {done ? (
        <div className="space-y-3 text-sm"><p className="rounded-md bg-green-50 px-3 py-2 text-green-800">Link created as Pending.</p>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Close</Button><Button asChild><Link to={`/links?client=${prospect.clientId}`}>Open in Links</Link></Button></div></div>
      ) : (
        <div className="space-y-3">
          <Field label="Target page (optional)"><Select value={pageId} onChange={(v) => { setPageId(v); const p = pages.find((x) => String(x.id) === v); if (p) setTargetUrl(p.url); }} placeholder="Client website" options={pages.map((p) => ({ value: p.id, label: p.keyword }))} /></Field>
          <Field label="Link to (client URL) *"><Input type="url" value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} /></Field>
          <Field label="Link from (page on their site)"><Input type="url" value={source} onChange={(e) => setSource(e.target.value)} /></Field>
          <Field label="Anchor text" hint="Leave empty if you don't know it yet."><Input value={anchor} onChange={(e) => setAnchor(e.target.value)} /></Field>
          {err && <ErrorBanner message={err} />}
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={busy || !targetUrl} onClick={create}>{busy ? "Creating…" : "Create link"}</Button></div>
        </div>)}
    </Dialog>
  );
}
