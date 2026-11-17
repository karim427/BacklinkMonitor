import { useCallback, useEffect, useState } from "react";

export class ApiError extends Error { constructor(msg: string, public status: number) { super(msg); } }

const TOKEN_KEY = "bv_token";
export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
export const setToken = (t: string | null) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } if (!t) cache.clear(); };

/** Stale-while-revalidate: pages render the last response instantly and refresh in the background. Any write clears it. */
const cache = new Map<string, unknown>();
export const cached = <T,>(path: string) => cache.get(path) as T | undefined;
export function prefetch(path: string) { if (!cache.has(path) && getToken()) api(path).then((d) => cache.set(path, d)).catch(() => {}); }
export const authHeaders = (): Record<string, string> => (getToken() ? { authorization: `Bearer ${getToken()}` } : {});

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers: { ...authHeaders(), ...(opts.body !== undefined ? { "content-type": "application/json" } : {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data: any; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (res.status === 401 && !path.startsWith("/auth/")) { setToken(null); window.dispatchEvent(new Event("bv-unauthorized")); }
  if (res.ok && (opts.method ?? (opts.body !== undefined ? "POST" : "GET")) !== "GET") cache.clear();
  if (!res.ok) throw new ApiError(data?.error?.message ?? `Request failed (${res.status})`, res.status);
  return data as T;
}
export const get = <T = any>(p: string) => api<T>(p);
export const post = <T = any>(p: string, body: unknown = {}) => api<T>(p, { method: "POST", body });
export const put = <T = any>(p: string, body: unknown) => api<T>(p, { method: "PUT", body });
export const del = <T = any>(p: string) => api<T>(p, { method: "DELETE" });

/** Fetch hook with loading / error / reload. */
export function useApi<T = any>(path: string | null) {
  const [data, setData] = useState<T | null>(() => (path ? cached<T>(path) ?? null : null));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (path === null) return;
    let live = true; setLoading(true); setError(null);
    const hit = cached<T>(path); if (hit !== undefined) setData(hit);
    api<T>(path).then((d) => { cache.set(path, d); if (live) setData(d); }).catch((e) => live && setError(e.message)).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [path, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}
