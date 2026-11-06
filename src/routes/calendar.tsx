import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo, useEffect, useRef } from "react";
import { usePortfolio } from "../lib/store";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "../components/ui/button";
import { $getAllTodosWithDueDates, $addTodo, $updateTodo } from "../lib/use-cases.server";
import { $getReviewSessions } from "../lib/live.server";
import { $loadTrainings } from "../lib/adoption.server";
import type { Training } from "../lib/adoption.server";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Input } from "../components/ui/input";


type CalendarTodo = { id: string; useCaseId: string; text: string; assignee: string; done: boolean; dueDate: string; ucTitle: string };
type CalendarReview = { reviewKey: string; cycle: string; completedAt: string; caseCount: number };

export const Route = createFileRoute("/calendar")({
  head: () => ({
    meta: [
      { title: "Calendar — Horizon QX" },
      { name: "description", content: "Visual calendar of completed and targeted use case milestones." },
    ],
  }),
  component: CalendarPage,
});

function CalendarPage() {
  const useCases = usePortfolio((s) => s.useCases);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<"month" | "year">("month");
  const [calTodos, setCalTodos] = useState<CalendarTodo[]>([]);
  const [calReviews, setCalReviews] = useState<CalendarReview[]>([]);
  const [calTrainings, setCalTrainings] = useState<Training[]>([]);
  const [createModal, setCreateModal] = useState<{ open: boolean; date: string }>({ open: false, date: "" });
  const [newTodoText, setNewTodoText] = useState("");
  const [newTodoUcId, setNewTodoUcId] = useState("");
  const [newTodoAssignee, setNewTodoAssignee] = useState("");
  const [creating, setCreating] = useState(false);
  const [ucSearch, setUcSearch] = useState("");
  const [ucPickerOpen, setUcPickerOpen] = useState(false);
  const ucPickerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filteredUcs = useMemo(() => {
    const q = ucSearch.trim().toLowerCase();
    const list = q ? useCases.filter((uc) => uc.title.toLowerCase().includes(q)) : useCases;
    return list.slice(0, 10);
  }, [useCases, ucSearch]);

  const handleTodoDrop = async (todoId: string, newDate: string) => {
    setCalTodos((prev) => prev.map((t) => (t.id === todoId ? { ...t, dueDate: newDate } : t)));
    await $updateTodo({ data: { id: todoId, dueDate: newDate } }).catch(console.error);
  };

  const handleCreateTodo = async () => {
    if (!newTodoText.trim() || !newTodoUcId) return;
    setCreating(true);
    try {
      await $addTodo({ data: { useCaseId: newTodoUcId, text: newTodoText.trim(), assignee: newTodoAssignee.trim(), dueDate: createModal.date || undefined } });
      $getAllTodosWithDueDates().then(setCalTodos).catch(console.error);
      setCreateModal({ open: false, date: "" });
      setNewTodoText(""); setNewTodoUcId(""); setNewTodoAssignee("");
    } finally { setCreating(false); }
  };

  useEffect(() => {
    $getAllTodosWithDueDates().then(setCalTodos).catch(console.error);
    $getReviewSessions().then(setCalReviews).catch(console.error);
    $loadTrainings().then(setCalTrainings).catch(console.error);
  }, []);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const prevYear = () => setCurrentDate(new Date(year - 1, month, 1));
  const nextYear = () => setCurrentDate(new Date(year + 1, month, 1));
  const goToday = () => setCurrentDate(new Date());

  const monthName = currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  // Get events for a specific year+month
  type DayEvents = { completed: typeof useCases; targeted: typeof useCases; todos: CalendarTodo[]; reviews: CalendarReview[]; trainings: Training[] };
  const getEventsForMonth = (y: number, m: number) => {
    const map = new Map<number, DayEvents>();
    const ensure = (day: number) => { if (!map.has(day)) map.set(day, { completed: [], targeted: [], todos: [], reviews: [], trainings: [] }); };
    for (const uc of useCases) {
      if (uc.lastCompletedAt) {
        const d = new Date(uc.lastCompletedAt);
        if (d.getUTCFullYear() === y && d.getUTCMonth() === m) { const day = d.getUTCDate(); ensure(day); map.get(day)!.completed.push(uc); }
      }
      if (uc.targetEndDate && !uc.lastCompletedAt) {
        const d = new Date(uc.targetEndDate);
        if (d.getUTCFullYear() === y && d.getUTCMonth() === m) { const day = d.getUTCDate(); ensure(day); map.get(day)!.targeted.push(uc); }
      }
    }
    for (const t of calTodos) {
      if (!t.dueDate) continue;
      const d = new Date(t.dueDate + "T12:00:00");
      if (d.getFullYear() === y && d.getMonth() === m) { const day = d.getDate(); ensure(day); map.get(day)!.todos.push(t); }
    }
    for (const rv of calReviews) {
      if (!rv.completedAt) continue;
      const d = new Date(rv.completedAt);
      if (d.getUTCFullYear() === y && d.getUTCMonth() === m) { const day = d.getUTCDate(); ensure(day); map.get(day)!.reviews.push(rv); }
    }
    for (const tr of calTrainings) {
      if (!tr.trainingDate) continue;
      const d = new Date(tr.trainingDate + "T12:00:00");
      if (d.getFullYear() === y && d.getMonth() === m) { const day = d.getDate(); ensure(day); map.get(day)!.trainings.push(tr); }
    }
    return map;
  };

  const events = useMemo(() => getEventsForMonth(year, month), [useCases, calTodos, calReviews, calTrainings, year, month]);

  const todayDate = new Date();
  const isToday = (y: number, m: number, d: number) => todayDate.getFullYear() === y && todayDate.getMonth() === m && todayDate.getDate() === d;

  // Legend counts
  const completedTotal = useCases.filter(u => u.lastCompletedAt).length;
  const targetedTotal = useCases.filter(u => u.targetEndDate).length;
  const todoTotal = calTodos.filter(t => !t.done).length;

  return (
    <div className="p-8 space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Calendar</h1>
        <p className="text-sm text-slate-500 mt-1">
          Live milestones and target end dates for use cases across the portfolio.
        </p>
      </header>

      {/* Navigation */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          {view === "month" ? (
            <>
              <Button variant="outline" size="sm" onClick={prevMonth}><ChevronLeft className="size-4" /></Button>
              <h2 className="text-lg font-semibold text-slate-800 min-w-[180px] text-center">{monthName}</h2>
              <Button variant="outline" size="sm" onClick={nextMonth}><ChevronRight className="size-4" /></Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={prevYear}><ChevronLeft className="size-4" /></Button>
              <h2 className="text-lg font-semibold text-slate-800 min-w-[80px] text-center">{year}</h2>
              <Button variant="outline" size="sm" onClick={nextYear}><ChevronRight className="size-4" /></Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={goToday} className="ml-2 text-xs">Today</Button>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-emerald-500 inline-block" /> Live ({completedTotal})</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-indigo-300 inline-block opacity-60" /> Target ({targetedTotal})</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-orange-400 inline-block" /> To-Dos ({todoTotal})</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-violet-500 inline-block" /> Reviews ({calReviews.length})</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-rose-500 inline-block" /> Trainings ({calTrainings.length})</span>
          </div>
          <div className="flex rounded-md border border-slate-200 overflow-hidden">
            <button onClick={() => setView("month")} className={`px-3 py-1.5 text-xs font-medium transition-colors ${view === "month" ? "bg-accent-indigo text-white" : "text-slate-600 hover:bg-slate-50"}`}>Month</button>
            <button onClick={() => setView("year")} className={`px-3 py-1.5 text-xs font-medium transition-colors ${view === "year" ? "bg-accent-indigo text-white" : "text-slate-600 hover:bg-slate-50"}`}>Year</button>
          </div>
        </div>
      </div>

      <div className="flex gap-6 items-start">
        <div className="flex-1 min-w-0">
          {view === "month" ? (
            <MonthGrid year={year} month={month} events={events} isToday={isToday} useCases={useCases} onBlankDayClick={(dateStr: string) => setCreateModal({ open: true, date: dateStr })} onTodoDrop={handleTodoDrop} />
          ) : (
            <YearGrid year={year} useCases={useCases} isToday={isToday} getEventsForMonth={getEventsForMonth} onMonthClick={(m) => { setCurrentDate(new Date(year, m, 1)); setView("month"); }} />
          )}
        </div>
        <CalendarSidebar useCases={useCases} calTodos={calTodos} />
      </div>

      {/* Create To-Do Modal (month view only) */}
      <Dialog open={createModal.open} onOpenChange={(open) => { if (!open) { setCreateModal({ open: false, date: "" }); setNewTodoText(""); setNewTodoUcId(""); setNewTodoAssignee(""); setUcSearch(""); setUcPickerOpen(false); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New To-Do</DialogTitle>
            <p className="text-sm text-slate-500 mt-1">Create a to-do for {createModal.date ? new Date(createModal.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : ""}</p>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">What needs to be done? *</label>
              <Input value={newTodoText} onChange={(e) => setNewTodoText(e.target.value)} placeholder="Describe the task" autoFocus onKeyDown={(e) => e.key === "Enter" && handleCreateTodo()} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Assign to</label>
              <Input value={newTodoAssignee} onChange={(e) => setNewTodoAssignee(e.target.value)} placeholder="Name" />
            </div>
            <div className="relative">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Use Case *</label>
              <Input value={ucSearch} onChange={(e) => { setUcSearch(e.target.value); setNewTodoUcId(""); setUcPickerOpen(true); }} placeholder="Type to search use cases"
                onFocus={() => setUcPickerOpen(true)} onBlur={() => { ucPickerTimer.current = setTimeout(() => setUcPickerOpen(false), 150); }} />
              {ucPickerOpen && filteredUcs.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-50 max-h-52 overflow-y-auto">
                  {filteredUcs.map((uc) => (
                    <button key={uc.id} type="button" className={`w-full text-left px-3 py-2 text-sm transition-colors truncate ${
                      newTodoUcId === uc.id ? "bg-accent-indigo/10 text-accent-indigo font-medium" : "text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                    }`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { setNewTodoUcId(uc.id); setUcSearch(uc.title); setUcPickerOpen(false); if (ucPickerTimer.current) clearTimeout(ucPickerTimer.current); }}>
                      {uc.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => { setCreateModal({ open: false, date: "" }); setNewTodoText(""); setNewTodoUcId(""); setNewTodoAssignee(""); setUcSearch(""); }}>Cancel</Button>
              <Button size="sm" disabled={!newTodoText.trim() || !newTodoUcId || creating} onClick={handleCreateTodo} className="bg-accent-indigo hover:bg-accent-indigo/90 text-white">
                {creating ? "Creating\u2026" : "Create To-Do"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MonthGrid({ year, month, events, isToday, useCases, onBlankDayClick, onTodoDrop }: { year: number; month: number; events: Map<number, { completed: any[]; targeted: any[]; todos: CalendarTodo[] }>; isToday: (y: number, m: number, d: number) => boolean; useCases: any[]; onBlankDayClick?: (dateStr: string) => void; onTodoDrop?: (todoId: string, newDate: string) => void }) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200 rounded-t-xl">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="px-2 py-2 text-xs font-semibold text-slate-500 uppercase text-center">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 divide-x divide-y divide-border">
        {cells.map((day, idx) => {
          const dayEvents = day ? events.get(day) : undefined;
          return (
            <MonthDayCell key={idx} day={day} dayEvents={dayEvents} isToday={day ? isToday(year, month, day) : false}
              dateStr={day ? `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` : undefined}
              onBlankClick={day && onBlankDayClick ? () => onBlankDayClick(`${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`) : undefined}
              onTodoDrop={onTodoDrop} />
          );
        })}
      </div>
    </div>
  );
}

function CalendarSidebar({ useCases, calTodos }: { useCases: any[]; calTodos: CalendarTodo[] }) {
  const { pastDue, comingUp } = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const todayMs = now.getTime();
    const fiveDaysMs = todayMs + 5 * 86_400_000;

    const pastDue: Array<{ id: string; ucId: string; title: string; date: Date; type: "target" | "todo" }> = [];
    const comingUp: Array<{ id: string; ucId: string; title: string; date: Date; type: "target" | "todo" }> = [];

    for (const uc of useCases) {
      if (uc.targetEndDate && !uc.lastCompletedAt) {
        const raw = new Date(uc.targetEndDate);
        const d = new Date(raw.getUTCFullYear(), raw.getUTCMonth(), raw.getUTCDate());
        const ms = d.getTime();
        if (ms < todayMs) pastDue.push({ id: `t-${uc.id}`, ucId: uc.id, title: uc.title, date: d, type: "target" });
        else if (ms < fiveDaysMs) comingUp.push({ id: `t-${uc.id}`, ucId: uc.id, title: uc.title, date: d, type: "target" });
      }
    }
    for (const t of calTodos) {
      if (!t.dueDate || t.done) continue;
      const d = new Date(t.dueDate + "T12:00:00");
      d.setHours(0, 0, 0, 0);
      const ms = d.getTime();
      if (ms < todayMs) pastDue.push({ id: `td-${t.id}`, ucId: t.useCaseId, title: t.text, date: d, type: "todo" });
      else if (ms < fiveDaysMs) comingUp.push({ id: `td-${t.id}`, ucId: t.useCaseId, title: t.text, date: d, type: "todo" });
    }

    pastDue.sort((a, b) => a.date.getTime() - b.date.getTime());
    comingUp.sort((a, b) => a.date.getTime() - b.date.getTime());
    return { pastDue, comingUp };
  }, [useCases, calTodos]);

  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const isToday = (d: Date) => d.getTime() === todayStart.getTime();
  const isTomorrow = (d: Date) => d.getTime() === todayStart.getTime() + 86_400_000;
  const fmtDate = (d: Date) => isToday(d) ? "Today" : isTomorrow(d) ? "Tomorrow" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const daysOverdue = (d: Date) => { const now = new Date(); now.setHours(0,0,0,0); return Math.floor((now.getTime() - d.getTime()) / 86_400_000); };

  return (
    <div className="w-72 shrink-0 space-y-4 hidden lg:block">
      {/* Past Due */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <span className="size-2 rounded-full bg-status-danger" />
          <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Past Due</h3>
          {pastDue.length > 0 && <span className="text-[10px] font-bold text-status-danger bg-red-50 rounded-full px-1.5 py-0.5">{pastDue.length}</span>}
        </div>
        <div className="max-h-[280px] overflow-y-auto">
          {pastDue.length === 0 ? (
            <p className="px-4 py-4 text-xs text-slate-400 italic text-center">Nothing past due</p>
          ) : (
            <div className="divide-y divide-border">
              {pastDue.map((item) => (
                <Link key={item.id} to="/use-cases/$id" params={{ id: item.ucId }} search={item.type === "todo" ? { tab: "todos" } : {}}
                  className="block px-4 py-2.5 hover:bg-slate-50 transition-colors group">
                  <p className="text-xs font-medium text-slate-800 truncate group-hover:text-accent-indigo transition-colors">{item.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[10px] font-medium ${item.type === "target" ? "text-indigo-500" : "text-amber-600"}`}>
                      {item.type === "target" ? "Target" : "To-do"}
                    </span>
                    <span className="text-[10px] text-status-danger font-medium">{fmtDate(item.date)}</span>
                    <span className="text-[10px] text-slate-400">({daysOverdue(item.date)}d ago)</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Coming Up */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <span className="size-2 rounded-full bg-accent-indigo" />
          <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Coming Up</h3>
          {comingUp.length > 0 && <span className="text-[10px] font-bold text-accent-indigo bg-indigo-50 rounded-full px-1.5 py-0.5">{comingUp.length}</span>}
        </div>
        <div className="max-h-[280px] overflow-y-auto">
          {comingUp.length === 0 ? (
            <p className="px-4 py-4 text-xs text-slate-400 italic text-center">Nothing in the next 5 days</p>
          ) : (
            <div className="divide-y divide-border">
              {comingUp.map((item) => (
                <Link key={item.id} to="/use-cases/$id" params={{ id: item.ucId }} search={item.type === "todo" ? { tab: "todos" } : {}}
                  className="block px-4 py-2.5 hover:bg-slate-50 transition-colors group">
                  <p className="text-xs font-medium text-slate-800 truncate group-hover:text-accent-indigo transition-colors">{item.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[10px] font-medium ${item.type === "target" ? "text-indigo-500" : "text-amber-600"}`}>
                      {item.type === "target" ? "Target" : "To-do"}
                    </span>
                    <span className="text-[10px] text-slate-500">{fmtDate(item.date)}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Shared hover popover for calendar day cells (month + year) ── */
type EventItem = { dot: string; label: string; sub?: string; ucId: string };

function buildEventItems(events: { completed: any[]; targeted: any[]; todos: CalendarTodo[]; reviews?: CalendarReview[]; trainings?: Training[] }): EventItem[] {
  const items: EventItem[] = [];
  for (const uc of (events.completed ?? [])) items.push({ dot: "bg-emerald-500", label: uc.title, sub: uc.stage === "Closed" ? "Closed on" : "Live on", ucId: uc.id });
  for (const uc of (events.targeted ?? [])) items.push({ dot: "bg-indigo-400", label: uc.title, sub: "Target", ucId: uc.id });
  for (const td of (events.todos ?? [])) items.push({ dot: td.done ? "bg-orange-300" : "bg-amber-400", label: td.ucTitle, sub: td.done ? `✓ ${td.text}` : td.text, ucId: td.useCaseId });
  for (const rv of (events.reviews ?? [])) items.push({ dot: "bg-violet-500", label: `${rv.cycle} Review`, sub: `${rv.caseCount} cases reviewed`, ucId: "__review__" });
  for (const tr of (events.trainings ?? [])) items.push({ dot: "bg-rose-500", label: tr.title, sub: `${tr.attendees} attendees · ${tr.lengthHours}h`, ucId: "__training__" });
  return items;
}

function DayPopover({ items, show, hide, above, alignRight }: {
  items: EventItem[]; show: () => void; hide: () => void;
  above: boolean; alignRight?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <div onMouseEnter={show} onMouseLeave={hide}
      className={`absolute bottom-1/2 ${alignRight ? "right-1/2" : "left-1/2"} w-52 bg-white border border-slate-200 rounded-lg shadow-xl z-[100]`}>
      <div className="px-3 py-1.5 border-b border-slate-100">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{items.length} event{items.length > 1 ? "s" : ""}</p>
      </div>
      <div className="py-1 max-h-48 overflow-y-auto">
        {items.map((item, i) => (
          <Link key={i} to={item.ucId === "__review__" ? "/live" : item.ucId === "__training__" ? "/adoption" : "/use-cases/$id" as any} params={item.ucId === "__review__" || item.ucId === "__training__" ? {} : { id: item.ucId }} onClick={(e: React.MouseEvent) => e.stopPropagation()}
            className="px-3 py-1.5 flex items-start gap-1.5 hover:bg-slate-50 transition-colors cursor-pointer">
            <span className={`size-1.5 rounded-full ${item.dot} mt-1 shrink-0`} />
            <div className="min-w-0">
              <span className="text-[10px] text-slate-700 leading-snug font-medium block truncate">{item.label}</span>
              {item.sub && <span className="text-[9px] text-slate-400 leading-snug block truncate">{item.sub}</span>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ── Month-view day cell ── */
function MonthDayCell({ day, dayEvents, isToday: today, dateStr, onBlankClick, onTodoDrop }: {
  day: number | null;
  dayEvents?: { completed: any[]; targeted: any[]; todos: CalendarTodo[]; reviews: CalendarReview[]; trainings: Training[] };
  isToday: boolean;
  dateStr?: string;
  onBlankClick?: () => void;
  onTodoDrop?: (todoId: string, newDate: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [above, setAbove] = useState(true);

  const show = () => { if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; } setHovered(true); if (ref.current) { const rect = ref.current.getBoundingClientRect(); setAbove(rect.top > 200); } };
  const hide = () => { hideTimer.current = setTimeout(() => setHovered(false), 50); };

  const items = dayEvents ? buildEventItems(dayEvents) : [];

  return (
    <div ref={ref}
      className={`min-h-[100px] p-1.5 relative transition-colors ${!day ? "bg-slate-50/50" : ""} ${today ? "bg-indigo-50/40" : ""} ${hovered && items.length > 0 ? "z-[60]" : ""} ${day && onBlankClick ? "cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-700/40" : ""} ${dragOver ? "!bg-accent-indigo/10 ring-2 ring-inset ring-accent-indigo/40" : ""}`}
      onMouseEnter={items.length > 0 ? show : undefined} onMouseLeave={items.length > 0 ? hide : undefined}
      onClick={(e) => { if (day && onBlankClick && !(e.target as HTMLElement).closest("a")) onBlankClick(); }}
      onDragOver={(e) => { if (day && onTodoDrop) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { setDragOver(false); if (!day || !dateStr || !onTodoDrop) return; const todoId = e.dataTransfer.getData("text/todo-id"); if (todoId) { e.preventDefault(); onTodoDrop(todoId, dateStr); } }}>
      {day && (
        <>
          <span className={`text-xs font-medium ${today ? "bg-accent-indigo text-white rounded-full size-5 inline-flex items-center justify-center" : "text-slate-500"}`}>
            {day}
          </span>
          {dayEvents && (
            <div className="mt-1 space-y-0.5">
              {dayEvents.completed.map((uc) => (
                <Link key={uc.id} to="/use-cases/$id" params={{ id: uc.id }}
                  className="block text-[10px] leading-tight px-1 py-0.5 rounded bg-emerald-100 text-emerald-800 hover:bg-emerald-200 transition-colors font-medium truncate">
                  {uc.title}
                </Link>
              ))}
              {dayEvents.targeted.map((uc) => (
                <Link key={`t-${uc.id}`} to="/use-cases/$id" params={{ id: uc.id }}
                  className="block text-[10px] leading-tight px-1 py-0.5 rounded bg-indigo-50 text-indigo-500 hover:bg-indigo-100 transition-colors opacity-60 border border-indigo-200 border-dashed truncate">
                  {uc.title}
                </Link>
              ))}
              {dayEvents.todos.map((td) => (
                <Link key={`td-${td.id}`} to="/use-cases/$id" params={{ id: td.useCaseId }} search={{ tab: "todos" }}
                  draggable
                  onDragStart={(e: React.DragEvent) => { e.dataTransfer.setData("text/todo-id", td.id); e.dataTransfer.effectAllowed = "move"; e.stopPropagation(); }}
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                  className={`block text-[10px] leading-tight px-1 py-0.5 rounded truncate transition-colors font-medium cursor-grab active:cursor-grabbing ${td.done ? "bg-orange-50 text-orange-300 line-through" : "bg-orange-100 text-orange-800 hover:bg-orange-200 dark:hover:bg-orange-300/30"}`}>
                  {td.text}
                </Link>
              ))}
              {dayEvents.reviews.map((rv) => (
                <Link key={`rv-${rv.reviewKey}`} to="/live" className="block text-[10px] leading-tight px-1 py-0.5 rounded bg-violet-100 text-violet-700 hover:bg-violet-200 transition-colors font-medium truncate">
                  {rv.cycle} Review ({rv.caseCount})
                </Link>
              ))}
              {dayEvents.trainings.map((tr) => (
                <Link key={`tr-${tr.id}`} to="/adoption" className="block text-[10px] leading-tight px-1 py-0.5 rounded bg-rose-100 text-rose-700 hover:bg-rose-200 transition-colors font-medium truncate">
                  {tr.title}
                </Link>
              ))}
            </div>
          )}
          {hovered && <DayPopover items={items} show={show} hide={hide} above={above} />}
        </>
      )}
    </div>
  );
}

/* ── Year-view day cell ── */
function YearDayCell({ day, cellClass, spanClass, events, onClick }: {
  day: number; cellClass: string; spanClass: string;
  events: { completed: any[]; targeted: any[]; todos: CalendarTodo[]; reviews?: CalendarReview[]; trainings?: Training[] };
  onClick: (e: React.MouseEvent) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pos, setPos] = useState<{ above: boolean; alignRight: boolean }>({ above: true, alignRight: false });

  const show = () => { if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; } setHovered(true); if (ref.current) { const rect = ref.current.getBoundingClientRect(); setPos({ above: rect.top > 200, alignRight: rect.left > window.innerWidth - 220 }); } };
  const hide = () => { hideTimer.current = setTimeout(() => setHovered(false), 50); };

  const items = buildEventItems(events);

  return (
    <div ref={ref} className={`${cellClass} relative cursor-default ${hovered ? "z-[60]" : ""}`} onMouseEnter={show} onMouseLeave={hide} onClick={onClick}>
      <span className={spanClass}>{day}</span>
      {hovered && <DayPopover items={items} show={show} hide={hide} above={pos.above} alignRight={pos.alignRight} />}
    </div>
  );
}

function YearGrid({ year, useCases, isToday, getEventsForMonth, onMonthClick }: { year: number; useCases: any[]; isToday: (y: number, m: number, d: number) => boolean; getEventsForMonth: (y: number, m: number) => Map<number, any>; onMonthClick: (m: number) => void }) {
  const months = Array.from({ length: 12 }, (_, i) => i);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {months.map((m) => {
        const name = new Date(year, m, 1).toLocaleDateString("en-US", { month: "long" });
        const firstDay = new Date(year, m, 1).getDay();
        const daysInMonth = new Date(year, m + 1, 0).getDate();
        const events = getEventsForMonth(year, m);

        const cells: (number | null)[] = [];
        for (let i = 0; i < firstDay; i++) cells.push(null);
        for (let d = 1; d <= daysInMonth; d++) cells.push(d);
        while (cells.length % 7 !== 0) cells.push(null);

        return (
          <div key={m} className="bg-white rounded-xl border border-slate-200 shadow-sm cursor-pointer hover:border-accent-indigo/40 transition-colors relative" onClick={() => onMonthClick(m)}>
            <div className="px-3 py-2 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-700">{name}</h3>
            </div>
            <div className="p-2">
              <div className="grid grid-cols-7 gap-px mb-1">
                {["S","M","T","W","T","F","S"].map((d, i) => (
                  <div key={i} className="text-[9px] text-slate-400 text-center font-medium">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-px">
                {cells.map((day, idx) => {
                  const hasCompleted = day && events.has(day) && events.get(day)!.completed?.length > 0;
                  const hasTargeted = day && events.has(day) && events.get(day)!.targeted?.length > 0;
                  const hasTodo = day && events.has(day) && events.get(day)!.todos?.length > 0;
                  const hasReview = day && events.has(day) && events.get(day)!.reviews?.length > 0;
                  const hasTraining = day && events.has(day) && events.get(day)!.trainings?.length > 0;
                  const isTodayCell = day && isToday(year, m, day);
                  const hasEvents = hasCompleted || hasTargeted || hasTodo || hasReview || hasTraining;
                  const cellClass = `aspect-square flex items-center justify-center rounded-sm ${isTodayCell ? "bg-accent-indigo text-white" : hasTraining ? "bg-rose-100 text-rose-800" : hasReview ? "bg-violet-100 text-violet-800" : hasCompleted ? "bg-emerald-100 text-emerald-800" : hasTodo ? "bg-orange-100 text-orange-800" : hasTargeted ? "bg-indigo-50 text-indigo-400" : ""}`;
                  const spanClass = `text-[9px] leading-none ${!isTodayCell && !hasCompleted && !hasTargeted && !hasReview && !hasTraining ? "text-slate-500" : ""} font-medium`;
                  return day && hasEvents ? (
                    <YearDayCell key={idx} day={day} cellClass={cellClass} spanClass={spanClass} events={events.get(day)!} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                  ) : (
                    <div key={idx} className={cellClass}>
                      {day && <span className={spanClass}>{day}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
