import { sqliteTable, text, integer, real, uniqueIndex } from "drizzle-orm/sqlite-core";

const ts = (name: string) => integer(name, { mode: "timestamp_ms" });
const created = () => ts("created_at").notNull().$defaultFn(() => new Date());
const json = <T>(name: string) => text(name, { mode: "json" }).$type<T>();

export const clients = sqliteTable("clients", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
  slug: text("slug").notNull().unique(),
  cluster: text("cluster").notNull(),
  city: text("city"), state: text("state"),
  isCashBuyer: integer("is_cash_buyer", { mode: "boolean" }).notNull().default(false),
  defaultMonthlyTarget: integer("default_monthly_target").notNull().default(4),
  gbpName: text("gbp_name"), gbpAddress: text("gbp_address"), gbpPhone: text("gbp_phone"),
  createdAt: created(),
});

export const clientMonthTargets = sqliteTable("client_month_targets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  month: text("month").notNull(),
  target: integer("target").notNull(),
}, (t) => ({ uq: uniqueIndex("cmt_uq").on(t.clientId, t.month) }));

export const workspaceMonthTargets = sqliteTable("workspace_month_targets", {
  month: text("month").primaryKey(),
  target: integer("target").notNull(),
});

export const targetPages = sqliteTable("target_pages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  url: text("url").notNull(), keyword: text("keyword").notNull(),
  currentRDs: integer("current_rds").notNull().default(0),
  rdsNeeded: integer("rds_needed").notNull().default(0),
  linksNeeded: integer("links_needed").notNull().default(0),
  monthsToClose: integer("months_to_close").notNull().default(0),
  status: text("status").notNull().default("Pending"),
  approvalMonth: text("approval_month"),
  createdAt: created(),
});

export const donors = sqliteTable("donors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  domain: text("domain").notNull().unique(), name: text("name"),
  dr: integer("dr").notNull().default(0),
  usTrafficPct: integer("us_traffic_pct").notNull().default(0),
  organicTraffic: integer("organic_traffic").notNull().default(0),
  referringDomains: integer("referring_domains").notNull().default(0),
  linkedDomains: integer("linked_domains").notNull().default(0),
  cluster: text("cluster").notNull(), niche: text("niche"),
  isLocal: integer("is_local", { mode: "boolean" }).notNull().default(false),
  localArea: text("local_area"),
  lastUsedAt: ts("last_used_at"), ahrefsSyncedAt: ts("ahrefs_synced_at"),
  trafficHistory: json<number[]>("traffic_history"),
  flags: json<Record<string, boolean>>("flags"),
  createdAt: created(),
});

export const links = sqliteTable("links", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  targetPageId: integer("target_page_id").references(() => targetPages.id, { onDelete: "set null" }),
  donorId: integer("donor_id").notNull().references(() => donors.id),
  sourceUrl: text("source_url").notNull(), targetUrl: text("target_url").notNull(),
  anchorText: text("anchor_text").notNull().default(""),
  anchorType: text("anchor_type").notNull().default("Natural"),
  placement: text("placement").notNull().default("Unknown"),
  reviewer: text("reviewer"), placedAt: ts("placed_at"), notes: text("notes"),
  verdict: text("verdict").notNull().default("Partly relevant"),
  stage: text("stage").notNull().default("Intake"),
  verificationStatus: text("verification_status").notNull().default("Unverified"),
  action: text("action").notNull().default("LIVE"),
  rejectReasons: json<string[]>("reject_reasons").$defaultFn(() => []),
  lastCheckedAt: ts("last_checked_at"), nextCheckAt: ts("next_check_at"), nextCheckKind: text("next_check_kind"),
  fixWindowEndsAt: ts("fix_window_ends_at"),
  createdAt: created(),
});

export const checkRuns = sqliteTable("check_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  linkId: integer("link_id").notNull().references(() => links.id, { onDelete: "cascade" }),
  ranAt: ts("ran_at").notNull().$defaultFn(() => new Date()),
  httpStatus: integer("http_status"),
  linkFound: integer("link_found", { mode: "boolean" }),
  rel: json<string[]>("rel"), anchorFound: text("anchor_found"),
  targetMatched: integer("target_matched", { mode: "boolean" }),
  indexed: integer("indexed", { mode: "boolean" }),
  placementDetected: text("placement_detected"), outboundLinks: integer("outbound_links"),
  result: text("result"), error: text("error"),
});

export const citations = sqliteTable("citations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  directory: text("directory").notNull(),
  name: text("name").notNull(), address: text("address").notNull(), phone: text("phone").notNull(),
  gbpMatch: text("gbp_match").notNull().default("Mismatch"),
  status: text("status").notNull().default("Logged"),
  updatedAt: ts("updated_at").notNull().$defaultFn(() => new Date()),
});

export const prospects = sqliteTable("prospects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  domain: text("domain").notNull(), pageUrl: text("page_url"), pageTitle: text("page_title"), snippet: text("snippet"),
  score: integer("score").notNull().default(0), label: text("label").notNull().default("Not"),
  whyItScored: text("why_it_scored"), matchedKeyword: text("matched_keyword"), sourceQuery: text("source_query"),
  scoreSource: text("score_source").notNull().default("heuristic"),
  status: text("status").notNull().default("New"),
  discoveredAt: ts("discovered_at").notNull().$defaultFn(() => new Date()),
});

export const haroRequests = sqliteTable("haro_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  rawEmail: text("raw_email").notNull(),
  outlet: text("outlet"), journalist: text("journalist"), category: text("category"), title: text("title"),
  question: text("question"), requirements: text("requirements"), deadline: ts("deadline"),
  status: text("status").notNull().default("New"),
  matches: json<{ clientId: number; score: number; why: string }[]>("matches"),
  responses: json<{ clientId: number; draft: string; sentAt?: number | null }[]>("responses"),
  createdAt: created(),
  updatedAt: ts("updated_at").notNull().$defaultFn(() => new Date()),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: json<unknown>("value"),
});
