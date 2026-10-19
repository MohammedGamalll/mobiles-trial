import { useEffect, useState } from "react";
import { useApp } from "../context";
import { get } from "../lib/api";
import { apiMessage } from "../lib/errors";
import { saveStaff } from "../lib/staff-client";
import { Btn, Field, inputCls } from "./ui";

export const STAFF_KINDS = ["courier", "cashier", "warehouse", "accountant"] as const;
export type StaffKind = (typeof STAFF_KINDS)[number];

export type StaffSaved = {
  employee_id: number;
  user_id: number;
  agent_id: number | null;
  username: string;
  name: string;
};

const KIND_LABEL: Record<StaffKind, "staffKindCourier" | "staffKindCashier" | "staffKindWarehouse" | "staffKindAccountant"> = {
  courier: "staffKindCourier",
  cashier: "staffKindCashier",
  warehouse: "staffKindWarehouse",
  accountant: "staffKindAccountant",
};

function emptyForm(kind: StaffKind) {
  return {
    kind,
    name: "",
    phone: "",
    code: "",
    username: "",
    password: "",
    job_title: "",
    department: "",
    hire_date: new Date().toISOString().slice(0, 10),
    basic_salary: 0,
    allowances: 0,
    national_id: "",
    notes: "",
    shift_id: "" as number | "",
    commission_rate: 0,
    area: "",
    agent_role: "delivery",
  };
}

export function StaffForm({
  defaultKind = "cashier",
  lockKind = false,
  onSaved,
  onCancel,
}: {
  defaultKind?: StaffKind;
  lockKind?: boolean;
  onSaved?: (row: StaffSaved) => void;
  onCancel?: () => void;
}) {
  const { tr, lang, refreshLookups } = useApp();
  const [form, setForm] = useState(() => emptyForm(defaultKind));
  const [shifts, setShifts] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const needsAgent = form.kind === "courier";

  useEffect(() => {
    setForm(emptyForm(defaultKind));
  }, [defaultKind]);

  useEffect(() => {
    get<{ data: any[] }>("/api/hr/shifts")
      .then((r) => setShifts(r.data || []))
      .catch(() => setShifts([]));
  }, []);

  return (
    <div className="space-y-3">
      <p className="text-xs leading-5 text-slate-500">{tr("staffLoginHint")}</p>
      <Field label={tr("staffKind")}>
        <select
          className={inputCls}
          disabled={lockKind}
          value={form.kind}
          onChange={(e) => {
            const kind = e.target.value as StaffKind;
            setForm({ ...form, kind, agent_role: "delivery" });
          }}
        >
          {STAFF_KINDS.map((k) => (
            <option key={k} value={k}>{tr(KIND_LABEL[k])}</option>
          ))}
        </select>
      </Field>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label={tr("name")}>
          <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label={tr("phone")}>
          <input className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label={tr("code")}>
          <input className={inputCls} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
        </Field>
        <Field label={tr("username")}>
          <input className={inputCls} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        </Field>
        <Field label={tr("password")}>
          <input className={inputCls} type="password" placeholder={tr("staffPasswordHint")} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        <Field label={tr("jobTitle")}>
          <input className={inputCls} value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} />
        </Field>
        <Field label={tr("department")}>
          <input className={inputCls} value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
        </Field>
        <Field label={tr("hireDate")}>
          <input className={inputCls} type="date" value={form.hire_date} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} />
        </Field>
        <Field label={tr("basicSalary")}>
          <input className={inputCls} type="number" value={form.basic_salary} onChange={(e) => setForm({ ...form, basic_salary: Number(e.target.value) || 0 })} />
        </Field>
        <Field label={tr("allowances")}>
          <input className={inputCls} type="number" value={form.allowances} onChange={(e) => setForm({ ...form, allowances: Number(e.target.value) || 0 })} />
        </Field>
        <Field label={tr("nationalId")}>
          <input className={inputCls} value={form.national_id} onChange={(e) => setForm({ ...form, national_id: e.target.value })} />
        </Field>
        <Field label={tr("shift")}>
          <select className={inputCls} value={form.shift_id} onChange={(e) => setForm({ ...form, shift_id: e.target.value ? Number(e.target.value) : "" })}>
            <option value="">-</option>
            {shifts.map((s) => (
              <option key={s.id} value={s.id}>{lang === "ar" ? s.name : (s.name_en || s.name)}</option>
            ))}
          </select>
        </Field>
        {needsAgent ? (
          <>
            <Field label={tr("commissionRate")}>
              <input className={inputCls} type="number" value={form.commission_rate} onChange={(e) => setForm({ ...form, commission_rate: Number(e.target.value) || 0 })} />
            </Field>
            <Field label={tr("area")}>
              <input className={inputCls} value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} />
            </Field>
          </>
        ) : null}
        <Field label={tr("notes")}>
          <input className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
      </div>
      {err ? <div className="text-sm font-bold text-rose-600">{err}</div> : null}
      <div className="flex gap-2">
        <Btn
          disabled={busy}
          onClick={async () => {
            if (!form.name.trim()) {
              setErr(tr("errNameRequired"));
              return;
            }
            setBusy(true);
            setErr("");
            try {
              const r = await saveStaff({
                ...form,
                shift_id: form.shift_id || null,
                agent_role: needsAgent ? form.agent_role : undefined,
              });
              await refreshLookups();
              onSaved?.(r);
            } catch (e) {
              setErr(apiMessage(tr, e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {tr("save")}
        </Btn>
        {onCancel ? <Btn kind="ghost" onClick={onCancel}>{tr("cancel")}</Btn> : null}
      </div>
    </div>
  );
}
