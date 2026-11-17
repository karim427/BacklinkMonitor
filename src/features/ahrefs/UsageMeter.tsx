import { useApi } from "@/lib/api";

export const fmtUnits = (n: number | null | undefined) => (n == null ? "?" : n.toLocaleString("en-US"));

/** How many Ahrefs units are left. Asking is free. */
export function useAhrefsUsage() { return useApi("/ahrefs/usage"); }

export function UsageMeter() {
  const { data: u, loading, reload } = useAhrefsUsage();
  if (loading && !u) return <p className="text-xs text-zinc-500">Checking your Ahrefs units…</p>;
  if (!u?.hasKey) return <p className="text-xs text-zinc-500">Add your Ahrefs key to see how many units you have left.</p>;
  if (u.error) return <p className="text-xs text-red-700">Couldn't read your Ahrefs units: {u.error}</p>;
  const pct = u.percent ?? 0; const tone = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-green-600";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs"><span className="font-medium text-zinc-700">Ahrefs units</span><button className="text-blue-600 hover:underline" onClick={reload}>Refresh</button></div>
      {u.limit == null ? <p className="text-xs text-zinc-600">{fmtUnits(u.used)} used{u.subscription ? ` · ${u.subscription} plan` : ""}. No limit reported.</p> : (
        <>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-100"><div className={`h-full ${tone}`} style={{ width: `${pct}%` }} /></div>
          <p className="mt-1 text-xs text-zinc-600"><b>{fmtUnits(u.remaining)}</b> left of {fmtUnits(u.limit)} ({pct}% used){u.resetDate ? ` · resets ${new Date(u.resetDate).toLocaleDateString()}` : ""}{u.subscription ? ` · ${u.subscription} plan` : ""}</p>
        </>)}
    </div>
  );
}

/** One line for pages that spend units: what you have left. */
export function UnitsNote({ cost }: { cost?: string }) {
  const { data: u } = useAhrefsUsage();
  if (!u?.hasKey || u.error || u.remaining == null) return null;
  return <span className="text-xs text-zinc-500">{cost ? `${cost} · ` : ""}{fmtUnits(u.remaining)} Ahrefs units left</span>;
}
