import { useCallback, useEffect, useMemo, useState } from "react";
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
  barcode: string;
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
  const { tr, can, refreshLookups } = useApp();
  const showCost = can("costs.view");
  const [rows, setRows] = useState<any[]>([]);
  const [filters, setFilters] = useState<CatalogFilters>({
    q: "",
    category_id: "",
    brand_id: "",
    supplier_id: "",
    location_id: "",
    part_type_id: "",
    barcode: "",
  });
  const [picked, setPicked] = useState<number | null>(null);
  const [checked, setChecked] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [tick, setTick] = useState(0);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    p.set("pageSize", "5000");
    p.set("active", "1");
    if (filters.q.trim()) p.set("q", filters.q.trim());
    if (filters.barcode.trim()) p.set("q", filters.barcode.trim() || filters.q.trim());
    if (filters.category_id) p.set("category_id", String(filters.category_id));
    if (filters.brand_id) p.set("brand_id", String(filters.brand_id));
    if (filters.supplier_id) p.set("supplier_id", String(filters.supplier_id));
    if (filters.location_id) p.set("locations", String(filters.location_id));
    if (filters.part_type_id) p.set("part_type_id", String(filters.part_type_id));
    return p.toString();
  }, [filters]);

  const load = useCallback(async () => {
    const r = await get<{ data: any[] }>(`/api/products?${qs}`);
    setRows(r.data || []);
  }, [qs]);

  useEffect(() => {
    let live = true;
    load().catch(() => { if (live) setRows([]); });
    return () => { live = false; };
  }, [load, tick]);

  const selected = rows.find((r) => r.id === picked) || null;

  function toggleCheck(id: number) {
    setChecked((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  }

  async function loadOne(id: number): Promise<ProductForm> {
    const r = await get<{ data: any }>(`/api/products/${id}`);
    const p = r.data || {};
    return {
      ...emptyProduct(),
      ...p,
      brand_id: p.brand_id || "",
      part_type_id: p.part_type_id || "",
      category_id: p.category_id || "",
      location_id: p.location_id || "",
      supplier_id: p.supplier_id || "",
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

  return {
    rows, filters, setFilters, picked, setPicked, selected, checked, setChecked, toggleCheck,
    showCost, busy, err, setErr, load, loadOne, save, remove, reload: () => setTick((n) => n + 1),
  };
}
