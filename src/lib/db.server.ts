/**
 * db.server.ts — Lakebase connection pool with automatic token refresh.
 * Only runs on the server (TanStack Start server functions).
 */
import pg from "pg";

const { Pool } = pg;

const DATABRICKS_HOST = process.env.DATABRICKS_HOST ?? "";
const DATABRICKS_TOKEN = process.env.DATABRICKS_TOKEN ?? "";
const LAKEBASE_ENDPOINT =
  process.env.LAKEBASE_ENDPOINT ??
  "projects/horizon-ai-innovation/branches/production/endpoints/primary";

let _pool: pg.Pool | null = null;
let _tokenExpiresAt = 0;

async function generateToken(): Promise<string> {
  // Correct API: POST /api/2.0/postgres/credentials with endpoint in body
  const url = `${DATABRICKS_HOST}/api/2.0/postgres/credentials`;
  console.log(`[DB] Fetching Lakebase credential from ${url}`);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${DATABRICKS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ endpoint: LAKEBASE_ENDPOINT }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Lakebase credential error ${res.status}: ${text}`);
  }
  const data = (await res.json()) as { token: string };
  console.log(`[DB] Credential obtained successfully`);
  return data.token;
}

/** Returns a ready connection pool, recreating it when the token nears expiry. */
export async function getDb(): Promise<pg.Pool> {
  const now = Date.now();
  // Recreate pool 5 min before the 1-hour token expires
  if (!_pool || now >= _tokenExpiresAt - 5 * 60 * 1000) {
    if (_pool) {
      await _pool.end().catch(() => {});
    }
    const password = await generateToken();
    const user = process.env.PGUSER ?? "";
    console.log(`[DB] Creating pool user=${user}`);
    _pool = new Pool({
      host: process.env.PGHOST ?? "ep-summer-silence-eenujnkm.database.westus2.azuredatabricks.net",
      database: process.env.PGDATABASE ?? "databricks_postgres",
      user,
      password,
      port: Number(process.env.PGPORT ?? 5432),
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30_000,
    });
    _tokenExpiresAt = now + 55 * 60 * 1000; // 55-min window
  }
  return _pool;
}
