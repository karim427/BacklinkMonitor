import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/overlays";
import { Button, ErrorBanner, Field, Input, Select } from "@/components/ui/primitives";
import { post, put } from "@/lib/api";
import { CLUSTERS } from "@server/services/constants";

const empty = { name: "", domain: "", cluster: CLUSTERS[0] as string, city: "", state: "", isCashBuyer: false, defaultMonthlyTarget: 4 };

export function ClientDialog({ open, onOpenChange, client, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; client?: any; onSaved: () => void }) {
  const [f, setF] = useState<any>(empty); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  useEffect(() => { if (open) { setErr(null); setF(client ? { ...empty, ...Object.fromEntries(Object.entries(client).map(([k, v]) => [k, v ?? ""])) } : empty); } }, [open, client]);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    const body = { name: f.name, domain: f.domain, cluster: f.cluster, city: f.city || null, state: f.state || null, isCashBuyer: !!f.isCashBuyer, defaultMonthlyTarget: Number(f.defaultMonthlyTarget) };
    try { client ? await put(`/clients/${client.id}`, body) : await post("/clients", body); onSaved(); onOpenChange(false); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange} wide title={client ? "Edit client" : "Add website"}>
      <form onSubmit={submit} className="space-y-3">
        {err && <ErrorBanner message={err} />}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name *"><Input required value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="Domain *"><Input required value={f.domain} onChange={(e) => set("domain", e.target.value)} placeholder="example.com" /></Field>
          <Field label="Cluster"><Select value={f.cluster} onChange={(v) => set("cluster", v)} options={CLUSTERS.map((c) => ({ value: c, label: c }))} /></Field>
          <Field label="Default monthly target"><Input type="number" min={0} value={f.defaultMonthlyTarget} onChange={(e) => set("defaultMonthlyTarget", e.target.value)} /></Field>
          <Field label="City"><Input value={f.city} onChange={(e) => set("city", e.target.value)} /></Field>
          <Field label="State"><Input value={f.state} onChange={(e) => set("state", e.target.value)} /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.isCashBuyer} onChange={(e) => set("isCashBuyer", e.target.checked)} />Cash home buyer (competing-client rule applies)</label>
        <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={busy}>{busy ? "Saving…" : "Save"}</Button></div>
      </form>
    </Dialog>
  );
}
