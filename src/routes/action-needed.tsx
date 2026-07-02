
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { StageBadge, PriorityBadge, OwnerAvatar, FlagBadge } from "../components/badges";
import { $getActionNeededWithTodos, $addTodo, $updateTodo, $deleteTodo } from "../lib/use-cases.server";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { CheckSquare, Square, Plus, Trash2, ChevronRight } from "lucide-react";
import type { TodoItem, UseCase } from "../lib/types";

export const Route = createFileRoute("/action-needed")({ component: ActionNeededPage });

function ActionNeededPage() {
  const [useCases, setUseCases] = useState<UseCase[]>([]);
  const [todosByCase, setTodosByCase] = useState<Record<string, TodoItem[]>>({});
  const [loaded, setLoaded] = useState(false);
  const [newText, setNewText] = useState<Record<string, string>>({});
  const [newAssignee, setNewAssignee] = useState<Record<string, string>>({});

  useEffect(() => {
    $getActionNeededWithTodos().then(({ useCases: ucs, todos }) => {
      setUseCases(ucs as UseCase[]);
      const byCase: Record<string, TodoItem[]> = {};
      for (const uc of ucs as UseCase[]) byCase[uc.id] = [];
      for (const t of todos) { if (!byCase[t.useCaseId]) byCase[t.useCaseId] = []; byCase[t.useCaseId].push(t); }
      setTodosByCase(byCase);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const addTodo = async (ucId: string) => {
    const text = (newText[ucId] ?? "").trim();
    if (!text) return;
    const t = await $addTodo({ data: { useCaseId: ucId, text, assignee: newAssignee[ucId] ?? "" } });
    setTodosByCase((prev) => ({ ...prev, [ucId]: [...(prev[ucId] ?? []), t] }));
    setNewText((p) => ({ ...p, [ucId]: "" }));
    setNewAssignee((p) => ({ ...p, [ucId]: "" }));
  };
  const toggleTodo = async (ucId: string, t: TodoItem) => {
    setTodosByCase((prev) => ({ ...prev, [ucId]: prev[ucId].map((x) => x.id === t.id ? { ...x, done: !x.done } : x) }));
    await $updateTodo({ data: { id: t.id, done: !t.done } });
  };
  const deleteTodo = async (ucId: string, todoId: string) => {
    setTodosByCase((prev) => ({ ...prev, [ucId]: prev[ucId].filter((x) => x.id !== todoId) }));
    await $deleteTodo({ data: { id: todoId } });
  };

  const allTodos = Object.values(todosByCase).flat();
  const doneTodos = allTodos.filter((t) => t.done).length;

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <header>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Flagged Use Cases</h1>
            <p className="text-sm text-slate-500 mt-1">
              {loaded ? `${useCases.length} use case${useCases.length === 1 ? "" : "s"} flagged` : "Loading…"}
              {allTodos.length > 0 && ` · ${doneTodos}/${allTodos.length} to-dos done`}
            </p>
          </div>
          <Link to="/use-cases" className="text-sm text-accent-indigo hover:underline flex items-center gap-1">Table view <ChevronRight className="size-3.5" /></Link>
        </div>
        {allTodos.length > 0 && (
          <div className="mt-3 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="bg-status-success h-full transition-all rounded-full" style={{ width: `${Math.round((doneTodos / allTodos.length) * 100)}%` }} />
          </div>
        )}
      </header>

      {!loaded && <p className="text-slate-400 text-sm">Loading…</p>}
      {loaded && useCases.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
          <p className="text-slate-400 font-medium">No flagged use cases right now</p>
          <p className="text-slate-300 text-sm mt-1">Set the Flag to "Blocked" or "Action Needed" on a use case to see it here</p>
        </div>
      )}

      {useCases.map((uc) => {
        const todos = todosByCase[uc.id] ?? [];
        const done = todos.filter((t) => t.done).length;
        return (
          <div key={uc.id} className={`border rounded-xl shadow-sm overflow-hidden ${uc.status === "Blocked" ? "bg-red-50/20 border-red-200" : "bg-amber-50/20 border-amber-200"}`}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono text-slate-400">{uc.id}</span>
                  <FlagBadge status={uc.status} />
                  <StageBadge stage={uc.stage} />
                  <PriorityBadge priority={uc.priority} />
                </div>
                <Link to="/use-cases/$id" params={{ id: uc.id }} className="font-semibold text-slate-900 hover:text-accent-indigo transition-colors">{uc.title}</Link>
                <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                  <span>{uc.workgroup}</span>
                  {uc.useCaseOwner && <><span>·</span><OwnerAvatar name={uc.useCaseOwner} size={16} /><span>{uc.useCaseOwner}</span></>}
                </div>
              </div>
              {todos.length > 0 && <span className="shrink-0 text-xs font-medium text-slate-500 bg-white/80 px-2 py-1 rounded-full border border-slate-200 whitespace-nowrap">{done}/{todos.length} done</span>}
            </div>
            <div className="px-6 py-4 space-y-1">
              {todos.length === 0 ? <p className="text-xs text-slate-400 italic py-1">No to-dos yet</p>
                : todos.map((t) => (
                  <div key={t.id} className="flex items-start gap-2 py-1 group rounded px-1 hover:bg-white/50">
                    <button onClick={() => toggleTodo(uc.id, t)} className="mt-0.5 shrink-0 text-slate-400 hover:text-accent-indigo">{t.done ? <CheckSquare className="size-4 text-status-success" /> : <Square className="size-4" />}</button>
                    <div className="flex-1"><p className={`text-sm ${t.done ? "line-through text-slate-400" : "text-slate-900"}`}>{t.text}</p>{t.assignee && <p className="text-xs text-slate-400 mt-0.5">→ {t.assignee}</p>}</div>
                    <button onClick={() => deleteTodo(uc.id, t.id)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-status-danger transition-all mt-0.5 shrink-0"><Trash2 className="size-3.5" /></button>
                  </div>
                ))
              }
              <div className="flex gap-2 pt-2 border-t border-white/60">
                <Input value={newText[uc.id] ?? ""} onChange={(e) => setNewText((p) => ({ ...p, [uc.id]: e.target.value }))} placeholder="Add to-do…" className="flex-1 h-8 text-sm" onKeyDown={(e) => e.key === "Enter" && addTodo(uc.id)} />
                <Input value={newAssignee[uc.id] ?? ""} onChange={(e) => setNewAssignee((p) => ({ ...p, [uc.id]: e.target.value }))} placeholder="Assignee" className="w-32 h-8 text-sm" onKeyDown={(e) => e.key === "Enter" && addTodo(uc.id)} />
                <Button size="sm" variant="outline" className="h-8 px-3 gap-1 bg-white/80" onClick={() => addTodo(uc.id)}><Plus className="size-3" /> Add</Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
