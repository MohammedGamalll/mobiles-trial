const login = async (u) => {
  const res = await fetch("http://127.0.0.1:8787/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: u, password: "1234" }),
  });
  const cookie = (res.headers.getSetCookie?.()[0] || res.headers.get("set-cookie") || "").split(";")[0];
  return { status: res.status, cookie };
};
const api = async (cookie, path, init = {}) => {
  const res = await fetch("http://127.0.0.1:8787" + path, {
    ...init,
    headers: { cookie, "content-type": "application/json", ...(init.headers || {}) },
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
};

const admin = await login("admin");
const h = admin.cookie;
const old = {
  dash: (await api(h, "/api/dashboard")).status,
  delivery: (await api(h, "/api/delivery/live")).status,
  reps: (await api(h, "/api/reps")).status,
  att: (await api(h, "/api/hr/attendance")).status,
  emp: (await api(h, "/api/hr/employees")).status,
};
const shifts = await api(h, "/api/hr/shifts");
const leaves = await api(h, "/api/hr/leaves");
const adv = await api(h, "/api/hr/advances?month=2026-09");
const ot = await api(h, "/api/hr/overtime?month=2026-09");
const pending = (leaves.json.data || []).find((l) => l.status === "pending");
const approve = pending ? await api(h, `/api/hr/leaves/${pending.id}/approve`, { method: "POST", body: "{}" }) : { status: 0 };
const leave = await api(h, "/api/hr/leaves", {
  method: "POST",
  body: JSON.stringify({ employee_id: 1, type: "annual", date_from: "2026-09-25", date_to: "2026-09-25", reason: "تجربة" }),
});
const payroll = await api(h, "/api/hr/payroll", {
  method: "POST",
  body: JSON.stringify({ month: "2026-09" }),
});
const detail = payroll.json.id ? await api(h, `/api/hr/payroll/${payroll.json.id}`) : { status: payroll.status, json: payroll.json };
const slip = (detail.json.data?.slips || []).find((s) => s.employee_code === "EMP-004");
const roles = [];
for (const u of ["admin", "sales", "warehouse", "delivery", "accountant"]) roles.push((await login(u)).status);

console.log(JSON.stringify({
  old,
  shifts: { status: shifts.status, count: shifts.json.data?.length },
  leaves: { status: leaves.status, count: leaves.json.data?.length },
  advances: { status: adv.status, count: adv.json.data?.length },
  overtime: { status: ot.status, count: ot.json.data?.length },
  approve: approve.status,
  newLeave: leave.status,
  payroll: { status: payroll.status, id: payroll.json.id, err: payroll.json.error },
  mohamed: slip ? { advances: slip.advances, overtime: slip.overtime, net: slip.net, leave_days: slip.leave_days } : null,
  roles,
}, null, 2));
