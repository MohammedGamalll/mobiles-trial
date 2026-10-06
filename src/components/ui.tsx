import { useEffect, useRef, useState, type ReactNode } from "react";
import { Download, Printer } from "lucide-react";
import { useApp } from "../context";
import { get } from "../lib/api";
import { fieldLabel } from "../i18n";
import { downloadExport } from "../lib/export";
import { loadViews, removeView, saveView } from "../lib/shortcuts";

export function Drawer({
  open,
  title,
  onClose,
  children,
  wide,
  xl,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  xl?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="drawer-root fixed inset-0 z-50 no-print">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <aside className={`drawer-panel absolute inset-y-0 end-0 flex h-full flex-col border-s border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-2xl ${xl ? "w-full max-w-4xl" : wide ? "w-full max-w-xl" : "w-full max-w-md"}`}>
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <h3 className="text-base font-bold">{title}</h3>
          <button className="rounded-lg px-2 py-1 text-[var(--muted)] hover:bg-[var(--surface-2)]" onClick={onClose}>
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
  xl?: boolean;
}) {
  return <Drawer {...props} />;
}

export function Can({ perm, children }: { perm: string | string[]; children: ReactNode }) {
  const { can } = useApp();
  const ok = Array.isArray(perm) ? can(...perm) : can(perm);
  return ok ? <>{children}</> : null;
}

export function ErrorNote({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div role="alert" className="error-banner mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold leading-6 text-rose-700">
      {message}
    </div>
  );
}

export function Spinner({ className = "h-8 w-8 text-[var(--btn)]" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <g className="spinner-ticks" fill="currentColor">
        <rect x="11" y="1" width="2" height="5" rx="1" opacity="0.14" transform="rotate(0 12 12)" />
        <rect x="11" y="1" width="2" height="5" rx="1" opacity="0.21" transform="rotate(30 12 12)" />
        <rect x="11" y="1" width="2" height="5" rx="1" opacity="0.29" transform="rotate(60 12 12)" />
        <rect x="11" y="1" width="2" height="5" rx="1" opacity="0.36" transform="rotate(90 12 12)" />
        <rect x="11" y="1" width="2" height="5" rx="1" opacity="0.43" transform="rotate(120 12 12)" />
        <rect x="11" y="1" width="2" height="5" rx="1" opacity="0.5" transform="rotate(150 12 12)" />
        <rect x="11" y="1" width="2" height="5" rx="1" opacity="0.57" transform="rotate(180 12 12)" />
        <rect x="11" y="1" width="2" height="5" rx="1" opacity="0.64" transform="rotate(210 12 12)" />
        <rect x="11" y="1" width="2" height="5" rx="1" opacity="0.71" transform="rotate(240 12 12)" />
        <rect x="11" y="1" width="2" height="5" rx="1" opacity="0.79" transform="rotate(270 12 12)" />
        <rect x="11" y="1" width="2" height="5" rx="1" opacity="0.86" transform="rotate(300 12 12)" />
        <rect x="11" y="1" width="2" height="5" rx="1" opacity="1" transform="rotate(330 12 12)" />
      </g>
    </svg>
  );
}

export function PageLoading({ label }: { label?: string }) {
  const { tr } = useApp();
  return (
    <div className="page-loading flex flex-col items-center justify-center gap-3 px-4 py-16 text-sm font-bold text-slate-500">
      <Spinner />
      <span>{label || tr("loading")}</span>
    </div>
  );
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

export const inputCls =
  "ds-input w-full rounded-xl border px-3 py-2 text-sm outline-none ring-pixel/30 focus:border-cyan-400 focus:ring-2";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  const { lang } = useApp();
  return (
    <label className="block text-sm">
      <span className="field-label mb-1 block font-extrabold text-[var(--text)]">{fieldLabel(lang, label)}</span>
      {children}
    </label>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5">
      <div className="min-w-0">
        <div className="text-sm font-extrabold text-[var(--text)]">{label}</div>
        {hint ? <div className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{hint}</div> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-8 w-[52px] shrink-0 rounded-full transition-colors ${checked ? "bg-teal-500" : "bg-slate-300 dark:bg-slate-600"}`}
      >
        <span className={`absolute top-1 size-6 rounded-full bg-white shadow-md transition-[inset-inline-start] ${checked ? "start-6" : "start-1"}`} />
      </button>
    </div>
  );
}

export function SearchPick({
  path,
  valueId,
  valueLabel,
  onPick,
  placeholder,
  labelOf,
  subtitle,
}: {
  path: string;
  valueId?: string | number | null;
  valueLabel?: string;
  onPick: (row: any | null, label: string) => void;
  placeholder?: string;
  labelOf?: (row: any) => string;
  subtitle?: (row: any) => string;
}) {
  const { tr } = useApp();
  const labelFn = labelOf || ((r: any) => r.name || r.name_ar || r.number || String(r.id));
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [pool, setPool] = useState<any[]>([]);
  const blurRef = useRef(0);
  const selected = valueId !== undefined && valueId !== null && String(valueId) !== "";

  useEffect(() => {
    get<{ data: any[] }>(`${path}${path.includes("?") ? "&" : "?"}pageSize=80`)
      .then((r) => setPool(r.data || []))
      .catch(() => setPool([]));
  }, [path]);

  useEffect(() => {
    if (!open) return;
    const query = q.trim().toLowerCase();
    const local = !query
      ? pool
      : pool.filter((r) =>
          `${labelFn(r)} ${r.phone || ""} ${r.code || ""} ${r.area || ""} ${r.city || ""} ${r.sku || ""}`.toLowerCase().includes(query),
        );
    setRows(local);
    if (!query) return;
    const t = setTimeout(() => {
      get<{ data: any[] }>(`${path}${path.includes("?") ? "&" : "?"}q=${encodeURIComponent(q.trim())}&pageSize=50`)
        .then((r) => setRows(r.data?.length ? r.data : local))
        .catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [q, open, path, pool]);

  return (
    <div className="relative">
      <input
        className={inputCls}
        value={selected ? (valueLabel || "") : q}
        placeholder={placeholder || tr("searchAndPick")}
        autoComplete="off"
        onFocus={() => {
          window.clearTimeout(blurRef.current);
          setOpen(true);
        }}
        onChange={(e) => {
          window.clearTimeout(blurRef.current);
          setQ(e.target.value);
          setOpen(true);
          if (selected) onPick(null, "");
        }}
        onBlur={() => {
          blurRef.current = window.setTimeout(() => setOpen(false), 180);
        }}
      />
      {open ? (
        <div className="absolute z-50 mt-2 max-h-56 min-w-[200px] w-max overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-xl">
          {rows.map((r) => (
            <button
              key={r.id}
              type="button"
              className="block w-full px-3 py-2 text-start text-sm font-bold hover:bg-[var(--surface-2)]"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const label = labelFn(r);
                onPick(r, label);
                setQ("");
                setOpen(false);
              }}
            >
              <div className="font-bold">{labelFn(r)}</div>
              {subtitle ? <div className="text-[11px] text-slate-500">{subtitle(r)}</div> : null}
            </button>
          ))}
          {!rows.length ? <div className="px-3 py-3 text-sm text-slate-400">{tr("noResults")}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

export function Btn({
  children,
  onClick,
  kind = "primary",
  type = "button",
  disabled,
  loading,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  kind?: "primary" | "ghost" | "danger" | "soft";
  type?: "button" | "submit";
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}) {
  const map = {
    primary: "bg-[var(--btn)] text-[var(--btn-fg)] hover:bg-[var(--btn-hover)] hover:text-[var(--btn-fg)]",
    ghost: "bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface-2)]",
    danger: "bg-rose-600 text-white hover:bg-rose-700 hover:text-white",
    soft: "bg-teal-50 text-teal-800 hover:bg-teal-200 hover:text-teal-950 dark:bg-teal-900/40 dark:text-teal-100 dark:hover:bg-[#134e4a] dark:hover:text-white",
  };
  return (
    <button type={type} disabled={disabled || loading} onClick={onClick} className={`ui-btn inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-sm font-bold transition-all duration-300 ease-in-out disabled:opacity-50 ${map[kind]} ${className}`}>
      {loading ? <Spinner className="h-4 w-4 text-current" /> : null}
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
  const { tr, can } = useApp();
  if (!can("reports.export")) return null;
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

export function PrintBtn({ className = "", thermal = false, onClick }: { className?: string; thermal?: boolean; onClick?: () => void | Promise<void> }) {
  const { tr } = useApp();
  return (
    <Btn kind="ghost" className={`no-print ${className}`} onClick={() => { if (onClick) return onClick(); printPage(thermal ? "thermal" : "a4"); }}>
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
        <div className="flex items-start gap-3">
          {settings.logo_url ? <img src={settings.logo_url} alt="" className="h-14 w-14 object-contain" /> : null}
          <div>
          <div className="text-2xl font-black tracking-wide">{tr("app")}</div>
          <div className="text-sm text-slate-600">{settings.store_name_ar || settings.store_name || tr("app")}</div>
          <div className="text-xs text-slate-500">{settings.store_address}</div>
          <div className="text-xs text-slate-500">{settings.store_phone}</div>
          {settings.invoice_header ? <div className="mt-2 whitespace-pre-wrap text-sm">{settings.invoice_header}</div> : null}
          </div>
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
