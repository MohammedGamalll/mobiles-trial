import { useState } from "react";
import { FileText, Printer, Search, X } from "lucide-react";
import { useApp } from "../context";
import { get } from "../lib/api";
import { money, num } from "../lib/format";
import { PrintLetterhead } from "../components/ui";
import { useProductCatalog } from "../hooks/useProductCatalog";

export default function WarehouseReportClassic() {
  const { tr, lang, lookups, can } = useApp();
  const cat = useProductCatalog();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [mode, setMode] = useState<"avg" | "last">("avg");
  const [ready, setReady] = useState(false);
  const [moves, setMoves] = useState<any[] | null>(null);
  const showCost = can("costs.view");

  const nameOf = (p: any) => (lang === "ar" ? p.name_ar : p.name_en) || p.name_ar;
  const rows = ready ? cat.rows : [];
  const line = (p: any) => {
    const qty = Number(p.available ?? p.current_stock ?? 0);
    const unitCost = mode === "last" ? Number(p.last_purchase_price || p.purchase_price || 0) : Number(p.purchase_price || 0);
    const sell = Number(p.selling_price || 0);
    const costVal = qty * unitCost;
    const sellVal = qty * sell;
    return { qty, unitCost, sell, costVal, sellVal, profit: sellVal - costVal };
  };
  const totals = rows.reduce((acc, p) => {
    const l = line(p);
    acc.qty += l.qty;
    acc.cost += l.costVal;
    acc.sell += l.sellVal;
    acc.profit += l.profit;
    return acc;
  }, { qty: 0, cost: 0, sell: 0, profit: 0 });

  async function showMoves() {
    const id = cat.picked;
    if (!id) return;
    const r = await get<{ data: any[] }>(`/api/inventory/movements?product_id=${id}&pageSize=30`);
    setMoves(r.data || []);
  }

  return (
    <div className="inv-classic">
      <PrintLetterhead title={tr("wrTitle")} />
      <div className="inv-classic-top no-print">
        <b>{tr("wrTitle")}</b>
        <label className="inv-classic-filter">
          <span>{tr("warehouse")}</span>
          <select value={cat.filters.location_id} onChange={(e) => { cat.setFilters({ ...cat.filters, location_id: e.target.value ? Number(e.target.value) : "" }); setReady(false); }}>
            <option value="">-</option>
            {(lookups?.locations || []).filter((l) => !l.kind || l.kind === "warehouse").map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <label className="inv-classic-filter">
          <span>{tr("posColCategory")}</span>
          <select value={cat.filters.category_id} onChange={(e) => { cat.setFilters({ ...cat.filters, category_id: e.target.value ? Number(e.target.value) : "" }); setReady(false); }}>
            <option value="">-</option>
            {(lookups?.categories || []).map((c) => <option key={c.id} value={c.id}>{lang === "ar" ? c.name_ar : c.name_en}</option>)}
          </select>
        </label>
        <label className="inv-classic-filter">
          <span>{tr("posColBrand")}</span>
          <select value={cat.filters.brand_id} onChange={(e) => { cat.setFilters({ ...cat.filters, brand_id: e.target.value ? Number(e.target.value) : "" }); setReady(false); }}>
            <option value="">-</option>
            {(lookups?.brands || []).map((b) => <option key={b.id} value={b.id}>{lang === "ar" ? b.name_ar : b.name_en}</option>)}
          </select>
        </label>
        <label className="inv-classic-filter">
          <span>{tr("supplier")}</span>
          <select value={cat.filters.supplier_id} onChange={(e) => { cat.setFilters({ ...cat.filters, supplier_id: e.target.value ? Number(e.target.value) : "" }); setReady(false); }}>
            <option value="">-</option>
            {(lookups?.suppliers || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="inv-classic-filter">
          <span>{tr("from")}</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="inv-classic-filter">
          <span>{tr("to")}</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <div className="pos-classic-radios">
          <label className="pos-classic-radio"><input type="radio" checked={mode === "avg"} onChange={() => setMode("avg")} />{tr("wrAvgCost")}</label>
          <label className="pos-classic-radio"><input type="radio" checked={mode === "last"} onChange={() => setMode("last")} />{tr("wrLastCost")}</label>
        </div>
        <button type="button" className="inv-classic-yellow is-lg" onClick={() => setReady(true)}><Search size={16} /> {tr("wrGenerate")}</button>
      </div>

      <div className="inv-classic-body">
        <aside className="inv-classic-side no-print">
          <button type="button" onClick={() => window.print()}><Printer size={14} /> {tr("wrPrint")}</button>
          <button type="button" disabled={!cat.picked} onClick={() => void showMoves()}><FileText size={14} /> {tr("invItemMove")}</button>
        </aside>
        <div className="inv-classic-grid">
          <table>
            <thead>
              <tr>
                <th>{tr("posColSku")}</th>
                <th></th>
                <th>{tr("posColName")}</th>
                <th>{tr("qty")}</th>
                <th>{tr("unit")}</th>
                {showCost ? <th>{tr("openingCost")}</th> : null}
                {showCost ? <th>{tr("wrPurchaseValue")}</th> : null}
                <th>{tr("sellingPrice")}</th>
                <th>{tr("wrSellValue")}</th>
                {showCost ? <th>{tr("wrProfit")}</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const l = line(p);
                return (
                  <tr key={p.id} className={cat.picked === p.id ? "is-pick" : ""} onClick={() => cat.setPicked(p.id)}>
                    <td>{p.sku}</td>
                    <td><input type="checkbox" checked={cat.checked.includes(p.id)} onChange={() => cat.toggleCheck(p.id)} /></td>
                    <td className="is-name">{nameOf(p)}</td>
                    <td>{num(l.qty, lang)}</td>
                    <td>{p.unit || ""}</td>
                    {showCost ? <td>{money(l.unitCost, lang)}</td> : null}
                    {showCost ? <td>{money(l.costVal, lang)}</td> : null}
                    <td>{money(l.sell, lang)}</td>
                    <td>{money(l.sellVal, lang)}</td>
                    {showCost ? <td>{money(l.profit, lang)}</td> : null}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>{tr("invGrandQty")}</td>
                <td>{num(totals.qty, lang)}</td>
                <td></td>
                {showCost ? <td></td> : null}
                {showCost ? <td>{money(totals.cost, lang)}</td> : null}
                <td></td>
                <td>{money(totals.sell, lang)}</td>
                {showCost ? <td>{money(totals.profit, lang)}</td> : null}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      {moves ? (
        <div className="inv-classic-moves no-print">
          <div className="inv-classic-pane-title">{tr("invItemMove")} <button type="button" onClick={() => setMoves(null)}><X size={14} /></button></div>
          <table>
            <tbody>
              {moves.map((m) => (
                <tr key={m.id}><td>{m.created_at}</td><td>{m.type}</td><td>{m.qty}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
