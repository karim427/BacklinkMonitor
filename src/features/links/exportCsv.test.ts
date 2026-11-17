import { describe, expect, it } from "vitest";
import { COLUMNS, buildCsv, csvCell, slug } from "./exportCsv";

const link = { id: 1, clientId: 5, client: { name: "St Pete" }, month: "2026-12", sourceUrl: "https://resident.com/a", targetUrl: "https://www.webuystpetehouses.com/", anchorText: 'we buy "St. Pete" houses',
  action: "IN_PROCESS", verdict: "Not judged", reviewer: "karim", placedAt: "2026-12-01T00:00:00.000Z", donor: { domain: "resident.com", dr: 0, ahrefsSyncedAt: null }, rejectReasons: ["link_footer_sidebar_bio"], notes: "=HYPERLINK(\"http://evil\")" };

describe("links export", () => {
  it("neutralises spreadsheet formulas and escapes quotes", () => {
    expect(csvCell("=SUM(A1:A2)")).toBe(`"'=SUM(A1:A2)"`);
    expect(csvCell("+1")).toBe(`"'+1"`);
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(null)).toBe('""');
  });
  it("writes only the chosen columns, with readable values", () => {
    const cols = COLUMNS.filter((c) => ["client", "month", "status", "anchor"].includes(c.key));
    const csv = buildCsv([link], cols).replace("﻿", "").split("\r\n");
    expect(csv[0]).toBe('"Client","Month","Anchor text","Status"');
    expect(csv[1]).toBe('"St Pete","December 2026","we buy ""St. Pete"" houses","In process"');
  });
  it("has no donor columns", () => {
    expect(COLUMNS.map((c) => c.key).filter((k) => /donor|dr/i.test(k))).toEqual([]);
    expect(COLUMNS.map((c) => c.label).join(" ")).not.toMatch(/donor/i);
  });
  it("shows plain-language problems, no internal codes", () => {
    const get = (k: string) => COLUMNS.find((c) => c.key === k)!.get(link);
    expect(get("reasons")).toBe("Link in footer, sidebar or author bio");
    expect(get("verdict")).toBe("Not live yet");
    expect(get("notes")).toBe('=HYPERLINK("http://evil")'); // neutralised later, by csvCell
  });
  it("builds a safe file name part", () => expect(slug("St Pete / FL")).toBe("st-pete-fl"));
});
