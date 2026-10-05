import type { AppDb } from "./db";

export type NotifyPayload = {
  type: string;
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
  entityType?: string;
  entityId?: number;
  actionUrl?: string;
};

export async function sendNotification(db: AppDb, userId: number | null | undefined, payload: NotifyPayload) {
  const id = Number(userId || 0);
  if (!id) return;
  await db
    .prepare(
      `INSERT INTO notifications (user_id, type, title_ar, title_en, body_ar, body_en, entity_type, entity_id, action_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      payload.type,
      payload.titleAr,
      payload.titleEn,
      payload.bodyAr,
      payload.bodyEn,
      payload.entityType ?? null,
      payload.entityId ?? null,
      payload.actionUrl ?? null,
    )
    .run();
}

export async function userIdForAgent(db: AppDb, deliveryAgentId: number | null | undefined) {
  const agentId = Number(deliveryAgentId || 0);
  if (!agentId) return 0;
  const row = await db
    .prepare("SELECT id FROM users WHERE delivery_agent_id = ? AND active = 1 AND deleted_at IS NULL ORDER BY id LIMIT 1")
    .bind(agentId)
    .first<{ id: number }>();
  return Number(row?.id || 0);
}

export async function userIdForEmployee(db: AppDb, employeeId: number | null | undefined) {
  const id = Number(employeeId || 0);
  if (!id) return 0;
  const row = await db
    .prepare("SELECT user_id FROM employees WHERE id = ? AND deleted_at IS NULL")
    .bind(id)
    .first<{ user_id: number | null }>();
  return Number(row?.user_id || 0);
}

async function notifyUsers(db: AppDb, userIds: number[], payload: NotifyPayload) {
  const seen = new Set<number>();
  for (const id of userIds) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    await sendNotification(db, id, payload);
  }
}

export async function notifyAdmins(db: AppDb, payload: NotifyPayload) {
  const { results } = await db
    .prepare(
      `SELECT u.id FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE r.slug = 'admin' AND u.active = 1 AND u.deleted_at IS NULL`,
    )
    .all<{ id: number }>();
  await notifyUsers(
    db,
    results.map((r) => Number(r.id)),
    payload,
  );
}

export async function notifyAccountants(db: AppDb, payload: NotifyPayload) {
  const { results } = await db
    .prepare(
      `SELECT DISTINCT u.id FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN role_permissions rp ON rp.role_id = u.role_id
       LEFT JOIN permissions p ON p.id = rp.permission_id
       WHERE u.active = 1 AND u.deleted_at IS NULL
         AND (r.slug = 'accountant' OR p.code = 'delivery.settle')`,
    )
    .all<{ id: number }>();
  await notifyUsers(
    db,
    results.map((r) => Number(r.id)),
    payload,
  );
}

export async function recentlyNotified(db: AppDb, type: string, entityId: number) {
  const row = await db
    .prepare(
      `SELECT id FROM notifications
       WHERE type = ? AND entity_id = ? AND created_at >= datetime('now','-6 hours')
       LIMIT 1`,
    )
    .bind(type, entityId)
    .first<{ id: number }>();
  return Boolean(row?.id);
}

export async function safeNotify(fn: () => Promise<void>) {
  try {
    await fn();
  } catch {
    /* never fail the business action */
  }
}
