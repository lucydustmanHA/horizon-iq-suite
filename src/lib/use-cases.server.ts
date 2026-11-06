/**
 * use-cases.server.ts — TanStack Start server functions for Lakebase CRUD.
 * Called from client components; run on the server and hit Lakebase directly.
 */
import { createServerFn } from "@tanstack/react-start";
import { getDb, runMigrations } from "./db.server";
import type { UseCase } from "./types";

// ---------------------------------------------------------------------------
// Links column parser — handles JSON arrays AND recursively-nested Postgres
// array literal format (from data that was re-saved multiple times).
// ---------------------------------------------------------------------------
function parseLinksColumn(raw: unknown): string[] {
  if (!raw) return [];
  const str = String(raw).trim();
  if (!str || str === '{}' || str === '[]') return [];

  // 1. Clean JSON array (new format after fix)
  try {
    const parsed = JSON.parse(str);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {}

  // 2. Recursively unwrap Postgres array literal layers
  const unwrapped = unwrapPgArray(str, 0);
  if (unwrapped.length > 0) return unwrapped;

  // 3. Final fallback: treat as single entry
  return [str];
}

/** Recursively unwrap Postgres array literal format: {"elem","elem"} */
function unwrapPgArray(str: string, depth: number): string[] {
  if (depth > 8 || !str.startsWith('{') || !str.endsWith('}')) return [];

  const elements = extractPgElements(str.slice(1, -1));
  if (elements.length === 0) return [];

  const results: string[] = [];
  for (const el of elements) {
    // If element is a JSON object or array, keep as-is
    try {
      const obj = JSON.parse(el);
      if (Array.isArray(obj)) { results.push(...obj.map(String)); continue; }
      if (obj && typeof obj === 'object') { results.push(el); continue; }
    } catch {}

    // If element is another Postgres array literal, recurse
    if (el.startsWith('{') && el.endsWith('}') && !el.startsWith('{"type"')) {
      const nested = unwrapPgArray(el, depth + 1);
      if (nested.length > 0) { results.push(...nested); continue; }
    }

    // Otherwise it's a plain value (URL, etc.)
    results.push(el);
  }
  return results;
}

/** Parse individual quoted elements from inside a Postgres array literal.
 *  Handles: "elem" with \" for literal quotes and \\ for literal backslashes. */
function extractPgElements(inner: string): string[] {
  const elements: string[] = [];
  let i = 0;
  while (i < inner.length) {
    if (inner[i] === '"') {
      // Quoted element — un-escape as we go
      let j = i + 1;
      let el = '';
      while (j < inner.length) {
        if (inner[j] === '\\' && j + 1 < inner.length) {
          el += inner[j + 1]; j += 2;
        } else if (inner[j] === '"') { break; }
        else { el += inner[j]; j++; }
      }
      elements.push(el);
      i = j + 1;
      if (inner[i] === ',') i++;
    } else if (inner[i] === ',') {
      i++;
    } else {
      // Unquoted element (e.g. NULL)
      let j = i;
      while (j < inner.length && inner[j] !== ',') j++;
      const val = inner.slice(i, j).trim();
      if (val && val.toLowerCase() !== 'null') elements.push(val);
      i = j + 1;
    }
  }
  return elements;
}

// ---------------------------------------------------------------------------
// DB row → UseCase mapper
// ---------------------------------------------------------------------------
function rowToUseCase(r: Record<string, unknown>): UseCase {
  return {
    id: String(r.use_case_id ?? ""),
    title: String(r.title ?? ""),
    description: String(r.description ?? ""),
    workgroup: String(r.workgroup ?? ""),
    businessArea: String(r.business_area ?? ""),
    strategicGoal: String(r.strategic_goal ?? ""),
    grouping: String(r.grouping ?? ""),
    businessOwner: String(r.business_owner ?? ""),
    useCaseOwner: String(r.use_case_owner ?? ""),
    developer: String(r.developer ?? ""),
    solutionType: String(r.solution_type ?? ""),
    dataSource: String(r.data_source ?? ""),
    complexity: (Number(r.complexity) || 3) as UseCase["complexity"],
    priority: (r.priority != null ? Number(r.priority) : null) as UseCase["priority"],
    status: String(r.status ?? ""),
    stage: (String(r.stage || "Submitted")) as UseCase["stage"],
    currentSection: String(r.current_section ?? ""),
    createdDate: r.created_date
      ? new Date(r.created_date as string).toISOString()
      : new Date().toISOString(),
    lastModifiedDate: r.last_modified_date
      ? new Date(r.last_modified_date as string).toISOString()
      : new Date().toISOString(),
    timeSavedValue: Number(r.time_saved_per_month) || 0,
    timeSavedUnit: String(r.time_saved_unit || "month"),
    annualTimeSaved: Number(r.annual_time_saved) || 0,
    costSavings: Number(r.cost_savings) || 0,
    effortBefore: (Number(r.effort_before) || 0) as UseCase["effortBefore"],
    effortAfter: (Number(r.effort_after) || 0) as UseCase["effortAfter"],
    proactivePct: r.proactive_work_pct != null ? Number(r.proactive_work_pct) : null,
    reactivePct: r.reactive_work_pct != null ? Number(r.reactive_work_pct) : null,
    liveNonApplicable: r.live_non_applicable === true,
    closeToCompletion: r.close_to_completion === true,
    notes: String(r.notes ?? ""),
    statusUpdate: String(r.status_update ?? ""),
    statusUpdateDate: r.status_update_date ? new Date(String(r.status_update_date)).toISOString() : null,
    reviewCycle: String(r.review_cycle ?? ""),
    devLeadTimeDays: r.dev_lead_time_days != null ? Number(r.dev_lead_time_days) : null,
    resolutionTimeDays: r.resolution_time_days != null ? Number(r.resolution_time_days) : null,
    developmentStartedAt: r.development_started_at ? (r.development_started_at instanceof Date ? r.development_started_at.toISOString() : String(r.development_started_at)) : null,
    lastCompletedAt: r.last_completed_at ? (r.last_completed_at instanceof Date ? r.last_completed_at.toISOString() : String(r.last_completed_at)) : null,
    targetEndDate: r.target_end_date ? (r.target_end_date instanceof Date ? r.target_end_date.toISOString() : String(r.target_end_date)) : null,
    comments: [],
    attachments: [],
    links: parseLinksColumn(r.links),
    activity: [],
  } as UseCase;
}

// ---------------------------------------------------------------------------
// Server functions
// ---------------------------------------------------------------------------

/** Load all use cases from Lakebase (including comments from activity log). */
export const $loadUseCases = createServerFn({ method: "GET" }).handler(
  async (): Promise<UseCase[]> => {
    console.log("[DB] $loadUseCases called");
    await runMigrations();
    try {
      const db = await getDb();
      const { rows } = await db.query(
        "SELECT * FROM public.use_cases ORDER BY id"
      );
      // Load all comments from activity log
      const { rows: commentRows } = await db.query(
        `SELECT id, use_case_id, new_value AS body, changed_by AS author, changed_at AS date
         FROM public.use_case_activity
         WHERE field_changed = 'comment'
         ORDER BY changed_at ASC`
      );
      // Group comments by use_case_id
      const commentsByUc: Record<string, Array<{ id: string; author: string; date: string; body: string }>> = {};
      for (const cr of commentRows) {
        const ucId = String(cr.use_case_id);
        if (!commentsByUc[ucId]) commentsByUc[ucId] = [];
        // Normalize old authors: "user" or "You" → show as stored; current users show real name
        const rawAuthor = String(cr.author ?? "");
        const author = (rawAuthor === "user" || rawAuthor === "") ? "System" : rawAuthor;
        commentsByUc[ucId].push({
          id: String(cr.id),
          author,
          date: cr.date ? new Date(cr.date as string).toISOString() : new Date().toISOString(),
          body: String(cr.body ?? ""),
        });
      }
      console.log(`[DB] Loaded ${rows.length} use cases, ${commentRows.length} comments`);
      return rows.map((r: Record<string, unknown>) => {
        const uc = rowToUseCase(r);
        uc.comments = commentsByUc[uc.id] ?? [];
        return uc;
      });
    } catch (err) {
      console.error("[DB] $loadUseCases failed:", err);
      throw err;
    }
  }
);

/** Move a use case to a new stage and log the activity. */
export const $moveStage = createServerFn({ method: "POST" })
  .validator((data: { id: string; from: string; to: string }) => data)
  .handler(async ({ data }) => {
    await runMigrations();
    const db = await getDb();
    // Base stage update
    await db.query(
      `UPDATE public.use_cases
         SET stage = $1, last_modified_date = NOW()
       WHERE use_case_id = $2`,
      [data.to, data.id]
    );
    // Auto-set development_started_at when entering Development
    if (data.to === "Development") {
      await db.query(
        `UPDATE public.use_cases
           SET development_started_at = COALESCE(development_started_at, NOW())
         WHERE use_case_id = $1`,
        [data.id]
      );
    }
    // When leaving Live (regression) — stamp resolution_start_at and clear completed date
    if (data.from === "Live" && data.to !== "Live") {
      await db.query(
        `UPDATE public.use_cases SET last_completed_at = NULL, resolution_start_at = NOW() WHERE use_case_id = $1`,
        [data.id]
      );
    }
    // Auto-calculate dev_lead_time_days + resolution_time_days when reaching Live or Closed
    if (data.to === "Live" || data.to === "Closed") {
      await db.query(
        `UPDATE public.use_cases
           SET last_completed_at = COALESCE(last_completed_at, NOW()),
               dev_lead_time_days = COALESCE(dev_lead_time_days,
                 CASE WHEN development_started_at IS NOT NULL
                   THEN EXTRACT(DAY FROM NOW() - development_started_at)::int
                   ELSE NULL END),
               resolution_time_days = CASE WHEN resolution_start_at IS NOT NULL
                   THEN EXTRACT(DAY FROM NOW() - resolution_start_at)::int
                   ELSE resolution_time_days END,
               resolution_start_at = NULL
         WHERE use_case_id = $1`,
        [data.id]
      );
    }
    await db.query(
      `INSERT INTO public.use_case_activity
         (use_case_id, field_changed, old_value, new_value, changed_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [data.id, "stage", data.from, data.to, "user"]
    );
  });

/** Patch any fields on a use case. */
export const $updateUseCase = createServerFn({ method: "POST" })
  .validator((data: { id: string; patch: Partial<UseCase> }) => data)
  .handler(async ({ data }) => {
    const db = await getDb();
    const { patch, id } = data;
    const fields: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    const map: Record<string, string> = {
      title: "title",
      description: "description",
      workgroup: "workgroup",
      businessArea: "business_area",
      strategicGoal: "strategic_goal",
      grouping: "grouping",
      businessOwner: "business_owner",
      useCaseOwner: "use_case_owner",
      developer: "developer",
      technicalLead: "technical_lead",
      category: "category",
      tags: "tags",
      solutionType: "solution_type",
      dataSource: "data_source",
      complexity: "complexity",
      risk: "risk",
      priority: "priority",
      status: "status",
      stage: "stage",
      timeSavedValue: "time_saved_per_month",
      timeSavedUnit: "time_saved_unit",
      notes: "notes",
      devLeadTimeDays: "dev_lead_time_days",
      resolutionTimeDays: "resolution_time_days",
      developmentStartedAt: "development_started_at",
      lastCompletedAt: "last_completed_at",
    targetEndDate: "target_end_date",
      annualTimeSaved: "annual_time_saved",
      costSavings: "cost_savings",
      effortBefore: "effort_before",
      effortAfter: "effort_after",
      proactivePct: "proactive_work_pct",
      reactivePct: "reactive_work_pct",
      comments: "comments",
      links: "links",
      closeToCompletion: "close_to_completion",
    };

    for (const [key, col] of Object.entries(map)) {
      if (key in patch) {
        fields.push(`${col} = $${i++}`);
        let val = (patch as Record<string, unknown>)[key];
        // Serialize links array as JSON for TEXT column storage
        if (key === 'links' && Array.isArray(val)) {
          val = JSON.stringify(val);
        }
        values.push(val);
      }
    }
    if (!fields.length) return;

    fields.push(`last_modified_date = NOW()`);
    values.push(id);
    await db.query(
      `UPDATE public.use_cases SET ${fields.join(", ")} WHERE use_case_id = $${i}`,
      values
    );

    // Auto-populate when stage changes via dropdown (same logic as $moveStage)
    if (patch.stage === "Development") {
      await db.query(
        `UPDATE public.use_cases SET development_started_at = COALESCE(development_started_at, NOW()) WHERE use_case_id = $1`,
        [id]
      );
    }
    // When leaving Live via dropdown
    if (patch.stage && patch.stage !== "Live" && patch.stage !== "Closed") {
      // Check if it was previously Live
      const { rows: prev } = await db.query(`SELECT stage FROM public.use_cases WHERE use_case_id = $1`, [id]);
      if (prev[0]?.stage === "Live") {
        await db.query(`UPDATE public.use_cases SET resolution_start_at = COALESCE(resolution_start_at, NOW()) WHERE use_case_id = $1`, [id]);
      }
    }
    if (patch.stage === "Live" || patch.stage === "Closed") {
      await db.query(
        `UPDATE public.use_cases
           SET last_completed_at = COALESCE(last_completed_at, NOW()),
               dev_lead_time_days = COALESCE(dev_lead_time_days,
                 CASE WHEN development_started_at IS NOT NULL
                   THEN EXTRACT(DAY FROM NOW() - development_started_at)::int
                   ELSE NULL END),
               resolution_time_days = CASE WHEN resolution_start_at IS NOT NULL
                   THEN EXTRACT(DAY FROM NOW() - resolution_start_at)::int
                   ELSE resolution_time_days END,
               resolution_start_at = NULL
         WHERE use_case_id = $1`,
        [id]
      );
    }
  });

/** Load comments for a single use case (for real-time refresh on detail page). */
export const $loadComments = createServerFn({ method: "GET" })
  .validator((data: { useCaseId: string }) => data)
  .handler(async ({ data }) => {
    const db = await getDb();
    const { rows } = await db.query(
      `SELECT id, new_value AS body, changed_by AS author, changed_at AS date
       FROM public.use_case_activity
       WHERE use_case_id = $1 AND field_changed = 'comment'
       ORDER BY changed_at ASC`,
      [data.useCaseId]
    );
    return rows.map((r: Record<string, unknown>) => ({
      id: String(r.id),
      author: (String(r.author ?? "") === "user" || String(r.author ?? "") === "") ? "System" : String(r.author ?? ""),
      date: r.date ? new Date(r.date as string).toISOString() : new Date().toISOString(),
      body: String(r.body ?? ""),
    }));
  });

/** Add a comment to a use case. Returns the new comment with DB-generated ID. */
export const $addComment = createServerFn({ method: "POST" })
  .validator((data: { id: string; body: string; author: string }) => data)
  .handler(async ({ data }) => {
    const db = await getDb();
    const { rows } = await db.query(
      `INSERT INTO public.use_case_activity
         (use_case_id, field_changed, new_value, changed_by, note)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, changed_at`,
      [data.id, "comment", data.body, data.author, data.body]
    );
    await db.query(
      `UPDATE public.use_cases SET last_modified_date = NOW() WHERE use_case_id = $1`,
      [data.id]
    );
    const row = rows[0] as Record<string, unknown>;
    return {
      id: String(row.id),
      author: data.author,
      date: row.changed_at ? new Date(row.changed_at as string).toISOString() : new Date().toISOString(),
      body: data.body,
    };
  });


/** Create a new use case in Lakebase. */
export const $createUseCase = createServerFn({ method: "POST" })
  .validator((data: {
    title: string; workgroup: string; stage: string; priority?: number;
    owner: string; businessOwner?: string; businessArea?: string;
    strategicGoal?: string; grouping?: string; vendor?: string;
    solutionType?: string; dataSource?: string; description: string;
  }) => data)
  .handler(async ({ data }) => {
    console.log("[DB] $createUseCase called:", data.title);
    try {
      const db = await getDb();
      const { rows: lastRow } = await db.query(
        "SELECT use_case_id FROM public.use_cases ORDER BY id DESC LIMIT 1"
      );
      const lastId: string = lastRow[0]?.use_case_id ?? "UC-0000";
      const num = parseInt(lastId.replace("UC-", ""), 10) + 1;
      const newId = `UC-${String(num).padStart(4, "0")}`;

      await db.query(
        `INSERT INTO public.use_cases
           (use_case_id, title, description, workgroup, stage, use_case_owner,
            business_owner, business_area, strategic_goal, grouping, developer,
            solution_type, data_source, priority, created_date, last_modified_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW(),NOW())`,
        [
          newId, data.title, data.description ?? "", data.workgroup, data.stage,
          data.owner ?? "", data.businessOwner ?? "", data.businessArea ?? "",
          data.strategicGoal ?? "", data.grouping ?? "", data.vendor ?? "",
          data.solutionType ?? "", data.dataSource ?? "",
          data.priority ?? null,
        ]
      );
      const { rows } = await db.query(
        "SELECT * FROM public.use_cases WHERE use_case_id = $1", [newId]
      );
      console.log(`[DB] $createUseCase created ${newId}`);
      return rowToUseCase(rows[0]);
    } catch (err) {
      console.error("[DB] $createUseCase failed:", err);
      throw err;
    }
  });

// ─── Todo server functions ────────────────────────────────────────────────

export const $getTodos = createServerFn({ method: "GET" })
  .validator((data: { useCaseId: string }) => data)
  .handler(async ({ data }) => {
    const db = await getDb();
    const { rows } = await db.query(
      "SELECT * FROM public.use_case_todos WHERE use_case_id = $1 ORDER BY created_date ASC",
      [data.useCaseId]
    );
    return rows.map((r: Record<string, unknown>) => ({
      id: String(r.todo_id), useCaseId: String(r.use_case_id),
      text: String(r.text ?? ""), assignee: String(r.assignee ?? ""),
      done: Boolean(r.done), createdDate: String(r.created_date ?? ""),
      dueDate: r.due_date ? new Date(String(r.due_date)).toISOString().split("T")[0] : null,
    }));
  });

export const $getActionNeededWithTodos = createServerFn({ method: "GET" }).handler(async () => {
  const db = await getDb();
  const { rows: ucRows } = await db.query(
    "SELECT * FROM public.use_cases WHERE TRIM(LOWER(status)) = 'action needed' OR TRIM(LOWER(status)) = 'blocked' ORDER BY created_date"
  );
  const useCases = ucRows.map(rowToUseCase);
  const ids = useCases.map((u: { id: string }) => u.id);
  let todos: Array<{id:string;useCaseId:string;text:string;assignee:string;done:boolean;createdDate:string;dueDate:string|null}> = [];
  if (ids.length > 0) {
    const placeholders = ids.map((_: string, i: number) => `$${i + 1}`).join(",");
    const { rows: tRows } = await db.query(
      `SELECT * FROM public.use_case_todos WHERE use_case_id IN (${placeholders}) ORDER BY created_date ASC`,
      ids
    );
    todos = tRows.map((r: Record<string, unknown>) => ({
      id: String(r.todo_id), useCaseId: String(r.use_case_id),
      text: String(r.text ?? ""), assignee: String(r.assignee ?? ""),
      done: Boolean(r.done), createdDate: String(r.created_date ?? ""),
      dueDate: r.due_date ? new Date(String(r.due_date)).toISOString().split("T")[0] : null,
    }));
  }
  return { useCases, todos };
});

export const $addTodo = createServerFn({ method: "POST" })
  .validator((data: { useCaseId: string; text: string; assignee: string; dueDate?: string; createdBy?: string }) => data)
  .handler(async ({ data }) => {
    const db = await getDb();
    // auto-flag use case as Action Needed if not already blocked
    await db.query(
      "UPDATE public.use_cases SET status = 'Action Needed' WHERE use_case_id = $1 AND (status IS NULL OR TRIM(status) = '' OR (status != 'Blocked' AND status != 'Action Needed'))",
      [data.useCaseId]
    );
    const { rows } = await db.query(
      "INSERT INTO public.use_case_todos (use_case_id, text, assignee, created_by, due_date) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [data.useCaseId, data.text, data.assignee ?? "", data.createdBy ?? "", data.dueDate || null]
    );
    const r = rows[0] as Record<string, unknown>;
    return { id: String(r.todo_id), useCaseId: String(r.use_case_id), text: String(r.text ?? ""),
      assignee: String(r.assignee ?? ""), done: Boolean(r.done), createdDate: String(r.created_date ?? ""),
      dueDate: r.due_date ? new Date(String(r.due_date)).toISOString().split("T")[0] : null };
  });

export const $updateTodo = createServerFn({ method: "POST" })
  .validator((data: { id: string; text?: string; assignee?: string; done?: boolean; dueDate?: string | null }) => data)
  .handler(async ({ data }) => {
    const db = await getDb();
    if (data.text !== undefined)
      await db.query("UPDATE public.use_case_todos SET text = $1 WHERE todo_id = $2", [data.text, data.id]);
    if (data.assignee !== undefined)
      await db.query("UPDATE public.use_case_todos SET assignee = $1 WHERE todo_id = $2", [data.assignee, data.id]);
    if (data.dueDate !== undefined)
      await db.query("UPDATE public.use_case_todos SET due_date = $1 WHERE todo_id = $2", [data.dueDate || null, data.id]);
    if (data.done !== undefined) {
      await db.query("UPDATE public.use_case_todos SET done = $1 WHERE todo_id = $2", [data.done, data.id]);
      if (data.done) {
        // Auto-clear "Action Needed" when every todo for this use case is now done
        await db.query(`
          UPDATE public.use_cases SET status = ''
          WHERE use_case_id = (SELECT use_case_id FROM public.use_case_todos WHERE todo_id = $1)
            AND TRIM(status) = 'Action Needed'
            AND NOT EXISTS (
              SELECT 1 FROM public.use_case_todos t2
              WHERE t2.use_case_id = (SELECT use_case_id FROM public.use_case_todos WHERE todo_id = $1)
                AND t2.done = false
            )`, [data.id]);
      }
    }
    return { ok: true };
  });

export const $deleteTodo = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const db = await getDb();
    const ucRes = await db.query("SELECT use_case_id FROM public.use_case_todos WHERE todo_id = $1", [data.id]);
    const useCaseId = ucRes.rows[0]?.use_case_id;
    await db.query("DELETE FROM public.use_case_todos WHERE todo_id = $1", [data.id]);
    if (useCaseId) {
      // Auto-clear "Action Needed" if no incomplete todos remain
      await db.query(`
        UPDATE public.use_cases SET status = ''
        WHERE use_case_id = $1
          AND TRIM(status) = 'Action Needed'
          AND NOT EXISTS (
            SELECT 1 FROM public.use_case_todos WHERE use_case_id = $1 AND done = false
          )`, [useCaseId]);
    }
    return { ok: true };
  });

export const $getAllTodosWithDueDates = createServerFn({ method: "GET" }).handler(async () => {
  const db = await getDb();
  const { rows } = await db.query(
    `SELECT t.todo_id, t.use_case_id, t.text, t.assignee, t.done, t.due_date,
            u.title AS uc_title
     FROM public.use_case_todos t
     JOIN public.use_cases u ON u.use_case_id = t.use_case_id
     WHERE t.due_date IS NOT NULL
     ORDER BY t.due_date ASC`
  );
  return rows.map((r: Record<string, unknown>) => ({
    id: String(r.todo_id),
    useCaseId: String(r.use_case_id),
    text: String(r.text ?? ""),
    assignee: String(r.assignee ?? ""),
    done: Boolean(r.done),
    dueDate: new Date(String(r.due_date)).toISOString().split("T")[0],
    ucTitle: String(r.uc_title ?? ""),
  }));
});

/** Post a new status update — archives the old one into notes first */
export const $postStatusUpdate = createServerFn({ method: "POST" })
  .validator((data: { id: string; update: string }) => data)
  .handler(async ({ data }) => {
    const db = await getDb();
    // Fetch current status update to archive
    const { rows } = await db.query(
      "SELECT status_update, status_update_date, notes FROM public.use_cases WHERE use_case_id = $1",
      [data.id]
    );
    if (rows.length === 0) return { ok: false };
    const old = rows[0] as Record<string, unknown>;
    const oldUpdate = String(old.status_update ?? "").trim();
    const oldDate = old.status_update_date ? new Date(String(old.status_update_date)) : null;
    let notes = String(old.notes ?? "");

    // Archive old update into notes if it exists
    if (oldUpdate) {
      const dateStr = oldDate ? oldDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Unknown date";
      const archived = `**Status Update (${dateStr}):** ${oldUpdate}`;
      notes = notes ? `${archived}\n\n---\n\n${notes}` : archived;
    }

    // Save new update + archived notes
    await db.query(
      "UPDATE public.use_cases SET status_update = $1, status_update_date = NOW(), notes = $2 WHERE use_case_id = $3",
      [data.update.trim(), notes, data.id]
    );

    // Return updated values
    const { rows: updated } = await db.query(
      "SELECT status_update, status_update_date, notes FROM public.use_cases WHERE use_case_id = $1",
      [data.id]
    );
    const r = updated[0] as Record<string, unknown>;
    return {
      ok: true,
      statusUpdate: String(r.status_update ?? ""),
      statusUpdateDate: r.status_update_date ? new Date(String(r.status_update_date)).toISOString() : null,
      notes: String(r.notes ?? ""),
    };
  });

/** Save notes for a use case */
export const $saveNotes = createServerFn({ method: "POST" })
  .validator((data: { id: string; notes: string }) => data)
  .handler(async ({ data }) => {
    const db = await getDb();
    await db.query("UPDATE public.use_cases SET notes=$1 WHERE use_case_id=$2", [data.notes, data.id]);
    return { ok: true };
  });

// ─── Use Case Links (bidirectional "related to") ──────────────────────────

export interface UseCaseLink {
  linkId: number;
  id: string;
  title: string;
  workgroup: string;
  status: string;
}

/** Get all linked cases for a given use case (bidirectional). */
export const $getLinkedCases = createServerFn({ method: "GET" })
  .validator((data: { useCaseId: string }) => data)
  .handler(async ({ data }): Promise<UseCaseLink[]> => {
    const db = await getDb();
    const { rows } = await db.query(
      `SELECT l.id as link_id, u.use_case_id, u.title, u.workgroup, u.status
       FROM use_case_links l
       JOIN use_cases u ON u.use_case_id = CASE WHEN l.source_id = (SELECT id FROM use_cases WHERE use_case_id = $1) THEN (SELECT use_case_id FROM use_cases WHERE id = l.target_id) ELSE (SELECT use_case_id FROM use_cases WHERE id = l.source_id) END
       WHERE l.source_id = (SELECT id FROM use_cases WHERE use_case_id = $1)
          OR l.target_id = (SELECT id FROM use_cases WHERE use_case_id = $1)
       ORDER BY u.title`,
      [data.useCaseId]
    );
    return rows.map((r: Record<string, unknown>) => ({
      linkId: Number(r.link_id),
      id: String(r.use_case_id),
      title: String(r.title ?? ""),
      workgroup: String(r.workgroup ?? ""),
      status: String(r.status ?? ""),
    }));
  });

/** Add a bidirectional link between two use cases. */
export const $addLink = createServerFn({ method: "POST" })
  .validator((data: { sourceId: string; targetId: string }) => data)
  .handler(async ({ data }) => {
    const db = await getDb();
    const { rows: srcRows } = await db.query("SELECT id FROM use_cases WHERE use_case_id = $1", [data.sourceId]);
    const { rows: tgtRows } = await db.query("SELECT id FROM use_cases WHERE use_case_id = $1", [data.targetId]);
    if (!srcRows[0] || !tgtRows[0]) throw new Error("Use case not found");
    const srcPk = Number(srcRows[0].id);
    const tgtPk = Number(tgtRows[0].id);
    // Always store smaller id as source to avoid duplicate links in both directions
    const [a, b] = srcPk < tgtPk ? [srcPk, tgtPk] : [tgtPk, srcPk];
    await db.query(
      "INSERT INTO use_case_links (source_id, target_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [a, b]
    );
    return { ok: true };
  });

/** Remove a link by its ID. */
export const $removeLink = createServerFn({ method: "POST" })
  .validator((data: { linkId: number }) => data)
  .handler(async ({ data }) => {
    const db = await getDb();
    await db.query("DELETE FROM use_case_links WHERE id = $1", [data.linkId]);
    return { ok: true };
  });

/** Get link counts for all use cases (for Kanban badges). */
export const $getLinkCounts = createServerFn({ method: "GET" })
  .handler(async (): Promise<Record<string, number>> => {
    const db = await getDb();
    const { rows } = await db.query(
      `SELECT u.use_case_id, COUNT(*) as cnt FROM (
        SELECT source_id as pk FROM use_case_links UNION ALL SELECT target_id FROM use_case_links
       ) sub
       JOIN use_cases u ON u.id = sub.pk
       GROUP BY u.use_case_id`
    );
    const map: Record<string, number> = {};
    for (const r of rows) map[String(r.use_case_id)] = Number(r.cnt);
    return map;
  });

/** Permanently delete a use case and all its todos */
export const $deleteUseCase = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const db = await getDb();
    await db.query("DELETE FROM public.use_case_todos WHERE use_case_id=$1", [data.id]);
    await db.query("DELETE FROM public.use_cases WHERE use_case_id=$1", [data.id]);
    return { ok: true };
  });

/** Diagnostic: log client-side errors in server logs */
export const $reportError = createServerFn({ method: "POST" })
  .validator((data: { message: string; stack: string }) => data)
  .handler(async ({ data }) => {
    console.error("[CLIENT ERROR]", data.message);
    console.error("[CLIENT STACK]", data.stack);
    return { ok: true };
  });


export const $deleteActivity = createServerFn({ method: "POST" })
  .validator((data: { id: string; activityId: string }) => data)
  .handler(async ({ data }) => {
    const db = await getDb();
    await db.query("DELETE FROM public.use_case_activity WHERE id = " + "$1 AND use_case_id = " + "$2", [data.activityId, data.id]);
  });
