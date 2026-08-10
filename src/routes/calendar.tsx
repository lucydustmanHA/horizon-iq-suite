import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { usePortfolio } from "../lib/store";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "../components/ui/button";

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

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const prevYear = () => setCurrentDate(new Date(year - 1, month, 1));
  const nextYear = () => setCurrentDate(new Date(year + 1, month, 1));
  const goToday = () => setCurrentDate(new Date());

  const monthName = currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  // Get events for a specific year+month
  const getEventsForMonth = (y: number, m: number) => {
    const map = new Map<number, { completed: typeof useCases; targeted: typeof useCases }>();
    for (const uc of useCases) {
      if (uc.lastCompletedAt) {
        const d = new Date(uc.lastCompletedAt);
        if (d.getUTCFullYear() === y && d.getUTCMonth() === m) {
          const day = d.getUTCDate();
          if (!map.has(day)) map.set(day, { completed: [], targeted: [] });
          map.get(day)!.completed.push(uc);
        }
      }
      if (uc.targetEndDate) {
        const d = new Date(uc.targetEndDate);
        if (d.getUTCFullYear() === y && d.getUTCMonth() === m) {
          const day = d.getUTCDate();
          if (!map.has(day)) map.set(day, { completed: [], targeted: [] });
          map.get(day)!.targeted.push(uc);
        }
      }
    }
    return map;
  };

  const events = useMemo(() => getEventsForMonth(year, month), [useCases, year, month]);

  const todayDate = new Date();
  const isToday = (y: number, m: number, d: number) => todayDate.getFullYear() === y && todayDate.getMonth() === m && todayDate.getDate() === d;

  // Legend counts
  const completedTotal = useCases.filter(u => u.lastCompletedAt).length;
  const targetedTotal = useCases.filter(u => u.targetEndDate).length;

  return (
    <div className="p-8 space-y-6 max-w-6xl">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Calendar</h1>
        <p className="text-sm text-slate-500 mt-1">
          Completed milestones and target end dates for use cases across the portfolio.
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
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-emerald-500 inline-block" /> Completed ({completedTotal})</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-indigo-300 inline-block opacity-60" /> Target ({targetedTotal})</span>
          </div>
          <div className="flex rounded-md border border-slate-200 overflow-hidden">
            <button onClick={() => setView("month")} className={`px-3 py-1.5 text-xs font-medium transition-colors ${view === "month" ? "bg-accent-indigo text-white" : "text-slate-600 hover:bg-slate-50"}`}>Month</button>
            <button onClick={() => setView("year")} className={`px-3 py-1.5 text-xs font-medium transition-colors ${view === "year" ? "bg-accent-indigo text-white" : "text-slate-600 hover:bg-slate-50"}`}>Year</button>
          </div>
        </div>
      </div>

      {view === "month" ? (
        <MonthGrid year={year} month={month} events={events} isToday={isToday} useCases={useCases} />
      ) : (
        <YearGrid year={year} useCases={useCases} isToday={isToday} getEventsForMonth={getEventsForMonth} onMonthClick={(m) => { setCurrentDate(new Date(year, m, 1)); setView("month"); }} />
      )}
    </div>
  );
}

function MonthGrid({ year, month, events, isToday, useCases }: { year: number; month: number; events: Map<number, { completed: typeof useCases; targeted: typeof useCases }>; isToday: (y: number, m: number, d: number) => boolean; useCases: any[] }) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="px-2 py-2 text-xs font-semibold text-slate-500 uppercase text-center">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 divide-x divide-y divide-slate-100">
        {cells.map((day, idx) => {
          const dayEvents = day ? events.get(day) : undefined;
          return (
            <div key={idx} className={`min-h-[100px] p-1.5 ${!day ? "bg-slate-50/50" : ""} ${day && isToday(year, month, day) ? "bg-indigo-50/40" : ""}`}>
              {day && (
                <>
                  <span className={`text-xs font-medium ${isToday(year, month, day) ? "bg-accent-indigo text-white rounded-full size-5 inline-flex items-center justify-center" : "text-slate-500"}`}>
                    {day}
                  </span>
                  {dayEvents && (
                    <div className="mt-1 space-y-0.5">
                      {dayEvents.completed.map((uc) => (
                        <Link key={uc.id} to="/use-cases/$id" params={{ id: uc.id }}
                          className="block text-[10px] leading-tight px-1 py-0.5 rounded bg-emerald-100 text-emerald-800 truncate hover:bg-emerald-200 transition-colors font-medium">
                          {uc.title}
                        </Link>
                      ))}
                      {dayEvents.targeted.map((uc) => (
                        <Link key={`t-${uc.id}`} to="/use-cases/$id" params={{ id: uc.id }}
                          className="block text-[10px] leading-tight px-1 py-0.5 rounded bg-indigo-50 text-indigo-500 truncate hover:bg-indigo-100 transition-colors opacity-60 border border-indigo-200 border-dashed">
                          {uc.title}
                        </Link>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
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
          <div key={m} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden cursor-pointer hover:border-accent-indigo/40 transition-colors" onClick={() => onMonthClick(m)}>
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
                  const isTodayCell = day && isToday(year, m, day);
                  return (
                    <div key={idx} className={`aspect-square flex items-center justify-center rounded-sm ${isTodayCell ? "bg-accent-indigo text-white" : hasCompleted ? "bg-emerald-100 text-emerald-800" : hasTargeted ? "bg-indigo-50 text-indigo-400" : ""}`}>
                      {day && <span className={`text-[9px] leading-none ${!isTodayCell && !hasCompleted && !hasTargeted ? "text-slate-500" : ""} font-medium`}>{day}</span>}
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
