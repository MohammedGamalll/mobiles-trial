import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useApp } from "../context";
import { get, post, put, del } from "../lib/api";
import { money, num, statusClass, statusLabel } from "../lib/format";
import { Btn, Field, Modal, PrintBtn, PrintLetterhead, Stat, inputCls, printPage } from "../components/ui";
import { ListGate } from "../components/ListGate";
import { EmptyFilterState, SmartFilter } from "../components/SmartFilter";
import { useListQuery } from "../hooks/useListQuery";
import { useLiveList } from "../hooks/useLiveList";
import { OsmMap } from "../components/OsmMap";
import { ActionBtns, useConfirm } from "../components/Confirm";
import { formatDuration, getGps, haversineMeters, parseCairo } from "../lib/geo";
import { ListPager } from "../components/TablePager";
import { applyListPaging, inferredTotal, listPageSize } from "../hooks/usePagedRows";
import { StaffForm } from "../components/StaffForm";

export function EmployeesPage() {
  const { tr, lang, can } = useApp();
  const f = useListQuery("employees");
  const [rows, setRows] = useState<any[]>([]);
  const [empTotal, setEmpTotal] = useState(0);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(emptyEmp());
  const { confirmDelete, dialog } = useConfirm();

  function emptyEmp() {
    return { id: 0, code: "", name: "", phone: "", job_title: "", department: "", hire_date: "", status: "active", work_type: "office", user_id: "", delivery_agent_id: "", shift_id: "", basic_salary: 0, allowances: 0, national_id: "", notes: "" };
  }
  const [shifts, setShifts] = useState<any[]>([]);
  const [sheet, setSheet] = useState<any>(null);
  const [sheetMonth, setSheetMonth] = useState(() => new Date().toISOString().slice(0, 7));
  async function openSheet(id: number, month = sheetMonth) {
    const r = await get<{ data: any }>(`/api/hr/employees/${id}/sheet?month=${month}`);
    setSheet(r.data);
    setSheetMonth(r.data?.month || month);
  }
  async function load() {
    const p = new URLSearchParams(f.qs);
    applyListPaging(p, f.page, listPageSize(f.values));
    const r = await get<{ data: any[]; total?: number }>(`/api/hr/employees?${p}`);
    setRows(r.data || []);
    setEmpTotal(inferredTotal(f.page, listPageSize(f.values), (r.data || []).length, r.total));
  }
  const list = useLiveList(async () => {
    await load();
    const s = await get<{ data: any[] }>("/api/hr/shifts");
    setShifts(s.data || []);
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
      <ListGate loading={list.loading} err={list.err} onRetry={list.reload} empty={!rows.length} emptyFallback={<EmptyFilterState onClear={f.clear} />}>
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
                <th>{tr("advances")}</th>
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
                  <td>{money(e.open_advances, lang)}</td>
                  <td><span className={statusClass(e.status === "active" ? "in" : "out")}>{e.status === "active" ? tr("active") : tr("inactive")}</span></td>
                  <td>
                    {can("hr.view") || can("hr.manage") || can("hr.payroll") ? (
                      <button className="me-2 text-xs font-bold text-cyan-800" onClick={() => openSheet(e.id)}>{tr("employeeSheet")}</button>
                    ) : null}
                    {can("hr.manage") ? (
                      <ActionBtns
                        canEdit
                        canDelete
                        onEdit={() => { setForm({ ...e, user_id: e.user_id || "", delivery_agent_id: e.delivery_agent_id || "", shift_id: e.shift_id || "" }); setOpen(true); }}
                        onDelete={() => confirmDelete(e.name, async () => { await del(`/api/hr/employees/${e.id}`); list.reload(); })}
                      />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </ListGate>
      <ListPager f={f} total={empTotal} disabled={list.loading} />
      <Modal open={!!sheet} title={tr("employeeSheet")} onClose={() => setSheet(null)} wide>
        {sheet ? (
          <div className="space-y-3 text-sm">
            <input className={`${inputCls} w-40`} type="month" value={sheetMonth} onChange={(e) => openSheet(sheet.employee.id, e.target.value)} />
            <div className="grid gap-2 md:grid-cols-4">
              <Stat label={tr("name")} value={sheet.employee.name} />
              <Stat label={tr("code")} value={sheet.employee.code} />
              <Stat label={tr("jobTitle")} value={sheet.employee.job_title || "-"} />
              <Stat label={tr("department")} value={sheet.employee.department || "-"} />
              <Stat label={tr("shift")} value={sheet.employee.shift_name || "-"} />
              <Stat label={tr("basicSalary")} value={money(sheet.employee.basic_salary, lang)} />
              <Stat label={tr("allowances")} value={money(sheet.employee.allowances, lang)} />
              <Stat label={tr("present")} value={String(sheet.calc?.present || 0)} />
              <Stat label={tr("absentDays")} value={String(sheet.calc?.absent || 0)} />
              <Stat label={tr("paidLeave")} value={String(sheet.calc?.paidLeave || 0)} />
              <Stat label={tr("unpaidLeave")} value={String(sheet.calc?.unpaidLeave || 0)} />
              <Stat label={tr("lateDays")} value={String(sheet.calc?.late || 0)} />
              <Stat label={tr("lateMinutes")} value={String(sheet.calc?.lateMinutes || 0)} />
              <Stat label={tr("advances")} value={money((sheet.advances || []).reduce((s: number, a: any) => s + Number(a.remaining ?? a.amount ?? 0), 0), lang)} />
            </div>
            <div className="font-black">{tr("deductions")}</div>
            {(sheet.deductions_lines || []).map((l: any) => (
              <div key={`${l.kind}-${l.id}`} className="flex justify-between gap-2 border-b border-slate-100 py-1">
                <span>{l.reason}</span>
                <span dir="ltr">{money(l.amount, lang)}</span>
              </div>
            ))}
          </div>
        ) : null}
      </Modal>
      <Modal open={open} title={form.id ? tr("edit") : tr("addEmployee")} onClose={() => setOpen(false)} wide>
        <StaffForm
          employee={form.id ? form : null}
          onSaved={() => { setOpen(false); list.reload(); }}
          onCancel={() => setOpen(false)}
        />
      </Modal>
      {dialog}
    </div>
  );
}

function stampDate(value?: string | null) {
  const s = String(value || "").replace("T", " ");
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : "";
}
function stampTime(value?: string | null) {
  const s = String(value || "").replace("T", " ");
  return s.length >= 16 ? s.slice(11, 16) : "";
}
function joinStamp(date: string, time: string) {
  if (!date) return "";
  const clock = time && time.length >= 5 ? `${time.slice(0, 5)}:00` : "00:00:00";
  return `${date} ${clock}`;
}

export function AttendancePage() {
  const { tr, lang, can, settings } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const openedReview = useRef(0);
  const f = useListQuery("attendance", { period: "today" });
  const [me, setMe] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [attTotal, setAttTotal] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const canReview = can("hr.manage") || can("hr.payroll");

  async function loadMe() {
    const r = await get<{ data: any }>("/api/hr/me");
    setMe(r.data);
  }
  async function loadRows() {
    const p = new URLSearchParams(f.qs);
    applyListPaging(p, f.page, listPageSize(f.values));
    const r = await get<{ data: any[]; total?: number }>(`/api/hr/attendance?${p}`);
    setRows(r.data || []);
    setAttTotal(inferredTotal(f.page, listPageSize(f.values), (r.data || []).length, r.total));
  }
  useEffect(() => { loadMe().catch(() => {}); }, []);
  const list = useLiveList(loadRows, [f.qs]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const shop = { lat: Number(settings.workplace_lat || me?.workplace?.lat || 30.0566), lng: Number(settings.workplace_lng || me?.workplace?.lng || 31.33) };
  const fence = Number(settings.geofence_meters || me?.workplace?.meters || 100);
  const session = me?.session;
  const isDelivery = me?.employee?.work_type === "delivery";

  function openSeconds(row: { status?: string; clock_in_at?: string; clock_out_at?: string; outside_seconds?: number; currently_outside?: number; outside_started_at?: string; work_seconds?: number } | null) {
    if (!row) return 0;
    if (row.status !== "open" || !row.clock_in_at) return Number(row.work_seconds || 0);
    const start = parseCairo(String(row.clock_in_at));
    if (!Number.isFinite(start)) return Number(row.work_seconds || 0);
    let out = Number(row.outside_seconds || 0);
    if (row.currently_outside && row.outside_started_at) {
      const left = parseCairo(String(row.outside_started_at));
      if (Number.isFinite(left)) out += Math.max(0, (now - left) / 1000);
    }
    return Math.max(0, (now - start) / 1000 - out);
  }
  function clockLabel(value?: string | null) {
    if (!value) return "-";
    const s = String(value).replace("T", " ");
    return s.length >= 19 ? s.slice(11, 19) : s;
  }
  function approvalLabel(status?: string) {
    const value = String(status || "").trim().toLowerCase();
    if (value === "approved") return tr("approvalApproved");
    if (value === "rejected") return tr("approvalRejected");
    return tr("approvalPending");
  }
  const workSec = openSeconds(session);
  const outSec = session?.status === "open" && session?.currently_outside && session?.outside_started_at
    ? Number(session.outside_seconds || 0) + Math.max(0, (now - parseCairo(String(session.outside_started_at))) / 1000)
    : Number(session?.outside_seconds || 0);

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

  function stampFor(value: string) {
    const stamp = String(value || "").replace("T", " ").trim();
    return stamp.length === 16 ? `${stamp}:00` : stamp.slice(0, 19);
  }
  async function saveReview(status: "approved" | "rejected") {
    if (!edit) return;
    const part = edit.part === "out" ? "out" : "in";
    try {
      const saved = await put<{ data: any }>(`/api/hr/attendance/${edit.id}`, part === "out"
        ? { part: "out", approval_status: status, clock_out_at: stampFor(edit.clock_out_at) }
        : {
            part: "in",
            approval_status: status,
            late: edit.late ? 1 : 0,
            late_minutes: Number(edit.late_minutes || 0),
            admin_notes: edit.admin_notes,
            clock_in_at: stampFor(edit.clock_in_at),
          });
      const next = saved?.data;
      if (next) setRows((prev) => prev.map((r) => (Number(r.id) === Number(next.id) ? { ...r, ...next } : r)));
      setEdit(null);
      setMsg("");
      await list.reload();
    } catch (e: any) {
      setMsg(e.message || tr("error"));
    }
  }
  function openReview(row: any, part: "in" | "out" = "in") {
    setEdit({
      ...row,
      part,
      admin_notes: row.admin_notes || "",
      late: row.late ? 1 : 0,
      late_minutes: row.late_minutes || 0,
      approval_status: part === "out" ? row.out_approval_status || "pending" : row.approval_status || "pending",
      clock_in_at: String(row.clock_in_at || "").replace("T", " ").slice(0, 19),
      clock_out_at: row.clock_out_at ? String(row.clock_out_at).replace("T", " ").slice(0, 19) : "",
    });
  }

  const reviewId = Number(searchParams.get("session") || 0);
  useEffect(() => {
    if (!canReview || !reviewId || openedReview.current === reviewId) return;
    const row = rows.find((r) => Number(r.id) === reviewId);
    if (!row) return;
    openedReview.current = reviewId;
    openReview(row);
    const next = new URLSearchParams(searchParams);
    next.delete("session");
    setSearchParams(next, { replace: true });
  }, [canReview, reviewId, rows]);

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
      await list.reload();
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
      <ListGate loading={list.loading} err={list.err} onRetry={list.reload} empty={!rows.length} emptyFallback={<EmptyFilterState onClear={f.clear} />}>
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
          <div className="table-wrap">
            <table className="stack-cols">
              <thead>
                <tr>
                  <th>{tr("name")}</th>
                  <th>{tr("date")}</th>
                  <th>{tr("clockIn")}</th>
                  <th>{tr("clockOut")}</th>
                  <th>{tr("shiftTimer")}</th>
                  <th>{tr("outsideTime")}</th>
                  <th>{tr("status")}</th>
                  <th>{tr("approveAttendance")}</th>
                  <th>{tr("approveClockOut")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.employee_name}<div className="text-xs text-slate-400">{r.employee_code}</div></td>
                    <td>{r.work_date}</td>
                    <td className="text-xs">{clockLabel(r.clock_in_at)}</td>
                    <td className="text-xs">{clockLabel(r.clock_out_at)}</td>
                    <td>{formatDuration(openSeconds(r))}</td>
                    <td>{formatDuration(r.outside_seconds)}</td>
                    <td>
                      <span className={statusClass(r.currently_outside ? "out" : r.late ? "low" : "in")}>
                        {r.currently_outside ? tr("leftZone") : r.late ? tr("late") : r.status === "open" ? tr("onShift") : tr("present")}
                      </span>
                    </td>
                    <td>
                      <div className="text-xs">{approvalLabel(r.approval_status)}</div>
                      {r.late ? <div className="text-xs text-amber-700">{tr("lateMinutes")}: {r.late_minutes || 0}</div> : null}
                      {canReview ? <button className="text-xs font-bold text-cyan-800" onClick={() => openReview(r, "in")}>{tr("approveAttendance")}</button> : null}
                    </td>
                    <td>
                      <div className="text-xs">{r.clock_out_at ? approvalLabel(r.out_approval_status) : "-"}</div>
                      {canReview && r.clock_out_at ? <button className="text-xs font-bold text-cyan-800" onClick={() => openReview(r, "out")}>{tr("approveClockOut")}</button> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </ListGate>
      <ListPager f={f} total={attTotal} disabled={list.loading} />
      <Modal open={!!edit} title={edit?.part === "out" ? tr("approveClockOut") : tr("approveAttendance")} onClose={() => setEdit(null)}>
        {edit?.part === "out" ? (
          <div className="space-y-2">
            <Field label={tr("date")}><input className={inputCls} type="date" value={stampDate(edit.clock_out_at)} onChange={(e) => setEdit({ ...edit, clock_out_at: joinStamp(e.target.value, stampTime(edit.clock_out_at) || "00:00") })} /></Field>
            <Field label={tr("clockOut")}><input className={inputCls} type="time" value={stampTime(edit.clock_out_at)} onChange={(e) => setEdit({ ...edit, clock_out_at: joinStamp(stampDate(edit.clock_out_at), e.target.value) })} /></Field>
            <div className="flex gap-2">
              <Btn onClick={() => saveReview("approved")}>{tr("approvalApproved")}</Btn>
              <Btn kind="danger" onClick={() => saveReview("rejected")}>{tr("approvalRejected")}</Btn>
            </div>
          </div>
        ) : edit ? (
          <div className="space-y-2">
            <Field label={tr("date")}><input className={inputCls} type="date" value={stampDate(edit.clock_in_at)} onChange={(e) => setEdit({ ...edit, clock_in_at: joinStamp(e.target.value, stampTime(edit.clock_in_at) || "00:00") })} /></Field>
            <Field label={tr("clockIn")}><input className={inputCls} type="time" value={stampTime(edit.clock_in_at)} onChange={(e) => setEdit({ ...edit, clock_in_at: joinStamp(stampDate(edit.clock_in_at), e.target.value) })} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!edit.late} onChange={(e) => setEdit({ ...edit, late: e.target.checked ? 1 : 0 })} />{tr("late")}</label>
            <Field label={tr("lateMinutes")}><input className={inputCls} dir="ltr" type="number" min={0} value={edit.late_minutes} onChange={(e) => setEdit({ ...edit, late_minutes: Number(e.target.value) })} /></Field>
            <Field label={tr("adminNotes")}><textarea className={inputCls} value={edit.admin_notes} onChange={(e) => setEdit({ ...edit, admin_notes: e.target.value })} /></Field>
            <div className="flex gap-2">
              <Btn onClick={() => saveReview("approved")}>{tr("approvalApproved")}</Btn>
              <Btn kind="danger" onClick={() => saveReview("rejected")}>{tr("approvalRejected")}</Btn>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

export function PayrollPage() {
  const { tr, lang, can, lookups } = useApp();
  const cashAccounts = lookups?.cash_accounts || [];
  const f = useListQuery("payroll");
  const [runs, setRuns] = useState<any[]>([]);
  const [runTotal, setRunTotal] = useState(0);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [detail, setDetail] = useState<any>(null);
  const [payouts, setPayouts] = useState<Record<number, string>>({});
  const [absenceDraft, setAbsenceDraft] = useState<Record<number, { amount: string; reason: string }>>({});
  const [lineDraft, setLineDraft] = useState<Record<number, { amount: string; reason: string }>>({});
  const [cashAccountId, setCashAccountId] = useState("");
  const [mine, setMine] = useState<any>(null);
  const [sheetOn, setSheetOn] = useState(false);
  const [slipOn, setSlipOn] = useState<any>(null);
  const [bonusOpen, setBonusOpen] = useState(false);
  const [emps, setEmps] = useState<any[]>([]);
  const [bonusForm, setBonusForm] = useState({ employee_id: "", amount: "", reason: "", paid_immediately: 0, cash_account_id: "" });
  const [monthBonuses, setMonthBonuses] = useState<any[]>([]);
  const { confirm, dialog } = useConfirm();
  const payrollAdmin = can("hr.payroll");

  useEffect(() => {
    if (payrollAdmin) return;
    get<{ data: any }>("/api/hr/me/pay").then((r) => setMine(r.data)).catch(() => {});
  }, [payrollAdmin]);

  function slipDue(s: any) {
    return Math.max(0, Math.round((Number(s.net || 0) - Number(s.paid_amount || 0)) * 100) / 100);
  }

  async function load() {
    const p = new URLSearchParams(f.qs);
    applyListPaging(p, f.page, listPageSize(f.values));
    const r = await get<{ data: any[]; total?: number }>(`/api/hr/payroll?${p}`);
    setRuns(r.data || []);
    setRunTotal(inferredTotal(f.page, listPageSize(f.values), (r.data || []).length, r.total));
  }
  const list = useLiveList(load, [f.qs]);

  async function openRun(id: number) {
    const r = await get<{ data: any }>(`/api/hr/payroll/${id}`);
    setDetail(r.data);
    const next: Record<number, string> = {};
    const nextAbsence: Record<number, { amount: string; reason: string }> = {};
    for (const s of r.data?.slips || []) {
      next[s.id] = String(slipDue(s));
      const abs = (s.deductions_lines || []).find((l: any) => l.kind === "absence");
      nextAbsence[s.id] = { amount: String(Number(abs?.amount || 0)), reason: abs?.reason || "" };
    }
    setPayouts(next);
    setAbsenceDraft(nextAbsence);
    setLineDraft({});
    if (can("hr.payroll")) {
      const bonuses = await get<{ data: any[] }>(`/api/hr/bonuses?month=${r.data?.run?.month || ""}`);
      setMonthBonuses(bonuses.data || []);
    }
  }

  function deductionLines(s: any) {
    return (s.deductions_lines || []) as any[];
  }
  function deductionTotal(s: any) {
    const lines = deductionLines(s);
    if (lines.length) return lines.reduce((n, l) => n + Number(l.amount || 0), 0);
    return Number(s.deductions || 0);
  }
  async function postDeduct(body: Record<string, unknown>) {
    if (!detail?.run) return;
    await post(`/api/hr/payroll/${detail.run.id}/deduct`, body);
    await list.reload();
    await openRun(detail.run.id);
  }

  function payoutList(slips: any[], oneId?: number) {
    const list = oneId ? slips.filter((s) => s.id === oneId) : slips;
    return list
      .map((s) => ({ payslip_id: s.id, amount: Number(payouts[s.id] ?? slipDue(s)) }))
      .filter((p) => {
        const s = slips.find((x) => x.id === p.payslip_id);
        return p.amount > 0 || (s && Number(s.net) <= 0 && !s.advances_settled);
      });
  }

  async function payRun(oneId?: number) {
    if (!detail?.run) return;
    const body = { payouts: payoutList(detail.slips || [], oneId), cash_account_id: Number(cashAccountId || cashAccounts[0]?.id || 0) || undefined };
    if (!body.payouts.length) return;
    await post(`/api/hr/payroll/${detail.run.id}/pay`, body);
    await list.reload();
    await openRun(detail.run.id);
  }

  function printSheet() {
    setSlipOn(null);
    setSheetOn(true);
    window.setTimeout(() => printPage("a4"), 40);
  }
  function printSlip(s: any) {
    setSheetOn(false);
    setSlipOn(s);
    window.setTimeout(() => printPage("thermal"), 40);
  }
  async function saveBonus() {
    await post("/api/hr/bonuses", {
      employee_id: Number(bonusForm.employee_id),
      amount: Number(bonusForm.amount),
      reason: bonusForm.reason,
      paid_immediately: bonusForm.paid_immediately ? 1 : 0,
      cash_account_id: Number(bonusForm.cash_account_id || cashAccountId || cashAccounts[0]?.id || 0) || undefined,
      month: detail?.run?.month,
    });
    setBonusOpen(false);
    if (detail?.run?.id) await openRun(detail.run.id);
  }

  function runStatusLabel(status: string) {
    if (status === "paid") return tr("salaryPaid");
    if (status === "partial") return tr("salaryPartial");
    return tr("draft");
  }

  const slips = detail?.slips || [];
  const sum = (key: string) => slips.reduce((s: number, x: any) => s + Number(x[key] || 0), 0);
  function immediateBonus(employeeId: number) {
    return monthBonuses.reduce((s, b) => s + (Number(b.employee_id) === employeeId && Number(b.paid_immediately) ? Number(b.amount || 0) : 0), 0);
  }
  function splitBonuses(rows: any[]) {
    return (rows || []).reduce((s, b) => {
      const amount = Number(b.amount || 0);
      if (Number(b.paid_immediately)) s.now += amount;
      else s.later += amount;
      return s;
    }, { now: 0, later: 0 });
  }

  return (
    <div className="space-y-4">
      {sheetOn && detail ? (
        <div className="print-only">
          <PrintLetterhead title={tr("payroll")} />
          <h2 className="mb-2 font-black">{detail.run.month}</h2>
          <table className="stack-cols w-full">
            <thead>
              <tr>
                <th>{tr("name")}</th>
                <th>{tr("basicSalary")}</th>
                <th>{tr("allowances")}</th>
                <th>{tr("bonusAccrued")}</th>
                <th>{tr("bonusImmediate")}</th>
                <th>{tr("overtime")}</th>
                <th>{tr("advances")}</th>
                <th>{tr("absenceDeduction")}</th>
                <th>{tr("manualDeduction")}</th>
                <th>{tr("net")}</th>
                <th>{tr("paidNow")}</th>
                <th>{tr("remainingPay")}</th>
              </tr>
            </thead>
            <tbody>
              {slips.map((s: any) => (
                <tr key={s.id}>
                  <td>{s.employee_name}</td>
                  <td>{money(s.basic, lang)}</td>
                  <td>{money(s.allowances, lang)}</td>
                  <td>{money(s.bonus, lang)}</td>
                  <td>{money(immediateBonus(s.employee_id), lang)}</td>
                  <td>{money(s.overtime, lang)}</td>
                  <td>{money(s.advances, lang)}</td>
                  <td>{(s.deductions_lines || []).filter((l: any) => l.kind === "absence").map((l: any) => <div key={l.id}>{l.reason} {money(l.amount, lang)}</div>)}</td>
                  <td>{(s.deductions_lines || []).filter((l: any) => l.kind === "manual").map((l: any) => <div key={l.id}>{l.reason} {money(l.amount, lang)}</div>)}</td>
                  <td>{money(s.net, lang)}</td>
                  <td>{money(s.paid_amount, lang)}</td>
                  <td>{money(slipDue(s), lang)}</td>
                </tr>
              ))}
              <tr>
                <td className="font-black">{tr("total")}</td>
                <td>{money(sum("basic"), lang)}</td>
                <td>{money(sum("allowances"), lang)}</td>
                <td>{money(sum("bonus"), lang)}</td>
                <td>{money(slips.reduce((s: number, x: any) => s + immediateBonus(x.employee_id), 0), lang)}</td>
                <td>{money(sum("overtime"), lang)}</td>
                <td>{money(sum("advances"), lang)}</td>
                <td>{money(slips.reduce((n: number, x: any) => n + deductionLines(x).filter((l) => l.kind === "absence").reduce((a: number, l: any) => a + Number(l.amount || 0), 0), 0), lang)}</td>
                <td>{money(slips.reduce((n: number, x: any) => n + deductionLines(x).filter((l) => l.kind === "manual").reduce((a: number, l: any) => a + Number(l.amount || 0), 0), 0), lang)}</td>
                <td>{money(sum("net"), lang)}</td>
                <td>{money(sum("paid_amount"), lang)}</td>
                <td>{money(slips.reduce((s: number, x: any) => s + slipDue(x), 0), lang)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}
      {slipOn ? (
        <div className="print-only">
          <div className="text-center font-black">{tr("printPayslip")}</div>
          <div>{slipOn.employee_name}</div>
          <div>{detail?.run?.month || mine?.month}</div>
          <div>{tr("basicSalary")}: {money(slipOn.basic, lang)}</div>
          <div>{tr("bonuses")}: {money(slipOn.bonus, lang)}</div>
          <div>{tr("advances")}: {money(slipOn.advances, lang)}</div>
          {(slipOn.deductions_lines || []).map((l: any) => <div key={l.id}>{l.reason}: {money(l.amount, lang)}</div>)}
          <div>{tr("net")}: {money(slipOn.net, lang)}</div>
          <div>{tr("paidNow")}: {money(slipOn.paid_amount ?? slipOn.paid, lang)}</div>
          <div>{tr("remainingPay")}: {money(slipOn.remaining ?? slipDue(slipOn), lang)}</div>
          <div className="mt-6">{tr("signatureLine")}: ........................</div>
        </div>
      ) : null}
      <div className="no-print space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-black">{tr("payroll")}</h1>
        <div className="flex flex-wrap gap-2">
          {payrollAdmin && detail ? <Btn kind="ghost" onClick={printSheet}>{tr("printPayrollSheet")}</Btn> : null}
          {payrollAdmin ? <Btn kind="ghost" onClick={async () => {
            if (!emps.length) {
              const r = await get<{ data: any[] }>("/api/hr/employees?limit=200");
              setEmps(r.data || []);
            }
            setBonusForm({ employee_id: "", amount: "", reason: "", paid_immediately: 0, cash_account_id: String(cashAccounts[0]?.id || "") });
            setBonusOpen(true);
          }}>{tr("addBonus")}</Btn> : null}
        </div>
      </div>
      {!payrollAdmin && mine ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-4">
          <h2 className="mb-3 font-black">{mine.employee?.name} — {mine.month}</h2>
          <div className="grid gap-3 md:grid-cols-4">
            <Stat label={tr("basicSalary")} value={money(mine.basic, lang)} />
            <Stat label={tr("bonusNowTotal")} value={money(splitBonuses(mine.bonuses).now, lang)} accent="emerald" />
            <Stat label={tr("bonusLaterTotal")} value={money(splitBonuses(mine.bonuses).later, lang)} accent="emerald" />
            <Stat label={tr("advances")} value={money(mine.advances, lang)} accent="rose" />
            <Stat label={tr("present")} value={String(mine.present || 0)} />
            <Stat label={tr("absentDays")} value={String(mine.absent || 0)} />
            <Stat label={tr("paidLeave")} value={String(mine.paidLeave || 0)} />
            <Stat label={tr("unpaidLeave")} value={String(mine.unpaidLeave || 0)} />
            <Stat label={tr("lateDays")} value={String(mine.late || 0)} />
            <Stat label={tr("lateMinutes")} value={String(mine.lateMinutes || 0)} />
            <Stat label={tr("deductions")} value={money(mine.deductions, lang)} accent="rose" />
            <Stat label={tr("net")} value={money(mine.net, lang)} accent="emerald" />
            <Stat label={tr("paidNow")} value={money(mine.paid, lang)} />
            <Stat label={tr("remainingPay")} value={money(mine.remaining, lang)} />
          </div>
          <div className="mt-4 space-y-2 text-sm">
            <div className="font-black">{tr("salaryDetails")}</div>
            {[
              [tr("basicSalary"), mine.basic],
              [tr("allowances"), mine.allowances],
              [tr("bonusNowTotal"), splitBonuses(mine.bonuses).now],
              [tr("bonusLaterTotal"), splitBonuses(mine.bonuses).later],
              [tr("overtime"), mine.overtime],
              [tr("advances"), mine.advances, "money"],
              [tr("paidNow"), mine.paid, "money"],
              [tr("remainingPay"), mine.remaining, "money"],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex items-center justify-between gap-3 border-b border-slate-100 py-1">
                <span>{label}</span>
                <span>{money(Number(value || 0), lang)}</span>
              </div>
            ))}
            {[
              [tr("present"), mine.present],
              [tr("absentDays"), mine.absent],
              [tr("paidLeave"), mine.paidLeave],
              [tr("unpaidLeave"), mine.unpaidLeave],
              [tr("lateDays"), mine.late],
              [tr("lateMinutes"), mine.lateMinutes],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex items-center justify-between gap-3 border-b border-slate-100 py-1">
                <span>{label}</span>
                <span>{num(Number(value || 0), lang)}</span>
              </div>
            ))}
            {(mine.deductions_lines || []).map((l: any) => (
              <div key={`${l.kind}-${l.id}`} className="flex items-center justify-between gap-3 border-b border-slate-100 py-1">
                <span>{l.reason}</span>
                <span>{money(Number(l.amount || 0), lang)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 pt-2 text-lg font-black">
              <span>{tr("net")}</span>
              <span>{money(mine.net, lang)}</span>
            </div>
          </div>
        </div>
      ) : null}
      {payrollAdmin ? <>
      <SmartFilter f={f} date={false} search={false} fields={[
        { key: "status", label: "status", type: "select", quick: true, options: [{ value: "draft", label: tr("draft") }, { value: "partial", label: tr("salaryPartial") }, { value: "paid", label: tr("salaryPaid") }] },
        { key: "month", label: "pickMonth", type: "text" },
        { key: "year", label: "pickYear", type: "text" },
      ]} />
      {can("hr.payroll") ? (
        <div className="no-print flex flex-wrap gap-2">
          <input className={`${inputCls} w-40`} type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          <Btn onClick={async () => {
            try {
              const r = await post<{ id: number }>("/api/hr/payroll", { month });
              await list.reload();
              await openRun(r.id);
            } catch (e: any) {
              if (e.payload?.id) openRun(e.payload.id);
              else alert(e.message || tr("error"));
            }
          }}>{tr("runPayroll")}</Btn>
        </div>
      ) : null}
      <div className="grid min-w-0 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="min-w-0 space-y-3">
        <ListGate loading={list.loading} err={list.err} onRetry={list.reload} empty={!runs.length} emptyFallback={<EmptyFilterState onClear={f.clear} />}>
          <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
            <div className="table-wrap">
              <table>
                <thead><tr><th>{tr("month")}</th><th>{tr("status")}</th></tr></thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id} className="cursor-pointer" onClick={() => openRun(r.id)}>
                      <td className="font-bold">{r.month}</td>
                      <td><span className={statusClass(r.status === "paid" ? "in" : r.status === "partial" ? "partial" : "open")}>{runStatusLabel(r.status)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </ListGate>
        <ListPager f={f} total={runTotal} disabled={list.loading} />
        </div>
        {detail ? (
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-black">{detail.run.month}</h2>
              {can("hr.payroll") && detail.run.status !== "paid" ? (
                <div className="no-print flex flex-wrap items-center gap-2">
                  <select className={inputCls} value={cashAccountId || String(cashAccounts[0]?.id || "")} onChange={(e) => setCashAccountId(e.target.value)}>
                    {cashAccounts.map((a: { id: number; name: string }) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                  <Btn onClick={() => confirm(tr("paySalaries"), tr("deleteConfirm"), () => payRun())}>{tr("paySalaries")}</Btn>
                </div>
              ) : null}
            </div>
            <div className="grid gap-3 md:grid-cols-5">
              <Stat label={tr("employees")} value={String(detail.slips?.length || 0)} />
              <Stat label={tr("net")} value={money((detail.slips || []).reduce((s: number, x: any) => s + Number(x.net || 0), 0), lang)} accent="emerald" />
              <Stat label={tr("paidAmount")} value={money((detail.slips || []).reduce((s: number, x: any) => s + Number(x.paid_amount || 0), 0), lang)} accent="cyan" />
              <Stat label={tr("advances")} value={money((detail.slips || []).reduce((s: number, x: any) => s + Number(x.advances || 0), 0), lang)} accent="rose" />
              <Stat label={tr("deductions")} value={money((detail.slips || []).reduce((s: number, x: any) => s + deductionTotal(x), 0), lang)} accent="rose" />
            </div>
            {monthBonuses.length ? (
              <div className="rounded-2xl border border-slate-100 bg-white p-3 text-sm">
                <div className="mb-1 font-black">{tr("bonuses")}</div>
                {monthBonuses.map((b) => (
                  <div key={b.id} className="flex flex-wrap justify-between gap-2">
                    <span>{b.employee_name} · {b.reason || tr("bonuses")} · {b.paid_immediately ? tr("bonusImmediate") : tr("bonusAccrued")}</span>
                    <span dir="ltr">{money(b.amount, lang)}</span>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
              <div className="table-wrap">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th>{tr("code")}</th>
                      <th>{tr("name")}</th>
                      <th>{tr("basicSalary")}</th>
                      <th>{tr("allowances")}</th>
                      <th>{tr("absentDays")}</th>
                      <th>{tr("overtime")}</th>
                      <th>{tr("bonuses")}</th>
                      <th>{tr("advances")}</th>
                      <th>{tr("absenceDeduction")}</th>
                      <th>{tr("manualDeduction")}</th>
                      <th>{tr("net")}</th>
                      <th>{tr("paidAmount")}</th>
                      <th>{tr("remainingPay")}</th>
                      <th className="no-print">{tr("payThisCycle")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detail.slips || []).map((s: any) => {
                      const due = slipDue(s);
                      return (
                      <tr key={s.id}>
                        <td>{s.employee_code}</td>
                        <td>{s.employee_name}</td>
                        <td dir="ltr">{money(s.basic, lang)}</td>
                        <td dir="ltr">{money(s.allowances, lang)}</td>
                        <td dir="ltr">{s.absent_days || 0}</td>
                        <td dir="ltr">{money(s.overtime, lang)}</td>
                        <td dir="ltr">{money(s.bonus, lang)}</td>
                        <td dir="ltr" className="font-bold text-rose-700">{money(s.advances, lang)}</td>
                        <td>
                          {(() => {
                            const abs = deductionLines(s).find((l) => l.kind === "absence");
                            const draft = absenceDraft[s.id] || { amount: String(abs?.amount || 0), reason: abs?.reason || "" };
                            const editable = detail.run.status !== "paid" && can("hr.payroll") && Number(s.paid_amount || 0) <= 0.005;
                            return editable ? (
                              <div className="no-print space-y-1">
                                <input className={`${inputCls} w-full`} value={draft.reason} onChange={(e) => setAbsenceDraft((prev) => ({ ...prev, [s.id]: { ...draft, reason: e.target.value } }))} />
                                <div className="flex gap-1">
                                  <input className={`${inputCls} w-20`} dir="ltr" type="number" min={0} value={draft.amount} onChange={(e) => setAbsenceDraft((prev) => ({ ...prev, [s.id]: { ...draft, amount: e.target.value } }))} />
                                  <Btn kind="soft" className="!px-2 !py-1 text-xs" onClick={() => postDeduct({ payslip_id: s.id, kind: "absence", amount: Number(draft.amount || 0), reason: draft.reason })}>{tr("save")}</Btn>
                                  <Btn kind="ghost" className="!px-2 !py-1 text-xs" onClick={() => postDeduct({ payslip_id: s.id, reset_absence: true })}>{tr("resetAbsence")}</Btn>
                                </div>
                              </div>
                            ) : <span>{abs ? `${abs.reason} ${money(abs.amount, lang)}` : "-"}</span>;
                          })()}
                        </td>
                        <td>
                          <div className="space-y-1">
                            {deductionLines(s).filter((l) => l.kind === "manual").map((l) => (
                              <div key={l.id} className="flex items-center justify-between gap-1">
                                <span>{l.reason}</span>
                                <span dir="ltr">{money(l.amount, lang)}</span>
                                {detail.run.status !== "paid" && can("hr.payroll") && Number(s.paid_amount || 0) <= 0.005 ? (
                                  <button className="text-xs text-rose-700" onClick={() => postDeduct({ payslip_id: s.id, remove: true, line_id: l.id })}>×</button>
                                ) : null}
                              </div>
                            ))}
                            {detail.run.status !== "paid" && can("hr.payroll") && Number(s.paid_amount || 0) <= 0.005 ? (
                              <div className="no-print flex flex-wrap gap-1">
                                <input className={`${inputCls} w-28`} placeholder={tr("deductionReason")} value={lineDraft[s.id]?.reason || ""} onChange={(e) => setLineDraft((prev) => ({ ...prev, [s.id]: { amount: prev[s.id]?.amount || "", reason: e.target.value } }))} />
                                <input className={`${inputCls} w-20`} dir="ltr" type="number" min={0} value={lineDraft[s.id]?.amount || ""} onChange={(e) => setLineDraft((prev) => ({ ...prev, [s.id]: { reason: prev[s.id]?.reason || "", amount: e.target.value } }))} />
                                <Btn kind="soft" className="!px-2 !py-1 text-xs" onClick={() => postDeduct({ payslip_id: s.id, kind: "manual", amount: Number(lineDraft[s.id]?.amount || 0), reason: lineDraft[s.id]?.reason || "" })}>{tr("addDeduction")}</Btn>
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td dir="ltr" className="font-bold">{money(s.net, lang)}</td>
                        <td dir="ltr">{money(s.paid_amount, lang)}</td>
                        <td dir="ltr">{money(due, lang)}</td>
                        <td className="no-print">
                          <div className="flex flex-wrap items-center gap-1">
                            <Btn kind="soft" className="!px-2.5 !py-1 text-xs" onClick={() => printSlip(s)}>{tr("printPayslip")}</Btn>
                          {detail.run.status !== "paid" && can("hr.payroll") && (due > 0 || !s.advances_settled) ? (
                            <>
                              <input
                                className={`${inputCls} w-24`}
                                dir="ltr"
                                type="number"
                                min={0}
                                max={due}
                                value={payouts[s.id] ?? String(due)}
                                onChange={(e) => setPayouts((prev) => ({ ...prev, [s.id]: e.target.value }))}
                              />
                              <Btn kind="soft" className="!px-2.5 !py-1 text-xs" onClick={() => payRun(s.id)}>{tr("payThisCycle")}</Btn>
                            </>
                          ) : null}
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : <div className="min-w-0 rounded-2xl bg-white p-6 text-slate-400">{tr("noData")}</div>}
      </div>
      </> : null}
      <Modal open={bonusOpen} title={tr("addBonus")} onClose={() => setBonusOpen(false)}>
        <div className="space-y-2">
          <Field label={tr("employees")}>
            <select className={inputCls} value={bonusForm.employee_id} onChange={(e) => setBonusForm({ ...bonusForm, employee_id: e.target.value })}>
              <option value="">{tr("employees")}</option>
              {emps.map((e) => <option key={e.id} value={e.id}>{e.code} — {e.name}</option>)}
            </select>
          </Field>
          <Field label={tr("amount")}><input className={inputCls} dir="ltr" type="number" min={0} value={bonusForm.amount} onChange={(e) => setBonusForm({ ...bonusForm, amount: e.target.value })} /></Field>
          <Field label={tr("reason")}><input className={inputCls} value={bonusForm.reason} onChange={(e) => setBonusForm({ ...bonusForm, reason: e.target.value })} /></Field>
          <Field label={tr("bonuses")}>
            <select className={inputCls} value={bonusForm.paid_immediately} onChange={(e) => setBonusForm({ ...bonusForm, paid_immediately: Number(e.target.value) })}>
              <option value={0}>{tr("bonusAccrued")}</option>
              <option value={1}>{tr("bonusImmediate")}</option>
            </select>
          </Field>
          {bonusForm.paid_immediately ? (
            <Field label={tr("cashAccount")}>
              <select className={inputCls} value={bonusForm.cash_account_id} onChange={(e) => setBonusForm({ ...bonusForm, cash_account_id: e.target.value })}>
                {cashAccounts.map((a: { id: number; name: string }) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
          ) : null}
          <Btn onClick={() => void saveBonus()}>{tr("save")}</Btn>
        </div>
      </Modal>
      {dialog}
      </div>
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
  const list = useLiveList(load, [f.qs]);
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
      <ListGate loading={list.loading} err={list.err} onRetry={list.reload} empty={!rows.length} emptyFallback={<EmptyFilterState onClear={f.clear} />}>
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
                        onDelete={() => confirmDelete(s.name, async () => { await del(`/api/hr/shifts/${s.id}`); list.reload(); })}
                      />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </ListGate>
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
            list.reload();
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
  const [leaveTotal, setLeaveTotal] = useState(0);
  const [emps, setEmps] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employee_id: "", type: "annual", date_from: new Date().toISOString().slice(0, 10), date_to: new Date().toISOString().slice(0, 10), reason: "" });
  const { confirmDelete, dialog } = useConfirm();
  async function load() {
    const p = new URLSearchParams(f.qs);
    applyListPaging(p, f.page, listPageSize(f.values));
    const r = await get<{ data: any[]; total?: number }>(`/api/hr/leaves?${p}`);
    setRows(r.data || []);
    setLeaveTotal(inferredTotal(f.page, listPageSize(f.values), (r.data || []).length, r.total));
  }
  const list = useLiveList(load, [f.qs]);
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
      <ListGate loading={list.loading} err={list.err} onRetry={list.reload} empty={!rows.length} emptyFallback={<EmptyFilterState onClear={f.clear} />}>
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{tr("name")}</th>
                <th>{tr("leaveType")}</th>
                <th>{tr("date")}</th>
                <th>{tr("days")}</th>
                <th>{tr("notes")}</th>
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
                  <td className="max-w-xs whitespace-normal text-sm">{r.reason || r.notes || "—"}</td>
                  <td><span className={statusClass(r.status)}>{statusLabel(r.status, lang)}</span></td>
                  <td>
                    <span className="flex flex-wrap gap-2">
                      {r.status === "pending" && can("leaves.manage") ? (
                        <>
                          <button className="font-bold text-cyan-700" onClick={async () => { await post(`/api/hr/leaves/${r.id}/approve`, {}); list.reload(); }}>{tr("approve")}</button>
                          <button className="font-bold text-rose-600" onClick={() => confirmDelete(r.employee_name, async () => { await post(`/api/hr/leaves/${r.id}/reject`, {}); list.reload(); })}>{tr("reject")}</button>
                        </>
                      ) : null}
                      {r.status === "pending" && can("leaves.manage", "leaves.own") ? (
                        <button className="font-bold text-rose-600" onClick={() => confirmDelete(r.employee_name, async () => { await del(`/api/hr/leaves/${r.id}`); list.reload(); })}>{tr("delete")}</button>
                      ) : null}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </ListGate>
      <ListPager f={f} total={leaveTotal} disabled={list.loading} />
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
            list.reload();
          }}>{tr("save")}</Btn>
        </div>
      </Modal>
      {dialog}
    </div>
  );
}

export function AdvancesPage() {
  const { tr, lang, can, lookups } = useApp();
  const f = useListQuery("advances", { month: new Date().toISOString().slice(0, 7) });
  const [rows, setRows] = useState<any[]>([]);
  const [advTotal, setAdvTotal] = useState(0);
  const [ots, setOts] = useState<any[]>([]);
  const [emps, setEmps] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [otOpen, setOtOpen] = useState(false);
  const [approveId, setApproveId] = useState(0);
  const [approveCash, setApproveCash] = useState("");
  const [form, setForm] = useState({ employee_id: "", delivery_agent_id: "", amount: 0, date: new Date().toISOString().slice(0, 10), notes: "", cash_account_id: "" });
  const manageAdvances = can("advances.manage", "hr.payroll");
  const requestOwn = can("advances.own");
  const cashAccounts = lookups?.cash_accounts || [];
  const [ot, setOt] = useState({ employee_id: "", hours: 1, date: new Date().toISOString().slice(0, 10), notes: "" });
  const { confirmDelete, dialog } = useConfirm();
  const month = f.values.month || new Date().toISOString().slice(0, 7);
  const agents = (lookups?.delivery_agents || []).filter((a: any) => a.status !== "inactive");
  async function load() {
    const p = new URLSearchParams(f.qs);
    applyListPaging(p, f.page, listPageSize(f.values));
    const r = await get<{ data: any[]; total?: number }>(`/api/hr/advances?${p}`);
    setRows(r.data || []);
    setAdvTotal(inferredTotal(f.page, listPageSize(f.values), (r.data || []).length, r.total));
    setOts((await get<{ data: any[] }>(`/api/hr/overtime?month=${month}`)).data || []);
  }
  const list = useLiveList(load, [f.qs]);
  useEffect(() => {
    get<{ data: any[] }>("/api/hr/employees").then((r) => setEmps(r.data || [])).catch(() => {});
  }, []);
  return (
    <div className="space-y-6">
      <PrintLetterhead title={tr("advances")} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-black">{tr("advances")}</h1>
        <div className="no-print flex gap-2">
          {manageAdvances || requestOwn ? <Btn onClick={() => setOpen(true)}>{manageAdvances ? tr("newAdvance") : tr("requestAdvance")}</Btn> : null}
          {can("hr.payroll") ? <Btn kind="soft" onClick={() => setOtOpen(true)}>{tr("newOvertime")}</Btn> : null}
          <PrintBtn />
        </div>
      </div>
      <SmartFilter f={f} fields={[
        { key: "status", label: "status", type: "select", quick: true, options: [
          { value: "pending", label: statusLabel("pending", lang) },
          { value: "open", label: statusLabel("open", lang) },
          { value: "settled", label: statusLabel("settled", lang) },
          { value: "rejected", label: statusLabel("rejected", lang) },
          { value: "deducted", label: statusLabel("deducted", lang) },
          { value: "cancelled", label: statusLabel("cancelled", lang) },
        ] },
        { key: "employee_id", label: "employees", type: "select", options: emps.map((e) => ({ value: String(e.id), label: `${e.code} — ${e.name}` })) },
        { key: "amount", label: "amountRange", type: "range", minKey: "amount_min", maxKey: "amount_max" },
      ]} />
      <ListGate loading={list.loading} err={list.err} onRetry={list.reload} empty={!rows.length && !ots.length} emptyFallback={<EmptyFilterState onClear={f.clear} />}>
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{tr("name")}</th>
                <th>{tr("date")}</th>
                <th>{tr("month")}</th>
                <th>{tr("amount")}</th>
                <th>{tr("remaining")}</th>
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
                  <td>{money(r.remaining ?? (r.status === "open" ? r.amount : 0), lang)}</td>
                  <td><span className={statusClass(r.status)}>{statusLabel(r.status, lang)}</span></td>
                  <td className="no-print">
                    {r.status === "pending" && manageAdvances ? (
                      <div className="flex gap-2">
                        <button className="font-bold text-emerald-700" onClick={() => { setApproveId(r.id); setApproveCash(String(cashAccounts[0]?.id || "")); }}>{tr("approve")}</button>
                        <button className="font-bold text-rose-600" onClick={() => confirmDelete(r.employee_name, async () => { await post(`/api/hr/advances/${r.id}/reject`, {}); list.reload(); })}>{tr("reject")}</button>
                      </div>
                    ) : null}
                    {r.status === "open" && manageAdvances ? (
                      <button className="font-bold text-rose-600" onClick={() => confirmDelete(r.employee_name, async () => { await post(`/api/hr/advances/${r.id}/cancel`, {}); list.reload(); })}>{tr("delete")}</button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!rows.length ? <tr><td colSpan={7} className="py-8 text-center text-slate-400">{tr("noData")}</td></tr> : null}
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
                  <td>{can("hr.payroll") ? <button className="font-bold text-rose-600" onClick={() => confirmDelete(r.employee_name, async () => { await del(`/api/hr/overtime/${r.id}`); list.reload(); })}>{tr("delete")}</button> : null}</td>
                </tr>
              ))}
              {!ots.length ? <tr><td colSpan={7} className="py-8 text-center text-slate-400">{tr("noData")}</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
      </ListGate>
      <ListPager f={f} total={advTotal} disabled={list.loading} />
      <Modal open={open} title={manageAdvances ? tr("newAdvance") : tr("requestAdvance")} onClose={() => setOpen(false)}>
        <div className="space-y-3">
          {manageAdvances ? (
            <>
              <Field label={tr("employees")}>
                <select className={inputCls} value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value, delivery_agent_id: "" })}>
                  <option value="">-</option>
                  {emps.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.code})</option>)}
                </select>
              </Field>
              <Field label={tr("couriers")}>
                <select className={inputCls} value={form.delivery_agent_id} onChange={(e) => setForm({ ...form, delivery_agent_id: e.target.value, employee_id: "" })}>
                  <option value="">-</option>
                  {agents.map((a: any) => <option key={a.id} value={a.id}>{a.name} ({a.code})</option>)}
                </select>
              </Field>
            </>
          ) : null}
          <Field label={tr("amount")}><input className={inputCls} type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></Field>
          {manageAdvances ? <Field label={tr("date")}><input className={inputCls} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field> : null}
          <Field label={tr("advanceReason")}><input className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          {manageAdvances ? (
            <Field label={tr("cashBox")}>
              <select className={inputCls} value={form.cash_account_id || String(cashAccounts[0]?.id || "")} onChange={(e) => setForm({ ...form, cash_account_id: e.target.value })}>
                {cashAccounts.map((a: { id: number; name: string }) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
          ) : null}
          <Btn onClick={async () => {
            await post("/api/hr/advances", {
              employee_id: manageAdvances && form.employee_id ? Number(form.employee_id) : undefined,
              delivery_agent_id: manageAdvances && form.delivery_agent_id ? Number(form.delivery_agent_id) : undefined,
              amount: form.amount,
              date: form.date,
              notes: form.notes,
              month,
              cash_account_id: manageAdvances ? Number(form.cash_account_id || cashAccounts[0]?.id || 0) || undefined : undefined,
            });
            setOpen(false);
            setForm({ employee_id: "", delivery_agent_id: "", amount: 0, date: new Date().toISOString().slice(0, 10), notes: "", cash_account_id: "" });
            list.reload();
          }}>{tr("save")}</Btn>
        </div>
      </Modal>
      <Modal open={approveId > 0} title={tr("approveAdvance")} onClose={() => setApproveId(0)}>
        <div className="space-y-3">
          <Field label={tr("cashBox")}>
            <select className={inputCls} value={approveCash} onChange={(e) => setApproveCash(e.target.value)}>
              {cashAccounts.map((a: { id: number; name: string }) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Btn onClick={async () => {
            await post(`/api/hr/advances/${approveId}/approve`, { cash_account_id: Number(approveCash || cashAccounts[0]?.id || 0) });
            setApproveId(0);
            list.reload();
          }}>{tr("approve")}</Btn>
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
            list.reload();
          }}>{tr("save")}</Btn>
        </div>
      </Modal>
      {dialog}
    </div>
  );
}
