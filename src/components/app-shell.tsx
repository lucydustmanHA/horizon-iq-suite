
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Table2, KanbanSquare, Sparkles, Search, Plus, AlertCircle } from "lucide-react";
import { useState, useRef, type ReactNode } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";
import { usePortfolio } from "../lib/store";
import { WORKGROUPS, STAGES, BUSINESS_AREAS, STRATEGIC_FOCUSES, GROUPINGS, VENDORS, SOLUTION_TYPES, PRIORITY_LABEL } from "../lib/types";
import { $createUseCase } from "../lib/use-cases.server";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/use-cases", label: "Use Cases", icon: Table2 },
  { to: "/kanban", label: "Kanban", icon: KanbanSquare },
  { to: "/insights", label: "Insights", icon: Sparkles },
] as const;

/** Dropdown with a "+ Add custom..." option at the bottom */
function CreatableSelect({ value, options, onChange, placeholder = "Select…" }: {
  value: string; options: readonly string[]; onChange: (v: string) => void; placeholder?: string;
}) {
  const [custom, setCustom] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  if (custom) return (
    <div className="flex gap-2">
      <Input ref={inputRef} autoFocus placeholder="Type custom value…" value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && draft.trim()) { onChange(draft.trim()); setCustom(false); setDraft(""); }
          if (e.key === "Escape") { setCustom(false); setDraft(""); }
        }}
        className="flex-1 h-9 text-sm"
      />
      <Button size="sm" variant="outline" onClick={() => { setCustom(false); setDraft(""); }}>Cancel</Button>
    </div>
  );
  return (
    <Select value={value} onValueChange={(v) => { if (v === "__custom__") { setCustom(true); setTimeout(() => inputRef.current?.focus(), 0); } else onChange(v); }}>
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
  const blank = () => ({
    title: "", workgroup: WORKGROUPS[0] as string, stage: "Submitted" as string,
    priority: "1", owner: "", businessOwner: "", businessArea: "", strategicGoal: "",
    grouping: "", vendor: "", solutionType: "", dataSource: "", description: "",
  });
  const [f, setF] = useState(blank());
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const close = () => { setF(blank()); setSaving(false); onClose(); };

  const handleSubmit = async () => {
    if (!f.title.trim()) return;
    setSaving(true);
    try {
      const uc = await $createUseCase({ data: {
        title: f.title.trim(), workgroup: f.workgroup, stage: f.stage,
        priority: Number(f.priority) as 1 | 2,
        owner: f.owner, businessOwner: f.businessOwner,
        businessArea: f.businessArea, strategicGoal: f.strategicGoal,
        grouping: f.grouping, vendor: f.vendor, solutionType: f.solutionType,
        dataSource: f.dataSource, description: f.description,
      }});
      addUseCase(uc);
      close();
      navigate({ to: "/use-cases/$id", params: { id: uc.id } });
    } catch (err) {
      console.error("[DB] createUseCase failed:", err);
      setSaving(false);
    }
  };

  const row2 = "grid grid-cols-2 gap-3";
  const label = (t: string) => <label className="text-xs font-medium text-slate-500 mb-1 block">{t}</label>;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New Use Case</DialogTitle></DialogHeader>
        <div className="space-y-4 py-1">
          <div>
            {label("Title *")}
            <Input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Automated Invoice Processing" autoFocus />
          </div>
          <div className={row2}>
            <div>{label("Workgroup")}<CreatableSelect value={f.workgroup} options={WORKGROUPS} onChange={(v) => set("workgroup", v)} /></div>
            <div>{label("Stage")}
              <Select value={f.stage} onValueChange={(v) => set("stage", v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className={row2}>
            <div>{label("Priority")}
              <Select value={f.priority} onValueChange={(v) => set("priority", v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">2026</SelectItem>
                  <SelectItem value="2">2027+</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>{label("Business Area")}<CreatableSelect value={f.businessArea} options={BUSINESS_AREAS} onChange={(v) => set("businessArea", v)} placeholder="Select…" /></div>
          </div>
          <div className={row2}>
            <div>{label("Strategic Focus")}<CreatableSelect value={f.strategicGoal} options={STRATEGIC_FOCUSES} onChange={(v) => set("strategicGoal", v)} placeholder="Select…" /></div>
            <div>{label("Grouping")}<CreatableSelect value={f.grouping} options={GROUPINGS} onChange={(v) => set("grouping", v)} placeholder="Select…" /></div>
          </div>
          <div className={row2}>
            <div>{label("Use Case Owner")}<Input value={f.owner} onChange={(e) => set("owner", e.target.value)} placeholder="e.g. Jane Smith" /></div>
            <div>{label("Business Owner")}<Input value={f.businessOwner} onChange={(e) => set("businessOwner", e.target.value)} placeholder="e.g. John Doe" /></div>
          </div>
          <div className={row2}>
            <div>{label("Vendor")}<CreatableSelect value={f.vendor} options={VENDORS} onChange={(v) => set("vendor", v)} placeholder="Select…" /></div>
            <div>{label("Solution Type")}<CreatableSelect value={f.solutionType} options={SOLUTION_TYPES} onChange={(v) => set("solutionType", v)} placeholder="Select…" /></div>
          </div>
          <div>{label("Data Source")}<Input value={f.dataSource} onChange={(e) => set("dataSource", e.target.value)} placeholder="e.g. ERP, HRIS, Manual" /></div>
          <div>{label("Description")}
            <Textarea value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="Brief description of the use case…" rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={saving}>Cancel</Button>
          <Button className="bg-accent-indigo hover:bg-accent-indigo/90 text-white" onClick={handleSubmit} disabled={saving || !f.title.trim()}>
            {saving ? "Creating…" : "Create use case"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [newOpen, setNewOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const actionNeededCount = usePortfolio((s) => s.useCases.filter((u) => u.status === "Action Needed").length);

  const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && searchQ.trim()) {
      navigate({ to: "/use-cases", search: { q: searchQ.trim() } });
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <aside className="w-64 shrink-0 bg-brand text-brand-foreground flex flex-col">
        <div className="p-6">
          <Link to="/" className="flex items-center gap-3">
            <div className="size-8 rounded-lg bg-accent-indigo grid place-items-center font-bold text-white tracking-tighter text-xs">HQX</div>
            <span className="font-semibold tracking-tight text-lg">Horizon QX</span>
          </Link>
        </div>
        <nav className="flex-1 px-4 space-y-1">
          {NAV.map(({ to, label: navLabel, icon: Icon }) => {
            const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
            return (
              <Link key={to} to={to} className={"flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors " + (active ? "bg-white/10 text-white" : "text-slate-400 hover:text-white hover:bg-white/5")}>
                <Icon className="size-4" /><span>{navLabel}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-8 shrink-0 gap-4">
          <div className="relative w-96 max-w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none" />
            <Input type="text" placeholder="Search use cases…" value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)} onKeyDown={handleSearch}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border-slate-200 rounded-lg text-sm"
            />
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {actionNeededCount > 0 && (
              <Link to="/action-needed"
                className="flex items-center gap-1.5 text-xs font-medium text-status-warning bg-amber-50 border border-amber-200 rounded-full px-3 py-1.5 hover:bg-amber-100 transition-colors">
                <AlertCircle className="size-3.5" />
                {actionNeededCount} Action Needed
              </Link>
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
