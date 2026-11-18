import { describe, expect, it } from "vitest";
import { detectPlacement, detectPublishDate, parseHtml, verifyLink } from "./verifier.js";

const input = { sourceUrl: "https://donor.com/post", targetUrl: "https://client.com/page", userAgent: "test", competitorDomains: ["rival.com"] };
const page = (body: string, head = "") => `<html><head>${head}</head><body>${body}</body></html>`;

describe("verifier", () => {
  it("finds a body link with exact target", () => {
    const r = parseHtml(page('<article><a href="https://client.com/page" rel="nofollow">Great page</a></article>'), input);
    expect(r).toMatchObject({ linkFound: true, targetMatched: true, rel: ["nofollow"], anchorFound: "Great page", placement: "Body", indexed: true });
  });
  it("detects wrong target (same domain, other path)", () => {
    expect(parseHtml(page('<a href="https://client.com/other">x</a>'), input)).toMatchObject({ linkFound: true, targetMatched: false });
  });
  it("detects footer placement, competitor, noindex, outbound count", () => {
    const r = parseHtml(page('<footer><a href="https://client.com/page">f</a></footer><a href="https://rival.com">r</a>', '<meta name="robots" content="noindex">'), input);
    expect(r).toMatchObject({ placement: "Footer", competitorLinked: true, indexed: false, outboundLinks: 2 });
  });
  it("detects canonical pointing elsewhere, page-level nofollow and a sponsored label", () => {
    const head = '<link rel="canonical" href="https://donor.com/other-page"><meta name="robots" content="index, nofollow">';
    const r = parseHtml(page('<article><p>Sponsored post</p><a href="https://client.com/page">x</a></article>', head), input);
    expect(r).toMatchObject({ canonicalElsewhere: true, pageNofollow: true, sponsoredLabel: true });
  });
  it("is clean when the canonical is the page itself and there is no disclosure", () => {
    const r = parseHtml(page('<article><p>A normal guide about apps.</p><a href="https://client.com/page">x</a></article>', '<link rel="canonical" href="https://www.donor.com/post/">'), input);
    expect(r).toMatchObject({ canonicalElsewhere: false, pageNofollow: false, sponsoredLabel: false });
  });
  it("reports link missing", () => expect(parseHtml(page("<p>nothing</p>"), input).linkFound).toBe(false));
  it("treats fetch failure as error, not relevance failure", async () => {
    const r = await verifyLink(input, (async () => new Response("no", { status: 404 })) as any);
    expect(r.ok).toBe(false); expect(r.error).toMatch(/404.*not found/);
    const r2 = await verifyLink(input, (async () => { throw new Error("ENOTFOUND"); }) as any);
    expect(r2.ok).toBe(false); expect(r2.error).toMatch(/not found/i);
  });
});

describe("where a link sits on the page", () => {
  const el = (tag: string, cls = "", id = "") => ({ tag, cls, id });
  it("a link in an Elementor page is body content, not a sidebar", () =>
    expect(detectPlacement([el("p"), el("div", "elementor-widget-container"), el("div", "elementor-element elementor-widget elementor-widget-text-editor"), el("section", "elementor-section"), el("div", "elementor"), el("body", "has-sidebar")])).toBe("Body"));
  it("a real sidebar, widget area or aside is a sidebar", () => {
    expect(detectPlacement([el("li"), el("ul"), el("div", "widget widget_recent_posts"), el("aside", "", "secondary")])).toBe("Sidebar");
    expect(detectPlacement([el("div", "widget"), el("div", "primary-sidebar")])).toBe("Sidebar");
  });
  it("footer wins, including footer widgets", () => expect(detectPlacement([el("div", "widget"), el("div", "footer-widgets"), el("footer", "site-footer")])).toBe("Footer"));
  it("an author box is an author bio", () => expect(detectPlacement([el("p"), el("div", "author-bio"), el("article")])).toBe("Author bio"));
  it("ordinary article text is body", () => expect(detectPlacement([el("p"), el("div", "entry-content"), el("article", "post")])).toBe("Body"));
  it("a layout flag on the page wrapper is not a sidebar", () => expect(detectPlacement([el("div", "site-content has-sidebar"), el("div", "wrap no-sidebar")])).toBe("Body"));
});

describe("when a page was published", () => {
  const url = "https://blog.test/post";
  it("reads structured data, meta tags and <time>", () => {
    expect(detectPublishDate('<script type="application/ld+json">{"@type":"Article","datePublished":"2026-10-04T08:00:00Z"}</script>', url)).toBe("2026-10-04T08:00:00.000Z");
    expect(detectPublishDate('<meta property="article:published_time" content="2026-09-15T10:00:00+00:00">', url)).toBe("2026-09-15T10:00:00.000Z");
    expect(detectPublishDate('<article><time datetime="2026-08-01">Aug 1</time></article>', url)).toBe("2026-08-01T00:00:00.000Z");
  });
  it("falls back to a date in the address, then to nothing", () => {
    expect(detectPublishDate("<html></html>", "https://blog.test/2026/05/some-post/")).toBe("2026-05-01T00:00:00.000Z");
    expect(detectPublishDate("<html></html>", "https://blog.test/some-post/")).toBeNull();
  });
  it("ignores dates in the future and uses a value given by Firecrawl", () => {
    expect(detectPublishDate('<meta property="article:published_time" content="2099-01-01">', url)).toBeNull();
    expect(detectPublishDate("<html></html>", url, ["2026-07-07T00:00:00Z"])).toBe("2026-07-07T00:00:00.000Z");
  });
});
