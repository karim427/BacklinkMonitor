/** For PUT: keep only the fields the client actually sent. zod's `.partial()` still applies `.default()` values to omitted fields, which silently reset them. */
export const given = <T extends object>(parsed: T, body: unknown) =>
  Object.fromEntries(Object.entries(parsed).filter(([k]) => !!body && typeof body === "object" && k in (body as object))) as Partial<T>;
