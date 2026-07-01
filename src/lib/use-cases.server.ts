/**
 * use-cases.server.ts — TanStack Start server functions for Lakebase CRUD.
 * Called from client components; run on the server and hit Lakebase directly.
 */
import { createServerFn } from "@tanstack/react-start";
import { getDb } from "./db.server";
import type { UseCase } from "./types";

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
    technicalLead: String(r.technical_lead ?? ""),
    category: (r.category as UseCase["category"]) ?? "Analytics",
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
    solutionType: (r.solution_type as UseCase["solutionType"]) ?? "Custom App",
    dataSource: String(r.data_source ?? ""),
    complexity: (Number(r.complexity) || 3) as UseCase["complexity"],
    risk: (Number(r.risk) || 3) as UseCase["risk"],
    priority: (Number(r.priority) || 2) as UseCase["priority"],
    status: (r.status as UseCase["status"]) ?? "Not Started",
    stage: (r.stage as UseCase["stage"]) ?? "Submitted",
    currentSection: String(r.current_section ?? ""),
    createdDate: r.created_date
      ? new Date(r.created_date as string).toISOString()
      : new Date().toISOString(),
    lastModifiedDate: r.last_modified_date
      ? new Date(r.last_modified_date as string).toISOString()
      : new Date().toISOString(),
    timeSavedPerMonth: Number(r.time_saved_per_month) || 0,
    annualTimeSaved: Number(r.annual_time_saved) || 0,
    costSavings: Number(r.cost_savings) || 0,
    effortBefore: (Number(r.effort_before) || 3) as UseCase["effortBefore"],
    effortAfter: (Number(r.effort_after) || 2) as UseCase["effortAfter"],
    proactivePct: Number(r.proactive_work_pct) || 50,
    reactivePct: Number(r.reactive_work_pct) || 50,
    comments: [],
    attachments: [],
    links: r.links ? [String(r.links)] : [],
    activity: [],
  };
}

// ---------------------------------------------------------------------------
// Server functions
// ---------------------------------------------------------------------------

/** Load all use cases from Lakebase. */
export const $loadUseCases = createServerFn({ method: "GET" }).handler(
  async (): Promise<UseCase[]> => {
    console.log("[DB] $loadUseCases called");
    try {
      const db = await getDb();
      const { rows } = await db.query(
        "SELECT * FROM public.use_cases ORDER BY id"
      );
      console.log(`[DB] Loaded ${rows.length} use cases`);
      return rows.map(rowToUseCase);
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
    const db = await getDb();
    await db.query(
      `UPDATE public.use_cases
         SET stage = $1, last_modified_date = NOW()
       WHERE use_case_id = $2`,
      [data.to, data.id]
    );
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
      timeSavedPerMonth: "time_saved_per_month",
      annualTimeSaved: "annual_time_saved",
      costSavings: "cost_savings",
      effortBefore: "effort_before",
      effortAfter: "effort_after",
      proactivePct: "proactive_work_pct",
      reactivePct: "reactive_work_pct",
      comments: "comments",
      links: "links",
    };

    for (const [key, col] of Object.entries(map)) {
      if (key in patch) {
        fields.push(`${col} = ${i++}`);
        values.push((patch as Record<string, unknown>)[key]);
      }
    }
    if (!fields.length) return;

    fields.push(`last_modified_date = NOW()`);
    values.push(id);
    await db.query(
      `UPDATE public.use_cases SET ${fields.join(", ")} WHERE use_case_id = ${i}`,
      values
    );
  });

/** Add a comment to a use case. */
export const $addComment = createServerFn({ method: "POST" })
  .validator((data: { id: string; body: string; author: string }) => data)
  .handler(async ({ data }) => {
    const db = await getDb();
    await db.query(
      `INSERT INTO public.use_case_activity
         (use_case_id, field_changed, new_value, changed_by, note)
       VALUES ($1, $2, $3, $4, $5)`,
      [data.id, "comment", data.body, data.author, data.body]
    );
    await db.query(
      `UPDATE public.use_cases SET last_modified_date = NOW() WHERE use_case_id = $1`,
      [data.id]
    );
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
    }));
  });

export const $getActionNeededWithTodos = createServerFn({ method: "GET" }).handler(async () => {
  const db = await getDb();
  const { rows: ucRows } = await db.query(
    "SELECT * FROM public.use_cases WHERE status = 'Action Needed' ORDER BY created_date"
  );
  const useCases = ucRows.map(rowToUseCase);
  const ids = useCases.map((u: { id: string }) => u.id);
  let todos: Array<{id:string;useCaseId:string;text:string;assignee:string;done:boolean;createdDate:string}> = [];
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
    }));
  }
  return { useCases, todos };
});

export const $addTodo = createServerFn({ method: "POST" })
  .validator((data: { useCaseId: string; text: string; assignee: string }) => data)
  .handler(async ({ data }) => {
    const db = await getDb();
    const { rows } = await db.query(
      "INSERT INTO public.use_case_todos (use_case_id, text, assignee) VALUES ($1, $2, $3) RETURNING *",
      [data.useCaseId, data.text, data.assignee ?? ""]
    );
    const r = rows[0] as Record<string, unknown>;
    return { id: String(r.todo_id), useCaseId: String(r.use_case_id), text: String(r.text ?? ""),
      assignee: String(r.assignee ?? ""), done: Boolean(r.done), createdDate: String(r.created_date ?? "") };
  });

export const $updateTodo = createServerFn({ method: "POST" })
  .validator((data: { id: string; text?: string; assignee?: string; done?: boolean }) => data)
  .handler(async ({ data }) => {
    const db = await getDb();
    if (data.text !== undefined)
      await db.query("UPDATE public.use_case_todos SET text = $1 WHERE todo_id = $2", [data.text, data.id]);
    if (data.assignee !== undefined)
      await db.query("UPDATE public.use_case_todos SET assignee = $1 WHERE todo_id = $2", [data.assignee, data.id]);
    if (data.done !== undefined)
      await db.query("UPDATE public.use_case_todos SET done = $1 WHERE todo_id = $2", [data.done, data.id]);
    return { ok: true };
  });

export const $deleteTodo = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const db = await getDb();
    await db.query("DELETE FROM public.use_case_todos WHERE todo_id = $1", [data.id]);
    return { ok: true };
  });
