import { useEffect, useState } from "react";
import { Camera, Check } from "lucide-react";
import { useApp } from "../../context";
import { authHeaders } from "../../lib/session";
import { emptyProduct, type ProductForm } from "../../hooks/useProductCatalog";

type Tab = "general" | "units" | "opening" | "more";

export function ProductDialogClassic({
  open,
  form,
  busy,
  err,
  onChange,
  onSave,
  onClose,
}: {
  open: boolean;
  form: ProductForm;
  busy?: boolean;
  err?: string;
  onChange: (next: ProductForm) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const { tr, lang, lookups } = useApp();
  const [tab, setTab] = useState<Tab>("general");

  useEffect(() => {
    if (open) setTab("general");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter" && (e.target as HTMLElement)?.tagName !== "TEXTAREA") {
        e.preventDefault();
        onSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, onSave]);

  if (!open) return null;
  const set = (patch: Partial<ProductForm>) => onChange({ ...form, ...patch });

  async function onFile(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/uploads", { method: "POST", credentials: "include", headers: authHeaders(), body: fd });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.url) set({ image_url: data.url });
  }

  return (
    <div className="inv-dlg-back" role="dialog">
      <div className="inv-dlg">
        <div className="inv-dlg-head">
          <button type="button" className="inv-dlg-photo" onClick={() => document.getElementById("inv-dlg-file")?.click()}>
            {form.image_url ? <img src={form.image_url} alt="" /> : <Camera size={28} />}
            <input id="inv-dlg-file" type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void onFile(f); }} />
          </button>
          <div className="inv-dlg-fields">
            <label>
              <span>{tr("posColName")}</span>
              <input value={form.name_ar} onChange={(e) => set({ name_ar: e.target.value, name_en: form.name_en || e.target.value })} />
            </label>
            <label>
              <span>{tr("sellingPrice")}</span>
              <input type="number" value={form.selling_price} onChange={(e) => set({ selling_price: Number(e.target.value) || 0 })} />
            </label>
            <label>
              <span>{tr("posColMinPrice")}</span>
              <input type="number" value={form.min_selling_price} onChange={(e) => set({ min_selling_price: Number(e.target.value) || 0 })} />
            </label>
            <label>
              <span>{tr("posDiscPct")}</span>
              <input type="number" value={form.discount_pct} onChange={(e) => set({ discount_pct: Number(e.target.value) || 0 })} />
            </label>
          </div>
        </div>

        <div className="inv-dlg-tabs">
          {([["general", tr("dlgGeneral")], ["opening", tr("dlgOpening")], ["units", tr("dlgUnits")], ["more", tr("dlgMore")]] as const).map(([id, label]) => (
            <button key={id} type="button" className={tab === id ? "is-on" : ""} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>

        <div className="inv-dlg-body">
          {tab === "general" ? (
            <div className="inv-dlg-split">
              <div>
                <label><span>{tr("barcode")}</span><input value={form.barcode} onChange={(e) => set({ barcode: e.target.value })} /></label>
                <label><span>{tr("invCode1")}</span><input value={form.extra_code1} onChange={(e) => set({ extra_code1: e.target.value })} /></label>
                <label><span>2</span><input value={form.extra_code2} onChange={(e) => set({ extra_code2: e.target.value })} /></label>
                <label><span>{tr("posColSku")}</span><input value={form.sku} onChange={(e) => set({ sku: e.target.value })} /></label>
              </div>
              <div>
                <label>
                  <span>{tr("posColCategory")}</span>
                  <select value={form.category_id} onChange={(e) => set({ category_id: e.target.value ? Number(e.target.value) : "" })}>
                    <option value="">-</option>
                    {(lookups?.categories || []).map((c) => <option key={c.id} value={c.id}>{lang === "ar" ? c.name_ar : c.name_en}</option>)}
                  </select>
                </label>
                <label>
                  <span>{tr("posColBrand")}</span>
                  <select value={form.brand_id} onChange={(e) => set({ brand_id: e.target.value ? Number(e.target.value) : "" })}>
                    <option value="">-</option>
                    {(lookups?.brands || []).map((b) => <option key={b.id} value={b.id}>{lang === "ar" ? b.name_ar : b.name_en}</option>)}
                  </select>
                </label>
                <label>
                  <span>{tr("supplier")}</span>
                  <select value={form.supplier_id} onChange={(e) => set({ supplier_id: e.target.value ? Number(e.target.value) : "" })}>
                    <option value="">-</option>
                    {(lookups?.suppliers || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
                <label><span>{tr("posColPack")}</span><input value={form.box} onChange={(e) => set({ box: e.target.value })} /></label>
                <label><span>{tr("posColBin")}</span><input value={[form.rack, form.shelf, form.drawer].filter(Boolean).join("+")} onChange={(e) => {
                  const [rack = "", shelf = "", drawer = ""] = e.target.value.split("+");
                  set({ rack, shelf, drawer });
                }} /></label>
              </div>
            </div>
          ) : null}
          {tab === "units" ? (
            <div>
              <label className="inv-dlg-inline">
                <span>{tr("dlgBaseUnit")}</span>
                <input value={form.unit} onChange={(e) => set({ unit: e.target.value })} />
              </label>
              <table className="inv-dlg-table">
                <thead>
                  <tr>
                    <th>{tr("unit")}</th>
                    <th>{tr("unitFactor")}</th>
                    <th>{tr("sellingPrice")}</th>
                    <th>{tr("barcode")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(form.units || []).map((u, i) => (
                    <tr key={i}>
                      <td><input value={u.name} onChange={(e) => set({ units: form.units.map((x, j) => j === i ? { ...x, name: e.target.value } : x) })} /></td>
                      <td><input type="number" value={u.factor} onChange={(e) => set({ units: form.units.map((x, j) => j === i ? { ...x, factor: Number(e.target.value) || 1 } : x) })} /></td>
                      <td><input type="number" value={u.selling_price} onChange={(e) => set({ units: form.units.map((x, j) => j === i ? { ...x, selling_price: Number(e.target.value) || 0 } : x) })} /></td>
                      <td><input value={u.barcode} onChange={(e) => set({ units: form.units.map((x, j) => j === i ? { ...x, barcode: e.target.value } : x) })} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button type="button" className="inv-dlg-addunit" onClick={() => set({ units: [...(form.units || []), { name: "", factor: 1, barcode: "", selling_price: 0, is_base: 0 }] })}>{tr("dlgAddUnit")}</button>
            </div>
          ) : null}
          {tab === "opening" ? (
            <div className="inv-dlg-split">
              <label>
                <span>{tr("location")}</span>
                <select value={form.location_id} onChange={(e) => set({ location_id: e.target.value ? Number(e.target.value) : "" })}>
                  <option value="">-</option>
                  {(lookups?.locations || []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </label>
              <label>
                <span>{tr("qty")}</span>
                <input type="number" value={form.opening_qty} onChange={(e) => set({ opening_qty: Number(e.target.value) || 0 })} />
              </label>
            </div>
          ) : null}
          {tab === "more" ? (
            <div>
              <label><span>{tr("expiryDays")}</span><input type="number" value={form.expiry_days} onChange={(e) => set({ expiry_days: e.target.value })} /></label>
              <label><span>{tr("dlgMinQty")}</span><input type="number" value={form.min_stock} onChange={(e) => set({ min_stock: Number(e.target.value) || 0 })} /></label>
              <label><span>{tr("dlgSpecs")}</span><textarea value={form.specs} onChange={(e) => set({ specs: e.target.value })} /></label>
            </div>
          ) : null}
        </div>

        {err ? <div className="inv-dlg-err">{err}</div> : null}
        <div className="inv-dlg-actions">
          <button type="button" className="is-cancel" onClick={onClose}>{tr("dlgCancel")}</button>
          <button type="button" className="is-save" disabled={busy} onClick={onSave}><Check size={14} /> {tr("dlgSave")}</button>
        </div>
      </div>
    </div>
  );
}

export function useProductDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ProductForm>(emptyProduct());
  return { open, setOpen, form, setForm, reset: () => { setForm(emptyProduct()); setOpen(true); } };
}
