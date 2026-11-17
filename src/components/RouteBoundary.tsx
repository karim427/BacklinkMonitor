import React from "react";
import { Button } from "./ui/primitives";

/** Catches a page that fails to load or render. A stale tab after a new deploy can't fetch the old page chunk, so reload once automatically. */
export class RouteBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) {
    const stale = /dynamically imported module|Importing a module script failed|Loading chunk|error loading dynamically/i.test(error.message);
    try {
      if (stale && sessionStorage.getItem("bv_reloaded") !== "1") { sessionStorage.setItem("bv_reloaded", "1"); location.reload(); return; }
      if (!stale) sessionStorage.removeItem("bv_reloaded");
    } catch { /* ignore */ }
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto mt-24 max-w-md rounded-xl border border-zinc-200 p-6 text-center">
        <h2 className="text-base font-semibold">This page could not load</h2>
        <p className="mt-1 text-sm text-zinc-500">The app was probably updated. Reload to get the latest version.</p>
        <Button className="mt-4" onClick={() => { try { sessionStorage.removeItem("bv_reloaded"); } catch { /* ignore */ } location.reload(); }}>Reload</Button>
      </div>
    );
  }
}
