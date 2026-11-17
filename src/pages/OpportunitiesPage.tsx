import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, Card, EmptyState, ErrorBanner, Input, Select } from "@/components/ui/primitives";
import { post, put, useApi } from "@/lib/api";
import { PageHeader, Panel, Sub, Table, TableSkeleton, THead } from "@/features/shared/common";
import { UnitsNote } from "@/features/ahrefs/UsageMeter";

/** Sites that link to a client's competitors but not to the client: the people to reach out to. */
export default function OpportunitiesPage() {
  const { data: cl } = useApi("/clients");
  const clients: any[] = cl?.rows ?? [];
  const [clientId, setClientId] = useState("");
  const { data, error, loading, reload } = useApi(clientId ? `/opportunities?clientId=${clientId}` : null);
  const [draft, setDraft] = useState(""); const [comps, setComps] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null);
  const [suggest, setSuggest] = useState<any[]>([]); const [pick, setPick] = useState<Set<string>>(new Set());
  useEffect(() => { if (data) setComps(data.competitors); }, [data]);
  useEffect(() => { setSuggest([]); setPick(new Set()); setMsg(null); setErr(null); }, [clientId]);
  const run = data?.run; const rows: any[] = run?.rows ?? [];

  async function saveComps(next: string[]) { setErr(null); try { const r = await put("/opportunities/competitors", { clientId: Number(clientId), domains: next }); setComps(r.competitors); reload(); } catch (e: any) { setErr(e.message); } }
  async function doSuggest() { setBusy("suggest"); setErr(null); try { setSuggest((await post("/opportunities/suggest", { clientId: Number(clientId) })).suggestions); } catch (e: any) { setErr(e.message); } finally { setBusy(null); } }
  async function find() {
    if (!window.confirm(`This asks Ahrefs about the client and ${comps.length} competitor${comps.length === 1 ? "" : "s"}: ${comps.length + 1} requests, at least ${((comps.length + 1) * 50).toLocaleString("en-US")} Ahrefs units in total. Continue?`)) return;
    setBusy("find"); setErr(null); setMsg(null);
    try { const r = await post("/opportunities/find", { clientId: Number(clientId) }); setMsg(`Done: ${r.rows.length} sites link to your competitors but not to the client (${r.requests} Ahrefs requests).`); setPick(new Set()); reload(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  }
  async function addProspects() {
    setBusy("add"); setErr(null);
    try { const r = await post("/opportunities/prospects", { clientId: Number(clientId), domains: [...pick] }); setMsg(`${r.added} added to Prospects${r.skipped ? `, ${r.skipped} already there` : ""}.`); setPick(new Set()); reload(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  }
  const addComp = (d: string) => { const v = d.trim(); if (v) saveComps([...new Set([...comps, v])]); setDraft(""); };
  const togglePick = (d: string) => setPick((p) => { const n = new Set(p); n.has(d) ? n.delete(d) : n.add(d); return n; });
  const selectable = rows.filter((r) => !r.isProspect);

  return (
    <>
      <PageHeader title="Opportunities" description="Find sites that link to your competitors but not to your client, then send them to Prospects for outreach." />
      {(error || err) && <div className="mb-4"><ErrorBanner message={(error || err)!} onRetry={reload} /></div>}
      {msg && <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800">{msg}</div>}
      <Card className="mb-4 p-5">
        <div className="max-w-sm"><p className="mb-1 text-xs font-medium text-zinc-600">Client</p>
          <Select value={clientId} onChange={setClientId} placeholder="Choose a client" options={clients.map((c) => ({ value: c.id, label: c.name }))} /></div>
        {clientId && (
          <div className="mt-4">
            <p className="mb-1 text-xs font-medium text-zinc-600">Competitors to compare with (up to 10)</p>
            <div className="mb-2 flex flex-wrap gap-2">{comps.map((c) => <span key={c} className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-sm">{c}<button aria-label={`Remove ${c}`} className="text-zinc-400 hover:text-zinc-800" onClick={() => saveComps(comps.filter((x) => x !== c))}>×</button></span>)}
              {!comps.length && <span className="text-sm text-zinc-500">None yet. Add the websites of companies competing for the same customers.</span>}</div>
            <form className="flex max-w-lg gap-2" onSubmit={(e) => { e.preventDefault(); addComp(draft); }}>
              <Input placeholder="competitor.com" value={draft} onChange={(e) => setDraft(e.target.value)} /><Button variant="outline" disabled={!draft.trim()}>Add</Button>
              <Button type="button" variant="outline" disabled={busy === "suggest" || !data?.hasKey} onClick={doSuggest} title="Asks Ahrefs who ranks for the same searches (uses units)">{busy === "suggest" ? "Asking…" : "Suggest"}</Button>
            </form>
            {!!suggest.length && <div className="mt-3 rounded-lg border border-zinc-200 p-3"><p className="mb-2 text-xs font-medium text-zinc-600">Ahrefs suggests (click to add)</p>
              <div className="flex flex-wrap gap-2">{suggest.filter((s) => !comps.includes(s.domain)).map((s) => <button key={s.domain} className="rounded-full border border-zinc-200 px-3 py-1 text-sm hover:bg-zinc-50" onClick={() => addComp(s.domain)}>{s.domain}{s.dr != null && <span className="ml-1 text-xs text-zinc-500">DR {s.dr}</span>}</button>)}</div></div>}
            <div className="mt-4 flex items-center gap-3">
              <Button disabled={busy === "find" || !comps.length || !data?.hasKey} onClick={find}>{busy === "find" ? "Asking Ahrefs…" : "Find link gaps"}</Button>
              {!data?.hasKey ? <span className="text-xs text-zinc-500">Add your Ahrefs key in Settings first.</span> : <UnitsNote cost={`Costs at least ${((comps.length + 1) * 50).toLocaleString("en-US")} units`} />}
              {run && <span className="text-xs text-zinc-500">Last run {new Date(run.at).toLocaleDateString()} · compared with {comps.length} competitor{comps.length === 1 ? "" : "s"}</span>}
            </div>
          </div>)}
      </Card>

      {clientId && (loading && !data ? <TableSkeleton /> : !run ? <Panel><EmptyState title="No results yet" hint="Add competitors and click Find link gaps." /></Panel> : (
        <Panel>
          {!!run.errors.length && <p className="border-b border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">{run.errors.slice(0, 2).join(" · ")}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3">
            <p className="text-sm text-zinc-600"><b>{rows.length}</b> sites link to your competitors but not to this client. Ranked by how many competitors they link to.</p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setPick(new Set(selectable.slice(0, 25).map((r) => r.domain)))}>Select top 25</Button>
              <Button variant="ghost" size="sm" onClick={() => setPick(new Set())}>None</Button>
              <Button disabled={!pick.size || busy === "add"} onClick={addProspects}>{busy === "add" ? "Adding…" : `Add ${pick.size || ""} to Prospects`}</Button>
              <Button variant="outline" asChild><Link to="/prospects">Open Prospects</Link></Button>
            </div>
          </div>
          {!rows.length ? <EmptyState title="No gaps found" hint="Every strong site that links to these competitors already links to the client, or the competitors have few backlinks." /> : (
            <Table>
              <THead cols={["", "Site", "DR", "Links to", "Links", "Status"]} />
              <tbody>{rows.map((r) => (
                <tr key={r.domain}>
                  <td><input type="checkbox" disabled={r.isProspect} checked={pick.has(r.domain)} onChange={() => togglePick(r.domain)} aria-label={`Select ${r.domain}`} /></td>
                  <td><a className="font-medium text-blue-600 hover:underline" href={`https://${r.domain}`} target="_blank" rel="noreferrer">{r.domain}</a></td>
                  <td>{r.dr ?? "—"}</td>
                  <td><Badge tone={r.competitorCount > 1 ? "blue" : "neutral"}>{r.competitorCount} competitor{r.competitorCount === 1 ? "" : "s"}</Badge><Sub>{r.competitors.join(", ")}</Sub></td>
                  <td>{r.links}</td>
                  <td>{r.isProspect ? <Badge tone="green">In Prospects</Badge> : r.isDonor ? <Badge>Already a donor</Badge> : <span className="text-zinc-400">New</span>}</td>
                </tr>))}</tbody>
            </Table>)}
        </Panel>))}
    </>
  );
}
