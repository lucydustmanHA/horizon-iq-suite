import { createServerFn } from "@tanstack/react-start";
import { getDb } from "./db.server";

// ── Get current user from Databricks forwarded headers ──────────────────────
export const $getMe = createServerFn({ method: "GET" })
  .handler(async () => {
    try {
      // Nitro 3 / H3 v2: useEvent() accesses the current request via AsyncLocalStorage
      const { useEvent } = await import("h3");
      const event = useEvent();
      const hdr = (name: string) => {
        // H3 v2 event.headers is a web Headers object; fall back to node req headers
        if (event.headers?.get) return event.headers.get(name) || "";
        const raw = (event.node?.req?.headers as Record<string, string | string[] | undefined>)?.[name];
        return Array.isArray(raw) ? raw[0] : (raw || "");
      };
      const email = hdr("x-forwarded-email")
        || hdr("x-forwarded-preferred-username")
        || hdr("x-forwarded-user")
        || "";
      return { email };
    } catch (e) {
      console.warn("[user.server] Could not read request headers:", e);
      return { email: "" };
    }
  });

// ── Upsert user into app_users table ─────────────────────────────────────────
export const $upsertUser = createServerFn({ method: "POST" })
  .validator((data: { email: string; displayName: string }) => data)
  .handler(async ({ data }) => {
    if (!data.email) return;
    const db = await getDb();
    await db.query(
      "INSERT INTO public.app_users (email, display_name) VALUES (" + "$1, " + "$2) ON CONFLICT (email) DO UPDATE SET last_seen_at = NOW()",
      [data.email, data.displayName]
    );
  });

// ── List all known users (for dropdowns) ────────────────────────────────────
export const $listUsers = createServerFn({ method: "GET" })
  .handler(async () => {
    const db = await getDb();
    const { rows } = await db.query("SELECT email, display_name FROM public.app_users ORDER BY display_name");
    return rows as { email: string; display_name: string }[];
  });
