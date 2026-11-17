// Pure constants shared by server and frontend (no node-only imports).

export const CLUSTERS = ["Tech / SaaS", "Auto logistics", "Trades / freight", "Cash home buyers"] as const;
export type Cluster = (typeof CLUSTERS)[number];

export const CLUSTER_NICHES: Record<Cluster, string[]> = {
  "Tech / SaaS": ["app development", "AI", "SaaS", "HR/workforce tech", "startups"],
  "Auto logistics": ["auto transport", "automotive", "moving", "logistics"],
  "Trades / freight": ["construction", "trades", "staffing", "freight", "trucking"],
  "Cash home buyers": ["real estate", "home selling", "foreclosure", "probate", "home repair", "personal finance", "local city/state"],
};

export const CLUSTER_SEED_KEYWORDS: Record<Cluster, string[]> = {
  "Tech / SaaS": ['app development blog "write for us"', 'SaaS startup blog "guest post"', 'AI tools blog "contribute"'],
  "Auto logistics": ['auto transport blog "write for us"', 'car shipping guest post', 'logistics blog "guest post"'],
  "Trades / freight": ['construction staffing blog "write for us"', 'freight trucking blog "guest post"', 'skilled trades blog "contribute"'],
  "Cash home buyers": ['real estate investing blog "write for us"', 'home selling tips "guest post"', 'foreclosure probate blog "contribute"'],
};

/** "Not judged": we can't decide yet (the donor has no DR/traffic numbers), so the link is neither accepted nor rejected. */
export const VERDICTS = ["Relevant", "Partly relevant", "Not relevant", "Not judged"] as const;
export type Verdict = (typeof VERDICTS)[number];
export const STAGES = ["Intake", "Placed", "Indexed", "Confirmed", "Lost"] as const;
export type Stage = (typeof STAGES)[number];
export const VERIFICATION_STATUSES = ["Unverified", "Queued", "Checking", "Verified", "Error"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];
/** Where a link is in its life: Pending (planned) -> In process (placed, waiting to appear) -> Live (found on the page). After Live it is judged: Live stays Live if relevant, Replace if not, Lost if it disappears. Rejected is set by hand (the placement was turned down or dropped): never checked or rechecked. */
export const LINK_ACTIONS = ["PENDING", "IN_PROCESS", "LIVE", "REPLACE", "LOST", "REJECTED"] as const;
/** Links that are not live yet are never judged for relevance. */
export const PRE_LIVE: readonly string[] = ["PENDING", "IN_PROCESS"];
export type LinkAction = (typeof LINK_ACTIONS)[number];
export const ANCHOR_TYPES = ["Branded", "Partial", "Natural", "Exact", "Other"] as const;
export type AnchorType = (typeof ANCHOR_TYPES)[number];
export const PLACEMENTS = ["Body", "Footer", "Sidebar", "Author bio", "Unknown"] as const;
export type Placement = (typeof PLACEMENTS)[number];

export type RuleCategory = "Domain" | "Niche" | "Quality" | "Link" | "Reuse";
export interface RejectRule { code: string; category: RuleCategory; label: string; fixable?: boolean }

/** The reject list (26 original rules plus page-level checks). `fixable` rules produce "Partly relevant" + fix window instead of a hard reject. */
export const REJECT_RULES: RejectRule[] = [
  { code: "domain_spam_tld", category: "Domain", label: "Spam TLD (.shop .xyz .top .click .online .site)" },
  { code: "domain_non_us", category: "Domain", label: "Non-US TLD (.uk .ca .au .in)" },
  { code: "domain_low_us_traffic", category: "Domain", label: "Less than 60% US traffic" },
  { code: "domain_non_english", category: "Domain", label: "Non-English site" },
  { code: "domain_disavowed", category: "Domain", label: "Domain is disavowed" },
  { code: "niche_vertical", category: "Niche", label: "Banned vertical (casino, gambling, CBD, adult, pharma, payday loans, crypto/forex)" },
  { code: "niche_cluster_mismatch", category: "Niche", label: "Niche does not fit the client's cluster" },
  { code: "niche_unrelated", category: "Niche", label: "Unrelated niche" },
  { code: "niche_write_for_us", category: "Niche", label: "Multi-niche \"write for us\" site" },
  { code: "quality_dr_traffic", category: "Quality", label: "DR 40+ with under 500 monthly traffic" },
  { code: "quality_traffic_drop", category: "Quality", label: "Traffic dropped over 50% in 6 months" },
  { code: "quality_linked_vs_rd", category: "Quality", label: "Linked domains more than 2× referring domains" },
  { code: "quality_expired", category: "Quality", label: "Expired / dropped domain" },
  { code: "quality_pbn", category: "Quality", label: "Looks like a PBN" },
  { code: "quality_not_indexed", category: "Quality", label: "Page not indexed", fixable: true },
  { code: "quality_hacked", category: "Quality", label: "Hacked site" },
  { code: "quality_thin_ai", category: "Quality", label: "Thin or AI-spun content" },
  { code: "link_nofollow_paid", category: "Link", label: "Nofollow / sponsored / ugc (paid) link", fixable: true },
  { code: "link_footer_sidebar_bio", category: "Link", label: "Link in footer, sidebar or author bio" },
  { code: "link_50_outbound", category: "Link", label: "50+ outbound links on the page" },
  { code: "link_competitor", category: "Link", label: "Page also links to a competitor" },
  { code: "link_competing_cash_clients", category: "Link", label: "Two competing cash-buyer clients on the same page or city" },
  { code: "link_wrong_target", category: "Link", label: "Link points to the wrong target / redirect", fixable: true },
  { code: "link_temporary", category: "Link", label: "Temporary link" },
  { code: "link_page_nofollow", category: "Link", label: "The whole page is set to nofollow", fixable: true },
  { code: "link_sponsored_label", category: "Link", label: "Page is labelled sponsored / advertorial", fixable: true },
  { code: "quality_canonical_elsewhere", category: "Quality", label: "Page's canonical tag points to a different URL", fixable: true },
  { code: "reuse_same_client_6mo", category: "Reuse", label: "Donor reused for the same client within 6 months" },
  { code: "reuse_more_than_3_clients", category: "Reuse", label: "Donor already links to more than 3 of our clients" },
];

/** Not one of the 26 reject rules: a data gap flag. Treated as fixable so the link stays "Partly relevant" until metrics are loaded. */
export const DONOR_METRICS_MISSING: RejectRule = { code: "donor_metrics_missing", category: "Quality", label: "Not judged yet: this donor has no DR or traffic numbers. Enter them on the Donors page (Edit) or use Look up.", fixable: true };
export const RULE_BY_CODE: Record<string, RejectRule> = Object.fromEntries([...REJECT_RULES, DONOR_METRICS_MISSING].map((r) => [r.code, r]));

/** Reject codes that mean "spammy / low-quality site" (used for the monthly spam count on Rechecks). */
export const SPAM_CODES = ["domain_spam_tld", "niche_vertical", "quality_pbn", "quality_hacked", "quality_thin_ai", "quality_expired", "domain_disavowed", "link_50_outbound"];
export const SPAM_TLDS = [".shop", ".xyz", ".top", ".click", ".online", ".site"];
export const NON_US_TLDS = [".uk", ".ca", ".au", ".in"];
export const BANNED_VERTICALS = ["casino", "gambling", "cbd", "adult", "pharma", "payday", "crypto", "forex"];

export interface AnchorBand { min: number; max: number }
export type AnchorBands = Record<"Branded" | "Partial" | "Natural" | "Exact", AnchorBand>;
export const DEFAULT_ANCHOR_BANDS: AnchorBands = {
  Branded: { min: 40, max: 50 },
  Partial: { min: 20, max: 30 },
  Natural: { min: 15, max: 25 },
  Exact: { min: 0, max: 10 },
};

export const DEFAULT_SETTINGS = {
  verifierUserAgent: "BacklinkVerifyBot/0.1 (+internal QA)",
  firstRecheckDays: 30,
  nextRecheckDays: 90,
  fixWindowDays: 14,
  defaultMonthlyTarget: 4,
  /** Look up new donors on Ahrefs automatically. Off by default: each lookup costs Ahrefs API units. */
  ahrefsAutoLookup: false,
  /** Ask the AI whether each live link's page is on topic for the client (needs the AI key; costs a little per check). */
  aiPageRelevance: true,
  anchorBands: DEFAULT_ANCHOR_BANDS,
};
export type AppSettings = typeof DEFAULT_SETTINGS;
