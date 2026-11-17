import { pgTable, text, integer, serial, boolean, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const created = () => ts("created_at").notNull().$defaultFn(() => new Date());
const json = <T>(name: string) => jsonb(name).$type<T>();

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  role: text("role").notNull().default("user"), // "admin" | "user"
  active: boolean("active").notNull().default(true),
  invitedBy: integer("invited_by"),
  lastLoginAt: ts("last_login_at"),
  createdAt: created(),
});

export const loginCodes = pgTable("login_codes", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  codeHash: text("code_hash").notNull(),
  expiresAt: ts("expires_at").notNull(),
  attempts: integer("attempts").notNull().default(0),
  usedAt: ts("used_at"),
  createdAt: created(),
});

export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
  slug: text("slug").notNull().unique(),
  cluster: text("cluster").notNull(),
  city: text("city"), state: text("state"),
  isCashBuyer: boolean("is_cash_buyer").notNull().default(false),
  defaultMonthlyTarget: integer("default_monthly_target").notNull().default(4),
  gbpName: text("gbp_name"), gbpAddress: text("gbp_address"), gbpPhone: text("gbp_phone"),
  createdAt: created(),
});

export const clientMonthTargets = pgTable("client_month_targets", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  month: text("month").notNull(),
  target: integer("target").notNull(),
}, (t) => ({ uq: uniqueIndex("cmt_uq").on(t.clientId, t.month) }));

export const workspaceMonthTargets = pgTable("workspace_month_targets", {
  month: text("month").primaryKey(),
  target: integer("target").notNull(),
});

export const targetPages = pgTable("target_pages", {
  id: serial("id").primaryKey(),
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

export const donors = pgTable("donors", {
  id: serial("id").primaryKey(),
  domain: text("domain").notNull().unique(), name: text("name"),
  dr: integer("dr").notNull().default(0),
  usTrafficPct: integer("us_traffic_pct").notNull().default(0),
  organicTraffic: integer("organic_traffic").notNull().default(0),
  referringDomains: integer("referring_domains").notNull().default(0),
  linkedDomains: integer("linked_domains").notNull().default(0),
  cluster: text("cluster").notNull(), niche: text("niche"),
  isLocal: boolean("is_local").notNull().default(false),
  localArea: text("local_area"),
  lastUsedAt: ts("last_used_at"), ahrefsSyncedAt: ts("ahrefs_synced_at"),
  trafficHistory: json<number[]>("traffic_history"),
  flags: json<Record<string, boolean>>("flags"),
  createdAt: created(),
});

export const links = pgTable("links", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  targetPageId: integer("target_page_id").references(() => targetPages.id, { onDelete: "set null" }),
  donorId: integer("donor_id").notNull().references(() => donors.id),
  sourceUrl: text("source_url").notNull(), targetUrl: text("target_url").notNull(),
  anchorText: text("anchor_text").notNull().default(""),
  anchorType: text("anchor_type").notNull().default("Natural"),
  placement: text("placement").notNull().default("Unknown"),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
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

export const checkRuns = pgTable("check_runs", {
  id: serial("id").primaryKey(),
  linkId: integer("link_id").notNull().references(() => links.id, { onDelete: "cascade" }),
  ranAt: ts("ran_at").notNull().$defaultFn(() => new Date()),
  httpStatus: integer("http_status"),
  linkFound: boolean("link_found"),
  rel: json<string[]>("rel"), anchorFound: text("anchor_found"),
  targetMatched: boolean("target_matched"),
  indexed: boolean("indexed"),
  placementDetected: text("placement_detected"), outboundLinks: integer("outbound_links"),
  result: text("result"), error: text("error"),
});

export const citations = pgTable("citations", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  directory: text("directory").notNull(),
  name: text("name").notNull(), address: text("address").notNull(), phone: text("phone").notNull(),
  gbpMatch: text("gbp_match").notNull().default("Mismatch"),
  status: text("status").notNull().default("Logged"),
  updatedAt: ts("updated_at").notNull().$defaultFn(() => new Date()),
});

export const prospects = pgTable("prospects", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  domain: text("domain").notNull(), pageUrl: text("page_url"), pageTitle: text("page_title"), snippet: text("snippet"),
  score: integer("score").notNull().default(0), label: text("label").notNull().default("Not"),
  whyItScored: text("why_it_scored"), matchedKeyword: text("matched_keyword"), sourceQuery: text("source_query"),
  scoreSource: text("score_source").notNull().default("heuristic"),
  status: text("status").notNull().default("New"),
  // outreach tracking
  contactName: text("contact_name"), contactEmail: text("contact_email"), owner: text("owner"), notes: text("notes"),
  lastContactedAt: ts("last_contacted_at"), followUpAt: ts("follow_up_at"),
  linkId: integer("link_id").references(() => links.id, { onDelete: "set null" }),
  discoveredAt: ts("discovered_at").notNull().$defaultFn(() => new Date()),
});

export const haroRequests = pgTable("haro_requests", {
  id: serial("id").primaryKey(),
  rawEmail: text("raw_email").notNull(),
  outlet: text("outlet"), journalist: text("journalist"), category: text("category"), title: text("title"),
  question: text("question"), requirements: text("requirements"), deadline: ts("deadline"),
  status: text("status").notNull().default("New"),
  matches: json<{ clientId: number; score: number; why: string }[]>("matches"),
  responses: json<{ clientId: number; draft: string; sentAt?: number | null }[]>("responses"),
  createdAt: created(),
  updatedAt: ts("updated_at").notNull().$defaultFn(() => new Date()),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: json<unknown>("value"),
});
