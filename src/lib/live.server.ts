/**
 * live.server.ts — Server functions for the Live & Delivering feature.
 * Reads completed use cases from Lakebase and manages live_monitoring,
 * live_metrics, and live_reviews tables.
 */
import { createServerFn } from "@tanstack/react-start";
import { getDb } from "./db.server";
import type { LiveMetric, LiveMonitoring, LiveReview, LiveCaseSummary } from "./live-mock-data";

// ---------------------------------------------------------------------------
// Load all completed (live) use cases with summary data for dashboard
// ---------------------------------------------------------------------------
export const $loadLiveCases = createServerFn({ method: "GET" })
  .validator((data: { reviewMonth: string }) => data)
  .handler(async ({ data }): Promise<LiveCaseSummary[]> => {
    console.log("[DB] $loadLiveCases called, month:", data.reviewMonth);
    const db = await getDb();
    const { rows: cases } = await db.query(
      `SELECT use_case_id, title, workgroup, use_case_owner, last_completed_at, proactive_work_pct, live_non_applicable
       FROM public.use_cases WHERE LOWER(stage) = 'completed' ORDER BY use_case_id`
    );
    const ids = cases.map((r: Record<string, unknown>) => String(r.use_case_id));
    console.log("[DB] $loadLiveCases found", ids.length, "completed cases");
    if (ids.length === 0) return [];

    const ph = ids.map((_: string, i: number) => "\x24" + String(i + 1)).join(",");
    // For reviews query: $1=reviewMonth, ids start at $2
    const phOffset = ids.map((_: string, i: number) => "\x24" + String(i + 2)).join(",");

    // Sub-queries are resilient — failures won't block the main result
    let reviewMap: Record<string, Record<string, unknown>> = {};
    let metricsMap: Record<string, LiveMetric[]> = {};
    let todoMap: Record<string, number> = {};
    let approachMap: Record<string, string> = {};

    try {
      const { rows: reviews } = await db.query(
        "SELECT use_case_id, rag_status, hours_saved, dollars_saved, comment FROM public.live_reviews WHERE review_month = $1 AND use_case_id IN (" + phOffset + ")",
        [data.reviewMonth, ...ids]
      );
      for (const r of reviews) reviewMap[String(r.use_case_id)] = r;
    } catch (e) { console.error("[Live] reviews query failed:", e); }

    try {
      const { rows: metrics } = await db.query(
        "SELECT id, use_case_id, metric_name, unit, direction, target, period_values, rollup, starred, sort_order FROM public.live_metrics WHERE starred = true AND use_case_id IN (" + ph + ")",
        ids
      );
      for (const r of metrics) {
        const ucId = String(r.use_case_id);
        if (!metricsMap[ucId]) metricsMap[ucId] = [];
        metricsMap[ucId].push(rowToMetric(r));
      }
    } catch (e) { console.error("[Live] metrics query failed:", e); }

    try {
      const { rows: todoCounts } = await db.query(
        "SELECT use_case_id, COUNT(*) as cnt FROM public.use_case_todos WHERE done = false AND use_case_id IN (" + ph + ") GROUP BY use_case_id",
        ids
      );
      for (const r of todoCounts) todoMap[String(r.use_case_id)] = Number(r.cnt);
    } catch (e) { console.error("[Live] todos query failed:", e); }

    try {
      const { rows: monRows } = await db.query(
        "SELECT use_case_id, approach FROM public.live_monitoring WHERE use_case_id IN (" + ph + ")",
        ids
      );
      for (const r of monRows) approachMap[String(r.use_case_id)] = String(r.approach);
    } catch (e) { console.error("[Live] monitoring query failed:", e); }

    return cases.map((r: Record<string, unknown>) => {
      const ucId = String(r.use_case_id);
      const review = reviewMap[ucId];
      return {
        id: ucId,
        title: String(r.title ?? ""),
        workgroup: String(r.workgroup ?? ""),
        owner: String(r.use_case_owner ?? ""),
        deployedDate: r.last_completed_at ? String(r.last_completed_at) : null,
        approach: approachMap[ucId] ?? (r.proactive_work_pct != null && Number(r.proactive_work_pct) > 0 ? "Proactive" : r.proactive_work_pct != null && Number(r.proactive_work_pct) === 0 ? "Reactive" : ""),
        ragStatus: review ? String(review.rag_status) : "green",
        starredMetrics: metricsMap[ucId] ?? [],
        hoursSaved: review ? Number(review.hours_saved) : 0,
        dollarsSaved: review ? Number(review.dollars_saved) : 0,
        openTodos: todoMap[ucId] ?? 0,
        comment: review ? String(review.comment) : "",
        proactivePct: r.proactive_work_pct != null ? Number(r.proactive_work_pct) : null,
        nonApplicable: r.live_non_applicable === true,
      };
    });
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
  .validator((data: { id: number; metricName?: string; unit?: string; direction?: string; target?: number | null; periodValues?: Record<string, number>; rollup?: string; starred?: boolean }) => data)
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
  .validator((data: { useCaseId: string; reviewMonth: string }) => data)
  .handler(async ({ data }): Promise<LiveReview | null> => {
    const db = await getDb();
    const { rows } = await db.query(
      "SELECT * FROM public.live_reviews WHERE use_case_id = $1 AND review_month = $2",
      [data.useCaseId, data.reviewMonth]
    );
    if (rows.length === 0) return null;
    return rowToReview(rows[0]);
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

// Get distinct review months that have data
export const $getReviewMonths = createServerFn({ method: "GET" }).handler(async (): Promise<string[]> => {
  const db = await getDb();
  const { rows } = await db.query(
    "SELECT DISTINCT review_month FROM public.live_reviews ORDER BY review_month DESC"
  );
  return rows.map((r: Record<string, unknown>) => String(r.review_month));
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


export const $toggleNonApplicable = createServerFn({ method: "POST" })
  .validator((data: { useCaseId: string; nonApplicable: boolean }) => data)
  .handler(async ({ data }) => {
    const db = await getDb();
    await db.query(
      "UPDATE public.use_cases SET live_non_applicable = $1 WHERE use_case_id = $2",
      [data.nonApplicable, data.useCaseId]
    );
  });
