import { useState, type ReactNode } from "react";
import { Download, Printer } from "lucide-react";
import { useApp } from "../context";
import { downloadExport } from "../lib/export";
import { loadViews, removeView, saveView } from "../lib/shortcuts";

export function Drawer({
  open,
  title,
  onClose,
  children,
  wide,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="drawer-root fixed inset-0 z-50 no-print">
      <div className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={onClose} />
      <aside className={`drawer-panel absolute inset-y-0 end-0 flex h-full flex-col bg-[var(--surface)] shadow-2xl ${wide ? "w-full max-w-xl" : "w-full max-w-md"}`}>
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <h3 className="text-base font-bold">{title}</h3>
          <button className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-auto p-5">{children}</div>
      </aside>
    </div>
  );
}

export function Modal(props: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return <Drawer {...props} />;
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="filter-bar no-print mb-3 flex flex-wrap items-end gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-sm">{children}</div>;
}

export function SavedViews({ id, value, onLoad }: { id: string; value: Record<string, string>; onLoad: (v: Record<string, string>) => void }) {
  const { tr } = useApp();
  const [views, setViews] = useState(() => loadViews(id));
  return (
    <div className="flex flex-wrap items-center gap-2">
      {views.map((v) => (
        <button key={v.name} className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold" onClick={() => onLoad(v.value)}>
          {v.name}
          <span className="ms-1 text-slate-400" onClick={(e) => { e.stopPropagation(); setViews(removeView(id, v.name)); }}>×</span>
        </button>
      ))}
      <button className="text-xs font-bold text-cyan-700" onClick={() => {
        const name = prompt(tr("saveFilter"));
        if (!name) return;
        setViews(saveView(id, name, value));
      }}>{tr("saveFilter")}</button>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-semibold text-slate-600">{label}</span>
      {children}
    </label>
  );
}

export const inputCls =
  "ds-input w-full rounded-xl border px-3 py-2 text-sm outline-none ring-pixel/30 focus:border-cyan-400 focus:ring-2";

export function Btn({
  children,
  onClick,
  kind = "primary",
  type = "button",
  disabled,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  kind?: "primary" | "ghost" | "danger" | "soft";
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
}) {
  const map = {
    primary: "bg-[var(--ink)] text-white hover:opacity-90",
    ghost: "bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface-2)]",
    danger: "bg-rose-600 text-white hover:bg-rose-700",
    soft: "bg-teal-50 text-teal-800 hover:bg-teal-100 dark:bg-teal-900/40 dark:text-teal-100",
  };
  return (
    <button type={type} disabled={disabled} onClick={onClick} className={`ui-btn inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-sm font-bold disabled:opacity-50 ${map[kind]} ${className}`}>
      {children}
    </button>
  );
}

export function Stat({ label, value, hint, accent = "cyan" }: { label: string; value: string; hint?: string; accent?: "cyan" | "indigo" | "emerald" | "amber" | "rose" }) {
  const bar = {
    cyan: "from-cyan-400 to-sky-500",
    indigo: "from-indigo-400 to-violet-500",
    emerald: "from-emerald-400 to-teal-500",
    amber: "from-amber-400 to-orange-500",
    rose: "from-rose-400 to-pink-500",
  }[accent];
  return (
    <div className="stat-card relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
      <div className={`stat-bar absolute inset-x-0 top-0 h-1 bg-gradient-to-l ${bar}`} />
      <div className="text-xs font-bold text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-extrabold tracking-tight">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-400">{hint}</div> : null}
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <div className="py-10 text-center text-sm text-slate-400">{text}</div>;
}

export function ExportBtn({ kind, query = "", className = "" }: { kind: string; query?: string; className?: string }) {
  const { tr } = useApp();
  return (
    <Btn
      kind="ghost"
      className={`no-print ${className}`}
      onClick={() => downloadExport(kind, query).catch(() => {})}
    >
      <Download size={15} />
      {tr("exportCsv")}
    </Btn>
  );
}

export function printPage(mode: "a4" | "thermal" = "a4") {
  document.documentElement.classList.toggle("print-thermal", mode === "thermal");
  window.print();
  window.setTimeout(() => document.documentElement.classList.remove("print-thermal"), 400);
}

export function PrintBtn({ className = "", thermal = false }: { className?: string; thermal?: boolean }) {
  const { tr } = useApp();
  return (
    <Btn kind="ghost" className={`no-print ${className}`} onClick={() => printPage(thermal ? "thermal" : "a4")}>
      <Printer size={15} />
      {thermal ? tr("printThermal") : tr("print")}
    </Btn>
  );
}

export function PrintLetterhead({ title }: { title: string }) {
  const { settings, lang, tr } = useApp();
  const now = new Date().toLocaleString(lang === "ar" ? "ar-EG" : "en-EG");
  return (
    <div className="print-only mb-5 border-b border-slate-300 pb-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-2xl font-black tracking-wide">{tr("app")}</div>
          <div className="text-sm text-slate-600">{settings.store_name_ar || settings.store_name || tr("app")}</div>
          <div className="text-xs text-slate-500">{settings.store_address}</div>
          <div className="text-xs text-slate-500">{settings.store_phone}</div>
          {settings.invoice_header ? <div className="mt-2 whitespace-pre-wrap text-sm">{settings.invoice_header}</div> : null}
        </div>
        <div className="text-end text-sm">
          <div className="font-black">{title}</div>
          <div className="text-slate-500">
            {tr("printedAt")}: {now}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PixelMark({ size = 28 }: { size?: number }) {
  return (
    <div className="pixel-mark grid grid-cols-2 gap-0.5" style={{ width: size, height: size }}>
      <span className="rounded-[3px] bg-cyan-400" />
      <span className="rounded-[3px] bg-indigo-400" />
      <span className="rounded-[3px] bg-indigo-400" />
      <span className="rounded-[3px] bg-cyan-400" />
    </div>
  );
}
