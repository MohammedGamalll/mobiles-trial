import { useEffect, useState } from "react";
import { useApp } from "../context";
import { get, post, put, del } from "../lib/api";
import { money, num, statusClass, statusLabel } from "../lib/format";
import { Btn, Field, FilterBar, Modal, PrintBtn, PrintLetterhead, Stat, inputCls } from "../components/ui";
import { EmptyFilterState, SmartFilter } from "../components/SmartFilter";
import { useListQuery } from "../hooks/useListQuery";
import { OsmMap } from "../components/OsmMap";
import { ActionBtns, useConfirm } from "../components/Confirm";
import { formatDuration, getGps, haversineMeters } from "../lib/geo";

export function EmployeesPage() {
  const { tr, lang, lookups, can } = useApp();
  const f = useListQuery("employees");
  const [rows, setRows] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(emptyEmp());
  const { confirmDelete, dialog } = useConfirm();

  function emptyEmp() {
    return { id: 0, code: "", name: "", phone: "", job_title: "", department: "", hire_date: "", status: "active", work_type: "office", user_id: "", delivery_agent_id: "", shift_id: "", basic_salary: 0, allowances: 0, national_id: "", notes: "" };
  }
  const [shifts, setShifts] = useState<any[]>([]);
  async function load() {
    setRows((await get<{ data: any[] }>(`/api/hr/employees?${f.qs}`)).data || []);
  }
  useEffect(() => {
    load().catch(() => {});
    get<{ data: any[] }>("/api/hr/users-lite").then((r) => setUsers(r.data || [])).catch(() => {});
    get<{ data: any[] }>("/api/hr/shifts").then((r) => setShifts(r.data || [])).catch(() => {});
  }, [f.qs]);

  return (
    <div>
      <PrintLetterhead title={tr("employees")} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-black">{tr("employees")}</h1>
        <div className="no-print flex gap-2">
          {can("hr.manage") ? <Btn onClick={() => { setForm(emptyEmp()); setOpen(true); }}>{tr("addEmployee")}</Btn> : null}
          <PrintBtn />
        </div>
      </div>
      <SmartFilter f={f} date={false} fields={[
        { key: "department", label: "department", type: "text", quick: true },
        { key: "job_title", label: "jobTitle", type: "text", quick: true },
        { key: "status", label: "status", type: "select", quick: true, options: [{ value: "active", label: tr("active") }, { value: "inactive", label: tr("inactive") }] },
        { key: "work_type", label: "workType", type: "select", options: [{ value: "office", label: tr("workOffice") }, { value: "delivery", label: tr("workDelivery") }] },
        { key: "shift_id", label: "shift", type: "select", options: shifts.map((s) => ({ value: String(s.id), label: s.name })) },
      ]} />
      {!rows.length ? <EmptyFilterState onClear={f.clear} /> : null}
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{tr("code")}</th>
                <th>{tr("name")}</th>
                <th>{tr("jobTitle")}</th>
                <th>{tr("department")}</th>
                <th>{tr("workType")}</th>
                <th>{tr("shift")}</th>
                <th>{tr("basicSalary")}</th>
                <th>{tr("allowances")}</th>
                <th>{tr("status")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td className="font-bold">{e.code}</td>
                  <td>{e.name}<div className="text-xs text-slate-400">{e.phone}</div></td>
                  <td>{e.job_title}</td>
                  <td>{e.department}</td>
                  <td>{e.work_type === "delivery" ? tr("workDelivery") : tr("workOffice")}</td>
                  <td>{e.shift_name || "-"}</td>
                  <td>{money(e.basic_salary, lang)}</td>
                  <td>{money(e.allowances, lang)}</td>
                  <td><span className={statusClass(e.status === "active" ? "in" : "out")}>{e.status === "active" ? tr("active") : tr("inactive")}</span></td>
                  <td>
                    {can("hr.manage") ? (
                      <ActionBtns
                        canEdit
                        canDelete
                        onEdit={() => { setForm({ ...e, user_id: e.user_id || "", delivery_agent_id: e.delivery_agent_id || "", shift_id: e.shift_id || "" }); setOpen(true); }}
                        onDelete={() => confirmDelete(e.name, async () => { await del(`/api/hr/employees/${e.id}`); load(); })}
                      />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Modal open={open} title={form.id ? tr("edit") : tr("addEmployee")} onClose={() => setOpen(false)} wide>
        {form.id ? (
          <div className="detail-strip mb-4 grid gap-2 md:grid-cols-5">
            <Stat label={tr("name")} value={form.name || "-"} />
            <Stat label={tr("code")} value={form.code || "-"} />
            <Stat label={tr("phone")} value={form.phone || "-"} />
            <Stat label={tr("jobTitle")} value={form.job_title || "-"} />
            <Stat label={tr("department")} value={form.department || "-"} />
          </div>
        ) : null}
        <div className="grid gap-3 md:grid-cols-2">
          {["code", "name", "phone", "job_title", "department", "national_id"].map((k) => (
            <Field key={k} label={k}><input className={inputCls} value={form[k] || ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></Field>
          ))}
          <Field label={tr("hireDate")}><input className={inputCls} type="date" value={form.hire_date || ""} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} /></Field>
          <Field label={tr("workType")}>
            <select className={inputCls} value={form.work_type} onChange={(e) => setForm({ ...form, work_type: e.target.value })}>
              <option value="office">{tr("workOffice")}</option>
              <option value="delivery">{tr("workDelivery")}</option>
            </select>
          </Field>
          <Field label={tr("basicSalary")}><input className={inputCls} type="number" value={form.basic_salary} onChange={(e) => setForm({ ...form, basic_salary: Number(e.target.value) })} /></Field>
          <Field label={tr("allowances")}><input className={inputCls} type="number" value={form.allowances} onChange={(e) => setForm({ ...form, allowances: Number(e.target.value) })} /></Field>
          <Field label={tr("status")}>
            <select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="active">{tr("active")}</option>
              <option value="inactive">{tr("inactive")}</option>
            </select>
          </Field>
          <Field label={tr("linkedUser")}>
            <select className={inputCls} value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value ? Number(e.target.value) : "" })}>
              <option value="">-</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.full_name} ({u.username})</option>)}
            </select>
          </Field>
          <Field label={tr("agent")}>
            <select className={inputCls} value={form.delivery_agent_id} onChange={(e) => setForm({ ...form, delivery_agent_id: e.target.value ? Number(e.target.value) : "" })}>
              <option value="">-</option>
              {(lookups?.delivery_agents || []).map((a) => <option key={a.id} value={a.id}>{a.name} ({a.code})</option>)}
            </select>
          </Field>
          <Field label={tr("shift")}>
            <select className={inputCls} value={form.shift_id} onChange={(e) => setForm({ ...form, shift_id: e.target.value ? Number(e.target.value) : "" })}>
              <option value="">-</option>
              {shifts.map((s) => <option key={s.id} value={s.id}>{lang === "ar" ? s.name : (s.name_en || s.name)} {s.start_time}-{s.end_time}</option>)}
            </select>
          </Field>
        </div>
        <Btn className="mt-4" onClick={async () => {
          const body = { ...form, user_id: form.user_id || null, delivery_agent_id: form.delivery_agent_id || null, shift_id: form.shift_id || null };
          if (form.id) await put(`/api/hr/employees/${form.id}`, body);
          else await post("/api/hr/employees", body);
          setOpen(false);
          load();
        }}>{tr("save")}</Btn>
      </Modal>
      {dialog}
    </div>
  );
}

export function AttendancePage() {
  const { tr, lang, can, settings } = useApp();
  const f = useListQuery("attendance", { period: "today" });
  const [me, setMe] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [now, setNow] = useState(Date.now());
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadMe() {
    const r = await get<{ data: any }>("/api/hr/me");
    setMe(r.data);
  }
  async function loadRows() {
    const r = await get<{ data: any[] }>(`/api/hr/attendance?${f.qs}`);
    setRows(r.data || []);
  }
  useEffect(() => { loadMe().catch(() => {}); }, []);
  useEffect(() => { loadRows().catch(() => {}); }, [f.qs]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const shop = { lat: Number(settings.workplace_lat || me?.workplace?.lat || 30.0566), lng: Number(settings.workplace_lng || me?.workplace?.lng || 31.33) };
  const fence = Number(settings.geofence_meters || me?.workplace?.meters || 100);
  const session = me?.session;
  const isDelivery = me?.employee?.work_type === "delivery";

  let workSec = 0;
  let outSec = Number(session?.outside_seconds || 0);
  if (session?.status === "open") {
    const start = Date.parse(String(session.clock_in_at).replace(" ", "T") + "Z");
    if (session.currently_outside && session.outside_started_at) {
      outSec += Math.max(0, (now - Date.parse(String(session.outside_started_at).replace(" ", "T") + "Z")) / 1000);
    }
    workSec = Math.max(0, (now - start) / 1000 - outSec);
  } else if (session) {
    workSec = session.work_seconds;
  }

  useEffect(() => {
    if (!session || session.status !== "open" || isDelivery) return;
    let watch: number | null = null;
    if (navigator.geolocation) {
      watch = navigator.geolocation.watchPosition(
        async (p) => {
          const next = { lat: p.coords.latitude, lng: p.coords.longitude };
          setPos(next);
          try {
            const r = await post<{ data: any }>("/api/hr/attendance/ping", next);
            setMe((m: any) => m ? { ...m, session: r.data.session } : m);
            if (r.data.outside) setMsg(tr("leftZone"));
            else setMsg("");
          } catch { /* ignore ping errors */ }
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 8000, timeout: 15000 },
      );
    }
    return () => { if (watch != null) navigator.geolocation.clearWatch(watch); };
  }, [session?.id, session?.status, isDelivery]);

  const dist = pos ? Math.round(haversineMeters(pos.lat, pos.lng, shop.lat, shop.lng)) : null;

  async function punch(kind: "in" | "out") {
    setBusy(true);
    setMsg("");
    try {
      const p = await getGps();
      const body = { lat: p.coords.latitude, lng: p.coords.longitude };
      setPos(body);
      if (kind === "in") await post("/api/hr/attendance/clock-in", body);
      else await post("/api/hr/attendance/clock-out", body);
      await loadMe();
      await loadRows();
    } catch (e: any) {
      setMsg(e.message === "outside_geofence" ? `${tr("outsideGeofence")} (${e.payload?.distance || ""}m)` : e.message || tr("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PrintLetterhead title={tr("attendance")} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-black">{tr("attendance")}</h1>
        <PrintBtn />
      </div>
      {me?.employee ? (
        <div className="grid gap-3 md:grid-cols-4">
          <Stat label={tr("shiftTimer")} value={session?.status === "open" ? formatDuration(workSec) : "--:--:--"} hint={me.employee.name} accent="cyan" />
          <Stat label={tr("outsideTime")} value={session?.status === "open" ? formatDuration(outSec) : formatDuration(session?.outside_seconds || 0)} accent="amber" />
          <Stat label={tr("distance")} value={dist != null ? `${num(dist, lang)} m` : "-"} hint={`${tr("geofence")} ${fence}m`} accent="indigo" />
          <Stat label={tr("status")} value={session?.currently_outside ? tr("leftZone") : session?.status === "open" ? tr("onShift") : tr("offShift")} accent={session?.currently_outside ? "rose" : "emerald"} />
        </div>
      ) : (
        <div className="rounded-2xl bg-white p-4 text-slate-500">{tr("noEmployeeLink")}</div>
      )}
      <div className="no-print flex flex-wrap gap-2">
        <Btn disabled={busy || !me?.employee || session?.status === "open"} onClick={() => punch("in")}>{tr("clockIn")}</Btn>
        <Btn kind="danger" disabled={busy || session?.status !== "open"} onClick={() => punch("out")}>{tr("clockOut")}</Btn>
      </div>
      {msg ? <div className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">{msg}</div> : null}
      {isDelivery ? <div className="text-xs text-slate-500">{tr("deliveryGeofenceSkip")}</div> : null}
      <OsmMap center={pos || shop} shop={shop} geofence={fence} self={pos} height={320} />
      <SmartFilter f={f} fields={[
        { key: "employee_id", label: "employees", type: "async", quick: true, asyncPath: "/api/hr/employees", asyncLabel: (r) => `${r.code} — ${r.name}` },
        { key: "department", label: "department", type: "text" },
        { key: "work_type", label: "workType", type: "select", options: [{ value: "office", label: tr("workOffice") }, { value: "delivery", label: tr("workDelivery") }] },
        { key: "late", label: "late", type: "select", options: [{ value: "1", label: tr("late") }] },
        { key: "present", label: "present", type: "select", options: [{ value: "1", label: tr("present") }] },
        { key: "absent", label: "absent", type: "select", options: [{ value: "1", label: tr("absent") }] },
        { key: "overtime", label: "overtime", type: "select", options: [{ value: "1", label: tr("overtime") }] },
        { key: "early_out", label: "earlyOut", type: "select", options: [{ value: "1", label: tr("earlyOut") }] },
        { key: "geofence", label: "geofence", type: "select", options: [{ value: "in", label: tr("insideFence") }, { value: "out", label: tr("outsideFence") }] },
      ]} />
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{tr("name")}</th>
                <th>{tr("date")}</th>
                <th>{tr("clockIn")}</th>
                <th>{tr("clockOut")}</th>
                <th>{tr("shiftTimer")}</th>
                <th>{tr("outsideTime")}</th>
                <th>{tr("status")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.employee_name}<div className="text-xs text-slate-400">{r.employee_code}</div></td>
                  <td>{r.work_date}</td>
                  <td className="text-xs">{r.clock_in_at}</td>
                  <td className="text-xs">{r.clock_out_at || "-"}</td>
                  <td>{formatDuration(r.status === "open" ? workSec : r.work_seconds)}</td>
                  <td>{formatDuration(r.outside_seconds)}</td>
                  <td>
                    <span className={statusClass(r.currently_outside ? "out" : r.late ? "low" : "in")}>
                      {r.currently_outside ? tr("leftZone") : r.late ? tr("late") : r.status === "open" ? tr("onShift") : tr("present")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function PayrollPage() {
  const { tr, lang, can } = useApp();
  const f = useListQuery("payroll");
  const [runs, setRuns] = useState<any[]>([]);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [detail, setDetail] = useState<any>(null);
  const { confirm, dialog } = useConfirm();

  async function load() {
    setRuns((await get<{ data: any[] }>(`/api/hr/payroll?${f.qs}`)).data || []);
  }
  useEffect(() => { load().catch(() => {}); }, [f.qs]);

  async function openRun(id: number) {
    const r = await get<{ data: any }>(`/api/hr/payroll/${id}`);
    setDetail(r.data);
  }

  return (
    <div className="space-y-4">
      <PrintLetterhead title={tr("payroll")} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-black">{tr("payroll")}</h1>
        <PrintBtn />
      </div>
      <SmartFilter f={f} date={false} search={false} fields={[
        { key: "status", label: "status", type: "select", quick: true, options: [{ value: "draft", label: tr("draft") }, { value: "paid", label: tr("salaryPaid") }] },
        { key: "month", label: "pickMonth", type: "text" },
        { key: "year", label: "pickYear", type: "text" },
      ]} />
      {can("hr.payroll") ? (
        <div className="no-print flex flex-wrap gap-2">
          <input className={`${inputCls} w-40`} type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          <Btn onClick={async () => {
            try {
              const r = await post<{ id: number }>("/api/hr/payroll", { month });
              await load();
              await openRun(r.id);
            } catch (e: any) {
              if (e.payload?.id) openRun(e.payload.id);
              else alert(e.message || tr("error"));
            }
          }}>{tr("runPayroll")}</Btn>
        </div>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
          <div className="table-wrap">
            <table>
              <thead><tr><th>{tr("month")}</th><th>{tr("status")}</th></tr></thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="cursor-pointer" onClick={() => openRun(r.id)}>
                    <td className="font-bold">{r.month}</td>
                    <td><span className={statusClass(r.status === "paid" ? "in" : "open")}>{r.status === "paid" ? tr("salaryPaid") : tr("draft")}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {detail ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-black">{detail.run.month}</h2>
              {can("hr.payroll") && detail.run.status !== "paid" ? (
                <Btn className="no-print" onClick={() => confirm(tr("paySalaries"), tr("deleteConfirm"), async () => { await post(`/api/hr/payroll/${detail.run.id}/pay`, {}); await load(); await openRun(detail.run.id); })}>{tr("paySalaries")}</Btn>
              ) : null}
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <Stat label={tr("employees")} value={String(detail.slips?.length || 0)} />
              <Stat label={tr("net")} value={money((detail.slips || []).reduce((s: number, x: any) => s + Number(x.net || 0), 0), lang)} accent="emerald" />
              <Stat label={tr("overtime")} value={money((detail.slips || []).reduce((s: number, x: any) => s + Number(x.overtime || 0), 0), lang)} accent="cyan" />
              <Stat label={tr("deductions")} value={money((detail.slips || []).reduce((s: number, x: any) => s + Number(x.deductions || 0), 0), lang)} accent="rose" />
            </div>
            <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{tr("code")}</th>
                      <th>{tr("name")}</th>
                      <th>{tr("basicSalary")}</th>
                      <th>{tr("allowances")}</th>
                      <th>{tr("present")}</th>
                      <th>{tr("leaves")}</th>
                      <th>{tr("absent")}</th>
                      <th>{tr("overtime")}</th>
                      <th>{tr("advances")}</th>
                      <th>{tr("deductions")}</th>
                      <th>{tr("net")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detail.slips || []).map((s: any) => (
                      <tr key={s.id}>
                        <td>{s.employee_code}</td>
                        <td>{s.employee_name}</td>
                        <td>{money(s.basic, lang)}</td>
                        <td>{money(s.allowances, lang)}</td>
                        <td>{s.present_days}</td>
                        <td>{s.leave_days || 0}</td>
                        <td>{s.absent_days}</td>
                        <td>{money(s.overtime, lang)}</td>
                        <td>{money(s.advances, lang)}</td>
                        <td>{money(s.deductions, lang)}</td>
                        <td className="font-bold">{money(s.net, lang)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : <div className="rounded-2xl bg-white p-6 text-slate-400">{tr("noData")}</div>}
      </div>
      {dialog}
    </div>
  );
}

export function ShiftsPage() {
  const { tr, lang, can } = useApp();
  const f = useListQuery("shifts");
  const [rows, setRows] = useState<any[]>([]);
  const emptyShift = () => ({ id: 0, name: "", name_en: "", start_time: "09:00", end_time: "17:00", break_minutes: 60, expected_hours: 8, overtime_rate: 1.5, active: 1, weekdays: "0,1,2,3,4,5,6" });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyShift());
  const { confirmDelete, dialog } = useConfirm();
  const DAYS = [
    { i: "0", key: "daySun" as const },
    { i: "1", key: "dayMon" as const },
    { i: "2", key: "dayTue" as const },
    { i: "3", key: "dayWed" as const },
    { i: "4", key: "dayThu" as const },
    { i: "5", key: "dayFri" as const },
    { i: "6", key: "daySat" as const },
  ];
  function daySet(s: any) {
    return new Set(String(s.weekdays || "0,1,2,3,4,5,6").split(",").filter(Boolean));
  }
  function toggleDay(i: string) {
    const cur = daySet(form);
    if (cur.has(i)) cur.delete(i);
    else cur.add(i);
    setForm({ ...form, weekdays: [...cur].sort().join(",") });
  }
  async function load() {
    const all = (await get<{ data: any[] }>("/api/hr/shifts")).data || [];
    const q = (f.values.q || "").toLowerCase();
    setRows(q ? all.filter((s) => `${s.name} ${s.name_en || ""}`.toLowerCase().includes(q)) : all);
  }
  useEffect(() => { load().catch(() => {}); }, [f.qs]);
  return (
    <div>
      <PrintLetterhead title={tr("shifts")} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-black">{tr("shifts")}</h1>
        <div className="no-print flex gap-2">
          {can("hr.manage") ? <Btn onClick={() => { setForm(emptyShift()); setOpen(true); }}>{tr("add")}</Btn> : null}
          <PrintBtn />
        </div>
      </div>
      <SmartFilter f={f} date={false} fields={[]} />
      {rows.length ? (
        <div className="mb-4 overflow-hidden rounded-2xl border border-slate-100 bg-white">
          <div className="px-3 py-2 text-sm font-black">{tr("weeklyShifts")}</div>
          <div className="table-wrap shift-week">
            <table>
              <thead>
                <tr>
                  <th>{tr("shifts")}</th>
                  {DAYS.map((d) => <th key={d.i}>{tr(d.key)}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const days = daySet(s);
                  return (
                    <tr key={`w-${s.id}`}>
                      <td className="font-bold">{lang === "ar" ? s.name : (s.name_en || s.name)} <span className="text-xs font-normal text-slate-400">{s.start_time}-{s.end_time}</span></td>
                      {DAYS.map((d) => <td key={d.i} className={days.has(d.i) ? "is-on" : ""}>{days.has(d.i) ? "●" : ""}</td>)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{tr("name")}</th>
                <th>{tr("clockIn")}</th>
                <th>{tr("clockOut")}</th>
                <th>{tr("expectedHours")}</th>
                <th>{tr("overtimeRate")}</th>
                <th>{tr("status")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td className="font-bold">{lang === "ar" ? s.name : (s.name_en || s.name)}</td>
                  <td>{s.start_time}</td>
                  <td>{s.end_time}</td>
                  <td>{s.expected_hours}</td>
                  <td>{s.overtime_rate}x</td>
                  <td><span className={statusClass(s.active ? "in" : "out")}>{s.active ? tr("active") : tr("inactive")}</span></td>
                  <td>
                    {can("hr.manage") ? (
                      <ActionBtns
                        canEdit
                        canDelete
                        onEdit={() => { setForm({ ...emptyShift(), ...s, weekdays: s.weekdays || "0,1,2,3,4,5,6" }); setOpen(true); }}
                        onDelete={() => confirmDelete(s.name, async () => { await del(`/api/hr/shifts/${s.id}`); load(); })}
                      />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Modal open={open} title={tr("shifts")} onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Field label={tr("name")}><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label={tr("clockIn")}><input className={inputCls} type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} /></Field>
          <Field label={tr("clockOut")}><input className={inputCls} type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} /></Field>
          <Field label={tr("expectedHours")}><input className={inputCls} type="number" value={form.expected_hours} onChange={(e) => setForm({ ...form, expected_hours: Number(e.target.value) })} /></Field>
          <Field label={tr("overtimeRate")}><input className={inputCls} type="number" step="0.1" value={form.overtime_rate} onChange={(e) => setForm({ ...form, overtime_rate: Number(e.target.value) })} /></Field>
          <Field label={tr("workDays")}>
            <div className="flex flex-wrap gap-1">
              {DAYS.map((d) => (
                <button key={d.i} type="button" className={`day-tog ${daySet(form).has(d.i) ? "is-on" : ""}`} onClick={() => toggleDay(d.i)}>{tr(d.key)}</button>
              ))}
            </div>
          </Field>
          <Btn onClick={async () => {
            if (form.id) await put(`/api/hr/shifts/${form.id}`, form);
            else await post("/api/hr/shifts", form);
            setOpen(false);
            load();
          }}>{tr("save")}</Btn>
        </div>
      </Modal>
      {dialog}
    </div>
  );
}

export function LeavesPage() {
  const { tr, lang, can } = useApp();
  const f = useListQuery("leaves");
  const [rows, setRows] = useState<any[]>([]);
  const [emps, setEmps] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employee_id: "", type: "annual", date_from: new Date().toISOString().slice(0, 10), date_to: new Date().toISOString().slice(0, 10), reason: "" });
  const { confirmDelete, dialog } = useConfirm();
  async function load() {
    setRows((await get<{ data: any[] }>(`/api/hr/leaves?${f.qs}`)).data || []);
  }
  useEffect(() => { load().catch(() => {}); }, [f.qs]);
  useEffect(() => {
    if (can("hr.view", "leaves.manage")) get<{ data: any[] }>("/api/hr/employees").then((r) => setEmps(r.data || [])).catch(() => {});
  }, []);
  return (
    <div>
      <PrintLetterhead title={tr("leaves")} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-black">{tr("leaves")}</h1>
        <div className="no-print flex gap-2">
          {can("leaves.own", "leaves.manage") ? <Btn onClick={() => setOpen(true)}>{tr("newLeave")}</Btn> : null}
          <PrintBtn />
        </div>
      </div>
      <SmartFilter f={f} fields={[
        { key: "status", label: "status", type: "select", quick: true, options: [
          { value: "pending", label: tr("pending") },
          { value: "approved", label: tr("approved") },
          { value: "rejected", label: tr("rejected") },
        ] },
        { key: "type", label: "leaveType", type: "select", options: ["annual", "sick", "unpaid", "emergency"].map((t) => ({ value: t, label: statusLabel(t, lang) })) },
        { key: "employee_id", label: "employees", type: "select", options: emps.map((e) => ({ value: String(e.id), label: `${e.code} — ${e.name}` })) },
      ]} />
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{tr("name")}</th>
                <th>{tr("leaveType")}</th>
                <th>{tr("date")}</th>
                <th>{tr("days")}</th>
                <th>{tr("status")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.employee_name}<div className="text-xs text-slate-400">{r.employee_code}</div></td>
                  <td>{statusLabel(r.type, lang)}</td>
                  <td>{r.date_from} → {r.date_to}</td>
                  <td>{r.days}</td>
                  <td><span className={statusClass(r.status)}>{statusLabel(r.status, lang)}</span></td>
                  <td>
                    <span className="flex flex-wrap gap-2">
                      {r.status === "pending" && can("leaves.manage") ? (
                        <>
                          <button className="font-bold text-cyan-700" onClick={async () => { await post(`/api/hr/leaves/${r.id}/approve`, {}); load(); }}>{tr("approve")}</button>
                          <button className="font-bold text-rose-600" onClick={() => confirmDelete(r.employee_name, async () => { await post(`/api/hr/leaves/${r.id}/reject`, {}); load(); })}>{tr("reject")}</button>
                        </>
                      ) : null}
                      {r.status === "pending" && can("leaves.manage", "leaves.own") ? (
                        <button className="font-bold text-rose-600" onClick={() => confirmDelete(r.employee_name, async () => { await del(`/api/hr/leaves/${r.id}`); load(); })}>{tr("delete")}</button>
                      ) : null}
                    </span>
                  </td>
                </tr>
              ))}
              {!rows.length ? <tr><td colSpan={6} className="py-8 text-center text-slate-400">{tr("noData")}</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
      <Modal open={open} title={tr("newLeave")} onClose={() => setOpen(false)}>
        <div className="space-y-3">
          {can("leaves.manage") ? (
            <Field label={tr("employees")}>
              <select className={inputCls} value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
                <option value="">-</option>
                {emps.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.code})</option>)}
              </select>
            </Field>
          ) : null}
          <Field label={tr("leaveType")}>
            <select className={inputCls} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="annual">{tr("leaveAnnual")}</option>
              <option value="sick">{tr("leaveSick")}</option>
              <option value="unpaid">{tr("leaveUnpaid")}</option>
              <option value="emergency">{tr("leaveEmergency")}</option>
            </select>
          </Field>
          <Field label={tr("date")}><input className={inputCls} type="date" value={form.date_from} onChange={(e) => setForm({ ...form, date_from: e.target.value })} /></Field>
          <Field label={tr("toDate")}><input className={inputCls} type="date" value={form.date_to} onChange={(e) => setForm({ ...form, date_to: e.target.value })} /></Field>
          <Field label={tr("notes")}><input className={inputCls} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
          <Btn onClick={async () => {
            await post("/api/hr/leaves", { ...form, employee_id: form.employee_id ? Number(form.employee_id) : undefined });
            setOpen(false);
            load();
          }}>{tr("save")}</Btn>
        </div>
      </Modal>
      {dialog}
    </div>
  );
}

export function AdvancesPage() {
  const { tr, lang, can } = useApp();
  const f = useListQuery("advances", { month: new Date().toISOString().slice(0, 7) });
  const [rows, setRows] = useState<any[]>([]);
  const [ots, setOts] = useState<any[]>([]);
  const [emps, setEmps] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [otOpen, setOtOpen] = useState(false);
  const [form, setForm] = useState({ employee_id: "", amount: 0, date: new Date().toISOString().slice(0, 10), notes: "" });
  const [ot, setOt] = useState({ employee_id: "", hours: 1, date: new Date().toISOString().slice(0, 10), notes: "" });
  const { confirmDelete, dialog } = useConfirm();
  const month = f.values.month || new Date().toISOString().slice(0, 7);
  async function load() {
    setRows((await get<{ data: any[] }>(`/api/hr/advances?${f.qs}`)).data || []);
    setOts((await get<{ data: any[] }>(`/api/hr/overtime?month=${month}`)).data || []);
  }
  useEffect(() => { load().catch(() => {}); }, [f.qs]);
  useEffect(() => {
    get<{ data: any[] }>("/api/hr/employees").then((r) => setEmps(r.data || [])).catch(() => {});
  }, []);
  return (
    <div className="space-y-6">
      <PrintLetterhead title={tr("advances")} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-black">{tr("advances")}</h1>
        <div className="no-print flex gap-2">
          {can("advances.manage", "hr.payroll") ? <Btn onClick={() => setOpen(true)}>{tr("newAdvance")}</Btn> : null}
          {can("hr.payroll") ? <Btn kind="soft" onClick={() => setOtOpen(true)}>{tr("newOvertime")}</Btn> : null}
          <PrintBtn />
        </div>
      </div>
      <SmartFilter f={f} fields={[
        { key: "status", label: "status", type: "select", quick: true, options: [
          { value: "open", label: statusLabel("open", lang) },
          { value: "deducted", label: statusLabel("deducted", lang) },
          { value: "cancelled", label: statusLabel("cancelled", lang) },
        ] },
        { key: "employee_id", label: "employees", type: "select", options: emps.map((e) => ({ value: String(e.id), label: `${e.code} — ${e.name}` })) },
        { key: "amount", label: "amountRange", type: "range", minKey: "amount_min", maxKey: "amount_max" },
      ]} />
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{tr("name")}</th>
                <th>{tr("date")}</th>
                <th>{tr("month")}</th>
                <th>{tr("amount")}</th>
                <th>{tr("status")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.employee_name}<div className="text-xs text-slate-400">{r.employee_code}</div></td>
                  <td>{r.date}</td>
                  <td>{r.month}</td>
                  <td>{money(r.amount, lang)}</td>
                  <td><span className={statusClass(r.status)}>{statusLabel(r.status, lang)}</span></td>
                  <td>
                    {r.status === "open" && can("advances.manage", "hr.payroll") ? (
                      <button className="font-bold text-rose-600" onClick={() => confirmDelete(r.employee_name, async () => { await post(`/api/hr/advances/${r.id}/cancel`, {}); load(); })}>{tr("delete")}</button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!rows.length ? <tr><td colSpan={6} className="py-8 text-center text-slate-400">{tr("noData")}</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
      <h2 className="text-xl font-black">{tr("overtime")}</h2>
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{tr("name")}</th>
                <th>{tr("date")}</th>
                <th>{tr("hours")}</th>
                <th>{tr("overtimeRate")}</th>
                <th>{tr("amount")}</th>
                <th>{tr("source")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {ots.map((r) => (
                <tr key={r.id}>
                  <td>{r.employee_name}</td>
                  <td>{r.date}</td>
                  <td>{r.hours}</td>
                  <td>{r.rate}x</td>
                  <td>{money(r.amount, lang)}</td>
                  <td>{r.source === "attendance" ? tr("attendance") : tr("manual")}</td>
                  <td>{can("hr.payroll") ? <button className="font-bold text-rose-600" onClick={() => confirmDelete(r.employee_name, async () => { await del(`/api/hr/overtime/${r.id}`); load(); })}>{tr("delete")}</button> : null}</td>
                </tr>
              ))}
              {!ots.length ? <tr><td colSpan={7} className="py-8 text-center text-slate-400">{tr("noData")}</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
      <Modal open={open} title={tr("newAdvance")} onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Field label={tr("employees")}>
            <select className={inputCls} value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
              <option value="">-</option>
              {emps.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </Field>
          <Field label={tr("amount")}><input className={inputCls} type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></Field>
          <Field label={tr("date")}><input className={inputCls} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label={tr("notes")}><input className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <Btn onClick={async () => {
            await post("/api/hr/advances", { ...form, employee_id: Number(form.employee_id), month });
            setOpen(false);
            load();
          }}>{tr("save")}</Btn>
        </div>
      </Modal>
      <Modal open={otOpen} title={tr("newOvertime")} onClose={() => setOtOpen(false)}>
        <div className="space-y-3">
          <Field label={tr("employees")}>
            <select className={inputCls} value={ot.employee_id} onChange={(e) => setOt({ ...ot, employee_id: e.target.value })}>
              <option value="">-</option>
              {emps.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </Field>
          <Field label={tr("hours")}><input className={inputCls} type="number" step="0.25" value={ot.hours} onChange={(e) => setOt({ ...ot, hours: Number(e.target.value) })} /></Field>
          <Field label={tr("date")}><input className={inputCls} type="date" value={ot.date} onChange={(e) => setOt({ ...ot, date: e.target.value })} /></Field>
          <Field label={tr("notes")}><input className={inputCls} value={ot.notes} onChange={(e) => setOt({ ...ot, notes: e.target.value })} /></Field>
          <Btn onClick={async () => {
            await post("/api/hr/overtime", { ...ot, employee_id: Number(ot.employee_id) });
            setOtOpen(false);
            load();
          }}>{tr("save")}</Btn>
        </div>
      </Modal>
      {dialog}
    </div>
  );
}
