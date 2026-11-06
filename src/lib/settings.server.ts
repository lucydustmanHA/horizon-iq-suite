
import { createServerFn } from "@tanstack/react-start";
import { getDb } from "./db.server";

export const $getSettings = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const db = await getDb();
    const { rows } = await db.query(
      "SELECT setting_key, option_value FROM public.app_settings ORDER BY setting_key, sort_order, option_value"
    );
    const out: Record<string, string[]> = {};
    for (const r of rows) {
      const k = String(r.setting_key);
      if (!out[k]) out[k] = [];
      out[k].push(String(r.option_value));
    }
    return out;
  } catch (err) {
    console.error("[DB] $getSettings failed:", err);
    return {};
  }
});

export const $upsertSettingOption = createServerFn({ method: "POST" })
  .validator((data: { key: string; value: string }) => data)
  .handler(async ({ data }) => {
    const db = await getDb();
    await db.query(
      "INSERT INTO public.app_settings (setting_key, option_value) VALUES ($1,$2) ON CONFLICT (setting_key, option_value) DO NOTHING",
      [data.key, data.value]
    );
    return { ok: true };
  });

export const $saveAppName = createServerFn({ method: "POST" })
  .validator((data: { name: string }) => data)
  .handler(async ({ data }) => {
    const db = await getDb();
    await db.query("DELETE FROM public.app_settings WHERE setting_key = 'app_name'");
    await db.query(
      "INSERT INTO public.app_settings (setting_key, option_value) VALUES ('app_name', $1)",
      [data.name]
    );
    return { ok: true };
  });

export const $removeSettingOption = createServerFn({ method: "POST" })
  .validator((data: { key: string; value: string }) => data)
  .handler(async ({ data }) => {
    const db = await getDb();
    await db.query(
      "DELETE FROM public.app_settings WHERE setting_key = $1 AND option_value = $2",
      [data.key, data.value]
    );
    return { ok: true };
  });
