/**
 * strategy-hooks.ts — client state + data hooks for the Strategy side.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { usePortfolio } from "./store";
import { toast } from "sonner";
import { $loadStrategyYear, $listStrategyYears, $saveProgress, $saveMonthMeta, $saveGoal, $getStrategyReviews } from "./strategy.server";
import { STRATEGY_DEFAULTS, STRATEGY_SETTING_KEYS, goalMatches, priorityRank, type StrategyGoal, type StrategyYearData } from "./strategy-types";

interface StrategyUI {
  year: number;
  setYear: (y: number) => void;
  search: string;
  setSearch: (s: string) => void;
}

export const useStrategyUI = create<StrategyUI>()(
  persist(
    (set) => ({
      year: new Date().getFullYear(),
      setYear: (year) => set({ year }),
      search: "",
      setSearch: (search) => set({ search }),
    }),
    { name: "qx-strategy-ui-v1", partialize: (s) => ({ year: s.year }) },
  ),
);

export const strategyKeys = {
  all: ["strategy"] as const,
  year: (y: number) => ["strategy", "year", y] as const,
  years: ["strategy", "years"] as const,
  deepDives: (y: number) => ["strategy", "deep-dives", y] as const,
  actions: (id: number) => ["strategy", "actions", id] as const,
  reviews: (m: string) => ["strategy", "reviews", m] as const,
};

export function useStrategyYearData(year?: number) {
  const selected = useStrategyUI((s) => s.year);
  const y = year ?? selected;
  return useQuery({
    queryKey: strategyKeys.year(y),
    queryFn: () => $loadStrategyYear({ data: { year: y } }),
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}

export function useRefreshStrategy() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: strategyKeys.all });
}

/** Save one month's actual with an optimistic cache update. */
export function useSaveProgress() {
  const qc = useQueryClient();
  return async (goal: StrategyGoal, monthIdx: number, value: string) => {
    const key = strategyKeys.year(goal.year);
    const prev = qc.getQueryData<StrategyYearData>(key);
    if (prev) {
      qc.setQueryData<StrategyYearData>(key, {
        ...prev,
        goals: prev.goals.map((g) => g.id === goal.id ? { ...g, progress: g.progress.map((v, i) => (i === monthIdx ? value : v)) } : g),
      });
    }
    try {
      await $saveProgress({ data: { goalId: goal.id, month: monthIdx + 1, actualValue: value } });
    } catch (e) {
      if (prev) qc.setQueryData(key, prev);
      toast.error("Could not save monthly actual", { description: String((e as Error)?.message ?? e) });
    }
  };
}

/** Save one month's manual red/green (null = auto) and/or comment, optimistically. */
export function useSaveMonthMeta() {
  const qc = useQueryClient();
  return async (goal: StrategyGoal, monthIdx: number, meta: { rag?: "green" | "red" | null; comment?: string }) => {
    const key = strategyKeys.year(goal.year);
    const prev = qc.getQueryData<StrategyYearData>(key);
    if (prev) {
      qc.setQueryData<StrategyYearData>(key, {
        ...prev,
        goals: prev.goals.map((g) => g.id !== goal.id ? g : {
          ...g,
          monthRag: meta.rag !== undefined ? g.monthRag.map((v, i) => (i === monthIdx ? meta.rag ?? null : v)) : g.monthRag,
          monthComments: meta.comment !== undefined ? g.monthComments.map((v, i) => (i === monthIdx ? meta.comment ?? "" : v)) : g.monthComments,
        }),
      });
    }
    try {
      await $saveMonthMeta({ data: { goalId: goal.id, month: monthIdx + 1, ...meta } });
    } catch (e) {
      if (prev) qc.setQueryData(key, prev);
      toast.error("Could not save month", { description: String((e as Error)?.message ?? e) });
    }
  };
}

/** Save a goal field (e.g. notes) without opening the edit dialog. */
export function useSaveGoalField() {
  const qc = useQueryClient();
  return async (goal: StrategyGoal, patch: Partial<StrategyGoal>) => {
    const { progress: _p, monthRag: _r, monthComments: _c, updatedAt: _u, ...rest } = { ...goal, ...patch };
    try {
      await $saveGoal({ data: rest });
      await qc.invalidateQueries({ queryKey: strategyKeys.year(goal.year) });
    } catch (e) {
      toast.error("Could not save goal", { description: String((e as Error)?.message ?? e) });
    }
  };
}

/** Effective value of a strategy list setting: saved values, or the built-in default. */
export function useStrategyOption(key: string): string[] {
  const saved = usePortfolio((s) => s.settings[key]);
  return saved && saved.length ? saved : STRATEGY_DEFAULTS[key] ?? [];
}

export function useStrategyOptions() {
  const departments = useStrategyOption(STRATEGY_SETTING_KEYS.department);
  const priorities = useStrategyOption(STRATEGY_SETTING_KEYS.priority);
  const areas = useStrategyOption(STRATEGY_SETTING_KEYS.deepDiveArea);
  return { departments, priorities, areas };
}

// ── Leadership review ───────────────────────────────────────────────────────────────
export type ReviewSearch = { month?: string; dept?: string; i?: number };
export const validateReviewSearch = (s: Record<string, unknown>): ReviewSearch => {
  const out: ReviewSearch = {};
  if (typeof s.month === "string" && /^\d{4}-\d{2}$/.test(s.month)) out.month = s.month;
  if (typeof s.dept === "string" && s.dept) out.dept = s.dept;
  const i = Number(s.i);
  if (Number.isInteger(i) && i >= 0) out.i = i;
  return out;
};

/** Goals in review order: configured department order, then priority order. */
export function useReviewGoals(dept?: string) {
  const search = useStrategyUI((s) => s.search);
  const { data, ...rest } = useStrategyYearData();
  const { departments, priorities } = useStrategyOptions();
  const goals = useMemo(() => {
    const rank = (list: string[], v: string) => { const i = list.indexOf(v); return i < 0 ? 99 : i; };
    return (data?.goals ?? [])
      .filter((g) => (!dept || g.department === dept) && goalMatches(search, g))
      .sort((a, b) => rank(departments, a.department) - rank(departments, b.department) || a.department.localeCompare(b.department)
        || priorityRank(a.priority, priorities) - priorityRank(b.priority, priorities) || a.objective.localeCompare(b.objective));
  }, [data, dept, search, departments, priorities]);
  return { goals, data, ...rest };
}

export function useReviews(month: string) {
  return useQuery({ queryKey: strategyKeys.reviews(month), queryFn: () => $getStrategyReviews({ data: { reviewMonth: month } }) });
}

/** Years for the year dropdown: saved years, years with data, this year and next. */
export function useAvailableYears(): number[] {
  const saved = useStrategyOption(STRATEGY_SETTING_KEYS.year);
  const selected = useStrategyUI((s) => s.year);
  const { data } = useQuery({ queryKey: strategyKeys.years, queryFn: () => $listStrategyYears(), staleTime: 60_000 });
  return useMemo(() => {
    const now = new Date().getFullYear();
    const set = new Set<number>([now, now + 1, selected, ...(data ?? []), ...saved.map(Number).filter(Boolean)]);
    return Array.from(set).sort((a, b) => b - a);
  }, [data, saved, selected]);
}
