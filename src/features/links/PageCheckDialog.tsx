import { Link } from "react-router-dom";
import { Dialog } from "@/components/ui/overlays";
import { Button } from "@/components/ui/primitives";
import { ahrefsReadyOn } from "@server/services/sourceCheck";

const tone = (n: number) => (n >= 60 ? "text-green-700" : n >= 35 ? "text-amber-700" : "text-red-600");
const Q: Record<string, string> = { good: "Real, useful content", thin: "Thin or filler content", ai: "Generic AI-style text", spam: "Spam-like" };

/** What reading this link's exact page found: how well the page fits, how the link reads in its sentence, and the quality. */
export function PageCheckDialog({ link, onClose }: { link: any | null; onClose: () => void }) {
  const c = link?.sourceCheck;
  return (
    <Dialog open={!!link} onOpenChange={(o) => !o && onClose()} wide title="Page check" description={link?.sourceUrl}>
      {!c ? <p className="text-sm text-zinc-600">This page hasn't been read yet. Add a Firecrawl key in Settings, then click <b>Verify now</b>.</p> : (
        <div className="space-y-4 text-sm">
          {(() => { const ready = ahrefsReadyOn(c.publishedAt, link?.placedAt); const age = c.publishedAt ? Math.max(0, Math.floor((Date.now() - Date.parse(c.publishedAt)) / 86_400_000)) : null; return (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3"><p><b>Published:</b> {c.publishedAt ? `${new Date(c.publishedAt).toLocaleDateString()} (${age} day${age === 1 ? "" : "s"} ago)` : "the page doesn't say"}</p>
              {ready && (ready > new Date() ? <p className="mt-1 text-amber-800">Ahrefs needs about a month to crawl a new page or link, so it can't confirm this one before about <b>{ready.toLocaleDateString()}</b>. Our own check works right now.</p> : <p className="mt-1 text-green-700">Old enough for Ahrefs to know about it.</p>)}</div>); })()}
          <p className="text-zinc-600">Read {new Date(c.at).toLocaleDateString()} · {c.via === "firecrawl" ? "with Firecrawl (JavaScript pages and blocked pages included)" : "with a plain page fetch"}{c.title ? ` · “${c.title}”` : ""}</p>
          {c.scored ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-zinc-200 p-3"><p className="text-xs text-zinc-500">Page fits the client</p><p className={`text-2xl font-semibold ${tone(c.fit)}`}>{c.fit}<span className="text-sm font-normal text-zinc-500">/100</span></p></div>
              <div className="rounded-lg border border-zinc-200 p-3"><p className="text-xs text-zinc-500">Link reads naturally</p><p className={`text-2xl font-semibold ${c.context ? tone(c.contextFit) : "text-zinc-400"}`}>{c.context ? c.contextFit : "—"}{c.context && <span className="text-sm font-normal text-zinc-500">/100</span>}</p></div>
              <div className="rounded-lg border border-zinc-200 p-3"><p className="text-xs text-zinc-500">Content quality</p><p className={`text-base font-semibold ${c.quality === "good" ? "text-green-700" : "text-red-600"}`}>{Q[c.quality] ?? c.quality}</p></div>
            </div>) : <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-900">{c.reason} Check that your AI account has credits.</p>}
          {c.scored && c.reason && <p><b>Why:</b> {c.reason}</p>}
          <div><p className="mb-1 text-xs font-medium text-zinc-600">Where the link sits</p>
            {c.context ? <blockquote className="rounded-md border-l-4 border-zinc-300 bg-zinc-50 px-3 py-2 text-zinc-700">{c.context}</blockquote> : <p className="text-zinc-500">The link's sentence wasn't found in the page text.</p>}</div>
          <p className="text-xs text-zinc-500">A page that fits the client under 35 is rejected as an unrelated niche. Thin or AI-style pages fail the quality rule.</p>
        </div>)}
      <div className="mt-4 flex justify-end gap-2"><Button variant="outline" asChild><a href={link?.sourceUrl} target="_blank" rel="noreferrer">Open page</a></Button><Button onClick={onClose}>Close</Button></div>
    </Dialog>
  );
}
void Link;
