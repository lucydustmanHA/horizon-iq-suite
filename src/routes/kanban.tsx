import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { usePortfolio } from "../lib/store";
import { STAGES, type Stage, WORKGROUPS } from "../lib/types";
import { PriorityBadge, OwnerAvatar, FlagBadge, flagRowClass } from "../components/badges";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import type { UseCase } from "../lib/types";

export const Route = createFileRoute("/kanban")({
  head: () => ({
    meta: [
      { title: "Kanban — Horizon QX" },
      { name: "description", content: "Drag and drop use cases through their lifecycle." },
    ],
  }),
  component: KanbanPage,
});

function KanbanPage() {
  const useCases = usePortfolio((s) => s.useCases);
  const moveStage = usePortfolio((s) => s.moveStage);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [wg, setWg] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"board"|"list">("board");

  const filtered = useMemo(
    () => useCases.filter((u) => wg === "all" || u.workgroup === wg),
    [useCases, wg],
  );

  const byStage = useMemo(() => {
    const map: Record<Stage, UseCase[]> = Object.fromEntries(
      STAGES.map((s) => [s, [] as UseCase[]]),
    ) as Record<Stage, UseCase[]>;
    for (const u of filtered) map[u.stage].push(u);
    return map;
  }, [filtered]);

  const activeCase = activeId ? useCases.find((u) => u.id === activeId) : null;

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }
  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const overId = e.over?.id ? String(e.over.id) : null;
    if (!overId) return;
    if (STAGES.includes(overId as Stage)) {
      moveStage(String(e.active.id), overId as Stage);
    }
  }

  return (
    <div className="p-8 space-y-6 h-full flex flex-col">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Kanban Planner</h1>
          <p className="text-sm text-slate-500 mt-1">Drag cards to move between lifecycle stages.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setViewMode("board")} className={"px-3 py-1.5 rounded text-sm font-medium border transition-colors "+(viewMode==="board"?"bg-accent-indigo text-white border-accent-indigo":"text-slate-500 border-slate-200 hover:border-accent-indigo")}>Board</button>
          <button onClick={() => setViewMode("list")} className={"px-3 py-1.5 rounded text-sm font-medium border transition-colors "+(viewMode==="list"?"bg-accent-indigo text-white border-accent-indigo":"text-slate-500 border-slate-200 hover:border-accent-indigo")}>List</button>
        </div>
        <Select value={wg} onValueChange={setWg}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Workgroup" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All workgroups</SelectItem>
            {WORKGROUPS.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
          </SelectContent>
        </Select>
      </header>

      {viewMode === "list" ? (
        <KanbanList byStage={byStage} />
      ) : null}
      {viewMode === "board" && <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-4 min-w-max h-full pb-4">
            {STAGES.map((stage) => (
              <Column key={stage} stage={stage} items={byStage[stage]} />
            ))}
          </div>
        </div>
        <DragOverlay>{activeCase ? <Card u={activeCase} dragging /> : null}</DragOverlay>
      </DndContext>}
    </div>
  );
}

function KanbanList({ byStage }: { byStage: Record<string, import("../lib/types").UseCase[]> }) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = (s: string) => setCollapsed((p) => ({ ...p, [s]: !p[s] }));
  return (
    <div className="space-y-2 overflow-y-auto flex-1">
      {Object.entries(byStage).map(([stage, items]) => (
        <div key={stage} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <button onClick={() => toggle(stage)} className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-slate-600 uppercase tracking-widest">{stage}</span>
              <span className="text-xs font-semibold text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">{items.length}</span>
            </div>
            <span className="text-slate-400 text-xs">{collapsed[stage] ? "▸" : "▾"}</span>
          </button>
          {!collapsed[stage] && items.length > 0 && (
            <div className="border-t border-slate-100 divide-y divide-slate-50">
              {items.map((u) => (
                <div key={u.id} className={"flex items-center gap-4 px-5 py-3 hover:bg-slate-50 transition-colors " + flagRowClass(u.status)}>
                  <span className="font-mono text-[11px] text-slate-400 w-20 shrink-0">{u.id}</span>
                  <Link to="/use-cases/$id" params={{ id: u.id }} className="flex-1 text-sm font-medium text-slate-900 hover:text-accent-indigo truncate">{u.title}</Link>
                  <FlagBadge status={u.status} />
                  <PriorityBadge priority={u.priority} />
                  <span className="text-xs text-slate-500 w-24 shrink-0 truncate">{u.workgroup}</span>
                  <OwnerAvatar name={u.useCaseOwner} size={22} />
                </div>
              ))}
            </div>
          )}
          {!collapsed[stage] && items.length === 0 && (
            <p className="px-5 py-3 text-xs text-slate-400 italic border-t border-slate-100">Empty</p>
          )}
        </div>
      ))}
    </div>
  );
}

function Column({ stage, items }: { stage: Stage; items: UseCase[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <div
      ref={setNodeRef}
      className={
        "w-72 shrink-0 bg-slate-100/70 rounded-xl p-3 flex flex-col transition-colors " +
        (isOver ? "ring-2 ring-accent-indigo/40 bg-slate-100" : "")
      }
    >
      <div className="flex items-center justify-between px-1 pb-3">
        <span className="text-xs font-semibold text-slate-600 uppercase tracking-widest">{stage}</span>
        <span className="text-xs font-semibold text-slate-500 bg-white rounded-full px-2 py-0.5 border border-slate-200">
          {items.length}
        </span>
      </div>
      <div className="space-y-2 flex-1 overflow-y-auto pr-1">
        {items.map((u) => <DraggableCard key={u.id} u={u} />)}
      </div>
    </div>
  );
}

function DraggableCard({ u }: { u: UseCase }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: u.id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ opacity: isDragging ? 0.3 : 1 }}
    >
      <Card u={u} />
    </div>
  );
}

function Card({ u, dragging = false }: { u: UseCase; dragging?: boolean }) {
  return (
    <div
      className={
        "bg-white border border-slate-200 rounded-lg p-3 shadow-sm hover:ring-1 hover:ring-accent-indigo/30 transition " +
        (dragging ? "shadow-lg ring-2 ring-accent-indigo/50 rotate-1" : "")
      }
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          to="/use-cases/$id"
          params={{ id: u.id }}
          onClick={(e) => e.stopPropagation()}
          className="text-sm font-medium text-slate-900 hover:text-accent-indigo line-clamp-2 flex-1"
        >
          {u.title}
        </Link>
        <PriorityBadge priority={u.priority} />
      </div>
      <p className="text-[10px] font-mono text-slate-400 mt-1">{u.id} · {u.workgroup}</p>
      <div className="mt-3 flex items-center justify-between">
<FlagBadge status={u.status} />
        <OwnerAvatar name={u.useCaseOwner} size={22} />
      </div>
    </div>
  );
}