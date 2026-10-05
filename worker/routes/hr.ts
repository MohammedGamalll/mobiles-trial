import { Hono } from "hono";
import { audit, getSettings, paginate, round2, todayIso, type AppBindings, type AppVars, type AppDb } from "../lib/helpers";
import { requirePerm } from "../lib/auth";
import { haversineMeters, workplaceFromSettings } from "../lib/geo";
import { postPayrollJournal, tryLedger } from "../lib/ledger";
import { applyDate, applyEq, applyRange, applySearch, listParams, resolveDates } from "../lib/filters";
import { notifyAdmins, safeNotify, sendNotification, userIdForEmployee } from "../lib/notifications";

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

async function employeeForUser(db: AppDb, userId: number) {
  return db.prepare("SELECT * FROM employees WHERE user_id = ? AND deleted_at IS NULL").bind(userId).first<Employee>();
}

function isLate(clockInAt: string, shiftStart: string) {
  const t = clockInAt.slice(11, 16);
  const [sh, sm] = shiftStart.split(":").map(Number);
  const [ch, cm] = t.split(":").map(Number);
  return ch * 60 + cm > sh * 60 + sm + 15;
}

function inclusiveDays(from: string, to: string) {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.max(0, Math.round((b - a) / 86400000) + 1);
}

function overlapDays(from: string, to: string, month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const start = `${month}-01`;
  const end = `${month}-${String(last).padStart(2, "0")}`;
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

function fridayCount(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let n = 0;
  for (let d = 1; d <= last; d++) {
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCDay() === 5) n++;
  }
  return { days: last, fridays: n, expected: last - n };
}

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
      `SELECT e.*, u.username, da.name as agent_name, da.code as agent_code, s.name as shift_name, s.start_time as shift_start
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
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  const shift = await shiftForEmployee(c.env.DB, emp);
  const late = isLate(now, shift?.start_time || wp.shiftStart) ? 1 : 0;
  const r = await c.env.DB
    .prepare(
      `INSERT INTO attendance_sessions (employee_id, work_date, clock_in_at, clock_in_lat, clock_in_lng, distance_in, late, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open')`,
    )
    .bind(emp.id, todayIso(), now, b.lat, b.lng, round2(dist), late)
    .run();
  const sid = r.meta.last_row_id;
  await c.env.DB
    .prepare("INSERT INTO attendance_events (session_id, employee_id, type, lat, lng, distance_m) VALUES (?, ?, 'in', ?, ?, ?)")
    .bind(sid, emp.id, b.lat, b.lng, round2(dist))
    .run();
  await audit(c.env.DB, c.get("user"), "clock_in", "employee", emp.id, `Clock in ${Math.round(dist)}m`);
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
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  let outside = session.outside_seconds;
  if (session.currently_outside && session.outside_started_at) {
    outside += Math.max(0, (Date.parse(now.replace(" ", "T") + "Z") - Date.parse(session.outside_started_at.replace(" ", "T") + "Z")) / 1000);
  }
  const start = Date.parse(session.clock_in_at.replace(" ", "T") + "Z");
  const end = Date.parse(now.replace(" ", "T") + "Z");
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
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
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
        outside += Math.max(0, (Date.parse(now.replace(" ", "T") + "Z") - Date.parse(started.replace(" ", "T") + "Z")) / 1000);
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

hrRoutes.get("/attendance/:id/events", requirePerm("hr.view", "attendance.own"), async (c) => {
  const id = Number(c.req.param("id"));
  const { results } = await c.env.DB
    .prepare("SELECT * FROM attendance_events WHERE session_id = ? ORDER BY id")
    .bind(id)
    .all();
  return c.json({ data: results });
});

hrRoutes.get("/payroll", requirePerm("hr.payroll", "hr.view"), async (c) => {
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

hrRoutes.get("/payroll/:id", requirePerm("hr.payroll", "hr.view"), async (c) => {
  const id = Number(c.req.param("id"));
  const run = await c.env.DB.prepare("SELECT * FROM payroll_runs WHERE id = ?").bind(id).first();
  if (!run) return c.json({ error: "not_found" }, 404);
  const { results } = await c.env.DB
    .prepare(
      `SELECT p.*, e.name as employee_name, e.code as employee_code, e.job_title, e.department
       FROM payslips p JOIN employees e ON e.id = p.employee_id WHERE p.run_id = ? ORDER BY e.code`,
    )
    .bind(id)
    .all();
  return c.json({ data: { run, slips: results } });
});

hrRoutes.post("/payroll", requirePerm("hr.payroll"), async (c) => {
  const b = await c.req.json<{ month: string; notes?: string }>();
  if (!/^\d{4}-\d{2}$/.test(b.month || "")) return c.json({ error: "invalid_month" }, 400);
  const exists = await c.env.DB.prepare("SELECT id FROM payroll_runs WHERE month = ?").bind(b.month).first();
  if (exists) return c.json({ error: "month_exists", id: exists.id }, 400);
  const { expected } = fridayCount(b.month);
  const { from, to } = monthBounds(b.month);
  const ins = await c.env.DB
    .prepare("INSERT INTO payroll_runs (month, status, notes, created_by) VALUES (?, 'draft', ?, ?)")
    .bind(b.month, b.notes || null, c.get("user").id)
    .run();
  const runId = ins.meta.last_row_id;
  const { results: emps } = await c.env.DB
    .prepare("SELECT * FROM employees WHERE deleted_at IS NULL AND status = 'active'")
    .all<Employee>();
  for (const e of emps) {
    const stats = await c.env.DB
      .prepare(
        `SELECT COUNT(*) as present, SUM(late) as late, SUM(outside_seconds) as outside
         FROM attendance_sessions WHERE employee_id = ? AND work_date BETWEEN ? AND ? AND status = 'closed'`,
      )
      .bind(e.id, from, to)
      .first<{ present: number; late: number; outside: number }>();
    const present = Number(stats?.present || 0);
    const { results: leaves } = await c.env.DB
      .prepare("SELECT type, date_from, date_to FROM leave_requests WHERE employee_id = ? AND status = 'approved' AND date_from <= ? AND date_to >= ?")
      .bind(e.id, to, from)
      .all<{ type: string; date_from: string; date_to: string }>();
    let paidLeave = 0;
    let unpaidLeave = 0;
    for (const lv of leaves) {
      const days = overlapDays(lv.date_from, lv.date_to, b.month);
      if (lv.type === "unpaid") unpaidLeave += days;
      else paidLeave += days;
    }
    const absent = Math.max(0, expected - present - paidLeave);
    const daily = Number(e.basic_salary || 0) / 30;
    const ot = await c.env.DB
      .prepare("SELECT COALESCE(SUM(amount),0) as n FROM overtime_entries WHERE employee_id = ? AND date BETWEEN ? AND ?")
      .bind(e.id, from, to)
      .first<{ n: number }>();
    const adv = await c.env.DB
      .prepare("SELECT COALESCE(SUM(amount),0) as n FROM salary_advances WHERE employee_id = ? AND month = ? AND status = 'open'")
      .bind(e.id, b.month)
      .first<{ n: number }>();
    const overtime = round2(Number(ot?.n || 0));
    const advances = round2(Number(adv?.n || 0));
    const deductions = round2(absent * daily + unpaidLeave * daily + advances);
    const net = round2(Number(e.basic_salary || 0) + Number(e.allowances || 0) + overtime - deductions);
    await c.env.DB
      .prepare(
        `INSERT INTO payslips (run_id, employee_id, basic, allowances, present_days, absent_days, late_days, outside_minutes, deductions, net, overtime, advances, leave_days, unpaid_days)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        runId,
        e.id,
        e.basic_salary,
        e.allowances,
        present,
        absent,
        Number(stats?.late || 0),
        Math.round(Number(stats?.outside || 0) / 60),
        deductions,
        net,
        overtime,
        advances,
        paidLeave,
        unpaidLeave,
      )
      .run();
  }
  await audit(c.env.DB, c.get("user"), "payroll_run", "payroll", runId, b.month);
  return c.json({ id: runId }, 201);
});

hrRoutes.post("/payroll/:id/pay", requirePerm("hr.payroll"), async (c) => {
  const id = Number(c.req.param("id"));
  const run = await c.env.DB.prepare("SELECT * FROM payroll_runs WHERE id = ?").bind(id).first<{ id: number; status: string; month: string }>();
  if (!run) return c.json({ error: "not_found" }, 404);
  if (run.status === "paid") return c.json({ error: "already_paid" }, 400);
  const { results: slips } = await c.env.DB.prepare("SELECT * FROM payslips WHERE run_id = ?").bind(id).all<{ id: number; employee_id: number; net: number }>();
  const user = c.get("user");
  const cat = await c.env.DB.prepare("SELECT id FROM expense_categories WHERE name_en = 'Salaries' OR name_ar = 'مرتبات' LIMIT 1").first<{ id: number }>();
  const catId = cat?.id || 5;
  for (const s of slips) {
    const emp = await c.env.DB.prepare("SELECT name FROM employees WHERE id = ?").bind(s.employee_id).first<{ name: string }>();
    const exp = await c.env.DB
      .prepare("INSERT INTO expenses (category_id, amount, date, description, user_id) VALUES (?, ?, ?, ?, ?)")
      .bind(catId, s.net, todayIso(), `راتب ${run.month} — ${emp?.name || s.employee_id}`, user.id)
      .run();
    await c.env.DB.prepare("UPDATE payslips SET expense_id = ? WHERE id = ?").bind(exp.meta.last_row_id, s.id).run();
  }
  await c.env.DB.prepare("UPDATE salary_advances SET status = 'deducted', payroll_run_id = ? WHERE month = ? AND status = 'open'").bind(id, run.month).run();
  await c.env.DB.prepare("UPDATE payroll_runs SET status = 'paid', paid_at = datetime('now') WHERE id = ?").bind(id).run();
  const total = round2(slips.reduce((s, x) => s + Number(x.net || 0), 0));
  await tryLedger(() => postPayrollJournal(c.env.DB, { runId: id, month: run.month, total, userId: user.id }));
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
    return c.json({ id: r.meta.last_row_id }, 201);
  } catch {
    const r = await c.env.DB
      .prepare("INSERT INTO work_shifts (name, name_en, start_time, end_time, break_minutes, expected_hours, overtime_rate) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(b.name, b.name_en || b.name, b.start_time, b.end_time, b.break_minutes ?? 60, b.expected_hours ?? 8, b.overtime_rate ?? 1.5)
      .run();
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

hrRoutes.get("/advances", requirePerm("advances.manage", "hr.payroll", "hr.view"), async (c) => {
  const p = listParams(new URL(c.req.url));
  const where = ["1=1"];
  const params: (string | number)[] = [];
  applyEq(where, params, "a.status", p.status);
  applyEq(where, params, "a.employee_id", p.employee_id, true);
  applySearch(where, params, p.q, ["e.name", "e.code"]);
  applyRange(where, params, "a.amount", p.amount_min, p.amount_max);
  applyDate(where, params, "a.date", p);
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

hrRoutes.post("/advances", requirePerm("advances.manage", "hr.payroll"), async (c) => {
  const b = await c.req.json<{ employee_id?: number; delivery_agent_id?: number; amount: number; date?: string; month?: string; notes?: string }>();
  let employeeId = Number(b.employee_id || 0);
  try {
    if (!employeeId && b.delivery_agent_id) employeeId = await ensureCourierEmployee(c.env.DB, Number(b.delivery_agent_id));
  } catch (e) {
    const msg = String((e as Error)?.message || "error");
    return c.json({ error: msg }, msg === "agent_not_found" ? 404 : 400);
  }
  if (!employeeId || !b.amount) return c.json({ error: "missing" }, 400);
  const date = b.date || todayIso();
  const month = b.month || date.slice(0, 7);
  const r = await c.env.DB
    .prepare("INSERT INTO salary_advances (employee_id, amount, date, month, status, notes, created_by) VALUES (?, ?, ?, ?, 'open', ?, ?)")
    .bind(employeeId, round2(b.amount), date, month, b.notes || null, c.get("user").id)
    .run();
  await audit(c.env.DB, c.get("user"), "create_advance", "advance", r.meta.last_row_id, String(b.amount));
  await safeNotify(async () => {
    const emp = await c.env.DB.prepare("SELECT name FROM employees WHERE id = ?").bind(employeeId).first<{ name: string }>();
    await notifyAdmins(c.env.DB, {
      type: "hr",
      titleAr: "طلب HR جديد",
      titleEn: "New HR request",
      bodyAr: `الموظف ${emp?.name || ""} طلب سلفة جديدة`,
      bodyEn: `${emp?.name || "An employee"} received a new advance`,
      entityType: "advance",
      entityId: Number(r.meta.last_row_id),
      actionUrl: "/hr/employees",
    });
  });
  return c.json({ id: r.meta.last_row_id, employee_id: employeeId }, 201);
});

hrRoutes.post("/advances/:id/cancel", requirePerm("advances.manage", "hr.payroll"), async (c) => {
  const id = Number(c.req.param("id"));
  const row = await c.env.DB.prepare("SELECT status, employee_id FROM salary_advances WHERE id = ?").bind(id).first<{ status: string; employee_id: number }>();
  if (!row) return c.json({ error: "not_found" }, 404);
  if (row.status !== "open") return c.json({ error: "not_open" }, 400);
  await c.env.DB.prepare("UPDATE salary_advances SET status = 'cancelled' WHERE id = ?").bind(id).run();
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
  return c.json({ id: r.meta.last_row_id, amount }, 201);
});

hrRoutes.get("/users-lite", requirePerm("hr.manage"), async (c) => {
  const { page, pageSize } = paginate(new URL(c.req.url));
  const { results } = await c.env.DB.prepare("SELECT id, username, full_name FROM users WHERE deleted_at IS NULL AND active = 1 ORDER BY id LIMIT ?").bind(pageSize).all();
  return c.json({ data: results, page });
});
