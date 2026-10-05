import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../context";
import { dict } from "../i18n";
import type { Product } from "../hooks/usePOSLogic";

export function productFilterValue(
  p: Product,
  col: string,
  lang: string,
  pickPrice: (p: Product) => number,
): string {
  const t = lang === "ar" ? dict.ar : dict.en;
  const name = (lang === "ar" ? p.name_ar : p.name_en) || p.name_ar || "";
  if (col === "name") return name;
  if (col === "category") return String(p.quality || "").trim();
  if (col === "sku") return [p.sku, p.barcode].filter(Boolean).join(" / ");
  if (col === "warehouse") return p.warehouse || p.location_name || "";
  if (col === "box") return p.box || "";
  if (col === "shelf") return p.shelf || "";
  if (col === "selling") {
    const n = pickPrice(p);
    return n ? String(n) : "";
  }
  if (col === "min") return p.min_selling_price != null && Number(p.min_selling_price) ? String(p.min_selling_price) : "";
  if (col === "wholesale") return p.wholesale_price != null && Number(p.wholesale_price) ? String(p.wholesale_price) : "";
  if (col === "kind") return p.kind === "service" ? t.services : p.kind ? t.products : "";
  if (col === "partType") return (lang === "ar" ? p.part_type_ar : p.part_type_en) || p.part_type_ar || "";
  if (col === "brand") return (lang === "ar" ? p.brand_ar : p.brand_en) || p.brand_ar || "";
  if (col === "supplier") return p.supplier_name || "";
  if (col === "bin") return [p.rack, p.shelf, p.drawer].filter(Boolean).join("+");
  if (col === "model") return (p.models || []).map((m) => m.name).filter(Boolean).join(", ");
  if (col === "location") return p.location_name || p.warehouse || "";
  if (col === "reserved") return String(Number(p.reserved_stock || 0) || 0);
  if (col === "minStock") return String(Number((p as Product & { min_stock?: number }).min_stock || 0) || 0);
  return "";
}

export function applyPosHeaderFilters(
  rows: Product[],
  filters: Record<string, string>,
  lang: string,
  pickPrice: (p: Product) => number,
): Product[] {
  return rows.filter((p) =>
    Object.entries(filters).every(([col, val]) => {
      if (!val) return true;
      if (col === "model") return (p.models || []).some((m) => m.name === val);
      return productFilterValue(p, col, lang, pickPrice) === val;
    }),
  );
}

export function uniqueFilterValues(rows: Product[], col: string, lang: string, pickPrice: (p: Product) => number): string[] {
  const set = new Set<string>();
  for (const p of rows) {
    const v = productFilterValue(p, col, lang, pickPrice);
    if (v) set.add(v);
  }
  return [...set].sort((a, b) => a.localeCompare(b, lang === "ar" ? "ar" : "en", { numeric: true }));
}

export function PosHeaderFilter({
  column,
  label,
  values,
  value,
  onChange,
  className = "",
}: {
  column: string;
  label: string;
  values: string[];
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const { tr } = useApp();
  const [open, setOpen] = useState(false);
  const thRef = useRef<HTMLTableCellElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ top: 0, left: 0, width: 160 });

  function place() {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.max(160, r.width);
    let left = r.left;
    if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
    if (left < 8) left = 8;
    setBox({ top: r.bottom + 4, left, width });
  }

  useEffect(() => {
    if (!open) return;
    place();
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (thRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onMove = () => place();
    document.addEventListener("mousedown", close);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open]);

  return (
    <th ref={thRef} className={`relative ${className}`}>
      <button
        ref={btnRef}
        type="button"
        className="inline-flex max-w-full items-center gap-1 text-start font-black"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        data-col={column}
      >
        <span className="truncate">{label}</span>
        {value ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-600" /> : null}
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              className="fixed z-[90] max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white p-1 text-slate-900 shadow-xl dark:border-[var(--border)] dark:bg-[var(--surface)] dark:text-[var(--text)]"
              style={{ top: box.top, left: box.left, minWidth: box.width }}
            >
              <button
                type="button"
                className={`block w-full rounded-md px-2 py-1.5 text-start text-xs ${!value ? "bg-slate-100 font-bold dark:bg-white/10" : "hover:bg-slate-50 dark:hover:bg-white/5"}`}
                onClick={() => { onChange(""); setOpen(false); }}
              >
                {tr("all")}
              </button>
              {values.map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`block w-full rounded-md px-2 py-1.5 text-start text-xs ${value === v ? "bg-slate-100 font-bold dark:bg-white/10" : "hover:bg-slate-50 dark:hover:bg-white/5"}`}
                  onClick={() => { onChange(v); setOpen(false); }}
                >
                  {v}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </th>
  );
}
