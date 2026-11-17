import { useEffect, useState } from "react";
import { Button, ErrorBanner, Field, Input } from "./ui/primitives";
import { api, getToken, setToken } from "@/lib/api";
import { AuthContext, type Me } from "@/lib/auth";

/** Email + 6-digit-code sign-in. Sessions last 30 days, so the code is only needed on a new device or after expiry. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"loading" | "open" | "email" | "code" | "error">("loading");
  const [user, setUser] = useState<Me | null>(null);
  const [email, setEmail] = useState(""); const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const check = () => api<{ required: boolean }>("/auth/status").then(async (r) => {
      if (!r.required) return setState("open");
      if (!getToken()) return setState("email");
      try { setUser((await api<{ user: Me }>("/auth/me")).user); setState("open"); } catch { setToken(null); setState("email"); }
    }).catch((e) => { setErr(e.message); setState("error"); });
    check();
    const on = () => { setUser(null); setState("email"); };
    window.addEventListener("bv-unauthorized", on); return () => window.removeEventListener("bv-unauthorized", on);
  }, []);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault(); setErr(null); setNote(null); setBusy(true);
    try { await api("/auth/request-code", { body: { email } }); setCode(""); setState("code"); setNote("If that email has access, a 6-digit code is on its way."); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  async function verify(e: React.FormEvent) {
    e.preventDefault(); setErr(null); setBusy(true);
    try { const r = await api<{ token: string; user: Me }>("/auth/verify-code", { body: { email, code } }); setToken(r.token); setUser(r.user); setState("open"); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  const logout = () => { setToken(null); setUser(null); setState("email"); setCode(""); setErr(null); setNote(null); };

  if (state === "loading") return null;
  if (state === "error") return <div className="mx-auto mt-24 max-w-sm"><ErrorBanner message={err ?? "Cannot reach the API"} onRetry={() => location.reload()} /></div>;
  if (state === "email" || state === "code") return (
    <div className="flex min-h-full items-center justify-center bg-zinc-50 px-4">
      <form onSubmit={state === "email" ? sendCode : verify} className="w-full max-w-sm space-y-4 rounded-xl border border-zinc-200 bg-white p-6">
        <div><h1 className="text-lg font-semibold">Backlink Verify</h1>
          <p className="text-sm text-zinc-500">{state === "email" ? "Sign in with your invited email address." : `Enter the 6-digit code sent to ${email}.`}</p></div>
        {err && <ErrorBanner message={err} />}
        {note && !err && <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">{note}</div>}
        {state === "email"
          ? <Field label="Email"><Input type="email" autoFocus autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          : <Field label="Code"><Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus className="text-center text-lg tracking-[0.5em]" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} /></Field>}
        <Button className="w-full" disabled={busy || (state === "email" ? !email : code.length !== 6)}>{busy ? "Please wait…" : state === "email" ? "Send code" : "Sign in"}</Button>
        {state === "code" && <div className="flex justify-between text-sm"><button type="button" className="text-zinc-500 hover:underline" onClick={() => { setState("email"); setErr(null); setNote(null); }}>Use a different email</button><button type="button" className="text-zinc-500 hover:underline" disabled={busy} onClick={() => sendCode()}>Resend code</button></div>}
      </form>
    </div>
  );
  return <AuthContext.Provider value={{ user, logout }}>{children}</AuthContext.Provider>;
}
