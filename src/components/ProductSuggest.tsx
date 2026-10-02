import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useApp } from "../context";
import { get } from "../lib/api";
import { money } from "../lib/format";
import { productDisplayName, rankProductHits } from "../lib/product-suggest";

const EMPTY: any[] = [];

export function useProductSuggest(q: string, enabled = true, extra: any[] = EMPTY) {
  const { lang } = useApp();
  const [pool, setPool] = useState<any[]>([]);
  const [remote, setRemote] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const blurRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    get<{ data: any[] }>("/api/products?pageSize=400&active=1")
      .then((r) => setPool(r.data || []))
      .catch(() => setPool([]));
  }, [enabled]);

  useEffect(() => {
    setHi(0);
    const n = q.trim();
    if (!enabled || !n) {
      setRemote([]);
      return;
    }
    const t = setTimeout(() => {
      get<{ data: any[] }>(`/api/products/search?q=${encodeURIComponent(n)}`)
        .then((r) => setRemote(r.data || []))
        .catch(() => {});
    }, 80);
    return () => clearTimeout(t);
  }, [q, enabled]);

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
    <div className="absolute start-0 end-0 z-50 mt-1 max-h-64 overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] shadow-lg">
      {hits.map((p, i) => (
        <button
          key={p.id}
          type="button"
          className={`block w-full px-3 py-2 text-start text-sm ${i === hi ? "bg-[var(--surface-2)]" : "hover:bg-[var(--surface-2)]"}`}
          onMouseDown={(e) => e.preventDefault()}
          onMouseEnter={() => onHover?.(i)}
          onClick={() => onPick(p)}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 font-bold">{productDisplayName(p, lang)}</div>
            {showPrice ? <div className="shrink-0 text-xs font-black">{money(p.selling_price, lang)}</div> : null}
          </div>
          <div className="text-[11px] text-slate-500">{[p.sku, p.barcode, lang === "ar" ? p.brand_ar : p.brand_en].filter(Boolean).join(" · ")}</div>
        </button>
      ))}
      {!hits.length ? <div className="px-3 py-3 text-sm text-slate-400">{tr("noResults")}</div> : null}
    </div>
  );
}
