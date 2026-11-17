import { monthLabel, ruleLabel } from "@/lib/utils";
import { PRE_LIVE } from "@server/services/constants";

export const STATUS_LABEL: Record<string, string> = { PENDING: "Pending", IN_PROCESS: "In process", LIVE: "Live", REPLACE: "Replace", LOST: "Lost", REJECTED: "Rejected" };
const day = (d: any) => (d ? new Date(d).toISOString().slice(0, 10) : "");

export interface ExportColumn { key: string; label: string; get: (l: any) => string | number | null | undefined; on: boolean }
/** What can go into the file. `on` is the default tick. */
export const COLUMNS: ExportColumn[] = [
  { key: "client", label: "Client", get: (l) => l.client?.name, on: true },
  { key: "month", label: "Month", get: (l) => monthLabel(l.month), on: true },
  { key: "sourceUrl", label: "Link from (page URL)", get: (l) => l.sourceUrl, on: true },
  { key: "anchor", label: "Anchor text", get: (l) => l.anchorText, on: true },
  { key: "targetUrl", label: "Link to (client URL)", get: (l) => l.targetUrl, on: true },
  { key: "status", label: "Status", get: (l) => STATUS_LABEL[l.action] ?? l.action, on: true },
  { key: "addedBy", label: "Added by", get: (l) => l.reviewer, on: true },
  { key: "placed", label: "Placed date", get: (l) => day(l.placedAt), on: true },
  { key: "dr", label: "Donor DR", get: (l) => (l.donor && (l.donor.dr || l.donor.ahrefsSyncedAt) ? l.donor.dr : ""), on: true },
  { key: "donor", label: "Donor site", get: (l) => l.donor?.domain, on: false },
  { key: "anchorType", label: "Anchor type", get: (l) => l.anchorType, on: false },
  { key: "verdict", label: "Verdict", get: (l) => (PRE_LIVE.includes(l.action) ? "Not live yet" : l.verdict === "Not judged" ? "Needs donor numbers" : l.verdict), on: false },
  { key: "reasons", label: "Problems found", get: (l) => (l.rejectReasons ?? []).map(ruleLabel).join("; "), on: false },
  { key: "lastChecked", label: "Last checked", get: (l) => day(l.lastCheckedAt), on: false },
  { key: "nextCheck", label: "Next check", get: (l) => day(l.nextCheckAt), on: false },
  { key: "notes", label: "Notes", get: (l) => l.notes, on: false },
];

/** One CSV cell. A leading = + - @ would be run as a formula by Excel/Sheets, so it is neutralised. */
export function csvCell(v: unknown): string {
  let t = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return `"${t.replace(/"/g, '""')}"`;
}

export function buildCsv(links: any[], columns: ExportColumn[]): string {
  const head = columns.map((c) => csvCell(c.label)).join(",");
  const lines = links.map((l) => columns.map((c) => csvCell(c.get(l))).join(","));
  return "﻿" + [head, ...lines].join("\r\n"); // BOM so Excel reads accents correctly
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "all";
