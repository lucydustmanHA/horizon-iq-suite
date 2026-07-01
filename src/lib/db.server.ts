/**
 * db.server.ts — Lakebase connection pool with automatic token refresh.
 */
import pg from "pg";

const { Pool } = pg;

const LAKEBASE_ENDPOINT =
  process.env.LAKEBASE_ENDPOINT ??
  "projects/horizon-ai-innovation/branches/production/endpoints/primary";

let _pool: pg.Pool | null = null;
let _tokenExpiresAt = 0;

async function generateToken(): Promise<string> {
  // Dump all DATABRICKS_* env vars so we know what's injected
  const dbEnvKeys = Object.keys(process.env).filter(k => k.startsWith("DATABRICKS") || k.startsWith("PG"));
  console.log("[DB] env keys:", dbEnvKeys.join(", ") || "(none)");
  for (const k of dbEnvKeys) {
    const v = process.env[k] ?? "";
    console.log(`[DB]   ${k} = len=${v.length} prefix=${v.slice(0, 8) || "(empty)"}`);
  }

  const rawHost = process.env.DATABRICKS_HOST ?? "";
  const token   = process.env.DATABRICKS_TOKEN ?? "";
  const host    = rawHost.startsWith("http") ? rawHost : `https://${rawHost}`;
  const url     = `${host}/api/2.0/postgres/credentials`;

  if (!token) {
    throw new Error("[DB] DATABRICKS_TOKEN is empty — cannot generate Lakebase credential");
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Databricks-Workspace-Id": "620317033646362",
    },
    body: JSON.stringify({ endpoint: LAKEBASE_ENDPOINT }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Lakebase credential error ${res.status}: ${text}`);
  }
  const data = (await res.json()) as { token: string };
  console.log("[DB] Credential obtained successfully");
  return data.token;
}

export async function getDb(): Promise<pg.Pool> {
  const now = Date.now();
  if (!_pool || now >= _tokenExpiresAt - 5 * 60 * 1000) {
    if (_pool) await _pool.end().catch(() => {});
    const password = await generateToken();
    const user = process.env.PGUSER ?? "";
    console.log(`[DB] Creating pool user=${user}`);
    _pool = new Pool({
      host:     process.env.PGHOST     ?? "ep-summer-silence-eenujnkm.database.westus2.azuredatabricks.net",
      database: process.env.PGDATABASE ?? "databricks_postgres",
      user,
      password,
      port: Number(process.env.PGPORT ?? 5432),
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30_000,
    });
    _tokenExpiresAt = now + 55 * 60 * 1000;
  }
  return _pool;
}
