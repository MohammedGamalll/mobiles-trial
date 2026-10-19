import { audit, hashPassword, randomToken, todayIso, type AppDb, type AuthUser } from "./helpers";
import { copyRolePermissionsToUser } from "./user-permissions";

export const STAFF_KINDS = ["courier", "cashier", "warehouse", "accountant", "sales_rep"] as const;
export type StaffKind = (typeof STAFF_KINDS)[number];

export type StaffInput = {
  kind: StaffKind;
  name: string;
  phone?: string;
  code?: string;
  username?: string;
  password?: string;
  job_title?: string;
  department?: string;
  hire_date?: string;
  basic_salary?: number;
  allowances?: number;
  national_id?: string;
  notes?: string;
  shift_id?: number | null;
  commission_rate?: number;
  area?: string;
  agent_role?: "delivery" | "sales" | "both";
};

const KIND = {
  courier: { roleSlug: "delivery", workType: "delivery", agent: true, agentRole: "delivery" as const },
  cashier: { roleSlug: "sales", workType: "office", agent: false, agentRole: "delivery" as const },
  warehouse: { roleSlug: "warehouse", workType: "office", agent: false, agentRole: "delivery" as const },
  accountant: { roleSlug: "accountant", workType: "office", agent: false, agentRole: "delivery" as const },
  sales_rep: { roleSlug: "sales", workType: "office", agent: true, agentRole: "sales" as const },
};

function slugName(value: string) {
  const ascii = value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ".")
    .replace(/^\.+|\.+$/g, "");
  return ascii || "user";
}

async function uniqueCode(db: AppDb, table: "employees" | "delivery_agents", preferred: string) {
  let code = preferred;
  for (let i = 0; i < 12; i++) {
    const hit = await db.prepare(`SELECT id FROM ${table} WHERE code = ? AND deleted_at IS NULL`).bind(code).first();
    if (!hit) return code;
    code = `${preferred}-${i + 2}`;
  }
  return `${preferred}-${Date.now().toString().slice(-4)}`;
}

async function uniqueUsername(db: AppDb, preferred: string) {
  let username = preferred;
  for (let i = 0; i < 12; i++) {
    const hit = await db.prepare("SELECT id FROM users WHERE lower(username) = lower(?) AND deleted_at IS NULL").bind(username).first();
    if (!hit) return username;
    username = `${preferred}${i + 2}`;
  }
  return `${preferred}${Date.now().toString().slice(-4)}`;
}

export async function createStaff(db: AppDb, raw: StaffInput, actor?: AuthUser | null) {
  const kind = STAFF_KINDS.includes(raw.kind) ? raw.kind : null;
  const name = String(raw.name || "").trim();
  if (!kind) throw new Error("invalid_kind");
  if (!name) throw new Error("missing_name");
  const spec = KIND[kind];
  const phone = String(raw.phone || "").trim();
  const suffix = Date.now().toString().slice(-6);
  const baseCode = String(raw.code || "").trim() || (spec.agent ? `T-${suffix}` : `E-${suffix}`);
  const usernameWanted = String(raw.username || "").trim() || slugName(name);
  const password = String(raw.password || "").trim() || "1234";
  const agentRole = raw.agent_role || spec.agentRole;

  const role = await db.prepare("SELECT id FROM roles WHERE slug = ?").bind(spec.roleSlug).first<{ id: number }>();
  if (!role) throw new Error("missing_role");

  return db.transaction(async (tx) => {
    let agentId: number | null = null;
    if (spec.agent) {
      const agentCode = await uniqueCode(tx, "delivery_agents", baseCode);
      const agent = await tx
        .prepare(
          "INSERT INTO delivery_agents (name, code, phone, status, notes, role_type, commission_rate, area) VALUES (?, ?, ?, 'active', ?, ?, ?, ?)",
        )
        .bind(name, agentCode, phone || null, raw.notes || null, agentRole, Number(raw.commission_rate || 0), raw.area || null)
        .run();
      agentId = agent.meta.last_row_id;
    }

    const username = await uniqueUsername(tx, usernameWanted);
    const takenExact = String(raw.username || "").trim();
    if (takenExact && username.toLowerCase() !== takenExact.toLowerCase()) throw new Error("username_taken");
    const salt = randomToken().slice(0, 8);
    const hash = await hashPassword(password, salt);
    const user = await tx
      .prepare("INSERT INTO users (username, password_hash, password_salt, full_name, phone, role_id, delivery_agent_id) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(username, hash, salt, name, phone || null, role.id, agentId)
      .run();
    const userId = user.meta.last_row_id;
    await copyRolePermissionsToUser(tx, userId, role.id);

    const empCode = await uniqueCode(tx, "employees", spec.agent ? `E-${baseCode}` : baseCode);
    const emp = await tx
      .prepare(
        `INSERT INTO employees (code, name, phone, job_title, department, hire_date, status, work_type, user_id, delivery_agent_id, basic_salary, allowances, national_id, notes, shift_id)
         VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        empCode,
        name,
        phone || null,
        raw.job_title || null,
        raw.department || null,
        raw.hire_date || todayIso(),
        spec.workType,
        userId,
        agentId,
        Number(raw.basic_salary || 0),
        Number(raw.allowances || 0),
        raw.national_id || null,
        raw.notes || null,
        raw.shift_id || null,
      )
      .run();

    await audit(tx, actor, "create_staff", "employee", emp.meta.last_row_id, `${name} / ${username}`);
    return {
      employee_id: emp.meta.last_row_id,
      user_id: userId,
      agent_id: agentId,
      username,
      code: empCode,
      name,
    };
  });
}
