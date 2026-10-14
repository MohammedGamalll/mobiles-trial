import type { StaffKind, StaffSaved } from "../components/StaffForm";
import { ApiError, get, post } from "./api";

const KIND_ROLE: Record<StaffKind, string> = {
  courier: "delivery",
  cashier: "sales",
  warehouse: "warehouse",
  accountant: "accountant",
  sales_rep: "sales",
};

export type StaffPayload = {
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
  agent_role?: string;
};

function missingRoute(err: unknown) {
  return err instanceof ApiError && (err.status === 404 || err.message === "not_found" || err.message === "api_unavailable");
}

function slugName(value: string) {
  return value.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ".").replace(/^\.+|\.+$/g, "") || "user";
}

function pickUnique(preferred: string, taken: string[]) {
  const lower = new Set(taken.map((x) => x.toLowerCase()));
  if (!lower.has(preferred.toLowerCase())) return preferred;
  for (let i = 2; i < 20; i++) {
    const next = `${preferred}-${i}`;
    if (!lower.has(next.toLowerCase())) return next;
  }
  return `${preferred}-${Date.now().toString().slice(-4)}`;
}

async function saveStaffLegacy(body: StaffPayload): Promise<StaffSaved> {
  const name = body.name.trim();
  const needsAgent = body.kind === "courier" || body.kind === "sales_rep";
  const suffix = Date.now().toString().slice(-6);
  const wantedCode = String(body.code || "").trim() || (needsAgent ? `T-${suffix}` : `E-${suffix}`);
  const wantedUser = String(body.username || "").trim() || slugName(name);
  const password = String(body.password || "").trim() || "1234";

  const rolesRes = await get<{ roles: { id: number; slug: string }[] }>("/api/roles");
  const role = rolesRes.roles.find((r) => r.slug === KIND_ROLE[body.kind]) || rolesRes.roles[0];
  if (!role) throw new ApiError("missing_role", 400);

  const [usersRes, empRes, agentsRes] = await Promise.all([
    get<{ data: { username: string }[] }>("/api/users").catch(() => ({ data: [] })),
    get<{ data: { code: string }[] }>("/api/hr/employees").catch(() => ({ data: [] })),
    needsAgent ? get<{ data: { code: string }[] }>("/api/delivery/agents").catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
  ]);

  const username = pickUnique(wantedUser, (usersRes.data || []).map((u) => u.username));
  if (String(body.username || "").trim() && username.toLowerCase() !== wantedUser.toLowerCase()) {
    throw new ApiError("username_taken", 409);
  }

  let agentId: number | null = null;
  if (needsAgent) {
    const agentCode = pickUnique(wantedCode, (agentsRes.data || []).map((a) => a.code));
    const agent = await post<{ id: number }>("/api/delivery/agents", {
      name,
      code: agentCode,
      phone: body.phone || "",
      notes: body.notes || "",
      role_type: body.agent_role || (body.kind === "sales_rep" ? "sales" : "delivery"),
      commission_rate: Number(body.commission_rate || 0),
      area: body.area || "",
    });
    agentId = agent.id;
  }

  const user = await post<{ id: number }>("/api/users", {
    username,
    password,
    full_name: name,
    phone: body.phone || "",
    role_id: role.id,
    delivery_agent_id: agentId || undefined,
  });

  const empCode = pickUnique(needsAgent ? `E-${wantedCode}` : wantedCode, (empRes.data || []).map((e) => e.code));
  const emp = await post<{ id: number }>("/api/hr/employees", {
    code: empCode,
    name,
    phone: body.phone || "",
    job_title: body.job_title || "",
    department: body.department || "",
    hire_date: body.hire_date,
    status: "active",
    work_type: body.kind === "courier" ? "delivery" : "office",
    user_id: user.id,
    delivery_agent_id: agentId,
    basic_salary: Number(body.basic_salary || 0),
    allowances: Number(body.allowances || 0),
    national_id: body.national_id || "",
    notes: body.notes || "",
    shift_id: body.shift_id || null,
  });

  return { employee_id: emp.id, user_id: user.id, agent_id: agentId, username, name };
}

export async function saveStaff(body: StaffPayload): Promise<StaffSaved> {
  try {
    return await post<StaffSaved>("/api/hr/staff", body);
  } catch (err) {
    if (!missingRoute(err)) throw err;
  }
  try {
    return await post<StaffSaved>("/api/staff", body);
  } catch (err) {
    if (!missingRoute(err)) throw err;
  }
  return saveStaffLegacy(body);
}
