import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { usePortfolio } from "../lib/store";
import { PRIORITY_LABEL, STAGES, STATUSES, type Stage, type Status, type Priority } from "../lib/types";
import { StageBadge, PriorityBadge, StatusBadge, OwnerAvatar, RiskDot } from "../components/badges";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { ChevronLeft, Paperclip, Link2 } from "lucide-react";

export const Route = createFileRoute("/use-cases/$id")({
  component: DetailPage,
  notFoundComponent: () => (
    <div className="p-16 text-center">
      <h1 className="text-xl font-semibold">Use case not found</h1>
      <Link to="/use-cases" className="text-accent-indigo text-sm mt-2 inline-block">Back to master list</Link>
    </div>
  ),
});

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function DetailPage() {
  const { id } = Route.useParams();
  const useCase = usePortfolio((s) => s.useCases.find((u) => u.id === id));
  const updateUseCase = usePortfolio((s) => s.updateUseCase);
  const addComment = usePortfolio((s) => s.addComment);
  const [comment, setComment] = useState("");

  if (!useCase) throw notFound();

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <Link to="/use-cases" className="text-sm text-slate-500 hover:text-slate-900 inline-flex items-center gap-1">
        <ChevronLeft className="size-4" /> All use cases
      </Link>

      <header className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-mono text-slate-400 mb-1">{useCase.id}</p>
            <h1 className="text-2xl font-bold tracking-tight text-balance">{useCase.title}</h1>
            <p className="text-sm text-slate-600 mt-2 max-w-3xl">{useCase.description}</p>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <StageBadge stage={useCase.stage} />
            <StatusBadge status={useCase.status} />
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Facet label="Workgroup" value={useCase.workgroup} />
          <Facet label="Priority" value={<PriorityBadge priority={useCase.priority} />} />
          <Facet label="Risk" value={<RiskDot risk={useCase.risk} />} />
          <Facet label="Owner" value={<span className="inline-flex items-center gap-2"><OwnerAvatar name={useCase.useCaseOwner} size={20} /> {useCase.useCaseOwner}</span>} />
        </div>
      </header>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
          <TabsTrigger value="files">Files</TabsTrigger>
          <TabsTrigger value="comments">Comments ({useCase.comments.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Panel title="Organization">
              <Field label="Business Area" value={useCase.businessArea} />
              <Field label="Strategic Goal" value={useCase.strategicGoal} />
              <Field label="Grouping" value={useCase.grouping} />
            </Panel>
            <Panel title="Ownership">
              <Field label="Business Owner" value={useCase.businessOwner} />
              <Field label="Use Case Owner" value={useCase.useCaseOwner} />
              <Field label="Developer" value={useCase.developer} />
              <Field label="Technical Lead" value={useCase.technicalLead} />
            </Panel>
            <Panel title="Classification">
              <Field label="Category" value={useCase.category} />
              <Field label="Solution Type" value={useCase.solutionType} />
              <Field label="Data Source" value={useCase.dataSource} />
              <Field label="Tags" value={useCase.tags.join(", ")} />
            </Panel>
          </div>

          <Panel title="Quick Edit">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-slate-500 mb-1.5">Stage</p>
                <Select value={useCase.stage} onValueChange={(v) => updateUseCase(useCase.id, { stage: v as Stage })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1.5">Status</p>
                <Select value={useCase.status} onValueChange={(v) => updateUseCase(useCase.id, { status: v as Status })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1.5">Priority</p>
                <Select value={String(useCase.priority)} onValueChange={(v) => updateUseCase(useCase.id, { priority: Number(v) as Priority })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{[1, 2, 3, 4, 5].map((p) => <SelectItem key={p} value={String(p)}>{p} — {PRIORITY_LABEL[p as Priority]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="activity">
          <Panel title="Activity Timeline">
            <ol className="relative border-l border-slate-200 ml-2 space-y-6 pt-2">
              {[...useCase.activity].reverse().map((a) => (
                <li key={a.id} className="pl-6 relative">
                  <span className="absolute -left-[7px] top-1 size-3 rounded-full bg-white border-2 border-accent-indigo" />
                  <p className="text-xs text-slate-400 font-medium">{formatDate(a.date)} · {formatRelative(a.date)}</p>
                  <p className="text-sm text-slate-900 mt-0.5">{a.message}</p>
                  {a.actor && <p className="text-[11px] text-slate-500">by {a.actor}</p>}
                </li>
              ))}
            </ol>
          </Panel>
        </TabsContent>

        <TabsContent value="metrics">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard label="Time Saved / Month" value={`${useCase.timeSavedPerMonth} hrs`} />
            <MetricCard label="Annual Time Saved" value={`${useCase.annualTimeSaved.toLocaleString()} hrs`} />
            <MetricCard label="Cost Savings" value={`$${useCase.costSavings.toLocaleString()}`} />
            <MetricCard label="Effort Reduction" value={`${useCase.effortBefore} → ${useCase.effortAfter}`} sub={`Δ ${useCase.effortBefore - useCase.effortAfter}`} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <Panel title="Proactive vs Reactive">
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex">
                <div className="bg-status-success h-full" style={{ width: `${useCase.proactivePct}%` }} />
                <div className="bg-status-warning h-full" style={{ width: `${useCase.reactivePct}%` }} />
              </div>
              <div className="flex justify-between text-xs mt-2 text-slate-600">
                <span>Proactive {useCase.proactivePct}%</span>
                <span>Reactive {useCase.reactivePct}%</span>
              </div>
            </Panel>
            <Panel title="Complexity & Risk">
              <Field label="Complexity" value={`${useCase.complexity} / 5`} />
              <Field label="Risk" value={`${useCase.risk} / 5`} />
              <Field label="Priority" value={`${useCase.priority} / 5`} />
            </Panel>
          </div>
        </TabsContent>

        <TabsContent value="files">
          <Panel title="Attachments & Links">
            <div className="text-sm text-slate-500 space-y-3">
              <div className="flex items-center gap-2"><Paperclip className="size-4" /> {useCase.attachments.length} attachments</div>
              <div className="flex items-center gap-2"><Link2 className="size-4" /> {useCase.links.length} links</div>
              <p className="text-xs">File uploads and link management are part of the next iteration.</p>
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="comments">
          <Panel title="Discussion">
            <div className="space-y-4">
              {useCase.comments.map((c) => (
                <div key={c.id} className="flex gap-3">
                  <OwnerAvatar name={c.author} size={28} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-900">{c.author}</span>
                      <span className="text-xs text-slate-400">{formatRelative(c.date)}</span>
                    </div>
                    <p className="text-sm text-slate-700 mt-1">{c.body}</p>
                  </div>
                </div>
              ))}
              <div className="border-t border-slate-100 pt-4">
                <Textarea
                  placeholder="Write a comment. Use @ to mention teammates..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                />
                <div className="mt-2 flex justify-end">
                  <Button
                    size="sm"
                    className="bg-accent-indigo hover:bg-accent-indigo/90 text-white"
                    onClick={() => {
                      if (!comment.trim()) return;
                      addComment(useCase.id, comment.trim());
                      setComment("");
                    }}
                  >
                    Post comment
                  </Button>
                </div>
              </div>
            </div>
          </Panel>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Facet({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
      <div className="text-sm text-slate-900">{value}</div>
    </div>
  );
}
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900 mb-4">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-900 font-medium text-right">{value}</span>
    </div>
  );
}
function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      {sub && <p className="text-xs text-status-success mt-1 font-medium">{sub}</p>}
    </div>
  );
}