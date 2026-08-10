
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { CelebrationOverlay } from "./celebration";
import { LayoutDashboard, Table2, KanbanSquare, Sparkles, Search, Plus, AlertCircle, Settings, Rocket, DollarSign, CalendarDays } from "lucide-react";

import { useState, type ReactNode, useEffect } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";
import { usePortfolio } from "../lib/store";
import { STAGES } from "../lib/types";
import { $createUseCase } from "../lib/use-cases.server";
import { $getSettings, $upsertSettingOption, $removeSettingOption } from "../lib/settings.server";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/use-cases", label: "Use Cases", icon: Table2 },
  { to: "/kanban", label: "Kanban", icon: KanbanSquare },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/live", label: "Live & Delivering", icon: Rocket },
] as const;

function CreatableSelect({ value, optKey, onChange, placeholder = "Select…" }: {
  value: string; optKey: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const { settings, addSettingOption } = usePortfolio();
  const options = settings[optKey] ?? [];
  const [custom, setCustom] = useState(false);
  const [draft, setDraft] = useState("");
  if (custom) return (
    <div className="flex gap-2">
      <Input autoFocus placeholder="Type custom value…" value={draft} onChange={(e) => setDraft(e.target.value)}
        className="flex-1 h-9 text-sm"
        onKeyDown={(e) => { if (e.key === "Enter" && draft.trim()) { addSettingOption(optKey, draft.trim()); $upsertSettingOption({ data: { key: optKey, value: draft.trim() } }).then(() => $getSettings().then(setSettings)).catch(console.error); onChange(draft.trim()); setCustom(false); setDraft(""); } if (e.key === "Escape") { setCustom(false); setDraft(""); } }} />
      <Button size="sm" variant="outline" onClick={() => { setCustom(false); setDraft(""); }}>Cancel</Button>
    </div>
  );
  return (
    <Select value={value || "__none__"} onValueChange={(v) => { if (v === "__custom__") setCustom(true); else if (v !== "__none__") onChange(v); }}>
      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent className="max-h-60">
        {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        <SelectItem value="__custom__"><span className="text-accent-indigo font-medium">+ Add custom…</span></SelectItem>
      </SelectContent>
    </Select>
  );
}

function NewUseCaseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const addUseCase = usePortfolio((s) => s.addUseCase);
  const navigate = useNavigate();
  const blank = () => ({ title:"",workgroup:"",stage:"Submitted",priority:"1",owner:"",businessOwner:"",businessArea:"",strategicGoal:"",grouping:"",vendor:"",solutionType:"",dataSource:"",description:"" });
  const [f, setF] = useState(blank());
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const close = () => { setF(blank()); setSaving(false); onClose(); };
  const handleSubmit = async () => {
    if (!f.title.trim()) return;
    setSaving(true);
    try {
      const uc = await $createUseCase({ data: { title:f.title.trim(),workgroup:f.workgroup,stage:f.stage,priority:Number(f.priority) as 1|2,owner:f.owner,businessOwner:f.businessOwner,businessArea:f.businessArea,strategicGoal:f.strategicGoal,grouping:f.grouping,vendor:f.vendor,solutionType:f.solutionType,dataSource:f.dataSource,description:f.description } });
      addUseCase(uc);
      close();
      navigate({ to: "/use-cases/$id", params: { id: uc.id } });
    } catch (err) { console.error(err); setSaving(false); }
  };
  const label = (t: string) => <label className="text-xs font-medium text-slate-500 mb-1 block">{t}</label>;
  const row2 = "grid grid-cols-2 gap-3";
  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New Use Case</DialogTitle></DialogHeader>
        <div className="space-y-4 py-1">
          <div>{label("Title *")}<Input value={f.title} onChange={(e) => set("title",e.target.value)} placeholder="e.g. Automated Invoice Processing" autoFocus /></div>
          <div className={row2}>
            <div>{label("Workgroup")}<CreatableSelect value={f.workgroup} optKey="workgroup" onChange={(v)=>set("workgroup",v)} /></div>
            <div>{label("Stage")}<Select value={f.stage} onValueChange={(v)=>set("stage",v)}><SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger><SelectContent>{STAGES.map((s)=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className={row2}>
            <div>{label("Priority")}<Select value={f.priority} onValueChange={(v)=>set("priority",v)}><SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">2026</SelectItem><SelectItem value="2">2027+</SelectItem></SelectContent></Select></div>
            <div>{label("Business Area")}<CreatableSelect value={f.businessArea} optKey="business_area" onChange={(v)=>set("businessArea",v)} placeholder="Select…" /></div>
          </div>
          <div className={row2}>
            <div>{label("Strategic Focus")}<CreatableSelect value={f.strategicGoal} optKey="strategic_focus" onChange={(v)=>set("strategicGoal",v)} placeholder="Select…" /></div>
            <div>{label("Grouping")}<CreatableSelect value={f.grouping} optKey="grouping" onChange={(v)=>set("grouping",v)} placeholder="Select…" /></div>
          </div>
          <div className={row2}>
            <div>{label("Use Case Owner")}<Input value={f.owner} onChange={(e)=>set("owner",e.target.value)} placeholder="e.g. Jane Smith" /></div>
            <div>{label("Business Owner")}<Input value={f.businessOwner} onChange={(e)=>set("businessOwner",e.target.value)} placeholder="e.g. John Doe" /></div>
          </div>
          <div className={row2}>
            <div>{label("Vendor")}<CreatableSelect value={f.vendor} optKey="vendor" onChange={(v)=>set("vendor",v)} placeholder="Select…" /></div>
            <div>{label("Solution Type")}<CreatableSelect value={f.solutionType} optKey="solution_type" onChange={(v)=>set("solutionType",v)} placeholder="Select…" /></div>
          </div>
          <div>{label("Data Source")}<Input value={f.dataSource} onChange={(e)=>set("dataSource",e.target.value)} placeholder="e.g. ERP, HRIS" /></div>
          <div>{label("Description")}<Textarea value={f.description} onChange={(e)=>set("description",e.target.value)} rows={3} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={saving}>Cancel</Button>
            
          <Button className="bg-accent-indigo hover:bg-accent-indigo/90 text-white" onClick={handleSubmit} disabled={saving||!f.title.trim()}>{saving?"Creating…":"Create use case"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [newOpen, setNewOpen] = useState(false);
  const setSearchQuery    = usePortfolio((s) => s.setSearchQuery);
  const searchQuery       = usePortfolio((s) => s.searchQuery);
  const settingsLoaded    = usePortfolio((s) => s.settingsLoaded);
  const setSettings       = usePortfolio((s) => s.setSettings);
  const actionNeededCount = usePortfolio((s) => s.useCases.filter((u) => u.status === "Blocked" || u.status === "Action Needed").length);

  // Load settings once
  useEffect(() => {
    if (!settingsLoaded) {
      $getSettings().then(setSettings).catch(console.error);
    }
  }, [settingsLoaded, setSettings]);

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <aside className="hidden md:flex w-64 shrink-0 bg-brand text-brand-foreground flex-col no-print" data-no-print>
        <div className="p-6"><Link to="/" className="flex items-center gap-3"><img src="/logo.svg" alt="Horizon AI" className="size-9 rounded-full" /><span className="font-semibold tracking-tight text-lg">Horizon QX</span></Link></div>
        <nav className="flex-1 px-4 space-y-1">
          {NAV.slice(0, 3).map(({ to, label: navLabel, icon: Icon }) => {
            const active = to === "/" ? pathname === "/" : to === "/use-cases" ? pathname === "/use-cases" : pathname.startsWith(to);
            return <Link key={to} to={to} className={"flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors "+(active?"bg-white/10 text-white":"text-slate-400 hover:text-white hover:bg-white/5")}><Icon className="size-4" /><span>{navLabel}</span></Link>;
          })}
          <a href="/portfolios" className={"flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors "+(pathname.startsWith("/portfolios")?"bg-white/10 text-white":"text-slate-400 hover:text-white hover:bg-white/5")}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg><span>Portfolios</span>
          </a>
          {NAV.slice(3).map(({ to, label: navLabel, icon: Icon }) => {
            const active = to === "/" ? pathname === "/" : to === "/use-cases" ? pathname === "/use-cases" : pathname.startsWith(to);
            return <Link key={to} to={to} className={"flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors "+(active?"bg-white/10 text-white":"text-slate-400 hover:text-white hover:bg-white/5")}><Icon className="size-4" /><span>{navLabel}</span></Link>;
          })}
        </nav>
        <div className="px-4 pb-4">
          <a href="/admin" className={"flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors "+(pathname.startsWith("/admin")?"bg-white/10 text-white":"text-slate-300 hover:text-white hover:bg-white/5")}>
            <DollarSign className="size-4" /><span>Admin</span>
          </a>
          <a href="/settings" className={"flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors "+(pathname.startsWith("/settings")?"bg-white/10 text-white":"text-slate-400 hover:text-white hover:bg-white/5")}>
            <Settings className="size-4" /><span>Settings</span>
          </a>
        </div>
      </aside>
      <CelebrationOverlay />
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-8 shrink-0 gap-4">
          <div className="relative w-96 max-w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none" />
            <Input type="text" placeholder="Search use cases…" value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border-slate-200 rounded-lg text-sm" />
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {actionNeededCount > 0 && (
              <a href="/action-needed" className="flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1.5 hover:bg-amber-100 transition-colors">
                <AlertCircle className="size-3.5" />{actionNeededCount} flagged
              </a>
            )}
            <Button className="bg-accent-indigo hover:bg-accent-indigo/90 text-white gap-1.5" onClick={() => setNewOpen(true)}>
              <Plus className="size-4" />New Use Case
            </Button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </main>
      <NewUseCaseDialog open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}
