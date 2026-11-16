import { useEffect, useState } from "react";
import { Button, ErrorBanner, Field, Input } from "./ui/primitives";
import { api, getToken, setToken } from "@/lib/api";

/** Shows a password screen when the server has APP_PASSWORD set (always on Vercel). */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"loading" | "open" | "login" | "error">("loading");
  const [pw, setPw] = useState(""); const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const check = () => api<{ required: boolean }>("/auth/status").then((r) => setState(!r.required || getToken() ? "open" : "login")).catch((e) => { setErr(e.message); setState("error"); });
    check();
    const on = () => setState("login");
    window.addEventListener("bv-unauthorized", on); return () => window.removeEventListener("bv-unauthorized", on);
  }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(null);
    try { const r = await api<{ token: string }>("/auth/login", { body: { password: pw } }); setToken(r.token); setState("open"); } catch (e: any) { setErr(e.message); }
  }
  if (state === "loading") return null;
  if (state === "error") return <div className="mx-auto mt-24 max-w-sm"><ErrorBanner message={err ?? "Cannot reach the API"} onRetry={() => location.reload()} /></div>;
  if (state === "login") return (
    <div className="flex min-h-full items-center justify-center bg-zinc-50 px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border border-zinc-200 bg-white p-6">
        <div><h1 className="text-lg font-semibold">Backlink Verify</h1><p className="text-sm text-zinc-500">QA workspace · enter the team password</p></div>
        {err && <ErrorBanner message={err} />}
        <Field label="Password"><Input type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        <Button className="w-full" disabled={!pw}>Sign in</Button>
      </form>
    </div>
  );
  return <>{children}</>;
}
