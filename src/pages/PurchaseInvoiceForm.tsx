import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { useApp } from "../context";
import { get, post } from "../lib/api";
import { money } from "../lib/format";
import { Btn, ErrorNote, Field, SearchPick, inputCls } from "../components/ui";
import { useActionError } from "../lib/errors";
import { matchScanned, playSound } from "../lib/sounds";

export type PurchaseLine = {
  product_id: number;
  sku: string;
  name: string;
  quality: string;
  category: string;
  type: string;
  brand: string;
  selling_price: number;
  last_supplier: string;
  last_price: number;
  unit_cost: number;
  quantity: number;
};

function loc(lang: string, ar?: string | null, en?: string | null) {
  const a = String(ar || "").trim();
  const e = String(en || "").trim();
  return lang === "ar" ? (a || e) : (e || a);
}

export function lineFromProduct(p: any, lang: string): PurchaseLine {
  const quality = String(p.quality || "").trim();
  const categoryName = loc(lang, p.category_ar, p.category_en);
  return {
    product_id: Number(p.id),
    sku: String(p.sku || ""),
    name: loc(lang, p.name_ar, p.name_en),
    quality,
    category: quality || categoryName,
    type: loc(lang, p.part_type_ar, p.part_type_en),
    brand: loc(lang, p.brand_ar, p.brand_en),
    selling_price: Number(p.selling_price || 0),
    last_supplier: String(p.last_supplier_name || p.supplier_name || ""),
    last_price: Number(p.last_buy_price ?? p.last_purchase_price ?? p.purchase_price ?? 0),
    unit_cost: Number(p.last_purchase_price || p.purchase_price || 0),
    quantity: 1,
  };
}

function todayIso() {
  const d = new Date();
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

export default function PurchaseInvoiceForm() {
  const { tr, lang, lookups, warehouseId } = useApp();
  const nav = useNavigate();
  const act = useActionError();
  const [supplierId, setSupplierId] = useState("");
  const [date, setDate] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<PurchaseLine[]>([]);
  const priceRefs = useRef<Array<HTMLInputElement | null>>([]);
  const qtyRefs = useRef<Array<HTMLInputElement | null>>([]);
  const sellRefs = useRef<Array<HTMLInputElement | null>>([]);
  const focusRow = useRef<number | null>(null);

  useEffect(() => {
    if (focusRow.current == null) return;
    const i = focusRow.current;
    focusRow.current = null;
    requestAnimationFrame(() => priceRefs.current[i]?.focus());
  }, [items.length]);

  function addProduct(p: any) {
    const line = lineFromProduct(p, lang);
    if (!line.product_id) return;
    setItems((rows) => {
      focusRow.current = rows.length;
      return [...rows, line];
    });
    act.clear();
  }

  function updateLine(index: number, patch: Partial<PurchaseLine>) {
    setItems((rows) => rows.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  const purchaseTotal = items.reduce((s, it) => s + Number(it.quantity || 0) * Number(it.unit_cost || 0), 0);

  async function save() {
    if (!supplierId) {
      act.fail(undefined, "errSupplierRequired");
      return;
    }
    if (!items.length) {
      act.fail(undefined, "errNoItems");
      return;
    }
    if (items.some((it) => Number(it.quantity) <= 0)) {
      act.fail(undefined, "errInvalidQty");
      return;
    }
    try {
      const r = await post<{ id: number }>(`/api/inventory/purchases`, {
        supplier_id: Number(supplierId),
        date,
        notes: notes || null,
        items: items.map((it) => ({
          product_id: it.product_id,
          quantity: Number(it.quantity),
          unit_cost: Number(it.unit_cost || 0),
          selling_price: Number(it.selling_price || 0),
        })),
      });
      playSound("done");
      nav(`/purchases/${r.id}`);
    } catch (e) {
      act.fail(e);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link to="/purchases" className="text-sm font-bold text-slate-500">{tr("purchases")}</Link>
          <h1 className="text-2xl font-black">{tr("newPurchase")}</h1>
        </div>
        <div className="flex gap-2">
          <Btn kind="ghost" onClick={() => nav("/purchases")}>{tr("cancel")}</Btn>
          <Btn onClick={save}>{tr("savePurchase")}</Btn>
        </div>
      </div>
      <p className="text-sm font-bold leading-6 text-[#0b1f33] dark:text-[#f8f1de]">{tr("purchaseHint")}</p>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label={tr("supplier")}>
          <SearchPick
            path="/api/suppliers"
            valueId={supplierId}
            valueLabel={lookups?.suppliers.find((s) => String(s.id) === String(supplierId))?.name || ""}
            placeholder={tr("searchAndPick")}
            subtitle={(r) => [r.phone, r.city].filter(Boolean).join(" · ")}
            onPick={(row) => setSupplierId(row ? String(row.id) : "")}
          />
        </Field>
        <Field label={tr("date")}>
          <input className={inputCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={tr("notes")}>
          <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
        <div className="mb-2 text-sm font-black text-[#0b1f33] dark:text-[#f8f1de]">{tr("addPurchaseItem")}</div>
        <PurchaseProductPick warehouseId={warehouseId} onPick={addProduct} />
      </div>
      <div className="table-wrap overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
        <table className="purchase-invoice-table min-w-[1100px]">
          <thead>
            <tr>
              <th>{tr("item")}</th>
              <th>{tr("quality")}</th>
              <th>{tr("partType")}</th>
              <th>{tr("brand")}</th>
              <th>{tr("sellingPrice")}</th>
              <th>{tr("purchasePrice")}</th>
              <th>{tr("qty")}</th>
              <th>{tr("total")}</th>
              <th>{tr("actions")}</th>
            </tr>
          </thead>
          <tbody>
            {items.length ? items.map((it, i) => (
              <tr key={`${it.product_id}-${i}`}>
                <td>
                  <div className="purchase-item-name font-black">{it.name || "—"}</div>
                  <div className="purchase-item-sku text-xs font-bold">{it.sku}</div>
                  <div className="purchase-last-buy mt-1 text-[11px]">
                    {tr("lastBuyContext")}: {it.last_supplier || "—"} · {money(it.last_price, lang)}
                  </div>
                </td>
                <td className="purchase-cell text-sm font-bold">{it.category || "—"}</td>
                <td className="purchase-cell text-sm font-bold">{it.type || "—"}</td>
                <td className="purchase-cell text-sm font-bold">{it.brand || "—"}</td>
                <td>
                  <input
                    ref={(el) => { sellRefs.current[i] = el; }}
                    className={`${inputCls} min-w-24`}
                    type="text"
                    inputMode="decimal"
                    tabIndex={i * 3 + 1}
                    value={it.selling_price}
                    onChange={(e) => updateLine(i, { selling_price: Number(e.target.value || 0) })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        priceRefs.current[i]?.focus();
                      }
                    }}
                  />
                </td>
                <td>
                  <input
                    ref={(el) => { priceRefs.current[i] = el; }}
                    className={`${inputCls} min-w-24`}
                    type="text"
                    inputMode="decimal"
                    tabIndex={i * 3 + 2}
                    value={it.unit_cost}
                    onChange={(e) => updateLine(i, { unit_cost: Number(e.target.value || 0) })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        qtyRefs.current[i]?.focus();
                      }
                    }}
                  />
                </td>
                <td>
                  <input
                    ref={(el) => { qtyRefs.current[i] = el; }}
                    className={`${inputCls} min-w-20`}
                    type="text"
                    inputMode="decimal"
                    tabIndex={i * 3 + 3}
                    value={it.quantity}
                    onChange={(e) => updateLine(i, { quantity: Number(e.target.value || 0) })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (sellRefs.current[i + 1]) sellRefs.current[i + 1]?.focus();
                        else priceRefs.current[i + 1]?.focus();
                      }
                    }}
                  />
                </td>
                <td className="whitespace-nowrap font-black text-[#0b1f33] dark:text-[#f8f1de]">{money(Number(it.quantity || 0) * Number(it.unit_cost || 0), lang)}</td>
                <td>
                  <button
                    type="button"
                    className="filter-link is-danger rounded-lg p-1"
                    tabIndex={-1}
                    title={tr("delete")}
                    onClick={() => setItems(items.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-sm font-bold text-slate-500">{tr("noPurchaseItems")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between rounded-xl bg-[#0b1f33] px-4 py-3 text-sm font-black text-[#f8f1de]">
        <span>{tr("total")}</span>
        <span>{money(purchaseTotal, lang)}</span>
      </div>
      <ErrorNote message={act.message} />
    </div>
  );
}

function PurchaseProductPick({ warehouseId, onPick }: { warehouseId?: number | string | null; onPick: (p: any) => void }) {
  const { tr, lang } = useApp();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<any[]>([]);
  const [miss, setMiss] = useState("");
  useEffect(() => {
    if (!q.trim()) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => {
      const p = new URLSearchParams({ q: q.trim() });
      if (warehouseId) p.set("location_id", String(warehouseId));
      get<{ data: any[] }>(`/api/products/search?${p}`)
        .then((r) => setHits(r.data || []))
        .catch(() => setHits([]));
    }, 120);
    return () => clearTimeout(t);
  }, [q, warehouseId]);

  function pick(p: any) {
    playSound("ok");
    setMiss("");
    onPick(p);
    setQ("");
    setHits([]);
  }

  return (
    <div className="relative">
      <input
        className={inputCls}
        placeholder={tr("searchProduct")}
        value={q}
        onChange={(e) => { setQ(e.target.value); setMiss(""); }}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          const exact = matchScanned(hits, q) || (hits.length === 1 ? hits[0] : undefined);
          if (!exact) {
            playSound("err");
            setMiss(tr("errProductNotFound"));
            return;
          }
          pick(exact);
        }}
      />
      <ErrorNote message={miss} />
      {hits.length ? (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-[var(--border)] bg-white text-[#0f172a] shadow-lg dark:bg-[#151b24] dark:text-[#f8f1de]">
          {hits.map((p) => (
            <button
              key={p.id}
              type="button"
              className="block w-full px-3 py-2 text-start text-sm hover:bg-amber-50 dark:hover:bg-white/5"
              onClick={() => pick(p)}
            >
              <div className="font-black">{p.sku} — {loc(lang, p.name_ar, p.name_en)}</div>
              <div className="text-[11px] font-bold text-slate-500">
                {[p.quality, loc(lang, p.part_type_ar, p.part_type_en), loc(lang, p.brand_ar, p.brand_en)].filter(Boolean).join(" · ")}
                {p.selling_price != null ? ` · ${tr("sellingPrice")} ${money(p.selling_price, lang)}` : ""}
              </div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
