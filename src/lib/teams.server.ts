/**
 * teams.server.ts — Teams messages via a Power Automate "When a Teams webhook request is received" flow.
 *
 * The flow URL is stored in public.app_settings under a private key (secret_*). $getSettings never
 * returns secret_* keys, so the URL is never sent to the browser. Only emails in TEAMS_ADMIN_EMAILS
 * (env var, comma-separated; defaults to the app owner) can view its status, change it, or send a test.
 *
 * Flow contract: POST JSON { email, message } — the flow posts `message` (HTML) to `email` as Flow bot.
 */
import { createServerFn } from "@tanstack/react-start";
import { getDb } from "./db.server";

export const TEAMS_WEBHOOK_KEY = "secret_teams_webhook_url";
const ADMINS = (process.env.TEAMS_ADMIN_EMAILS ?? "lucy.dustman@horizonair.com")
  .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

/** Signed-in user's email from the Databricks Apps forwarded headers (same approach as strategy.server.ts). */
async function currentEmail(): Promise<string> {
  const names = ["x-forwarded-email", "x-forwarded-preferred-username", "x-forwarded-user"];
  // 1) TanStack Start's request API
  try {
    const start: any = await import("@tanstack/react-start/server");
    if (typeof start.getRequestHeader === "function") {
      for (const n of names) { const v = start.getRequestHeader(n); if (v) return String(v); }
    }
  } catch { /* fall through */ }
  // 2) h3 request event (same as $getMe)
  try {
    const h3: any = await import("h3");
    const event: any = h3.useEvent?.();
    for (const n of names) {
      const v = event?.headers?.get?.(n) || event?.node?.req?.headers?.[n];
      if (v) return String(Array.isArray(v) ? v[0] : v);
    }
  } catch { /* ignore */ }
  return "";
}

async function requireAdmin(): Promise<string> {
  const email = (await currentEmail()).toLowerCase();
  if (!email || !ADMINS.includes(email)) throw new Error("Only Teams admins can do this.");
  return email;
}

async function readWebhookUrl(): Promise<string | null> {
  const db = await getDb();
  const { rows } = await db.query(`SELECT option_value FROM public.app_settings WHERE setting_key = $1 LIMIT 1`, [TEAMS_WEBHOOK_KEY]);
  return rows[0]?.option_value ? String(rows[0].option_value) : null;
}

function validWebhookUrl(raw: string): string {
  const url = raw.trim();
  let u: URL;
  try { u = new URL(url); } catch { throw new Error("That doesn't look like a web address. Copy the HTTP URL from the flow's trigger step."); }
  if (u.protocol !== "https:") throw new Error("The URL must start with https://");
  if (!/(logic\.azure\.com|powerplatform\.com|powerautomate\.com|azure-apim\.net)$/i.test(u.hostname)) {
    throw new Error("That isn't a Power Automate URL. Copy the HTTP URL from the 'When a Teams webhook request is received' step.");
  }
  return url;
}

/** Send one Teams message through the flow. Used by the test button and (later) reminders. */
export async function sendTeamsMessage(email: string, html: string): Promise<{ ok: boolean; status: number; detail: string }> {
  const url = await readWebhookUrl();
  if (!url) throw new Error("The Teams webhook URL hasn't been set yet (Settings → Strategy).");
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, message: html }) });
  const detail = res.ok ? "" : (await res.text().catch(() => "")).slice(0, 300);
  return { ok: res.ok, status: res.status, detail };
}

export const $getTeamsWebhookStatus = createServerFn({ method: "GET" }).handler(async () => {
  const email = (await currentEmail()).toLowerCase();
  const canManage = !!email && ADMINS.includes(email);
  if (!canManage) return { canManage: false, configured: false, hint: "", email };
  const url = await readWebhookUrl();
  return { canManage: true, configured: !!url, hint: url ? `…${url.slice(-6)}` : "", email };
});

export const $saveTeamsWebhook = createServerFn({ method: "POST" })
  .validator((data: { url: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin();
    const url = validWebhookUrl(data.url);
    const db = await getDb();
    await db.query(`DELETE FROM public.app_settings WHERE setting_key = $1`, [TEAMS_WEBHOOK_KEY]);
    await db.query(`INSERT INTO public.app_settings (setting_key, option_value) VALUES ($1, $2)`, [TEAMS_WEBHOOK_KEY, url]);
    return { ok: true, hint: `…${url.slice(-6)}` };
  });

export const $clearTeamsWebhook = createServerFn({ method: "POST" }).handler(async () => {
  await requireAdmin();
  const db = await getDb();
  await db.query(`DELETE FROM public.app_settings WHERE setting_key = $1`, [TEAMS_WEBHOOK_KEY]);
  return { ok: true };
});

/** Sends a test message to the signed-in admin's own Teams. */
export const $sendTeamsTest = createServerFn({ method: "POST" }).handler(async () => {
  const email = await requireAdmin();
  const r = await sendTeamsMessage(email,
    `<p><b>Test from the Business Transformation app</b></p><p>If you can read this, Teams reminders are connected. No action needed.</p>`);
  if (!r.ok) throw new Error(`Power Automate returned ${r.status}${r.detail ? `: ${r.detail}` : ""}`);
  return { ok: true, status: r.status, sentTo: email };
});
