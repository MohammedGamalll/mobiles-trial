import { Hono } from "hono";
import { audit, getSettings, setSetting, type AppBindings, type AppVars } from "../lib/helpers";
import { requirePerm } from "../lib/auth";

export const settingsRoutes = new Hono<{ Bindings: AppBindings; Variables: AppVars }>();

settingsRoutes.get("/", requirePerm("settings.view", "dashboard.view"), async (c) => {
  const settings = await getSettings(c.env.DB);
  const methods = await c.env.DB.prepare("SELECT * FROM payment_methods ORDER BY sort_order").all();
  const templates = await c.env.DB.prepare("SELECT * FROM whatsapp_templates").all();
  return c.json({ settings, payment_methods: methods.results, templates: templates.results });
});

settingsRoutes.put("/", requirePerm("settings.edit"), async (c) => {
  const prev = await getSettings(c.env.DB);
  const b = await c.req.json<Record<string, string>>();
  for (const [k, v] of Object.entries(b)) {
    await setSetting(c.env.DB, k, String(v ?? ""));
  }
  await audit(c.env.DB, c.get("user"), "edit_settings", "settings", null, "Update settings", { old_value: prev, new_value: b });
  return c.json({ ok: true });
});

settingsRoutes.put("/whatsapp-templates/:code", requirePerm("settings.edit"), async (c) => {
  const code = c.req.param("code");
  const b = await c.req.json<{ body_ar: string; body_en: string; active?: number }>();
  await c.env.DB
    .prepare("UPDATE whatsapp_templates SET body_ar=?, body_en=?, active=?, updated_at=datetime('now') WHERE code=?")
    .bind(b.body_ar, b.body_en, b.active === 0 ? 0 : 1, code)
    .run();
  return c.json({ ok: true });
});

settingsRoutes.put("/payment-methods/:id", requirePerm("settings.edit"), async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json<{ name_ar: string; name_en: string; active: number; sort_order: number }>();
  await c.env.DB.prepare("UPDATE payment_methods SET name_ar=?, name_en=?, active=?, sort_order=? WHERE id=?").bind(b.name_ar, b.name_en, b.active, b.sort_order, id).run();
  return c.json({ ok: true });
});

settingsRoutes.post("/payment-methods", requirePerm("settings.edit"), async (c) => {
  const b = await c.req.json<{ code: string; name_ar: string; name_en: string }>();
  const r = await c.env.DB.prepare("INSERT INTO payment_methods (code, name_ar, name_en, active, sort_order) VALUES (?, ?, ?, 1, 99)").bind(b.code, b.name_ar, b.name_en).run();
  return c.json({ id: r.meta.last_row_id }, 201);
});
