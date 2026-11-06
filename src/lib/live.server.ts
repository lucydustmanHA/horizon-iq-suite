/**
 * live.server.ts — Server functions for the Live & Delivering feature.
 * Reads completed use cases from Lakebase and manages live_monitoring,
 * live_metrics, and live_reviews tables.
 */
import { createServerFn } from "@tanstack/react-start";
import { getDb } from "./db.server";
import type { LiveMetric, LiveMonitoring, LiveReview, LiveCaseSummary } from "./live-mock-data";
import { compareReviewKeysDesc, inferReviewCycleFromKey, isReviewKeyInCycle, normalizeReviewCycle } from "./live-review-utils";

// ---------------------------------------------------------------------------
// Load all completed (live) use cases with summary data for dashboard
// ---------------------------------------------------------------------------
export const $loadLiveCases = createServerFn({ method: "GET" })
  .validator((data: { reviewKey?: string | null; reviewCycle?: string | null }) => data)
  .handler(async ({ data }): Promise<LiveCaseSummary[]> => {
    const db = await getDb();
    const { rows: cases } = await db.query(
      `SELECT use_case_id, title, workgroup, use_case_owner, last_completed_at, proactive_work_pct, live_non_applicable, review_cycle, status_update, status_update_date
       FROM public.use_cases WHERE (LOWER(stage) = 'live' OR (last_completed_at IS NOT NULL AND LOWER(stage) NOT IN ('closed','archive'))) ORDER BY use_case_id`
    );
    const ids = cases.map((r: Record<string, unknown>) => String(r.use_case_id));
    if (ids.length === 0) return [];

    const ph = ids.map((_: string, i: number) => "$" + String(i + 1)).join(",");

    const reviewRowsByUseCase: Record<string, Record<string, unknown>[]> = {};
    const metricsMap: Record<string, LiveMetric[]> = {};
    const todoMap: Record<string, number> = {};
    const approachMap: Record<string, string> = {};
    const reviewCycleMap: Record<string, string> = {};

    try {
      const { rows: reviews } = await db.query(
        "SELECT use_case_id, review_month, rag_status, meeting_notes, hours_saved, dollars_saved, comment FROM public.live_reviews WHERE use_case_id IN (" + ph + ")",
        ids
      );
      for (const row of reviews) {
        const ucId = String(row.use_case_id);
        if (!reviewRowsByUseCase[ucId]) reviewRowsByUseCase[ucId] = [];
        reviewRowsByUseCase[ucId].push(row);
      }
    } catch (e) { console.error("[Live] reviews query failed:", e); }

    try {
      const { rows: metrics } = await db.query(
        "SELECT id, use_case_id, metric_name, unit, direction, target, period_values, rollup, starred, sort_order FROM public.live_metrics WHERE starred = true AND use_case_id IN (" + ph + ")",
        ids
      );
      for (const row of metrics) {
        const ucId = String(row.use_case_id);
        if (!metricsMap[ucId]) metricsMap[ucId] = [];
        metricsMap[ucId].push(rowToMetric(row));
      }
    } catch (e) { console.error("[Live] metrics query failed:", e); }

    try {
      const { rows: todoCounts } = await db.query(
        "SELECT use_case_id, COUNT(*) as cnt FROM public.use_case_todos WHERE done = false AND use_case_id IN (" + ph + ") GROUP BY use_case_id",
        ids
      );
      for (const row of todoCounts) todoMap[String(row.use_case_id)] = Number(row.cnt);
    } catch (e) { console.error("[Live] todos query failed:", e); }

    try {
      const { rows: monRows } = await db.query(
        "SELECT use_case_id, approach, cadence FROM public.live_monitoring WHERE use_case_id IN (" + ph + ")",
        ids
      );
      for (const row of monRows) {
        const ucId = String(row.use_case_id);
        approachMap[ucId] = String(row.approach ?? "");
        reviewCycleMap[ucId] = normalizeReviewCycle(String(row.cadence ?? "Monthly"));
      }
    } catch (e) { console.error("[Live] monitoring query failed:", e); }

    const requestedCycle = data.reviewCycle ? normalizeReviewCycle(data.reviewCycle) : null;

    return cases
      .map((row: Record<string, unknown>) => {
        const ucId = String(row.use_case_id);
        const assignedCycle = normalizeReviewCycle(String(row.review_cycle ?? "")) !== "Monthly" ? normalizeReviewCycle(String(row.review_cycle ?? "")) : reviewCycleMap[ucId] ?? "Monthly";
        const review = selectReviewRow(reviewRowsByUseCase[ucId] ?? [], {
          reviewKey: data.reviewKey ?? null,
          reviewCycle: requestedCycle ?? assignedCycle,
          preferSameCycle: true,
        });
        return {
          id: ucId,
          title: String(row.title ?? ""),
          workgroup: String(row.workgroup ?? ""),
          owner: String(row.use_case_owner ?? ""),
          deployedDate: row.last_completed_at ? String(row.last_completed_at) : null,
          approach: approachMap[ucId] ?? (row.proactive_work_pct != null && Number(row.proactive_work_pct) > 0 ? "Proactive" : row.proactive_work_pct != null && Number(row.proactive_work_pct) === 0 ? "Reactive" : ""),
          reviewCycle: assignedCycle,
          ragStatus: review ? String(review.rag_status ?? "green") : "green",
          starredMetrics: metricsMap[ucId] ?? [],
          hoursSaved: review ? Number(review.hours_saved ?? 0) : 0,
          dollarsSaved: review ? Number(review.dollars_saved ?? 0) : 0,
          openTodos: todoMap[ucId] ?? 0,
          comment: review ? String(review.comment ?? "") : "",
          proactivePct: row.proactive_work_pct != null ? Number(row.proactive_work_pct) : null,
          nonApplicable: row.live_non_applicable === true,
          latestReviewKey: review ? String(review.review_month ?? "") : null,
          statusUpdate: String(row.status_update ?? ""),
          statusUpdateDate: row.status_update_date ? new Date(String(row.status_update_date)).toISOString() : null,
        };
      })
      .filter((row) => !requestedCycle || row.reviewCycle === requestedCycle);
  });

// ---------------------------------------------------------------------------
// Monitoring CRUD
// ---------------------------------------------------------------------------
export const $getMonitoring = createServerFn({ method: "GET" })
  .validator((data: { useCaseId: string }) => data)
  .handler(async ({ data }): Promise<LiveMonitoring | null> => {
    const db = await getDb();
    const { rows } = await db.query(
      "SELECT * FROM public.live_monitoring WHERE use_case_id = $1", [data.useCaseId]
    );
    if (rows.length === 0) return null;
    return rowToMonitoring(rows[0]);
  });

export const $upsertMonitoring = createServerFn({ method: "POST" })
  .validator((data: { useCaseId: string; description: string; tools: string[]; cadence: string; monitoringOwner: string; approach: string }) => data)
  .handler(async ({ data }): Promise<LiveMonitoring> => {
    const db = await getDb();
    const { rows } = await db.query(
      `INSERT INTO public.live_monitoring (use_case_id, description, tools, cadence, monitoring_owner, approach, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (use_case_id) DO UPDATE SET
         description = EXCLUDED.description, tools = EXCLUDED.tools,
         cadence = EXCLUDED.cadence, monitoring_owner = EXCLUDED.monitoring_owner,
         approach = EXCLUDED.approach, updated_at = NOW()
       RETURNING *`,
      [data.useCaseId, data.description, data.tools, data.cadence, data.monitoringOwner, data.approach]
    );
    return rowToMonitoring(rows[0]);
  });

// ---------------------------------------------------------------------------
// Metrics CRUD
// ---------------------------------------------------------------------------
export const $getMetrics = createServerFn({ method: "GET" })
  .validator((data: { useCaseId: string }) => data)
  .handler(async ({ data }): Promise<LiveMetric[]> => {
    const db = await getDb();
    const { rows } = await db.query(
      "SELECT * FROM public.live_metrics WHERE use_case_id = $1 ORDER BY sort_order, id",
      [data.useCaseId]
    );
    return rows.map(rowToMetric);
  });

export const $addMetric = createServerFn({ method: "POST" })
  .validator((data: { useCaseId: string; metricName: string; unit: string; target: number | null; starred: boolean; createdBy?: string }) => data)
  .handler(async ({ data }): Promise<LiveMetric> => {
    const db = await getDb();
    const { rows: maxRows } = await db.query(
      "SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order FROM public.live_metrics WHERE use_case_id = $1",
      [data.useCaseId]
    );
    const sortOrder = Number(maxRows[0]?.next_order ?? 1);
    const { rows } = await db.query(
      `INSERT INTO public.live_metrics (use_case_id, metric_name, unit, target, starred, sort_order, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [data.useCaseId, data.metricName, data.unit, data.target, data.starred, sortOrder, data.createdBy ?? ""]
    );
    return rowToMetric(rows[0]);
  });

export const $updateMetric = createServerFn({ method: "POST" })
  .validator((data: { id: number; metricName?: string; unit?: string; direction?: string; target?: number | null; periodValues?: Record<string, number>; rollup?: string; starred?: boolean; description?: string }) => data)
  .handler(async ({ data }) => {
    const db = await getDb();
    const fields: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    const p = () => "$" + String(i++);
    if (data.metricName !== undefined) { fields.push("metric_name = " + p()); values.push(data.metricName); }
    if (data.unit !== undefined) { fields.push("unit = " + p()); values.push(data.unit); }
    if (data.direction !== undefined) { fields.push("direction = " + p()); values.push(data.direction); }
    if (data.target !== undefined) { fields.push("target = " + p()); values.push(data.target); }
    if (data.periodValues !== undefined) { fields.push("period_values = " + p()); values.push(JSON.stringify(data.periodValues)); }
    if (data.rollup !== undefined) { fields.push("rollup = " + p()); values.push(data.rollup); }
    if (data.starred !== undefined) { fields.push("starred = " + p()); values.push(data.starred); }
    if (data.description !== undefined) { fields.push("description = " + p()); values.push(data.description); }
    if (!fields.length) return { ok: true };
    values.push(data.id);
    await db.query("UPDATE public.live_metrics SET " + fields.join(", ") + " WHERE id = " + "$" + String(i), values);
    return { ok: true };
  });

export const $deleteMetric = createServerFn({ method: "POST" })
  .validator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    const db = await getDb();
    await db.query("DELETE FROM public.live_metrics WHERE id = $1", [data.id]);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Reviews CRUD
// ---------------------------------------------------------------------------
export const $getReview = createServerFn({ method: "GET" })
  .validator((data: { useCaseId: string; reviewMonth: string; reviewCycle?: string | null }) => data)
  .handler(async ({ data }): Promise<LiveReview | null> => {
    const db = await getDb();
    const { rows } = await db.query(
      "SELECT * FROM public.live_reviews WHERE use_case_id = $1",
      [data.useCaseId]
    );
    const row = selectReviewRow(rows, {
      reviewKey: data.reviewMonth,
      reviewCycle: data.reviewCycle ?? null,
      preferSameCycle: true,
    });
    return row ? rowToReview(row) : null;
  });

export const $upsertReview = createServerFn({ method: "POST" })
  .validator((data: { useCaseId: string; reviewMonth: string; ragStatus?: string; meetingNotes?: string; hoursSaved?: number; dollarsSaved?: number; comment?: string }) => data)
  .handler(async ({ data }): Promise<LiveReview> => {
    const db = await getDb();
    const { rows } = await db.query(
      `INSERT INTO public.live_reviews (use_case_id, review_month, rag_status, meeting_notes, hours_saved, dollars_saved, comment, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (use_case_id, review_month) DO UPDATE SET
         rag_status = COALESCE(EXCLUDED.rag_status, live_reviews.rag_status),
         meeting_notes = COALESCE(EXCLUDED.meeting_notes, live_reviews.meeting_notes),
         hours_saved = COALESCE(EXCLUDED.hours_saved, live_reviews.hours_saved),
         dollars_saved = COALESCE(EXCLUDED.dollars_saved, live_reviews.dollars_saved),
         comment = COALESCE(EXCLUDED.comment, live_reviews.comment),
         updated_at = NOW()
       RETURNING *`,
      [data.useCaseId, data.reviewMonth, data.ragStatus ?? "green", data.meetingNotes ?? "", data.hoursSaved ?? 0, data.dollarsSaved ?? 0, data.comment ?? ""]
    );
    return rowToReview(rows[0]);
  });

// Get distinct review keys that have data
export const $getReviewMonths = createServerFn({ method: "GET" })
  .validator((data?: { reviewCycle?: string | null }) => data ?? {})
  .handler(async ({ data }): Promise<string[]> => {
    const db = await getDb();
    const { rows } = await db.query(
      "SELECT DISTINCT review_month FROM public.live_reviews"
    );
    const keys = rows.map((row: Record<string, unknown>) => String(row.review_month));
    const requestedCycle = data?.reviewCycle ? normalizeReviewCycle(data.reviewCycle) : null;
    const filtered = requestedCycle ? keys.filter((key) => isReviewKeyInCycle(key, requestedCycle)) : keys;
    return filtered.sort(compareReviewKeysDesc);
  });

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------
function rowToMetric(r: Record<string, unknown>): LiveMetric {
  return {
    id: Number(r.id),
    useCaseId: String(r.use_case_id),
    metricName: String(r.metric_name ?? ""),
    unit: String(r.unit ?? "%"),
    direction: String(r.direction ?? ""),
    target: r.target != null ? Number(r.target) : null,
    periodValues: (typeof r.period_values === "object" && r.period_values !== null) ? r.period_values as Record<string, number> : {},
    rollup: String(r.rollup ?? "avg"),
    starred: Boolean(r.starred),
    sortOrder: Number(r.sort_order ?? 0),
    description: String(r.description ?? ""),
  };
}

function rowToMonitoring(r: Record<string, unknown>): LiveMonitoring {
  return {
    id: Number(r.id),
    useCaseId: String(r.use_case_id),
    description: String(r.description ?? ""),
    tools: Array.isArray(r.tools) ? r.tools.map(String) : [],
    cadence: String(r.cadence ?? "Weekly"),
    monitoringOwner: String(r.monitoring_owner ?? ""),
    approach: String(r.approach ?? "Proactive"),
    updatedAt: r.updated_at ? new Date(r.updated_at as string).toISOString() : "",
  };
}

function rowToReview(r: Record<string, unknown>): LiveReview {
  return {
    id: Number(r.id),
    useCaseId: String(r.use_case_id),
    reviewMonth: String(r.review_month),
    ragStatus: String(r.rag_status ?? "green"),
    meetingNotes: String(r.meeting_notes ?? ""),
    hoursSaved: Number(r.hours_saved ?? 0),
    dollarsSaved: Number(r.dollars_saved ?? 0),
    comment: String(r.comment ?? ""),
    updatedAt: r.updated_at ? new Date(r.updated_at as string).toISOString() : "",
  };
}

function selectReviewRow(
  rows: Record<string, unknown>[],
  options: { reviewKey?: string | null; reviewCycle?: string | null; preferSameCycle?: boolean },
): Record<string, unknown> | null {
  if (!rows.length) return null;

  const requestedCycle = options.reviewCycle ? normalizeReviewCycle(options.reviewCycle) : null;

  if (options.reviewKey) {
    const exact = rows.find((row) => String(row.review_month) === options.reviewKey);
    if (exact) return exact;
  }

  let relevant = rows;
  if (requestedCycle && options.preferSameCycle) {
    const sameCycle = rows.filter((row) => inferReviewCycleFromKey(String(row.review_month)) === requestedCycle);
    if (sameCycle.length) relevant = sameCycle;
  }

  relevant.sort((a, b) => compareReviewKeysDesc(String(a.review_month), String(b.review_month)));
  return relevant[0] ?? null;
}

export const $toggleNonApplicable = createServerFn({ method: "POST" })
  .validator((data: { useCaseId: string; nonApplicable: boolean }) => data)
  .handler(async ({ data }) => {
    const db = await getDb();
    await db.query(
      "UPDATE public.use_cases SET live_non_applicable = $1 WHERE use_case_id = $2",
      [data.nonApplicable, data.useCaseId]
    );
  });

// ---------------------------------------------------------------------------
// Review cycle assignment
// ---------------------------------------------------------------------------
export const $updateReviewCycle = createServerFn({ method: "POST" })
  .validator((data: { useCaseId: string; reviewCycle: string }) => data)
  .handler(async ({ data }) => {
    const db = await getDb();
    const cycle = normalizeReviewCycle(data.reviewCycle);
    await db.query(
      "UPDATE public.use_cases SET review_cycle = $1 WHERE use_case_id = $2",
      [cycle, data.useCaseId]
    );
    // Also sync to live_monitoring.cadence if row exists
    await db.query(
      "UPDATE public.live_monitoring SET cadence = $1, updated_at = NOW() WHERE use_case_id = $2",
      [cycle, data.useCaseId]
    );
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Inline RAG update from dashboard
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Review sessions (for Past Reviews on dashboard)
// ---------------------------------------------------------------------------
export const $getReviewSessions = createServerFn({ method: "GET" })
  .handler(async (): Promise<{ reviewKey: string; cycle: string; completedAt: string; caseCount: number }[]> => {
    const db = await getDb();
    const { rows } = await db.query(
      `SELECT review_month, MAX(updated_at) as completed_at, COUNT(DISTINCT use_case_id) as case_count
       FROM public.live_reviews GROUP BY review_month ORDER BY MAX(updated_at) DESC`
    );
    return rows.map((r: Record<string, unknown>) => ({
      reviewKey: String(r.review_month),
      cycle: inferReviewCycleFromKey(String(r.review_month)),
      completedAt: r.completed_at ? new Date(r.completed_at as string).toISOString() : "",
      caseCount: Number(r.case_count),
    }));
  });

export const $deleteReviewSession = createServerFn({ method: "POST" })
  .validator((data: { reviewKey: string }) => data)
  .handler(async ({ data }) => {
    const db = await getDb();
    await db.query("DELETE FROM public.live_reviews WHERE review_month = $1", [data.reviewKey]);
    return { ok: true };
  });

export const $updateRagFromDashboard = createServerFn({ method: "POST" })
  .validator((data: { useCaseId: string; ragStatus: string; reviewKey: string }) => data)
  .handler(async ({ data }): Promise<LiveReview> => {
    const db = await getDb();
    const { rows } = await db.query(
      `INSERT INTO public.live_reviews (use_case_id, review_month, rag_status, meeting_notes, hours_saved, dollars_saved, comment, updated_at)
       VALUES ($1, $2, $3, '', 0, 0, '', NOW())
       ON CONFLICT (use_case_id, review_month) DO UPDATE SET
         rag_status = EXCLUDED.rag_status, updated_at = NOW()
       RETURNING *`,
      [data.useCaseId, data.reviewKey, data.ragStatus]
    );
    return rowToReview(rows[0]);
  });
