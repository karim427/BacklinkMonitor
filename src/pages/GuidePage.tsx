import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Input, Card } from "@/components/ui/primitives";
import { PageHeader } from "@/features/shared/common";
import { REJECT_RULES } from "@server/services/constants";

type Item = [term: string, meaning: string];
interface Section { id: string; title: string; intro?: string; items: Item[] }

const SECTIONS: Section[] = [
  { id: "start", title: "Start here: the whole process in 5 steps", intro: "Do these in order the first time. After that you only repeat steps 3 and 4 each time a link is placed.", items: [
    ["1. Add the client's website", "Clients > Add website. Enter the real domain (for example example.com), pick the niche and set how many links you want each month. After you save, a window opens to choose pages (step 2)."],
    ["2. Choose the pages to get links for", "Target pages > Find pages from sitemap. We read the website's sitemap and suggest service pages and blog posts worth boosting. Tick the ones you want, fix the keyword if it is wrong, and click Add. Then use Detect keyword data on a row to fill in search volume, difficulty and how many more linking sites it needs (needs the Ahrefs key)."],
    ["3. Add a link when it is placed", "Links > Add link. See the next section for each box."],
    ["4. Check the link", "Click Verify now. A link that is not live yet shows Not live yet. Once the link is on the page, set its Status to Live and the Check column tells you if it counts toward the month."],
    ["5. Review every month", "Dashboard shows each client against the target. Rechecks lists links to look at again (30 days after placement, then every 90 days). Fix anything marked Partly relevant within 14 days."],
  ] },
  { id: "add-link", title: "How to add a link, box by box", intro: "Links > Add link. Only the first few boxes are needed. You can edit the rest later.", items: [
    ["Client", "Who the link is for. Pick from the list."],
    ["Target page", "The page on the client's site you are building links to. It comes from step 2. You can leave it empty."],
    ["Source URL", "The full address of the page where the link sits, on the other website (the donor). Paste it exactly."],
    ["Target URL", "The page on the client's site the link points to. This is checked: the link must go to exactly this address."],
    ["Anchor text", "The clickable words of the link. Leave empty if you do not know yet."],
    ["Status", "Pending (planned), In process (placed, waiting to show up) or Live (visible on the page). Only Live links are judged."],
    ["Placed date", "The day it was placed. It cannot be in the future. The first recheck is 30 days after this."],
    ["The donor", "You do not add it. The website in the Source URL is added to the Donors page for you."],
    ["After you save", "The link appears in the Links table. Click Verify now to check it, or the daily check will do it."],
  ] },
  { id: "status", title: "Status: where a link is in its life", intro: "Every link moves left to right. Relevance is only checked once a link is live.", items: [
    ["Pending", "Planned, but not placed yet. Nothing is checked."],
    ["In process", "Placed and waiting to appear on the page. The daily check looks for it until it shows up, then it goes Live."],
    ["Live", "Found on the page. From now on it is checked and judged."],
    ["Replace", "Live, but it failed a rule, so it needs fixing or replacing."],
    ["Lost", "A later check found the link gone from the page."],
    ["Rejected", "You marked it as turned down or dropped. It is never checked again."],
    ["✓ Confirmed (green tag)", "Shown under Status once a link has passed its first 30-day recheck."],
  ] },
  { id: "verdict", title: "Check: the result for each link", intro: "The Check column gives one simple answer per link. Click Verify now to run it again.", items: [
    ["Relevant", "Passed every check. Only these count toward the monthly target."],
    ["Partly relevant", "Has a fixable problem (for example nofollow), shown under the result. You have a 14-day fix window before it becomes Not relevant."],
    ["Not relevant", "Failed a rule that can't be fixed, or the fix window ran out. The main reason is shown under it. Replace or drop the link."],
    ["Not live yet", "A Pending or In process link. It is checked once it is live."],
    ["Not checked yet", "The link is live but hasn't been checked. Click Verify now."],
    ["Couldn't check", "The page couldn't be opened (site down, blocked, timed out). The reason is shown. The old result is kept."],
    ["Donor numbers", "A site's DR and traffic are filled in automatically when you have them. If you don't, the link is simply judged on everything else: missing numbers never block a result."],
  ] },
  { id: "checks", title: "What Verify now actually does", intro: "The app opens the page like a visitor (using the name in Settings > Verifier user agent) and reads it. It never logs in or changes anything.", items: [
    ["Finds your link", "Looks for a link to the client's site and checks it goes to the exact Target URL."],
    ["Link details", "rel (nofollow, sponsored, ugc), where it sits (body, footer, sidebar, author bio), how many outgoing links the page has, anchor text."],
    ["Page checks", "noindex, canonical pointing elsewhere, page-wide nofollow, a 'Sponsored' label, and a competitor linked on the same page."],
    ["On topic (AI)", "Reads the page and rejects it if it clearly isn't about the client's topic. You can switch this off in Settings."],
    ["Page check (each link's own page)", "With a Firecrawl key, every check also reads the exact page the link is on (not just the site). It sees links built by JavaScript or hidden from a plain fetch, then the AI scores how well the page fits the client, how naturally the link reads in its sentence, and the content quality. Open it from the row's ... menu > Page check. A page under 35 is rejected as an unrelated niche."],
    ["Too new for Ahrefs", "Ahrefs needs about a month to crawl a new page or a newly added link. Our own check (reading the page directly) works the moment you click Verify now, but Ahrefs-based things, such as the Lost links list, can't include a link until it has crawled it. The date shown is the later of when the page was published and when the link went live, plus about 30 days."],
    ["Donor rules", "US traffic, DR, traffic minimum, linked-to-referring domains, reuse limits. These use the donor's numbers."],
    ["Error", "The page couldn't be opened (site down, blocked, timed out). The old verdict is kept and the reason is shown."],
  ] },
  { id: "dashboard", title: "Dashboard numbers", items: [
    ["Target", "How many relevant links you want this month, added up across clients. Click it to see each client's progress."],
    ["Pending / In progress / Live", "Links this month by status. Live includes every link found on the page; only the relevant ones count toward the target."],
    ["Still needed", "Target minus relevant links so far."],
    ["Partly fixing", "Live links with a fixable problem, still inside their 14-day window."],
    ["Need donor numbers", "Live links waiting for the donor's DR and traffic."],
    ["Awaiting index / Unverified", "Links whose page isn't indexed yet, or that have never been checked."],
    ["Overdue rechecks", "Links whose next check date has passed."],
    ["Lost links", "Links Ahrefs reports as lost for your clients' sites, plus links our own checks found missing. Click Check Ahrefs to refresh (it uses Ahrefs units)."],
  ] },
  { id: "anchors", title: "Anchor text and anchor mix", intro: "Anchor text is the clickable words of a link. Too many identical keyword anchors look manufactured to Google, so the app keeps a healthy mix over the last 3 months for each target page.", items: [
    ["Exact", "Exactly the keyword you want to rank for, e.g. 'app development company'. Keep low (0–10%)."],
    ["Partial", "The keyword plus other words, e.g. 'app development cost' (20–30%)."],
    ["Branded", "The company name, e.g. 'Appscrip' (40–50%)."],
    ["Natural", "Anything else, e.g. 'this guide' (15–25%)."],
    ["In band / Out", "Whether that type's share is inside its target range. Ranges can be changed in Settings. The type is chosen by whoever adds the link."],
  ] },
  { id: "donors", title: "Donors (the sites that link to you)", intro: "You never add donors by hand: a site is listed here automatically when you add a link from it. The numbers below fill in by themselves when the Ahrefs key is set; if they are missing, links are judged on everything else.", items: [
    ["DR", "Domain Rating from Ahrefs, 0–100: how strong the site's links are. 20 or more is required."],
    ["US %", "Share of the site's visitors from the US. 60% or more is required."],
    ["Organic traffic", "Monthly visits from search. Minimum 1,000, or 300 for local sites."],
    ["Clients x / 3", "How many different clients this site already links to. More than 3 is rejected, because it looks like a link network."],
    ["Reused < 6 mo", "The same donor was already used for the same client in the last 6 months."],
    ["Check blog", "Reads a few real posts from the donor's blog with Firecrawl (about 6 credits), then the AI says what the site is about and how well it fits each client cluster. A site that clearly doesn't fit (under 35) fails the niche rule. It also notes thin or AI-like content, spam signs and sites that take guest posts on any topic. Add your Firecrawl key in Settings."],
    ["Edit / Look up", "Type the numbers in by hand from any SEO tool, or fetch them from Ahrefs (about 5 requests of your Ahrefs units per donor)."],
  ] },
  { id: "rechecks", title: "Rechecks and fix windows", items: [
    ["First recheck", "30 days after a link goes live. If it passes, the link becomes Confirmed."],
    ["Then every 90 days", "Links are looked at again on a schedule, and a missing link becomes Lost."],
    ["In process links", "Checked on every daily run until they appear."],
    ["Fix window", "14 days to fix a Partly relevant link before it counts as Not relevant."],
    ["The daily run", "Vercel runs it at 06:00 UTC. Admins can also click Run due rechecks."],
  ] },
  { id: "outreach", title: "Finding new links: Opportunities, Prospects and HARO", items: [
    ["Opportunities", "Pick a client and list its competitors. The app asks Ahrefs who links to those competitors but not to your client, ranks the sites by how many competitors they link to, and lets you send the best ones to Prospects. Each run uses Ahrefs units (one request per site)."],
    ["Prospects", "Sites worth contacting. They come from searches, from Opportunities, or are added by hand. Move them through New, Shortlisted, Contacted, Won or Rejected."],
    ["HARO / journalist requests", "Journalists ask for expert quotes. Sign up to a service that emails them (Featured.com, Qwoted, Source of Sources, Help a B2B Writer), then use Connect inbox to forward those emails here, or paste one with Import email. A daily email with many requests is split into one entry each."],
    ["Match and draft", "For each request the app ranks which of your clients fits and drafts a reply. Always read and edit the draft before sending."],
    ["Sample data", "Settings > Sample data lists the made-up clients, donors and links that came with the app (on fake .example addresses) so you can remove them. Real data is never touched."],
  ] },
  { id: "data", title: "Import, export and people", items: [
    ["Import CSV", "Columns it understands: Client, Link from, Link to, Anchor text, Anchor type, Placement, Name, Placed date, Status. Names can be written loosely. Imported links stay 'Not judged' until you verify them."],
    ["Export", "Choose a month, a client, a status, the columns, and the exact links, then download a CSV for Excel or Google Sheets."],
    ["Admin", "Can change anything, invite people and run lookups that use Ahrefs units."],
    ["User", "Can see everything, add links and verify, edit or delete only their own."],
    ["Sign-in code", "People sign in with their email and a 6-digit code. If email can't be delivered, an admin can generate a code on the Users page."],
  ] },
];

export default function GuidePage() {
  const [q, setQ] = useState(""); const { hash } = useLocation();
  useEffect(() => { if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [hash]);
  const needle = q.trim().toLowerCase();
  const sections = useMemo(() => SECTIONS.map((s) => ({ ...s, items: needle ? s.items.filter(([t, m]) => `${t} ${m}`.toLowerCase().includes(needle)) : s.items })).filter((s) => s.items.length), [needle]);
  const rules = useMemo(() => ["Domain", "Niche", "Quality", "Link", "Reuse"].map((c) => [c, REJECT_RULES.filter((r) => r.category === c)] as const)
    .map(([c, rs]) => [c, needle ? rs.filter((r) => `${c} ${r.label}`.toLowerCase().includes(needle)) : rs] as const).filter(([, rs]) => rs.length), [needle]);
  return (
    <>
      <PageHeader title="Guide" description="What every page, number and label means, in plain words." />
      <div className="mb-4 max-w-md"><Input placeholder="Search the guide… (for example: exact, pending, donor)" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <nav className="mb-6 flex flex-wrap gap-2 text-sm">{[...SECTIONS.map((s) => [s.id, s.title.split(":")[0].split(" (")[0]] as const), ["rules", "Reject list"] as const].map(([id, t]) =>
        <a key={id} href={`#${id}`} className="rounded-full border border-zinc-200 px-3 py-1 hover:bg-zinc-50">{t}</a>)}</nav>
      <div className="space-y-6">
        {sections.map((s) => (
          <Card key={s.id} className="p-5"><section id={s.id} className="scroll-mt-20">
            <h2 className="text-base font-semibold">{s.title}</h2>{s.intro && <p className="mt-1 text-sm text-zinc-600">{s.intro}</p>}
            <dl className="mt-3 divide-y divide-zinc-100">{s.items.map(([t, m]) => (
              <div key={t} className="grid gap-1 py-2.5 sm:grid-cols-[13rem_1fr]"><dt className="text-sm font-medium">{t}</dt><dd className="text-sm text-zinc-600">{m}</dd></div>))}</dl>
          </section></Card>))}
        {!!rules.length && (
          <Card className="p-5"><section id="rules" className="scroll-mt-20">
            <h2 className="text-base font-semibold">Reject list</h2><p className="mt-1 text-sm text-zinc-600">Any one of these stops a link from being Relevant. "Fixable" ones give you the 14-day window; the rest reject it.</p>
            <div className="mt-3 grid gap-4 md:grid-cols-2">{rules.map(([c, rs]) => (
              <div key={c}><h3 className="mb-1 text-sm font-semibold">{c}</h3>{rs.map((r) => <p key={r.code} className="border-t border-zinc-100 py-1.5 text-sm text-zinc-700">{r.label}{r.fixable && <span className="ml-2 text-xs text-amber-700">fixable</span>}</p>)}</div>))}</div>
          </section></Card>)}
        {!sections.length && !rules.length && <p className="text-sm text-zinc-500">Nothing in the guide matches "{q}".</p>}
      </div>
    </>
  );
}
