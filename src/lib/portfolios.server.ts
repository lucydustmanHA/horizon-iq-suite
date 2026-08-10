/**
 * portfolios.server.ts — Server functions for portfolio CRUD.
 * Portfolios group use cases for bulk management and reporting.
 */
import { createServerFn } from "@tanstack/react-start";
import { getDb } from "./db.server";

export interface Portfolio {
  id: string;
  name: string;
  description: string;
  color: string;
  createdAt: string;
  updatedAt: string;
  useCaseCount: number;
}

export interface PortfolioDetail extends Portfolio {
  useCaseIds: string[];
}

// ---------------------------------------------------------------------------
// List all portfolios with use-case counts
// ---------------------------------------------------------------------------
export const $loadPortfolios = createServerFn({ method: "GET" }).handler(
  async (): Promise<Portfolio[]> => {
    const db = await getDb();
    const { rows } = await db.query(`
      SELECT p.id, p.name, p.description, p.color, p.created_at, p.updated_at,
             COUNT(puc.use_case_id)::int AS use_case_count
      FROM public.portfolios p
      LEFT JOIN public.portfolio_use_cases puc ON puc.portfolio_id = p.id
      GROUP BY p.id
      ORDER BY p.name ASC
    `);
    return rows.map((r: Record<string, unknown>) => ({
      id: String(r.id),
      name: String(r.name),
      description: String(r.description ?? ""),
      color: String(r.color ?? "#6366f1"),
      createdAt: new Date(r.created_at as string).toISOString(),
      updatedAt: new Date(r.updated_at as string).toISOString(),
      useCaseCount: Number(r.use_case_count ?? 0),
    }));
  }
);

// ---------------------------------------------------------------------------
// Get a single portfolio with its use case IDs
// ---------------------------------------------------------------------------
export const $getPortfolio = createServerFn({ method: "GET" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }): Promise<PortfolioDetail | null> => {
    const db = await getDb();
    const { rows } = await db.query(
      `SELECT id, name, description, color, created_at, updated_at FROM public.portfolios WHERE id = $1`,
      [data.id]
    );
    if (!rows.length) return null;
    const r = rows[0];
    const { rows: ucRows } = await db.query(
      `SELECT use_case_id FROM public.portfolio_use_cases WHERE portfolio_id = $1`,
      [data.id]
    );
    return {
      id: String(r.id),
      name: String(r.name),
      description: String(r.description ?? ""),
      color: String(r.color ?? "#6366f1"),
      createdAt: new Date(r.created_at as string).toISOString(),
      updatedAt: new Date(r.updated_at as string).toISOString(),
      useCaseCount: ucRows.length,
      useCaseIds: ucRows.map((row: Record<string, unknown>) => String(row.use_case_id)),
    };
  });

// ---------------------------------------------------------------------------
// Create a portfolio
// ---------------------------------------------------------------------------
export const $createPortfolio = createServerFn({ method: "POST" })
  .validator((data: { name: string; description?: string; color?: string }) => data)
  .handler(async ({ data }): Promise<Portfolio> => {
    const db = await getDb();
    const { rows } = await db.query(
      `INSERT INTO public.portfolios (name, description, color)
       VALUES ($1, $2, $3)
       RETURNING id, name, description, color, created_at, updated_at`,
      [data.name, data.description ?? "", data.color ?? "#6366f1"]
    );
    const r = rows[0];
    return {
      id: String(r.id),
      name: String(r.name),
      description: String(r.description ?? ""),
      color: String(r.color),
      createdAt: new Date(r.created_at as string).toISOString(),
      updatedAt: new Date(r.updated_at as string).toISOString(),
      useCaseCount: 0,
    };
  });

// ---------------------------------------------------------------------------
// Update a portfolio
// ---------------------------------------------------------------------------
export const $updatePortfolio = createServerFn({ method: "POST" })
  .validator((data: { id: string; name?: string; description?: string; color?: string }) => data)
  .handler(async ({ data }) => {
    const db = await getDb();
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (data.name !== undefined) { sets.push(`name = $${i++}`); vals.push(data.name); }
    if (data.description !== undefined) { sets.push(`description = $${i++}`); vals.push(data.description); }
    if (data.color !== undefined) { sets.push(`color = $${i++}`); vals.push(data.color); }
    if (!sets.length) return;
    sets.push(`updated_at = NOW()`);
    vals.push(data.id);
    await db.query(
      `UPDATE public.portfolios SET ${sets.join(", ")} WHERE id = $${i}`,
      vals
    );
  });

// ---------------------------------------------------------------------------
// Delete a portfolio
// ---------------------------------------------------------------------------
export const $deletePortfolio = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const db = await getDb();
    await db.query(`DELETE FROM public.portfolios WHERE id = $1`, [data.id]);
  });

// ---------------------------------------------------------------------------
// Add use cases to a portfolio
// ---------------------------------------------------------------------------
export const $addUseCasesToPortfolio = createServerFn({ method: "POST" })
  .validator((data: { portfolioId: string; useCaseIds: string[] }) => data)
  .handler(async ({ data }) => {
    if (!data.useCaseIds.length) return;
    const db = await getDb();
    const values = data.useCaseIds.map((_, i) => `($1, $${i + 2})`).join(", ");
    await db.query(
      `INSERT INTO public.portfolio_use_cases (portfolio_id, use_case_id)
       VALUES ${values}
       ON CONFLICT DO NOTHING`,
      [data.portfolioId, ...data.useCaseIds]
    );
    await db.query(`UPDATE public.portfolios SET updated_at = NOW() WHERE id = $1`, [data.portfolioId]);
  });

// ---------------------------------------------------------------------------
// Remove use cases from a portfolio
// ---------------------------------------------------------------------------
export const $removeUseCasesFromPortfolio = createServerFn({ method: "POST" })
  .validator((data: { portfolioId: string; useCaseIds: string[] }) => data)
  .handler(async ({ data }) => {
    if (!data.useCaseIds.length) return;
    const db = await getDb();
    const placeholders = data.useCaseIds.map((_, i) => `$${i + 2}`).join(", ");
    await db.query(
      `DELETE FROM public.portfolio_use_cases
       WHERE portfolio_id = $1 AND use_case_id IN (${placeholders})`,
      [data.portfolioId, ...data.useCaseIds]
    );
    await db.query(`UPDATE public.portfolios SET updated_at = NOW() WHERE id = $1`, [data.portfolioId]);
  });

// ---------------------------------------------------------------------------
// Get portfolio IDs for a specific use case (single fast query)
// ---------------------------------------------------------------------------
export const $getPortfoliosForUseCase = createServerFn({ method: "GET" })
  .validator((data: { useCaseId: string }) => data)
  .handler(async ({ data }): Promise<string[]> => {
    const db = await getDb();
    const { rows } = await db.query(
      `SELECT portfolio_id FROM public.portfolio_use_cases WHERE use_case_id = $1`,
      [data.useCaseId]
    );
    return rows.map((r: Record<string, unknown>) => String(r.portfolio_id));
  });
