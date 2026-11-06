export const REVIEW_CYCLE_OPTIONS = [
  "Weekly",
  "Monthly",
  "Quarterly",
  "Bi-Annual",
  "Annual",
  "Ad Hoc Review",
  "One-and-Done",
] as const;

export type ReviewCycle = (typeof REVIEW_CYCLE_OPTIONS)[number];

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const REVIEW_CYCLE_SET = new Set<string>(REVIEW_CYCLE_OPTIONS);

export function normalizeReviewCycle(raw?: string | null): ReviewCycle {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "weekly" || value === "daily" || value === "bi-weekly" || value === "biweekly") return "Weekly";
  if (value === "monthly") return "Monthly";
  if (value === "quarterly") return "Quarterly";
  if (value === "bi-annual" || value === "bi annual" || value === "semi-annual" || value === "semi annual" || value === "half-yearly") return "Bi-Annual";
  if (value === "annual" || value === "yearly") return "Annual";
  if (value === "ad hoc review" || value === "ad hoc" || value === "adhoc") return "Ad Hoc Review";
  if (value === "one-and-done" || value === "one and done" || value === "oneanddone") return "One-and-Done";
  return "Monthly";
}

export function inferReviewCycleFromKey(key?: string | null): ReviewCycle {
  const value = String(key ?? "").trim();
  if (!value) return "Monthly";
  if (/^adhoc:/i.test(value)) return "Ad Hoc Review";
  if (/^oneanddone:/i.test(value)) return "One-and-Done";
  if (/^\d{4}-W\d{2}$/i.test(value)) return "Weekly";
  if (/^\d{4}-Q[1-4]$/i.test(value)) return "Quarterly";
  if (/^\d{4}-H[12]$/i.test(value)) return "Bi-Annual";
  if (/^\d{4}-\d{2}$/i.test(value)) return "Monthly";
  if (/^\d{4}$/i.test(value)) return "Annual";
  return "Ad Hoc Review";
}

export function getCurrentReviewKey(cycle: string, now = new Date()): string {
  const normalized = normalizeReviewCycle(cycle);
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  if (normalized === "Monthly") return `${year}-${month}`;
  if (normalized === "Quarterly") return `${year}-Q${Math.floor(now.getMonth() / 3) + 1}`;
  if (normalized === "Bi-Annual") return `${year}-H${now.getMonth() < 6 ? 1 : 2}`;
  if (normalized === "Annual") return String(year);
  if (normalized === "Weekly") return `${year}-W${String(getIsoWeek(now)).padStart(2, "0")}`;
  if (normalized === "One-and-Done") return `oneanddone:${year}${month}${String(now.getDate()).padStart(2, "0")}`;
  return `adhoc:${year}${month}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
}

export function formatReviewKey(key: string): string {
  const value = String(key ?? "").trim();
  if (!value) return "Current";
  const cycle = inferReviewCycleFromKey(value);
  if (cycle === "Monthly") {
    const match = value.match(/^(\d{4})-(\d{2})$/);
    if (match) return `${MONTH_LABELS[Number(match[2]) - 1]} ${match[1]}`;
  }
  if (cycle === "Quarterly") {
    const match = value.match(/^(\d{4})-Q([1-4])$/);
    if (match) return `Q${match[2]} ${match[1]}`;
  }
  if (cycle === "Bi-Annual") {
    const match = value.match(/^(\d{4})-H([12])$/);
    if (match) return `H${match[2]} ${match[1]}`;
  }
  if (cycle === "Annual") return value;
  if (cycle === "Weekly") {
    const match = value.match(/^(\d{4})-W(\d{2})$/i);
    if (match) return `Week ${Number(match[2])}, ${match[1]}`;
  }
  if (cycle === "Ad Hoc Review" && /^adhoc:/i.test(value)) {
    const raw = value.replace(/^adhoc:/i, "");
    const match = raw.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$/);
    if (match) return `Ad hoc ${MONTH_LABELS[Number(match[2]) - 1]} ${Number(match[3])}, ${match[1]} ${match[4]}:${match[5]}`;
    return `Ad hoc ${raw}`;
  }
  if (cycle === "One-and-Done") return "One-and-Done";
  return value;
}

export function sortReviewKeysDesc(keys: string[]): string[] {
  return [...keys].sort(compareReviewKeysDesc);
}

export function compareReviewKeysDesc(a: string, b: string): number {
  const aValue = getReviewSortValue(a);
  const bValue = getReviewSortValue(b);
  if (aValue !== bValue) return bValue - aValue;
  return String(b).localeCompare(String(a));
}

export function getReviewSortValue(key: string): number {
  const value = String(key ?? "").trim();
  if (!value) return 0;
  const cycle = inferReviewCycleFromKey(value);
  if (cycle === "Annual") return Number(value) * 10000;
  if (cycle === "Monthly") {
    const match = value.match(/^(\d{4})-(\d{2})$/);
    if (match) return Number(match[1]) * 10000 + Number(match[2]) * 100;
  }
  if (cycle === "Quarterly") {
    const match = value.match(/^(\d{4})-Q([1-4])$/);
    if (match) return Number(match[1]) * 10000 + Number(match[2]) * 2500;
  }
  if (cycle === "Bi-Annual") {
    const match = value.match(/^(\d{4})-H([12])$/);
    if (match) return Number(match[1]) * 10000 + Number(match[2]) * 5000;
  }
  if (cycle === "Weekly") {
    const match = value.match(/^(\d{4})-W(\d{2})$/i);
    if (match) return Number(match[1]) * 10000 + Number(match[2]) * 100;
  }
  if (cycle === "Ad Hoc Review") {
    const digits = value.replace(/\D/g, "");
    return Number(digits.slice(0, 12) || 0);
  }
  if (cycle === "One-and-Done") {
    const digits = value.replace(/\D/g, "");
    return Number(digits.slice(0, 8) || 0);
  }
  return 0;
}

export function sortMetricPeriods(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const aValue = getMetricPeriodSortValue(a);
    const bValue = getMetricPeriodSortValue(b);
    if (aValue !== bValue) return aValue - bValue;
    return a.localeCompare(b);
  });
}

export function getMetricOrderedValues(metric: { periodValues: Record<string, number> }, periodOrder?: string[]): number[] {
  const keys = (periodOrder && periodOrder.length > 0 ? periodOrder : sortMetricPeriods(Object.keys(metric.periodValues)))
    .filter((key) => metric.periodValues[key] != null);
  return keys.map((key) => Number(metric.periodValues[key])).filter((value) => !Number.isNaN(value));
}

export function getMetricRollupValue(metric: { periodValues: Record<string, number>; rollup: string }, periodOrder?: string[]): number | null {
  const values = getMetricOrderedValues(metric, periodOrder);
  if (values.length === 0) return null;
  if (metric.rollup === "latest") return values[values.length - 1];
  if (metric.rollup === "sum") return values.reduce((sum, value) => sum + value, 0);
  if (metric.rollup === "min") return Math.min(...values);
  if (metric.rollup === "max") return Math.max(...values);
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function formatMetricValue(value: number | null, unit: string, digits = 1): string {
  if (value === null || Number.isNaN(value)) return "—";
  const rendered = value % 1 === 0 ? String(value) : value.toFixed(digits);
  return unit === "%" ? `${rendered}%` : rendered;
}

export function isReviewKeyInCycle(key: string, cycle: string): boolean {
  return inferReviewCycleFromKey(key) === normalizeReviewCycle(cycle);
}

export function isSupportedReviewCycle(value: string): value is ReviewCycle {
  return REVIEW_CYCLE_SET.has(value);
}

function getMetricPeriodSortValue(key: string): number {
  const value = String(key ?? "").trim();
  if (!value) return Number.MAX_SAFE_INTEGER;

  const isoMonth = value.match(/^(\d{4})-(\d{2})$/);
  if (isoMonth) return Number(isoMonth[1]) * 10000 + Number(isoMonth[2]) * 100;

  const isoWeek = value.match(/^(\d{4})-W(\d{2})$/i);
  if (isoWeek) return Number(isoWeek[1]) * 10000 + Number(isoWeek[2]) * 100;

  const isoQuarter = value.match(/^(\d{4})-Q([1-4])$/i);
  if (isoQuarter) return Number(isoQuarter[1]) * 10000 + Number(isoQuarter[2]) * 2500;

  const isoHalf = value.match(/^(\d{4})-H([12])$/i);
  if (isoHalf) return Number(isoHalf[1]) * 10000 + Number(isoHalf[2]) * 5000;

  const monthYear = value.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[ -]?(\d{2}|\d{4})$/i);
  if (monthYear) {
    const month = MONTH_LABELS.findIndex((label) => label.toLowerCase() === monthYear[1].slice(0, 3).toLowerCase()) + 1;
    const year = monthYear[2].length === 2 ? 2000 + Number(monthYear[2]) : Number(monthYear[2]);
    return year * 10000 + month * 100;
  }

  const bareWeek = value.match(/^W(\d{1,2})$/i);
  if (bareWeek) return 90000000 + Number(bareWeek[1]) * 100;

  const bareQuarter = value.match(/^Q([1-4])$/i);
  if (bareQuarter) return 91000000 + Number(bareQuarter[1]) * 2500;

  return 99000000;
}

/**
 * Returns true when a use case has NOT been reviewed in its current cycle period.
 * Ad Hoc and One-and-Done cycles are never "due".
 */
export function isReviewDueForCurrentPeriod(
  reviewCycle: string,
  latestReviewKey: string | null,
  now = new Date(),
): boolean {
  const normalized = normalizeReviewCycle(reviewCycle);
  if (normalized === "One-and-Done" || normalized === "Ad Hoc Review") return false;
  const currentKey = getCurrentReviewKey(normalized, now);
  return latestReviewKey !== currentKey;
}

function getIsoWeek(date: Date): number {
  const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}
