import * as React from "react";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { Badge, Button, Card, Select, Skeleton, type Tone } from "@/components/ui/primitives";
import { cn, monthLabel, shiftMonth } from "@/lib/utils";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-zinc-500">{description}</p>}</div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Kpi({ label, value, sub, tone, onClick, active, loading }: {
  label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "blue" | "red" | "amber" | "green"; onClick?: () => void; active?: boolean; loading?: boolean;
}) {
  const color = { blue: "text-blue-600", red: "text-red-600", amber: "text-amber-600", green: "text-green-600" }[tone ?? "blue"];
  const C: any = onClick ? "button" : "div";
  return (
    <C onClick={onClick} className={cn("rounded-xl border bg-white p-4 text-left", onClick && "transition hover:border-zinc-400", active ? "border-black ring-1 ring-black" : "border-zinc-200")}>
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      {loading ? <Skeleton className="mt-2 h-7 w-16" /> : <p className={cn("mt-1 text-2xl font-semibold", tone ? color : "text-zinc-900")}>{value}</p>}
      {sub && <p className="mt-0.5 text-xs text-zinc-500">{sub}</p>}
    </C>
  );
}
export const KpiRow = ({ children, cols = 4 }: { children: React.ReactNode; cols?: number }) => (
  <div className={cn("mb-6 grid gap-3 grid-cols-2", cols === 6 ? "lg:grid-cols-6" : cols === 5 ? "lg:grid-cols-5" : cols === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4")}>{children}</div>
);

export function MonthPicker({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-white">
      <Button variant="ghost" size="icon" aria-label="Previous month" onClick={() => onChange(shiftMonth(month, -1))}><ChevronLeft className="h-4 w-4" /></Button>
      <span className="min-w-32 text-center text-sm font-medium">{monthLabel(month)}</span>
      <Button variant="ghost" size="icon" aria-label="Next month" onClick={() => onChange(shiftMonth(month, 1))}><ChevronRight className="h-4 w-4" /></Button>
    </div>
  );
}
export const RefreshButton = ({ onClick, loading }: { onClick: () => void; loading?: boolean }) => (
  <Button variant="outline" onClick={onClick}><RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />Refresh</Button>
);

/* ---- badges ---- */
export const verdictTone = (v: string): Tone => (v === "Relevant" ? "blue" : v === "Not relevant" ? "red" : v === "Not judged" ? "neutral" : "amber");
export const VerdictBadge = ({ v }: { v: string }) => <Badge tone={verdictTone(v)}>{v === "Not judged" ? "Not judged yet" : v}</Badge>;
export const StageBadge = ({ v }: { v: string }) => <Badge tone={v === "Lost" ? "red" : v === "Confirmed" ? "green" : "neutral"}>{v}</Badge>;
export const VerifBadge = ({ v }: { v: string }) => <Badge tone={v === "Verified" ? "green" : v === "Error" ? "red" : v === "Unverified" ? "neutral" : "amber"}>{v}</Badge>;
const ACTION_LABEL: Record<string, string> = { PENDING: "Pending", IN_PROCESS: "In process", LIVE: "Live", REPLACE: "Replace", LOST: "Lost", REJECTED: "Rejected" };
export const ActionBadge = ({ v }: { v: string }) => <Badge tone={v === "LIVE" ? "green" : v === "LOST" || v === "REJECTED" ? "red" : v === "PENDING" ? "neutral" : v === "IN_PROCESS" ? "blue" : "amber"}>{ACTION_LABEL[v] ?? v}</Badge>;
export const DueText = ({ due }: { due?: { label: string; overdue: boolean } | null }) =>
  due ? <span className={cn("text-xs", due.overdue ? "font-medium text-red-600" : "text-zinc-500")}>{due.label}</span> : null;

/* ---- table toolkit ---- */
export function usePaged<T>(rows: T[], deps: unknown[] = []) {
  const [page, setPage] = React.useState(0);
  const [size, setSize] = React.useState(10);
  React.useEffect(() => setPage(0), [rows.length, size, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  const start = page * size;
  return { slice: rows.slice(start, start + size), page, setPage, size, setSize, total: rows.length, start };
}
export function Pager({ p }: { p: ReturnType<typeof usePaged<any>> }) {
  const end = Math.min(p.start + p.size, p.total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 px-4 py-3 text-sm text-zinc-600">
      <span>{p.total ? `Showing ${p.start + 1}–${end} of ${p.total}` : "No results"}</span>
      <div className="flex items-center gap-2">
        <Select className="h-8 w-28" value={p.size} onChange={(v) => p.setSize(Number(v))} options={[10, 20, 50].map((n) => ({ value: n, label: `${n} / page` }))} />
        <Button variant="outline" size="sm" disabled={p.page === 0} onClick={() => p.setPage(p.page - 1)}>Prev</Button>
        <Button variant="outline" size="sm" disabled={end >= p.total} onClick={() => p.setPage(p.page + 1)}>Next</Button>
      </div>
    </div>
  );
}
export const FilterBar = ({ children, onClear, dirty }: { children: React.ReactNode; onClear?: () => void; dirty?: boolean }) => (
  <div className="grid grid-cols-1 items-center gap-3 border-b border-zinc-200 p-3 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] [&>input:not([type=checkbox])]:!w-full [&>select]:!w-full">
    {children}
    {onClear && dirty && <Button variant="ghost" size="sm" className="justify-self-start" onClick={onClear}>Clear</Button>}
  </div>
);
export const THead = ({ cols }: { cols: string[] }) => (
  <thead className="bg-zinc-50 text-left text-xs font-medium text-zinc-500">
    <tr>{cols.map((c, i) => <th key={i} className="whitespace-nowrap px-4 py-2.5">{c}</th>)}</tr>
  </thead>
);
export const Table = ({ children }: { children: React.ReactNode }) => (
  <div className="overflow-x-auto"><table className="w-full text-sm [&_td]:px-4 [&_td]:py-3 [&_tbody_tr]:border-t [&_tbody_tr]:border-zinc-100 [&_tbody_tr:hover]:bg-zinc-50/60">{children}</table></div>
);
export const TableSkeleton = ({ rows = 5 }: { rows?: number }) => (
  <div className="space-y-2 p-4">{Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
);
export const Panel = ({ children, className }: { children: React.ReactNode; className?: string }) => <Card className={cn("overflow-hidden", className)}>{children}</Card>;
export const Sub = ({ children }: { children: React.ReactNode }) => <div className="text-xs text-zinc-500">{children}</div>;
export const ext = (u: string) => <a href={u} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">Open ↗</a>;
