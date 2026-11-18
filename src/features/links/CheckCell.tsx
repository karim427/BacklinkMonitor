import { PRE_LIVE } from "@server/services/constants";
import { Sub, VerdictBadge } from "@/features/shared/common";
import { fmtDate, ruleLabel } from "@/lib/utils";

/** One simple answer for a link: its result and the main reason. Everything else lives in "Page check". */
export function CheckCell({ l, onDetails }: { l: any; onDetails: () => void }) {
  const grey = (t: string) => <span className="inline-flex items-center rounded-md border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">{t}</span>;
  if (l.action === "REJECTED") return <><VerdictBadge v="Not relevant" /><Sub>Rejected by hand</Sub></>;
  if (PRE_LIVE.includes(l.action)) return <>{grey("Not live yet")}<Sub>{l.lastCheckedAt ? "Not on the page yet" : "Checked once it is live"}</Sub></>;
  if (l.verificationStatus === "Error") return <><span className="inline-flex items-center rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Couldn't check</span><Sub><span className="line-clamp-2">{l.lastError ?? "The page could not be read"}</span></Sub></>;
  if (!l.lastCheckedAt || l.verdict === "Not judged") return <>{grey("Not checked yet")}<Sub>Click Verify now</Sub></>;
  const reasons: string[] = (l.rejectReasons ?? []).filter((c: string) => c !== "donor_metrics_missing");
  return (
    <>
      <VerdictBadge v={l.verdict} />
      {l.verdict !== "Relevant" && !!reasons.length && <div title={reasons.map(ruleLabel).join("\n")} className="mt-1"><Sub><span className="line-clamp-2">{ruleLabel(reasons[0])}{reasons.length > 1 ? ` (+${reasons.length - 1} more)` : ""}</span></Sub></div>}
      <Sub>Checked {fmtDate(l.lastCheckedAt)}</Sub>
      {l.sourceCheck?.scored && <button type="button" onClick={onDetails} className="mt-0.5 text-xs text-blue-600 hover:underline">Details</button>}
    </>
  );
}
