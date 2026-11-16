import { useRef, useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorBanner, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/overlays";
import { post, put, useApi } from "@/lib/api";
import { cn, daysUntil, toDateInput } from "@/lib/utils";
import { PageHeader, RefreshButton, Sub, TableSkeleton } from "@/features/shared/common";

const TABS = ["All", "New", "Matched", "Drafted", "Responded", "Expired", "Rejected"];
const tone = (s: string) => ({ New: "blue", Matched: "blue", Drafted: "amber", Responded: "green", Expired: "neutral", Rejected: "red" } as any)[s] ?? "neutral";
const EXAMPLE = `Summary: Looking for real-estate pros on selling an inherited house\nOutlet: Example Home Finance Weekly\nName: Alex Moreno\nCategory: Real estate\nQuery: What are your best tips for selling an inherited house quickly?\nRequirements: Licensed agents or investors, ~100 words\nDeadline: ${toDateInput(new Date(Date.now() + 5 * 86_400_000))}`;

export default function HaroPage() {
  const { data, error, loading, reload } = useApi("/haro");
  const [tab, setTab] = useState("All"); const [q, setQ] = useState(""); const [client, setClient] = useState("");
  const [sel, setSel] = useState<number | null>(null); const [newOpen, setNewOpen] = useState(false); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState<string | null>(null);
  const [raw, setRaw] = useState(""); const [ov, setOv] = useState({ outlet: "", journalist: "", deadline: "" }); const [pre, setPre] = useState("");
  const [draftClient, setDraftClient] = useState(""); const fileRef = useRef<HTMLInputElement>(null);
  const clients: any[] = data?.clients ?? []; const all: any[] = data?.rows ?? [];
  const rows = all.filter((r) => (tab === "All" || r.status === tab) && (!q || `${r.title} ${r.outlet} ${r.journalist}`.toLowerCase().includes(q.toLowerCase())) && (!client || r.matches?.some((m: any) => String(m.clientId) === client) || r.responses?.some((m: any) => String(m.clientId) === client)));
  const cur = all.find((r) => r.id === sel);
  const run = async (key: string, fn: () => Promise<any>) => { setBusy(key); setErr(null); try { const r = await fn(); reload(); return r; } catch (e: any) { setErr(e.message); } finally { setBusy(null); } };
  async function parse() {
    const r = await run("parse", () => post("/haro", { rawEmail: raw, ...Object.fromEntries(Object.entries(ov).filter(([, v]) => v)) }));
    if (r) { setNewOpen(false); setRaw(""); setOv({ outlet: "", journalist: "", deadline: "" }); setSel(r.id); if (pre) setDraftClient(pre); }
  }
  const resp = cur?.responses?.find((x: any) => String(x.clientId) === draftClient);
  const [edited, setEdited] = useState<Record<string, string>>({});
  const draftText = edited[`${cur?.id}-${draftClient}`] ?? resp?.draft ?? "";
  return (
    <>
      <PageHeader title="HARO" description="Parse journalist requests, rank matching clients, draft expert responses." actions={<><RefreshButton onClick={reload} loading={loading} /><Button onClick={() => { setPre(""); setNewOpen(true); }}>New request</Button></>} />
      {(error || err) && <div className="mb-4"><ErrorBanner message={(error || err)!} onRetry={reload} /></div>}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="overflow-hidden lg:col-span-2">
          <div className="flex flex-wrap gap-1 border-b border-zinc-200 p-2">{TABS.map((t) => <button key={t} onClick={() => setTab(t)} className={cn("rounded-md px-2.5 py-1 text-xs", tab === t ? "bg-black text-white" : "hover:bg-zinc-100")}>{t} {t === "All" ? all.length : all.filter((r) => r.status === t).length}</button>)}</div>
          <div className="flex gap-2 border-b border-zinc-200 p-2"><Input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} /><Select className="w-36" value={client} onChange={setClient} placeholder="All clients" options={clients.map((c) => ({ value: c.id, label: c.name }))} /></div>
          {loading && !data ? <TableSkeleton rows={4} /> : !rows.length ? <EmptyState title="No requests" hint="Paste a HARO email with “New request”." /> : rows.map((r) => (
            <button key={r.id} onClick={() => setSel(r.id)} className={cn("block w-full border-b border-zinc-100 p-3 text-left hover:bg-zinc-50", sel === r.id && "bg-zinc-50")}>
              <div className="flex items-start justify-between gap-2"><span className="text-sm font-medium">{r.title ?? "Untitled"}</span><Badge tone={tone(r.status)}>{r.status}</Badge></div>
              <Sub>{r.outlet} · {r.journalist}</Sub><Sub>{r.category ?? "—"} · {r.responses?.length ?? 0} response(s) · deadline {r.deadline ? daysUntil(r.deadline) : "—"}</Sub>
            </button>
          ))}
        </Card>
        <Card className="p-5 lg:col-span-3">
          {!cur ? <EmptyState title="Select a request" hint="Its parsed brief, client matches and drafts appear here." /> : (
            <div className="space-y-5">
              <div><div className="flex items-center justify-between"><h2 className="text-base font-semibold">{cur.title}</h2><Badge tone={tone(cur.status)}>{cur.status}</Badge></div>
                <Sub>{cur.outlet} · {cur.journalist} · {cur.category} · deadline {cur.deadline ? `${toDateInput(cur.deadline)} (${daysUntil(cur.deadline)})` : "—"}</Sub>
                <p className="mt-3 text-sm"><b>Question:</b> {cur.question}</p>{cur.requirements && <p className="mt-1 text-sm"><b>Requirements:</b> {cur.requirements}</p>}</div>
              <div><div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">Matching clients</h3>
                <Button size="sm" variant="outline" disabled={busy === "match"} onClick={() => run("match", () => post(`/haro/${cur.id}/match`))}>{busy === "match" ? "Ranking…" : "Rank matching clients"}</Button></div>
                {!cur.matches?.length ? <Sub>Not ranked yet.</Sub> : cur.matches.map((m: any) => { const c = clients.find((x) => x.id === m.clientId); return (
                  <div key={m.clientId} className="flex items-center justify-between border-t border-zinc-100 py-2 text-sm"><div><span className="font-medium">{c?.name}</span><Sub>{m.why}</Sub></div>
                    <div className="flex items-center gap-2"><Badge tone="blue">{m.score}</Badge><Button size="sm" variant="outline" disabled={busy === "draft"} onClick={async () => { setDraftClient(String(m.clientId)); await run("draft", () => post(`/haro/${cur.id}/draft`, { clientId: m.clientId })); }}>Draft response</Button></div></div>); })}</div>
              {cur.responses?.length > 0 && <div><h3 className="mb-2 text-sm font-semibold">Drafts</h3>
                <Select className="mb-2" value={draftClient} onChange={setDraftClient} placeholder="Choose a draft" options={cur.responses.map((r: any) => ({ value: r.clientId, label: clients.find((c) => c.id === r.clientId)?.name ?? r.clientId }))} />
                {draftClient && <><Textarea rows={9} value={draftText} onChange={(e) => setEdited({ ...edited, [`${cur.id}-${draftClient}`]: e.target.value })} />
                  <div className="mt-2 flex gap-2"><Button variant="outline" onClick={() => navigator.clipboard?.writeText(draftText)}>Copy</Button>
                    <Button onClick={() => run("send", () => put(`/haro/${cur.id}`, { status: "Responded", responses: cur.responses.map((r: any) => String(r.clientId) === draftClient ? { ...r, draft: draftText, sentAt: Date.now() } : r) }))}>Mark as responded</Button>
                    <Button variant="ghost" onClick={() => run("rej", () => put(`/haro/${cur.id}`, { status: "Rejected" }))}>Reject request</Button></div></>}</div>}
            </div>
          )}
        </Card>
      </div>
      <Dialog open={newOpen} onOpenChange={setNewOpen} wide title="New HARO request" description="Paste the raw email. If AI is unavailable a rule-based parser is used.">
        <div className="space-y-3">
          <div><Textarea rows={8} maxLength={20000} value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="Paste HARO email…" /><div className="mt-1 flex items-center justify-between text-xs text-zinc-500"><span>{raw.length} / 20,000</span>
            <span className="flex gap-2"><input ref={fileRef} hidden type="file" accept=".txt,.eml" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setRaw((await f.text()).slice(0, 20000)); }} />
              <button className="underline" onClick={() => fileRef.current?.click()}>Import .txt / .eml</button><button className="underline" onClick={() => setRaw(EXAMPLE)}>Show an example HARO email</button></span></div>
            <p className="text-xs text-zinc-500">Files are read locally; nothing is uploaded until you click Parse.</p></div>
          <div className="grid gap-3 sm:grid-cols-3"><Field label="Outlet"><Input value={ov.outlet} onChange={(e) => setOv({ ...ov, outlet: e.target.value })} /></Field><Field label="Journalist"><Input value={ov.journalist} onChange={(e) => setOv({ ...ov, journalist: e.target.value })} /></Field><Field label="Deadline"><Input type="date" value={ov.deadline} onChange={(e) => setOv({ ...ov, deadline: e.target.value })} /></Field></div>
          <Field label="Preselect client (for drafting)"><Select value={pre} onChange={setPre} placeholder="None" options={clients.map((c) => ({ value: c.id, label: c.name }))} /></Field>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setNewOpen(false)}>Cancel</Button><Button disabled={raw.length < 10 || busy === "parse"} onClick={parse}>{busy === "parse" ? "Parsing…" : "Parse request"}</Button></div>
        </div>
      </Dialog>
    </>
  );
}
