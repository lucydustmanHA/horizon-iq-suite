/**
 * adoption.server.ts — Server functions for the AI Adoption page.
 * Manages Copilot usage snapshots (CSV uploads) and training session records.
 */
import { createServerFn } from "@tanstack/react-start";
import { getDb } from "./db.server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
/**
 * Scope of a report file, DERIVED FROM THE DATA — never hand-tagged.
 *  - "horizon_only"  : every row is @horizonair.com (e.g. the Jan and Aug exports).
 *                      There is no Alaska / all-company number in this file at all,
 *                      so those measures are NULL, not zero.
 *  - "all_company"   : the file contains non-Horizon rows (e.g. the May and Oct exports).
 */
export type SnapshotScope = "horizon_only" | "all_company";

export interface CopilotSnapshot {
  id: number;
  reportDate: string;
  reportPeriodDays: number;
  filename: string;
  uploadedAt: string;
  /** Row / prompt counts across every domain present in THIS file. */
  totalUsers: number;
  activeUsers: number;
  totalPrompts: number;
  /** Horizon is present in every export, so these are always populated. */
  horizonPrompts: number;
  horizonAccounts: number;
  horizonActiveAccounts: number;
  /**
   * NULL when the file contains no alaskaair.com rows whatsoever.
   * 0 would be a lie — it would assert "Alaska sent zero prompts" when the
   * truth is "this export did not cover Alaska". Charts must render a GAP here.
   */
  alaskaPrompts: number | null;
  alaskaAccounts: number;
  alaskaActiveAccounts: number;
  nonHorizonAccounts: number;
  scope: SnapshotScope;
  /**
   * Set when a file looks all-company but is overwhelmingly Horizon — usually a
   * stray cross-org account in a Horizon-only export. Surfaced, never silently fixed.
   */
  scopeWarning: string | null;
}

/**
 * A period-aware comparison between two snapshots. Every ratio is labelled by
 * construction so the UI can never present a raw total ratio as if it were growth.
 */
export interface GrowthComparison {
  baselineId: number;
  currentId: number;
  /** True when both files cover the same number of days — the only honest raw comparison. */
  equalWindow: boolean;
  /** Horizon totals as reported, over windows that may differ in length. */
  baselinePrompts: number;
  currentPrompts: number;
  baselinePeriodDays: number;
  currentPeriodDays: number;
  baselineAccounts: number;
  currentAccounts: number;
  /** Same-account (cohort) view: accounts reporting in BOTH files. */
  commonAccounts: number;
  cohortBaselinePrompts: number;
  cohortCurrentPrompts: number;
  /** Accounts that appear only in the newer file, and what they contributed. */
  newAccounts: number;
  newAccountPrompts: number;
  droppedAccounts: number;
  droppedAccountPrompts: number;
}

export interface CopilotStats {
  /** Number of rows matching the active domain filter; 0 means "not covered by this file". */
  matchedRows: number;
  totalPrompts: number;
  activeUsers: number;
  totalUsers: number;
  avgPromptsPerUser: number;
  horizonPrompts: number;
  alaskaPrompts: number;
  otherPrompts: number;
  horizonUsers: number;
  alaskaUsers: number;
  otherUsers: number;
}

export interface Training {
  id: number;
  trainingDate: string;
  title: string;
  attendees: number;
  lengthHours: number;
  description: string;
}

// ---------------------------------------------------------------------------
// Copilot Snapshots
// ---------------------------------------------------------------------------
export const $loadSnapshots = createServerFn({ method: "GET" })
  .handler(async (): Promise<CopilotSnapshot[]> => {
    const db = await getDb();
    const { rows } = await db.query(
      // NOTE: the summary-row guard lives in the JOIN condition, not a WHERE clause,
      // so a snapshot with zero usable rows still appears in the list.
      // user_email LIKE '%@%' drops the blank-user total rows (the Jan file's 17,920
      // row, the May file's 121,896 row) and the literal 'SUM' row in the Aug file.
      // SUM(...) FILTER (...) yields NULL - not 0 - when nothing matches, which is how
      // "this export did not cover Alaska" is distinguished from "Alaska sent 0".
      `SELECT s.id, s.report_date, s.report_period_days, s.filename, s.uploaded_at,
        COUNT(u.id)::int as total_users,
        COUNT(u.id) FILTER (WHERE u.prompts_all > 0)::int as active_users,
        COALESCE(SUM(u.prompts_all), 0)::bigint as total_prompts,
        COALESCE(SUM(u.prompts_all) FILTER (WHERE u.domain = 'horizonair.com'), 0)::bigint as horizon_prompts,
        COUNT(u.id) FILTER (WHERE u.domain = 'horizonair.com')::int as horizon_accounts,
        COUNT(u.id) FILTER (WHERE u.domain = 'horizonair.com' AND u.prompts_all > 0)::int as horizon_active,
        SUM(u.prompts_all) FILTER (WHERE u.domain = 'alaskaair.com')::bigint as alaska_prompts,
        COUNT(u.id) FILTER (WHERE u.domain = 'alaskaair.com')::int as alaska_accounts,
        COUNT(u.id) FILTER (WHERE u.domain = 'alaskaair.com' AND u.prompts_all > 0)::int as alaska_active,
        COUNT(u.id) FILTER (WHERE u.domain <> 'horizonair.com')::int as non_horizon_accounts
       FROM copilot_snapshots s
       LEFT JOIN copilot_usage u
         ON u.snapshot_id = s.id
        AND u.user_email LIKE '%@%'
       GROUP BY s.id ORDER BY s.report_date DESC`
    );
    return rows.map((r: Record<string, unknown>) => {
      const totalUsers = Number(r.total_users);
      const horizonAccounts = Number(r.horizon_accounts);
      const nonHorizonAccounts = Number(r.non_horizon_accounts);
      const scope: SnapshotScope = nonHorizonAccounts === 0 ? "horizon_only" : "all_company";
      // A genuine all-company export is ~7% Horizon. If a file has non-Horizon rows
      // but is still mostly Horizon, it is probably a Horizon export with a stray
      // cross-org account. Flag it for a human rather than guessing.
      const horizonShare = totalUsers > 0 ? horizonAccounts / totalUsers : 0;
      const scopeWarning =
        scope === "all_company" && horizonShare > 0.5
          ? `${Math.round(horizonShare * 100)}% of rows are Horizon — this may be a Horizon-only export containing a few cross-org accounts. Verify before using the all-company figures.`
          : null;
      return {
        id: Number(r.id),
        reportDate: r.report_date ? new Date(String(r.report_date)).toISOString().split("T")[0] : "",
        reportPeriodDays: Number(r.report_period_days),
        filename: String(r.filename ?? ""),
        uploadedAt: r.uploaded_at ? new Date(String(r.uploaded_at)).toISOString() : "",
        totalUsers,
        activeUsers: Number(r.active_users),
        totalPrompts: Number(r.total_prompts),
        horizonPrompts: Number(r.horizon_prompts),
        horizonAccounts,
        horizonActiveAccounts: Number(r.horizon_active),
        alaskaPrompts: r.alaska_prompts === null || r.alaska_prompts === undefined ? null : Number(r.alaska_prompts),
        alaskaAccounts: Number(r.alaska_accounts),
        alaskaActiveAccounts: Number(r.alaska_active),
        nonHorizonAccounts,
        scope,
        scopeWarning,
      };
    });
  });

/**
 * Period-aware, cohort-aware comparison of two snapshots, Horizon-scoped on both
 * sides so the two numbers are always like-for-like. Returns raw inputs only —
 * the UI decides which ratio to lead with based on `equalWindow`.
 */
export const $getGrowthComparison = createServerFn({ method: "GET" })
  .validator((data: { currentId: number; baselineId: number }) => data)
  .handler(async ({ data }): Promise<GrowthComparison | null> => {
    const db = await getDb();
    const { rows: meta } = await db.query(
      "SELECT id, report_period_days FROM copilot_snapshots WHERE id = ANY($1::int[])",
      [[data.currentId, data.baselineId]]
    );
    if (meta.length < 2) return null;
    const periodOf = (id: number) =>
      Number(meta.find((m: Record<string, unknown>) => Number(m.id) === id)?.report_period_days ?? 0);

    const { rows: [agg] } = await db.query(
      `WITH cur AS (
         SELECT user_email, prompts_all FROM copilot_usage
          WHERE snapshot_id = $1 AND domain = 'horizonair.com' AND user_email LIKE '%@%'
       ), base AS (
         SELECT user_email, prompts_all FROM copilot_usage
          WHERE snapshot_id = $2 AND domain = 'horizonair.com' AND user_email LIKE '%@%'
       )
       SELECT
         (SELECT COALESCE(SUM(prompts_all),0) FROM cur)::bigint  AS cur_prompts,
         (SELECT COUNT(*) FROM cur)::int                         AS cur_accounts,
         (SELECT COALESCE(SUM(prompts_all),0) FROM base)::bigint AS base_prompts,
         (SELECT COUNT(*) FROM base)::int                        AS base_accounts,
         (SELECT COUNT(*) FROM cur c JOIN base b ON b.user_email = c.user_email)::int AS common_accounts,
         (SELECT COALESCE(SUM(c.prompts_all),0) FROM cur c JOIN base b ON b.user_email = c.user_email)::bigint AS cohort_cur,
         (SELECT COALESCE(SUM(b.prompts_all),0) FROM cur c JOIN base b ON b.user_email = c.user_email)::bigint AS cohort_base,
         (SELECT COUNT(*) FROM cur c LEFT JOIN base b ON b.user_email = c.user_email WHERE b.user_email IS NULL)::int AS new_accounts,
         (SELECT COALESCE(SUM(c.prompts_all),0) FROM cur c LEFT JOIN base b ON b.user_email = c.user_email WHERE b.user_email IS NULL)::bigint AS new_prompts,
         (SELECT COUNT(*) FROM base b LEFT JOIN cur c ON c.user_email = b.user_email WHERE c.user_email IS NULL)::int AS dropped_accounts,
         (SELECT COALESCE(SUM(b.prompts_all),0) FROM base b LEFT JOIN cur c ON c.user_email = b.user_email WHERE c.user_email IS NULL)::bigint AS dropped_prompts`,
      [data.currentId, data.baselineId]
    );

    const currentPeriodDays = periodOf(data.currentId);
    const baselinePeriodDays = periodOf(data.baselineId);
    return {
      baselineId: data.baselineId,
      currentId: data.currentId,
      equalWindow: currentPeriodDays === baselinePeriodDays && currentPeriodDays > 0,
      baselinePrompts: Number(agg.base_prompts),
      currentPrompts: Number(agg.cur_prompts),
      baselinePeriodDays,
      currentPeriodDays,
      baselineAccounts: Number(agg.base_accounts),
      currentAccounts: Number(agg.cur_accounts),
      commonAccounts: Number(agg.common_accounts),
      cohortBaselinePrompts: Number(agg.cohort_base),
      cohortCurrentPrompts: Number(agg.cohort_cur),
      newAccounts: Number(agg.new_accounts),
      newAccountPrompts: Number(agg.new_prompts),
      droppedAccounts: Number(agg.dropped_accounts),
      droppedAccountPrompts: Number(agg.dropped_prompts),
    };
  });

export const $getSnapshotStats = createServerFn({ method: "GET" })
  .validator((data: { snapshotId: number; domain?: string }) => data)
  .handler(async ({ data }): Promise<CopilotStats> => {
    const db = await getDb();
    let domainClause = "";
    const params: unknown[] = [data.snapshotId];
    if (data.domain) { domainClause = " AND domain = $2"; params.push(data.domain); }
    const { rows: [agg] } = await db.query(
      `SELECT
        COUNT(*)::int as matched_rows,
        COUNT(*)::int as total_users,
        COUNT(*) FILTER (WHERE prompts_all > 0)::int as active_users,
        COALESCE(SUM(prompts_all), 0)::bigint as total_prompts,
        COALESCE(SUM(CASE WHEN domain='horizonair.com' THEN prompts_all ELSE 0 END), 0)::bigint as horizon_prompts,
        COALESCE(SUM(CASE WHEN domain='alaskaair.com' THEN prompts_all ELSE 0 END), 0)::bigint as alaska_prompts,
        COALESCE(SUM(CASE WHEN domain NOT IN ('horizonair.com','alaskaair.com') THEN prompts_all ELSE 0 END), 0)::bigint as other_prompts,
        COUNT(*) FILTER (WHERE domain='horizonair.com' AND prompts_all > 0)::int as horizon_users,
        COUNT(*) FILTER (WHERE domain='alaskaair.com' AND prompts_all > 0)::int as alaska_users,
        COUNT(*) FILTER (WHERE domain NOT IN ('horizonair.com','alaskaair.com') AND prompts_all > 0)::int as other_users
       FROM copilot_usage WHERE snapshot_id = $1 AND user_email LIKE '%@%'${domainClause}`, params
    );
    const tp = Number(agg.total_prompts);
    const au = Number(agg.active_users);
    return {
      matchedRows: Number(agg.matched_rows),
      totalPrompts: tp, activeUsers: au, totalUsers: Number(agg.total_users),
      avgPromptsPerUser: au > 0 ? Math.round((tp / au) * 10) / 10 : 0,
      horizonPrompts: Number(agg.horizon_prompts), alaskaPrompts: Number(agg.alaska_prompts), otherPrompts: Number(agg.other_prompts),
      horizonUsers: Number(agg.horizon_users), alaskaUsers: Number(agg.alaska_users), otherUsers: Number(agg.other_users),
    };
  });

// ---------------------------------------------------------------------------
// CSV Upload — client parses, server stores
// ---------------------------------------------------------------------------
export const $uploadCopilotCsv = createServerFn({ method: "POST" })
  .validator((data: { filename: string; reportDate: string; periodDays: number; rows: { email: string; name: string; lastActivity: string; promptsAll: number; promptsWork: number; promptsWeb: number; activeDays: number }[] }) => data)
  .handler(async ({ data }) => {
    const db = await getDb();

    // --- Ingest hygiene, enforced server-side so it cannot be bypassed ------
    // 1. Normalize the email (trim + lowercase) and key everything off it.
    //    Display names are never used for identity.
    // 2. Drop summary rows: blank user, or a literal SUM/TOTAL label. These are
    //    file-level totals and would double-count the whole snapshot.
    // 3. De-duplicate WITHIN this file only (keep the highest prompt count).
    //    Accounts are never de-duplicated across snapshots.
    let summaryRowsDropped = 0;
    let duplicatesDropped = 0;
    const byEmail = new Map<string, (typeof data.rows)[number]>();
    for (const r of data.rows) {
      const email = (r.email ?? "").trim().toLowerCase();
      const label = (r.name ?? "").trim().toUpperCase();
      if (!email.includes("@") || email === "sum" || label === "SUM" || label.startsWith("TOTAL")) {
        summaryRowsDropped++;
        continue;
      }
      const existing = byEmail.get(email);
      if (existing) {
        duplicatesDropped++;
        if (r.promptsAll <= existing.promptsAll) continue;
      }
      byEmail.set(email, { ...r, email });
    }
    const cleanRows = [...byEmail.values()];

    const { rows: [snap] } = await db.query(
      "INSERT INTO copilot_snapshots (report_date, report_period_days, filename) VALUES ($1,$2,$3) RETURNING id",
      [data.reportDate, data.periodDays, data.filename]
    );
    const sid = Number(snap.id);
    const bs = 100;
    for (let i = 0; i < cleanRows.length; i += bs) {
      const batch = cleanRows.slice(i, i + bs);
      const vals: unknown[] = [];
      const phs: string[] = [];
      let idx = 1;
      for (const r of batch) {
        const domain = r.email.split("@")[1] ?? "";
        phs.push(`($${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++})`);
        vals.push(sid, r.email, r.name, r.lastActivity || null, r.promptsAll, r.promptsWork, r.promptsWeb, r.activeDays, domain);
      }
      await db.query(
        `INSERT INTO copilot_usage (snapshot_id,user_email,display_name,last_activity_date,prompts_all,prompts_chat_work,prompts_chat_web,active_days,domain) VALUES ${phs.join(",")}`, vals
      );
    }
    return { snapshotId: sid, inserted: cleanRows.length, summaryRowsDropped, duplicatesDropped };
  });

export const $deleteSnapshot = createServerFn({ method: "POST" })
  .validator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    const db = await getDb();
    await db.query("DELETE FROM copilot_snapshots WHERE id = $1", [data.id]);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Trainings CRUD
// ---------------------------------------------------------------------------
export const $loadTrainings = createServerFn({ method: "GET" })
  .handler(async (): Promise<Training[]> => {
    const db = await getDb();
    const { rows } = await db.query("SELECT * FROM ai_trainings ORDER BY training_date DESC, id DESC");
    return rows.map((r: Record<string, unknown>) => ({
      id: Number(r.id),
      trainingDate: r.training_date ? new Date(String(r.training_date)).toISOString().split("T")[0] : "",
      title: String(r.title), attendees: Number(r.attendees),
      lengthHours: Number(r.length_hours), description: String(r.description ?? ""),
    }));
  });

export const $addTraining = createServerFn({ method: "POST" })
  .validator((data: { trainingDate: string; title: string; attendees: number; lengthHours: number; description: string }) => data)
  .handler(async ({ data }): Promise<Training> => {
    const db = await getDb();
    const { rows: [r] } = await db.query(
      "INSERT INTO ai_trainings (training_date,title,attendees,length_hours,description) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [data.trainingDate, data.title, data.attendees, data.lengthHours, data.description]
    );
    return { id: Number(r.id), trainingDate: r.training_date ? new Date(String(r.training_date)).toISOString().split("T")[0] : "", title: String(r.title), attendees: Number(r.attendees), lengthHours: Number(r.length_hours), description: String(r.description ?? "") };
  });

export const $updateTraining = createServerFn({ method: "POST" })
  .validator((data: { id: number; trainingDate?: string; title?: string; attendees?: number; lengthHours?: number; description?: string }) => data)
  .handler(async ({ data }) => {
    const db = await getDb();
    const f: string[] = []; const v: unknown[] = []; let i = 1;
    if (data.trainingDate !== undefined) { f.push(`training_date=$${i++}`); v.push(data.trainingDate); }
    if (data.title !== undefined) { f.push(`title=$${i++}`); v.push(data.title); }
    if (data.attendees !== undefined) { f.push(`attendees=$${i++}`); v.push(data.attendees); }
    if (data.lengthHours !== undefined) { f.push(`length_hours=$${i++}`); v.push(data.lengthHours); }
    if (data.description !== undefined) { f.push(`description=$${i++}`); v.push(data.description); }
    if (!f.length) return { ok: true };
    v.push(data.id);
    await db.query(`UPDATE ai_trainings SET ${f.join(",")},updated_at=NOW() WHERE id=$${i}`, v);
    return { ok: true };
  });

export const $deleteTraining = createServerFn({ method: "POST" })
  .validator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    const db = await getDb();
    await db.query("DELETE FROM ai_trainings WHERE id=$1", [data.id]);
    return { ok: true };
  });
