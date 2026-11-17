import { useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorBanner, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/overlays";
import { del, post, put, useApi } from "@/lib/api";
import { fmtDate } from "@/lib/utils";
import { OutreachDialog, CreateLinkDialog } from "@/features/prospects/OutreachDialogs";
import { FilterBar, PageHeader, Panel, Pager, RefreshButton, Sub, Table, TableSkeleton, THead, usePaged } from "@/features/shared/common";

const labelTone = (l: string) => (l === "Relevant" ? "blue" : l === "Partly" ? "amber" : "red");
const STATUSES = ["New", "Shortlisted", "Contacted", "Won", "Rejected"];

export default function ProspectsPage() {
  const { data, error, loading, reload } = useApi("/prospects");
  const { data: cl } = useApi("/clients");
  const [clientId, setClientId] = useState(""); const [limit, setLimit] = useState(10); const [perQuery, setPerQuery] = useState(5); const [seeds, setSeeds] = useState("");
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({ q: "", client: "", status: "", min: "" });
  const [outreach, setOutreach] = useState<any | null>(null); const [linkFor, setLinkFor] = useState<any | null>(null);
  const [manual, setManual] = useState(false); const [m, setM] = useState({ clientId: "", domain: "", pageTitle: "", snippet: "" });
  const clients: any[] = cl?.rows ?? []; const ai = data?.ai;
  const rows: any[] = (data?.rows ?? []).filter((r: any) => (!f.q || `${r.domain} ${r.pageTitle}`.toLowerCase().includes(f.q.toLowerCase())) && (!f.client || String(r.clientId) === f.client) && (!f.status || r.status === f.status) && (!f.min || r.score >= Number(f.min)));
  const pg = usePaged(rows, [f]);
  const suggested = () => { const c = clients.find((x) => String(x.id) === clientId); if (c) setSeeds((data?.suggestedKeywords?.[c.cluster] ?? []).join("\n")); };
  async function discover() {
    setBusy(true); setErr(null); setMsg(null);
    try { const r = await post("/prospects/discover", { clientId: Number(clientId), limit, perQuery, seeds: seeds.split("\n").map((s) => s.trim()).filter(Boolean) }); setMsg(r.note ?? `Found ${r.created} new prospect(s) (${r.source} scoring)${r.aiError ? ` — AI failed: ${r.aiError}` : ""}.`); reload(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  const act = async (fn: () => Promise<any>, ok?: string) => { try { const r = await fn(); if (ok) setMsg(ok); reload(); return r; } catch (e: any) { setErr(e.message); } };
  return (
    <>
      <PageHeader title="Prospects" description="Sites worth contacting: track who you reached out to, when to follow up, and turn a win into a link." actions={<><RefreshButton onClick={reload} loading={loading} /><Button onClick={() => setManual(true)}>Add prospect</Button></>} />
      <div className="mb-4 flex items-center gap-2 text-xs text-zinc-600">
        <Badge tone={ai?.configured ? "green" : "amber"}>{ai?.configured ? "AI ready" : "AI not configured"}</Badge>
        <span>Model {ai?.model} · web search {ai?.webSearch ? "enabled" : "off"} · {ai?.provider}</span>
      </div>
      {(error || err) && <div className="mb-4"><ErrorBanner message={(error || err)!} onRetry={reload} /></div>}
      {msg && <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800">{msg}</div>}
      <Card className="mb-6 p-5">
        <h2 className="mb-3 text-sm font-semibold">Discover prospects</h2>
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Client"><Select value={clientId} onChange={setClientId} placeholder="Select client" options={clients.map((c) => ({ value: c.id, label: c.name }))} /></Field>
          <Field label="Limit (1–50)"><Input type="number" min={1} max={50} value={limit} onChange={(e) => setLimit(Math.min(50, Math.max(1, Number(e.target.value))))} /></Field>
          <Field label="Results per query (1–10)"><Input type="number" min={1} max={10} value={perQuery} onChange={(e) => setPerQuery(Math.min(10, Math.max(1, Number(e.target.value))))} /></Field>
          <div className="flex items-end gap-2"><Button disabled={!clientId || busy} onClick={discover}>{busy ? "Searching…" : "Find prospects"}</Button><Button variant="outline" onClick={() => { setM({ ...m, clientId }); setManual(true); }}>Add manually</Button></div>
        </div>
        <div className="mt-3"><div className="mb-1 flex items-center justify-between"><span className="text-xs font-medium text-zinc-600">Seed keywords (one per line)</span><Button size="sm" variant="ghost" disabled={!clientId} onClick={suggested}>Use suggested keywords</Button></div>
          <Textarea rows={3} value={seeds} onChange={(e) => setSeeds(e.target.value)} placeholder={'construction staffing blog "write for us"'} /></div>
      </Card>
      <Panel>
        <FilterBar dirty={Object.values(f).some(Boolean)} onClear={() => setF({ q: "", client: "", status: "", min: "" })}>
          <Input className="w-56" placeholder="Search prospects…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
          <Select className="w-40" value={f.client} onChange={(v) => setF({ ...f, client: v })} placeholder="All clients" options={clients.map((c) => ({ value: c.id, label: c.name }))} />
          <Select className="w-36" value={f.status} onChange={(v) => setF({ ...f, status: v })} placeholder="All statuses" options={STATUSES.map((s) => ({ value: s, label: s }))} />
          <Select className="w-32" value={f.min} onChange={(v) => setF({ ...f, min: v })} placeholder="Min score" options={[40, 60, 70, 80].map((n) => ({ value: n, label: `${n}+` }))} />
        </FilterBar>
        {loading && !data ? <TableSkeleton /> : !rows.length ? <EmptyState title="No prospects yet" hint="Pick a client above and run discovery, or add one manually." /> : (
          <Table><THead cols={["Score", "Prospect", "Outreach", "Status", ""]} />
            <tbody>{pg.slice.map((r) => (
              <tr key={r.id}>
                <td><div className="text-lg font-semibold">{r.score}</div><Badge tone={labelTone(r.label) as any}>{r.label}</Badge></td>
                <td className="max-w-xl"><div className="font-medium">{r.domain} <span className="font-normal text-zinc-500">· {r.client?.name}</span></div>
                  <div className="text-sm">{r.pageTitle}</div><Sub>{r.snippet}</Sub>
                  <Sub>{r.whyItScored} · {fmtDate(r.discoveredAt)} · <Badge>{r.scoreSource === "ai" ? "AI score" : "heuristic score"}</Badge>{r.matchedKeyword && ` · kw: ${r.matchedKeyword}`}{r.sourceQuery && ` · via ${r.sourceQuery}`}</Sub></td>
                <td className="min-w-44 text-sm">
                  {r.contactName || r.contactEmail ? <div>{r.contactName}<Sub>{r.contactEmail}</Sub></div> : <span className="text-zinc-400">No contact yet</span>}
                  {r.owner && <Sub>Owner: {r.owner}</Sub>}
                  {r.lastContactedAt && <Sub>Contacted {fmtDate(r.lastContactedAt)}</Sub>}
                  {r.followUpAt && r.status !== "Won" && r.status !== "Rejected" && (new Date(r.followUpAt) <= new Date() ? <Badge tone="red">Follow up due</Badge> : <Sub>Follow up {fmtDate(r.followUpAt)}</Sub>)}
                  {r.linkId && <Badge tone="green">Link created</Badge>}
                </td>
                <td><Select className="h-8 w-32" value={r.status} onChange={(v) => act(() => put(`/prospects/${r.id}`, { status: v }))} options={STATUSES.map((s) => ({ value: s, label: s }))} /></td>
                <td className="whitespace-nowrap"><div className="flex gap-1">
                  <Button size="sm" variant="ghost" asChild><a href={r.pageUrl ?? `https://${r.domain}`} target="_blank" rel="noreferrer">Open</a></Button>
                  <Button size="sm" variant="outline" onClick={() => setOutreach(r)}>Outreach</Button>
                  {!r.linkId && <Button size="sm" variant="outline" onClick={() => setLinkFor(r)}>Create link</Button>}
                  <Button size="sm" variant="outline" onClick={() => act(() => put(`/prospects/${r.id}`, { status: "Shortlisted" }))}>Shortlist</Button>
                  <Button size="sm" onClick={() => act(() => post(`/prospects/${r.id}/promote`), `${r.domain} added as donor — run Sync from Ahrefs on Donors to fill metrics.`)}>Add as donor</Button>
                  <Button size="sm" variant="ghost" onClick={() => act(() => del(`/prospects/${r.id}`))}>✕</Button></div></td>
              </tr>
            ))}</tbody></Table>
        )}
        <Pager p={pg} />
      </Panel>
      <OutreachDialog prospect={outreach} onClose={() => setOutreach(null)} onSaved={() => { setMsg("Outreach saved."); reload(); }} />
      <CreateLinkDialog prospect={linkFor} client={clients.find((c) => c.id === linkFor?.clientId) ?? null} onClose={() => setLinkFor(null)} onCreated={reload} />
      <Dialog open={manual} onOpenChange={setManual} title="Add prospect" description="Scored with the heuristic scorer (keyword hits, guest-post signals, TLD, location).">
        <div className="space-y-3">
          <Field label="Client *"><Select value={m.clientId} onChange={(v) => setM({ ...m, clientId: v })} placeholder="Select client" options={clients.map((c) => ({ value: c.id, label: c.name }))} /></Field>
          <Field label="Domain *"><Input value={m.domain} onChange={(e) => setM({ ...m, domain: e.target.value })} placeholder="blog.example.com" /></Field>
          <Field label="Page title"><Input value={m.pageTitle} onChange={(e) => setM({ ...m, pageTitle: e.target.value })} /></Field>
          <Field label="Snippet"><Textarea rows={2} value={m.snippet} onChange={(e) => setM({ ...m, snippet: e.target.value })} /></Field>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setManual(false)}>Cancel</Button>
            <Button disabled={!m.clientId || !m.domain} onClick={async () => { await act(() => post("/prospects", { clientId: Number(m.clientId), domain: m.domain, pageTitle: m.pageTitle || null, snippet: m.snippet || null })); setManual(false); setM({ clientId: "", domain: "", pageTitle: "", snippet: "" }); }}>Add</Button></div>
        </div>
      </Dialog>
    </>
  );
}
