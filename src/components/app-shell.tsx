import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Table2, KanbanSquare, Sparkles, Search, Plus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";
import { usePortfolio } from "../lib/store";
import { WORKGROUPS, STAGES } from "../lib/types";
import { $createUseCase } from "../lib/use-cases.server";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/use-cases", label: "Use Cases", icon: Table2 },
  { to: "/kanban", label: "Kanban", icon: KanbanSquare },
  { to: "/insights", label: "Insights", icon: Sparkles },
] as const;

function NewUseCaseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const addUseCase = usePortfolio((s) => s.addUseCase);
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [workgroup, setWorkgroup] = useState<string>(WORKGROUPS[0]);
  const [stage, setStage] = useState<string>(STAGES[0]);
  const [owner, setOwner] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => { setTitle(""); setWorkgroup(WORKGROUPS[0]); setStage(STAGES[0]); setOwner(""); setDescription(""); setSaving(false); };
  const close = () => { reset(); onClose(); };

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const uc = await $createUseCase({ data: { title: title.trim(), workgroup, stage, owner, description } });
      addUseCase(uc);
      close();
      navigate({ to: "/use-cases/$id", params: { id: uc.id } });
    } catch (err) {
      console.error("[DB] createUseCase failed:", err);
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>New Use Case</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1.5 block">Title *</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Automated Invoice Processing" autoFocus onKeyDown={(e) => e.key === "Enter" && handleSubmit()} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1.5 block">Workgroup</label>
              <Select value={workgroup} onValueChange={setWorkgroup}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{WORKGROUPS.map((wg) => <SelectItem key={wg} value={wg}>{wg}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1.5 block">Stage</label>
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1.5 block">Owner</label>
            <Input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="e.g. Jane Smith" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1.5 block">Description</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description of the use case..." rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={saving}>Cancel</Button>
          <Button className="bg-accent-indigo hover:bg-accent-indigo/90 text-white" onClick={handleSubmit} disabled={saving || !title.trim()}>
            {saving ? "Creating…" : "Create use case"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [newOpen, setNewOpen] = useState(false);
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
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
            return (
              <Link key={to} to={to} className={"flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors " + (active ? "bg-white/10 text-white" : "text-slate-400 hover:text-white hover:bg-white/5")}>
                <Icon className="size-4" /><span>{label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-8 shrink-0">
          <div className="relative w-96 max-w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none" />
            <Input type="text" placeholder="Search portfolio or use cases..." className="w-full pl-10 pr-4 py-2 bg-slate-50 border-slate-200 rounded-lg text-sm" />
          </div>
          <Button className="bg-accent-indigo hover:bg-accent-indigo/90 text-white gap-1.5" onClick={() => setNewOpen(true)}>
            <Plus className="size-4" />New Use Case
          </Button>
        </header>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </main>
      <NewUseCaseDialog open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}
