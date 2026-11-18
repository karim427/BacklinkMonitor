import { describe, expect, it } from "vitest";
import { ahrefsReadyOn, extractLinkContext, parsePageVerdict, rejectsAsThin, sourcePrompt, wordCount } from "./sourceCheck.js";
import { scrapeRaw } from "./firecrawlApi.js";

const md = `# 10 chatbot ideas for your site\n\nIntro text about customer support and automation.\n\n## Chatbot examples that work\n\nIf you want inspiration, these [chatbot examples](https://www.isometrik.ai/blog/chatbot-examples/) show how brands answer questions fast.\n\nAnother paragraph.`;

describe("source page check helpers", () => {
  it("finds the sentence the link sits in, with its heading, and drops the link markup", () => {
    const c = extractLinkContext(md, "https://www.isometrik.ai/blog/chatbot-examples/", "chatbot examples");
    expect(c).toContain("Chatbot examples that work"); expect(c).toContain("these chatbot examples show how brands answer questions fast"); expect(c).not.toContain("](");
  });
  it("returns nothing when the link is not in the text", () => expect(extractLinkContext("# Hi\n\nNo links here.", "https://x.com/a", "zzz")).toBe(""));
  it("builds a prompt that names the client, the target and the sentence", () => {
    const p = sourcePrompt({ clientName: "Isometrik", cluster: "Tech / SaaS", targetUrl: "https://www.isometrik.ai/blog/chatbot-examples/", keyword: "chatbot examples", title: "T", text: "body", context: "the sentence" });
    expect(p.user).toContain("Isometrik"); expect(p.user).toContain("chatbot-examples"); expect(p.user).toContain("the sentence"); expect(p.system).toContain('"fit"');
  });
  it("clamps and defaults the AI's answer", () => {
    expect(parsePageVerdict({ fit: 150, contextFit: -3, quality: "AI", reason: "x" })).toEqual({ fit: 100, contextFit: 0, quality: "ai", reason: "x" });
    expect(parsePageVerdict({ fit: 70, quality: "weird" })!.quality).toBe("good");
    expect(parsePageVerdict(null)).toBeNull(); expect(parsePageVerdict({ nothing: 1 })).toBeNull();
  });
  it("scrapes a page's HTML and text in one call", async () => {
    let body: any = null;
    const f = (async (_u: string, init: any) => { body = JSON.parse(init.body); return new Response(JSON.stringify({ success: true, data: { markdown: "# Hi", rawHtml: "<html><a href='https://x.com'>x</a></html>", metadata: { title: "Hi", statusCode: 200 } } }), { status: 200 }); }) as any;
    const r = await scrapeRaw("https://a.com/p", "k", f);
    expect(body.formats).toEqual(["markdown", "rawHtml"]); expect(r).toMatchObject({ title: "Hi", markdown: "# Hi", statusCode: 200 }); expect(r.html).toContain("href");
  });
});

describe("when Ahrefs can know about a link", () => {
  it("is a month after the later of page publication and the link going live", () => {
    expect(ahrefsReadyOn("2026-10-01T00:00:00Z", "2026-11-10T00:00:00Z")!.toISOString().slice(0, 10)).toBe("2026-12-10");
    expect(ahrefsReadyOn("2026-11-10T00:00:00Z", "2026-10-01T00:00:00Z")!.toISOString().slice(0, 10)).toBe("2026-12-10");
  });
  it("copes with one or neither date", () => { expect(ahrefsReadyOn(null, "2026-11-01T00:00:00Z")!.toISOString().slice(0, 10)).toBe("2026-12-01"); expect(ahrefsReadyOn(null, null)).toBeNull(); });
});

describe("thin pages", () => {
  it("counts words", () => expect(wordCount("one two  three\nfour")).toBe(4));
  it("rejects only a really short page that the AI calls thin", () => {
    expect(rejectsAsThin({ quality: "thin" }, 200)).toBe(true);
    expect(rejectsAsThin({ quality: "thin" }, 1800)).toBe(false); // the AI only saw an excerpt
    expect(rejectsAsThin({ quality: "ai" }, 100)).toBe(false);   // AI-style is a warning only
    expect(rejectsAsThin({ quality: "good" }, 50)).toBe(false);
  });
  it("tells the AI the real length of the page", () => {
    const p = sourcePrompt({ clientName: "C", cluster: "Tech / SaaS", targetUrl: "https://x.com", title: "T", text: "excerpt", context: "", words: 1800 });
    expect(p.user).toContain("Words on the whole page: 1800"); expect(p.system).toContain("FIRST PART");
  });
});
