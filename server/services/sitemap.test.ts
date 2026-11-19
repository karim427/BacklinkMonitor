import { describe, expect, it } from "vitest";
import { fetchSitemapUrls, heuristicPicks, slugWords, usablePages } from "./sitemap.js";

const maps: Record<string, string> = {
  "https://ex.com/robots.txt": "User-agent: *\nSitemap: https://ex.com/sitemap_index.xml",
  "https://ex.com/sitemap_index.xml": "<sitemapindex><sitemap><loc>https://ex.com/post-sitemap.xml</loc></sitemap><sitemap><loc>https://ex.com/tag-sitemap.xml</loc></sitemap></sitemapindex>",
  "https://ex.com/post-sitemap.xml": "<urlset><url><loc>https://ex.com/</loc></url><url><loc>https://ex.com/services/app-development</loc></url><url><loc>https://ex.com/blog/how-to-build-a-saas-app</loc></url><url><loc>https://ex.com/tag/saas</loc></url><url><loc>https://ex.com/logo.png</loc></url></urlset>",
};
const fake = (async (u: any) => (maps[String(u)] ? new Response(maps[String(u)], { status: 200 }) : new Response("", { status: 404 }))) as unknown as typeof fetch;

describe("sitemap", () => {
  it("follows robots.txt -> index -> child maps and skips tag maps", async () => {
    expect(await fetchSitemapUrls("ex.com", fake)).toHaveLength(5);
  });
  it("filters junk, other hosts and already-targeted pages", async () => {
    const urls = await fetchSitemapUrls("https://ex.com/", fake);
    expect(usablePages([...urls, "https://other.com/x"], "ex.com", ["https://ex.com/services/app-development/"])).toEqual(["https://ex.com/blog/how-to-build-a-saas-app"]);
  });
  it("makes keywords from slugs and splits pages from blogs", () => {
    expect(slugWords("https://ex.com/blog/how-to-build-a-saas-app")).toBe("how to build a saas app");
    const p = heuristicPicks(["https://ex.com/services/app-development", "https://ex.com/blog/how-to-build-a-saas-app"]);
    expect(p.map((x) => x.kind)).toEqual(["page", "blog"]);
  });
});
