import type { AppDb } from "./db";
import type { AuthUser } from "./helpers";

export function isSuperAdmin(user: { id?: number | null; role_slug?: string | null } | null | undefined) {
  if (!user) return false;
  return user.role_slug === "admin" || Number(user.id) === 1;
}

export function userHasPerm(user: Pick<AuthUser, "id" | "role_slug" | "permissions"> | null | undefined, ...codes: string[]) {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  const perms = user.permissions || [];
  return codes.some((code) => perms.includes(code));
}

export async function permissionCodesForUser(db: AppDb, userId: number, roleSlug?: string | null) {
  if (roleSlug === "admin" || Number(userId) === 1) {
    const { results } = await db.prepare("SELECT code FROM permissions ORDER BY code").all<{ code: string }>();
    return results.map((r) => r.code);
  }
  const { results } = await db
    .prepare(
      `SELECT p.code FROM user_permissions up
       JOIN permissions p ON p.id = up.permission_id
       WHERE up.user_id = ?
       ORDER BY p.code`,
    )
    .bind(userId)
    .all<{ code: string }>();
  return results.map((r) => r.code);
}

export async function copyRolePermissionsToUser(db: AppDb, userId: number, roleId: number) {
  await db
    .prepare(
      `INSERT OR IGNORE INTO user_permissions (user_id, permission_id)
       SELECT ?, rp.permission_id FROM role_permissions rp WHERE rp.role_id = ?`,
    )
    .bind(userId, roleId)
    .run();
}

export async function replaceUserPermissions(db: AppDb, userId: number, permissionIds: number[]) {
  await db.prepare("DELETE FROM user_permissions WHERE user_id = ?").bind(userId).run();
  const ids = [...new Set(permissionIds.map((n) => Number(n)).filter((n) => n > 0))];
  if (!ids.length) return;
  await db.batch(ids.map((pid) => db.prepare("INSERT OR IGNORE INTO user_permissions (user_id, permission_id) VALUES (?, ?)").bind(userId, pid)));
}
