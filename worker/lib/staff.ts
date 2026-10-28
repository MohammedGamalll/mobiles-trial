import { audit, hashPassword, randomToken, todayIso, type AppDb, type AuthUser } from "./helpers";
import { copyRolePermissionsToUser } from "./user-permissions";

export const STAFF_KINDS = ["courier", "cashier", "warehouse", "accountant"] as const;
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
  status?: string;
  shift_id?: number | null;
  commission_rate?: number;
  area?: string;
  agent_role?: "delivery" | "sales" | "both";
  existing_agent_id?: number | null;
};

const KIND = {
  courier: { roleSlug: "delivery", workType: "delivery", agent: true, agentRole: "delivery" as const },
  cashier: { roleSlug: "sales", workType: "office", agent: false, agentRole: "delivery" as const },
  warehouse: { roleSlug: "warehouse", workType: "office", agent: false, agentRole: "delivery" as const },
  accountant: { roleSlug: "accountant", workType: "office", agent: false, agentRole: "delivery" as const },
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
    const staffStatus = raw.status === "inactive" ? "inactive" : "active";
    if (spec.agent && Number(raw.existing_agent_id || 0) > 0) {
      agentId = Number(raw.existing_agent_id);
      const existing = await tx.prepare("SELECT id FROM delivery_agents WHERE id = ? AND deleted_at IS NULL").bind(agentId).first();
      if (!existing) throw new Error("not_found");
      const agentCodeTaken = await tx
        .prepare("SELECT id FROM delivery_agents WHERE code = ? AND id <> ? AND deleted_at IS NULL")
        .bind(baseCode, agentId)
        .first();
      if (agentCodeTaken) throw new Error("code_taken");
      await tx
        .prepare("UPDATE delivery_agents SET name=?, code=?, phone=?, status=?, notes=?, role_type=?, commission_rate=?, area=? WHERE id=?")
        .bind(name, baseCode, phone || null, staffStatus, raw.notes || null, agentRole, Number(raw.commission_rate || 0), raw.area || null, agentId)
        .run();
    } else if (spec.agent) {
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
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        empCode,
        name,
        phone || null,
        raw.job_title || null,
        raw.department || null,
        raw.hire_date || todayIso(),
        staffStatus,
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

export async function updateStaff(db: AppDb, employeeId: number, raw: StaffInput, actor?: AuthUser | null) {
  const kind = STAFF_KINDS.includes(raw.kind) ? raw.kind : null;
  const name = String(raw.name || "").trim();
  if (!kind) throw new Error("invalid_kind");
  if (!name) throw new Error("missing_name");
  const spec = KIND[kind];
  const phone = String(raw.phone || "").trim();
  const code = String(raw.code || "").trim();
  if (!code) throw new Error("missing_fields");
  const role = await db.prepare("SELECT id FROM roles WHERE slug = ?").bind(spec.roleSlug).first<{ id: number }>();
  if (!role) throw new Error("missing_role");
  const emp = await db
    .prepare("SELECT id, user_id, delivery_agent_id FROM employees WHERE id = ? AND deleted_at IS NULL")
    .bind(employeeId)
    .first<{ id: number; user_id: number | null; delivery_agent_id: number | null }>();
  if (!emp) throw new Error("not_found");
  const codeTaken = await db
    .prepare("SELECT id FROM employees WHERE code = ? AND id <> ? AND deleted_at IS NULL")
    .bind(code, employeeId)
    .first();
  if (codeTaken) throw new Error("code_taken");

  return db.transaction(async (tx) => {
    let agentId: number | null = emp.delivery_agent_id || null;
    if (spec.agent) {
      const rate = Number(raw.commission_rate || 0);
      const area = raw.area || null;
      if (agentId) {
        await tx
          .prepare("UPDATE delivery_agents SET name=?, phone=?, notes=?, role_type=?, commission_rate=?, area=?, status='active' WHERE id=?")
          .bind(name, phone || null, raw.notes || null, raw.agent_role || spec.agentRole, rate, area, agentId)
          .run();
      } else {
        const agentCode = await uniqueCode(tx, "delivery_agents", code.startsWith("T-") ? code : `T-${code}`);
        const agent = await tx
          .prepare(
            "INSERT INTO delivery_agents (name, code, phone, status, notes, role_type, commission_rate, area) VALUES (?, ?, ?, 'active', ?, ?, ?, ?)",
          )
          .bind(name, agentCode, phone || null, raw.notes || null, raw.agent_role || spec.agentRole, rate, area)
          .run();
        agentId = agent.meta.last_row_id;
      }
    } else {
      agentId = null;
    }

    let userId = emp.user_id || null;
    const usernameWanted = String(raw.username || "").trim();
    if (userId) {
      if (usernameWanted) {
        const taken = await tx
          .prepare("SELECT id FROM users WHERE lower(username) = lower(?) AND id <> ? AND deleted_at IS NULL")
          .bind(usernameWanted, userId)
          .first();
        if (taken) throw new Error("username_taken");
        await tx.prepare("UPDATE users SET username=? WHERE id=?").bind(usernameWanted, userId).run();
      }
      const password = String(raw.password || "").trim();
      if (password) {
        const salt = randomToken().slice(0, 8);
        const hash = await hashPassword(password, salt);
        await tx.prepare("UPDATE users SET password_hash=?, password_salt=? WHERE id=?").bind(hash, salt, userId).run();
      }
      await tx
        .prepare("UPDATE users SET full_name=?, phone=?, role_id=?, delivery_agent_id=? WHERE id=?")
        .bind(name, phone || null, role.id, agentId, userId)
        .run();
      await tx.prepare("DELETE FROM user_permissions WHERE user_id = ?").bind(userId).run();
      await copyRolePermissionsToUser(tx, userId, role.id);
    }

    await tx
      .prepare(
        `UPDATE employees SET code=?, name=?, phone=?, job_title=?, department=?, hire_date=?, status=?, work_type=?, delivery_agent_id=?, basic_salary=?, allowances=?, national_id=?, notes=?, shift_id=?, updated_at=datetime('now') WHERE id=?`,
      )
      .bind(
        code,
        name,
        phone || null,
        raw.job_title || null,
        raw.department || null,
        raw.hire_date || null,
        raw.status || "active",
        spec.workType,
        agentId,
        Number(raw.basic_salary || 0),
        Number(raw.allowances || 0),
        raw.national_id || null,
        raw.notes || null,
        raw.shift_id || null,
        employeeId,
      )
      .run();
    await audit(tx, actor, "edit_staff", "employee", employeeId, name);
    return { employee_id: employeeId, user_id: userId, agent_id: agentId, username: usernameWanted, name };
  });
}
