/**
 * live-types.ts — Types and interfaces for the Live & Delivering feature.
 * (File originally named live-mock-data.ts, repurposed for types only.)
 */

export interface LiveMetric {
  id: number;
  useCaseId: string;
  metricName: string;
  unit: string; // %, #, hrs, $, ms
  direction: string; // up, down, or empty
  target: number | null;
  periodValues: Record<string, number>; // e.g. {"W22": 92.1, "W23": 93}
  rollup: string; // avg, latest, sum, min, max
  starred: boolean;
  sortOrder: number;
}

export interface LiveMonitoring {
  id: number;
  useCaseId: string;
  description: string;
  tools: string[];
  cadence: string; // Daily, Weekly, Bi-weekly, Monthly, Quarterly
  monitoringOwner: string;
  approach: string; // Proactive, Reactive
  updatedAt: string;
}

export interface LiveReview {
  id: number;
  useCaseId: string;
  reviewMonth: string; // YYYY-MM format
  ragStatus: string; // green, orange, red
  meetingNotes: string;
  hoursSaved: number;
  dollarsSaved: number;
  comment: string;
  updatedAt: string;
}

export interface LiveCaseSummary {
  id: string;
  title: string;
  workgroup: string;
  owner: string;
  deployedDate: string | null; // last_completed_at
  approach: string; // from live_monitoring or default
  ragStatus: string; // from live_reviews for current month
  starredMetrics: LiveMetric[];
  hoursSaved: number;
  dollarsSaved: number;
  openTodos: number;
  comment: string; // from live_reviews
  proactivePct: number | null;
  nonApplicable: boolean;
}

export const METRIC_UNITS = ["%", "#", "hrs", "$", "ms"] as const;
export const ROLLUP_OPTIONS = ["avg", "latest", "sum", "min", "max"] as const;
export const CADENCE_OPTIONS = ["Daily", "Weekly", "Bi-weekly", "Monthly", "Quarterly"] as const;
export const RAG_OPTIONS = ["green", "orange", "red"] as const;
