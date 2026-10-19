import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { audit, hashPassword, randomToken, type AppBindings, type AppVars } from "../lib/helpers";
import { clearSessionCookie, destroySession, loadUserFromToken, loginUser, requireAuth, setSessionCookie } from "../lib/auth";

export const authRoutes = new Hono<{ Bindings: AppBindings; Variables: AppVars }>();

authRoutes.post("/login", async (c) => {
  let body: { username?: string; password?: string; remember?: boolean };
  try {
    body = await c.req.json<{ username?: string; password?: string; remember?: boolean }>();
  } catch {
    return c.json({ error: "missing_credentials" }, 400);
  }
  if (!body.username || !body.password) return c.json({ error: "missing_credentials" }, 400);
  const remember = body.remember === true;
  const result = await loginUser(c.env.DB, body.username, body.password, remember);
  if (!result) return c.json({ error: "invalid_credentials" }, 401);
  setSessionCookie(c, result.token, remember);
  try {
    const { maybeAutoBackup } = await import("../lib/backup-ops");
    await maybeAutoBackup(c.env.DB, c.env.BACKUP_DIR, result.userId, "login");
  } catch {
    /* never block login */
  }
  const user = await loadUserFromToken(c.env.DB, result.token);
  if (user) {
    await audit(c.env.DB, user, "login", "user", user.id, user.username);
  }
  return c.json({ user, token: result.token });
});

authRoutes.post("/logout", async (c) => {
  const header = c.req.header("authorization") || "";
  const bearer = header.match(/^Bearer\s+(\S+)/i)?.[1];
  const token = bearer || getCookie(c, "pixel_session");
  const sessionUser = token ? await loadUserFromToken(c.env.DB, token) : null;
  if (token) await destroySession(c.env.DB, token);
  if (sessionUser) await audit(c.env.DB, sessionUser, "logout", "user", sessionUser.id, sessionUser.username);
  clearSessionCookie(c);
  return c.json({ ok: true });
});

authRoutes.get("/me", requireAuth, async (c) => {
  const user = c.get("user");
  const role = await c.env.DB.prepare("SELECT name_ar, name_en, slug FROM roles WHERE id = ?").bind(user.role_id).first();
  try {
    const { maybeAutoBackup } = await import("../lib/backup-ops");
    await maybeAutoBackup(c.env.DB, c.env.BACKUP_DIR, user.id, "enter");
  } catch {
    /* ignore */
  }
  return c.json({ user: { ...user, role } });
});

authRoutes.put("/prefs", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ ui_layout?: string }>();
  const layout = body.ui_layout === "classic_easy" ? "classic_easy" : "modern";
  try {
    await c.env.DB.prepare("UPDATE users SET ui_layout = ?, updated_at = datetime('now') WHERE id = ?").bind(layout, user.id).run();
  } catch {
    return c.json({ ok: true, ui_layout: layout, persisted: false });
  }
  return c.json({ ok: true, ui_layout: layout, persisted: true });
});

authRoutes.post("/password", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ current?: string; next?: string }>();
  if (!body.current || !body.next) return c.json({ error: "missing" }, 400);
  const row = await c.env.DB.prepare("SELECT password_hash, password_salt FROM users WHERE id = ?").bind(user.id).first<{ password_hash: string; password_salt: string }>();
  if (!row) return c.json({ error: "not_found" }, 404);
  const cur = await hashPassword(body.current, row.password_salt);
  if (cur !== row.password_hash) return c.json({ error: "invalid_current" }, 400);
  const salt = randomToken().slice(0, 8);
  const hash = await hashPassword(body.next, salt);
  await c.env.DB.prepare("UPDATE users SET password_hash = ?, password_salt = ?, updated_at = datetime('now') WHERE id = ?").bind(hash, salt, user.id).run();
  await audit(c.env.DB, user, "change_password", "user", user.id, "Password changed");
  return c.json({ ok: true });
});
