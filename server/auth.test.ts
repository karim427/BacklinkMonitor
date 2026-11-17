import { describe, expect, it } from "vitest";
import { permission } from "./auth.js";

describe("role permissions", () => {
  it("admins can do anything", () => {
    for (const [m, p] of [["DELETE", "/clients/1"], ["PUT", "/dashboard/target"], ["GET", "/users"], ["POST", "/users"]]) expect(permission("admin", m, p).allowed).toBe(true);
  });
  it("users can read everything except the users list", () => {
    expect(permission("user", "GET", "/links").allowed).toBe(true);
    expect(permission("user", "GET", "/clients").allowed).toBe(true);
    expect(permission("user", "GET", "/users").allowed).toBe(false);
    expect(permission("user", "GET", "/users/1").allowed).toBe(false);
  });
  it("users can add and import links, and preview a target page", () => {
    for (const p of ["/links", "/links/import", "/target-pages/preview"]) expect(permission("user", "POST", p).allowed).toBe(true);
  });
  it("users may change only their own links", () => {
    expect(permission("user", "PUT", "/links/5")).toEqual({ allowed: true, ownLink: true });
    expect(permission("user", "DELETE", "/links/5")).toEqual({ allowed: true, ownLink: true });
    expect(permission("user", "POST", "/links/5/verify")).toEqual({ allowed: true, ownLink: true });
  });
  it("users can't change targets, clients, donors, settings, rechecks or accounts", () => {
    for (const [m, p] of [["PUT", "/dashboard/target"], ["POST", "/clients"], ["DELETE", "/clients/1"], ["PUT", "/clients/1/months/2026-11"], ["POST", "/target-pages"],
      ["POST", "/donors"], ["POST", "/donors/sync-ahrefs"], ["PUT", "/settings"], ["PUT", "/settings/ahrefs-key"], ["POST", "/rechecks/run-due"], ["POST", "/users"], ["POST", "/users/1/code"], ["POST", "/prospects/discover"]])
      expect(permission("user", m, p).allowed, `${m} ${p}`).toBe(false);
  });
});
