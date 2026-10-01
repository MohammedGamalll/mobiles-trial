import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Context, Next } from "hono";
import { hashPassword, nowIso, randomToken, type AppBindings, type AppVars, type AuthUser, type AppDb } from "./helpers";

type HonoCtx = Context<{ Bindings: AppBindings; Variables: AppVars }>;

function cleanCredential(value: string) {
  return value.normalize("NFKC").replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "").trim();
}

export async function loginUser(db: AppDb, username: string, password: string, remember = false) {
  const name = cleanCredential(username);
  const secret = cleanCredential(password);
  const user = await db
    .prepare("SELECT * FROM users WHERE lower(username) = lower(?) AND active = 1 AND deleted_at IS NULL")
    .bind(name)
    .first<{
      id: number;
      username: string;
      password_hash: string;
      password_salt: string;
      full_name: string;
      phone: string | null;
      role_id: number;
      delivery_agent_id: number | null;
    }>();
  if (!user || !secret) return null;
  const hash = await hashPassword(secret, user.password_salt);
  if (hash !== user.password_hash) return null;
  const token = randomToken();
  const days = remember ? 30 : 1;
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  await db.batch([
    db.prepare("INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)").bind(user.id, token, expires),
    db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").bind(nowIso(), user.id),
  ]);
  return { token, expires, userId: user.id };
}

export async function loadUserFromToken(db: AppDb, token: string): Promise<AuthUser | null> {
  const row = await db
    .prepare(
      `SELECT u.id, u.username, u.full_name, u.phone, u.role_id, u.delivery_agent_id, r.slug as role_slug, IFNULL(u.ui_layout, 'modern') as ui_layout
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN roles r ON r.id = u.role_id
       WHERE s.token = ? AND s.expires_at > datetime('now') AND u.active = 1 AND u.deleted_at IS NULL`,
    )
    .bind(token)
    .first<{
      id: number;
      username: string;
      full_name: string;
      phone: string | null;
      role_id: number;
      delivery_agent_id: number | null;
      role_slug: string;
      ui_layout?: string | null;
    }>();
  if (!row) return null;
  const { results } = await db
    .prepare(
      `SELECT p.code FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id WHERE rp.role_id = ?`,
    )
    .bind(row.role_id)
    .all<{ code: string }>();
  return { ...row, permissions: results.map((r) => r.code) };
}

function requestHost(c: HonoCtx) {
  return (c.req.header("x-forwarded-host") || c.req.header("host") || "")
    .split(",")[0]
    .trim()
    .split(":")[0]
    .replace(/^www\./i, "")
    .toLowerCase();
}

function cookieSecure(c: HonoCtx) {
  const proto = (c.req.header("x-forwarded-proto") || "").split(",")[0].trim().toLowerCase();
  if (proto === "https") return true;
  if ((c.req.header("x-forwarded-ssl") || "").toLowerCase() === "on") return true;
  const host = requestHost(c);
  if (!host || host === "localhost" || host === "127.0.0.1") {
    try {
      return new URL(c.req.url).protocol === "https:";
    } catch {
      return false;
    }
  }
  return true;
}

export async function requireAuth(c: HonoCtx, next: Next) {
  if (c.req.method === "OPTIONS") {
    await next();
    return;
  }
  const header = c.req.header("authorization") || "";
  const bearer = header.match(/^Bearer\s+(\S+)/i)?.[1];
  const token = bearer || getCookie(c, "pixel_session");
  if (!token) return c.json({ error: "unauthorized" }, 401);
  const user = await loadUserFromToken(c.env.DB, token);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  c.set("user", user);
  await next();
}

export function requirePerm(...codes: string[]) {
  return async (c: HonoCtx, next: Next) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);
    if (user.role_slug === "admin") {
      await next();
      return;
    }
    const ok = codes.some((code) => user.permissions.includes(code));
    if (!ok) return c.json({ error: "forbidden", required: codes }, 403);
    await next();
  };
}

export function setSessionCookie(c: HonoCtx, token: string, remember = false) {
  const host = requestHost(c);
  const secure = cookieSecure(c);
  deleteCookie(c, "pixel_session", { path: "/" });
  if (host && host !== "localhost" && host !== "127.0.0.1") {
    deleteCookie(c, "pixel_session", { path: "/", domain: host });
    deleteCookie(c, "pixel_session", { path: "/", domain: `.${host}` });
  }
  setCookie(c, "pixel_session", token, {
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    secure,
    maxAge: (remember ? 30 : 1) * 24 * 60 * 60,
  });
}

export function clearSessionCookie(c: HonoCtx) {
  const host = requestHost(c);
  deleteCookie(c, "pixel_session", { path: "/" });
  if (host && host !== "localhost" && host !== "127.0.0.1") {
    deleteCookie(c, "pixel_session", { path: "/", domain: host });
    deleteCookie(c, "pixel_session", { path: "/", domain: `.${host}` });
  }
}

export async function destroySession(db: AppDb, token: string) {
  await db.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
}
