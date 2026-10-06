import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../context";
import { del, get, post, put } from "../lib/api";
import { apiMessage } from "../lib/errors";
import { playSound } from "../lib/sounds";

export type CatalogFilters = {
  q: string;
  category_id: number | "";
  brand_id: number | "";
  supplier_id: number | "";
  location_id: number | "";
  part_type_id: number | "";
  quality: string;
  barcode: string;
  page: number;
};

export function emptyProduct() {
  return {
    id: 0,
    sku: "",
    barcode: "",
    part_number: "",
    name_ar: "",
    name_en: "",
    brand_id: "" as number | "",
    part_type_id: "" as number | "",
    category_id: "" as number | "",
    location_id: "" as number | "",
    warehouse: "",
    supplier_id: "" as number | "",
    purchase_price: 0,
    last_purchase_price: 0,
    selling_price: 0,
    wholesale_price: 0,
    min_selling_price: 0,
    min_stock: 0,
    notes: "",
    kind: "product",
    unit: "قطعة",
    extra_code1: "",
    extra_code2: "",
    discount_pct: 0,
    specs: "",
    expiry_days: "",
    opening_qty: 0,
    image_url: "",
    rack: "",
    shelf: "",
    drawer: "",
    box: "",
    units: [{ name: "قطعة", factor: 1, barcode: "", selling_price: 0, is_base: 1 }],
  };
}

export type ProductForm = ReturnType<typeof emptyProduct>;

export function useProductCatalog() {
  const { tr, can, refreshLookups, warehouseId } = useApp();
  const showCost = can("costs.view");
  const [rows, setRows] = useState<any[]>([]);
  const [filters, setFilters] = useState<CatalogFilters>({
    q: "",
    category_id: "",
    brand_id: "",
    supplier_id: "",
    location_id: "",
    part_type_id: "",
    quality: "",
    barcode: "",
    page: 1,
  });
  const [picked, setPicked] = useState<number | null>(null);
  const [checked, setChecked] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState("");
  const [tick, setTick] = useState(0);
  const loadGen = useRef(0);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    p.set("pageSize", "80");
    p.set("page", String(filters.page || 1));
    p.set("active", "1");
    if (filters.q.trim()) p.set("q", filters.q.trim());
    if (filters.barcode.trim()) p.set("q", filters.barcode.trim() || filters.q.trim());
    if (filters.quality.trim()) p.set("quality", filters.quality.trim());
    if (filters.category_id) p.set("category_id", String(filters.category_id));
    if (filters.brand_id) p.set("brand_id", String(filters.brand_id));
    if (filters.supplier_id) p.set("supplier_id", String(filters.supplier_id));
    if (warehouseId) {
      p.set("location_id", String(warehouseId));
      p.delete("warehouse");
      p.delete("warehouse_id");
    } else if (filters.location_id) p.set("location_id", String(filters.location_id));
    if (filters.part_type_id) p.set("part_type_id", String(filters.part_type_id));
    return p.toString();
  }, [filters, warehouseId]);

  const load = useCallback(async () => {
    const gen = ++loadGen.current;
    const path = `/api/products?${qs}`;
    setLoading(true);
    setErr("");
    try {
      const r = await get<{ data: any[]; total?: number }>(path);
      if (gen !== loadGen.current) return;
      setRows(r.data || []);
      setTotal(Number(r.total) || (r.data || []).length);
    } catch (e) {
      if (gen !== loadGen.current) return;
      setErr(apiMessage(tr, e));
    } finally {
      if (gen === loadGen.current) setLoading(false);
    }
  }, [qs, tr]);

  useEffect(() => {
    load().catch(() => {});
  }, [load, tick]);

  const selected = rows.find((r) => r.id === picked) || null;

  function toggleCheck(id: number) {
    setChecked((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  }

  async function loadOne(id: number): Promise<ProductForm> {
    const loc = filters.location_id || warehouseId;
    const r = await get<{ data: any }>(`/api/products/${id}${loc ? `?location_id=${loc}` : ""}`);
    const p = r.data || {};
    return {
      ...emptyProduct(),
      ...p,
      brand_id: p.brand_id || "",
      part_type_id: p.part_type_id || "",
      category_id: p.category_id || "",
      location_id: p.location_id || "",
      warehouse: p.warehouse || "",
      supplier_id: p.supplier_id || "",
      rack: p.rack || "",
      shelf: p.shelf || "",
      drawer: p.drawer || "",
      box: p.box || "",
      units: p.units?.length ? p.units : emptyProduct().units,
      opening_qty: Number(p.opening_qty || 0),
    };
  }

  async function save(form: ProductForm) {
    if (!String(form.sku || "").trim() || !String(form.name_ar || "").trim()) {
      setErr(tr("errMissing"));
      playSound("err");
      return null;
    }
    setBusy(true);
    setErr("");
    try {
      const payload = {
        ...form,
        brand_id: form.brand_id || null,
        part_type_id: form.part_type_id || null,
        category_id: form.category_id || null,
        location_id: form.location_id || null,
        supplier_id: form.supplier_id || null,
      };
      const res = form.id
        ? await put<{ id?: number }>(`/api/products/${form.id}`, payload)
        : await post<{ id: number }>("/api/products", payload);
      playSound("done");
      setTick((n) => n + 1);
      refreshLookups().catch(() => {});
      return res;
    } catch (e) {
      playSound("err");
      setErr(apiMessage(tr, e));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function remove(ids: number[]) {
    if (!ids.length || !can("products.delete")) return;
    setBusy(true);
    try {
      for (const id of ids) await del(`/api/products/${id}`);
      playSound("done");
      setChecked([]);
      setPicked(null);
      setTick((n) => n + 1);
    } catch (e) {
      playSound("err");
      setErr(apiMessage(tr, e));
    } finally {
      setBusy(false);
    }
  }

  async function loadAllFiltered() {
    const p = new URLSearchParams(qs);
    p.set("page", "1");
    p.set("pageSize", "5000");
    const r = await get<{ data: any[] }>(`/api/products?${p}`);
    setRows(r.data || []);
    return r.data || [];
  }

  const exportQuery = useMemo(() => {
    const p = new URLSearchParams(qs);
    p.delete("page");
    p.delete("pageSize");
    return p.toString();
  }, [qs]);

  return {
    rows, filters, setFilters, picked, setPicked, selected, checked, setChecked, toggleCheck,
    showCost, busy, loading, total, err, setErr, load, loadOne, save, remove, loadAllFiltered, exportQuery,
    reload: () => setTick((n) => n + 1),
  };
}
