/**
 * StrategyShell — sidebar + header for /strategy/*. Mirrors AppShell's layout, sizes and
 * tokens exactly so the two sides read as one product.
 */
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { LayoutDashboard, Building2, ChevronDown, Rocket, CalendarDays, Presentation, ClipboardList, Settings, Search, Plus } from "lucide-react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { usePortfolio } from "../lib/store";
import { $getSettings } from "../lib/settings.server";
import { useStrategyUI, useStrategyOptions, useAvailableYears } from "../lib/strategy-hooks";
import { SideSwitcher } from "./side-switcher";
import { GoalDialog } from "./strategy/ui";

const NAV = [
  { to: "/strategy/initiatives", label: "Initiatives", icon: Rocket },
  { to: "/strategy/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/strategy/review", label: "Leadership Review", icon: Presentation },
  { to: "/strategy/deep-dives", label: "Deep Dives", icon: ClipboardList },
] as const;

const linkCls = (active: boolean) =>
  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors " +
  (active ? "bg-white/10 text-white" : "text-slate-400 hover:text-white hover:bg-white/5");

export function StrategyShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const appName = usePortfolio((s) => s.appName ?? "Horizon QX");
  const settingsLoaded = usePortfolio((s) => s.settingsLoaded);
  const setSettings = usePortfolio((s) => s.setSettings);
  const { year, setYear, search, setSearch } = useStrategyUI();
  const years = useAvailableYears();
  const { departments } = useStrategyOptions();
  const [deptOpen, setDeptOpen] = useState(true);
  const [newOpen, setNewOpen] = useState(false);

  useEffect(() => {
    if (!settingsLoaded) $getSettings().then(setSettings).catch(console.error);
  }, [settingsLoaded, setSettings]);

  const inDept = pathname.startsWith("/strategy/departments");
  const deptPath = (d: string) => `/strategy/departments/${encodeURIComponent(d)}`;

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <aside className="hidden md:flex w-64 shrink-0 bg-brand text-brand-foreground flex-col no-print" data-no-print>
        <div className="p-6 pb-4">
          <Link to="/strategy" className="flex items-center gap-3">
            <img src="/logo.svg" alt="Horizon" className="size-9 rounded-full" />
            <span className="leading-tight">
              <span className="block font-semibold tracking-tight text-lg">{appName}</span>
              <span className="block text-[11px] text-slate-400 font-medium">Business Transformation</span>
            </span>
          </Link>
        </div>
        <SideSwitcher current="strategy" />
        <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
          <Link to="/strategy" className={linkCls(pathname === "/strategy" || pathname === "/strategy/")}>
            <LayoutDashboard className="size-4" /><span>Dashboard</span>
          </Link>
          <div>
            <button onClick={() => setDeptOpen(!deptOpen)} className={linkCls(inDept && !deptOpen) + " w-full"}>
              <Building2 className="size-4" /><span className="flex-1 text-left">Departments</span>
              <ChevronDown className={`size-3.5 transition-transform ${deptOpen ? "" : "-rotate-90"}`} />
            </button>
            {deptOpen && (
              <div className="mt-0.5 space-y-0.5">
                {departments.map((d) => {
                  const active = decodeURIComponent(pathname) === `/strategy/departments/${d}`;
                  return (
                    <Link key={d} to={deptPath(d) as any}
                      className={"flex items-center gap-2 pl-10 pr-3 py-1.5 rounded-md text-[13px] transition-colors " + (active ? "bg-white/10 text-white" : "text-slate-400 hover:text-white hover:bg-white/5")}>
                      {d}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to as any} className={linkCls(pathname.startsWith(to))}>
              <Icon className="size-4" /><span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="px-4 pb-4">
          <Link to="/settings" className={linkCls(pathname.startsWith("/settings"))}>
            <Settings className="size-4" /><span>Settings & Admin</span>
          </Link>
        </div>
      </aside>
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-8 shrink-0 gap-4">
          <div className="relative w-96 max-w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none" />
            <Input type="text" placeholder="Search goals, owners, initiatives…" value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border-slate-200 rounded-lg text-sm" />
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="h-9 w-[120px] text-sm font-semibold" aria-label="Plan year">
                <span className="text-slate-400 font-normal mr-1">FY</span><SelectValue />
              </SelectTrigger>
              <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
            <Button className="bg-accent-indigo hover:bg-accent-indigo/90 text-white gap-1.5" onClick={() => setNewOpen(true)}>
              <Plus className="size-4" />New Goal
            </Button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto app-content">{children}</div>
      </main>
      <GoalDialog open={newOpen} onClose={() => setNewOpen(false)}
        defaults={inDept ? { department: decodeURIComponent(pathname.split("/").pop() ?? "") } : undefined}
        onSaved={(id) => navigate({ to: "/strategy/goals/$id" as any, params: { id } as any })} />
    </div>
  );
}
