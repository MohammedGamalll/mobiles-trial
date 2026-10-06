import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useApp } from "../context";
import { get, post, put, del } from "../lib/api";
import { invalidateGetCache } from "../lib/query-cache";
import { authHeaders } from "../lib/session";
import { money, num, statusClass, statusLabel } from "../lib/format";
import { Btn, ErrorNote, ExportBtn, Field, Modal, PageLoading, PrintBtn, PrintLetterhead, Stat, inputCls, printPage } from "../components/ui";
import { apiMessage, useActionError } from "../lib/errors";
import { placeLabel } from "../lib/place";
import { EmptyFilterState, SmartFilter } from "../components/SmartFilter";
import { useListQuery } from "../hooks/useListQuery";
import { Barcode } from "../components/Barcode";
import { useConfirm } from "../components/Confirm";
import { playSound } from "../lib/sounds";
import { LocationSelect } from "../components/PlaceFields";
import {
  PosHeaderFilter,
  applyPosHeaderFilters,
  uniqueFilterValues,
} from "../components/PosHeaderFilter";
import type { Product } from "../hooks/usePOSLogic";

function lookupLabel(row: { name_ar?: string; name_en?: string; name?: string } | undefined, lang: string) {
  if (!row) return "";
  return (lang === "ar" ? row.name_ar : row.name_en) || row.name_ar || row.name_en || row.name || "";
}

function idForLabel(rows: any[] | undefined, label: string, lang: string) {
  if (!label) return "";
  const hit = (rows || []).find((r) => lookupLabel(r, lang) === label);
  return hit ? String(hit.id) : "";
}

function labelForId(rows: any[] | undefined, id: string | number | undefined, lang: string) {
  if (id == null || String(id) === "") return "";
  return lookupLabel((rows || []).find((r) => String(r.id) === String(id)), lang);
}

function parseScale(raw: unknown) {
  if (!raw) return { length: "", width: "", height: "", weight: "" };
  if (typeof raw === "object") {
    const o = raw as any;
    return { length: String(o.length ?? ""), width: String(o.width ?? ""), height: String(o.height ?? ""), weight: String(o.weight ?? "") };
  }
  try {
    const o = JSON.parse(String(raw));
    return { length: String(o.length ?? ""), width: String(o.width ?? ""), height: String(o.height ?? ""), weight: String(o.weight ?? "") };
  } catch {
    return { length: "", width: "", height: "", weight: "" };
  }
}

function ShippingFields({
  value,
  onChange,
  tr,
}: {
  value: { length: string; width: string; height: string; weight: string };
  onChange: (v: { length: string; width: string; height: string; weight: string }) => void;
  tr: (k: any) => string;
}) {
  const keys = [
    ["length", "dimLength"],
    ["width", "dimWidth"],
    ["height", "dimHeight"],
    ["weight", "dimWeight"],
  ] as const;
  return (
    <div className="md:col-span-2">
      <div className="mb-2 font-bold">{tr("shippingLoading")}</div>
      <div className="grid gap-2 md:grid-cols-4">
        {keys.map(([k, label]) => (
          <Field key={k} label={tr(label)}>
            <input
              className={inputCls}
              type="text"
              inputMode="decimal"
              value={value[k]}
              onChange={(e) => onChange({ ...value, [k]: e.target.value })}
            />
          </Field>
        ))}
      </div>
    </div>
  );
}

export default function Products() {
  const { tr, lang, lookups, can, refreshLookups, warehouseId } = useApp();
  const [sp] = useSearchParams();
  const f = useListQuery("products", { q: sp.get("q") || "", status: sp.get("status") || "" });
  const [data, setData] = useState<any[]>([]);
  const [totals, setTotals] = useState<any>({});
  const [daily, setDaily] = useState<{ purchases: any[]; shipments: any[]; date?: string }>({ purchases: [], shipments: [] });
  const [open, setOpen] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);
  const [bulk, setBulk] = useState("");
  const [offers, setOffers] = useState<any[]>([]);
  const [offer, setOffer] = useState({ product_id: "", min_qty: 2, discount_type: "percent", discount_value: 5, name: "", valid_from: "", valid_to: "" });
  const [form, setForm] = useState<any>(empty());
  const [view, setView] = useState<"list" | "board">("list");
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");
  const [catalogQualities, setCatalogQualities] = useState<string[]>([]);
  const loadGen = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const { confirmDelete, confirm, dialog } = useConfirm();
  const act = useActionError();

  function empty() {
    return {
      id: 0,
      sku: "",
      barcode: "",
      part_number: "",
      name_ar: "",
      name_en: "",
      brand_id: "",
      part_type_id: "",
      category_id: "",
      location_id: "",
      warehouse: "",
      rack: "",
      shelf: "",
      drawer: "",
      box: "",
      supplier_id: "",
      purchase_price: 0,
      selling_price: 0,
      wholesale_price: 0,
      min_selling_price: 0,
      min_stock: 0,
      model_ids: [] as number[],
      notes: "",
      kind: "product",
      color: "",
      quality: "",
      parent_id: "",
      unit: "قطعة",
      reorder_point: 0,
      track_serial: 0,
      extra_code1: "",
      extra_code2: "",
      extra_codes: "",
      discount_pct: 0,
      price_2: 0,
      price_3: 0,
      price_4: 0,
      no_qty: 0,
      quick_list: 0,
      non_stock: 0,
      specs: "",
      expiry_days: "",
      opening_qty: 0,
      image_url: "",
      ship: { length: "", width: "", height: "", weight: "" },
      units: [{ name: "قطعة", factor: 1, barcode: "", selling_price: 0, is_base: 1 }],
    };
  }

  async function load() {
    const gen = ++loadGen.current;
    const p = new URLSearchParams(f.qs);
    p.set("pageSize", "80");
    if (!p.get("page")) p.set("page", "1");
    if (warehouseId) {
      p.set("location_id", String(warehouseId));
      p.delete("locations");
      p.delete("warehouse_id");
      p.delete("warehouse");
      p.delete("bay_id");
      p.delete("shelf_id");
      p.delete("bin_id");
      p.delete("fork_id");
    }
    const path = `/api/products?${p}`;
    setLoading(true);
    setLoadErr("");
    try {
      const r = await get<{ data: any[]; totals?: any }>(path);
      if (gen !== loadGen.current) return;
      setData(r.data);
      setTotals(r.totals || {});
    } catch (e) {
      if (gen !== loadGen.current) return;
      setLoadErr(apiMessage(tr, e));
    } finally {
      if (gen === loadGen.current) setLoading(false);
    }
    if (gen !== loadGen.current) return;
    const ops = new URLSearchParams();
    if (f.values.category_id) ops.set("category_id", String(f.values.category_id));
    get<{ purchases: any[]; shipments: any[]; date: string }>(`/api/inventory/daily-ops?${ops}`)
      .then((d) => setDaily({ purchases: d.purchases || [], shipments: d.shipments || [], date: d.date }))
      .catch(() => setDaily({ purchases: [], shipments: [] }));
    get<{ data: any[] }>("/api/offers").then((o) => setOffers(o.data || [])).catch(() => {});
  }
  async function loadQualities() {
    try {
      const r = await get<{ data: { name: string }[] }>("/api/qualities");
      setCatalogQualities((r.data || []).map((x) => String(x.name || "").trim()).filter(Boolean));
    } catch {
      const r = await get<{ data: { quality?: string }[] }>("/api/products?pageSize=5000");
      setCatalogQualities([...new Set((r.data || []).map((p) => String(p.quality || "").trim()).filter(Boolean))]);
    }
  }

  useEffect(() => {
    let live = true;
    load().then(() => { if (!live) return; }).catch(() => {});
    return () => { live = false; };
  }, [f.qs, warehouseId]);

  useEffect(() => {
    loadQualities().catch(() => {});
  }, []);

  function listFilterQuery(extra: Record<string, string> = {}) {
    const p = new URLSearchParams(f.qs);
    p.delete("page");
    p.delete("pageSize");
    if (warehouseId) {
      p.set("location_id", String(warehouseId));
      p.delete("locations");
      p.delete("warehouse_id");
      p.delete("warehouse");
      p.delete("bay_id");
      p.delete("shelf_id");
      p.delete("bin_id");
      p.delete("fork_id");
    }
    Object.entries(extra).forEach(([k, v]) => { if (v) p.set(k, v); });
    return p.toString();
  }

  async function printFiltered() {
    const r = await get<{ data: any[] }>(`/api/products?${listFilterQuery({ page: "1", pageSize: "5000" })}`);
    setData(r.data || []);
    requestAnimationFrame(() => printPage());
  }

  const qualities = Array.from(new Set([
    ...catalogQualities,
    ...(lookups?.qualities || []).map((q) => String(q.name || "").trim()),
    ...data.map((p) => String(p.quality || "").trim()).filter(Boolean),
    String(f.values.quality || "").trim(),
  ].filter(Boolean))).sort((a, b) => a.localeCompare(b, lang === "ar" ? "ar" : "en"));

  const [headerFilters, setHeaderFilters] = useState<Record<string, string>>({});
  const setHeaderFilter = (col: string, v: string) => setHeaderFilters((prev) => ({ ...prev, [col]: v }));
  const pickPrice = (p: Product) => Number(p.selling_price) || 0;
  const catalogRows = useMemo(
    () => applyPosHeaderFilters(data as Product[], headerFilters, lang, pickPrice),
    [data, headerFilters, lang],
  );
  const statusFilterOpts = [
    { value: "in", label: tr("stockIn") },
    { value: "low", label: tr("stockLow") },
    { value: "out", label: tr("stockOut") },
    { value: "dead", label: tr("deadStock") },
  ];
  const partTypeOptions = [...new Set((lookups?.part_types || []).map((r) => lookupLabel(r, lang)).filter(Boolean))].sort((a, b) => a.localeCompare(b, lang === "ar" ? "ar" : "en"));
  const brandOptions = [...new Set((lookups?.brands || []).map((r) => lookupLabel(r, lang)).filter(Boolean))].sort((a, b) => a.localeCompare(b, lang === "ar" ? "ar" : "en"));
  const modelOptions = [...new Set(
    (lookups?.models || [])
      .filter((m) => !f.values.brand_id || String((m as any).brand_id) === String(f.values.brand_id))
      .map((r) => lookupLabel(r, lang))
      .filter(Boolean),
  )].sort((a, b) => a.localeCompare(b, lang === "ar" ? "ar" : "en"));

  return (
    <div className="space-y-4">
      <PrintLetterhead title={tr("products")} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-black">{tr("products")}</h1>
        <div className="no-print page-actions flex gap-2">
          <ExportBtn kind="products" query={listFilterQuery()} />
          <PrintBtn onClick={printFiltered} />
          {can("prices.manage") || can("products.edit") ? (
            <Btn kind="soft" onClick={() => setOfferOpen(true)}>{tr("qtyOffer")}</Btn>
          ) : null}
          {can("prices.manage") || can("products.edit") ? (
            <Btn kind="soft" onClick={() => setPriceOpen(true)}>{tr("bulkPrices")}</Btn>
          ) : null}
          {can("products.create") || can("import.manage") ? (
            <>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  confirm(tr("uploadProducts"), `${tr("replaceProductsHint")}\n${file.name}`, async () => {
                    const fd = new FormData();
                    fd.append("file", file);
                    fd.append("replace", "1");
                    const res = await fetch("/api/import/products-file", { method: "POST", credentials: "include", headers: authHeaders(), body: fd });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) throw Object.assign(new Error(data.error || "fail"), { payload: data });
                    playSound("done");
                    act.setMessage(`${tr("importProductsOk")} — ${data.inserted || 0}/${data.total || 0}`);
                    invalidateGetCache();
                    await refreshLookups();
                    await loadQualities();
                    await load();
                  });
                }}
              />
              <Btn kind="soft" onClick={() => fileRef.current?.click()}>{tr("uploadProducts")}</Btn>
            </>
          ) : null}
          {can("products.create") ? (
            <Btn onClick={() => { act.clear(); setForm(empty()); setOpen(true); }}>{tr("addProduct")}</Btn>
          ) : null}
          <Btn kind="ghost" onClick={() => setView(view === "list" ? "board" : "list")}>{view === "list" ? tr("boardView") : tr("listView")}</Btn>
        </div>
      </div>
      {act.message ? <p className="text-sm font-bold text-emerald-700">{act.message}</p> : null}
      <div className="mb-3 grid gap-3 gx-kpi md:grid-cols-4">
        <Stat label={tr("products")} value={`${num(data.length, lang)} / ${num(totals.count, lang)}`} />
        <Stat label={tr("qty")} value={num(totals.qty, lang)} />
        <Stat label={tr("stockValue")} value={money(totals.value, lang)} />
        {can("costs.view") && totals.cost_value != null ? <Stat label={tr("lineValue")} value={money(totals.cost_value, lang)} accent="emerald" /> : null}
      </div>
      <SmartFilter
        f={f}
        date={false}
        suggestProducts
        suggestRows={data}
        searchPlaceholder={tr("searchProduct")}
        fields={[
          { key: "kind", label: "productKind", type: "select", options: [{ value: "product", label: tr("kindProduct") }, { value: "service", label: tr("kindService") }] },
          { key: "quality", label: "quality", type: "select", options: qualities.map((q) => ({ value: q, label: q })) },
          { key: "part_type_id", label: "partType", type: "select", lookup: "part_types" },
          { key: "brand_id", label: "brand", type: "select", lookup: "brands" },
          { key: "model_id", label: "model", type: "select", lookup: "models" },
          { key: "compatible_model_id", label: "compatibleModel", type: "select", lookup: "models" },
          { key: "color", label: "color", type: "text" },
          { key: "supplier_id", label: "suppliers", type: "select", lookup: "suppliers" },
          { key: "locations", label: "location", type: "locations" },
          { key: "status", label: "status", type: "select", options: [
            { value: "in", label: tr("stockIn") },
            { value: "low", label: tr("stockLow") },
            { value: "out", label: tr("stockOut") },
            { value: "dead", label: tr("deadStock") },
          ] },
          { key: "price", label: "priceRange", type: "range", minKey: "price_min", maxKey: "price_max" },
          { key: "qty", label: "qtyRange", type: "range", minKey: "qty_min", maxKey: "qty_max" },
        ]}
        sorts={[
          { value: "newest", label: tr("newestFirst") },
          { value: "oldest", label: tr("oldestFirst") },
          { value: "name_az", label: tr("nameAZ") },
          { value: "name_za", label: tr("nameZA") },
          { value: "price_high", label: tr("highestPrice") },
          { value: "price_low", label: tr("lowestPrice") },
          { value: "moved", label: tr("mostMoved") },
        ]}
      />
      {loading ? <PageLoading label={tr("loadingProducts")} /> : loadErr ? (
        <div className="rounded-2xl border border-rose-100 bg-white px-4 py-8 text-center">
          <ErrorNote message={loadErr} />
          <Btn className="mt-3" onClick={() => void load()}>{tr("retry")}</Btn>
        </div>
      ) : !data.length ? <EmptyFilterState onClear={f.clear} /> : view === "board" ? (
      <div className="acc-board">
        {[...data.reduce((m, p) => {
            const k = (lang === "ar" ? p.brand_ar : p.brand_en) || tr("brands");
            const arr = m.get(k) || [];
            arr.push(p);
            m.set(k, arr);
            return m;
          }, new Map<string, any[]>())].map(([brand, items]) => (
          <div key={brand} className="acc-col">
            <div className="text-sm font-black">{brand}</div>
            {items.map((p: any) => (
              <div key={p.id} className="acc-item">
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold">{lang === "ar" ? p.name_ar : p.name_en}</div>
                  <div className="text-[11px] text-slate-400">{p.sku} · {money(p.selling_price, lang)}</div>
                  <span className={statusClass(p.stock_status)}>{num(p.available, lang)}</span>
                </div>
                <div className="flex flex-col gap-1 text-end">
                  <Link className="text-xs font-bold text-cyan-700" to={`/products/${p.id}`}>{tr("view")}</Link>
                  {can("products.edit") ? (
                    <button className="text-xs font-bold text-cyan-700" onClick={() => {
                      setForm({
                        ...empty(),
                        ...p,
                        brand_id: p.brand_id || "",
                        part_type_id: p.part_type_id || "",
                        category_id: p.category_id || "",
                        location_id: p.location_id || "",
                        warehouse: p.warehouse || "",
                        rack: p.rack || "",
                        shelf: p.shelf || "",
                        drawer: p.drawer || "",
                        box: p.box || "",
                        supplier_id: p.supplier_id || "",
                        parent_id: p.parent_id || "",
                        model_ids: (p.models || []).map((m: any) => m.id),
                        units: p.units?.length ? p.units : empty().units,
                        ship: parseScale(p.scale),
                        opening_qty: 0,
                      });
                      act.clear();
                      setOpen(true);
                    }}>{tr("edit")}</button>
                  ) : null}
                  {can("products.delete") ? (
                    <button className="text-xs font-bold text-rose-600" onClick={() => confirmDelete(lang === "ar" ? p.name_ar : p.name_en, async () => { await del(`/api/products/${p.id}`); load(); })}>{tr("delete")}</button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      ) : (
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <PosHeaderFilter
                  column="name"
                  label={tr("name")}
                  values={uniqueFilterValues(data as Product[], "name", lang, pickPrice)}
                  value={headerFilters.name || ""}
                  onChange={(v) => setHeaderFilter("name", v)}
                />
                <PosHeaderFilter
                  column="sku"
                  label={tr("sku")}
                  values={uniqueFilterValues(data as Product[], "sku", lang, pickPrice)}
                  value={headerFilters.sku || ""}
                  onChange={(v) => setHeaderFilter("sku", v)}
                />
                <PosHeaderFilter
                  column="category"
                  label={tr("quality")}
                  values={qualities}
                  value={String(f.values.quality || "")}
                  onChange={(v) => f.set("quality", v)}
                />
                <PosHeaderFilter
                  column="partType"
                  label={tr("partType")}
                  values={partTypeOptions}
                  value={labelForId(lookups?.part_types, f.values.part_type_id, lang)}
                  onChange={(v) => f.set("part_type_id", idForLabel(lookups?.part_types, v, lang))}
                />
                <PosHeaderFilter
                  column="brand"
                  label={tr("brand")}
                  values={brandOptions}
                  value={labelForId(lookups?.brands, f.values.brand_id, lang)}
                  onChange={(v) => f.setMany({ brand_id: idForLabel(lookups?.brands, v, lang), model_id: "" })}
                />
                <PosHeaderFilter
                  column="model"
                  label={tr("model")}
                  values={modelOptions}
                  value={labelForId(lookups?.models, f.values.model_id, lang)}
                  onChange={(v) => f.set("model_id", idForLabel(lookups?.models, v, lang))}
                />
                <PosHeaderFilter
                  column="status"
                  label={tr("available")}
                  values={statusFilterOpts.map((s) => s.label)}
                  value={statusFilterOpts.find((s) => s.value === f.values.status)?.label || ""}
                  onChange={(v) => f.set("status", statusFilterOpts.find((s) => s.label === v)?.value || "")}
                />
                <th>{tr("lineValue")}</th>
                <th>{tr("openingQty")}</th>
                <th>{tr("warehouseDist")}</th>
                <PosHeaderFilter
                  column="selling"
                  label={tr("sellingPrice")}
                  values={uniqueFilterValues(data as Product[], "selling", lang, pickPrice)}
                  value={headerFilters.selling || ""}
                  onChange={(v) => setHeaderFilter("selling", v)}
                />
                <PosHeaderFilter
                  column="location"
                  label={tr("location")}
                  values={uniqueFilterValues(data as Product[], "location", lang, pickPrice)}
                  value={headerFilters.location || ""}
                  onChange={(v) => setHeaderFilter("location", v)}
                />
                <th className="no-print"></th>
              </tr>
            </thead>
            <tbody>
              {catalogRows.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="font-semibold">{lang === "ar" ? p.name_ar : p.name_en}</div>
                    <div className="text-xs text-slate-400">
                      {p.kind === "service" ? tr("kindService") : (lang === "ar" ? p.part_type_ar : p.part_type_en)}
                      {p.color ? ` · ${p.color}` : ""}
                    </div>
                  </td>
                  <td>{p.sku}</td>
                  <td>{p.quality || "—"}</td>
                  <td>{lang === "ar" ? p.part_type_ar : p.part_type_en}</td>
                  <td>{lang === "ar" ? p.brand_ar : p.brand_en}</td>
                  <td className="max-w-40 truncate">{(p.models || []).map((m: any) => m.name).join(", ")}</td>
                  <td>
                    <span className={statusClass(p.stock_status)}>{num(p.available, lang)}</span>
                  </td>
                  <td>
                    <div>{money(p.stock_value ?? (Number(p.available) || 0) * (Number(p.selling_price) || 0), lang)}</div>
                    {can("costs.view") && p.cost_value != null ? <div className="text-xs text-slate-400">{money(p.cost_value, lang)}</div> : null}
                  </td>
                  <td>{num(p.opening_qty, lang)}</td>
                  <td className="text-xs">
                    {(p.warehouses || []).length
                      ? (p.warehouses as { warehouse: string; qty: number }[]).map((w) => `${w.warehouse}${w.qty ? `: ${num(w.qty, lang)}` : ""}`).join(" · ")
                      : placeLabel(p) || "—"}
                  </td>
                  <td>{money(p.selling_price, lang)}</td>
                  <td className="text-xs">{p.location_name}</td>
                  <td className="no-print">
                    <div className="flex flex-wrap gap-2">
                      <Link className="filter-link text-sm" to={`/products/${p.id}`}>{tr("view")}</Link>
                      {can("products.edit") ? (
                        <button className="filter-link text-sm" onClick={() => {
                          setForm({
                            ...empty(),
                            ...p,
                            brand_id: p.brand_id || "",
                            part_type_id: p.part_type_id || "",
                            category_id: p.category_id || "",
                            location_id: p.location_id || "",
                            warehouse: p.warehouse || "",
                            rack: p.rack || "",
                            shelf: p.shelf || "",
                            drawer: p.drawer || "",
                            box: p.box || "",
                            supplier_id: p.supplier_id || "",
                            parent_id: p.parent_id || "",
                            model_ids: (p.models || []).map((m: any) => m.id),
                        units: p.units?.length ? p.units : empty().units,
                        ship: parseScale(p.scale),
                        opening_qty: 0,
                      });
                      act.clear();
                      setOpen(true);
                    }}>{tr("edit")}</button>
                      ) : null}
                      {can("products.delete") ? (
                        <button className="filter-link is-danger text-sm" onClick={() => confirmDelete(lang === "ar" ? p.name_ar : p.name_en, async () => { await del(`/api/products/${p.id}`); load(); })}>{tr("delete")}</button>
                      ) : null}
                      <Link className="filter-link is-muted text-sm" to={`/inventory?q=${encodeURIComponent(p.sku)}`}>{tr("movements")}</Link>
                      <Link className="filter-link is-muted text-sm" to="/serials">{tr("serialSearch")}</Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}
      <div className="no-print flex flex-wrap items-center justify-end gap-2 text-sm font-bold">
        <button type="button" className="rounded-xl border px-3 py-1 disabled:opacity-40" disabled={f.page <= 1 || loading} onClick={() => f.set("page", String(f.page - 1))}>{tr("prev")}</button>
        <span>{num(f.page, lang)} / {num(Math.max(1, Math.ceil((Number(totals.count) || 0) / 80)), lang)}</span>
        <button type="button" className="rounded-xl border px-3 py-1 disabled:opacity-40" disabled={loading || f.page >= Math.max(1, Math.ceil((Number(totals.count) || 0) / 80))} onClick={() => f.set("page", String(f.page + 1))}>{tr("next")}</button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
          <div className="mb-2 font-bold">{tr("dailyPurchases")}{daily.date ? ` · ${daily.date}` : ""}</div>
          {!daily.purchases.length ? <div className="text-sm text-slate-400">{tr("noData")}</div> : daily.purchases.slice(0, 20).map((r) => (
            <div key={`${r.purchase_id}-${r.product_id}-${r.sku}`} className="flex items-center justify-between border-b border-slate-50 py-2 text-sm">
              <div>
                <Link className="font-bold text-cyan-800" to={`/purchases/${r.purchase_id}`}>{r.number}</Link>
                <div className="text-xs text-slate-400">{lang === "ar" ? r.name_ar : r.name_en} · {r.sku}</div>
              </div>
              <div className="text-end">
                <div>{num(r.quantity, lang)}</div>
                <div className="text-xs text-slate-400">{money(r.total, lang)}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
          <div className="mb-2 font-bold">{tr("dailyShipments")}</div>
          {!daily.shipments.length ? <div className="text-sm text-slate-400">{tr("noData")}</div> : daily.shipments.slice(0, 20).map((r) => (
            <div key={r.id} className="flex items-center justify-between border-b border-slate-50 py-2 text-sm">
              <div>
                <div className="font-bold">{lang === "ar" ? r.name_ar : r.name_en}</div>
                <div className="text-xs text-slate-400">{r.sku} · {r.type} · {r.notes || r.reference_type}</div>
              </div>
              <div className="text-end font-bold">{num(r.qty, lang)}</div>
            </div>
          ))}
        </div>
      </div>
      <Modal open={offerOpen} title={tr("qtyOffer")} onClose={() => setOfferOpen(false)}>
        <div className="mb-3 space-y-2 text-sm">
          {offers.map((o) => (
            <div key={o.id} className="rounded-xl border px-3 py-2">{o.sku} · {lang === "ar" ? o.name_ar : o.name_en} · ≥{o.min_qty} · {o.discount_type === "fixed" ? money(o.discount_value, lang) : `${o.discount_value}%`}</div>
          ))}
        </div>
        <Field label={tr("products")}>
          <select className={inputCls} value={offer.product_id} onChange={(e) => setOffer({ ...offer, product_id: e.target.value })}>
            <option value="">-</option>
            {data.map((p) => <option key={p.id} value={p.id}>{lang === "ar" ? p.name_ar : p.name_en} · {p.sku}</option>)}
          </select>
        </Field>
        <Field label={tr("qty")}><input className={inputCls} type="number" value={offer.min_qty} onChange={(e) => setOffer({ ...offer, min_qty: Number(e.target.value) })} /></Field>
        <Field label={tr("discount")}>
          <div className="grid grid-cols-2 gap-2">
            <select className={inputCls} value={offer.discount_type} onChange={(e) => setOffer({ ...offer, discount_type: e.target.value })}>
              <option value="percent">%</option>
              <option value="fixed">{tr("price")}</option>
            </select>
            <input className={inputCls} type="number" value={offer.discount_value} onChange={(e) => setOffer({ ...offer, discount_value: Number(e.target.value) })} />
          </div>
        </Field>
        <Field label={tr("fromDate")}><input className={inputCls} type="date" value={offer.valid_from} onChange={(e) => setOffer({ ...offer, valid_from: e.target.value })} /></Field>
        <Field label={tr("toDate")}><input className={inputCls} type="date" value={offer.valid_to} onChange={(e) => setOffer({ ...offer, valid_to: e.target.value })} /></Field>
        <Btn className="mt-3" onClick={async () => { await post("/api/offers", { ...offer, product_id: Number(offer.product_id), valid_from: offer.valid_from || null, valid_to: offer.valid_to || null }); setOfferOpen(false); load(); }}>{tr("save")}</Btn>
      </Modal>
      <Modal open={priceOpen} title={tr("bulkPrices")} onClose={() => setPriceOpen(false)}>
        <p className="mb-2 text-sm text-slate-500">{tr("bulkPriceHint")}</p>
        <textarea className={inputCls} rows={8} value={bulk} onChange={(e) => setBulk(e.target.value)} />
        <Btn className="mt-3" onClick={async () => {
          const items = [];
          for (const line of bulk.split("\n")) {
            const [sku, sell, whole] = line.split(",").map((s) => s.trim());
            if (!sku) continue;
            const p = data.find((x) => x.sku === sku);
            if (!p) continue;
            items.push({ id: p.id, selling_price: sell ? Number(sell) : undefined, wholesale_price: whole ? Number(whole) : undefined });
          }
          if (items.length) await post("/api/price-updates", { items });
          setPriceOpen(false); load();
        }}>{tr("save")}</Btn>
      </Modal>
      <Modal open={open} title={form.id ? tr("edit") : tr("addProduct")} onClose={() => { setOpen(false); act.clear(); }} wide>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label={tr("productKind")}>
            <select className={inputCls} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              <option value="product">{tr("kindProduct")}</option>
              <option value="service">{tr("kindService")}</option>
            </select>
          </Field>
          {["sku", "barcode", "part_number", "name_ar", "name_en"].map((k) => (
            <Field key={k} label={k}>
              <input className={inputCls} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
            </Field>
          ))}
          <Field label={tr("quality")}>
            <input className={inputCls} list="product-quality-list" value={form.quality} onChange={(e) => setForm({ ...form, quality: e.target.value })} />
            <datalist id="product-quality-list">{qualities.map((q) => <option key={q} value={q} />)}</datalist>
          </Field>
          <Field label={tr("partType")}>
            <select className={inputCls} value={form.part_type_id} onChange={(e) => setForm({ ...form, part_type_id: e.target.value })}>
              <option value="">-</option>
              {lookups?.part_types.map((b) => <option key={b.id} value={b.id}>{lang === "ar" ? b.name_ar : b.name_en}</option>)}
            </select>
          </Field>
          <Field label={tr("brand")}>
            <select className={inputCls} value={form.brand_id} onChange={(e) => setForm({ ...form, brand_id: e.target.value })}>
              <option value="">-</option>
              {lookups?.brands.map((b) => <option key={b.id} value={b.id}>{lang === "ar" ? b.name_ar : b.name_en}</option>)}
            </select>
          </Field>
          <LocationSelect
            value={form.location_id || ""}
            onChange={(id, loc) => setForm({
              ...form,
              location_id: id,
              warehouse: loc?.warehouse || loc?.name || "",
              box: loc?.box || "",
              rack: loc?.rack || "",
              shelf: loc?.shelf || "",
              drawer: loc?.drawer || "",
            })}
          />
          <Field label={tr("compatible")}>
            <select multiple className={`${inputCls} h-28`} value={form.model_ids.map(String)} onChange={(e) => setForm({ ...form, model_ids: [...e.target.selectedOptions].map((o) => Number(o.value)) })}>
              {lookups?.models.map((m) => <option key={m.id} value={m.id}>{m.brand_en} {m.name}</option>)}
            </select>
          </Field>
          <Field label={tr("color")}>
            <input className={inputCls} value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
          </Field>
          <Field label={tr("parentProduct")}>
            <select className={inputCls} value={form.parent_id} onChange={(e) => setForm({ ...form, parent_id: e.target.value ? Number(e.target.value) : "" })}>
              <option value="">-</option>
              {data.filter((p) => p.kind !== "service").map((p) => (
                <option key={p.id} value={p.id}>{lang === "ar" ? p.name_ar : p.name_en} · {p.sku}</option>
              ))}
            </select>
          </Field>
          <Field label={tr("unit")}>
            <input className={inputCls} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
          </Field>
          <Field label={tr("reorderPoint")}>
            <input className={inputCls} type="number" value={form.reorder_point} onChange={(e) => setForm({ ...form, reorder_point: Number(e.target.value) })} />
          </Field>
          <Field label={tr("trackSerial")}>
            <select className={inputCls} value={form.track_serial} onChange={(e) => setForm({ ...form, track_serial: Number(e.target.value) })}>
              <option value={0}>{tr("no")}</option>
              <option value={1}>{tr("yes")}</option>
            </select>
          </Field>
          {["purchase_price", "selling_price", "wholesale_price", "min_selling_price", "min_stock", "price_2", "price_3", "price_4", "discount_pct", "opening_qty"].filter((k) => k !== "purchase_price" || can("costs.view")).map((k) => (
            <Field key={k} label={k}>
              <input className={inputCls} type="number" value={form[k]} onChange={(e) => setForm({ ...form, [k]: Number(e.target.value) })} />
            </Field>
          ))}
          <Field label={tr("extraCodes")}>
            <input className={inputCls} placeholder={tr("extraCodes")} value={form.extra_code1} onChange={(e) => setForm({ ...form, extra_code1: e.target.value })} />
            <input className={`${inputCls} mt-1`} placeholder={tr("extraCodes")} value={form.extra_code2} onChange={(e) => setForm({ ...form, extra_code2: e.target.value })} />
          </Field>
          <Field label={tr("imageUrl")}>
            <input className={inputCls} value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder={tr("imageUrl")} />
            <label className="mt-2 block text-sm font-bold">
              {tr("uploadImage")}
              <input
                className="mt-2 block text-sm font-normal"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  const fd = new FormData();
                  fd.append("file", file);
                  const res = await fetch("/api/uploads", { method: "POST", credentials: "include", headers: authHeaders(), body: fd });
                  const data = await res.json().catch(() => ({}));
                  if (!res.ok) return;
                  if (data.url) setForm((prev: any) => ({ ...prev, image_url: data.url }));
                }}
              />
            </label>
            {form.image_url ? <img className="mt-2 h-20 w-20 rounded-lg object-cover" src={form.image_url} alt="" /> : null}
          </Field>
          <Field label={tr("expiryDays")}>
            <input className={inputCls} type="number" value={form.expiry_days} onChange={(e) => setForm({ ...form, expiry_days: e.target.value })} />
          </Field>
          <Field label={tr("specs")}>
            <textarea className={inputCls} value={form.specs} onChange={(e) => setForm({ ...form, specs: e.target.value })} />
          </Field>
          <ShippingFields value={form.ship || parseScale("")} onChange={(ship) => setForm({ ...form, ship })} tr={tr} />
          <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={!!form.no_qty} onChange={(e) => setForm({ ...form, no_qty: e.target.checked ? 1 : 0 })} />{tr("noQty")}</label>
          <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={!!form.quick_list} onChange={(e) => setForm({ ...form, quick_list: e.target.checked ? 1 : 0 })} />{tr("quickList")}</label>
          <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={!!form.non_stock} onChange={(e) => setForm({ ...form, non_stock: e.target.checked ? 1 : 0 })} />{tr("nonStock")}</label>
        </div>
        <div className="mt-4">
          <div className="mb-2 font-bold">{tr("units")}</div>
          {(form.units || []).map((u: any, i: number) => (
            <div key={i} className="mb-2 grid gap-2 md:grid-cols-4">
              <input className={inputCls} placeholder={tr("name")} value={u.name} onChange={(e) => setForm({ ...form, units: form.units.map((x: any, j: number) => j === i ? { ...x, name: e.target.value } : x) })} />
              <input className={inputCls} type="number" placeholder={tr("unitFactor")} value={u.factor} onChange={(e) => setForm({ ...form, units: form.units.map((x: any, j: number) => j === i ? { ...x, factor: Number(e.target.value) } : x) })} />
              <input className={inputCls} placeholder={tr("unitBarcode")} value={u.barcode} onChange={(e) => setForm({ ...form, units: form.units.map((x: any, j: number) => j === i ? { ...x, barcode: e.target.value } : x) })} />
              <input className={inputCls} type="number" placeholder={tr("price")} value={u.selling_price} onChange={(e) => setForm({ ...form, units: form.units.map((x: any, j: number) => j === i ? { ...x, selling_price: Number(e.target.value) } : x) })} />
            </div>
          ))}
          <button type="button" className="text-sm font-bold text-cyan-700" onClick={() => setForm({ ...form, units: [...(form.units || []), { name: "", factor: 1, barcode: "", selling_price: 0, is_base: 0 }] })}>{tr("addUnit")}</button>
        </div>
        <ErrorNote message={act.message} />
        <Btn className="mt-4" onClick={async () => {
          if (!String(form.sku || "").trim() || !String(form.name_ar || "").trim()) {
            act.fail(undefined, "errMissing");
            return;
          }
          try {
            const payload = { ...form, parent_id: form.parent_id || null, scale: JSON.stringify(form.ship || {}) };
            if (form.id) await put(`/api/products/${form.id}`, payload);
            else await post("/api/products", payload);
            playSound("done");
            act.clear();
            setOpen(false); load(); refreshLookups();
          } catch (e) {
            act.fail(e);
          }
        }}>{tr("save")}</Btn>
      </Modal>
      {dialog}
    </div>
  );
}

export function ProductDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { tr, lang, can } = useApp();
  const [p, setP] = useState<any>(null);
  const [prices, setPrices] = useState<any[]>([]);
  const [moves, setMoves] = useState<any[]>([]);
  const [tab, setTab] = useState<"batches" | "moves" | "prices" | "label">("batches");
  const { confirmDelete, dialog } = useConfirm();
  useEffect(() => {
    get<{ data: any }>(`/api/products/${id}`).then((r) => setP(r.data)).catch(() => {});
    get<{ data: any[] }>(`/api/supplier-prices?product_id=${id}`).then((r) => setPrices(r.data || [])).catch(() => {});
    get<{ data: any[] }>(`/api/inventory/movements?product_id=${id}&pageSize=40`).then((r) => setMoves(r.data || [])).catch(() => {});
  }, [id]);
  if (!p) return <div>{tr("loading")}</div>;
  const title = lang === "ar" ? p.name_ar : p.name_en;
  return (
    <div className="space-y-4">
      <PrintLetterhead title={title} />
      <div className="print-only label-sheet">
        <Barcode value={p.barcode || p.sku} label={title} price={money(p.selling_price, lang)} />
      </div>
      <div className="flex items-center justify-between no-print">
        <h1 className="text-2xl font-black">{title}</h1>
        <div className="flex gap-2">
          <Link className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold" to="/reports?tab=expiry">{tr("expiryReport")}</Link>
          <Link className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold" to="/inventory">{tr("warehouseGoods")}</Link>
          {can("products.delete") ? (
            <Btn kind="danger" onClick={() => confirmDelete(title, async () => { await del(`/api/products/${id}`); nav("/products"); })}>{tr("delete")}</Btn>
          ) : null}
          <Btn kind="soft" onClick={() => { setTab("label"); window.print(); }}>{tr("printBarcode")}</Btn>
          <PrintBtn />
        </div>
      </div>
      <div className="detail-strip grid gap-3 md:grid-cols-4">
        <Card k={tr("sku")} v={p.sku} />
        <Card k={tr("available")} v={String(p.available)} />
        <Card k={tr("sellingPrice")} v={money(p.selling_price, lang)} />
        <Card k={tr("location")} v={p.location_name} />
        {p.color ? <Card k={tr("color")} v={p.color} /> : null}
        {p.quality ? <Card k={tr("quality")} v={p.quality} /> : null}
      </div>
      {p.specs || p.extra_code1 || p.quick_list || (p.units || []).length ? (
        <div className="rounded-2xl bg-white p-4 text-sm">
          {p.specs ? <div className="mb-2"><b>{tr("specs")}:</b> {p.specs}</div> : null}
          {p.extra_code1 || p.extra_code2 ? <div className="mb-2"><b>{tr("extraCodes")}:</b> {[p.extra_code1, p.extra_code2].filter(Boolean).join(" · ")}</div> : null}
          <div className="mb-2 flex flex-wrap gap-2 text-xs font-bold">
            {p.quick_list ? <span className="rounded-full bg-sky-100 px-2 py-0.5">{tr("quickList")}</span> : null}
            {p.no_qty ? <span className="rounded-full bg-slate-100 px-2 py-0.5">{tr("noQty")}</span> : null}
            {p.non_stock ? <span className="rounded-full bg-amber-100 px-2 py-0.5">{tr("nonStock")}</span> : null}
            {p.expiry_days ? <span className="rounded-full bg-rose-100 px-2 py-0.5">{tr("expiryDays")}: {p.expiry_days}</span> : null}
          </div>
          {(p.units || []).length ? (
            <div className="table-wrap">
              <table>
                <thead><tr><th>{tr("units")}</th><th>{tr("unitFactor")}</th><th>{tr("barcode")}</th><th>{tr("price")}</th></tr></thead>
                <tbody>
                  {p.units.map((u: any) => (
                    <tr key={u.id}><td>{u.name}</td><td>{u.factor}</td><td>{u.barcode}</td><td>{money(u.selling_price, lang)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="no-print flex flex-wrap gap-2 page-tabs">
        {(["batches", "moves", "prices", "label"] as const).map((k) => (
          <button key={k} className={`filter-chip ${tab === k ? "is-on" : ""}`} onClick={() => setTab(k)}>
            {k === "batches" ? tr("batches") : k === "moves" ? tr("movements") : k === "prices" ? tr("comparePrices") : tr("printLabel")}
          </button>
        ))}
      </div>
      {tab === "label" ? (
        <div className="no-print rounded-2xl bg-white p-4">
          <Barcode value={p.barcode || p.sku} label={title} price={money(p.selling_price, lang)} />
        </div>
      ) : null}
      {tab === "batches" ? (
      <div className="rounded-2xl bg-white p-4">
        <div className="font-bold">{tr("batches")}</div>
        <div className="table-wrap mt-2">
          <table>
            <thead>
              <tr>
                <th>Batch</th>
                <th>{tr("cost")}</th>
                <th>{tr("available")}</th>
                <th>{tr("reserved")}</th>
                <th>{tr("date")}</th>
                <th>{tr("expiryDate")}</th>
              </tr>
            </thead>
            <tbody>
              {(p.batches || []).map((b: any) => (
                <tr key={b.id}>
                  <td>{b.batch_code}</td>
                  <td>{money(b.unit_cost, lang)}</td>
                  <td>{b.remaining_qty - b.reserved_qty}</td>
                  <td>{b.reserved_qty}</td>
                  <td>{b.purchase_date}</td>
                  <td>{b.expiry_date || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 text-sm text-slate-500">{tr("fifo")}: {(p.available_batches || [])[0]?.batch_code || "-"} @ {money((p.available_batches || [])[0]?.unit_cost, lang)}</div>
      </div>
      ) : null}
      {tab === "moves" ? (
      <div className="rounded-2xl bg-white p-4">
        <div className="font-bold">{tr("movements")}</div>
        <div className="table-wrap mt-2">
          <table>
            <thead><tr><th>{tr("date")}</th><th>{tr("movementType")}</th><th>{tr("qty")}</th><th>{tr("fromLocation")}</th><th>{tr("toLocation")}</th></tr></thead>
            <tbody>
              {moves.map((m) => (
                <tr key={m.id}>
                  <td>{m.created_at || m.date}</td>
                  <td>{statusLabel(m.type === "in" ? "purchase_in" : m.type === "out" ? "sale_out" : m.type === "return" ? "return_in" : m.type, lang)}</td>
                  <td>{m.qty}</td>
                  <td>{m.from_location || "-"}</td>
                  <td>{m.to_location || "-"}</td>
                </tr>
              ))}
              {!moves.length ? <tr><td colSpan={5} className="py-4 text-center text-slate-400">{tr("noData")}</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
      ) : null}
      {tab === "prices" ? (
      <div className="rounded-2xl bg-white p-4">
        <div className="font-bold">{tr("comparePrices")}</div>
        <div className="table-wrap mt-2">
          <table>
            <thead><tr><th>{tr("supplier")}</th><th>{tr("supplierPrice")}</th><th>{tr("date")}</th></tr></thead>
            <tbody>
              {prices.map((r) => (
                <tr key={r.id}><td>{r.supplier_name}</td><td>{money(r.unit_cost, lang)}</td><td>{r.last_date}</td></tr>
              ))}
              {!prices.length ? <tr><td colSpan={3} className="py-4 text-center text-slate-400">{tr("noData")}</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
      ) : null}
      {dialog}
    </div>
  );
}

function Card({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="text-xs text-slate-400">{k}</div>
      <div className="font-bold">{v}</div>
    </div>
  );
}
