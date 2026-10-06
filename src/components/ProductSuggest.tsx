import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useApp } from "../context";
import { get } from "../lib/api";
import { money, num } from "../lib/format";
import { placeLabel } from "../lib/place";
import { productDisplayName, rankProductHits } from "../lib/product-suggest";

const EMPTY: any[] = [];

export function useProductSuggest(q: string, enabled = true, extra: any[] = EMPTY) {
  const { lang, warehouseId } = useApp();
  const [pool, setPool] = useState<any[]>([]);
  const [remote, setRemote] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const blurRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    if (extra.length) {
      setPool([]);
      return;
    }
    const p = new URLSearchParams({ pageSize: "80", active: "1", pos: "1" });
    if (warehouseId) p.set("location_id", String(warehouseId));
    get<{ data: any[] }>(`/api/products?${p}`)
      .then((r) => setPool(r.data || []))
      .catch(() => setPool([]));
  }, [enabled, warehouseId, extra.length]);

  useEffect(() => {
    setHi(0);
    const n = q.trim();
    if (!enabled || !n) {
      setRemote([]);
      return;
    }
    const t = setTimeout(() => {
      get<{ data: any[] }>(`/api/products/search?q=${encodeURIComponent(n)}${warehouseId ? `&location_id=${warehouseId}` : ""}`)
        .then((r) => setRemote(r.data || []))
        .catch(() => {});
    }, 80);
    return () => clearTimeout(t);
  }, [q, enabled, warehouseId]);

  const hits = useMemo(() => {
    if (!q.trim()) return [];
    const byId = new Map<number, any>();
    for (const p of extra) byId.set(p.id, p);
    for (const p of pool) byId.set(p.id, p);
    for (const p of remote) byId.set(p.id, p);
    return rankProductHits([...byId.values()], q, lang);
  }, [pool, remote, extra, q, lang]);

  function cancelClose() {
    window.clearTimeout(blurRef.current);
  }

  function scheduleClose() {
    blurRef.current = window.setTimeout(() => setOpen(false), 160);
  }

  function onKeyDown(e: KeyboardEvent, onPick: (p: any) => void, onFallback?: () => void) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHi((i) => Math.min(hits.length - 1, i + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === "Enter") {
      if (open && hits[hi]) {
        e.preventDefault();
        onPick(hits[hi]);
        setOpen(false);
        return;
      }
      onFallback?.();
    }
  }

  return { hits, open: open && !!q.trim() && hits.length > 0, setOpen, hi, setHi, onKeyDown, cancelClose, scheduleClose };
}

export function ProductSuggestList({
  hits,
  open,
  hi,
  onPick,
  onHover,
  showPrice,
}: {
  hits: any[];
  open: boolean;
  hi: number;
  onPick: (p: any) => void;
  onHover?: (i: number) => void;
  showPrice?: boolean;
}) {
  const { lang, tr } = useApp();
  if (!open) return null;
  return (
    <div className="product-suggest-list absolute start-0 z-50 mt-1 max-h-80 min-w-full w-max max-w-[min(40rem,90vw)] overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-lg">
      {hits.map((p, i) => {
        const type = (lang === "ar" ? p.part_type_ar : p.part_type_en) || p.part_type_ar || "";
        const models = (p.models || []).map((m: { name?: string }) => m.name).filter(Boolean).join(" · ");
        const category = [p.quality, lang === "ar" ? p.category_ar : p.category_en].filter(Boolean).join(" · ");
        const qty = p.kind === "service" || p.non_stock ? "∞" : num(p.available, lang);
        const place = placeLabel(p);
        return (
          <button
            key={p.id}
            type="button"
            className={`block w-full px-3 py-2.5 text-start text-sm text-[var(--text)] ${i === hi ? "bg-[var(--surface-2)]" : "hover:bg-[var(--surface-2)]"}`}
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => onHover?.(i)}
            onClick={() => onPick(p)}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 font-bold">{productDisplayName(p, lang)}</div>
              {showPrice ? <div className="shrink-0 text-xs font-black">{money(p.selling_price, lang)}</div> : null}
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
              {type ? <span>{type}</span> : null}
              {models ? <span>{models}</span> : null}
              {category ? <span>{category}</span> : null}
              <span>{tr("available")}: {qty}</span>
              {place ? <span>{place}</span> : null}
            </div>
          </button>
        );
      })}
      {!hits.length ? <div className="px-3 py-3 text-sm text-slate-400">{tr("noResults")}</div> : null}
    </div>
  );
}
