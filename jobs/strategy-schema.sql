-- Strategy tables for Horizon QX (Lakebase: horizon-ai-innovation / production / databricks_postgres).
-- The app creates these automatically on first use (src/lib/strategy.server.ts).
-- This file is a manual fallback / reference only. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.strategy_goals (
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
);
CREATE INDEX IF NOT EXISTS strategy_goals_year_idx ON public.strategy_goals (year);

CREATE TABLE IF NOT EXISTS public.strategy_progress (
  goal_id TEXT NOT NULL REFERENCES public.strategy_goals(id) ON DELETE CASCADE,
  month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  actual_value TEXT NOT NULL DEFAULT '',
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (goal_id, month)
);
-- Per-month manual red/green (2026) and comments. The app adds these itself when it can;
-- run as the table owner if the app log says "month colour/comment columns MISSING".
ALTER TABLE public.strategy_progress ADD COLUMN IF NOT EXISTS month_rag TEXT;
ALTER TABLE public.strategy_progress ADD COLUMN IF NOT EXISTS comment TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS public.strategy_activities (
  id SERIAL PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES public.strategy_goals(id) ON DELETE CASCADE,
  activity TEXT NOT NULL DEFAULT '',
  metric TEXT NOT NULL DEFAULT '',
  target TEXT NOT NULL DEFAULT '',
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'Not started',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.strategy_initiatives (
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
);

CREATE TABLE IF NOT EXISTS public.strategy_deep_dives (
  id SERIAL PRIMARY KEY,
  year INT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  held_on DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.strategy_action_items (
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
);

CREATE TABLE IF NOT EXISTS public.strategy_reviews (
  goal_id TEXT NOT NULL REFERENCES public.strategy_goals(id) ON DELETE CASCADE,
  review_month TEXT NOT NULL,
  rag TEXT,
  meeting_notes TEXT NOT NULL DEFAULT '',
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (goal_id, review_month)
);
