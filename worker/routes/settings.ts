import { Hono } from "hono";
import { audit, getSettings, setSetting, type AppBindings, type AppVars } from "../lib/helpers";
import { requirePerm } from "../lib/auth";
import { parseMapsCoords, extractMapsUrl, coordsFromMapsHtml } from "../lib/maps";
import { ensureWhatsappTemplates, restoreWhatsappTemplates, slugTemplateCode, upsertWhatsappTemplate } from "../lib/whatsapp";

export const settingsRoutes = new Hono<{ Bindings: AppBindings; Variables: AppVars }>();

settingsRoutes.get("/", requirePerm("settings.view", "dashboard.view"), async (c) => {
  const settings = await getSettings(c.env.DB);
  const methods = await c.env.DB.prepare("SELECT * FROM payment_methods ORDER BY sort_order").all();
  await ensureWhatsappTemplates(c.env.DB);
  const templates = await c.env.DB.prepare("SELECT * FROM whatsapp_templates ORDER BY id").all();
  return c.json({ settings, payment_methods: methods.results, templates: templates.results });
});

settingsRoutes.get("/maps-coords", requirePerm("settings.edit", "settings.view"), async (c) => {
  const raw = String(new URL(c.req.url).searchParams.get("url") || "").trim();
  if (!raw) return c.json({ error: "missing_url" }, 400);
  const url = extractMapsUrl(raw);
  const direct = parseMapsCoords(url);
  if (direct) return c.json(direct);
  if (!/^https?:\/\//i.test(url)) return c.json({ error: "invalid_url" }, 400);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    const finalUrl = res.url || url;
    const fromFinal = parseMapsCoords(finalUrl);
    if (fromFinal) return c.json(fromFinal);
    const text = await res.text();
    const fromHtml = coordsFromMapsHtml(text.slice(0, 120000));
    if (fromHtml) return c.json(fromHtml);
  } catch {
    return c.json({ error: "lookup_failed" }, 400);
  }
  return c.json({ error: "no_coords" }, 400);
});

settingsRoutes.put("/", requirePerm("settings.edit"), async (c) => {
  const prev = await getSettings(c.env.DB);
  const b = await c.req.json<Record<string, string>>();
  const old_value: Record<string, string> = {};
  const new_value: Record<string, string> = {};
  for (const [k, v] of Object.entries(b)) {
    const next = String(v ?? "");
    const before = String(prev[k] ?? "");
    await setSetting(c.env.DB, k, next);
    if (before !== next) {
      old_value[k] = before;
      new_value[k] = next;
    }
  }
  await audit(c.env.DB, c.get("user"), "edit_settings", "settings", null, "Update settings", { old_value, new_value });
  return c.json({ ok: true });
});

settingsRoutes.post("/whatsapp-templates/restore", requirePerm("settings.edit"), async (c) => {
  await restoreWhatsappTemplates(c.env.DB);
  await audit(c.env.DB, c.get("user"), "edit_whatsapp_template", "whatsapp_template", null, "restore_defaults");
  const templates = await c.env.DB.prepare("SELECT * FROM whatsapp_templates ORDER BY id").all();
  return c.json({ ok: true, templates: templates.results });
});

settingsRoutes.post("/whatsapp-templates", requirePerm("settings.edit"), async (c) => {
  const b = await c.req.json<{
    code?: string;
    name_ar?: string;
    name_en?: string;
    body_ar?: string;
    body_en?: string;
    active?: number;
  }>();
  const code = slugTemplateCode(b.code || b.name_en || b.name_ar || "");
  const saved = await upsertWhatsappTemplate(c.env.DB, {
    code,
    name_ar: String(b.name_ar || "").trim() || code,
    name_en: String(b.name_en || "").trim() || String(b.name_ar || "").trim() || code,
    body_ar: String(b.body_ar || ""),
    body_en: String(b.body_en || ""),
    active: b.active === 0 ? 0 : 1,
  });
  await audit(c.env.DB, c.get("user"), "edit_whatsapp_template", "whatsapp_template", null, saved.code);
  return c.json({ ok: true, template: saved }, 201);
});

settingsRoutes.put("/whatsapp-templates/:code", requirePerm("settings.edit"), async (c) => {
  const code = slugTemplateCode(c.req.param("code"));
  const b = await c.req.json<{
    name_ar?: string;
    name_en?: string;
    body_ar?: string;
    body_en?: string;
    active?: number;
  }>();
  const saved = await upsertWhatsappTemplate(c.env.DB, {
    code,
    name_ar: String(b.name_ar || "").trim() || code,
    name_en: String(b.name_en || "").trim() || String(b.name_ar || "").trim() || code,
    body_ar: String(b.body_ar || ""),
    body_en: String(b.body_en || ""),
    active: b.active === 0 ? 0 : 1,
  });
  await audit(c.env.DB, c.get("user"), "edit_whatsapp_template", "whatsapp_template", null, saved.code);
  return c.json({ ok: true, template: saved });
});

settingsRoutes.put("/payment-methods/:id", requirePerm("settings.edit"), async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json<{ name_ar: string; name_en: string; active: number; sort_order: number }>();
  await c.env.DB.prepare("UPDATE payment_methods SET name_ar=?, name_en=?, active=?, sort_order=? WHERE id=?").bind(b.name_ar, b.name_en, b.active, b.sort_order, id).run();
  await audit(c.env.DB, c.get("user"), "edit_payment_method", "payment_method", id, b.name_ar);
  return c.json({ ok: true });
});

settingsRoutes.post("/payment-methods", requirePerm("settings.edit"), async (c) => {
  const b = await c.req.json<{ code: string; name_ar: string; name_en: string }>();
  const r = await c.env.DB.prepare("INSERT INTO payment_methods (code, name_ar, name_en, active, sort_order) VALUES (?, ?, ?, 1, 99)").bind(b.code, b.name_ar, b.name_en).run();
  await audit(c.env.DB, c.get("user"), "create_payment_method", "payment_method", r.meta.last_row_id, b.name_ar);
  return c.json({ id: r.meta.last_row_id }, 201);
});
