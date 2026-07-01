/**
 * db.server.ts — Lakebase pool using a stored PAT for credential generation.
 * LAKEBASE_PAT is injected from the Databricks secret horizon-iq-portal/lakebase-token.
 */
import pg from "pg";

const LAKEBASE_ENDPOINT =
  process.env.LAKEBASE_ENDPOINT ??
  "projects/horizon-ai-innovation/branches/production/endpoints/primary";

let _pool: pg.Pool | null = null;
let _tokenExpiresAt = 0;

function decodeJwtSub(token: string): string {
  try {
    const part = token.split(".")[1];
    const padded = part + "=".repeat((4 - (part.length % 4)) % 4);
    const payload = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
    return String(payload.sub ?? "");
  } catch {
    return "";
  }
}

async function generateLakebaseCredential(): Promise<{ password: string; user: string }> {
  const pat     = process.env.LAKEBASE_PAT ?? "";
  const rawHost = process.env.DATABRICKS_HOST ?? "";
  const host    = rawHost.startsWith("http") ? rawHost : `https://${rawHost}`;

  if (!pat) throw new Error("[DB] LAKEBASE_PAT is not set");

  const res = await fetch(`${host}/api/2.0/postgres/credentials`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${pat}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ endpoint: LAKEBASE_ENDPOINT }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[DB] Lakebase credential error ${res.status}: ${text}`);
  }

  const { token } = (await res.json()) as { token: string };
  const user = decodeJwtSub(token);
  console.log(`[DB] Credential obtained for user="${user}"`);
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
