import { useState } from "react";
import { put } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ActionBadge } from "@/features/shared/common";
import { cn } from "@/lib/utils";

const OPTIONS = [{ value: "PENDING", label: "Pending" }, { value: "IN_PROCESS", label: "In process" }, { value: "LIVE", label: "Live" }, { value: "REJECTED", label: "Rejected" }];
const LABEL: Record<string, string> = { PENDING: "Pending", IN_PROCESS: "In process", LIVE: "Live", REPLACE: "Replace", LOST: "Lost", REJECTED: "Rejected" };
const TONE: Record<string, string> = {
  PENDING: "border-zinc-200 bg-zinc-100 text-zinc-700", IN_PROCESS: "border-blue-200 bg-blue-50 text-blue-700", LIVE: "border-green-200 bg-green-50 text-green-700",
  REPLACE: "border-amber-200 bg-amber-50 text-amber-800", LOST: "border-red-200 bg-red-50 text-red-700", REJECTED: "border-red-200 bg-red-50 text-red-700",
};

/** A link's status as a dropdown. Admins can change any link; users only the ones they added. Replace and Lost are set by the checks, not by hand. */
export function StatusSelect({ link, onChanged }: { link: any; onChanged: () => void }) {
  const { user, isAdmin } = useAuth();
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const canEdit = isAdmin || (!!user && link.createdBy === user.id);
  if (!canEdit) return <ActionBadge v={link.action} />;
  const options = OPTIONS.some((o) => o.value === link.action) ? OPTIONS : [{ value: link.action, label: LABEL[link.action] ?? link.action }, ...OPTIONS];
  async function change(v: string) {
    if (v === link.action) return;
    setBusy(true); setErr(null);
    try { await put(`/links/${link.id}`, v === "LIVE" ? { action: v, autoVerify: true } : { action: v }); onChanged(); } // going Live runs the relevance check right away
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <div>
      <select aria-label="Link status" disabled={busy} value={link.action} onChange={(e) => change(e.target.value)}
        className={cn("cursor-pointer rounded-md border px-2 py-0.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-zinc-300 disabled:opacity-50", TONE[link.action] ?? TONE.PENDING)}>
        {options.map((o) => <option key={o.value} value={o.value} disabled={o.value === link.action && !OPTIONS.some((x) => x.value === o.value)}>{o.label}</option>)}
      </select>
      {err && <div className="mt-1 max-w-40 text-xs text-red-600">{err}</div>}
    </div>
  );
}
