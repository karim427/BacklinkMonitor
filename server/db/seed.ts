import { pathToFileURL } from "node:url";
import { db, runMigrations, schema as s, sqlite } from "./index";
import { napMatch, scheduleFirstCheck, scheduleNextCheck, monthKey, stage1 } from "../services/rules";
import { DEFAULT_SETTINGS } from "../services/constants";

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

export function seed() {
  runMigrations();
  sqlite.exec("PRAGMA foreign_keys = OFF");
  for (const t of ["check_runs", "links", "citations", "prospects", "haro_requests", "target_pages", "client_month_targets", "workspace_month_targets", "donors", "clients", "settings"])
    sqlite.exec(`DELETE FROM ${t}`);
  sqlite.exec("PRAGMA foreign_keys = ON");

  const C = (name: string, domain: string, cluster: string, city: string, state: string, target: number, cash = false) => {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const i = [...slug].reduce((a, c) => a + c.charCodeAt(0), 0) % 90 + 10;
    return {
      name, domain, slug, cluster, city, state, isCashBuyer: cash, defaultMonthlyTarget: target,
      gbpName: name, gbpAddress: `${100 + i} Example Street, ${city}, ${state}`, gbpPhone: `(555) 01${i}-${1000 + i * 7}`,
    };
  };
  const clientRows = db.insert(s.clients).values([
    C("Appscrip", "appscrip.com", "Tech / SaaS", "Tampa", "FL", 3),
    C("Isometrik", "isometrik.ai", "Tech / SaaS", "Austin", "TX", 3),
    C("myWork", "mywork.example", "Tech / SaaS", "Seattle", "WA", 3),
    C("CarShippers", "carshippers.example", "Auto logistics", "Dallas", "TX", 3),
    C("AllProNow", "allpronow.example", "Trades / freight", "Atlanta", "GA", 2),
    C("FlexCrew", "flexcrew.example", "Trades / freight", "Denver", "CO", 3),
    C("Assured", "assured.example", "Cash home buyers", "Columbus", "OH", 2, true),
    C("Best Cash", "bestcash.example", "Cash home buyers", "Charlotte", "NC", 2, true),
    C("High Noon", "highnoon.example", "Cash home buyers", "Phoenix", "AZ", 2, true),
    C("HuckBuys Homes", "huckbuys.example", "Cash home buyers", "Houston", "TX", 2, true),
    C("ILM Home Offer", "ilmhomeoffer.example", "Cash home buyers", "Wilmington", "NC", 2, true),
    C("Integrity", "integrity.example", "Cash home buyers", "Tampa", "FL", 2, true),
    C("Reibar", "reibar.example", "Cash home buyers", "Las Vegas", "NV", 2, true),
    C("Sell Now", "sellnow.example", "Cash home buyers", "San Antonio", "TX", 2, true),
    C("St Pete", "stpete.example", "Cash home buyers", "St. Petersburg", "FL", 2, true),
  ]).returning().all();
  const cid = (n: string) => clientRows.find((c) => c.name === n)!.id;

  const D = (domain: string, name: string, dr: number, us: number, traffic: number, rds: number, linked: number, cluster: string, niche: string, local = false, area?: string) => ({
    domain, name, dr, usTrafficPct: us, organicTraffic: traffic, referringDomains: rds, linkedDomains: linked, cluster, niche,
    isLocal: local, localArea: area ?? null, trafficHistory: [traffic, traffic, traffic, traffic, traffic, traffic], flags: {}, ahrefsSyncedAt: daysAgo(3),
  });
  const donorRows = db.insert(s.donors).values([
    D("appdevhub.example", "AppDev Hub", 58, 82, 24000, 900, 600, "Tech / SaaS", "app development"),
    D("saasweekly.example", "SaaS Weekly", 62, 76, 41000, 1400, 800, "Tech / SaaS", "SaaS"),
    D("startupbeat.example", "Startup Beat", 47, 71, 12000, 500, 300, "Tech / SaaS", "startups"),
    D("autohauler.example", "Auto Hauler Blog", 44, 88, 8800, 350, 250, "Auto logistics", "auto transport"),
    D("buildersdaily.example", "Builders Daily", 51, 90, 15000, 640, 400, "Trades / freight", "construction"),
    D("freightpulse.example", "Freight Pulse", 49, 84, 9400, 410, 380, "Trades / freight", "freight"),
    D("houstonhomes.example", "Houston Home Journal", 34, 93, 620, 120, 90, "Cash home buyers", "local city/state", true, "Houston, TX"),
    D("sellfastguide.example", "Sell Fast Guide", 41, 85, 4100, 260, 180, "Cash home buyers", "home selling"),
    D("tampabaynews.example", "Tampa Bay Local", 55, 91, 22000, 800, 500, "Cash home buyers", "local city/state", true, "Tampa, FL"),
  ]).returning().all();
  const did = (d: string) => donorRows.find((x) => x.domain === d)!.id;

  const tp = (clientName: string, url: string, keyword: string, current: number, needed: number, status: string, month: string | null) => {
    const r = stage1(needed, current);
    return { clientId: cid(clientName), url, keyword, currentRDs: current, rdsNeeded: needed, linksNeeded: r.linksNeeded, monthsToClose: r.monthsToClose, status, approvalMonth: month };
  };
  const tpRows = db.insert(s.targetPages).values([
    tp("Appscrip", "https://appscrip.com/app-development", "app development company", 40, 18, "Approved", "2026-08"),
    tp("Isometrik", "https://isometrik.ai/live-streaming-sdk", "live streaming sdk", 22, 20, "Approved", "2026-09"),
    tp("HuckBuys Homes", "https://huckbuys.example/sell-house-fast-houston", "sell house fast houston", 15, 22, "Pending", null),
    tp("CarShippers", "https://carshippers.example/auto-transport", "auto transport quote", 30, 48, "Rejected", "2026-10"),
  ]).returning().all();

  // Links: [client, tpIdx|null, donor, slug, anchor, type, placement, placedDaysAgo, verdict, stage, verification, action, rejects]
  type L = [string, number | null, string, string, string, string, string, number, string, string, string, string, string[]];
  const L_: L[] = [
    ["Appscrip", 0, "appdevhub.example", "best-app-dev-trends", "Appscrip", "Branded", "Body", 100, "Relevant", "Confirmed", "Verified", "LIVE", []],
    ["Appscrip", 0, "saasweekly.example", "outsourcing-apps", "app development company", "Exact", "Body", 75, "Relevant", "Confirmed", "Verified", "LIVE", []],
    ["Appscrip", 0, "startupbeat.example", "mvp-guide", "building an MVP", "Natural", "Body", 40, "Relevant", "Indexed", "Verified", "LIVE", []],
    ["Appscrip", 0, "appdevhub.example", "cost-of-apps", "app development cost", "Partial", "Body", 12, "Relevant", "Placed", "Verified", "LIVE", []],
    ["Isometrik", 1, "saasweekly.example", "live-video-sdk", "Isometrik", "Branded", "Body", 55, "Relevant", "Confirmed", "Verified", "LIVE", []],
    ["Isometrik", 1, "startupbeat.example", "streaming-api", "live streaming sdk", "Exact", "Footer", 33, "Not relevant", "Placed", "Verified", "REPLACE", ["link_footer_sidebar_bio"]],
    ["Isometrik", 1, "appdevhub.example", "chat-sdk", "in-app chat", "Partial", "Body", 6, "Partly relevant", "Placed", "Checking", "REPLACE", ["link_nofollow_paid"]],
    ["CarShippers", null, "autohauler.example", "ship-your-car", "CarShippers", "Branded", "Body", 63, "Relevant", "Confirmed", "Verified", "LIVE", []],
    ["CarShippers", null, "autohauler.example", "moving-checklist", "car shipping tips", "Natural", "Body", 20, "Partly relevant", "Placed", "Unverified", "REPLACE", ["quality_not_indexed"]],
    ["FlexCrew", null, "buildersdaily.example", "labor-shortage", "FlexCrew", "Branded", "Body", 38, "Relevant", "Indexed", "Verified", "LIVE", []],
    ["AllProNow", null, "freightpulse.example", "trucking-staff", "staffing partner", "Natural", "Body", 120, "Relevant", "Lost", "Verified", "LOST", []],
    ["HuckBuys Homes", 2, "houstonhomes.example", "selling-fast-houston", "HuckBuys Homes", "Branded", "Body", 3, "Partly relevant", "Intake", "Unverified", "LIVE", []],
  ];
  const linkRows = L_.map(([client, tpi, donor, slug, anchor, type, placement, ago, verdict, stage, ver, action, rejects]) => {
    const placedAt = daysAgo(ago);
    const sched = stage === "Lost" ? { nextCheckAt: null, nextCheckKind: null } : ago >= 30 ? scheduleNextCheck(daysAgo(Math.max(0, ago - 30))) : scheduleFirstCheck(placedAt);
    const c = clientRows.find((x) => x.name === client)!;
    return {
      clientId: c.id, targetPageId: tpi == null ? null : tpRows[tpi].id, donorId: did(donor),
      sourceUrl: `https://${donor}/${slug}`, targetUrl: tpi == null ? `https://${c.domain}/` : tpRows[tpi].url,
      anchorText: anchor, anchorType: type, placement, reviewer: ["Maya", "Dev", "Sam"][ago % 3], placedAt,
      verdict, stage, verificationStatus: ver, action, rejectReasons: rejects,
      lastCheckedAt: ver === "Verified" ? daysAgo(Math.min(ago, 8)) : null, ...sched,
      fixWindowEndsAt: verdict === "Partly relevant" && rejects.length ? new Date(Date.now() + 9 * DAY) : null,
    };
  });
  db.insert(s.links).values(linkRows).run();
  // make two links overdue for the rechecks queue
  sqlite.exec(`UPDATE links SET next_check_at = ${Date.now() - 5 * DAY} WHERE source_url LIKE '%mvp-guide'`);
  sqlite.exec(`UPDATE links SET next_check_at = ${Date.now() - 2 * DAY} WHERE source_url LIKE '%chat-sdk'`);

  const cit = (client: string, dir: string, over: Partial<{ name: string; address: string; phone: string }> = {}) => {
    const c = clientRows.find((x) => x.name === client)!;
    const row = { name: c.gbpName!, address: c.gbpAddress!, phone: c.gbpPhone!, ...over };
    const m = napMatch(row, { name: c.gbpName!, address: c.gbpAddress!, phone: c.gbpPhone! }).match;
    return { clientId: c.id, directory: dir, ...row, gbpMatch: m, status: m === "Matched" ? "Logged" : "Mismatch" };
  };
  db.insert(s.citations).values([
    cit("HuckBuys Homes", "Yelp"), cit("Integrity", "BBB"),
    cit("Reibar", "Yellow Pages", { phone: "(555) 010-9999" }), cit("St Pete", "Manta", { name: "St Pete Home Buyers" }),
  ]).run();

  const P = (client: string, domain: string, title: string, score: number, label: string, why: string, kw: string, q: string, status = "New") => ({
    clientId: cid(client), domain, pageTitle: title, pageUrl: `https://${domain}/write-for-us`, snippet: `${title} — we accept guest contributions.`,
    score, label, whyItScored: why, matchedKeyword: kw, sourceQuery: q, scoreSource: score % 2 ? "ai" : "heuristic", status,
  });
  db.insert(s.prospects).values([
    P("Appscrip", "devstartups.example", "Write for us – Dev Startups", 86, "Relevant", "Active app-dev blog accepting guest posts", "app development", 'app development blog "write for us"', "Shortlisted"),
    P("Isometrik", "videotechmag.example", "Contribute to VideoTech Mag", 78, "Relevant", "Streaming tech audience", "live streaming", 'live streaming blog "guest post"'),
    P("HuckBuys Homes", "houstoninvestors.example", "Houston Investors Guest Posts", 72, "Relevant", "Local real-estate investor audience in Houston", "sell house houston", 'houston real estate "write for us"'),
    P("FlexCrew", "tradesbuzz.example", "Trades Buzz – Contribute", 64, "Partly", "Trades-adjacent, general audience", "construction staffing", 'construction staffing blog "write for us"'),
    P("CarShippers", "motorlife.example", "MotorLife Guest Posting", 58, "Partly", "Automotive, mixed niches", "car shipping", "car shipping guest post"),
    P("Reibar", "bestcasinotips.example", "Casino Tips – Write for us", 12, "Not", "Banned vertical (casino)", "real estate", 'real estate blog "write for us"', "Rejected"),
  ]).run();

  const inDays = (n: number) => new Date(Date.now() + n * DAY);
  db.insert(s.haroRequests).values([
    {
      rawEmail: "Summary: Looking for founders on building a live video product.\nOutlet: TechCrunch-like Daily\nName: Jordan Reed\nCategory: Tech\nQuery: How did you pick a streaming SDK?\nRequirements: Founders/CTOs, 100 words.",
      outlet: "Example Tech Daily", journalist: "Jordan Reed (fake)", category: "Tech", title: "Building a live video product", question: "How did you choose a streaming SDK for your app?",
      requirements: "Founders or CTOs, ~100 words", deadline: inDays(9), status: "New", matches: [], responses: [],
    },
    {
      rawEmail: "Outlet: Home Finance Weekly\nName: Alex Moreno\nQuery: Tips for selling an inherited house quickly\nDeadline in 4 days.",
      outlet: "Example Home Finance Weekly", journalist: "Alex Moreno (fake)", category: "Real estate", title: "Selling an inherited house", question: "What are your best tips for selling an inherited house quickly?",
      requirements: "Real-estate professionals", deadline: inDays(4), status: "Matched", matches: [{ clientId: cid("HuckBuys Homes"), score: 88, why: "Probate and cash-buyer expertise" }], responses: [],
    },
  ]).run();

  db.insert(s.settings).values({ key: "app", value: DEFAULT_SETTINGS }).run();
  db.insert(s.workspaceMonthTargets).values({ month: monthKey(new Date()), target: 35 }).run();
  return { clients: clientRows.length, donors: donorRows.length, links: linkRows.length };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) console.log("Seeded", seed());
