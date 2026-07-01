/**
 * db.server.ts — Lakebase pool using M2M OAuth.
 * Decodes the Lakebase credential JWT to extract the correct Postgres username
 * automatically, so we never need to hardcode PGUSER.
 */
import pg from "pg";

const { Pool } = pg;

const LAKEBASE_ENDPOINT =
  process.env.LAKEBASE_ENDPOINT ??
  "projects/horizon-ai-innovation/branches/production/endpoints/primary";

let _pool: pg.Pool | null = null;
let _tokenExpiresAt = 0;

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const part = token.split(".")[1];
    const padded = part + "=".repeat((4 - (part.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return {};
  }
}

async function getM2MToken(): Promise<string> {
  const clientId     = process.env.DATABRICKS_CLIENT_ID ?? "";
  const clientSecret = process.env.DATABRICKS_CLIENT_SECRET ?? "";
  const rawHost      = process.env.DATABRICKS_HOST ?? "";
  const host         = rawHost.startsWith("http") ? rawHost : `https://${rawHost}`;

  if (!clientId || !clientSecret) {
    throw new Error("[DB] DATABRICKS_CLIENT_ID or DATABRICKS_CLIENT_SECRET missing");
  }

  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(`${host}/oidc/v1/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${creds}`,
    },
    body: "grant_type=client_credentials&scope=all-apis",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[DB] M2M token error ${res.status}: ${text}`);
  }
  const { access_token } = (await res.json()) as { access_token: string };
  return access_token;
}

async function generateLakebaseCredential(): Promise<{ password: string; user: string }> {
  const m2mToken = await getM2MToken();
  const rawHost  = process.env.DATABRICKS_HOST ?? "";
  const host     = rawHost.startsWith("http") ? rawHost : `https://${rawHost}`;

  const res = await fetch(`${host}/api/2.0/postgres/credentials`, {
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

  // Decode the JWT to find the exact Postgres username Lakebase assigned
  const payload = decodeJwtPayload(token);
  const user = String(payload.sub ?? process.env.PGUSER ?? "");
  console.log(`[DB] Lakebase credential sub="${user}"`);

  return { password: token, user };
}

export async function getDb(): Promise<pg.Pool> {
  const now = Date.now();
  if (!_pool || now >= _tokenExpiresAt - 5 * 60 * 1000) {
    if (_pool) await _pool.end().catch(() => {});

    const { password, user } = await generateLakebaseCredential();
    console.log(`[DB] Creating pool user=${user}`);

    _pool = new pg.Pool({
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
