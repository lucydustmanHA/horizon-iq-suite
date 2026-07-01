/**
 * db.server.ts — Lakebase connection pool using M2M OAuth (client credentials).
 * DATABRICKS_CLIENT_ID + DATABRICKS_CLIENT_SECRET are auto-injected by Databricks Apps.
 */
import pg from "pg";

const { Pool } = pg;

const LAKEBASE_ENDPOINT =
  process.env.LAKEBASE_ENDPOINT ??
  "projects/horizon-ai-innovation/branches/production/endpoints/primary";

let _pool: pg.Pool | null = null;
let _tokenExpiresAt = 0;

/** Exchange SP client credentials for a short-lived Databricks OAuth token. */
async function getM2MToken(): Promise<string> {
  const clientId     = process.env.DATABRICKS_CLIENT_ID ?? "";
  const clientSecret = process.env.DATABRICKS_CLIENT_SECRET ?? "";
  const rawHost      = process.env.DATABRICKS_HOST ?? "";
  const host         = rawHost.startsWith("http") ? rawHost : `https://${rawHost}`;

  console.log(`[DB] M2M token fetch — clientId=${clientId.slice(0, 8)} host=${rawHost}`);

  if (!clientId || !clientSecret) {
    throw new Error("[DB] DATABRICKS_CLIENT_ID or DATABRICKS_CLIENT_SECRET is empty");
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(`${host}/oidc/v1/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: "grant_type=client_credentials&scope=all-apis",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[DB] M2M token error ${res.status}: ${text}`);
  }

  const { access_token } = (await res.json()) as { access_token: string };
  console.log("[DB] M2M token obtained");
  return access_token;
}

/** Use the M2M token to generate a short-lived Lakebase Postgres credential. */
async function generateLakebaseToken(): Promise<string> {
  const m2mToken = await getM2MToken();
  const rawHost  = process.env.DATABRICKS_HOST ?? "";
  const host     = rawHost.startsWith("http") ? rawHost : `https://${rawHost}`;
  const url      = `${host}/api/2.0/postgres/credentials`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${m2mToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ endpoint: LAKEBASE_ENDPOINT }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[DB] Lakebase credential error ${res.status}: ${text}`);
  }

  const { token } = (await res.json()) as { token: string };
  console.log("[DB] Lakebase credential obtained");
  return token;
}

/** Returns a ready pool, recreating it when the token nears expiry (~55 min). */
export async function getDb(): Promise<pg.Pool> {
  const now = Date.now();
  if (!_pool || now >= _tokenExpiresAt - 5 * 60 * 1000) {
    if (_pool) await _pool.end().catch(() => {});
    const password = await generateLakebaseToken();
    const user     = process.env.PGUSER ?? "";
    console.log(`[DB] Creating pool user=${user}`);
    _pool = new Pool({
      host:     process.env.PGHOST     ?? "ep-summer-silence-eenujnkm.database.westus2.azuredatabricks.net",
      database: process.env.PGDATABASE ?? "databricks_postgres",
      user,
      password,
      port:     Number(process.env.PGPORT ?? 5432),
      ssl:      { rejectUnauthorized: false },
      max:      5,
      idleTimeoutMillis: 30_000,
    });
    _tokenExpiresAt = now + 55 * 60 * 1000;
  }
  return _pool;
}
