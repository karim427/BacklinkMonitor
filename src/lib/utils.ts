import { RULE_BY_CODE } from "@server/services/constants";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export const cn = (...i: ClassValue[]) => twMerge(clsx(i));

export const fmtNum = (n: number | null | undefined) => (n ?? 0).toLocaleString("en-US");
export const fmtDate = (d: string | number | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
/** Today as YYYY-MM-DD in the browser's own timezone (used as the max for "placed at"). */
export const todayLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export const toDateInput = (d?: string | number | Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");
export const monthLabel = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
};
export const shiftMonth = (m: string, n: number) => {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
export const currentMonth = () => { const d = new Date(); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
export const daysUntil = (d: string | number | Date | null | undefined) => {
  if (!d) return null;
  const n = Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000);
  return n < 0 ? `${-n}d overdue` : n === 0 ? "today" : `in ${n}d`;
};
export const downloadText = (name: string, text: string, type = "text/csv") => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); URL.revokeObjectURL(a.href);
};

/** Human-readable reject reason. Never shows a raw code like "link_footer_sidebar_bio". */
export const ruleLabel = (code: string) => {
  const r = RULE_BY_CODE[code]?.label;
  if (r) return r;
  const t = code.replace(/_/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};
