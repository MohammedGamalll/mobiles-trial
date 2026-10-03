import type { AppDb } from "./db";

export type { AppDb };
export type D1Database = AppDb;

export type AppBindings = {
  DB: AppDb;
  APP_NAME: string;
  BACKUP_DIR?: string;
  UPLOAD_DIR?: string;
};

export type AuthUser = {
  id: number;
  username: string;
  full_name: string;
  phone: string | null;
  role_id: number;
  role_slug: string;
  delivery_agent_id: number | null;
  permissions: string[];
  ui_layout?: string | null;
};

export type AppVars = { user: AuthUser };

export function nowIso() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

export function todayIso() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function round2(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function like(q: string) {
  return `%${q.replace(/%/g, "").replace(/_/g, "").trim()}%`;
}

export async function hashPassword(password: string, salt: string) {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function nextNumber(db: AppDb, name: string) {
  const row = await db.prepare("SELECT prefix, next_number FROM sequences WHERE name = ?").bind(name).first<{ prefix: string; next_number: number }>();
  if (!row) throw new Error(`Missing sequence ${name}`);
  const number = `${row.prefix}-${String(row.next_number).padStart(4, "0")}`;
  await db.prepare("UPDATE sequences SET next_number = next_number + 1 WHERE name = ?").bind(name).run();
  return number;
}

export function jsonSnap(value: unknown) {
  if (value == null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

export async function audit(
  db: AppDb,
  user: AuthUser | null | undefined,
  action: string,
  entityType: string | null,
  entityId: number | null,
  details: string,
  extra?: { old_value?: unknown; new_value?: unknown },
) {
  await db
    .prepare("INSERT INTO audit_logs (user_id, user_name, action, entity_type, entity_id, details, old_value, new_value) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(user?.id ?? null, user?.full_name ?? null, action, entityType, entityId, details, jsonSnap(extra?.old_value), jsonSnap(extra?.new_value))
    .run();
}

export async function notify(
  db: AppDb,
  type: string,
  titleAr: string,
  titleEn: string,
  bodyAr: string,
  bodyEn: string,
  entityType?: string,
  entityId?: number,
) {
  await db
    .prepare(
      "INSERT INTO notifications (user_id, type, title_ar, title_en, body_ar, body_en, entity_type, entity_id) VALUES (NULL, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(type, titleAr, titleEn, bodyAr, bodyEn, entityType ?? null, entityId ?? null)
    .run();
}

export async function getSettings(db: AppDb) {
  const { results } = await db.prepare("SELECT key, value FROM settings").all<{ key: string; value: string }>();
  const map: Record<string, string> = {};
  for (const r of results) map[r.key] = r.value;
  return map;
}

export async function setSetting(db: AppDb, key: string, value: string) {
  await db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(key, value).run();
}

export function paginate(url: URL) {
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const pageSize = Math.min(10000, Math.max(1, Number(url.searchParams.get("pageSize") || 20)));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function isDupEntry(err: unknown) {
  const e = err as { errno?: number; code?: string; message?: string };
  const msg = String(e?.message || "").toUpperCase();
  return e?.errno === 1062 || e?.code === "ER_DUP_ENTRY" || msg.includes("UNIQUE");
}
