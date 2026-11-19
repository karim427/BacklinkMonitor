import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, X } from "lucide-react";
import { Card } from "@/components/ui/primitives";

export interface SetupState { clients: number; targetPages: number; links: number; checked: boolean }
const KEY = "bv-getting-started-hidden";
const read = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };

/** A short checklist for someone new: what to do first, in order. It ticks itself off from real data and hides when everything is done. */
export function GettingStarted({ setup }: { setup?: SetupState }) {
  const [hidden, setHidden] = useState(read());
  if (!setup || hidden) return null;
  const steps = [
    { done: setup.clients > 0, to: "/clients", title: "Add the client's website", text: "Clients > Add website. Enter the real domain and pick the niche." },
    { done: setup.targetPages > 0, to: "/target-pages", title: "Choose the pages to get links for", text: "Target pages > Find pages from sitemap. Tick the pages and blogs you want, and fix the keyword if needed." },
    { done: setup.links > 0, to: "/links", title: "Add each link when it is placed", text: "Links > Add link. Pick the client, paste the page where the link sits and the page it points to. The donor site is added for you." },
    { done: setup.checked, to: "/links", title: "Check the link", text: "Click Verify now on the link. Once it is live, the Check column tells you if it counts." },
    { done: false, to: "/rechecks", title: "Come back every month", text: "Dashboard shows progress against the target. Rechecks shows which links are due to be looked at again." },
  ];
  const next = steps.findIndex((s) => !s.done);
  if (next === -1) return null;
  const close = () => { try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ } setHidden(true); };
  return (
    <Card className="mb-6 p-5">
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="text-sm font-semibold">Getting started</h2><p className="mt-0.5 text-sm text-zinc-600">New here? Do these in order. Each step ticks itself off. The Guide page explains every word.</p></div>
        <button onClick={close} title="Hide" className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"><X className="h-4 w-4" /></button>
      </div>
      <ol className="mt-3 space-y-2">
        {steps.map((s, i) => (
          <li key={s.title} className={`flex items-start gap-3 rounded-lg border ${s.done ? "px-3 py-1.5" : "p-3"} ${i === next ? "border-blue-200 bg-blue-50/50" : "border-zinc-100"}`}>
            <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-medium ${s.done ? "bg-green-600 text-white" : i === next ? "bg-blue-600 text-white" : "bg-zinc-200 text-zinc-600"}`}>{s.done ? <Check className="h-3 w-3" /> : i + 1}</span>
            <div className="min-w-0 text-sm"><Link to={s.to} className={`font-medium hover:underline ${s.done ? "text-zinc-400 line-through" : ""}`}>{s.title}</Link>{!s.done && <p className="text-zinc-600">{s.text}</p>}</div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
