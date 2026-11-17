import { describe, expect, it } from "vitest";
import { parseHtml, verifyLink } from "./verifier.js";

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
