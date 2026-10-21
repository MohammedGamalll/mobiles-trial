import { Hono } from "hono";
import { audit, cairoNow, cairoToday, getSettings, paginate, round2, todayIso, type AppBindings, type AppVars, type AppDb, type AuthUser } from "../lib/helpers";
import { requirePerm } from "../lib/auth";
import { haversineMeters, workplaceFromSettings } from "../lib/geo";
import { postAdvanceJournal, postAdvanceSettleJournal, postBonusJournal, postSalaryPayoutJournal, reverseJournal } from "../lib/ledger";
import { isSuperAdmin, userHasPerm } from "../lib/user-permissions";
import { applyDate, applyEq, applyRange, applySearch, listParams, resolveDates } from "../lib/filters";
import { notifyAdmins, safeNotify, sendNotification, userIdForEmployee } from "../lib/notifications";
import { accruedBonusTotal, applyAdvanceDeduction, netPay } from "../lib/invoice-math";
import { createStaff, STAFF_KINDS, type StaffInput } from "../lib/staff";

export const hrRoutes = new Hono<{ Bindings: AppBindings; Variables: AppVars }>();

type Employee = {
  id: number;
  code: string;
  name: string;
  phone: string | null;
  job_title: string | null;
  department: string | null;
  hire_date: string | null;
  status: string;
  work_type: string;
  user_id: number | null;
  delivery_agent_id: number | null;
  basic_salary: number;
  allowances: number;
  national_id: string | null;
  notes: string | null;
  shift_id: number | null;
};

type SessionRow = {
  id: number;
  employee_id: number;
  work_date: string;
  clock_in_at: string;
  clock_out_at: string | null;
  outside_seconds: number;
  currently_outside: number;
  outside_started_at: string | null;
  work_seconds: number;
  late: number;
  status: string;
};

async function settleAdvancesForEmployee(db: AppDb, employeeId: number, amount: number, runId: number, userId?: number | null) {
  const { results } = await db
    .prepare("SELECT id, remaining FROM salary_advances WHERE employee_id = ? AND status = 'open' ORDER BY date, id")
    .bind(employeeId)
    .all<{ id: number; remaining: number }>();
  const plan = applyAdvanceDeduction(results, amount);
  let taken = 0;
  for (const row of plan) {
    if (row.take <= 0) continue;
    taken = round2(taken + row.take);
    await db
      .prepare("UPDATE salary_advances SET remaining = ?, status = ?, payroll_run_id = ? WHERE id = ?")
      .bind(row.remaining, row.settled ? "settled" : "open", runId, row.id)
      .run();
  }
  if (taken > 0) {
    await postAdvanceSettleJournal(db, {
      runId,
      employeeId,
      amount: taken,
      date: todayIso(),
      userId,
    });
  }
}

async function employeeForUser(db: AppDb, userId: number) {
  return db.prepare("SELECT * FROM employees WHERE user_id = ? AND deleted_at IS NULL").bind(userId).first<Employee>();
}

function wallMs(value: string) {
  return Date.parse(String(value).trim().replace(" ", "T").replace(/Z$/, ""));
}

function minutesPastShift(clockInAt: string, shiftStart: string) {
  const t = clockInAt.slice(11, 16);
  const [sh, sm] = String(shiftStart || "09:00").split(":").map(Number);
  const [ch, cm] = t.split(":").map(Number);
  if (!Number.isFinite(sh) || !Number.isFinite(ch)) return 0;
  return Math.max(0, ch * 60 + cm - (sh * 60 + sm));
}

function isLate(clockInAt: string, shiftStart: string) {
  return minutesPastShift(clockInAt, shiftStart) > 15;
}

function seesAllPayroll(user: AuthUser) {
  return user.role_slug === "admin" || user.id === 1 || user.permissions.includes("hr.payroll");
}

function cleanStamp(value: string) {
  const s = String(value || "").trim().replace("T", " ").slice(0, 19);
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? s : null;
}

function inclusiveDays(from: string, to: string) {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.max(0, Math.round((b - a) / 86400000) + 1);
}

function overlapDays(from: string, to: string, month: string, through?: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const start = `${month}-01`;
  let end = `${month}-${String(last).padStart(2, "0")}`;
  if (through && through.startsWith(month) && through < end) end = through;
  const a = from > start ? from : start;
  const b = to < end ? to : end;
  if (a > b) return 0;
  return inclusiveDays(a, b);
}

function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

async function shiftForEmployee(db: AppDb, emp: { shift_id?: number | null }) {
  if (!emp.shift_id) return null;
  return db.prepare("SELECT * FROM work_shifts WHERE id = ?").bind(emp.shift_id).first<{
    id: number;
    start_time: string;
    end_time: string;
    expected_hours: number;
    overtime_rate: number;
  }>();
}

function fridayCount(month: string, through?: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let end = last;
  if (through && through.startsWith(month)) {
    const day = Number(through.slice(8, 10));
    if (day > 0) end = Math.min(last, day);
  }
  let n = 0;
  for (let d = 1; d <= end; d++) {
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCDay() === 5) n++;
  }
  return { days: end, fridays: n, expected: end - n };
}

async function computeEmployeeSlip(db: AppDb, e: Employee, month: string, manualDeduction = 0) {
  const today = todayIso();
  const through = today.slice(0, 7) === month ? today : undefined;
  const { expected } = fridayCount(month, through);
  const { from, to } = monthBounds(month);
  const until = through && through < to ? through : to;
  const stats = await db
    .prepare(
      `SELECT COUNT(*) as present, SUM(late) as late, SUM(late_minutes) as late_minutes, SUM(outside_seconds) as outside
       FROM attendance_sessions WHERE employee_id = ? AND work_date BETWEEN ? AND ? AND status = 'closed'`,
    )
    .bind(e.id, from, until)
    .first<{ present: number; late: number; late_minutes: number; outside: number }>();
  const present = Number(stats?.present || 0);
  const { results: leaves } = await db
    .prepare("SELECT type, date_from, date_to FROM leave_requests WHERE employee_id = ? AND status = 'approved' AND date_from <= ? AND date_to >= ?")
    .bind(e.id, until, from)
    .all<{ type: string; date_from: string; date_to: string }>();
  let paidLeave = 0;
  let unpaidLeave = 0;
  for (const lv of leaves) {
    const days = overlapDays(lv.date_from, lv.date_to, month, until);
    if (lv.type === "unpaid") unpaidLeave += days;
    else paidLeave += days;
  }
  const absent = Math.max(0, expected - present - paidLeave);
  const ot = await db
    .prepare("SELECT COALESCE(SUM(amount),0) as n FROM overtime_entries WHERE employee_id = ? AND date BETWEEN ? AND ?")
    .bind(e.id, from, until)
    .first<{ n: number }>();
  const adv = await db
    .prepare("SELECT COALESCE(SUM(COALESCE(remaining, amount)),0) as n FROM salary_advances WHERE employee_id = ? AND status = 'open'")
    .bind(e.id)
    .first<{ n: number }>();
  const overtime = round2(Number(ot?.n || 0));
  const { results: bonusRows } = await db
    .prepare("SELECT amount, paid_immediately FROM employee_bonuses WHERE employee_id = ? AND month = ?")
    .bind(e.id, month)
    .all<{ amount: number; paid_immediately: number }>();
  const bonus = accruedBonusTotal(bonusRows);
  const basic = Number(e.basic_salary || 0);
  const allowances = Number(e.allowances || 0);
  const absenceAuto = expected > 0 ? round2(((basic + allowances) / expected) * absent) : 0;
  const pay = netPay({
    basic,
    allowances,
    overtime,
    bonus,
    advances: Number(adv?.n || 0),
    absenceDeduction: 0,
    manualDeduction,
  });
  return {
    present,
    absent,
    expected,
    late: Number(stats?.late || 0),
    lateMinutes: Number(stats?.late_minutes || 0),
    outsideMinutes: Math.round(Number(stats?.outside || 0) / 60),
    paidLeave,
    unpaidLeave,
    overtime,
    bonus: pay.bonus,
    advances: pay.advances,
    absenceAuto,
    deductions: pay.manual,
    manual: pay.manual,
    net: pay.net,
  };
}

type DeductionLine = { id: number; payslip_id: number; kind: string; amount: number; reason: string; edited: number };

async function loadDeductionLines(db: AppDb, slipIds: number[]) {
  if (!slipIds.length) return [] as DeductionLine[];
  const { results } = await db
    .prepare(`SELECT * FROM payslip_deductions WHERE payslip_id IN (${slipIds.map(() => "?").join(",")}) ORDER BY id`)
    .bind(...slipIds)
    .all<DeductionLine>();
  return results;
}

async function syncSlipTotals(db: AppDb, emp: Employee, calc: Awaited<ReturnType<typeof computeEmployeeSlip>>, slipId: number) {
  const reason = `غياب ${calc.absent} يوم`;
  const existing = await db
    .prepare("SELECT id, edited FROM payslip_deductions WHERE payslip_id = ? AND kind = 'absence' ORDER BY id LIMIT 1")
    .bind(slipId)
    .first<{ id: number; edited: number }>();
  if (!existing) {
    await db
      .prepare("INSERT INTO payslip_deductions (payslip_id, kind, amount, reason, edited) VALUES (?, 'absence', ?, ?, 0)")
      .bind(slipId, calc.absenceAuto, reason)
      .run();
  } else if (!Number(existing.edited)) {
    await db.prepare("UPDATE payslip_deductions SET amount = ?, reason = ? WHERE id = ?").bind(calc.absenceAuto, reason, existing.id).run();
  }
  const lines = await loadDeductionLines(db, [slipId]);
  const absence = round2(lines.filter((l) => l.kind === "absence").reduce((s, l) => s + Number(l.amount || 0), 0));
  const manual = round2(lines.filter((l) => l.kind === "manual").reduce((s, l) => s + Number(l.amount || 0), 0));
  const pay = netPay({
    basic: Number(emp.basic_salary || 0),
    allowances: Number(emp.allowances || 0),
    overtime: calc.overtime,
    bonus: calc.bonus,
    advances: calc.advances,
    absenceDeduction: absence,
    manualDeduction: manual,
  });
  await db
    .prepare(
      `UPDATE payslips SET basic=?, allowances=?, present_days=?, absent_days=?, late_days=?, outside_minutes=?,
       deductions=?, net=?, overtime=?, advances=?, leave_days=?, unpaid_days=?, manual_deduction=?, bonus=? WHERE id=?`,
    )
    .bind(
      emp.basic_salary,
      emp.allowances,
      calc.present,
      calc.absent,
      calc.late,
      calc.outsideMinutes,
      round2(absence + manual),
      pay.net,
      calc.overtime,
      calc.advances,
      calc.paidLeave,
      calc.unpaidLeave,
      manual,
      calc.bonus,
      slipId,
    )
    .run();
  return { pay, lines: await loadDeductionLines(db, [slipId]), absence, manual };
}

async function insertPayslip(db: AppDb, runId: number, emp: Employee, month: string) {
  const calc = await computeEmployeeSlip(db, emp, month);
  await db
    .prepare(
      `INSERT INTO payslips (run_id, employee_id, basic, allowances, present_days, absent_days, late_days, outside_minutes, deductions, net, overtime, advances, leave_days, unpaid_days, bonus, paid_amount, advances_settled, manual_deduction)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0)`,
    )
    .bind(
      runId,
      emp.id,
      emp.basic_salary,
      emp.allowances,
      calc.present,
      calc.absent,
      calc.late,
      calc.outsideMinutes,
      calc.deductions,
      calc.net,
      calc.overtime,
      calc.advances,
      calc.paidLeave,
      calc.unpaidLeave,
      calc.bonus,
    )
    .run();
  const row = await db.prepare("SELECT id FROM payslips WHERE run_id = ? AND employee_id = ? ORDER BY id DESC LIMIT 1").bind(runId, emp.id).first<{ id: number }>();
  if (row) await syncSlipTotals(db, emp, calc, row.id);
}

async function ensureSlipsForActiveEmployees(db: AppDb, run: { id: number; month: string; status: string }) {
  if (run.status === "paid") return;
  const { results: emps } = await db.prepare("SELECT * FROM employees WHERE deleted_at IS NULL AND status = 'active'").all<Employee>();
  const { results: slips } = await db.prepare("SELECT employee_id FROM payslips WHERE run_id = ?").bind(run.id).all<{ employee_id: number }>();
  const have = new Set(slips.map((s) => s.employee_id));
  for (const emp of emps) {
    if (have.has(emp.id)) continue;
    await insertPayslip(db, run.id, emp, run.month);
  }
}

async function refreshUnpaidSlips(db: AppDb, run: { id: number; month: string; status: string }) {
  if (run.status === "paid") return;
  await ensureSlipsForActiveEmployees(db, run);
  const { results: slips } = await db
    .prepare("SELECT id, employee_id, paid_amount, manual_deduction FROM payslips WHERE run_id = ?")
    .bind(run.id)
    .all<{ id: number; employee_id: number; paid_amount: number; manual_deduction: number }>();
  const { results: emps } = await db.prepare("SELECT * FROM employees WHERE deleted_at IS NULL").all<Employee>();
  const byId = new Map(emps.map((e) => [e.id, e]));
  for (const s of slips) {
    if (Number(s.paid_amount || 0) > 0.005) continue;
    const emp = byId.get(s.employee_id);
    if (!emp) continue;
    const calc = await computeEmployeeSlip(db, emp, run.month, 0);
    await syncSlipTotals(db, emp, calc, s.id);
  }
}

async function refreshUnpaidSlipsForEmployee(db: AppDb, employeeId: number) {
  const emp = await db.prepare("SELECT * FROM employees WHERE id = ? AND deleted_at IS NULL").bind(employeeId).first<Employee>();
  if (!emp) return;
  const { results: slips } = await db
    .prepare(
      `SELECT p.id, p.paid_amount, p.manual_deduction, r.month
       FROM payslips p JOIN payroll_runs r ON r.id = p.run_id
       WHERE p.employee_id = ? AND r.status != 'paid'`,
    )
    .bind(employeeId)
    .all<{ id: number; paid_amount: number; manual_deduction: number; month: string }>();
  for (const s of slips) {
    if (Number(s.paid_amount || 0) > 0.005) continue;
    const calc = await computeEmployeeSlip(db, emp, s.month, 0);
    await syncSlipTotals(db, emp, calc, s.id);
  }
}

hrRoutes.post("/staff", requirePerm("hr.manage", "users.manage", "settings.edit", "sales.create"), async (c) => {
  const b = await c.req.json<StaffInput>();
  try {
    const created = await createStaff(c.env.DB, b, c.get("user"));
    return c.json(created, 201);
  } catch (e) {
    const code = e instanceof Error ? e.message : "error";
    if (code === "missing_name" || code === "invalid_kind") return c.json({ error: code }, 400);
    if (code === "username_taken") return c.json({ error: code }, 409);
    throw e;
  }
});

hrRoutes.get("/staff-kinds", requirePerm("hr.manage", "users.manage", "settings.edit", "sales.create"), async (c) => {
  return c.json({ data: STAFF_KINDS });
});

hrRoutes.get("/employees", requirePerm("hr.view", "hr.manage", "hr.payroll"), async (c) => {
  const url = new URL(c.req.url);
  const p = listParams(url);
  const where = ["e.deleted_at IS NULL"];
  const params: (string | number)[] = [];
  applySearch(where, params, p.q, ["e.code", "e.name", "IFNULL(e.phone,'')", "IFNULL(e.job_title,'')", "IFNULL(e.department,'')"]);
  applyEq(where, params, "e.department", p.department);
  applyEq(where, params, "e.job_title", p.job_title);
  applyEq(where, params, "e.status", p.status);
  applyEq(where, params, "e.work_type", p.work_type);
  applyEq(where, params, "e.shift_id", p.shift_id, true);
  applyDate(where, params, "e.hire_date", { ...p, period: p.hire_period || p.period, from: p.hire_from || p.from, to: p.hire_to || p.to, day: p.hire_date || p.day });
  const { results } = await c.env.DB
    .prepare(
      `SELECT e.*, u.username, da.name as agent_name, da.code as agent_code, s.name as shift_name, s.start_time as shift_start,
              COALESCE((SELECT SUM(COALESCE(sa.remaining, sa.amount)) FROM salary_advances sa WHERE sa.employee_id = e.id AND sa.status = 'open'), 0) as open_advances
       FROM employees e
       LEFT JOIN users u ON u.id = e.user_id
       LEFT JOIN delivery_agents da ON da.id = e.delivery_agent_id
       LEFT JOIN work_shifts s ON s.id = e.shift_id
       WHERE ${where.join(" AND ")} ORDER BY e.code`,
    )
    .bind(...params)
    .all();
  return c.json({ data: results });
});

hrRoutes.get("/employees/:id/sheet", requirePerm("hr.view", "hr.manage", "hr.payroll"), async (c) => {
  const id = Number(c.req.param("id"));
  const month = /^\d{4}-\d{2}$/.test(c.req.query("month") || "") ? String(c.req.query("month")) : cairoToday().slice(0, 7);
  const emp = await c.env.DB
    .prepare(
      `SELECT e.*, s.name as shift_name FROM employees e LEFT JOIN work_shifts s ON s.id = e.shift_id WHERE e.id = ? AND e.deleted_at IS NULL`,
    )
    .bind(id)
    .first<Employee & { shift_name?: string | null }>();
  if (!emp) return c.json({ error: "not_found" }, 404);
  const calc = await computeEmployeeSlip(c.env.DB, emp, month, 0);
  const slip = await c.env.DB
    .prepare(
      `SELECT p.* FROM payslips p JOIN payroll_runs r ON r.id = p.run_id WHERE p.employee_id = ? AND r.month = ? ORDER BY p.id DESC LIMIT 1`,
    )
    .bind(id, month)
    .first<{ id: number; paid_amount?: number }>();
  if (slip && Number(slip.paid_amount || 0) <= 0.005) await syncSlipTotals(c.env.DB, emp, calc, slip.id);
  const lines = slip ? await loadDeductionLines(c.env.DB, [slip.id]) : [];
  const { results: advances } = await c.env.DB
    .prepare("SELECT * FROM salary_advances WHERE employee_id = ? AND status = 'open' ORDER BY id")
    .bind(id)
    .all();
  const { results: leaves } = await c.env.DB
    .prepare("SELECT * FROM leave_requests WHERE employee_id = ? AND status = 'approved' AND date_from LIKE ? ORDER BY date_from")
    .bind(id, `${month}%`)
    .all();
  return c.json({
    data: {
      employee: emp,
      month,
      calc,
      slip,
      deductions_lines: lines.length ? lines : [{ id: 0, kind: "absence", amount: calc.absenceAuto, reason: `غياب ${calc.absent} يوم`, edited: 0 }],
      advances,
      leaves,
    },
  });
});

hrRoutes.post("/employees", requirePerm("hr.manage"), async (c) => {
  const b = await c.req.json<Partial<Employee> & { code: string; name: string }>();
  if (!b.code || !b.name) return c.json({ error: "missing_fields" }, 400);
  const r = await c.env.DB
    .prepare(
      `INSERT INTO employees (code, name, phone, job_title, department, hire_date, status, work_type, user_id, delivery_agent_id, basic_salary, allowances, national_id, notes, shift_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      b.code,
      b.name,
      b.phone || null,
      b.job_title || null,
      b.department || null,
      b.hire_date || todayIso(),
      b.status || "active",
      b.work_type || "office",
      b.user_id || null,
      b.delivery_agent_id || null,
      Number(b.basic_salary || 0),
      Number(b.allowances || 0),
      b.national_id || null,
      b.notes || null,
      b.shift_id || null,
    )
    .run();
  await audit(c.env.DB, c.get("user"), "create_employee", "employee", r.meta.last_row_id, b.name);
  return c.json({ id: r.meta.last_row_id }, 201);
});

hrRoutes.put("/employees/:id", requirePerm("hr.manage"), async (c) => {
  const id = Number(c.req.param("id"));
  const prev = await c.env.DB.prepare("SELECT name, job_title, basic_salary, allowances, status, shift_id FROM employees WHERE id = ?").bind(id).first();
  const b = await c.req.json<Partial<Employee>>();
  await c.env.DB
    .prepare(
      `UPDATE employees SET code=?, name=?, phone=?, job_title=?, department=?, hire_date=?, status=?, work_type=?, user_id=?, delivery_agent_id=?, basic_salary=?, allowances=?, national_id=?, notes=?, shift_id=?, updated_at=datetime('now') WHERE id=?`,
    )
    .bind(
      b.code,
      b.name,
      b.phone || null,
      b.job_title || null,
      b.department || null,
      b.hire_date || null,
      b.status || "active",
      b.work_type || "office",
      b.user_id || null,
      b.delivery_agent_id || null,
      Number(b.basic_salary || 0),
      Number(b.allowances || 0),
      b.national_id || null,
      b.notes || null,
      b.shift_id || null,
      id,
    )
    .run();
  await audit(c.env.DB, c.get("user"), "edit_employee", "employee", id, b.name || String(id), {
    old_value: prev,
    new_value: { name: b.name, job_title: b.job_title, basic_salary: b.basic_salary, allowances: b.allowances, status: b.status, shift_id: b.shift_id },
  });
  return c.json({ ok: true });
});

hrRoutes.delete("/employees/:id", requirePerm("hr.manage"), async (c) => {
  const id = Number(c.req.param("id"));
  await c.env.DB.prepare("UPDATE employees SET deleted_at = datetime('now'), status = 'inactive' WHERE id = ?").bind(id).run();
  await audit(c.env.DB, c.get("user"), "delete_employee", "employee", id, "Soft delete employee");
  return c.json({ ok: true });
});

hrRoutes.get("/me", requirePerm("attendance.own", "hr.view"), async (c) => {
  const emp = await employeeForUser(c.env.DB, c.get("user").id);
  if (!emp) return c.json({ data: { employee: null, session: null, workplace: workplaceFromSettings(await getSettings(c.env.DB)) } });
  const session = await c.env.DB
    .prepare("SELECT * FROM attendance_sessions WHERE employee_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1")
    .bind(emp.id)
    .first();
  const settings = await getSettings(c.env.DB);
  const shift = await shiftForEmployee(c.env.DB, emp);
  return c.json({ data: { employee: emp, session, shift, workplace: workplaceFromSettings(settings) } });
});

hrRoutes.get("/workplace", requirePerm("attendance.own", "hr.view", "settings.view"), async (c) => {
  return c.json({ data: workplaceFromSettings(await getSettings(c.env.DB)) });
});

hrRoutes.post("/attendance/clock-in", requirePerm("attendance.own"), async (c) => {
  const emp = await employeeForUser(c.env.DB, c.get("user").id);
  if (!emp) return c.json({ error: "no_employee" }, 400);
  if (emp.status !== "active") return c.json({ error: "inactive" }, 400);
  const open = await c.env.DB
    .prepare("SELECT id FROM attendance_sessions WHERE employee_id = ? AND status = 'open'")
    .bind(emp.id)
    .first();
  if (open) return c.json({ error: "already_open" }, 400);
  const b = await c.req.json<{ lat: number; lng: number }>();
  if (b.lat == null || b.lng == null) return c.json({ error: "gps_required" }, 400);
  const wp = workplaceFromSettings(await getSettings(c.env.DB));
  if (!wp.lat || !wp.lng) return c.json({ error: "workplace_missing" }, 400);
  const dist = haversineMeters(b.lat, b.lng, wp.lat, wp.lng);
  if (dist > wp.meters) return c.json({ error: "outside_geofence", distance: Math.round(dist), meters: wp.meters }, 400);
  const now = cairoNow();
  const shift = await shiftForEmployee(c.env.DB, emp);
  const lateMin = minutesPastShift(now, shift?.start_time || wp.shiftStart);
  const late = lateMin > 15 ? 1 : 0;
  const r = await c.env.DB
    .prepare(
      `INSERT INTO attendance_sessions (employee_id, work_date, clock_in_at, clock_in_lat, clock_in_lng, distance_in, late, late_minutes, approval_status, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'open')`,
    )
    .bind(emp.id, cairoToday(), now, b.lat, b.lng, round2(dist), late, lateMin)
    .run();
  const sid = r.meta.last_row_id;
  await c.env.DB
    .prepare("INSERT INTO attendance_events (session_id, employee_id, type, lat, lng, distance_m) VALUES (?, ?, 'in', ?, ?, ?)")
    .bind(sid, emp.id, b.lat, b.lng, round2(dist))
    .run();
  await audit(c.env.DB, c.get("user"), "clock_in", "employee", emp.id, `Clock in ${Math.round(dist)}m`);
  await safeNotify(() => notifyAdmins(c.env.DB, {
    type: "attendance",
    titleAr: "الموظف وصل",
    titleEn: "Employee arrived",
    bodyAr: `${emp.name} — ${now.slice(11, 16)} — ${late ? `متأخر ${lateMin} د` : "في المعاد"} — ${Math.round(dist)} م`,
    bodyEn: `${emp.name} — ${now.slice(11, 16)} — ${late ? `late ${lateMin} min` : "on time"} — ${Math.round(dist)} m`,
    entityType: "attendance",
    entityId: sid,
    actionUrl: `/hr/attendance?session=${sid}`,
  }));
  const session = await c.env.DB.prepare("SELECT * FROM attendance_sessions WHERE id = ?").bind(sid).first();
  return c.json({ data: { session, distance: round2(dist) } }, 201);
});

hrRoutes.post("/attendance/clock-out", requirePerm("attendance.own"), async (c) => {
  const emp = await employeeForUser(c.env.DB, c.get("user").id);
  if (!emp) return c.json({ error: "no_employee" }, 400);
  const session = await c.env.DB
    .prepare("SELECT * FROM attendance_sessions WHERE employee_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1")
    .bind(emp.id)
    .first<SessionRow>();
  if (!session) return c.json({ error: "no_open_shift" }, 400);
  const b = await c.req.json<{ lat?: number; lng?: number }>();
  const now = cairoNow();
  let outside = session.outside_seconds;
  if (session.currently_outside && session.outside_started_at) {
    outside += Math.max(0, (wallMs(now) - wallMs(session.outside_started_at)) / 1000);
  }
  const start = wallMs(session.clock_in_at);
  const end = wallMs(now);
  const work = Math.max(0, Math.round((end - start) / 1000 - outside));
  const dist = b.lat != null && b.lng != null ? haversineMeters(b.lat, b.lng, (await workplaceFromSettings(await getSettings(c.env.DB))).lat, (await workplaceFromSettings(await getSettings(c.env.DB))).lng) : null;
  await c.env.DB
    .prepare(
      `UPDATE attendance_sessions SET clock_out_at=?, clock_out_lat=?, clock_out_lng=?, outside_seconds=?, currently_outside=0, outside_started_at=NULL, work_seconds=?, status='closed' WHERE id=?`,
    )
    .bind(now, b.lat ?? null, b.lng ?? null, Math.round(outside), work, session.id)
    .run();
  await c.env.DB
    .prepare("INSERT INTO attendance_events (session_id, employee_id, type, lat, lng, distance_m) VALUES (?, ?, 'out', ?, ?, ?)")
    .bind(session.id, emp.id, b.lat ?? null, b.lng ?? null, dist != null ? round2(dist) : null)
    .run();
  const shift = await shiftForEmployee(c.env.DB, emp);
  const expected = Number(shift?.expected_hours || 8) * 3600;
  const extraSec = work - expected;
  if (extraSec >= 15 * 60) {
    const exists = await c.env.DB
      .prepare("SELECT id FROM overtime_entries WHERE employee_id = ? AND date = ? AND source = 'attendance'")
      .bind(emp.id, session.work_date)
      .first();
    if (!exists) {
      const hours = round2(extraSec / 3600);
      const rate = Number(shift?.overtime_rate || 1.5);
      const hourly = Number(emp.basic_salary || 0) / 30 / Number(shift?.expected_hours || 8);
      const amount = round2(hours * hourly * rate);
      await c.env.DB
        .prepare(
          `INSERT INTO overtime_entries (employee_id, date, hours, rate, amount, source, notes, created_by)
           VALUES (?, ?, ?, ?, ?, 'attendance', 'إضافي من الحضور', ?)`,
        )
        .bind(emp.id, session.work_date, hours, rate, amount, c.get("user").id)
        .run();
    }
  }
  await audit(c.env.DB, c.get("user"), "clock_out", "employee", emp.id, `Work ${work}s`);
  return c.json({ ok: true, work_seconds: work, outside_seconds: Math.round(outside) });
});

hrRoutes.post("/attendance/ping", requirePerm("attendance.own"), async (c) => {
  const emp = await employeeForUser(c.env.DB, c.get("user").id);
  if (!emp) return c.json({ error: "no_employee" }, 400);
  const session = await c.env.DB
    .prepare("SELECT * FROM attendance_sessions WHERE employee_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1")
    .bind(emp.id)
    .first<SessionRow>();
  if (!session) return c.json({ error: "no_open_shift" }, 400);
  const b = await c.req.json<{ lat: number; lng: number }>();
  if (b.lat == null || b.lng == null) return c.json({ error: "gps_required" }, 400);
  const wp = workplaceFromSettings(await getSettings(c.env.DB));
  const dist = haversineMeters(b.lat, b.lng, wp.lat, wp.lng);
  const now = cairoNow();
  let outside = session.outside_seconds;
  let currently = session.currently_outside;
  let started = session.outside_started_at;
  let event: string | null = null;
  if (emp.work_type !== "delivery") {
    const inside = dist <= wp.meters;
    if (!inside && !currently) {
      currently = 1;
      started = now;
      event = "left_zone";
    } else if (inside && currently) {
      if (started) {
        outside += Math.max(0, (wallMs(now) - wallMs(started)) / 1000);
      }
      currently = 0;
      started = null;
      event = "return_zone";
    }
    await c.env.DB
      .prepare("UPDATE attendance_sessions SET outside_seconds=?, currently_outside=?, outside_started_at=? WHERE id=?")
      .bind(Math.round(outside), currently, started, session.id)
      .run();
    if (event) {
      await c.env.DB
        .prepare("INSERT INTO attendance_events (session_id, employee_id, type, lat, lng, distance_m) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(session.id, emp.id, event, b.lat, b.lng, round2(dist))
        .run();
    }
  }
  const updated = await c.env.DB.prepare("SELECT * FROM attendance_sessions WHERE id = ?").bind(session.id).first();
  return c.json({ data: { session: updated, distance: round2(dist), outside: dist > wp.meters, skipped: emp.work_type === "delivery" } });
});

hrRoutes.get("/attendance", requirePerm("hr.view", "attendance.own", "hr.payroll"), async (c) => {
  const url = new URL(c.req.url);
  const p = listParams(url);
  const user = c.get("user");
  const dates = resolveDates(p);
  const from = dates.from || todayIso();
  const to = dates.to || todayIso();
  const employeeId = p.employee_id;
  const where = ["s.work_date BETWEEN ? AND ?"];
  const params: (string | number)[] = [from, to];
  const canAll = user.role_slug === "admin" || user.permissions.includes("hr.view") || user.permissions.includes("hr.payroll");
  if (!canAll) {
    const emp = await employeeForUser(c.env.DB, user.id);
    if (!emp) return c.json({ data: [] });
    where.push("s.employee_id = ?");
    params.push(emp.id);
  } else if (employeeId) {
    where.push("s.employee_id = ?");
    params.push(Number(employeeId));
  }
  applySearch(where, params, p.q, ["e.name", "e.code", "IFNULL(e.phone,'')"]);
  applyEq(where, params, "e.department", p.department);
  applyEq(where, params, "e.job_title", p.job_title);
  applyEq(where, params, "e.work_type", p.work_type);
  applyEq(where, params, "e.shift_id", p.shift_id, true);
  applyEq(where, params, "s.status", p.status);
  if (p.late === "1") where.push("s.late = 1");
  if (p.present === "1") where.push("s.status IN ('open','closed')");
  if (p.absent === "1") where.push("s.status = 'absent'");
  if (p.overtime === "1") where.push("s.work_seconds > 8*3600");
  if (p.early_out === "1") where.push("s.clock_out_at IS NOT NULL AND s.work_seconds < 7*3600");
  if (p.geofence === "in") where.push("s.currently_outside = 0");
  if (p.geofence === "out") where.push("s.currently_outside = 1");
  const { results } = await c.env.DB
    .prepare(
      `SELECT s.*, e.name as employee_name, e.code as employee_code, e.work_type, e.department, e.job_title
       FROM attendance_sessions s JOIN employees e ON e.id = s.employee_id
       WHERE ${where.join(" AND ")} ORDER BY s.clock_in_at DESC LIMIT 400`,
    )
    .bind(...params)
    .all();
  return c.json({ data: results });
});

hrRoutes.put("/attendance/:id", requirePerm("hr.manage", "hr.payroll"), async (c) => {
  const id = Number(c.req.param("id"));
  const row = await c.env.DB.prepare("SELECT * FROM attendance_sessions WHERE id = ?").bind(id).first<SessionRow & { approval_status?: string; late_minutes?: number; admin_notes?: string | null }>();
  if (!row) return c.json({ error: "not_found" }, 404);
  const b = await c.req.json<{
    part?: "in" | "out";
    approval_status?: string;
    late?: number | boolean;
    late_minutes?: number;
    admin_notes?: string;
    clock_in_at?: string;
    clock_out_at?: string | null;
  }>();
  const allowed = ["pending", "approved", "rejected"];
  const requested = String(b.approval_status || "").trim().toLowerCase();
  const approval = allowed.includes(requested) ? requested : row.approval_status || "pending";
  const part = b.part === "out" ? "out" : "in";
  if (part === "out") {
    const clockOut = b.clock_out_at ? cleanStamp(b.clock_out_at) : row.clock_out_at;
    if (!clockOut) return c.json({ error: "missing_fields" }, 400);
    const clockIn = row.clock_in_at;
    const work = Math.max(0, Math.round((wallMs(clockOut) - wallMs(clockIn)) / 1000 - Number(row.outside_seconds || 0)));
    await c.env.DB
      .prepare("UPDATE attendance_sessions SET clock_out_at=?, work_seconds=?, status='closed', out_approval_status=? WHERE id=?")
      .bind(clockOut, work, approval, id)
      .run();
    await audit(c.env.DB, c.get("user"), "attendance_review_out", "attendance", id, approval);
  } else {
    const clockIn = b.clock_in_at ? cleanStamp(b.clock_in_at) : row.clock_in_at;
    if (!clockIn) return c.json({ error: "missing_fields" }, 400);
    const late = b.late == null ? row.late : b.late ? 1 : 0;
    const lateMinutes = b.late_minutes == null ? Number(row.late_minutes || 0) : Math.max(0, Math.round(Number(b.late_minutes) || 0));
    let work = row.work_seconds;
    if (row.clock_out_at) {
      work = Math.max(0, Math.round((wallMs(row.clock_out_at) - wallMs(clockIn)) / 1000 - Number(row.outside_seconds || 0)));
    }
    await c.env.DB
      .prepare(
        `UPDATE attendance_sessions SET clock_in_at=?, work_seconds=?, late=?, late_minutes=?, approval_status=?, admin_notes=?, work_date=? WHERE id=?`,
      )
      .bind(clockIn, work, late, lateMinutes, approval, b.admin_notes ?? row.admin_notes ?? null, clockIn.slice(0, 10), id)
      .run();
    await audit(c.env.DB, c.get("user"), "attendance_review", "attendance", id, approval);
  }
  const updated = await c.env.DB.prepare("SELECT * FROM attendance_sessions WHERE id = ?").bind(id).first();
  return c.json({ data: updated });
});

hrRoutes.get("/attendance/:id/events", requirePerm("hr.view", "attendance.own"), async (c) => {
  const id = Number(c.req.param("id"));
  const { results } = await c.env.DB
    .prepare("SELECT * FROM attendance_events WHERE session_id = ? ORDER BY id")
    .bind(id)
    .all();
  return c.json({ data: results });
});

hrRoutes.get("/me/pay", requirePerm("attendance.own", "hr.view", "hr.payroll"), async (c) => {
  const emp = await employeeForUser(c.env.DB, c.get("user").id);
  if (!emp) return c.json({ data: null });
  const month = /^\d{4}-\d{2}$/.test(c.req.query("month") || "") ? String(c.req.query("month")) : cairoToday().slice(0, 7);
  const calc = await computeEmployeeSlip(c.env.DB, emp, month);
  let slip = await c.env.DB
    .prepare(
      `SELECT p.* FROM payslips p JOIN payroll_runs r ON r.id = p.run_id
       WHERE p.employee_id = ? AND r.month = ? ORDER BY p.id DESC LIMIT 1`,
    )
    .bind(emp.id, month)
    .first<{ id: number; basic: number; allowances: number; bonus: number; advances: number; manual_deduction: number; deductions: number; net: number; paid_amount: number; present_days: number; absent_days: number; late_days: number; leave_days: number; unpaid_days: number }>();
  if (slip && Number(slip.paid_amount || 0) <= 0.005) {
    await syncSlipTotals(c.env.DB, emp, calc, slip.id);
    slip = await c.env.DB.prepare("SELECT * FROM payslips WHERE id = ?").bind(slip.id).first<typeof slip>();
  }
  const { results: bonuses } = await c.env.DB
    .prepare("SELECT * FROM employee_bonuses WHERE employee_id = ? AND month = ? ORDER BY id DESC")
    .bind(emp.id, month)
    .all();
  const lines = slip ? await loadDeductionLines(c.env.DB, [Number((slip as { id?: number }).id || 0)].filter((n) => n > 0)) : [];
  const absence = round2(lines.filter((l) => l.kind === "absence").reduce((s, l) => s + Number(l.amount || 0), 0) || (slip ? 0 : calc.absenceAuto));
  const manual = round2(lines.filter((l) => l.kind === "manual").reduce((s, l) => s + Number(l.amount || 0), 0));
  const shownLines = lines.length ? lines : [{ id: 0, kind: "absence", amount: calc.absenceAuto, reason: `غياب ${calc.absent} يوم`, edited: 0 }];
  const basic = Number(slip?.basic ?? emp.basic_salary ?? 0);
  const allowances = Number(slip?.allowances ?? emp.allowances ?? 0);
  const bonus = Number(slip?.bonus ?? calc.bonus ?? 0);
  const advances = Number(slip?.advances ?? calc.advances ?? 0);
  const deductions = slip ? Number((slip as { deductions?: number }).deductions ?? manual + absence) : round2(calc.absenceAuto);
  const net = Number(slip?.net ?? netPay({
    basic, allowances, overtime: calc.overtime, bonus: calc.bonus, advances: calc.advances, absenceDeduction: calc.absenceAuto, manualDeduction: 0,
  }).net);
  const paid = Number(slip?.paid_amount || 0);
  return c.json({
    data: {
      employee: { id: emp.id, name: emp.name, code: emp.code, job_title: emp.job_title, department: emp.department },
      month,
      basic,
      allowances,
      bonus,
      advances,
      deductions,
      absence,
      manual,
      present: Number(slip && (slip as { present_days?: number }).present_days != null ? (slip as { present_days?: number }).present_days : calc.present),
      absent: Number((slip as { absent_days?: number } | null)?.absent_days ?? calc.absent),
      late: Number((slip as { late_days?: number } | null)?.late_days ?? calc.late),
      lateMinutes: calc.lateMinutes,
      paidLeave: Number((slip as { leave_days?: number } | null)?.leave_days ?? calc.paidLeave),
      unpaidLeave: Number((slip as { unpaid_days?: number } | null)?.unpaid_days ?? calc.unpaidLeave),
      overtime: Number(calc.overtime || 0),
      net,
      paid,
      remaining: round2(Math.max(0, net - paid)),
      bonuses,
      deductions_lines: shownLines,
    },
  });
});

hrRoutes.get("/bonuses", requirePerm("hr.payroll", "hr.view", "attendance.own"), async (c) => {
  const user = c.get("user");
  const month = c.req.query("month") || "";
  const where = ["1=1"];
  const params: (string | number)[] = [];
  if (/^\d{4}-\d{2}$/.test(month)) {
    where.push("b.month = ?");
    params.push(month);
  }
  if (!seesAllPayroll(user)) {
    const emp = await employeeForUser(c.env.DB, user.id);
    if (!emp) return c.json({ data: [] });
    where.push("b.employee_id = ?");
    params.push(emp.id);
  }
  const { results } = await c.env.DB
    .prepare(
      `SELECT b.*, e.name as employee_name, e.code as employee_code
       FROM employee_bonuses b JOIN employees e ON e.id = b.employee_id
       WHERE ${where.join(" AND ")} ORDER BY b.id DESC LIMIT 200`,
    )
    .bind(...params)
    .all();
  return c.json({ data: results });
});

hrRoutes.post("/bonuses", requirePerm("hr.payroll"), async (c) => {
  const b = await c.req.json<{ employee_id: number; amount: number; reason?: string; date?: string; month?: string; cash_account_id?: number; paid_immediately?: number | boolean }>();
  const amount = round2(Number(b.amount || 0));
  const employeeId = Number(b.employee_id || 0);
  if (!(amount > 0) || !employeeId) return c.json({ error: "missing_fields" }, 400);
  const emp = await c.env.DB.prepare("SELECT id, name FROM employees WHERE id = ? AND deleted_at IS NULL").bind(employeeId).first<{ id: number; name: string }>();
  if (!emp) return c.json({ error: "not_found" }, 404);
  const date = b.date || cairoToday();
  const month = /^\d{4}-\d{2}$/.test(b.month || "") ? String(b.month) : date.slice(0, 7);
  const immediate = b.paid_immediately ? 1 : 0;
  try {
    const id = await c.env.DB.transaction(async (tx) => {
      const r = await tx
        .prepare(
          `INSERT INTO employee_bonuses (employee_id, amount, reason, date, month, cash_account_id, paid_immediately, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(employeeId, amount, b.reason || null, date, month, b.cash_account_id || null, immediate, c.get("user").id)
        .run();
      const bonusId = r.meta.last_row_id;
      if (immediate) {
        const journalId = await postBonusJournal(tx, {
          id: bonusId,
          amount,
          date,
          description: `مكافأة ${emp.name}${b.reason ? ` — ${b.reason}` : ""}`,
          userId: c.get("user").id,
          cashAccountId: b.cash_account_id || null,
        });
        await tx.prepare("UPDATE employee_bonuses SET journal_id = ? WHERE id = ?").bind(journalId, bonusId).run();
      }
      return bonusId;
    });
    if (!immediate) await refreshUnpaidSlipsForEmployee(c.env.DB, employeeId);
    await audit(c.env.DB, c.get("user"), "bonus", "employee", employeeId, `${amount} ${immediate ? "now" : "accrued"}`);
    return c.json({ id }, 201);
  } catch (e) {
    if ((e as Error).message === "ledger") return c.json({ error: "ledger" }, 400);
    throw e;
  }
});

hrRoutes.get("/payroll", requirePerm("hr.payroll", "hr.view", "attendance.own"), async (c) => {
  const p = listParams(new URL(c.req.url));
  const where = ["1=1"];
  const params: (string | number)[] = [];
  applyEq(where, params, "status", p.status);
  if (p.month) {
    where.push("month = ?");
    params.push(p.month);
  }
  if (p.year) {
    where.push("month LIKE ?");
    params.push(`${p.year}-%`);
  }
  const { results } = await c.env.DB.prepare(`SELECT * FROM payroll_runs WHERE ${where.join(" AND ")} ORDER BY month DESC`).bind(...params).all();
  return c.json({ data: results });
});

hrRoutes.get("/payroll/:id", requirePerm("hr.payroll", "hr.view", "attendance.own"), async (c) => {
  const id = Number(c.req.param("id"));
  const user = c.get("user");
  const run = await c.env.DB.prepare("SELECT * FROM payroll_runs WHERE id = ?").bind(id).first<{ id: number; month: string; status: string }>();
  if (!run) return c.json({ error: "not_found" }, 404);
  const all = seesAllPayroll(user);
  if (all) await refreshUnpaidSlips(c.env.DB, run);
  const { results } = await c.env.DB
    .prepare(
      `SELECT p.*, e.name as employee_name, e.code as employee_code, e.job_title, e.department, e.user_id
       FROM payslips p JOIN employees e ON e.id = p.employee_id WHERE p.run_id = ? ORDER BY e.code`,
    )
    .bind(id)
    .all<{ employee_id: number; user_id: number | null }>();
  let slips: Array<Record<string, unknown>> = results;
  const lineRows = await loadDeductionLines(c.env.DB, results.map((s) => Number((s as { id?: number }).id || 0)).filter((n) => n > 0));
  const linesBySlip = new Map<number, DeductionLine[]>();
  for (const line of lineRows) {
    const list = linesBySlip.get(Number(line.payslip_id)) || [];
    list.push(line);
    linesBySlip.set(Number(line.payslip_id), list);
  }
  slips = results.map((s) => ({ ...s, deductions_lines: linesBySlip.get(Number((s as { id?: number }).id || 0)) || [] }));
  if (!all) {
    const emp = await employeeForUser(c.env.DB, user.id);
    if (emp) await refreshUnpaidSlipsForEmployee(c.env.DB, emp.id);
    slips = emp ? results.filter((s) => s.employee_id === emp.id) : [];
    if (emp) {
      const fresh = await c.env.DB
        .prepare(
          `SELECT p.*, e.name as employee_name, e.code as employee_code, e.job_title, e.department
           FROM payslips p JOIN employees e ON e.id = p.employee_id WHERE p.run_id = ? AND p.employee_id = ?`,
        )
        .bind(id, emp.id)
        .all();
      const freshLines = await loadDeductionLines(c.env.DB, fresh.results.map((s) => Number((s as { id?: number }).id || 0)).filter((n) => n > 0));
      slips = fresh.results.map((s) => ({ ...s, deductions_lines: freshLines.filter((l) => Number(l.payslip_id) === Number((s as { id?: number }).id)) }));
    }
  }
  return c.json({ data: { run, slips } });
});

hrRoutes.post("/payroll", requirePerm("hr.payroll"), async (c) => {
  const b = await c.req.json<{ month: string; notes?: string }>();
  if (!/^\d{4}-\d{2}$/.test(b.month || "")) return c.json({ error: "invalid_month" }, 400);
  const exists = await c.env.DB.prepare("SELECT id, month, status FROM payroll_runs WHERE month = ?").bind(b.month).first<{
    id: number;
    month: string;
    status: string;
  }>();
  if (exists) {
    if (exists.status === "paid") return c.json({ error: "month_exists", id: exists.id }, 400);
    await ensureSlipsForActiveEmployees(c.env.DB, exists);
    await refreshUnpaidSlips(c.env.DB, exists);
    return c.json({ id: exists.id });
  }
  const ins = await c.env.DB
    .prepare("INSERT INTO payroll_runs (month, status, notes, created_by) VALUES (?, 'draft', ?, ?)")
    .bind(b.month, b.notes || null, c.get("user").id)
    .run();
  const runId = ins.meta.last_row_id;
  const { results: emps } = await c.env.DB
    .prepare("SELECT * FROM employees WHERE deleted_at IS NULL AND status = 'active'")
    .all<Employee>();
  for (const e of emps) {
    await insertPayslip(c.env.DB, runId, e, b.month);
  }
  await audit(c.env.DB, c.get("user"), "payroll_run", "payroll", runId, b.month);
  return c.json({ id: runId }, 201);
});

hrRoutes.post("/payroll/:id/deduct", requirePerm("hr.payroll"), async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json<{ payslip_id?: number; line_id?: number; kind?: string; amount?: number; reason?: string; reset_absence?: boolean; remove?: boolean }>();
  const run = await c.env.DB.prepare("SELECT * FROM payroll_runs WHERE id = ?").bind(id).first<{ id: number; month: string; status: string }>();
  if (!run) return c.json({ error: "not_found" }, 404);
  if (run.status === "paid") return c.json({ error: "already_paid" }, 400);
  const slipId = Number(b.payslip_id || 0);
  const slip = await c.env.DB
    .prepare("SELECT id, employee_id, paid_amount FROM payslips WHERE id = ? AND run_id = ?")
    .bind(slipId, id)
    .first<{ id: number; employee_id: number; paid_amount: number }>();
  if (!slip) return c.json({ error: "not_found" }, 404);
  if (Number(slip.paid_amount || 0) > 0.005) return c.json({ error: "already_paid" }, 400);
  const emp = await c.env.DB.prepare("SELECT * FROM employees WHERE id = ? AND deleted_at IS NULL").bind(slip.employee_id).first<Employee>();
  if (!emp) return c.json({ error: "not_found" }, 404);
  const kind = b.kind === "absence" ? "absence" : "manual";
  const reason = String(b.reason || "").trim();
  if (b.remove && b.line_id) {
    await c.env.DB.prepare("DELETE FROM payslip_deductions WHERE id = ? AND payslip_id = ? AND kind = 'manual'").bind(Number(b.line_id), slip.id).run();
  } else if (b.reset_absence) {
    await c.env.DB.prepare("UPDATE payslip_deductions SET edited = 0 WHERE payslip_id = ? AND kind = 'absence'").bind(slip.id).run();
  } else if (kind === "absence") {
    if (!reason) return c.json({ error: "missing_fields" }, 400);
    const line = await c.env.DB.prepare("SELECT id FROM payslip_deductions WHERE payslip_id = ? AND kind = 'absence' ORDER BY id LIMIT 1").bind(slip.id).first<{ id: number }>();
    if (line) {
      await c.env.DB.prepare("UPDATE payslip_deductions SET amount = ?, reason = ?, edited = 1 WHERE id = ?").bind(round2(Number(b.amount || 0)), reason, line.id).run();
    } else {
      await c.env.DB.prepare("INSERT INTO payslip_deductions (payslip_id, kind, amount, reason, edited) VALUES (?, 'absence', ?, ?, 1)").bind(slip.id, round2(Number(b.amount || 0)), reason).run();
    }
  } else {
    if (!reason || !(Number(b.amount) > 0)) return c.json({ error: "missing_fields" }, 400);
    if (b.line_id) {
      await c.env.DB.prepare("UPDATE payslip_deductions SET amount = ?, reason = ? WHERE id = ? AND payslip_id = ? AND kind = 'manual'").bind(round2(Number(b.amount)), reason, Number(b.line_id), slip.id).run();
    } else {
      await c.env.DB.prepare("INSERT INTO payslip_deductions (payslip_id, kind, amount, reason, edited) VALUES (?, 'manual', ?, ?, 1)").bind(slip.id, round2(Number(b.amount)), reason).run();
    }
  }
  const calc = await computeEmployeeSlip(c.env.DB, emp, run.month, 0);
  const saved = await syncSlipTotals(c.env.DB, emp, calc, slip.id);
  await audit(c.env.DB, c.get("user"), "payroll_deduct", "payroll", id, `${emp.name}: ${reason || kind}`);
  return c.json({ ok: true, net: saved.pay.net, deductions: round2(saved.absence + saved.manual), lines: saved.lines });
});

hrRoutes.post("/payroll/:id/pay", requirePerm("hr.payroll"), async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json<{ payouts?: { payslip_id: number; amount: number }[]; cash_account_id?: number }>().catch(
    () => ({ payouts: undefined as { payslip_id: number; amount: number }[] | undefined, cash_account_id: undefined as number | undefined }),
  );
  const cashAccountId = Number(b.cash_account_id || 0) || null;
  const run = await c.env.DB.prepare("SELECT * FROM payroll_runs WHERE id = ?").bind(id).first<{ id: number; status: string; month: string }>();
  if (!run) return c.json({ error: "not_found" }, 404);
  if (run.status === "paid") return c.json({ error: "already_paid" }, 400);
  await refreshUnpaidSlips(c.env.DB, run);
  const { results: slips } = await c.env.DB
    .prepare("SELECT id, employee_id, net, advances, paid_amount, advances_settled, expense_id FROM payslips WHERE run_id = ?")
    .bind(id)
    .all<{ id: number; employee_id: number; net: number; advances: number; paid_amount: number; advances_settled: number; expense_id: number | null }>();
  const user = c.get("user");
  const cat = await c.env.DB.prepare("SELECT id FROM expense_categories WHERE name_en = 'Salaries' OR name_ar = 'مرتبات' LIMIT 1").first<{ id: number }>();
  const catId = cat?.id || 5;
  const requested = (b.payouts || []).length
    ? b.payouts || []
    : slips.map((s) => ({ payslip_id: s.id, amount: round2(Math.max(0, Number(s.net || 0) - Number(s.paid_amount || 0))) }));
  try {
    await c.env.DB.transaction(async (tx) => {
      for (const p of requested) {
        const s = slips.find((x) => x.id === p.payslip_id);
        if (!s) throw new Error("invalid_amount");
        const due = round2(Math.max(0, Number(s.net || 0) - Number(s.paid_amount || 0)));
        const amt = round2(Number(p.amount || 0));
        if (amt < -0.005 || amt > due + 0.005) throw new Error("invalid_amount");
        const payNow = round2(Math.min(Math.max(0, amt), due));
        if (payNow <= 0 && s.advances_settled) continue;
        let expenseId = s.expense_id;
        if (payNow > 0) {
          const emp = await tx.prepare("SELECT name FROM employees WHERE id = ?").bind(s.employee_id).first<{ name: string }>();
          const exp = await tx
            .prepare("INSERT INTO expenses (category_id, amount, date, description, user_id, cash_account_id) VALUES (?, ?, ?, ?, ?, ?)")
            .bind(catId, payNow, todayIso(), `راتب ${run.month} — ${emp?.name || s.employee_id}`, user.id, cashAccountId)
            .run();
          expenseId = exp.meta.last_row_id;
          await postSalaryPayoutJournal(tx, {
            id: expenseId,
            amount: payNow,
            date: todayIso(),
            description: `راتب ${run.month} — ${emp?.name || s.employee_id}`,
            userId: user.id,
            cashAccountId,
          });
        }
        if (!s.advances_settled) {
          await settleAdvancesForEmployee(tx, s.employee_id, Number(s.advances || 0), id, user.id);
          s.advances_settled = 1;
        }
        s.paid_amount = round2(Number(s.paid_amount || 0) + payNow);
        await tx
          .prepare("UPDATE payslips SET paid_amount = ?, expense_id = ?, advances_settled = 1 WHERE id = ?")
          .bind(s.paid_amount, expenseId, s.id)
          .run();
      }
      const allPaid = slips.every((s) => round2(Number(s.paid_amount || 0)) + 0.005 >= round2(Number(s.net || 0)));
      const anyPaid = slips.some((s) => Number(s.paid_amount || 0) > 0.005);
      const status = allPaid ? "paid" : anyPaid ? "partial" : "draft";
      await tx
        .prepare("UPDATE payroll_runs SET status = ?, paid_at = CASE WHEN ? = 'paid' THEN datetime('now') ELSE paid_at END WHERE id = ?")
        .bind(status, status, id)
        .run();
    });
  } catch (err) {
    const msg = String((err as Error)?.message || "");
    if (msg === "invalid_amount") return c.json({ error: "invalid_amount" }, 400);
    if (msg === "ledger" || msg === "unbalanced_journal") return c.json({ error: "ledger" }, 500);
    throw err;
  }
  await audit(c.env.DB, user, "payroll_pay", "payroll", id, `Pay ${run.month}`);
  return c.json({ ok: true });
});

hrRoutes.get("/shifts", requirePerm("hr.view", "hr.manage", "attendance.own"), async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM work_shifts ORDER BY start_time").all();
  return c.json({ data: results });
});

hrRoutes.post("/shifts", requirePerm("hr.manage"), async (c) => {
  const b = await c.req.json<{ name: string; name_en?: string; start_time: string; end_time: string; break_minutes?: number; expected_hours?: number; overtime_rate?: number; weekdays?: string }>();
  if (!b.name || !b.start_time || !b.end_time) return c.json({ error: "missing" }, 400);
  const days = String(b.weekdays || "0,1,2,3,4,5,6");
  try {
    const r = await c.env.DB
      .prepare("INSERT INTO work_shifts (name, name_en, start_time, end_time, break_minutes, expected_hours, overtime_rate, weekdays) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(b.name, b.name_en || b.name, b.start_time, b.end_time, b.break_minutes ?? 60, b.expected_hours ?? 8, b.overtime_rate ?? 1.5, days)
      .run();
    await audit(c.env.DB, c.get("user"), "create_shift", "work_shifts", r.meta.last_row_id, b.name);
    return c.json({ id: r.meta.last_row_id }, 201);
  } catch {
    const r = await c.env.DB
      .prepare("INSERT INTO work_shifts (name, name_en, start_time, end_time, break_minutes, expected_hours, overtime_rate) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(b.name, b.name_en || b.name, b.start_time, b.end_time, b.break_minutes ?? 60, b.expected_hours ?? 8, b.overtime_rate ?? 1.5)
      .run();
    await audit(c.env.DB, c.get("user"), "create_shift", "work_shifts", r.meta.last_row_id, b.name);
    return c.json({ id: r.meta.last_row_id }, 201);
  }
});

hrRoutes.put("/shifts/:id", requirePerm("hr.manage"), async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json<{ name: string; name_en?: string; start_time: string; end_time: string; break_minutes?: number; expected_hours?: number; overtime_rate?: number; active?: number; weekdays?: string }>();
  const days = String(b.weekdays || "0,1,2,3,4,5,6");
  try {
    await c.env.DB
      .prepare("UPDATE work_shifts SET name=?, name_en=?, start_time=?, end_time=?, break_minutes=?, expected_hours=?, overtime_rate=?, active=?, weekdays=? WHERE id=?")
      .bind(b.name, b.name_en || b.name, b.start_time, b.end_time, b.break_minutes ?? 60, b.expected_hours ?? 8, b.overtime_rate ?? 1.5, b.active === 0 ? 0 : 1, days, id)
      .run();
  } catch {
    await c.env.DB
      .prepare("UPDATE work_shifts SET name=?, name_en=?, start_time=?, end_time=?, break_minutes=?, expected_hours=?, overtime_rate=?, active=? WHERE id=?")
      .bind(b.name, b.name_en || b.name, b.start_time, b.end_time, b.break_minutes ?? 60, b.expected_hours ?? 8, b.overtime_rate ?? 1.5, b.active === 0 ? 0 : 1, id)
      .run();
  }
  await audit(c.env.DB, c.get("user"), "edit_shift", "work_shifts", id, b.name);
  return c.json({ ok: true });
});

hrRoutes.delete("/shifts/:id", requirePerm("hr.manage"), async (c) => {
  const id = Number(c.req.param("id"));
  await c.env.DB.prepare("UPDATE work_shifts SET active = 0 WHERE id = ?").bind(id).run();
  await audit(c.env.DB, c.get("user"), "delete_shift", "work_shifts", id, "Deactivate shift");
  return c.json({ ok: true });
});

hrRoutes.get("/leaves", requirePerm("leaves.own", "leaves.manage", "hr.view"), async (c) => {
  const url = new URL(c.req.url);
  const p = listParams(url);
  const user = c.get("user");
  const where = ["1=1"];
  const params: (string | number)[] = [];
  const canAll = user.role_slug === "admin" || user.permissions.includes("leaves.manage") || user.permissions.includes("hr.view");
  if (!canAll) {
    const emp = await employeeForUser(c.env.DB, user.id);
    if (!emp) return c.json({ data: [] });
    where.push("l.employee_id = ?");
    params.push(emp.id);
  }
  applyEq(where, params, "l.status", p.status);
  applyEq(where, params, "l.employee_id", p.employee_id, true);
  applyEq(where, params, "l.type", p.type);
  applySearch(where, params, p.q, ["e.name", "e.code", "IFNULL(l.reason,'')"]);
  applyDate(where, params, "l.date_from", p);
  const { results } = await c.env.DB
    .prepare(
      `SELECT l.*, e.name as employee_name, e.code as employee_code, e.department
       FROM leave_requests l JOIN employees e ON e.id = l.employee_id
       WHERE ${where.join(" AND ")} ORDER BY l.date_from DESC, l.id DESC LIMIT 300`,
    )
    .bind(...params)
    .all();
  return c.json({ data: results });
});

hrRoutes.post("/leaves", requirePerm("leaves.own", "leaves.manage"), async (c) => {
  const user = c.get("user");
  const b = await c.req.json<{ employee_id?: number; type?: string; date_from: string; date_to: string; reason?: string }>();
  if (!b.date_from || !b.date_to) return c.json({ error: "missing" }, 400);
  let employeeId = b.employee_id;
  if (user.role_slug !== "admin" && !user.permissions.includes("leaves.manage")) {
    const emp = await employeeForUser(c.env.DB, user.id);
    if (!emp) return c.json({ error: "no_employee" }, 400);
    employeeId = emp.id;
  }
  if (!employeeId) return c.json({ error: "employee_required" }, 400);
  const days = inclusiveDays(b.date_from, b.date_to);
  const r = await c.env.DB
    .prepare("INSERT INTO leave_requests (employee_id, type, date_from, date_to, days, status, reason, created_by) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)")
    .bind(employeeId, b.type || "annual", b.date_from, b.date_to, days, b.reason || null, user.id)
    .run();
  await audit(c.env.DB, user, "create_leave", "leave", r.meta.last_row_id, b.reason || "");
  await safeNotify(async () => {
    const emp = await c.env.DB.prepare("SELECT name FROM employees WHERE id = ?").bind(employeeId).first<{ name: string }>();
    await notifyAdmins(c.env.DB, {
      type: "hr",
      titleAr: "طلب HR جديد",
      titleEn: "New HR request",
      bodyAr: `الموظف ${emp?.name || ""} طلب أجازة جديدة`,
      bodyEn: `${emp?.name || "An employee"} requested leave`,
      entityType: "leave",
      entityId: Number(r.meta.last_row_id),
      actionUrl: "/hr/leaves",
    });
  });
  return c.json({ id: r.meta.last_row_id }, 201);
});

hrRoutes.post("/leaves/:id/approve", requirePerm("leaves.manage"), async (c) => {
  const id = Number(c.req.param("id"));
  const row = await c.env.DB.prepare("SELECT status FROM leave_requests WHERE id = ?").bind(id).first<{ status: string }>();
  if (!row) return c.json({ error: "not_found" }, 404);
  if (row.status !== "pending") return c.json({ error: "not_pending" }, 400);
  await c.env.DB
    .prepare("UPDATE leave_requests SET status='approved', reviewed_by=?, reviewed_at=datetime('now') WHERE id=?")
    .bind(c.get("user").id, id)
    .run();
  await audit(c.env.DB, c.get("user"), "approve_leave", "leave", id, "Approve leave");
  await safeNotify(async () => {
    const leave = await c.env.DB.prepare("SELECT employee_id FROM leave_requests WHERE id = ?").bind(id).first<{ employee_id: number }>();
    const uid = await userIdForEmployee(c.env.DB, leave?.employee_id);
    await sendNotification(c.env.DB, uid, {
      type: "hr",
      titleAr: "تحديث حالة الطلب",
      titleEn: "Request update",
      bodyAr: "تم قبول طلبك",
      bodyEn: "Your leave request was approved",
      entityType: "leave",
      entityId: id,
      actionUrl: "/hr/leaves",
    });
  });
  return c.json({ ok: true });
});

hrRoutes.post("/leaves/:id/reject", requirePerm("leaves.manage"), async (c) => {
  const id = Number(c.req.param("id"));
  await c.env.DB
    .prepare("UPDATE leave_requests SET status='rejected', reviewed_by=?, reviewed_at=datetime('now') WHERE id=?")
    .bind(c.get("user").id, id)
    .run();
  await audit(c.env.DB, c.get("user"), "reject_leave", "leave", id, "Reject leave");
  await safeNotify(async () => {
    const leave = await c.env.DB.prepare("SELECT employee_id FROM leave_requests WHERE id = ?").bind(id).first<{ employee_id: number }>();
    const uid = await userIdForEmployee(c.env.DB, leave?.employee_id);
    await sendNotification(c.env.DB, uid, {
      type: "hr",
      titleAr: "تحديث حالة الطلب",
      titleEn: "Request update",
      bodyAr: "تم رفض طلبك",
      bodyEn: "Your leave request was rejected",
      entityType: "leave",
      entityId: id,
      actionUrl: "/hr/leaves",
    });
  });
  return c.json({ ok: true });
});

hrRoutes.delete("/leaves/:id", requirePerm("leaves.manage", "leaves.own"), async (c) => {
  const id = Number(c.req.param("id"));
  const row = await c.env.DB.prepare("SELECT status FROM leave_requests WHERE id = ?").bind(id).first<{ status: string }>();
  if (!row) return c.json({ error: "not_found" }, 404);
  if (row.status !== "pending") return c.json({ error: "not_pending" }, 400);
  await c.env.DB.prepare("DELETE FROM leave_requests WHERE id = ?").bind(id).run();
  await audit(c.env.DB, c.get("user"), "delete_leave", "leave", id, "Delete leave");
  return c.json({ ok: true });
});

function canManageAdvances(user: { id: number; role_slug: string; permissions: string[] }) {
  return isSuperAdmin(user) || userHasPerm(user, "advances.manage", "hr.payroll", "hr.view");
}

hrRoutes.get("/advances", requirePerm("advances.own", "advances.manage", "hr.payroll", "hr.view"), async (c) => {
  const user = c.get("user");
  const p = listParams(new URL(c.req.url));
  const where = ["1=1"];
  const params: (string | number)[] = [];
  applyEq(where, params, "a.status", p.status);
  applyEq(where, params, "a.employee_id", p.employee_id, true);
  applySearch(where, params, p.q, ["e.name", "e.code"]);
  applyRange(where, params, "a.amount", p.amount_min, p.amount_max);
  applyDate(where, params, "a.date", p);
  if (!canManageAdvances(user)) {
    const emp = await employeeForUser(c.env.DB, user.id);
    if (!emp) return c.json({ data: [] });
    where.push("a.employee_id = ?");
    params.push(emp.id);
  }
  const { results } = await c.env.DB
    .prepare(
      `SELECT a.*, e.name as employee_name, e.code as employee_code
       FROM salary_advances a JOIN employees e ON e.id = a.employee_id
       WHERE ${where.join(" AND ")} ORDER BY a.id DESC LIMIT 300`,
    )
    .bind(...params)
    .all();
  return c.json({ data: results });
});

async function ensureCourierEmployee(db: AppDb, agentId: number) {
  const existing = await db
    .prepare("SELECT id FROM employees WHERE delivery_agent_id = ? AND deleted_at IS NULL ORDER BY id LIMIT 1")
    .bind(agentId)
    .first<{ id: number }>();
  if (existing) return existing.id;
  const agent = await db
    .prepare("SELECT id, name, code, phone FROM delivery_agents WHERE id = ? AND deleted_at IS NULL")
    .bind(agentId)
    .first<{ id: number; name: string; code: string; phone: string | null }>();
  if (!agent) throw new Error("agent_not_found");
  let code = `DA-${agent.code || agent.id}`;
  const clash = await db.prepare("SELECT id FROM employees WHERE code = ? AND deleted_at IS NULL").bind(code).first();
  if (clash) code = `DA-${agent.id}-${String(Date.now()).slice(-4)}`;
  const r = await db
    .prepare(
      `INSERT INTO employees (code, name, phone, job_title, department, hire_date, status, work_type, delivery_agent_id, basic_salary, allowances)
       VALUES (?, ?, ?, 'مندوب', 'توصيل', ?, 'active', 'field', ?, 0, 0)`,
    )
    .bind(code, agent.name, agent.phone || null, todayIso(), agent.id)
    .run();
  return r.meta.last_row_id;
}

async function approveAdvance(
  db: AppDb,
  row: { id: number; employee_id: number; amount: number; date: string; status: string },
  cashAccountId: number | null,
  userId: number,
) {
  if (row.status !== "pending") throw new Error("not_pending");
  const journalId = await postAdvanceJournal(db, {
    id: row.id,
    amount: round2(row.amount),
    date: row.date,
    description: `سلفة #${row.id}`,
    cashAccountId,
    userId,
  });
  await db
    .prepare("UPDATE salary_advances SET status = 'open', remaining = amount, cash_account_id = ?, journal_id = COALESCE(?, journal_id) WHERE id = ?")
    .bind(cashAccountId, journalId || null, row.id)
    .run();
}

hrRoutes.post("/advances", requirePerm("advances.own", "advances.manage", "hr.payroll"), async (c) => {
  const b = await c.req.json<{ employee_id?: number; delivery_agent_id?: number; amount: number; date?: string; month?: string; notes?: string; cash_account_id?: number }>();
  const user = c.get("user");
  const manager = userHasPerm(user, "advances.manage", "hr.payroll");
  let employeeId = Number(b.employee_id || 0);
  if (!manager) {
    const own = await employeeForUser(c.env.DB, user.id);
    if (!own) return c.json({ error: "no_employee" }, 400);
    employeeId = own.id;
  } else {
    try {
      if (!employeeId && b.delivery_agent_id) employeeId = await ensureCourierEmployee(c.env.DB, Number(b.delivery_agent_id));
    } catch (e) {
      const msg = String((e as Error)?.message || "error");
      return c.json({ error: msg }, msg === "agent_not_found" ? 404 : 400);
    }
  }
  if (!employeeId || !b.amount) return c.json({ error: "missing" }, 400);
  const date = b.date || todayIso();
  const month = b.month || date.slice(0, 7);
  const cashAccountId = Number(b.cash_account_id || 0) || null;
  const autoApprove = manager && Boolean(cashAccountId);
  const status = autoApprove ? "open" : "pending";
  const remaining = autoApprove ? round2(b.amount) : 0;
  let advanceId = 0;
  try {
    advanceId = await c.env.DB.transaction(async (tx) => {
      const r = await tx
        .prepare("INSERT INTO salary_advances (employee_id, amount, remaining, date, month, status, notes, created_by, cash_account_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(employeeId, round2(b.amount), remaining, date, month, status, b.notes || null, user.id, autoApprove ? cashAccountId : null)
        .run();
      const id = r.meta.last_row_id;
      if (autoApprove) {
        const journalId = await postAdvanceJournal(tx, {
          id,
          amount: round2(b.amount),
          date,
          description: `سلفة #${id}`,
          cashAccountId,
          userId: user.id,
        });
        if (journalId) {
          await tx.prepare("UPDATE salary_advances SET journal_id = ? WHERE id = ?").bind(journalId, id).run();
        }
      }
      return id;
    });
  } catch (e) {
    const msg = String((e as Error)?.message || "");
    if (msg === "ledger" || msg === "unbalanced_journal") return c.json({ error: "ledger" }, 500);
    throw e;
  }
  if (autoApprove) await refreshUnpaidSlipsForEmployee(c.env.DB, employeeId);
  await audit(c.env.DB, user, "create_advance", "advance", advanceId, `${status} ${b.amount}`);
  await safeNotify(async () => {
    const emp = await c.env.DB.prepare("SELECT name FROM employees WHERE id = ?").bind(employeeId).first<{ name: string }>();
    const amt = round2(b.amount);
    await notifyAdmins(c.env.DB, {
      type: "hr",
      titleAr: autoApprove ? "سلفة جديدة" : "طلب سلفة",
      titleEn: autoApprove ? "New advance" : "Advance request",
      bodyAr: autoApprove
        ? `تم تسجيل سلفة بقيمة ${amt} للموظف ${emp?.name || ""}`
        : `طلب سلفة بقيمة ${amt} من ${emp?.name || ""} بانتظار الاعتماد`,
      bodyEn: autoApprove
        ? `An advance of ${amt} was registered for ${emp?.name || "an employee"}`
        : `${emp?.name || "An employee"} requested an advance of ${amt}`,
      entityType: "advance",
      entityId: Number(advanceId),
      actionUrl: "/hr/advances",
    });
  });
  return c.json({ id: advanceId, employee_id: employeeId, status }, 201);
});

hrRoutes.post("/advances/:id/approve", requirePerm("advances.manage", "hr.payroll"), async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json<{ cash_account_id?: number }>().catch(() => ({} as { cash_account_id?: number }));
  const cashAccountId = Number(b.cash_account_id || 0) || null;
  if (!cashAccountId) return c.json({ error: "missing" }, 400);
  const row = await c.env.DB
    .prepare("SELECT id, employee_id, amount, date, status FROM salary_advances WHERE id = ?")
    .bind(id)
    .first<{ id: number; employee_id: number; amount: number; date: string; status: string }>();
  if (!row) return c.json({ error: "not_found" }, 404);
  if (row.status !== "pending") return c.json({ error: "not_pending" }, 400);
  const user = c.get("user");
  try {
    await c.env.DB.transaction(async (tx) => {
      await approveAdvance(tx, row, cashAccountId, user.id);
    });
  } catch (e) {
    const msg = String((e as Error)?.message || "");
    if (msg === "ledger" || msg === "unbalanced_journal") return c.json({ error: "ledger" }, 500);
    if (msg === "not_pending") return c.json({ error: "not_pending" }, 400);
    throw e;
  }
  await refreshUnpaidSlipsForEmployee(c.env.DB, row.employee_id);
  await audit(c.env.DB, user, "approve_advance", "advance", id, String(row.amount));
  await safeNotify(async () => {
    const uid = await userIdForEmployee(c.env.DB, row.employee_id);
    await sendNotification(c.env.DB, uid, {
      type: "hr",
      titleAr: "تم اعتماد السلفة",
      titleEn: "Advance approved",
      bodyAr: `تم اعتماد سلفتك بقيمة ${round2(row.amount)}`,
      bodyEn: `Your advance of ${round2(row.amount)} was approved`,
      entityType: "advance",
      entityId: id,
      actionUrl: "/hr/advances",
    });
  });
  return c.json({ ok: true });
});

hrRoutes.post("/advances/:id/reject", requirePerm("advances.manage", "hr.payroll"), async (c) => {
  const id = Number(c.req.param("id"));
  const row = await c.env.DB.prepare("SELECT status, employee_id FROM salary_advances WHERE id = ?").bind(id).first<{ status: string; employee_id: number }>();
  if (!row) return c.json({ error: "not_found" }, 404);
  if (row.status !== "pending") return c.json({ error: "not_pending" }, 400);
  await c.env.DB.prepare("UPDATE salary_advances SET status = 'rejected' WHERE id = ?").bind(id).run();
  await audit(c.env.DB, c.get("user"), "reject_advance", "advance", id, String(row.employee_id));
  await safeNotify(async () => {
    const uid = await userIdForEmployee(c.env.DB, row.employee_id);
    await sendNotification(c.env.DB, uid, {
      type: "hr",
      titleAr: "تحديث حالة الطلب",
      titleEn: "Request update",
      bodyAr: "تم رفض طلب السلفة",
      bodyEn: "Your advance request was rejected",
      entityType: "advance",
      entityId: id,
      actionUrl: "/hr/advances",
    });
  });
  return c.json({ ok: true });
});

hrRoutes.post("/advances/:id/cancel", requirePerm("advances.manage", "hr.payroll"), async (c) => {
  const id = Number(c.req.param("id"));
  const row = await c.env.DB.prepare("SELECT status, employee_id FROM salary_advances WHERE id = ?").bind(id).first<{ status: string; employee_id: number }>();
  if (!row) return c.json({ error: "not_found" }, 404);
  if (row.status !== "open") return c.json({ error: "not_open" }, 400);
  try {
    await reverseJournal(c.env.DB, "advance", id, c.get("user").id);
  } catch {
    /* no posted journal */
  }
  await c.env.DB.prepare("UPDATE salary_advances SET status = 'cancelled' WHERE id = ?").bind(id).run();
  await audit(c.env.DB, c.get("user"), "cancel_advance", "advance", id, String(row.employee_id));
  await refreshUnpaidSlipsForEmployee(c.env.DB, row.employee_id);
  await safeNotify(async () => {
    const uid = await userIdForEmployee(c.env.DB, row.employee_id);
    await sendNotification(c.env.DB, uid, {
      type: "hr",
      titleAr: "تحديث حالة الطلب",
      titleEn: "Request update",
      bodyAr: "تم رفض طلبك",
      bodyEn: "Your advance was cancelled",
      entityType: "advance",
      entityId: id,
      actionUrl: "/hr/employees",
    });
  });
  return c.json({ ok: true });
});

hrRoutes.get("/overtime", requirePerm("hr.payroll", "hr.view"), async (c) => {
  const month = new URL(c.req.url).searchParams.get("month") || todayIso().slice(0, 7);
  const { results } = await c.env.DB
    .prepare(
      `SELECT o.*, e.name as employee_name, e.code as employee_code
       FROM overtime_entries o JOIN employees e ON e.id = o.employee_id
       WHERE o.date LIKE ? ORDER BY o.date DESC, o.id DESC`,
    )
    .bind(`${month}%`)
    .all();
  return c.json({ data: results, month });
});

hrRoutes.delete("/overtime/:id", requirePerm("hr.payroll"), async (c) => {
  const id = Number(c.req.param("id"));
  await c.env.DB.prepare("DELETE FROM overtime_entries WHERE id = ?").bind(id).run();
  await audit(c.env.DB, c.get("user"), "delete_overtime", "overtime", id, String(id));
  return c.json({ ok: true });
});

hrRoutes.post("/overtime", requirePerm("hr.payroll"), async (c) => {
  const b = await c.req.json<{ employee_id: number; date?: string; hours: number; rate?: number; notes?: string }>();
  if (!b.employee_id || !b.hours) return c.json({ error: "missing" }, 400);
  const emp = await c.env.DB.prepare("SELECT basic_salary, shift_id FROM employees WHERE id = ?").bind(b.employee_id).first<Employee>();
  if (!emp) return c.json({ error: "not_found" }, 404);
  const shift = await shiftForEmployee(c.env.DB, emp);
  const rate = b.rate ?? Number(shift?.overtime_rate || 1.5);
  const hourly = Number(emp.basic_salary || 0) / 30 / Number(shift?.expected_hours || 8);
  const amount = round2(Number(b.hours) * hourly * rate);
  const r = await c.env.DB
    .prepare("INSERT INTO overtime_entries (employee_id, date, hours, rate, amount, source, notes, created_by) VALUES (?, ?, ?, ?, ?, 'manual', ?, ?)")
    .bind(b.employee_id, b.date || todayIso(), b.hours, rate, amount, b.notes || null, c.get("user").id)
    .run();
  await audit(c.env.DB, c.get("user"), "overtime", "overtime", r.meta.last_row_id, `${b.hours}h`);
  return c.json({ id: r.meta.last_row_id, amount }, 201);
});

hrRoutes.get("/users-lite", requirePerm("hr.manage"), async (c) => {
  const { page, pageSize } = paginate(new URL(c.req.url));
  const { results } = await c.env.DB.prepare("SELECT id, username, full_name FROM users WHERE deleted_at IS NULL AND active = 1 ORDER BY id LIMIT ?").bind(pageSize).all();
  return c.json({ data: results, page });
});
