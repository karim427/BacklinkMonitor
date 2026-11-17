import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/overlays";
import { Button, ErrorBanner, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { get, post, put } from "@/lib/api";
import { toDateInput, todayLocal } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { ANCHOR_TYPES, PLACEMENTS } from "@server/services/constants";

const empty = { clientId: "", targetPageId: "", donorId: "", donorDomain: "", sourceUrl: "", targetUrl: "", anchorText: "", anchorType: "Natural", placement: "Unknown", action: "", reviewer: "", placedAt: "", notes: "", autoVerify: true };

export function LinkDialog({ open, onOpenChange, link, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; link?: any | null; onSaved: () => void }) {
  const [f, setF] = useState<any>(empty);
  const [clients, setClients] = useState<any[]>([]); const [pages, setPages] = useState<any[]>([]); const [donors, setDonors] = useState<any[]>([]);
  const [people, setPeople] = useState<any[]>([]); const { user } = useAuth();
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (!open) return;
    setErr(null);
    Promise.all([get("/clients"), get("/target-pages"), get("/donors"), get("/people")]).then(([c, t, d, p]) => { setClients(c.rows); setPages(t.rows); setDonors(d.rows); setPeople(p.rows); }).catch((e) => setErr(e.message));
    setF(link ? { ...empty, ...link, clientId: String(link.clientId), targetPageId: link.targetPageId ? String(link.targetPageId) : "", donorId: String(link.donorId), placedAt: toDateInput(link.placedAt), reviewer: link.reviewer ?? "", notes: link.notes ?? "", autoVerify: false } : { ...empty, reviewer: user?.name || user?.email?.split("@")[0] || "" });
  }, [open, link]);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    const body = {
      clientId: Number(f.clientId), targetPageId: f.targetPageId ? Number(f.targetPageId) : null, donorId: f.donorId ? Number(f.donorId) : null,
      donorDomain: f.donorDomain || null, sourceUrl: f.sourceUrl, targetUrl: f.targetUrl, anchorText: f.anchorText, anchorType: f.anchorType,
      placement: f.placement, ...(f.action ? { action: f.action } : {}), reviewer: f.reviewer || null, placedAt: f.placedAt || null, notes: f.notes || null, autoVerify: f.autoVerify,
    };
    try { link ? await put(`/links/${link.id}`, body) : await post("/links", body); onSaved(); onOpenChange(false); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  const clientPages = pages.filter((p) => String(p.clientId) === String(f.clientId));
  return (
    <Dialog open={open} onOpenChange={onOpenChange} wide title={link ? "Edit link" : "Add link"} description="Every backlink is reviewed against Stage 1, checks A–C and the reject list.">
      <form onSubmit={submit} className="space-y-3">
        {err && <ErrorBanner message={err} />}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Client *"><Select value={f.clientId} onChange={(v) => { set("clientId", v); set("targetPageId", ""); }} placeholder="Select client" options={clients.map((c) => ({ value: c.id, label: c.name }))} /></Field>
          <Field label="Target page (optional)"><Select value={f.targetPageId} onChange={(v) => { set("targetPageId", v); const p = pages.find((x) => String(x.id) === v); if (p) set("targetUrl", p.url); }} placeholder="None" options={clientPages.map((p) => ({ value: p.id, label: p.keyword }))} /></Field>
          <Field label="Donor"><Select value={f.donorId} onChange={(v) => set("donorId", v)} placeholder="Auto-create from source URL" options={donors.map((d) => ({ value: d.id, label: `${d.domain} (DR ${d.dr})` }))} /></Field>
          <Field label="…or new donor domain"><Input value={f.donorDomain} disabled={!!f.donorId} onChange={(e) => set("donorDomain", e.target.value)} placeholder="example.com" /></Field>
        </div>
        <Field label="Source URL *"><Input required type="url" value={f.sourceUrl} onChange={(e) => set("sourceUrl", e.target.value)} placeholder="https://donor.com/post" /></Field>
        <Field label="Target URL *"><Input required type="url" value={f.targetUrl} onChange={(e) => set("targetUrl", e.target.value)} placeholder="https://client.com/page" /></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Anchor text"><Input value={f.anchorText} onChange={(e) => set("anchorText", e.target.value)} /></Field>
          <Field label="Anchor type"><Select value={f.anchorType} onChange={(v) => set("anchorType", v)} options={ANCHOR_TYPES.map((a) => ({ value: a, label: a }))} /></Field>
          <Field label="Placement"><Select value={f.placement} onChange={(v) => set("placement", v)} options={PLACEMENTS.map((a) => ({ value: a, label: a }))} /></Field>
          <Field label="Status" hint="Relevance is only checked once the link is live."><Select value={f.action} onChange={(v) => set("action", v)} placeholder="Automatic (Pending, or In process once placed)"
            options={[{ value: "PENDING", label: "Pending" }, { value: "IN_PROCESS", label: "In process" }, { value: "LIVE", label: "Live" }, { value: "REJECTED", label: "Rejected" }, ...(["REPLACE", "LOST"].includes(f.action) ? [{ value: f.action, label: f.action === "LOST" ? "Lost" : "Replace" }] : [])]} /></Field>
          <Field label="Name"><Select value={f.reviewer} onChange={(v) => set("reviewer", v)} placeholder="Select a person" options={[...people.map((p) => ({ value: p.name, label: p.name })), ...(f.reviewer && !people.some((p) => p.name === f.reviewer) ? [{ value: f.reviewer, label: f.reviewer }] : [])]} /></Field>
          <div className="sm:col-span-3"><Field label="Placed at" hint="Setting a date moves the link to Placed and schedules rechecks.">
            <div className="flex gap-2"><Input type="date" max={todayLocal()} value={f.placedAt} onChange={(e) => set("placedAt", e.target.value)} />
              <Button type="button" variant="outline" onClick={() => set("placedAt", todayLocal())}>Today</Button></div></Field></div>
        </div>
        <Field label="Notes"><Textarea rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.autoVerify} onChange={(e) => set("autoVerify", e.target.checked)} />Check relevance automatically after saving</label>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={busy || !f.clientId || (!!f.placedAt && f.placedAt > todayLocal())}>{busy ? "Saving…" : link ? "Save changes" : "Add link"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
