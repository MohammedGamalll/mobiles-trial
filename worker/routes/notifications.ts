import { Hono } from "hono";
import { applySearch, listParams, resolveDates } from "../lib/filters";
import type { AppBindings, AppVars } from "../lib/helpers";

export const notificationRoutes = new Hono<{ Bindings: AppBindings; Variables: AppVars }>();

notificationRoutes.get("/", async (c) => {
  const user = c.get("user");
  const p = listParams(new URL(c.req.url));
  const where = ["user_id = ?"];
  const params: (string | number)[] = [user.id];
  if (p.type) {
    where.push("type = ?");
    params.push(p.type);
  }
  if (p.read === "1") where.push("read_at IS NOT NULL");
  if (p.read === "0" || p.unread === "1") where.push("read_at IS NULL");
  if (p.module || p.entity_type) {
    where.push("IFNULL(entity_type,'') = ?");
    params.push(p.module || p.entity_type);
  }
  applySearch(where, params, p.q, ["title_ar", "title_en", "body_ar", "body_en"]);
  const { from, to } = resolveDates(p);
  if (from) {
    where.push("date(created_at) >= date(?)");
    params.push(from);
  }
  if (to) {
    where.push("date(created_at) <= date(?)");
    params.push(to);
  }
  const unread = await c.env.DB
    .prepare("SELECT COUNT(*) as n FROM notifications WHERE user_id = ? AND read_at IS NULL")
    .bind(user.id)
    .first<{ n: number }>();
  const { results } = await c.env.DB
    .prepare(`SELECT * FROM notifications WHERE ${where.join(" AND ")} ORDER BY id DESC LIMIT 80`)
    .bind(...params)
    .all();
  return c.json({ data: results, unread: Number(unread?.n || 0) });
});

notificationRoutes.put("/read-all", async (c) => {
  const user = c.get("user");
  await c.env.DB.prepare("UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL").bind(user.id).run();
  return c.json({ ok: true });
});

notificationRoutes.put("/:id/read", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  await c.env.DB
    .prepare("UPDATE notifications SET read_at = datetime('now') WHERE id = ? AND user_id = ?")
    .bind(id, user.id)
    .run();
  return c.json({ ok: true });
});

notificationRoutes.post("/read", async (c) => {
  const user = c.get("user");
  const b = await c.req.json<{ id?: number }>().catch(() => ({}) as { id?: number });
  if (b.id) {
    await c.env.DB
      .prepare("UPDATE notifications SET read_at = datetime('now') WHERE id = ? AND user_id = ?")
      .bind(Number(b.id), user.id)
      .run();
  } else {
    await c.env.DB.prepare("UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL").bind(user.id).run();
  }
  return c.json({ ok: true });
});
