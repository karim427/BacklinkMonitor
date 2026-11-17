import { describe, expect, it } from "vitest";
import { readInboundMail } from "./inboundMail.js";

describe("inbound email formats", () => {
  it("reads a plain post (Gmail script, Zapier, SendGrid)", () => expect(readInboundMail({ subject: "S", text: "Hello there" })).toEqual({ subject: "S", text: "Hello there" }));
  it("reads CloudMailin's JSON (headers.subject, plain)", () => expect(readInboundMail({ headers: { subject: "Query" }, plain: "Journalist wants quotes" })).toEqual({ subject: "Query", text: "Journalist wants quotes" }));
  it("reads Postmark (Subject, TextBody) and Mailgun (body-plain)", () => {
    expect(readInboundMail({ Subject: "P", TextBody: "pm text" })).toEqual({ subject: "P", text: "pm text" });
    expect(readInboundMail({ subject: "M", "body-plain": "mg text" })).toEqual({ subject: "M", text: "mg text" });
  });
  it("falls back to the HTML part, stripped of tags", () => { const t = readInboundMail({ html: "<p>Query: How?</p><p>Deadline: soon</p>" }).text; expect(t).toMatch(/Query: How\?\s+Deadline: soon/); expect(t).not.toContain("<"); });
});
