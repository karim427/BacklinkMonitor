import { describe, expect, it } from "vitest";
import { fetchLostBacklinks, lostReasonLabel } from "./ahrefsLostApi.js";

const resp = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const recent = new Date(Date.now() - 5 * 86_400_000).toISOString();
const old = new Date(Date.now() - 400 * 86_400_000).toISOString();

describe("Ahrefs lost backlinks", () => {
  it("returns only lost links from the period and maps the fields", async () => {
    const f = (async () => resp(200, { backlinks: [
      { url_from: "https://a.com/post", url_to: "https://client.com/", anchor: "Client", first_seen: old, last_seen: recent, is_lost: true, lost_reason: "removedfromhtml", domain_rating_source: 51, is_dofollow: true },
      { url_from: "https://live.com/x", url_to: "https://client.com/", is_lost: false },
      { url_from: "https://ancient.com/x", url_to: "https://client.com/", is_lost: true, last_seen: old },
    ] })) as any;
    const r = await fetchLostBacklinks("client.com", 60, "key", f);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ urlFrom: "https://a.com/post", reason: "removedfromhtml", dr: 51, dofollow: true });
  });
  it("sends the key, the history window and the lost filter", async () => {
    let url = ""; let auth = "";
    const f = (async (u: string, init: any) => { url = u; auth = init.headers.Authorization; return resp(200, { backlinks: [] }); }) as any;
    await fetchLostBacklinks("client.com", 30, "secret", f);
    expect(auth).toBe("Bearer secret");
    expect(url).toContain("history=since%3A"); expect(url).toContain("is_lost"); expect(url).toContain("target=client.com");
  });
  it("retries without the filter if Ahrefs answers 400", async () => {
    let calls = 0;
    const f = (async () => (++calls === 1 ? resp(400, { error: "bad where" }) : resp(200, { backlinks: [{ url_from: "https://a.com", url_to: "https://client.com", is_lost: true, last_seen: recent }] }))) as any;
    expect(await fetchLostBacklinks("client.com", 60, "k", f)).toHaveLength(1); expect(calls).toBe(2);
  });
  it("explains key, plan and quota problems in plain words", async () => {
    await expect(fetchLostBacklinks("c.com", 60, "k", (async () => resp(401, {})) as any)).rejects.toThrow(/rejected the API key/);
    await expect(fetchLostBacklinks("c.com", 60, "k", (async () => resp(429, {})) as any)).rejects.toThrow(/out of API units/);
  });
  it("labels reasons in plain language, never a raw code", () => {
    expect(lostReasonLabel("removedfromhtml")).toBe("The link was removed from the page");
    expect(lostReasonLabel("some_new_reason")).toBe("Some new reason");
    expect(lostReasonLabel(null)).toBe("Reason unknown");
  });
});
