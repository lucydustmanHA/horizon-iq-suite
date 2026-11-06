/**
 * strategy-types.ts — shared types, defaults, and status logic for the Strategy side.
 * Pure module (no server or browser APIs) so it can be imported anywhere.
 */

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export type GoalStatus = "On track" | "Off track" | "Complete" | "Not started";
export const GOAL_STATUSES: GoalStatus[] = ["On track", "Off track", "Complete", "Not started"];
export type Direction = "increase" | "decrease";

export interface StrategyGoal {
  id: string;
  year: number;
  department: string;
  priority: string;
  objective: string;
  description: string;
  successCriteria: string;
  monthlyMetric: string;
  owner: string;
  secondaryOwner: string;
  targetValue: string;
  baselineValue: string;
  unitOfMeasure: string;
  direction: Direction;
  statusOverride: GoalStatus | null;
  notes: string;
  /** index 0..11 → Jan..Dec; empty string = not reported */
  progress: string[];
  /** index 0..11 → manual red/green for that month (only honoured for MONTH_OVERRIDE_YEARS); null = auto */
  monthRag: (MonthRag | null)[];
  /** index 0..11 → free-text comment on that month's number */
  monthComments: string[];
  updatedAt: string | null;
}

export type MonthRag = "green" | "red";
/** Plan years where month colours can be set manually instead of computed vs. target. */
export const MONTH_OVERRIDE_YEARS = [2026];
export const canOverrideMonths = (year: number) => MONTH_OVERRIDE_YEARS.includes(Number(year));

export interface StrategyActivity {
  id: number;
  goalId: string;
  activity: string;
  metric: string;
  target: string;
  dueDate: string | null; // YYYY-MM-DD
  status: string;
}

export const ACTIVITY_STATUSES = ["Not started", "In progress", "Blocked", "Done"] as const;

// ── Leadership review slides (goals + business initiatives) ──────────────────────
/** Slide key for initiatives with no department. */
export const CROSS_DEPT_SLIDE = "Cross-department initiatives";
const INIT_STATUS_RANK: Record<string, number> = { "At risk": 0, Active: 1, Planned: 2, Complete: 3 };

/**
 * Ordered review slides: departments with goals (in goal order), then departments that only have
 * initiatives, then one cross-department slide (when not filtered to a single department).
 */
export function reviewSlideKeys(goals: StrategyGoal[], initiatives: StrategyInitiative[], dept?: string): string[] {
  const keys = Array.from(new Set(goals.map((g) => g.department)));
  const inits = dept ? initiatives.filter((i) => i.department === dept) : initiatives;
  const extra = Array.from(new Set(inits.map((i) => i.department).filter((d) => d && !keys.includes(d)))).sort();
  keys.push(...extra);
  if (!dept && inits.some((i) => !i.department)) keys.push(CROSS_DEPT_SLIDE);
  return keys;
}

/** Initiatives shown on a slide, at-risk first. */
export function initiativesForSlide(initiatives: StrategyInitiative[], key: string): StrategyInitiative[] {
  const list = key === CROSS_DEPT_SLIDE ? initiatives.filter((i) => !i.department) : initiatives.filter((i) => i.department === key);
  return [...list].sort((a, b) => (INIT_STATUS_RANK[a.status] ?? 9) - (INIT_STATUS_RANK[b.status] ?? 9) || a.name.localeCompare(b.name));
}

/** At risk, or past its target date and not complete. */
export function initiativeNeedsAttention(i: StrategyInitiative, today = new Date().toISOString().slice(0, 10)): boolean {
  return i.status === "At risk" || (!!i.targetDate && i.targetDate < today && i.status !== "Complete");
}

export interface StrategyInitiative {
  id: number;
  year: number;
  name: string;
  objective: string;
  department: string;
  owner: string;
  targetDate: string | null;
  status: string;
  progressNotes: string;
}

export const INITIATIVE_STATUSES = ["Planned", "Active", "At risk", "Complete"] as const;

export interface StrategyDeepDive {
  id: number;
  year: number;
  name: string;
  heldOn: string | null;
  itemCount: number;
  openCount: number;
}

export interface StrategyActionItem {
  id: number;
  deepDiveId: number;
  area: string;
  action: string;
  owner: string;
  timing: string;
  status: string;
  notes: string;
}

export const ACTION_STATUSES = ["Not started", "In progress", "Blocked", "Done", "Dropped"] as const;
export const isClosedAction = (s: string) => s === "Done" || s === "Dropped";

export type Rag = "green" | "amber" | "red";
export interface StrategyReview {
  goalId: string;
  reviewMonth: string; // YYYY-MM
  rag: Rag | null;
  meetingNotes: string;
  updatedBy: string | null;
}

export interface StrategyYearData {
  goals: StrategyGoal[];
  activities: StrategyActivity[];
  initiatives: StrategyInitiative[];
}

// ── Configurable lists (stored in app_settings; these are fallbacks) ─────────
export const DEFAULT_DEPARTMENTS = ["Inflight", "Flight Ops", "Stations", "M&E"];
/** Display order for strategic priorities everywhere on the Strategy side. */
export const PRIORITY_ORDER = ["Safety", "People & Culture", "Operational Excellence", "Financial Durability"];
export const DEFAULT_PRIORITIES = [...PRIORITY_ORDER];
/** Sort rank: fixed PRIORITY_ORDER first, then any other configured priorities, then unknown. */
export function priorityRank(name: string, configured: string[] = []): number {
  const i = PRIORITY_ORDER.indexOf(name);
  if (i >= 0) return i;
  const j = configured.indexOf(name);
  return j >= 0 ? 10 + j : 99;
}
export function sortPriorities(list: string[], configured: string[] = []): string[] {
  return [...list].sort((a, b) => priorityRank(a, configured) - priorityRank(b, configured) || a.localeCompare(b));
}
export const DEFAULT_DEEP_DIVE_AREAS = ["Network / ATC", "Maintenance", "Pilots & Crew", "Airports", "Inflight", "Cross-Functional"];

export const STRATEGY_SETTING_KEYS = {
  department: "strategy_department",
  priority: "strategy_priority",
  year: "strategy_year",
  deepDiveArea: "strategy_deep_dive_area",
} as const;

export const STRATEGY_DEFAULTS: Record<string, string[]> = {
  [STRATEGY_SETTING_KEYS.department]: DEFAULT_DEPARTMENTS,
  [STRATEGY_SETTING_KEYS.priority]: DEFAULT_PRIORITIES,
  [STRATEGY_SETTING_KEYS.year]: [],
  [STRATEGY_SETTING_KEYS.deepDiveArea]: DEFAULT_DEEP_DIVE_AREAS,
};

const PRIORITY_META: Record<string, { color: string; blurb: string }> = {
  "Safety": { color: "#dc2626", blurb: "Assess, prepare, and follow processes so everyone goes home safely" },
  "People & Culture": { color: "#2563eb", blurb: "Enhance the employee experience through recognition and empowerment" },
  "Financial Durability": { color: "#059669", blurb: "Exercise owner mentality to build a competitive, sustainable business" },
  "Operational Excellence": { color: "#7c3aed", blurb: "Deliver a premium guest experience through performance, reliability, and care" },
};
const PALETTE = ["#0891b2", "#d97706", "#db2777", "#4f46e5", "#65a30d", "#0f766e"];

export function priorityColor(name: string, all: string[] = DEFAULT_PRIORITIES): string {
  if (PRIORITY_META[name]) return PRIORITY_META[name].color;
  const i = Math.max(0, all.indexOf(name));
  return PALETTE[i % PALETTE.length];
}
export function priorityBlurb(name: string): string {
  return PRIORITY_META[name]?.blurb ?? "";
}

// ── Status logic ─────────────────────────────────────────────────────────────
export function parseNumeric(raw: string): number | null {
  const s = String(raw ?? "").trim().replace(/[%$,\s]/g, "").replace(/^\+/, "");
  if (!s || !/^-?\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Guess direction from goal wording; only used as the default when creating a goal. */
export function guessDirection(text: string): Direction {
  return /\b(reduce|reduction|lower|decrease|attrition|delay|cost|nff|premium|incident|non-compliance)\b/i.test(text) ? "decrease" : "increase";
}

/** Status for a single reported value against the goal target. */
export function valueStatus(goal: Pick<StrategyGoal, "targetValue" | "direction">, actual: string): GoalStatus {
  const t = String(actual ?? "").trim().toLowerCase();
  if (!t) return "Not started";
  if (t === "on track" || t === "green") return "On track";
  if (t === "off track" || t === "red") return "Off track";
  if (t === "complete" || t === "completed" || t === "done") return "Complete";
  const a = parseNumeric(actual);
  const target = parseNumeric(goal.targetValue);
  if (a === null || target === null) return "On track"; // qualitative update — treat as reported
  return goal.direction === "decrease" ? (a <= target ? "On track" : "Off track") : (a >= target ? "On track" : "Off track");
}

/** Short label for a month cell so wordy values ("Off Track", "RAG Full") don't get cut off. Full value goes in the tooltip. */
export function shortCellLabel(raw: string): string {
  const v = String(raw ?? "").trim();
  if (!v) return "";
  const t = v.toLowerCase();
  if (t === "on track" || t === "green") return "On";
  if (t === "off track" || t === "red") return "Off";
  if (t === "complete" || t === "completed" || t === "done") return "Done";
  if (parseNumeric(v) !== null) return v;
  return v.length > 6 ? v.slice(0, 5) + "…" : v;
}

export function latestReported(goal: Pick<StrategyGoal, "progress">): { month: number; value: string } | null {
  for (let i = 11; i >= 0; i--) if ((goal.progress[i] ?? "").trim()) return { month: i, value: goal.progress[i] };
  return null;
}

/** Status for one month: manual red/green (2026 only) wins, otherwise computed vs. target. */
export function monthStatus(goal: StrategyGoal, monthIdx: number): GoalStatus {
  const o = canOverrideMonths(goal.year) ? goal.monthRag?.[monthIdx] ?? null : null;
  if (o === "green") return "On track";
  if (o === "red") return "Off track";
  return valueStatus(goal, goal.progress[monthIdx] ?? "");
}

export function goalStatus(goal: StrategyGoal): GoalStatus {
  if (goal.statusOverride) return goal.statusOverride;
  const last = latestReported(goal);
  return last ? monthStatus(goal, last.month) : "Not started";
}

/** Consecutive off-track months ending at the latest reported month. */
export function offTrackStreak(goal: StrategyGoal): number {
  const last = latestReported(goal);
  if (!last) return 0;
  let n = 0;
  for (let i = last.month; i >= 0; i--) {
    const v = goal.progress[i] ?? "";
    if (!v.trim()) break;
    if (monthStatus(goal, i) === "Off track") n++; else break;
  }
  return n;
}

export const STATUS_STYLES: Record<GoalStatus, { pill: string; dot: string; cell: string }> = {
  "On track": { pill: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500", cell: "bg-emerald-100 text-emerald-800" },
  "Off track": { pill: "bg-red-50 text-red-700 ring-red-200", dot: "bg-red-500", cell: "bg-red-100 text-red-800" },
  "Complete": { pill: "bg-sky-50 text-sky-700 ring-sky-200", dot: "bg-sky-500", cell: "bg-sky-100 text-sky-800" },
  "Not started": { pill: "bg-slate-100 text-slate-500 ring-slate-200", dot: "bg-slate-300", cell: "bg-slate-50 text-slate-400" },
};

export const RAG_STYLES: Record<Rag, { label: string; pill: string; dot: string }> = {
  green: { label: "Green", pill: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500" },
  amber: { label: "Amber", pill: "bg-amber-50 text-amber-700 ring-amber-200", dot: "bg-amber-500" },
  red: { label: "Red", pill: "bg-red-50 text-red-700 ring-red-200", dot: "bg-red-500" },
};

export function ragFromStatus(s: GoalStatus): Rag | null {
  return s === "Off track" ? "red" : s === "On track" || s === "Complete" ? "green" : null;
}

// ── Review month helpers (YYYY-MM) ──────────────────────────────────────────
export function monthKey(year: number, monthIdx: number) {
  return `${year}-${String(monthIdx + 1).padStart(2, "0")}`;
}
export function formatMonthKey(key: string) {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return `${MONTHS[m - 1]} ${y}`;
}
/** Default review month for a year: last month if we're in that year, else December. */
export function defaultReviewMonth(year: number): string {
  const now = new Date();
  if (year === now.getFullYear()) return monthKey(year, Math.max(0, now.getMonth() - 1));
  if (year > now.getFullYear()) return monthKey(year, 0);
  return monthKey(year, 11);
}

export function matchesSearch(q: string, ...fields: (string | null | undefined)[]) {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return fields.some((f) => (f ?? "").toLowerCase().includes(needle));
}
export const goalMatches = (q: string, g: StrategyGoal) =>
  matchesSearch(q, g.objective, g.description, g.owner, g.secondaryOwner, g.department, g.priority, g.id);

export function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  const [y, m, day] = d.split("-").map(Number);
  if (!y || !m || !day) return d;
  return `${MONTHS[m - 1]} ${day}, ${y}`;
}

export function emptyGoal(year: number): StrategyGoal {
  return {
    id: "", year, department: "", priority: "", objective: "", description: "", successCriteria: "",
    monthlyMetric: "", owner: "", secondaryOwner: "", targetValue: "", baselineValue: "", unitOfMeasure: "",
    direction: "increase", statusOverride: null, notes: "", progress: Array(12).fill(""),
    monthRag: Array(12).fill(null), monthComments: Array(12).fill(""), updatedAt: null,
  };
}
