import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Pencil, Plus, Printer, Trash2, Warehouse, X } from "lucide-react";
import { useApp } from "../context";
import { get } from "../lib/api";
import { money, num } from "../lib/format";
import { PrintLetterhead, printPage } from "../components/ui";
import { downloadExport } from "../lib/export";
import { ProductDialogClassic } from "../components/classic/ProductDialogClassic";
import { emptyProduct, useProductCatalog, type ProductForm } from "../hooks/useProductCatalog";

function FilterBox({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string | number;
  onChange: () => void;
  children: React.ReactNode;
}) {
  return (
    <label className="inv-classic-filter">
      <span>{label}</span>
      <span className="inv-classic-filter-row">
        {children}
        {value !== "" ? <button type="button" onClick={onChange}><X size={12} /></button> : null}
      </span>
    </label>
  );
}

export default function ProductsClassic() {
  const { tr, lang, lookups, can } = useApp();
  const nav = useNavigate();
  const cat = useProductCatalog();
  const [advanced, setAdvanced] = useState(false);
  const [dlg, setDlg] = useState(false);
  const [form, setForm] = useState<ProductForm>(emptyProduct());
  const [moves, setMoves] = useState<any[] | null>(null);

  const nameOf = (p: any) => (lang === "ar" ? p.name_ar : p.name_en) || p.name_ar;
  const totalQty = cat.rows.reduce((s, p) => s + Number(p.current_stock ?? p.available ?? 0), 0);
  const warehouses = (cat.selected?.warehouses || []) as { warehouse: string; qty: number }[];

  async function openEdit(id?: number) {
    const target = id || cat.picked || cat.checked[0];
    if (!target) {
      setForm(emptyProduct());
      setDlg(true);
      return;
    }
    const full = await cat.loadOne(target);
    setForm(full);
    setDlg(true);
  }

  async function showMoves() {
    const id = cat.picked;
    if (!id) return;
    const r = await get<{ data: any[] }>(`/api/inventory/movements?product_id=${id}&pageSize=30`);
    setMoves(r.data || []);
  }

  return (
    <div className="inv-classic">
      <PrintLetterhead title={tr("easyGoods")} />
      <div className="inv-classic-top no-print">
        <b>{tr("easyGoods")}</b>
        <FilterBox label={tr("posColCategory")} value={cat.filters.quality} onChange={() => cat.setFilters({ ...cat.filters, quality: "" })}>
          <input list="classic-quality-list" value={cat.filters.quality} onChange={(e) => cat.setFilters({ ...cat.filters, quality: e.target.value })} />
          <datalist id="classic-quality-list">
            {[...new Set(cat.rows.map((p) => String(p.quality || "").trim()).filter(Boolean))].map((q) => <option key={q} value={q} />)}
          </datalist>
        </FilterBox>
        <FilterBox label={tr("posColBrand")} value={cat.filters.brand_id} onChange={() => cat.setFilters({ ...cat.filters, brand_id: "" })}>
          <select value={cat.filters.brand_id} onChange={(e) => cat.setFilters({ ...cat.filters, brand_id: e.target.value ? Number(e.target.value) : "" })}>
            <option value="">-</option>
            {(lookups?.brands || []).map((b) => <option key={b.id} value={b.id}>{lang === "ar" ? b.name_ar : b.name_en}</option>)}
          </select>
        </FilterBox>
        <FilterBox label={tr("supplier")} value={cat.filters.supplier_id} onChange={() => cat.setFilters({ ...cat.filters, supplier_id: "" })}>
          <select value={cat.filters.supplier_id} onChange={(e) => cat.setFilters({ ...cat.filters, supplier_id: e.target.value ? Number(e.target.value) : "" })}>
            <option value="">-</option>
            {(lookups?.suppliers || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </FilterBox>
        <FilterBox label={tr("location")} value={cat.filters.location_id} onChange={() => cat.setFilters({ ...cat.filters, location_id: "" })}>
          <select value={cat.filters.location_id} onChange={(e) => cat.setFilters({ ...cat.filters, location_id: e.target.value ? Number(e.target.value) : "" })}>
            <option value="">-</option>
            {(lookups?.locations || []).map((l) => <option key={l.id} value={l.id}>{l.label || l.name}</option>)}
          </select>
        </FilterBox>
        <button type="button" className="inv-classic-yellow" onClick={() => setAdvanced((v) => !v)}>{tr("invAdvancedSearch")}</button>
      </div>
      {advanced ? (
        <div className="inv-classic-adv no-print">
          <input placeholder={tr("search")} value={cat.filters.q} onChange={(e) => cat.setFilters({ ...cat.filters, q: e.target.value })} />
          <input placeholder={tr("barcode")} value={cat.filters.barcode} onChange={(e) => cat.setFilters({ ...cat.filters, barcode: e.target.value })} />
          <select value={cat.filters.part_type_id} onChange={(e) => cat.setFilters({ ...cat.filters, part_type_id: e.target.value ? Number(e.target.value) : "" })}>
            <option value="">{tr("posColKind")}</option>
            {(lookups?.part_types || []).map((t) => <option key={t.id} value={t.id}>{lang === "ar" ? t.name_ar : t.name_en}</option>)}
          </select>
        </div>
      ) : null}

      <div className="inv-classic-body">
        <aside className="inv-classic-side no-print">
          <div className="inv-classic-cmds">
            <button type="button" className="is-del" disabled={!can("products.delete") || !cat.checked.length} onClick={() => void cat.remove(cat.checked)}><Trash2 size={14} /> {tr("delete")}</button>
            <button type="button" className="is-edit" disabled={!can("products.edit")} onClick={() => void openEdit()}><Pencil size={14} /> {tr("edit")}</button>
            <button type="button" className="is-new" disabled={!can("products.create")} onClick={() => { setForm(emptyProduct()); setDlg(true); }}><Plus size={14} /> {tr("new")}</button>
          </div>
          <button type="button" onClick={() => downloadExport("products", cat.exportQuery).catch(() => {})}>{tr("exportCsv")}</button>
          <button type="button" onClick={async () => { await cat.loadAllFiltered(); requestAnimationFrame(() => printPage()); }}><Printer size={14} /> {tr("invPrintList")}</button>
          <button type="button" disabled={!cat.picked} onClick={() => void showMoves()}><FileText size={14} /> {tr("invItemMove")}</button>
          <button type="button" onClick={() => nav("/inventory")}><Warehouse size={14} /> {tr("invWarehouseStock")}</button>
          <div className="inv-classic-dist">
            <div>{tr("invStockDist")}</div>
            <table>
              <thead>
                <tr>
                  <th>{tr("invStoreName")}</th>
                  <th>{tr("available")}</th>
                  <th>{tr("invReserved")}</th>
                </tr>
              </thead>
              <tbody>
                {warehouses.length ? warehouses.map((w) => (
                  <tr key={w.warehouse}>
                    <td>{w.warehouse}</td>
                    <td>{num(w.qty, lang)}</td>
                    <td>{num(cat.selected?.reserved_stock || 0, lang)}</td>
                  </tr>
                )) : (
                  <tr>
                    <td>{cat.selected?.warehouse || cat.selected?.location_name || "—"}</td>
                    <td>{num(cat.selected?.available || 0, lang)}</td>
                    <td>{num(cat.selected?.reserved_stock || 0, lang)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </aside>

        <div className="inv-classic-grid">
          {cat.loading ? <div className="px-4 py-8 text-center font-bold">{tr("loading")}</div> : null}
          <table>
            <thead>
              <tr>
                <th></th>
                <th>{tr("posColSku")}</th>
                <th>{tr("posColName")}</th>
                <th>{tr("posColTotalQty")}</th>
                <th>{tr("unit")}</th>
                <th>{tr("sellingPrice")}</th>
                {cat.showCost ? <th>{tr("invAvgCost")}</th> : null}
                {cat.showCost ? <th>{tr("invLastCost")}</th> : null}
                <th>{tr("barcode")}</th>
                <th>{tr("invCode1")}</th>
                <th>{tr("posColCategory")}</th>
                <th>{tr("posColKind")}</th>
                <th>{tr("posColBrand")}</th>
                <th>{tr("supplier")}</th>
              </tr>
            </thead>
            <tbody>
              {cat.rows.map((p) => (
                <tr
                  key={p.id}
                  className={cat.picked === p.id ? "is-pick" : ""}
                  onClick={() => cat.setPicked(p.id)}
                  onDoubleClick={() => void openEdit(p.id)}
                >
                  <td><input type="checkbox" checked={cat.checked.includes(p.id)} onChange={() => cat.toggleCheck(p.id)} /></td>
                  <td>{p.sku}</td>
                  <td className="is-name">{nameOf(p)}</td>
                  <td>{num(p.current_stock ?? p.available, lang)}</td>
                  <td>{p.unit || ""}</td>
                  <td>{money(p.selling_price, lang)}</td>
                  {cat.showCost ? <td>{money(p.purchase_price || 0, lang)}</td> : null}
                  {cat.showCost ? <td>{money(p.last_purchase_price || p.purchase_price || 0, lang)}</td> : null}
                  <td>{p.barcode || ""}</td>
                  <td>{p.extra_code1 || ""}</td>
                  <td>{p.quality || ""}</td>
                  <td>{(lang === "ar" ? p.part_type_ar : p.part_type_en) || ""}</td>
                  <td>{(lang === "ar" ? p.brand_ar : p.brand_en) || ""}</td>
                  <td>{p.supplier_name || ""}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>{tr("invGrandQty")}</td>
                <td>{num(totalQty, lang)}</td>
                <td colSpan={cat.showCost ? 10 : 8}>
                  {num(cat.rows.length, lang)} / {num(cat.total, lang)}
                  <span className="ms-3">
                    <button type="button" disabled={cat.filters.page <= 1 || cat.loading} onClick={() => cat.setFilters({ ...cat.filters, page: cat.filters.page - 1 })}>{tr("prev")}</button>
                    {" "}
                    {cat.filters.page}/{Math.max(1, Math.ceil((cat.total || 0) / 80))}
                    {" "}
                    <button type="button" disabled={cat.loading || cat.filters.page >= Math.max(1, Math.ceil((cat.total || 0) / 80))} onClick={() => cat.setFilters({ ...cat.filters, page: cat.filters.page + 1 })}>{tr("next")}</button>
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {moves ? (
        <div className="inv-classic-moves no-print">
          <div className="inv-classic-pane-title">
            {tr("invItemMove")}
            <button type="button" onClick={() => setMoves(null)}><X size={14} /></button>
          </div>
          <table>
            <tbody>
              {moves.map((m) => (
                <tr key={m.id}>
                  <td>{m.created_at}</td>
                  <td>{m.type}</td>
                  <td>{m.qty}</td>
                  <td>{m.notes || m.reference_type || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {cat.err ? <div className="pos-classic-err">{cat.err}</div> : null}

      <ProductDialogClassic
        open={dlg}
        form={form}
        busy={cat.busy}
        err={cat.err}
        onChange={setForm}
        onClose={() => setDlg(false)}
        onSave={async () => {
          const ok = await cat.save(form);
          if (ok) setDlg(false);
        }}
      />
    </div>
  );
}
