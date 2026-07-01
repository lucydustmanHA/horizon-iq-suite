import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Table2,
  KanbanSquare,
  Sparkles,
  Search,
  Bell,
  Plus,
} from "lucide-react";
import type { ReactNode } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/use-cases", label: "Use Cases", icon: Table2 },
  { to: "/kanban", label: "Kanban", icon: KanbanSquare },
  { to: "/insights", label: "Insights", icon: Sparkles },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <aside className="w-64 shrink-0 bg-brand text-brand-foreground flex flex-col">
        <div className="p-6">
          <Link to="/" className="flex items-center gap-3">
            <div className="size-8 rounded-lg bg-accent-indigo grid place-items-center font-bold text-white tracking-tighter text-xs">
              HQX
            </div>
            <span className="font-semibold tracking-tight text-lg">Horizon QX</span>
          </Link>
        </div>
        <nav className="flex-1 px-4 space-y-1">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors " +
                  (active
                    ? "bg-white/10 text-white"
                    : "text-slate-400 hover:text-white hover:bg-white/5")
                }
              >
                <Icon className="size-4" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-full bg-slate-800 outline-1 -outline-offset-1 outline-white/10 grid place-items-center text-[10px] font-semibold text-slate-300">
              MV
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white truncate">Marcus Vane</p>
              <p className="text-[10px] text-slate-400 truncate">Portfolio Director</p>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-8 shrink-0">
          <div className="relative w-96 max-w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none" />
            <Input
              type="text"
              placeholder="Search portfolio or use cases..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border-slate-200 rounded-lg text-sm"
            />
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="size-8 rounded-full grid place-items-center text-slate-500 hover:bg-slate-100 transition-colors"
              aria-label="Notifications"
            >
              <Bell className="size-4" />
            </button>
            <Button className="bg-accent-indigo hover:bg-accent-indigo/90 text-white gap-1.5">
              <Plus className="size-4" />
              New Use Case
            </Button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </main>
    </div>
  );
}