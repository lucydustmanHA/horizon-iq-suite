/**
 * strategy.server.ts — Lakebase access for the Strategy side.
 *
 * All tables are prefixed `strategy_` and created on first use (CREATE TABLE IF NOT EXISTS).
 * Nothing here reads or writes the AI & Automation tables.
 * A copy of the DDL lives in jobs/strategy-schema.sql for manual setup if the app's
 * service principal ever lacks CREATE on schema public.
 */
import { createServerFn } from "@tanstack/react-start";
import type pg from "pg";
import { getDb } from "./db.server";
import type {
  StrategyGoal, StrategyActivity, StrategyInitiative, StrategyDeepDive, StrategyActionItem,
  StrategyReview, StrategyYearData, GoalStatus, Direction, Rag,
} from "./strategy-types";
import { MONTH_OVERRIDE_YEARS } from "./strategy-types";

const DDL = [
  `CREATE TABLE IF NOT EXISTS public.strategy_goals (
    id TEXT PRIMARY KEY,
    year INT NOT NULL,
    department TEXT NOT NULL DEFAULT '',
    priority TEXT NOT NULL DEFAULT '',
    objective TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    success_criteria TEXT NOT NULL DEFAULT '',
    monthly_metric TEXT NOT NULL DEFAULT '',
    owner TEXT NOT NULL DEFAULT '',
    secondary_owner TEXT NOT NULL DEFAULT '',
    target_value TEXT NOT NULL DEFAULT '',
    baseline_value TEXT NOT NULL DEFAULT '',
    unit_of_measure TEXT NOT NULL DEFAULT '',
    direction TEXT NOT NULL DEFAULT 'increase',
    status_override TEXT,
    notes TEXT NOT NULL DEFAULT '',
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS strategy_goals_year_idx ON public.strategy_goals (year)`,
  `CREATE TABLE IF NOT EXISTS public.strategy_progress (
    goal_id TEXT NOT NULL REFERENCES public.strategy_goals(id) ON DELETE CASCADE,
    month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
    actual_value TEXT NOT NULL DEFAULT '',
    updated_by TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (goal_id, month)
  )`,
  `CREATE TABLE IF NOT EXISTS public.strategy_activities (
    id SERIAL PRIMARY KEY,
    goal_id TEXT NOT NULL REFERENCES public.strategy_goals(id) ON DELETE CASCADE,
    activity TEXT NOT NULL DEFAULT '',
    metric TEXT NOT NULL DEFAULT '',
    target TEXT NOT NULL DEFAULT '',
    due_date DATE,
    status TEXT NOT NULL DEFAULT 'Not started',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS public.strategy_initiatives (
    id SERIAL PRIMARY KEY,
    year INT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    objective TEXT NOT NULL DEFAULT '',
    department TEXT NOT NULL DEFAULT '',
    owner TEXT NOT NULL DEFAULT '',
    target_date DATE,
    status TEXT NOT NULL DEFAULT 'Planned',
    progress_notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS public.strategy_deep_dives (
    id SERIAL PRIMARY KEY,
    year INT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    held_on DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS public.strategy_action_items (
    id SERIAL PRIMARY KEY,
    deep_dive_id INT NOT NULL REFERENCES public.strategy_deep_dives(id) ON DELETE CASCADE,
    area TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL DEFAULT '',
    owner TEXT NOT NULL DEFAULT '',
    timing TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Not started',
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS public.strategy_reviews (
    goal_id TEXT NOT NULL REFERENCES public.strategy_goals(id) ON DELETE CASCADE,
    review_month TEXT NOT NULL,
    rag TEXT,
    meeting_notes TEXT NOT NULL DEFAULT '',
    updated_by TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (goal_id, review_month)
  )`,
];

let _schemaReady: Promise<void> | null = null;
/** True when strategy_progress has the month_rag + comment columns (added at runtime if the SP is allowed). */
let _progressExtras = false;

async function countProgressExtras(pool: pg.Pool): Promise<number> {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'strategy_progress' AND column_name IN ('month_rag','comment')`);
  return Number(rows[0]?.n);
}

async function ensureProgressExtras(pool: pg.Pool) {
  // Tables are owned by the Lakebase project owner, so the app SP usually cannot ALTER; only try when missing.
  if ((await countProgressExtras(pool)) !== 2) {
    try {
      await pool.query(`ALTER TABLE public.strategy_progress ADD COLUMN IF NOT EXISTS month_rag TEXT`);
      await pool.query(`ALTER TABLE public.strategy_progress ADD COLUMN IF NOT EXISTS comment TEXT NOT NULL DEFAULT ''`);
    } catch (e) {
      console.warn("[strategy] could not add month_rag/comment columns (run jobs/strategy-schema.sql as owner):", (e as Error)?.message ?? e);
    }
  }
  _progressExtras = (await countProgressExtras(pool)) === 2;
  console.log(`[strategy] month colour/comment columns ${_progressExtras ? "available" : "MISSING"}`);
}

async function db(): Promise<pg.Pool> {
  const pool = await getDb();
  if (!_schemaReady) {
    _schemaReady = (async () => {
      // The app's service principal can read/write but not CREATE in public, so only run the
      // DDL when a table is actually missing (CREATE ... IF NOT EXISTS still needs CREATE rights).
      const names = ["strategy_goals", "strategy_progress", "strategy_activities", "strategy_initiatives",
        "strategy_deep_dives", "strategy_action_items", "strategy_reviews"];
      const { rows } = await pool.query(
        `SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY($1)`, [names]);
      if (Number(rows[0]?.n) === names.length) {
        console.log("[strategy] schema present");
      } else {
        for (const stmt of DDL) await pool.query(stmt);
        console.log("[strategy] schema created");
      }
      await ensureProgressExtras(pool);
    })().catch((e) => {
      _schemaReady = null;
      console.error("[strategy] schema setup failed:", e);
      throw new Error("Strategy tables are not set up yet. Ask an admin to run jobs/strategy-schema.sql. (" + String((e as Error)?.message ?? e) + ")");
    });
  }
  await _schemaReady;
  return pool;
}

/** Signed-in user's email from the Databricks Apps forwarded headers ("" if unavailable). */
async function currentEmail(): Promise<string> {
  const names = ["x-forwarded-email", "x-forwarded-preferred-username", "x-forwarded-user"];
  // 1) TanStack Start's request API
  try {
    const start: any = await import("@tanstack/react-start/server");
    if (typeof start.getRequestHeader === "function") {
      for (const n of names) { const v = start.getRequestHeader(n); if (v) return String(v); }
    }
  } catch { /* fall through */ }
  // 2) Same approach as user.server.ts ($getMe)
  try {
    const h3: any = await import("h3");
    const event: any = h3.useEvent?.();
    for (const n of names) {
      const v = event?.headers?.get?.(n) || event?.node?.req?.headers?.[n];
      if (v) return Array.isArray(v) ? String(v[0]) : String(v);
    }
  } catch { /* ignore */ }
  return "";
}

const s = (v: unknown) => (v == null ? "" : String(v));
const dateOrNull = (v: string | null | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

// ── Row mappers ────────────────────────────────────────────────────────────────
const GOAL_COLS = `id, year, department, priority, objective, description, success_criteria, monthly_metric,
  owner, secondary_owner, target_value, baseline_value, unit_of_measure, direction, status_override, notes,
  to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at`;

type MonthExtras = { rag: ("green" | "red" | null)[]; comments: string[] };
const emptyExtras = (): MonthExtras => ({ rag: Array(12).fill(null), comments: Array(12).fill("") });

function mapGoal(r: any, progress: string[], extras: MonthExtras = emptyExtras()): StrategyGoal {
  return {
    id: s(r.id), year: Number(r.year), department: s(r.department), priority: s(r.priority),
    objective: s(r.objective), description: s(r.description), successCriteria: s(r.success_criteria),
    monthlyMetric: s(r.monthly_metric), owner: s(r.owner), secondaryOwner: s(r.secondary_owner),
    targetValue: s(r.target_value), baselineValue: s(r.baseline_value), unitOfMeasure: s(r.unit_of_measure),
    direction: (r.direction === "decrease" ? "decrease" : "increase") as Direction,
    statusOverride: (r.status_override || null) as GoalStatus | null,
    notes: s(r.notes), progress, monthRag: extras.rag, monthComments: extras.comments, updatedAt: r.updated_at ?? null,
  };
}
const mapActivity = (r: any): StrategyActivity => ({
  id: Number(r.id), goalId: s(r.goal_id), activity: s(r.activity), metric: s(r.metric), target: s(r.target),
  dueDate: r.due_date ?? null, status: s(r.status) || "Not started",
});
const INIT_COLS = `id, year, name, objective, department, owner, to_char(target_date,'YYYY-MM-DD') AS target_date, status, progress_notes`;
const mapInitiative = (r: any): StrategyInitiative => ({
  id: Number(r.id), year: Number(r.year), name: s(r.name), objective: s(r.objective), department: s(r.department),
  owner: s(r.owner), targetDate: r.target_date ?? null, status: s(r.status) || "Planned", progressNotes: s(r.progress_notes),
});
const mapAction = (r: any): StrategyActionItem => ({
  id: Number(r.id), deepDiveId: Number(r.deep_dive_id), area: s(r.area), action: s(r.action), owner: s(r.owner),
  timing: s(r.timing), status: s(r.status) || "Not started", notes: s(r.notes),
});

// ── Year data (goals + progress + activities + initiatives) ────────────────────────────
export const $loadStrategyYear = createServerFn({ method: "GET" })
  .validator((data: { year: number }) => data)
  .handler(async ({ data }): Promise<StrategyYearData> => {
    const pool = await db();
    const year = Number(data.year);
    const [g, p, a, i] = await Promise.all([
      pool.query(`SELECT ${GOAL_COLS} FROM public.strategy_goals WHERE year = $1 ORDER BY department, priority, objective`, [year]),
      pool.query(`SELECT p.goal_id, p.month, p.actual_value${_progressExtras ? ", p.month_rag, p.comment" : ""} FROM public.strategy_progress p JOIN public.strategy_goals g ON g.id = p.goal_id WHERE g.year = $1`, [year]),
      pool.query(`SELECT a.id, a.goal_id, a.activity, a.metric, a.target, to_char(a.due_date,'YYYY-MM-DD') AS due_date, a.status FROM public.strategy_activities a JOIN public.strategy_goals g ON g.id = a.goal_id WHERE g.year = $1 ORDER BY a.due_date NULLS LAST, a.id`, [year]),
      pool.query(`SELECT ${INIT_COLS} FROM public.strategy_initiatives WHERE year = $1 ORDER BY target_date NULLS LAST, id`, [year]),
    ]);
    const prog = new Map<string, string[]>();
    const extras = new Map<string, MonthExtras>();
    for (const r of p.rows) {
      const i = Number(r.month) - 1;
      const arr = prog.get(r.goal_id) ?? Array(12).fill("");
      arr[i] = s(r.actual_value);
      prog.set(r.goal_id, arr);
      const ex = extras.get(r.goal_id) ?? emptyExtras();
      ex.rag[i] = r.month_rag === "green" || r.month_rag === "red" ? r.month_rag : null;
      ex.comments[i] = s(r.comment);
      extras.set(r.goal_id, ex);
    }
    return {
      goals: g.rows.map((r) => mapGoal(r, prog.get(r.id) ?? Array(12).fill(""), extras.get(r.id))),
      activities: a.rows.map(mapActivity),
      initiatives: i.rows.map(mapInitiative),
    };
  });

export const $listStrategyYears = createServerFn({ method: "GET" }).handler(async () => {
  const pool = await db();
  const { rows } = await pool.query(`
    SELECT year FROM public.strategy_goals UNION SELECT year FROM public.strategy_initiatives
    UNION SELECT year FROM public.strategy_deep_dives ORDER BY 1`);
  return rows.map((r) => Number(r.year));
});

// ── Goals ──────────────────────────────────────────────────────────────────────
function code(text: string, len: number) {
  const words = text.replace(/[^A-Za-z0-9 &]/g, "").split(/[\s&]+/).filter(Boolean);
  const c = words.length > 1 ? words.map((w) => w[0]).join("") : (words[0] ?? "G");
  return c.slice(0, len).toUpperCase() || "G";
}

export type GoalInput = Omit<StrategyGoal, "progress" | "monthRag" | "monthComments" | "updatedAt" | "id"> & { id?: string };

export const $saveGoal = createServerFn({ method: "POST" })
  .validator((data: GoalInput) => data)
  .handler(async ({ data }) => {
    const pool = await db();
    const email = await currentEmail();
    let id = data.id?.trim();
    if (!id) {
      const base = `${code(data.department, 3)}${String(data.year).slice(-2)}-${code(data.priority, 3)}`;
      const { rows } = await pool.query(`SELECT id FROM public.strategy_goals WHERE id = $1 OR id LIKE $2`, [base, base + "-%"]);
      const taken = new Set(rows.map((r) => r.id));
      id = base;
      for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
    }
    const vals = [
      id, Number(data.year), data.department, data.priority, data.objective, data.description, data.successCriteria,
      data.monthlyMetric, data.owner, data.secondaryOwner, data.targetValue, data.baselineValue, data.unitOfMeasure,
      data.direction === "decrease" ? "decrease" : "increase", data.statusOverride || null, data.notes ?? "", email || null,
    ];
    await pool.query(
      `INSERT INTO public.strategy_goals (id, year, department, priority, objective, description, success_criteria,
         monthly_metric, owner, secondary_owner, target_value, baseline_value, unit_of_measure, direction, status_override, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       ON CONFLICT (id) DO UPDATE SET year=EXCLUDED.year, department=EXCLUDED.department, priority=EXCLUDED.priority,
         objective=EXCLUDED.objective, description=EXCLUDED.description, success_criteria=EXCLUDED.success_criteria,
         monthly_metric=EXCLUDED.monthly_metric, owner=EXCLUDED.owner, secondary_owner=EXCLUDED.secondary_owner,
         target_value=EXCLUDED.target_value, baseline_value=EXCLUDED.baseline_value, unit_of_measure=EXCLUDED.unit_of_measure,
         direction=EXCLUDED.direction, status_override=EXCLUDED.status_override, notes=EXCLUDED.notes, updated_at=NOW()`,
      vals,
    );
    return { id };
  });

export const $deleteGoal = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const pool = await db();
    await pool.query(`DELETE FROM public.strategy_goals WHERE id = $1`, [data.id]);
    return { ok: true };
  });

export const $saveProgress = createServerFn({ method: "POST" })
  .validator((data: { goalId: string; month: number; actualValue: string }) => data)
  .handler(async ({ data }) => {
    const pool = await db();
    const email = await currentEmail();
    const m = Number(data.month);
    if (!(m >= 1 && m <= 12)) throw new Error("month must be 1-12");
    const v = String(data.actualValue ?? "").trim();
    if (!v) {
      if (_progressExtras) {
        // Keep the month's manual colour/comment; only drop the row when nothing else is stored.
        await pool.query(`UPDATE public.strategy_progress SET actual_value = '', updated_by = $3, updated_at = NOW() WHERE goal_id = $1 AND month = $2`, [data.goalId, m, email || null]);
        await pool.query(`DELETE FROM public.strategy_progress WHERE goal_id = $1 AND month = $2 AND month_rag IS NULL AND comment = ''`, [data.goalId, m]);
      } else {
        await pool.query(`DELETE FROM public.strategy_progress WHERE goal_id = $1 AND month = $2`, [data.goalId, m]);
      }
    } else {
      await pool.query(
        `INSERT INTO public.strategy_progress (goal_id, month, actual_value, updated_by) VALUES ($1,$2,$3,$4)
         ON CONFLICT (goal_id, month) DO UPDATE SET actual_value = EXCLUDED.actual_value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
        [data.goalId, m, v, email || null],
      );
    }
    await pool.query(`UPDATE public.strategy_goals SET updated_at = NOW() WHERE id = $1`, [data.goalId]);
    return { ok: true };
  });

/** Save one month's manual red/green (null = auto) and/or comment. Keeps the row even if the number is blank. */
export const $saveMonthMeta = createServerFn({ method: "POST" })
  .validator((data: { goalId: string; month: number; rag?: "green" | "red" | null; comment?: string }) => data)
  .handler(async ({ data }) => {
    const pool = await db();
    if (!_progressExtras) throw new Error("Month colours/comments need two new columns. Ask an admin to run the ALTER statements in jobs/strategy-schema.sql.");
    const email = await currentEmail();
    const m = Number(data.month);
    if (!(m >= 1 && m <= 12)) throw new Error("month must be 1-12");
    const { rows } = await pool.query(`SELECT year FROM public.strategy_goals WHERE id = $1`, [data.goalId]);
    if (!rows.length) throw new Error("Goal not found");
    const setRag = data.rag !== undefined;
    if (setRag && data.rag !== null && !MONTH_OVERRIDE_YEARS.includes(Number(rows[0].year))) {
      throw new Error(`Manual red/green is only enabled for ${MONTH_OVERRIDE_YEARS.join(", ")}`);
    }
    const rag = data.rag === "green" || data.rag === "red" ? data.rag : null;
    const setComment = data.comment !== undefined;
    const comment = String(data.comment ?? "").trim();
    await pool.query(
      `INSERT INTO public.strategy_progress (goal_id, month, actual_value, month_rag, comment, updated_by)
       VALUES ($1, $2, '', $3, $4, $5)
       ON CONFLICT (goal_id, month) DO UPDATE SET
         month_rag = CASE WHEN $6 THEN EXCLUDED.month_rag ELSE strategy_progress.month_rag END,
         comment   = CASE WHEN $7 THEN EXCLUDED.comment   ELSE strategy_progress.comment   END,
         updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [data.goalId, m, rag, comment, email || null, setRag, setComment],
    );
    await pool.query(`UPDATE public.strategy_goals SET updated_at = NOW() WHERE id = $1`, [data.goalId]);
    return { ok: true };
  });

// ── Supporting activities ───────────────────────────────────────────────────────
export const $saveActivity = createServerFn({ method: "POST" })
  .validator((data: Omit<StrategyActivity, "id"> & { id?: number }) => data)
  .handler(async ({ data }) => {
    const pool = await db();
    const vals = [data.goalId, data.activity, data.metric, data.target, dateOrNull(data.dueDate), data.status || "Not started"];
    if (data.id) {
      await pool.query(
        `UPDATE public.strategy_activities SET goal_id=$1, activity=$2, metric=$3, target=$4, due_date=$5, status=$6, updated_at=NOW() WHERE id=$7`,
        [...vals, data.id],
      );
      return { id: data.id };
    }
    const { rows } = await pool.query(
      `INSERT INTO public.strategy_activities (goal_id, activity, metric, target, due_date, status) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      vals,
    );
    return { id: Number(rows[0].id) };
  });

export const $deleteActivity = createServerFn({ method: "POST" })
  .validator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    const pool = await db();
    await pool.query(`DELETE FROM public.strategy_activities WHERE id = $1`, [data.id]);
    return { ok: true };
  });

// ── Initiatives ────────────────────────────────────────────────────────────────
export const $saveInitiative = createServerFn({ method: "POST" })
  .validator((data: Omit<StrategyInitiative, "id"> & { id?: number }) => data)
  .handler(async ({ data }) => {
    const pool = await db();
    const vals = [Number(data.year), data.name, data.objective, data.department, data.owner, dateOrNull(data.targetDate), data.status || "Planned", data.progressNotes ?? ""];
    if (data.id) {
      await pool.query(
        `UPDATE public.strategy_initiatives SET year=$1, name=$2, objective=$3, department=$4, owner=$5, target_date=$6, status=$7, progress_notes=$8, updated_at=NOW() WHERE id=$9`,
        [...vals, data.id],
      );
      return { id: data.id };
    }
    const { rows } = await pool.query(
      `INSERT INTO public.strategy_initiatives (year, name, objective, department, owner, target_date, status, progress_notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      vals,
    );
    return { id: Number(rows[0].id) };
  });

export const $deleteInitiative = createServerFn({ method: "POST" })
  .validator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    const pool = await db();
    await pool.query(`DELETE FROM public.strategy_initiatives WHERE id = $1`, [data.id]);
    return { ok: true };
  });

// ── Deep dives + action items ──────────────────────────────────────────────────
export const $listDeepDives = createServerFn({ method: "GET" })
  .validator((data: { year: number }) => data)
  .handler(async ({ data }): Promise<StrategyDeepDive[]> => {
    const pool = await db();
    const { rows } = await pool.query(
      `SELECT d.id, d.year, d.name, to_char(d.held_on,'YYYY-MM-DD') AS held_on,
              COUNT(a.id)::int AS item_count,
              COUNT(a.id) FILTER (WHERE a.status NOT IN ('Done','Dropped'))::int AS open_count
         FROM public.strategy_deep_dives d LEFT JOIN public.strategy_action_items a ON a.deep_dive_id = d.id
        WHERE d.year = $1 GROUP BY d.id ORDER BY d.held_on DESC NULLS LAST, d.id DESC`,
      [Number(data.year)],
    );
    return rows.map((r) => ({ id: Number(r.id), year: Number(r.year), name: s(r.name), heldOn: r.held_on ?? null, itemCount: Number(r.item_count), openCount: Number(r.open_count) }));
  });

export const $saveDeepDive = createServerFn({ method: "POST" })
  .validator((data: { id?: number; year: number; name: string; heldOn: string | null }) => data)
  .handler(async ({ data }) => {
    const pool = await db();
    if (data.id) {
      await pool.query(`UPDATE public.strategy_deep_dives SET year=$1, name=$2, held_on=$3 WHERE id=$4`, [Number(data.year), data.name, dateOrNull(data.heldOn), data.id]);
      return { id: data.id };
    }
    const { rows } = await pool.query(`INSERT INTO public.strategy_deep_dives (year, name, held_on) VALUES ($1,$2,$3) RETURNING id`, [Number(data.year), data.name, dateOrNull(data.heldOn)]);
    return { id: Number(rows[0].id) };
  });

export const $deleteDeepDive = createServerFn({ method: "POST" })
  .validator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    const pool = await db();
    await pool.query(`DELETE FROM public.strategy_deep_dives WHERE id = $1`, [data.id]);
    return { ok: true };
  });

export const $listActionItems = createServerFn({ method: "GET" })
  .validator((data: { deepDiveId: number }) => data)
  .handler(async ({ data }) => {
    const pool = await db();
    const { rows } = await pool.query(`SELECT * FROM public.strategy_action_items WHERE deep_dive_id = $1 ORDER BY area, id`, [data.deepDiveId]);
    return rows.map(mapAction);
  });

export const $saveActionItem = createServerFn({ method: "POST" })
  .validator((data: Omit<StrategyActionItem, "id"> & { id?: number }) => data)
  .handler(async ({ data }) => {
    const pool = await db();
    const vals = [data.deepDiveId, data.area, data.action, data.owner, data.timing, data.status || "Not started", data.notes ?? ""];
    if (data.id) {
      await pool.query(
        `UPDATE public.strategy_action_items SET deep_dive_id=$1, area=$2, action=$3, owner=$4, timing=$5, status=$6, notes=$7, updated_at=NOW() WHERE id=$8`,
        [...vals, data.id],
      );
      return { id: data.id };
    }
    const { rows } = await pool.query(
      `INSERT INTO public.strategy_action_items (deep_dive_id, area, action, owner, timing, status, notes) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      vals,
    );
    return { id: Number(rows[0].id) };
  });

export const $deleteActionItem = createServerFn({ method: "POST" })
  .validator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    const pool = await db();
    await pool.query(`DELETE FROM public.strategy_action_items WHERE id = $1`, [data.id]);
    return { ok: true };
  });

// ── Leadership reviews ───────────────────────────────────────────────────────────
export const $getStrategyReviews = createServerFn({ method: "GET" })
  .validator((data: { reviewMonth: string }) => data)
  .handler(async ({ data }): Promise<StrategyReview[]> => {
    const pool = await db();
    const { rows } = await pool.query(`SELECT goal_id, review_month, rag, meeting_notes, updated_by FROM public.strategy_reviews WHERE review_month = $1`, [data.reviewMonth]);
    return rows.map((r) => ({ goalId: s(r.goal_id), reviewMonth: s(r.review_month), rag: (r.rag || null) as Rag | null, meetingNotes: s(r.meeting_notes), updatedBy: r.updated_by ?? null }));
  });

export const $saveStrategyReview = createServerFn({ method: "POST" })
  .validator((data: { goalId: string; reviewMonth: string; rag: Rag | null; meetingNotes: string }) => data)
  .handler(async ({ data }) => {
    if (!/^\d{4}-\d{2}$/.test(data.reviewMonth)) throw new Error("reviewMonth must be YYYY-MM");
    const pool = await db();
    const email = await currentEmail();
    await pool.query(
      `INSERT INTO public.strategy_reviews (goal_id, review_month, rag, meeting_notes, updated_by) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (goal_id, review_month) DO UPDATE SET rag=EXCLUDED.rag, meeting_notes=EXCLUDED.meeting_notes, updated_by=EXCLUDED.updated_by, updated_at=NOW()`,
      [data.goalId, data.reviewMonth, data.rag, data.meetingNotes ?? "", email || null],
    );
    return { ok: true };
  });
