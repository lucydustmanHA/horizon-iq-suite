/**
 * reminders.server.ts — Teams reminders for missing strategy numbers (admin only).
 *
 * Email lookup for an owner name, in order:
 *   1. public.strategy_owner_emails  (emails the admin typed once and chose to remember)
 *   2. public.app_users              (people who have signed in to this app)
 *   3. Databricks workspace directory (SCIM, exact display-name match)
 * Sent reminders are logged in public.strategy_reminders.
 */
import { createServerFn } from "@tanstack/react-start";
import { getDb, getAccessToken } from "./db.server";
import { currentEmail, isTeamsAdmin, requireAdmin, sendTeamsMessage } from "./teams.server";
import { formatMonthKey, ownerKey } from "./strategy-types";

const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
const DEFAULT_APP_URL = "https://qx-business-transformation-620317033646362.2.azure.databricksapps.com";
const esc = (s: string) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export type EmailCandidate = { email: string; displayName: string };
export type EmailMatch = { email: string; source: "saved" | "app_users" | "directory" | "ambiguous" | "none"; candidates: EmailCandidate[] };
export type ReminderLog = { sentAt: string; sentBy: string; recipientName: string; recipientEmail: string; monthKey: string; goalIds: string[] };

async function directoryLookup(name: string): Promise<EmailCandidate[]> {
  try {
    const raw = process.env.DATABRICKS_HOST ?? "";
    if (!raw) return [];
    const host = raw.startsWith("http") ? raw : `https://${raw}`;
    const token = await getAccessToken();
    const qs = new URLSearchParams({ filter: `displayName eq "${name.replace(/["\\]/g, "")}"`, attributes: "userName,displayName,active,emails", count: "5" });
    const res = await fetch(`${host}/api/2.0/preview/scim/v2/Users?${qs}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) { console.warn(`[reminders] directory lookup ${res.status} for "${name}"`); return []; }
    const j: any = await res.json();
    return (j.Resources ?? [])
      .filter((u: any) => u.active !== false)
      .map((u: any) => ({ email: String(u.emails?.find((e: any) => e.primary)?.value || u.userName || ""), displayName: String(u.displayName ?? name) }))
      .filter((c: EmailCandidate) => EMAIL_RE.test(c.email));
  } catch (e) {
    console.warn("[reminders] directory lookup failed:", (e as Error)?.message ?? e);
    return [];
  }
}

async function resolveEmail(name: string): Promise<EmailMatch> {
  const n = name.trim();
  if (EMAIL_RE.test(n)) return { email: n, source: "saved", candidates: [] };
  const db = await getDb();
  const saved = await db.query(`SELECT email FROM public.strategy_owner_emails WHERE name_key = $1`, [ownerKey(n)]);
  if (saved.rows[0]?.email) return { email: String(saved.rows[0].email), source: "saved", candidates: [] };
  const users = await db.query(`SELECT email, display_name FROM public.app_users WHERE lower(trim(display_name)) = $1`, [ownerKey(n)]);
  if (users.rows.length === 1) return { email: String(users.rows[0].email), source: "app_users", candidates: [] };
  const dir = await directoryLookup(n);
  const all = [...users.rows.map((r: any) => ({ email: String(r.email), displayName: String(r.display_name) })), ...dir]
    .filter((c, i, arr) => arr.findIndex((x) => x.email.toLowerCase() === c.email.toLowerCase()) === i);
  if (all.length === 1) return { email: all[0].email, source: users.rows.length ? "app_users" : "directory", candidates: [] };
  if (all.length > 1) return { email: "", source: "ambiguous", candidates: all };
  return { email: "", source: "none", candidates: [] };
}

async function appBaseUrl(): Promise<string> {
  try {
    const start: any = await import("@tanstack/react-start/server");
    const host = typeof start.getRequestHeader === "function" ? (start.getRequestHeader("x-forwarded-host") || start.getRequestHeader("host")) : "";
    if (host && /databricksapps\.com$/i.test(String(host).split(":")[0])) return `https://${String(host).split(",")[0].trim()}`;
  } catch { /* ignore */ }
  return DEFAULT_APP_URL;
}

/** Admin flag, email matches for the given owner names, and reminder history for the given goals. */
export const $reminderContext = createServerFn({ method: "POST" })
  .validator((data: { goalIds: string[]; names: string[] }) => ({
    goalIds: (data.goalIds ?? []).map(String).slice(0, 50),
    names: Array.from(new Set((data.names ?? []).map((n) => String(n).trim()).filter(Boolean))).slice(0, 10),
  }))
  .handler(async ({ data }) => {
    const me = await currentEmail();
    if (!isTeamsAdmin(me)) return { canSend: false, matches: {} as Record<string, EmailMatch>, history: [] as ReminderLog[] };
    const matches: Record<string, EmailMatch> = {};
    for (const n of data.names) matches[n] = await resolveEmail(n);
    let history: ReminderLog[] = [];
    if (data.goalIds.length) {
      const db = await getDb();
      const { rows } = await db.query(
        `SELECT sent_at, sent_by, recipient_name, recipient_email, month_key, goal_ids FROM public.strategy_reminders
          WHERE goal_ids && $1::text[] ORDER BY sent_at DESC LIMIT 20`, [data.goalIds]);
      history = rows.map((r: any) => ({ sentAt: new Date(r.sent_at).toISOString(), sentBy: String(r.sent_by ?? ""), recipientName: String(r.recipient_name ?? ""),
        recipientEmail: String(r.recipient_email ?? ""), monthKey: String(r.month_key ?? ""), goalIds: (r.goal_ids ?? []).map(String) }));
    }
    return { canSend: true, matches, history };
  });

/** Look up one name (used when the admin picks "someone else"). */
export const $lookupOwnerEmail = createServerFn({ method: "POST" })
  .validator((data: { name: string }) => ({ name: String(data.name ?? "").trim().slice(0, 120) }))
  .handler(async ({ data }) => {
    await requireAdmin();
    if (!data.name) return { email: "", source: "none", candidates: [] } as EmailMatch;
    return resolveEmail(data.name);
  });

/** Send one Teams message to one person covering one or more goals, then log it. */
export const $sendGoalReminder = createServerFn({ method: "POST" })
  .validator((data: { recipientName: string; email: string; remember: boolean; monthKey: string; goalIds: string[]; note?: string }) => {
    const email = String(data.email ?? "").trim();
    if (!EMAIL_RE.test(email)) throw new Error("Enter a valid email address for the person.");
    const monthKey = String(data.monthKey ?? "");
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) throw new Error("Pick the month you need numbers for.");
    const goalIds = Array.from(new Set((data.goalIds ?? []).map(String))).slice(0, 25);
    if (!goalIds.length) throw new Error("Pick at least one goal.");
    return { recipientName: String(data.recipientName ?? "").trim().slice(0, 120), email, remember: !!data.remember, monthKey, goalIds, note: String(data.note ?? "").trim().slice(0, 500) };
  })
  .handler(async ({ data }) => {
    const me = await requireAdmin();
    const db = await getDb();
    const { rows } = await db.query(`SELECT id, objective, department FROM public.strategy_goals WHERE id = ANY($1::text[])`, [data.goalIds]);
    if (!rows.length) throw new Error("Those goals no longer exist.");
    const order = new Map(data.goalIds.map((id, i) => [id, i]));
    rows.sort((a: any, b: any) => (order.get(String(a.id)) ?? 0) - (order.get(String(b.id)) ?? 0));
    const sender = await db.query(`SELECT display_name FROM public.app_users WHERE lower(email) = $1 LIMIT 1`, [me]);
    const senderName = String(sender.rows[0]?.display_name || me.split("@")[0]);
    const first = (data.recipientName && !EMAIL_RE.test(data.recipientName) ? data.recipientName : data.email.split("@")[0]).split(/\s+/)[0];
    const month = formatMonthKey(data.monthKey);
    const base = await appBaseUrl();
    const items = rows.map((r: any) => `<li><a href="${base}/strategy/goals/${encodeURIComponent(String(r.id))}">${esc(String(r.objective))}</a>${r.department ? ` — ${esc(String(r.department))}` : ""}</li>`).join("");
    const html =
      `<p>Hi ${esc(first)},</p>` +
      `<p>${esc(senderName)} is asking for your <b>${esc(month)}</b> numbers for ${rows.length === 1 ? "this strategy goal" : `these ${rows.length} strategy goals`}:</p>` +
      `<ul>${items}</ul>` +
      (data.note ? `<p>${esc(data.note).replace(/\n/g, "<br>")}</p>` : "") +
      `<p>Open each goal in the QX Business Transformation App and click the month to enter the number. Thank you!</p>`;
    const r = await sendTeamsMessage(data.email, html);
    if (!r.ok) throw new Error(`Teams didn't accept the message (Power Automate returned ${r.status}${r.detail ? `: ${r.detail}` : ""}).`);
    if (data.remember && data.recipientName && !EMAIL_RE.test(data.recipientName)) {
      await db.query(
        `INSERT INTO public.strategy_owner_emails (name_key, display_name, email, updated_by, updated_at) VALUES ($1,$2,$3,$4,now())
         ON CONFLICT (name_key) DO UPDATE SET email = EXCLUDED.email, display_name = EXCLUDED.display_name, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [ownerKey(data.recipientName), data.recipientName, data.email, me]);
    }
    await db.query(
      `INSERT INTO public.strategy_reminders (sent_by, recipient_name, recipient_email, month_key, goal_ids) VALUES ($1,$2,$3,$4,$5::text[])`,
      [me, data.recipientName, data.email, data.monthKey, rows.map((x: any) => String(x.id))]);
    return { ok: true, sentTo: data.email, goals: rows.length };
  });
