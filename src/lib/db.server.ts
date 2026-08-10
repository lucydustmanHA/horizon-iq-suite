/**
 * db.server.ts — Lakebase pool using OAuth service principal credentials.
 * Uses DATABRICKS_CLIENT_ID + DATABRICKS_CLIENT_SECRET (auto-injected by the platform)
 * to get an OAuth token via client_credentials grant. Token auto-refreshes — never expires.
 * Falls back to LAKEBASE_PAT if SP credentials are unavailable.
 */
import pg from "pg";

const LAKEBASE_ENDPOINT =
  process.env.LAKEBASE_ENDPOINT ??
  "projects/horizon-ai-innovation/branches/production/endpoints/primary";

let _pool: pg.Pool | null = null;
let _tokenExpiresAt = 0;

// --- OAuth token cache ---
let _oauthToken: string | null = null;
let _oauthExpiresAt = 0;

/**
 * Get a workspace access token using the app's service principal.
 * Uses OAuth2 client_credentials grant with auto-injected SP credentials.
 * Caches the token and refreshes 5 minutes before expiry.
 */
export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (_oauthToken && now < _oauthExpiresAt - 5 * 60 * 1000) {
    return _oauthToken;
  }

  const clientId = process.env.DATABRICKS_CLIENT_ID ?? "";
  const clientSecret = process.env.DATABRICKS_CLIENT_SECRET ?? "";
  const rawHost = process.env.DATABRICKS_HOST ?? "";
  const host = rawHost.startsWith("http") ? rawHost : `https://${rawHost}`;

  // Prefer LAKEBASE_PAT if available (known to work with Lakebase auth)
  const pat = process.env.LAKEBASE_PAT ?? "";
  if (pat) {
    return pat;
  }

  // Otherwise use OAuth client_credentials (for when SP is provisioned in Lakebase)
  if (clientId && clientSecret) {
    const res = await fetch(`${host}/oidc/v1/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope: "all-apis",
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[DB] OAuth token request failed (${res.status}): ${text}`);
      // Fall back to PAT if OAuth fails
      const pat = process.env.LAKEBASE_PAT ?? "";
      if (pat) {
        console.log("[DB] Falling back to LAKEBASE_PAT");
        return pat;
      }
      throw new Error(`[DB] OAuth token error ${res.status}: ${text}`);
    }

    const data = await res.json();
    _oauthToken = data.access_token;
    // expires_in is in seconds; default to 1 hour if not provided
    const expiresIn = (data.expires_in ?? 3600) * 1000;
    _oauthExpiresAt = now + expiresIn;
    console.log(`[DB] OAuth token obtained (expires in ${Math.round(expiresIn / 60000)}m)`);
    return _oauthToken!;
  }

  // No credentials available
  throw new Error("[DB] No auth credentials available (no LAKEBASE_PAT, no SP credentials)");
}

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
  const accessToken = await getAccessToken();
  const rawHost = process.env.DATABRICKS_HOST ?? "";
  const host = rawHost.startsWith("http") ? rawHost : `https://${rawHost}`;

  const res = await fetch(`${host}/api/2.0/postgres/credentials`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
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
