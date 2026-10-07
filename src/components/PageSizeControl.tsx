import { useApp } from "../context";
import { inputCls } from "./ui";

export const PAGE_SIZE_CHOICES = [10, 50, 100, 500, 1000] as const;
export const PAGE_SIZE_ALL = 10000;

export function parsePageSize(raw: string | number | null | undefined, fallback = 50) {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "all") return PAGE_SIZE_ALL;
  const n = Number(s);
  if (n >= PAGE_SIZE_ALL) return PAGE_SIZE_ALL;
  if ((PAGE_SIZE_CHOICES as readonly number[]).includes(n)) return n;
  return fallback;
}

export function PageSizeControl({
  value,
  onChange,
  className = "",
}: {
  value: number;
  onChange: (n: number) => void;
  className?: string;
}) {
  const { tr } = useApp();
  const selected = value >= PAGE_SIZE_ALL ? "all" : String(value);
  return (
    <label className={`inline-flex items-center gap-2 text-xs font-bold ${className}`}>
      <span className="whitespace-nowrap">{tr("rowsPerPage")}</span>
      <select
        className={`${inputCls} !w-auto min-w-[5.5rem] py-1 text-xs`}
        value={selected}
        onChange={(e) => onChange(e.target.value === "all" ? PAGE_SIZE_ALL : Number(e.target.value))}
      >
        {PAGE_SIZE_CHOICES.map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
        <option value="all">{tr("all")}</option>
      </select>
    </label>
  );
}
