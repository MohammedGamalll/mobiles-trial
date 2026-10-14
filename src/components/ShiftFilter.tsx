import { useEffect, useState } from "react";
import { useApp } from "../context";
import { get } from "../lib/api";
import { Field, inputCls } from "./ui";

export type ShiftPick = {
  id: number;
  opened_at: string;
  closed_at?: string | null;
  status?: string;
  user_name?: string;
  drawer_name?: string;
  drawer_name_en?: string;
  cash_account_id?: number;
};

export function toDatetimeLocalValue(iso?: string | null) {
  const s = String(iso || "").replace("T", " ").trim();
  if (s.length >= 16) return `${s.slice(0, 10)}T${s.slice(11, 16)}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00`;
  return "";
}

export function formatShiftStamp(iso?: string | null) {
  const s = String(iso || "").replace("T", " ").trim();
  if (s.length >= 16) return `${s.slice(0, 10)} ${s.slice(11, 16)}`;
  return s || "";
}

export function ShiftFilter({
  value,
  onChange,
  compact,
}: {
  value: string;
  onChange: (next: { id: string; shift: ShiftPick | null }) => void;
  compact?: boolean;
}) {
  const { tr, lang } = useApp();
  const [rows, setRows] = useState<ShiftPick[]>([]);
  useEffect(() => {
    get<{ data: ShiftPick[] }>("/api/shifts?pageSize=80")
      .then((r) => setRows(r.data || []))
      .catch(() => setRows([]));
  }, []);
  const select = (
    <select
      className={compact ? undefined : inputCls}
      value={value}
      onChange={(e) => {
        const id = e.target.value;
        onChange({ id, shift: rows.find((s) => String(s.id) === id) || null });
      }}
    >
      <option value="">{tr("all")}</option>
      {rows.map((s) => {
        const drawer = lang === "ar" ? s.drawer_name : s.drawer_name_en || s.drawer_name;
        const start = formatShiftStamp(s.opened_at);
        const end = s.closed_at ? formatShiftStamp(s.closed_at) : tr("shiftOpenStatus");
        return (
          <option key={s.id} value={s.id}>
            #{s.id} · {s.user_name} · {drawer} · {start} → {end}
          </option>
        );
      })}
    </select>
  );
  if (compact) {
    return (
      <label className="sahl-daily-field">
        <span>{tr("posShift")}</span>
        {select}
      </label>
    );
  }
  return <Field label="posShift">{select}</Field>;
}

export function ShiftWindowNote({ shift }: { shift?: ShiftPick | null }) {
  const { tr } = useApp();
  if (!shift?.id) return null;
  return (
    <div className="mb-4 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-bold text-cyan-950">
      {tr("shiftStarted")}: {formatShiftStamp(shift.opened_at) || "—"}
      {" · "}
      {tr("shiftEnded")}: {shift.closed_at ? formatShiftStamp(shift.closed_at) : tr("shiftOpenStatus")}
    </div>
  );
}
