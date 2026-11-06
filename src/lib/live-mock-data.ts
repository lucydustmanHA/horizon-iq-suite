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
  description: string;
}

import { REVIEW_CYCLE_OPTIONS } from "./live-review-utils";

export interface LiveMonitoring {
  id: number;
  useCaseId: string;
  description: string;
  tools: string[];
  cadence: string; // Review cycle assignment
  monitoringOwner: string;
  approach: string; // Proactive, Reactive
  updatedAt: string;
}

export interface LiveReview {
  id: number;
  useCaseId: string;
  reviewMonth: string; // Generic review key (legacy name retained for DB compatibility)
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
  reviewCycle: string; // assigned review cycle
  ragStatus: string; // from latest matching live review
  starredMetrics: LiveMetric[];
  hoursSaved: number;
  dollarsSaved: number;
  openTodos: number;
  comment: string; // from live_reviews
  proactivePct: number | null;
  nonApplicable: boolean;
  latestReviewKey: string | null;
  statusUpdate: string;
  statusUpdateDate: string | null;
}

export const METRIC_UNITS = ["%", "#", "hrs", "$", "ms"] as const;
export const ROLLUP_OPTIONS = ["avg", "latest", "sum", "min", "max"] as const;
export const CADENCE_OPTIONS = REVIEW_CYCLE_OPTIONS;
export const RAG_OPTIONS = ["green", "orange", "red"] as const;
