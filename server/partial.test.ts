import { describe, expect, it } from "vitest";
import { z } from "zod";

import { given } from "./util.js";

describe("partial updates must not reset omitted fields", () => {
  const schema = z.object({ name: z.string(), isCashBuyer: z.boolean().default(false), target: z.number().default(4) });
  it("zod .partial() alone fills defaults for omitted fields (the bug)", () => {
    expect(schema.partial().parse({ target: 9 })).toMatchObject({ isCashBuyer: false });
  });
  it("given() keeps only what was sent", () => {
    const body = { target: 9 };
    expect(given(schema.partial().parse(body), body)).toEqual({ target: 9 });
  });
});
