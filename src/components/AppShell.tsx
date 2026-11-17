import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { BookUser, Building2, FileCheck2, Gauge, Globe2, Link2, ListChecks, Menu, MapPin, Megaphone, Plus, RefreshCcw, Search, Settings, Users, LogOut, X } from "lucide-react";
import { Badge, Button } from "./ui/primitives";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

const NAV = [
  { to: "/", label: "Dashboard", icon: Gauge, end: true },
  { to: "/clients", label: "Clients", icon: Building2 },
  { to: "/target-links", label: "Target links", icon: ListChecks },
  { to: "/links", label: "Links", icon: Link2 },
  { to: "/target-pages", label: "Target pages", icon: FileCheck2 },
  { to: "/donors", label: "Donors", icon: Globe2 },
  { to: "/citations", label: "Citations", icon: MapPin },
  { to: "/rechecks", label: "Rechecks", icon: RefreshCcw },
  { to: "/prospects", label: "Prospects", icon: Search, badge: "AI", admin: true },
  { to: "/haro", label: "HARO", icon: Megaphone, badge: "AI", admin: true },
  { to: "/users", label: "Users", icon: Users, admin: true },
  { to: "/settings", label: "Settings", icon: Settings, admin: true },
];

export function AppShell() {
  const [open, setOpen] = useState(false);
  const loc = useLocation(); const nav = useNavigate(); const { user, logout, isAdmin } = useAuth();
  const items = NAV.filter((n) => isAdmin || !("admin" in n && n.admin));
  const current = items.find((n) => (n.end ? loc.pathname === n.to : loc.pathname.startsWith(n.to)))?.label ?? "Not found";
  return (
    <div className="flex h-dvh overflow-hidden">
      <aside className={cn("fixed inset-y-0 left-0 z-30 flex h-dvh w-60 shrink-0 flex-col bg-black text-white transition-transform lg:static lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex items-center justify-between px-5 py-5">
          <div><div className="text-base font-semibold">Backlink Verify</div><div className="text-xs text-zinc-400">QA workspace</div></div>
          <button className="lg:hidden" aria-label="Close menu" onClick={() => setOpen(false)}><X className="h-5 w-5" /></button>
        </div>
        <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain px-3 pb-2 [scrollbar-color:#52525b_transparent] [scrollbar-width:thin]">
          {items.map(({ to, label, icon: Icon, end, badge }) => (
            <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)}
              className={({ isActive }) => cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm", isActive ? "bg-white/15 font-medium" : "text-zinc-300 hover:bg-white/10")}>
              <Icon className="h-4 w-4" />{label}
              {badge && <Badge tone="neutral" className="ml-auto border-white/20 bg-white/10 text-[10px] text-white">{badge}</Badge>}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 px-4 py-3">
          {user && <div className="mb-2 flex items-center justify-between gap-2">
            <div className="min-w-0"><div className="truncate text-xs text-zinc-300" title={user.email}>{user.email}</div><div className="text-[10px] uppercase tracking-wide text-zinc-500">{user.role}</div></div>
            <button className="shrink-0 rounded-md p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white" aria-label="Sign out" title="Sign out" onClick={logout}><LogOut className="h-4 w-4" /></button>
          </div>}
          <div className="text-xs text-zinc-500">internal tool · v0.1</div>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-20 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 lg:px-8">
          <div className="flex items-center gap-3">
            <button className="lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}><Menu className="h-5 w-5" /></button>
            <div className="text-sm text-zinc-500">Backlink Verify <span className="mx-1">/</span> <span className="font-medium text-zinc-900">{current}</span></div>
          </div>
          <Button onClick={() => nav("/links?new=1")}><Plus className="h-4 w-4" />Add link</Button>
        </header>
        <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8"><div className="mx-auto max-w-7xl"><Outlet /></div></main>
      </div>
    </div>
  );
}
void BookUser;
