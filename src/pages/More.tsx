import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useApp } from "../context";
import { get, post, put, del } from "../lib/api";
import { money, num, statusClass, statusLabel, customerBalanceLabel, supplierBalanceLabel } from "../lib/format";
import { Btn, ErrorNote, ExportBtn, Field, FilterBar, Modal, PrintBtn, PrintLetterhead, SavedViews, Stat, inputCls } from "../components/ui";
import { useActionError } from "../lib/errors";
import { OsmMap } from "../components/OsmMap";
import { PaymentModal } from "../components/PaymentModal";
import { EmptyFilterState, SmartFilter } from "../components/SmartFilter";
import { useListQuery } from "../hooks/useListQuery";
import { authHeaders } from "../lib/session";
import { ActionBtns, useConfirm } from "../components/Confirm";
import { AssignCourierModal } from "../components/AssignCourierModal";
import { matchScanned, playSound } from "../lib/sounds";
import { MapPin } from "lucide-react";

export function SalesList() {
  const { tr, lang, can } = useApp();
  const f = useListQuery("sales", { period: "today" });
  const [rows, setRows] = useState<any[]>([]);
  const [totals, setTotals] = useState<any>({});
  const { confirmDelete, dialog } = useConfirm();
  const [assignInv, setAssignInv] = useState<{ id: number; number?: string } | null>(null);
  async function load() {
    const r = await get<{ data: any[]; totals?: any }>(`/api/invoices?${f.qs}&pageSize=50`);
    setRows(r.data);
    setTotals(r.totals || {});
  }
  useEffect(() => {
    let live = true;
    load().then(() => { if (!live) return; }).catch(() => {});
    return () => { live = false; };
  }, [f.qs]);
  return (
    <Page title={tr("sales")} action={<ExportBtn kind="invoices" query={f.qs} />}>
      <div className="mb-3 grid gap-3 md:grid-cols-4">
        <Stat label={tr("invoicesCount")} value={String(totals.count || 0)} />
        <Stat label={tr("total")} value={money(totals.total, lang)} />
        <Stat label={tr("paidAmount")} value={money(totals.paid, lang)} accent="emerald" />
        <Stat label={tr("remainingAmount")} value={money(totals.remaining, lang)} accent="rose" />
      </div>
      <SmartFilter
        f={f}
        fields={[
          { key: "status", label: "status", type: "select", quick: true, options: ["completed", "partial", "partially_returned", "fully_returned", "held", "quote", "order", "pending_delivery", "cancelled"].map((s) => ({ value: s, label: statusLabel(s, lang) })) },
          { key: "customer_id", label: "customers", type: "async", quick: true, asyncPath: "/api/customers" },
          { key: "sales_agent_id", label: "representative", type: "select", quick: true, lookup: "delivery_agents" },
          { key: "brand_id", label: "brand", type: "select", lookup: "brands" },
          { key: "model_id", label: "model", type: "select", lookup: "models" },
          { key: "warehouse", label: "warehouse", type: "locations" },
          { key: "payment_method", label: "payMethod", type: "select", lookup: "payment_methods" },
          { key: "pay_status", label: "payStatus", type: "select", options: [{ value: "paid", label: tr("paidStatus") }, { value: "partial", label: tr("partialStatus") }, { value: "unpaid", label: tr("unpaidStatus") }] },
          { key: "terms", label: "payMethod", type: "select", options: [{ value: "cash", label: tr("cashPay") }, { value: "credit", label: tr("creditPay") }] },
          { key: "branch_id", label: "branch", type: "select", lookup: "branches" },
          { key: "product_id", label: "products", type: "async", asyncPath: "/api/products", asyncLabel: (r) => `${r.sku} — ${r.name_ar || r.name_en}` },
          { key: "amount", label: "amountRange", type: "range", minKey: "amount_min", maxKey: "amount_max" },
        ]}
        sorts={[
          { value: "newest", label: tr("newestFirst") },
          { value: "oldest", label: tr("oldestFirst") },
          { value: "price_high", label: tr("highestSales") },
          { value: "price_low", label: tr("lowestSales") },
          { value: "name_az", label: tr("nameAZ") },
        ]}
      />
      {!rows.length ? <EmptyFilterState onClear={f.clear} /> : (
      <Table
        cols={[tr("invoiceNo"), tr("customer"), tr("date"), tr("total"), tr("remaining"), tr("status"), ""]}
        rows={rows.map((r) => {
          const payStatus = Number(r.remaining) > 0 && Number(r.paid) <= 0 && r.status === "partial" ? "unpaid_sale" : r.status;
          return [
          <Link className="font-bold text-cyan-800" to={`/sales/${r.id}`}>{r.number}</Link>,
          r.customer_name,
          r.date,
          money(r.total, lang),
          money(r.remaining, lang),
          <span className={statusClass(payStatus)}>{statusLabel(payStatus, lang)}</span>,
          <div className="flex flex-wrap items-center gap-2">
            {r.status === "pending_delivery" && can("delivery.update") ? (
              <button type="button" className="text-sm font-bold text-cyan-700" onClick={() => setAssignInv({ id: r.id, number: r.number })}>
                {tr("assignCourier")}
              </button>
            ) : null}
            <ActionBtns
              canEdit={can("sales.edit")}
              onEdit={() => { window.location.href = `/sales/${r.id}`; }}
              canDelete={can("sales.cancel") && r.status !== "cancelled"}
              onDelete={() => confirmDelete(r.number, async () => { await post(`/api/invoices/${r.id}/cancel`, {}); load(); })}
            />
          </div>,
          ];
        })}
      />
      )}
      <AssignCourierModal
        open={Boolean(assignInv)}
        invoice={assignInv}
        onClose={() => setAssignInv(null)}
        onDone={() => { load().catch(() => {}); }}
      />
      {dialog}
    </Page>
  );
}

export function InventoryPage() {
  const { tr, lang, can } = useApp();
  const f = useListQuery("inventory");
  const m = useListQuery("movements");
  const [rows, setRows] = useState<any[]>([]);
  const [sum, setSum] = useState<any>({});
  const [moves, setMoves] = useState<any[]>([]);
  const [adjOpen, setAdjOpen] = useState(false);
  const [adj, setAdj] = useState<any>({ product_id: "", qty: 1, reason: "" });
  const { confirmDelete, dialog } = useConfirm();
  const act = useActionError();
  function reload() {
    get("/api/inventory/summary").then(setSum).catch(() => {});
    get<{ data: any[] }>(`/api/products?${f.qs}&pageSize=80`).then((r) => setRows(r.data)).catch(() => {});
    get<{ data: any[] }>(`/api/inventory/movements?${m.qs}&pageSize=20`).then((r) => setMoves(r.data)).catch(() => {});
  }
  useEffect(() => { reload(); }, [f.qs, m.qs]);
  return (
    <Page title={tr("inventory")} action={
      <>
        {can("inventory.adjust") ? <Btn onClick={() => { setAdj({ product_id: "", qty: 1, reason: "" }); act.clear(); setAdjOpen(true); }}>{tr("easyAdjust")}</Btn> : null}
        <ExportBtn kind="inventory" query={f.qs} />
      </>
    }>
      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <Stat label={tr("stockValue")} value={money(sum.stock_value, lang)} />
        <Stat label={tr("lowStock")} value={num(sum.low, lang)} />
        <Stat label={tr("outOfStock")} value={num(sum.out, lang)} />
        <Stat label={tr("reserved")} value={num(sum.reserved, lang)} />
      </div>
      {(sum.by_warehouse || []).length ? (
        <div className="mb-4 grid gap-3 md:grid-cols-2">
          {sum.by_warehouse.map((w: any, i: number) => (
            <Stat key={i} label={w.name || tr("warehouses")} value={`${money(w.stock_value, lang)} · ${num(w.units, lang)}`} />
          ))}
        </div>
      ) : null}
      <SmartFilter
        f={f}
        date={false}
        fields={[
          { key: "brand_id", label: "brand", type: "select", quick: true, lookup: "brands" },
          { key: "model_id", label: "model", type: "select", quick: true, lookup: "models" },
          { key: "category_id", label: "categories", type: "select", lookup: "categories" },
          { key: "locations", label: "warehouse", type: "locations" },
          { key: "status", label: "status", type: "select", quick: true, options: [
            { value: "in", label: tr("stockIn") },
            { value: "low", label: tr("stockLow") },
            { value: "out", label: tr("stockOut") },
            { value: "dead", label: tr("deadStock") },
          ] },
          { key: "qty", label: "qtyRange", type: "range", minKey: "qty_min", maxKey: "qty_max" },
        ]}
      />
      {!rows.length ? <EmptyFilterState onClear={f.clear} /> : (
      <Table
        cols={[tr("name"), tr("sku"), tr("available"), tr("reserved"), tr("minStock"), tr("sellingPrice"), tr("location"), tr("status"), ""]}
        rows={rows.map((p) => [
          lang === "ar" ? p.name_ar : p.name_en,
          p.sku,
          p.available,
          p.reserved_stock,
          p.min_stock,
          money(p.selling_price, lang),
          p.location_name,
          <span className={statusClass(p.stock_status)}>{statusLabel(p.stock_status, lang)}</span>,
          <ActionBtns
            canEdit={can("products.edit")}
            canDelete={can("products.delete")}
            onEdit={() => { window.location.href = `/products/${p.id}`; }}
            onDelete={() => confirmDelete(lang === "ar" ? p.name_ar : p.name_en, async () => { await del(`/api/products/${p.id}`); get<{ data: any[] }>(`/api/products?${f.qs}&pageSize=80`).then((r) => setRows(r.data)).catch(() => {}); })}
          />,
        ])}
      />
      )}
      <h3 className="mb-2 mt-6 font-bold">{tr("movements")}</h3>
      <SmartFilter
        f={m}
        fields={[
          { key: "type", label: "movementType", type: "select", quick: true, options: ["sale_out", "purchase_in", "adjust", "transfer", "return_in", "damage"].map((t) => ({ value: t, label: statusLabel(t, lang) })) },
          { key: "brand_id", label: "brand", type: "select", lookup: "brands" },
          { key: "model_id", label: "model", type: "select", lookup: "models" },
          { key: "locations", label: "warehouse", type: "locations" },
          { key: "reference_type", label: "source", type: "text" },
        ]}
      />
      <Table
        cols={[tr("date"), tr("movementType"), tr("sku"), "Batch", tr("qty"), tr("fromLocation"), tr("toLocation")]}
        rows={moves.map((mv) => [
          mv.created_at,
          statusLabel(mv.type === "in" ? "purchase_in" : mv.type === "out" ? "sale_out" : mv.type === "return" ? "return_in" : mv.type, lang),
          mv.sku,
          mv.batch_code,
          mv.qty,
          mv.from_location || "-",
          mv.to_location || "-",
        ])}
      />
      {dialog}
      <Modal open={adjOpen} title={tr("easyAdjust")} onClose={() => { setAdjOpen(false); act.clear(); }}>
        <Field label={tr("products")}>
          <ProductPick value={adj.product_id} onChange={(id) => setAdj({ ...adj, product_id: id })} />
        </Field>
        <Field label={tr("qty")}>
          <input className={inputCls} type="number" value={adj.qty} onChange={(e) => setAdj({ ...adj, qty: Number(e.target.value) })} />
        </Field>
        <Field label={tr("reason")}>
          <input className={inputCls} value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} />
        </Field>
        <ErrorNote message={act.message} />
        <Btn className="mt-3" onClick={async () => {
          if (!adj.product_id) {
            act.fail(undefined, "errProductRequired");
            return;
          }
          if (!adj.qty) {
            act.fail(undefined, "errQtyRequired");
            return;
          }
          try {
            await post("/api/inventory/adjust", { product_id: Number(adj.product_id), qty: Number(adj.qty), reason: adj.reason });
            playSound("done");
            act.clear();
            setAdjOpen(false);
            reload();
          } catch (e) {
            act.fail(e);
          }
        }}>{tr("save")}</Btn>
      </Modal>
    </Page>
  );
}

export function BatchesPage() {
  const { tr, lang } = useApp();
  const f = useListQuery("batches");
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    get<{ data: any[] }>(`/api/inventory/batches?${f.qs}&pageSize=80`).then((r) => setRows(r.data)).catch(() => {});
  }, [f.qs]);
  return (
    <Page title={tr("batches")}>
      <SmartFilter f={f} date={false} fields={[
        { key: "locations", label: "warehouse", type: "locations" },
        { key: "brand_id", label: "brand", type: "select", lookup: "brands" },
        { key: "qty", label: "qtyRange", type: "range", minKey: "qty_min", maxKey: "qty_max" },
      ]} />
      {!rows.length ? <EmptyFilterState onClear={f.clear} /> : (
      <Table
        cols={["Batch", tr("name"), "PO", tr("location"), tr("cost"), tr("available"), tr("reserved"), tr("date")]}
        rows={rows.map((b) => [
          b.batch_code,
          lang === "ar" ? b.name_ar : b.name_en,
          b.purchase_number,
          b.location_name || b.location_path || "-",
          money(b.unit_cost, lang),
          b.available,
          b.reserved_qty,
          b.purchase_date,
        ])}
      />
      )}
    </Page>
  );
}

export function PurchasesPage() {
  const { tr, lang, lookups } = useApp();
  const f = useListQuery("purchases");
  const [rows, setRows] = useState<any[]>([]);
  const [totals, setTotals] = useState<any>({});
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ supplier_id: "", items: [] as any[] });
  const [draft, setDraft] = useState({ product_id: "" as any, quantity: "1", unit_cost: "", costDirty: false });
  const { confirmDelete, dialog } = useConfirm();
  const act = useActionError();
  async function load() {
    const r = await get<{ data: any[]; totals?: any }>(`/api/inventory/purchases?${f.qs}`);
    setRows(r.data);
    setTotals(r.totals || {});
  }
  useEffect(() => { load().catch(() => {}); }, [f.qs]);
  function resetDraft() {
    setDraft({ product_id: "", quantity: "1", unit_cost: "", costDirty: false });
  }
  function addDraftLine() {
    if (!draft.product_id) {
      act.fail(undefined, "errNoItems");
      return;
    }
    const qty = Number(draft.quantity || 0);
    if (qty <= 0) {
      act.fail(undefined, "errInvalidQty");
      return;
    }
    const unit_cost = Number(draft.unit_cost === "" ? 0 : draft.unit_cost);
    setForm({ ...form, items: [...form.items, { product_id: draft.product_id, quantity: qty, unit_cost }] });
    resetDraft();
    act.clear();
  }
  return (
    <Page title={tr("purchases")} action={<><ExportBtn kind="purchases" query={f.qs} /><Btn onClick={() => { act.clear(); setForm({ supplier_id: "", items: [] }); resetDraft(); setOpen(true); }}>{tr("newPurchase")}</Btn></>}>
      <ErrorNote message={act.message} />
      <div className="mb-3 grid gap-3 gx-kpi md:grid-cols-4">
        <Stat label={tr("purchases")} value={String(totals.count || rows.length)} />
        <Stat label={tr("total")} value={money(totals.total, lang)} />
        <Stat label={tr("purchaseDrafts")} value={String(rows.filter((r) => r.status === "draft").length)} />
        <Stat label={tr("purchaseApproved")} value={String(rows.filter((r) => r.status === "approved").length)} />
      </div>
      <SmartFilter f={f} fields={[
        { key: "supplier_id", label: "suppliers", type: "select", quick: true, lookup: "suppliers" },
        { key: "status", label: "status", type: "select", quick: true, options: ["draft", "submitted", "approved", "rejected"].map((s) => ({ value: s, label: statusLabel(s, lang) })) },
        { key: "brand_id", label: "brand", type: "select", lookup: "brands" },
        { key: "model_id", label: "model", type: "select", lookup: "models" },
        { key: "product_id", label: "products", type: "async", asyncPath: "/api/products", asyncLabel: (r) => `${r.sku} — ${r.name_ar}` },
        { key: "amount", label: "amountRange", type: "range", minKey: "amount_min", maxKey: "amount_max" },
      ]} />
      {!rows.length ? <EmptyFilterState onClear={f.clear} /> : (
      <Table
        cols={[tr("invoiceNo"), tr("supplier"), tr("date"), tr("total"), tr("status"), ""]}
        rows={rows.map((r) => [
          r.number,
          r.supplier_name,
          r.date,
          money(r.total, lang),
          <span className={statusClass(r.status)}>{statusLabel(r.status, lang)}</span>,
          <span className="flex flex-wrap gap-2">
            <Link className="font-bold text-cyan-700" to={`/purchases/${r.id}`}>{tr("view")}</Link>
            {r.status === "draft" ? <button className="font-bold text-cyan-700" onClick={async () => { try { act.clear(); await post(`/api/inventory/purchases/${r.id}/submit`, {}); playSound("done"); load(); } catch (e) { act.fail(e); } }}>{tr("submitPurchase")}</button> : null}
            {r.status === "draft" || r.status === "submitted" ? <button className="font-bold text-cyan-700" onClick={async () => { try { act.clear(); await post(`/api/inventory/purchases/${r.id}/approve`, {}); playSound("done"); load(); } catch (e) { act.fail(e); } }}>{tr("approve")}</button> : null}
            {r.status === "submitted" || r.status === "draft" ? <button className="font-bold text-rose-600" onClick={() => confirmDelete(r.number, async () => { await post(`/api/inventory/purchases/${r.id}/void`, {}); load(); })}>{tr("delete")}</button> : null}
          </span>,
        ])}
      />
      )}
      <Modal open={open} title={tr("newPurchase")} onClose={() => { setOpen(false); act.clear(); }} wide>
        <Field label={tr("supplier")}>
          <select className={inputCls} value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}>
            <option value="">-</option>
            {lookups?.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        {form.items.length ? (
          <div className="table-wrap mt-3">
            <table>
              <thead><tr><th>{tr("items")}</th><th>{tr("qty")}</th><th>{tr("price")}</th></tr></thead>
              <tbody>
                {form.items.map((it: any, i: number) => (
                  <tr key={`${it.product_id}-${i}`}>
                    <td>{it.product_id}</td>
                    <td>{it.quantity}</td>
                    <td>{it.unit_cost}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <div className="mt-2 grid grid-cols-3 gap-2">
          <ProductPick value={draft.product_id} onChange={(id, cost) => {
            setDraft((d) => ({
              ...d,
              product_id: id,
              unit_cost: d.costDirty ? d.unit_cost : (cost != null ? String(cost) : d.unit_cost),
            }));
          }} />
          <input className={inputCls} type="text" inputMode="decimal" placeholder="qty" value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: e.target.value })} />
          <input className={inputCls} type="text" inputMode="decimal" placeholder="cost" value={draft.unit_cost} onChange={(e) => setDraft({ ...draft, unit_cost: e.target.value, costDirty: true })} />
        </div>
        <button className="mt-2 text-sm font-bold text-cyan-700" onClick={addDraftLine}>+ {tr("add")}</button>
        <ErrorNote message={act.message} />
        <Btn className="mt-4" onClick={async () => {
          if (!form.supplier_id) {
            act.fail(undefined, "errSupplierRequired");
            return;
          }
          if (!form.items?.length || form.items.some((it: any) => !it.product_id || Number(it.quantity) <= 0)) {
            act.fail(undefined, form.items.some((it: any) => Number(it.quantity) <= 0) ? "errInvalidQty" : "errNoItems");
            return;
          }
          try {
            await post("/api/inventory/purchases", form);
            playSound("done");
            act.clear();
            setOpen(false);
            load();
          } catch (e) {
            act.fail(e);
          }
        }}>{tr("save")}</Btn>
      </Modal>
      {dialog}
    </Page>
  );
}

function ProductPick({ value, onChange }: { value: any; onChange: (id: number, cost?: number) => void }) {
  const { tr } = useApp();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<any[]>([]);
  const [miss, setMiss] = useState("");
  useEffect(() => {
    if (!q.trim()) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => get<{ data: any[] }>(`/api/products/search?q=${encodeURIComponent(q)}`).then((r) => setHits(r.data || [])).catch(() => setHits([])), 120);
    return () => clearTimeout(t);
  }, [q]);
  function pick(p: any) {
    playSound("ok");
    setMiss("");
    onChange(p.id, p.purchase_price);
    setQ(p.sku);
    setHits([]);
  }
  return (
    <div className="col-span-3">
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
      {hits.map((p) => (
        <button key={p.id} className="block w-full px-2 py-1 text-start text-sm hover:bg-slate-50" onClick={() => pick(p)}>
          {p.sku} — {p.name_en}
        </button>
      ))}
    </div>
  );
}

export function PurchaseDetail() {
  const { id } = useParams();
  const { tr, lang, can } = useApp();
  const [d, setD] = useState<any>(null);
  const [serials, setSerials] = useState("");
  const [pid, setPid] = useState("");
  const act = useActionError();
  useEffect(() => { get<{ data: any }>(`/api/inventory/purchases/${id}`).then((r) => setD(r.data)); }, [id]);
  if (!d) return <div>{tr("loading")}</div>;
  return (
    <Page title={d.number}>
      <div className="mb-3">{d.supplier_name} · {d.date} · {money(d.total, lang)}</div>
      <Table cols={[tr("sku"), tr("qty"), tr("unitCost"), tr("total")]} rows={(d.items || []).map((i: any) => [i.sku, i.quantity, money(i.unit_cost, lang), money(i.total, lang)])} />
      <div className="print-only label-sheet">
        {(d.items || []).map((i: any) => (
          <div key={i.id} className="mb-2">{i.sku} × {i.quantity}</div>
        ))}
      </div>
      {d.status === "approved" && can("serials.manage") ? (
        <div className="no-print mt-4 grid gap-2 md:grid-cols-2">
          <Field label={tr("products")}>
            <select className={inputCls} value={pid} onChange={(e) => setPid(e.target.value)}>
              <option value="">-</option>
              {(d.items || []).map((i: any) => <option key={i.product_id} value={i.product_id}>{i.sku}</option>)}
            </select>
          </Field>
          <Field label={tr("serials")}><textarea className={inputCls} value={serials} onChange={(e) => setSerials(e.target.value)} /></Field>
          <ErrorNote message={act.message} />
          <Btn onClick={async () => {
            if (!pid) {
              act.fail(undefined, "errProductRequired");
              return;
            }
            const list = serials.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
            if (!list.length) {
              act.fail(undefined, "errSerialsRequired");
              return;
            }
            try {
              await post("/api/serials", { product_id: Number(pid), purchase_id: d.id, serials: list });
              playSound("done");
              act.clear();
              setSerials("");
            } catch (e) {
              act.fail(e);
            }
          }}>{tr("save")}</Btn>
        </div>
      ) : null}
    </Page>
  );
}

export function CustomersPage() {
  const { tr, lang, can, lookups, settings } = useApp();
  const f = useListQuery("customers");
  const [rows, setRows] = useState<any[]>([]);
  const [totals, setTotals] = useState<any>({});
  const [open, setOpen] = useState(false);
  const emptyCust = () => ({ id: 0, name: "", phone: "", address: "", area: "", email: "", company: "", city: "", tax_id: "", national_id: "", customer_type: "retail", payment_terms: "cash", credit_limit: 0, current_balance: 0, price_list_id: "" as any, account_kind: "credit", discount_pct: 0, sell_price: 0, lat: "" as any, lng: "" as any });
  const [form, setForm] = useState(emptyCust());
  const [payOpen, setPayOpen] = useState<any>(null);
  const { confirmDelete, dialog } = useConfirm();
  const act = useActionError();
  const shop = { lat: Number(settings.workplace_lat || 30.0566), lng: Number(settings.workplace_lng || 31.33) };
  async function load() {
    const r = await get<{ data: any[]; totals?: any }>(`/api/customers?${f.qs}`);
    setRows(r.data);
    setTotals(r.totals || {});
  }
  useEffect(() => { load().catch(() => {}); }, [f.qs]);
  return (
    <Page title={tr("customers")} action={<><ExportBtn kind="customers" query={f.qs} />{can("customers.create") ? <Btn onClick={() => { act.clear(); setForm(emptyCust()); setOpen(true); }}>{tr("addCustomer")}</Btn> : null}</>}>
      <ErrorNote message={act.message} />
      <div className="mb-3 grid gap-3 md:grid-cols-2">
        <Stat label={tr("customers")} value={String(totals.count || rows.length)} />
        <Stat label={tr("balance")} value={money(totals.balance, lang)} />
      </div>
      <SmartFilter f={f} date={false} fields={[
        { key: "account_kind", label: "accountKind", type: "select", quick: true, options: [{ value: "debit", label: tr("debitAccount") }, { value: "credit", label: tr("creditAccount") }] },
        { key: "hide_zero", label: "hideZero", type: "select", quick: true, options: [{ value: "1", label: tr("hideZero") }] },
        { key: "status", label: "status", type: "select", quick: true, options: [{ value: "active", label: tr("active") }, { value: "inactive", label: tr("inactive") }] },
        { key: "debt", label: "balance", type: "select", options: [{ value: "yes", label: tr("hasDebt") }, { value: "no", label: tr("noDebt") }] },
        { key: "over_limit", label: "overCredit", type: "select", options: [{ value: "1", label: tr("overCredit") }] },
        { key: "price_list_id", label: "priceLists", type: "select", lookup: "price_lists" },
        { key: "city", label: "city", type: "text" },
        { key: "area", label: "area", type: "text" },
        { key: "balance", label: "balanceRange", type: "range", minKey: "balance_min", maxKey: "balance_max" },
      ]}
        sorts={[{ value: "name_az", label: tr("nameAZ") }, { value: "balance_high", label: tr("highestBalance") }, { value: "balance_low", label: tr("lowestBalance") }]}
      />
      {!rows.length ? <EmptyFilterState onClear={f.clear} /> : (
      <Table
        cols={[tr("name"), tr("phone"), tr("city"), tr("area"), tr("balance"), tr("accountKind"), ""]}
        rows={rows.map((c) => [
          <Link className="font-bold" to={`/customers/${c.id}`}>{c.name}</Link>,
          <span>{c.phone} {c.whatsapp ? <a className="text-emerald-700" href={`https://wa.me/${String(c.whatsapp).replace(/\D/g,"").replace(/^0/,"20")}`} target="_blank" rel="noreferrer">[{tr("whatsapp")}]</a> : null}</span>,
          c.city,
          c.area,
          customerBalanceLabel(c.current_balance, lang),
          c.account_kind === "credit" ? tr("creditAccount") : tr("debitAccount"),
          <span className="flex flex-wrap items-center gap-2">
            <button className="text-sm font-bold text-cyan-700" onClick={() => setPayOpen(c)}>{tr("makeReceipt")}</button>
            <ActionBtns
              canEdit={can("customers.edit")}
              canDelete={can("customers.edit")}
              onEdit={() => { act.clear(); setForm({ ...form, ...c, id: c.id, price_list_id: c.price_list_id || "", account_kind: c.account_kind || "debit" }); setOpen(true); }}
              onDelete={() => confirmDelete(c.name, async () => { await del(`/api/customers/${c.id}`); load(); })}
            />
          </span>,
        ])}
      />
      )}
      <Modal open={open} title={form.id ? tr("edit") : tr("addCustomer")} onClose={() => setOpen(false)}>
        {["name","phone","email","company","national_id","tax_id","city","address","area"].map((k) => <Field key={k} label={k === "email" ? tr("email") : k === "company" ? tr("company") : k === "national_id" ? tr("nationalId") : k === "tax_id" ? tr("taxId") : k === "city" ? tr("city") : k}><input className={inputCls} value={(form as any)[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></Field>)}
        <Field label={tr("customerType")}>
          <select className={inputCls} value={form.customer_type} onChange={(e) => setForm({ ...form, customer_type: e.target.value })}>
            <option value="retail">{tr("retail")}</option>
            <option value="wholesale">{tr("wholesale")}</option>
            <option value="both">{tr("hybridParty")}</option>
          </select>
        </Field>
        {form.id ? null : (
          <Field label={tr("openingBalance")}>
            <input className={inputCls} type="text" inputMode="decimal" value={form.current_balance} onChange={(e) => setForm({ ...form, current_balance: e.target.value as any })} />
            <p className="mt-1 text-xs text-slate-500">{tr("openingCreditHint")}</p>
          </Field>
        )}
        <Field label={tr("accountKind")}>
          <select className={inputCls} value={form.account_kind} onChange={(e) => setForm({ ...form, account_kind: e.target.value })}>
            <option value="debit">{tr("debitAccount")}</option>
            <option value="credit">{tr("creditAccount")}</option>
          </select>
        </Field>
        <Field label={tr("priceLists")}>
          <select className={inputCls} value={form.price_list_id || ""} onChange={(e) => setForm({ ...form, price_list_id: e.target.value ? Number(e.target.value) : "" })}>
            <option value="">-</option>
            {(lookups?.price_lists || []).map((l) => <option key={l.id} value={l.id}>{lang === "ar" ? l.name : (l.name_en || l.name)}</option>)}
          </select>
        </Field>
        <Field label={tr("discountPct")}><input className={inputCls} type="number" value={form.discount_pct} onChange={(e) => setForm({ ...form, discount_pct: Number(e.target.value) })} /></Field>
        <Field label={tr("specialPrice")}><input className={inputCls} type="number" value={form.sell_price} onChange={(e) => setForm({ ...form, sell_price: Number(e.target.value) })} /></Field>
        <p className="mt-2 flex items-center gap-2 text-xs font-bold text-slate-500"><MapPin size={16} /> {tr("pickCustomerPin")}</p>
        <div className="mt-2 no-print">
          <OsmMap
            center={{ lat: Number(form.lat || shop.lat), lng: Number(form.lng || shop.lng) }}
            shop={shop}
            height={220}
            onPick={(lat, lng) => setForm({ ...form, lat, lng })}
            markers={form.lat && form.lng ? [{ id: "pick", lat: Number(form.lat), lng: Number(form.lng), label: "📍" }] : []}
          />
        </div>
        <ErrorNote message={act.message} />
        <Btn className="mt-3" onClick={async () => {
          if (!form.name.trim()) { act.fail(undefined, "errNameRequired"); return; }
          try {
            const payload = { ...form, price_list_id: form.price_list_id || null, current_balance: Number(form.current_balance || 0), lat: form.lat || null, lng: form.lng || null };
            if (form.id) await put(`/api/customers/${form.id}`, payload);
            else await post("/api/customers", payload);
            setOpen(false); act.clear(); load();
          } catch (e) { act.fail(e); }
        }}>{tr("save")}</Btn>
      </Modal>
      <PaymentModal
        open={!!payOpen}
        title={tr("makeReceipt")}
        due={Math.max(0, Number(payOpen?.current_balance) || 0)}
        debt={Number(payOpen?.current_balance) || 0}
        onClose={() => setPayOpen(null)}
        onSubmit={async (r) => {
          if (!payOpen) return;
          try {
            await post(`/api/customers/${payOpen.id}/payments`, { amount: r.paid, surplus_mode: r.surplus_mode });
            setPayOpen(null);
            act.clear();
            load();
          } catch (e) {
            act.fail(e);
          }
        }}
      />
      {dialog}
    </Page>
  );
}

export function CustomerDetail() {
  const { id } = useParams();
  const { tr, lang } = useApp();
  const [d, setD] = useState<any>(null);
  const [tab, setTab] = useState<"overview" | "invoices" | "payments" | "returns" | "statement" | "items" | "overdue">("overview");
  async function reload() {
    setD((await get<{ data: any }>(`/api/customers/${id}`)).data);
  }
  useEffect(() => { reload().catch(() => {}); }, [id]);
  if (!d) return <div>{tr("loading")}</div>;
  const wa = d.whatsapp || d.phone;
  const tabs = [
    ["overview", tr("overview")],
    ["invoices", tr("sales")],
    ["payments", tr("payments")],
    ["returns", tr("returns")],
    ["statement", tr("statement")],
    ["items", tr("statementItems")],
    ["overdue", tr("overdueInvoices")],
  ] as const;
  return (
    <Page title={d.name} action={
      <div className="flex gap-2">
        <Link className="rounded-xl bg-ink px-3 py-2 text-sm font-bold text-white" to="/pos">{tr("pos")}</Link>
        {wa ? <a className="rounded-xl border border-emerald-200 px-3 py-2 text-sm font-bold text-emerald-700" href={`https://wa.me/${String(wa).replace(/\D/g, "").replace(/^0/, "20")}`} target="_blank" rel="noreferrer">{tr("whatsapp")}</a> : null}
      </div>
    }>
      <div className="detail-strip mb-4 grid gap-3 md:grid-cols-5">
        <Stat label={tr("name")} value={d.name || "-"} />
        <Stat label={tr("code")} value={String(d.code || d.id)} />
        <Stat label={tr("phone")} value={d.phone || "-"} />
        <Stat label={tr("balance")} value={customerBalanceLabel(d.current_balance, lang)} accent={Number(d.current_balance) > 0 ? "rose" : "emerald"} />
        <Stat label={tr("representative")} value={d.agent_name || d.sales_agent_name || "-"} />
      </div>
      <div className="mb-3 flex flex-wrap gap-2 page-tabs">
        {tabs.map(([k, label]) => (
          <button key={k} className={`rounded-xl px-3 py-1.5 text-sm font-bold ${tab === k ? "bg-ink text-white" : "bg-slate-100"}`} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>
      {tab === "overview" ? (
        <div className="mb-4 grid gap-3 md:grid-cols-4">
          <Stat label={tr("email")} value={d.email || "-"} />
          <Stat label={tr("company")} value={d.company || "-"} />
          <Stat label={tr("city")} value={d.city || d.area || "-"} />
          <Stat label={tr("taxId")} value={d.tax_id || "-"} />
          <Stat label={tr("nationalId")} value={d.national_id || "-"} />
        </div>
      ) : null}
      {tab === "invoices" ? <Table cols={[tr("invoiceNo"), tr("date"), tr("total"), tr("remaining"), tr("status")]} rows={(d.invoices||[]).map((i: any) => {
        const payStatus = Number(i.remaining) > 0 && Number(i.paid) <= 0 && i.status === "partial" ? "unpaid_sale" : i.status;
        return [<Link to={`/sales/${i.id}`}>{i.number}</Link>, i.date, money(i.total, lang), money(i.remaining, lang), statusLabel(payStatus, lang)];
      })} /> : null}
      {tab === "payments" ? <Table cols={[tr("date"), tr("amount"), tr("payMethod")]} rows={(d.payments||[]).map((p: any) => [p.date, money(p.amount, lang), p.method || p.payment_method])} /> : null}
      {tab === "returns" ? <Table cols={[tr("invoiceNo"), tr("date"), tr("total")]} rows={(d.returns||[]).map((r: any) => [r.number, r.date, money(r.total, lang)])} /> : null}
      {tab === "statement" ? <Table cols={[tr("date"), tr("kind"), tr("invoiceNo"), tr("total")]} rows={[
        ...(d.invoices || []).map((i: any) => [i.date, tr("sales"), i.number, money(i.total, lang)]),
        ...(d.payments || []).map((p: any) => [p.date, tr("payments"), p.invoice_id || "-", money(p.amount, lang)]),
      ].sort((a, b) => String(b[0]).localeCompare(String(a[0])))} /> : null}
      {tab === "items" ? <Table cols={[tr("date"), tr("invoiceNo"), tr("items"), tr("qty"), tr("price"), tr("total")]} rows={(d.statement_items || []).map((r: any) => [r.date, r.number, r.product_name, num(r.quantity, lang), money(r.unit_price, lang), money(r.total, lang)])} /> : null}
      {tab === "overdue" ? <Table cols={[tr("invoiceNo"), tr("date"), tr("total"), tr("remaining")]} rows={(d.overdue || []).map((i: any) => [<Link to={`/sales/${i.id}`}>{i.number}</Link>, i.date, money(i.total, lang), money(i.remaining, lang)])} /> : null}
    </Page>
  );
}

export function SuppliersPage() {
  const { tr, lang, can, settings } = useApp();
  const f = useListQuery("suppliers");
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const emptySup = () => ({ id: 0, name: "", phone: "", email: "", city: "", contact_name: "", tax_id: "", address: "", notes: "", currency: "EGP", opening_balance: "", fx_rate: settings.usd_egp_rate || "50", balance: 0 });
  const [form, setForm] = useState(emptySup());
  const { confirmDelete, dialog } = useConfirm();
  const act = useActionError();
  const rate = Number(form.fx_rate || settings.usd_egp_rate || 50);
  async function load() { setRows((await get<{ data: any[] }>(`/api/suppliers?${f.qs}`)).data); }
  useEffect(() => { load().catch(() => {}); }, [f.qs]);
  return (
    <Page title={tr("suppliers")} action={<Btn onClick={() => { act.clear(); setForm(emptySup()); setOpen(true); }}>{tr("add")}</Btn>}>
      <SmartFilter f={f} date={false} fields={[
        { key: "status", label: "status", type: "select", quick: true, options: [{ value: "active", label: tr("active") }, { value: "inactive", label: tr("inactive") }] },
        { key: "dues", label: "balance", type: "select", options: [{ value: "yes", label: tr("hasDues") }, { value: "no", label: tr("noDues") }] },
        { key: "brand_id", label: "brand", type: "select", lookup: "brands" },
        { key: "balance", label: "balanceRange", type: "range", minKey: "balance_min", maxKey: "balance_max" },
      ]} />
      {!rows.length ? <EmptyFilterState onClear={f.clear} /> : (
      <Table cols={[tr("name"), tr("phone"), tr("city"), tr("balance"), ""]} rows={rows.map((s) => [
        <Link className="font-bold" to={`/suppliers/${s.id}`}>{s.name}</Link>,
        s.phone,
        s.city,
        supplierBalanceLabel(s.balance, s.currency, settings.usd_egp_rate, lang),
        <ActionBtns
          canEdit={can("suppliers.manage")}
          canDelete={can("suppliers.manage")}
          onEdit={() => { setForm({ ...emptySup(), ...s, id: s.id, fx_rate: settings.usd_egp_rate || "50", opening_balance: "" }); setOpen(true); }}
          onDelete={() => confirmDelete(s.name, async () => { await del(`/api/suppliers/${s.id}`); load(); })}
        />,
      ])} />
      )}
      <Modal open={open} title={form.id ? tr("edit") : tr("suppliers")} onClose={() => setOpen(false)}>
        {["name","contact_name","phone","email","tax_id","city","address","notes"].map((k) => <Field key={k} label={k === "email" ? tr("email") : k === "tax_id" ? tr("taxId") : k === "city" ? tr("city") : k === "contact_name" ? tr("contactName") : k}><input className={inputCls} value={(form as any)[k] || ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></Field>)}
        <Field label={tr("currency")}>
          <select className={inputCls} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
            <option value="EGP">EGP</option>
            <option value="USD">USD</option>
          </select>
        </Field>
        <Field label={tr("usdRate")}><input className={inputCls} type="text" inputMode="decimal" value={form.fx_rate} onChange={(e) => setForm({ ...form, fx_rate: e.target.value })} /></Field>
        {form.id ? null : (
          <Field label={tr("openingBalance")}>
            <input className={inputCls} type="text" inputMode="decimal" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} />
            <p className="mt-1 text-xs text-slate-500">{tr("openingCreditHint")}</p>
          </Field>
        )}
        {form.id ? <p className="mt-2 text-sm font-bold">{supplierBalanceLabel(form.balance, form.currency, rate, lang)}</p> : null}
        <ErrorNote message={act.message} />
        <Btn className="mt-3" onClick={async () => {
          try {
            if (form.id) await put(`/api/suppliers/${form.id}`, form);
            else await post("/api/suppliers", form);
            setOpen(false); act.clear(); load();
          } catch (e) { act.fail(e); }
        }}>{tr("save")}</Btn>
      </Modal>
      {dialog}
    </Page>
  );
}

export function SupplierDetail() {
  const { id } = useParams();
  const { tr, lang, settings } = useApp();
  const [d, setD] = useState<any>(null);
  const [tab, setTab] = useState<"overview" | "purchases" | "prices" | "statement">("overview");
  useEffect(() => { get<{ data: any }>(`/api/suppliers/${id}`).then((r) => setD(r.data)); }, [id]);
  if (!d) return <div>{tr("loading")}</div>;
  const tabs = [
    ["overview", tr("overview")],
    ["purchases", tr("purchases")],
    ["prices", tr("comparePrices")],
    ["statement", tr("statement")],
  ] as const;
  return (
    <Page title={d.name}>
      <div className="detail-strip mb-4 grid gap-3 md:grid-cols-5">
        <Stat label={tr("name")} value={d.name || "-"} />
        <Stat label={tr("code")} value={String(d.code || d.id)} />
        <Stat label={tr("phone")} value={d.phone || "-"} />
        <Stat label={tr("balance")} value={supplierBalanceLabel(d.balance, d.currency, settings.usd_egp_rate, lang)} accent="rose" />
        <Stat label={tr("city")} value={d.city || "-"} />
      </div>
      <div className="mb-3 flex flex-wrap gap-2 page-tabs">
        {tabs.map(([k, label]) => (
          <button key={k} className={`rounded-xl px-3 py-1.5 text-sm font-bold ${tab === k ? "bg-ink text-white" : "bg-slate-100"}`} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>
      {tab === "overview" ? (
        <div className="mb-4 grid gap-3 md:grid-cols-4">
          <Stat label={tr("email")} value={d.email || "-"} />
          <Stat label={tr("taxId")} value={d.tax_id || "-"} />
          <Stat label={tr("contactName")} value={d.contact_name || "-"} />
          <Stat label={tr("address")} value={d.address || "-"} />
        </div>
      ) : null}
      {tab === "purchases" ? <Table cols={[tr("invoiceNo"), tr("date"), tr("total"), tr("status")]} rows={(d.purchases||[]).map((p: any) => [<Link to={`/purchases/${p.id}`}>{p.number}</Link>, p.date, money(p.total, lang), statusLabel(p.status, lang)])} /> : null}
      {tab === "prices" ? <Table cols={[tr("sku"), tr("name"), tr("supplierPrice"), tr("date")]} rows={(d.prices||[]).map((p: any) => [p.sku, lang==="ar"?p.name_ar:p.name_en, money(p.unit_cost, lang), p.last_date])} /> : null}
      {tab === "statement" ? <Table cols={[tr("date"), tr("kind"), tr("invoiceNo"), tr("total")]} rows={(d.purchases||[]).map((p: any) => [p.date, tr("purchases"), p.number, money(p.total, lang)])} /> : null}
    </Page>
  );
}

export function PriceListsPage() {
  const { tr, lang, can } = useApp();
  const f = useListQuery("price-lists");
  const [lists, setLists] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const { confirmDelete, dialog } = useConfirm();
  const act = useActionError();
  async function load() {
    const all = (await get<{ data: any[] }>("/api/price-lists")).data || [];
    const q = (f.values.q || "").toLowerCase();
    setLists(q ? all.filter((l) => `${l.name} ${l.name_en || ""}`.toLowerCase().includes(q)) : all);
  }
  useEffect(() => { load().catch(() => {}); }, [f.qs]);
  return (
    <Page title={tr("priceLists")} action={can("prices.manage") ? <Btn onClick={() => { act.clear(); setOpen(true); }}>{tr("add")}</Btn> : null}>
      <ErrorNote message={act.message} />
      <SmartFilter f={f} date={false} fields={[]} />
      <Table cols={[tr("name"), tr("status"), ""]} rows={lists.map((l) => [
        lang==="ar"?l.name:(l.name_en||l.name),
        l.active ? tr("active") : tr("inactive"),
        <span className="flex gap-2">
          <Link className="font-bold text-cyan-700" to={`/price-lists/${l.id}`}>{tr("edit")}</Link>
          {can("prices.manage") ? <button className="font-bold text-rose-600" onClick={() => confirmDelete(l.name, async () => { await del(`/api/price-lists/${l.id}`); load(); })}>{tr("delete")}</button> : null}
        </span>,
      ])} />
      <Modal open={open} title={tr("priceLists")} onClose={() => setOpen(false)}>
        <Field label={tr("name")}><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <ErrorNote message={act.message} />
        <Btn className="mt-3" onClick={async () => {
          if (!name.trim()) { act.fail(undefined, "errNameRequired"); return; }
          try {
            await post("/api/price-lists", { name, name_en: name });
            setOpen(false); setName(""); act.clear(); load();
          } catch (e) { act.fail(e); }
        }}>{tr("save")}</Btn>
      </Modal>
      {dialog}
    </Page>
  );
}

export function PriceListDetail() {
  const { id } = useParams();
  const { tr, lang, can } = useApp();
  const f = useListQuery(`price-list-${id || "x"}`);
  const [d, setD] = useState<any>(null);
  const [edits, setEdits] = useState<Record<number, string>>({});
  const act = useActionError();
  async function load() { const r = await get<{ data: any }>(`/api/price-lists/${id}`); setD(r.data); }
  useEffect(() => { load().catch(() => {}); }, [id]);
  if (!d) return <div>{tr("loading")}</div>;
  const q = (f.values.q || "").toLowerCase();
  const items = (d.items || []).filter((i: any) => !q || `${i.sku} ${i.name_ar} ${i.name_en}`.toLowerCase().includes(q));
  return (
    <Page title={d.name} action={can("prices.manage") ? <Btn onClick={async () => {
      const payload = Object.entries(edits).map(([pid, price]) => ({ product_id: Number(pid), price: Number(price) }));
      if (!payload.length) return;
      try { await put("/api/price-lists/" + id + "/items", { items: payload }); act.clear(); load(); } catch (e) { act.fail(e); }
    }}>{tr("save")}</Btn> : null}>
      <ErrorNote message={act.message} />
      <SmartFilter f={f} date={false} fields={[]} />
      <Table
        cols={[tr("sku"), tr("name"), tr("sellingPrice"), tr("price")]}
        rows={items.map((i: any) => [
          i.sku,
          lang === "ar" ? i.name_ar : i.name_en,
          money(i.selling_price, lang),
          <input className={`${inputCls} w-28`} type="number" defaultValue={i.price} onChange={(e) => setEdits({ ...edits, [i.product_id]: e.target.value })} />,
        ])}
      />
    </Page>
  );
}

export function CatalogCrud({ table, title }: { table: string; title: string }) {
  const { tr, lang, refreshLookups, can } = useApp();
  const f = useListQuery(`catalog-${table}`);
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ name_ar: "", name_en: "", name: "", code: "", warehouse: "", rack: "", shelf: "", drawer: "", box: "", brand_id: "", year: "" });
  const { confirmDelete, dialog } = useConfirm();
  const act = useActionError();
  const path = table === "models" ? "/api/models" : `/api/${table}`;
  const apiTable = table === "models" ? "device_models" : table;
  async function load() { setRows((await get<{ data: any[] }>(`${path}?${f.qs}`)).data); }
  useEffect(() => { load().catch(() => {}); }, [table, f.qs]);
  return (
    <Page title={title} action={<Btn onClick={() => { act.clear(); setForm({ name_ar: "", name_en: "", name: "", code: "", warehouse: "", rack: "", shelf: "", drawer: "", box: "", brand_id: "", year: "", id: 0 }); setOpen(true); }}>{tr("add")}</Btn>}>
      <SmartFilter f={f} date={false} fields={table === "models" ? [{ key: "brand_id", label: "brand", type: "select", quick: true, lookup: "brands" }] : []} />
      {!rows.length ? <EmptyFilterState onClear={f.clear} /> : (
      <Table
        cols={[tr("name"), tr("code"), tr("status"), ""]}
        rows={rows.map((r) => [
          r.name || (lang === "ar" ? r.name_ar : r.name_en),
          r.code || r.brand_en || "",
          r.active === 0 ? tr("inactive") : tr("active"),
          <ActionBtns
            canEdit
            canDelete
            onEdit={() => { act.clear(); setForm({ ...r, year: r.year || "", brand_id: r.brand_id || "" }); setOpen(true); }}
            onDelete={() => confirmDelete(r.name || r.name_ar || r.code, async () => { await del(`/api/${apiTable}/${r.id}`); load(); refreshLookups(); })}
          />,
        ])}
      />
      )}
      <Modal open={open} title={form.id ? tr("edit") : title} onClose={() => { setOpen(false); act.clear(); }}>
        {table === "storage_locations" ? (
          ["name","warehouse","section","rack","shelf","drawer","box"].map((k) => <Field key={k} label={k}><input className={inputCls} value={form[k] || ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></Field>)
        ) : table === "device_models" || table === "models" ? (
          <>
            <Field label="brand_id"><input className={inputCls} value={form.brand_id || ""} onChange={(e) => setForm({ ...form, brand_id: Number(e.target.value) })} placeholder="1=Apple" /></Field>
            {["name","code","year"].map((k) => <Field key={k} label={k}><input className={inputCls} value={form[k] || ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></Field>)}
          </>
        ) : (
          ["name_ar","name_en","code"].map((k) => <Field key={k} label={k}><input className={inputCls} value={form[k] || ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></Field>)
        )}
        <ErrorNote message={act.message} />
        <Btn className="mt-3" onClick={async () => {
          try {
            if (form.id) await put(`/api/${apiTable}/${form.id}`, form);
            else await post(`/api/${apiTable}`, form);
            act.clear();
            setOpen(false); load(); refreshLookups();
          } catch (e) {
            act.fail(e);
          }
        }}>{tr("save")}</Btn>
      </Modal>
      {dialog}
    </Page>
  );
}

export function ExpensesPage() {
  const { tr, lang, can } = useApp();
  const f = useListQuery("expenses");
  const [rows, setRows] = useState<any[]>([]);
  const [totals, setTotals] = useState<any>({});
  const [cats, setCats] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ category_id: 1, amount: 0, description: "", date: new Date().toISOString().slice(0,10), cost_center: "", recurring: 0, recur_every_days: 30 });
  const { confirmDelete, dialog } = useConfirm();
  async function load() {
    const r = await get<{ data: any[]; totals?: any }>(`/api/expenses?${f.qs}`);
    setRows(r.data);
    setTotals(r.totals || {});
    setCats((await get<{ data: any[] }>("/api/expense-categories")).data);
  }
  useEffect(() => { load().catch(() => {}); }, [f.qs]);
  return (
    <Page title={tr("expenses")} action={<><ExportBtn kind="expenses" query={f.qs} /><Btn onClick={() => setOpen(true)}>{tr("newExpense")}</Btn></>}>
      <Stat label={tr("total")} value={money(totals.total, lang)} />
      <SmartFilter f={f} fields={[
        { key: "category_id", label: "expensesCat", type: "select", quick: true, options: cats.map((c) => ({ value: String(c.id), label: lang === "ar" ? c.name_ar : c.name_en })) },
        { key: "recurring", label: "recurring", type: "select", options: [{ value: "1", label: tr("recurring") }, { value: "0", label: tr("all") }] },
        { key: "cost_center", label: "costCenter", type: "text" },
        { key: "amount", label: "amountRange", type: "range", minKey: "amount_min", maxKey: "amount_max" },
      ]} />
      {!rows.length ? <EmptyFilterState onClear={f.clear} /> : (
      <Table cols={[tr("date"), tr("expensesCat"), tr("amount"), tr("costCenter"), tr("description"), ""]} rows={rows.map((e) => [
        e.date,
        lang==="ar"?e.category_ar:e.category_en,
        money(e.amount, lang),
        e.cost_center || (e.recurring ? tr("recurring") : "-"),
        e.description,
        can("expenses.void", "expenses.create") ? <button className="font-bold text-rose-600" onClick={() => confirmDelete(e.description || String(e.amount), async () => { await post(`/api/expenses/${e.id}/void`, {}); load(); })}>{tr("delete")}</button> : null,
      ])} />
      )}
      <Modal open={open} title={tr("newExpense")} onClose={() => setOpen(false)}>
        <select className={inputCls} value={form.category_id} onChange={(e) => setForm({ ...form, category_id: Number(e.target.value) })}>
          {cats.map((c) => <option key={c.id} value={c.id}>{lang==="ar"?c.name_ar:c.name_en}</option>)}
        </select>
        <input className={`${inputCls} mt-2`} type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
        <input className={`${inputCls} mt-2`} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={tr("description")} />
        <input className={`${inputCls} mt-2`} value={form.cost_center} onChange={(e) => setForm({ ...form, cost_center: e.target.value })} placeholder={tr("costCenter")} />
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!form.recurring} onChange={(e) => setForm({ ...form, recurring: e.target.checked ? 1 : 0 })} />
          {tr("recurring")}
        </label>
        {form.recurring ? <input className={`${inputCls} mt-2`} type="number" value={form.recur_every_days} onChange={(e) => setForm({ ...form, recur_every_days: Number(e.target.value) })} /> : null}
        <Btn className="mt-3" onClick={async () => { await post("/api/expenses", form); setOpen(false); load(); }}>{tr("save")}</Btn>
      </Modal>
      {dialog}
    </Page>
  );
}

export function PaymentsPage() {
  const { tr, lang, can } = useApp();
  const f = useListQuery("payments");
  const [rows, setRows] = useState<any[]>([]);
  const [totals, setTotals] = useState<any>({});
  const { confirmDelete, dialog } = useConfirm();
  async function load() {
    const r = await get<{ data: any[]; totals?: any }>(`/api/payments?${f.qs}`);
    setRows(r.data);
    setTotals(r.totals || {});
  }
  useEffect(() => { load().catch(() => {}); }, [f.qs]);
  return (
    <Page title={tr("payments")} action={<ExportBtn kind="payments" query={f.qs} />}>
      <Stat label={tr("total")} value={money(totals.total, lang)} />
      <SmartFilter f={f} fields={[
        { key: "customer_id", label: "customers", type: "async", quick: true, asyncPath: "/api/customers" },
        { key: "sales_agent_id", label: "representative", type: "select", lookup: "delivery_agents" },
        { key: "payment_method", label: "payMethod", type: "select", lookup: "payment_methods" },
        { key: "amount", label: "amountRange", type: "range", minKey: "amount_min", maxKey: "amount_max" },
      ]} />
      {!rows.length ? <EmptyFilterState onClear={f.clear} /> : (
      <Table cols={[tr("date"), tr("invoice"), tr("customer"), tr("amount"), tr("payMethod"), ""]} rows={rows.map((p) => [
        p.date,
        p.invoice_number,
        p.customer_name,
        money(p.amount, lang),
        p.method,
        can("payments.void", "payments.create") ? <button className="font-bold text-rose-600" onClick={() => confirmDelete(money(p.amount, lang), async () => { await del(`/api/payments/${p.id}`); load(); })}>{tr("delete")}</button> : null,
      ])} />
      )}
      {dialog}
    </Page>
  );
}

export function ReportsPage() {
  const { tr, lang, can } = useApp();
  const showCost = can("costs.view");
  const f = useListQuery("reports", { period: "this_month" });
  const [sp] = useSearchParams();
  const [group, setGroup] = useState(f.values.group || "date");
  const [tab, setTab] = useState<"sales" | "profit" | "inventory" | "aging" | "compare" | "daily" | "expenses" | "purchases" | "asof" | "expiry">(
    (["sales", "profit", "inventory", "aging", "compare", "daily", "expenses", "purchases", "asof", "expiry"].includes(sp.get("tab") || "") ? sp.get("tab") : "sales") as any,
  );
  const [sales, setSales] = useState<any>({ data: [] });
  const [profit, setProfit] = useState<any>({ data: [] });
  const [acc, setAcc] = useState<any>({});
  const [inv, setInv] = useState<any>({ data: [] });
  const [aging, setAging] = useState<any>({ data: [], buckets: {} });
  const [cmp, setCmp] = useState<any>(null);
  const [daily, setDaily] = useState<any>(null);
  const [expA, setExpA] = useState<any>({ data: [] });
  const [purA, setPurA] = useState<any>({ data: [] });
  const [asof, setAsof] = useState<any>({ data: [], value: 0 });
  const [expiry, setExpiry] = useState<any>({ data: [] });
  const q = `${f.qs}&group=${group}`;
  async function load() {
    setSales(await get(`/api/reports/sales?${q}`));
    setProfit(await get(`/api/reports/profit?${f.qs}`));
    setAcc(await get(`/api/accounts?${f.qs}`));
    setInv(await get("/api/reports/inventory"));
    setAging(await get("/api/reports/aging"));
    setCmp(await get(`/api/reports/compare?${f.qs}`));
    setDaily(await get(`/api/reports/daily?${f.qs}`));
    setExpA(await get(`/api/reports/expenses?${f.qs}`));
    setPurA(await get(`/api/reports/purchases?${f.qs}&group=supplier`));
    setAsof(await get(`/api/reports/stock-asof?${f.qs}`));
    setExpiry(await get(`/api/reports/expiry?days=30`));
  }
  useEffect(() => { load().catch(() => {}); }, [f.qs, group]);
  const tabs: { id: typeof tab; key: any }[] = [
    { id: "sales", key: "sales" },
    { id: "profit", key: "profit" },
    { id: "inventory", key: "inventoryReport" },
    { id: "aging", key: "aging" },
    { id: "compare", key: "comparePeriod" },
    { id: "daily", key: "dailyReport" },
    { id: "expenses", key: "expenseAnalysis" },
    { id: "purchases", key: "purchaseAnalysis" },
    { id: "asof", key: "stockAsOf" },
    { id: "expiry", key: "expiryReport" },
  ];
  const exportKind = tab === "compare" ? "sales" : tab === "inventory" ? "inventory" : tab;
  return (
    <Page title={tr("reports")} action={<ExportBtn kind={exportKind} query={`${f.qs}&group=${group}`} />}>
      <SmartFilter f={f} search={false} fields={[
        { key: "customer_id", label: "customers", type: "async", quick: true, asyncPath: "/api/customers" },
        { key: "sales_agent_id", label: "representative", type: "select", quick: true, lookup: "delivery_agents" },
        { key: "brand_id", label: "brand", type: "select", lookup: "brands" },
        { key: "model_id", label: "model", type: "select", lookup: "models" },
        { key: "warehouse", label: "warehouse", type: "locations" },
        { key: "branch_id", label: "branch", type: "select", lookup: "branches" },
      ]} extra={
        <select className={inputCls} value={group} onChange={(e) => setGroup(e.target.value)}>
          <option value="date">{tr("byDate")}</option>
          <option value="customer">{tr("byCustomer")}</option>
          <option value="product">{tr("byProduct")}</option>
          <option value="brand">{tr("byBrand")}</option>
          <option value="category">{tr("byCategory")}</option>
          <option value="method">{tr("byMethod")}</option>
          <option value="agent">{tr("byAgent")}</option>
          <option value="warehouse">{tr("byWarehouse")}</option>
          <option value="hour">{tr("byHour")}</option>
          <option value="week">{tr("byWeek")}</option>
        </select>
      } />
      <div className="mb-4 grid gap-3 gx-kpi md:grid-cols-3 lg:grid-cols-6">
        <Stat label={tr("accountSales")} value={money(acc.sales, lang)} />
        <Stat label={tr("accountPurchases")} value={money(acc.purchases, lang)} />
        <Stat label={tr("accountPayments")} value={money(acc.payments, lang)} />
        <Stat label={tr("accountCredit")} value={money(acc.credit, lang)} />
        <Stat label={tr("accountExpenses")} value={money(acc.expenses, lang)} />
        <Stat label={tr("accountProfit")} value={money(acc.profit, lang)} />
      </div>
      <div className="mb-4 flex flex-wrap gap-2 no-print">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`rounded-xl px-3 py-1.5 text-sm font-bold ${tab === t.id ? "bg-[var(--ink)] text-white" : "border border-[var(--border)] bg-[var(--surface)]"}`}
            onClick={() => setTab(t.id)}
          >
            {tr(t.key)}
          </button>
        ))}
      </div>
      {tab === "sales" ? (
        <Table cols={["", tr("invoicesCount"), tr("total"), ...(showCost ? [tr("profit")] : [])]} rows={(sales.data || []).map((r: any) => [r.label, num(r.invoices || r.qty, lang), money(r.total, lang), ...(showCost ? [money(r.profit, lang)] : [])])} />
      ) : null}
      {tab === "profit" && showCost ? (
        <Table cols={[tr("invoiceNo"), tr("items"), tr("actualCost"), tr("sellingPrice"), tr("profit"), tr("profitMargin")]} rows={(profit.data || []).map((r: any) => [r.number, r.product_name, money(r.cost, lang), money(r.unit_price, lang), money(r.profit, lang), `${r.margin}%`])} />
      ) : null}
      {tab === "inventory" ? (
        <Table cols={[tr("sku"), tr("name"), tr("available"), tr("reserved"), tr("minStock"), tr("location")]} rows={(inv.data || []).map((r: any) => [r.sku, lang === "ar" ? r.name_ar : r.name_en, num(r.available ?? r.current_stock, lang), num(r.reserved_stock, lang), num(r.min_stock, lang), r.location || "-"])} />
      ) : null}
      {tab === "aging" ? (
        <div>
          <div className="mb-4 grid gap-3 md:grid-cols-4">
            <Stat label={tr("bucket30")} value={money(aging.buckets?.d0_30, lang)} />
            <Stat label={tr("bucket60")} value={money(aging.buckets?.d31_60, lang)} />
            <Stat label={tr("bucket90")} value={money(aging.buckets?.d61_90, lang)} />
            <Stat label={tr("bucket90plus")} value={money(aging.buckets?.d90, lang)} />
          </div>
          <Table cols={[tr("name"), tr("phone"), tr("balance"), tr("days")]} rows={(aging.data || []).map((r: any) => [r.name, r.phone, money(r.balance, lang), num(r.days, lang)])} />
        </div>
      ) : null}
      {tab === "daily" && daily ? (
        <div className="grid gap-3 md:grid-cols-5">
          <Stat label={tr("sales")} value={money(daily.sales?.n, lang)} hint={num(daily.sales?.c, lang)} />
          <Stat label={tr("purchases")} value={money(daily.purchases?.n, lang)} hint={num(daily.purchases?.c, lang)} />
          <Stat label={tr("payments")} value={money(daily.payments?.n, lang)} hint={num(daily.payments?.c, lang)} />
          <Stat label={tr("expenses")} value={money(daily.expenses?.n, lang)} hint={num(daily.expenses?.c, lang)} />
          <Stat label={tr("returns")} value={money(daily.returns?.n, lang)} hint={num(daily.returns?.c, lang)} />
        </div>
      ) : null}
      {tab === "expenses" ? (
        <Table cols={[tr("expensesCat"), tr("invoicesCount"), tr("total")]} rows={(expA.data || []).map((r: any) => [r.label, num(r.invoices, lang), money(r.total, lang)])} />
      ) : null}
      {tab === "purchases" ? (
        <Table cols={["", tr("invoicesCount"), tr("total")]} rows={(purA.data || []).map((r: any) => [r.label, num(r.invoices || r.qty, lang), money(r.total, lang)])} />
      ) : null}
      {tab === "asof" ? (
        <div>
          <Stat label={tr("stockValue")} value={money(asof.value, lang)} />
          <Table cols={[tr("sku"), tr("name"), tr("qty"), tr("stockValue")]} rows={(asof.data || []).map((r: any) => [r.sku, lang === "ar" ? r.name_ar : r.name_en, num(r.qty, lang), money(r.value, lang)])} />
        </div>
      ) : null}
      {tab === "expiry" ? (
        <Table cols={[tr("sku"), tr("name"), tr("batches"), tr("expiryDate"), tr("qty"), tr("location")]} rows={(expiry.data || []).map((r: any) => [r.sku, lang === "ar" ? r.name_ar : r.name_en, r.batch_code, r.expiry_date, num(r.remaining_qty, lang), r.location_name || "-"])} />
      ) : null}
      {tab === "compare" && cmp ? (
        <Table
          cols={["", tr("thisPeriod"), tr("prevPeriod"), tr("changePct")]}
          rows={(["sales", "profit", "invoices", "purchases", "expenses"] as const).map((k) => {
            const a = Number(cmp.current?.[k] || 0);
            const b = Number(cmp.previous?.[k] || 0);
            const pct = b ? Math.round(((a - b) / b) * 1000) / 10 : a ? 100 : 0;
            const label = k === "sales" ? tr("accountSales") : k === "profit" ? tr("accountProfit") : k === "invoices" ? tr("invoicesCount") : k === "purchases" ? tr("accountPurchases") : tr("accountExpenses");
            return [label, k === "invoices" ? num(a, lang) : money(a, lang), k === "invoices" ? num(b, lang) : money(b, lang), `${pct}%`];
          })}
        />
      ) : null}
    </Page>
  );
}

function AccountSettings() {
  const { tr, can, user } = useApp();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [accounts, setAccounts] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [accMsg, setAccMsg] = useState("");
  const [accErr, setAccErr] = useState("");
  const [form, setForm] = useState({ id: 0, username: "", full_name: "", phone: "", role_id: 2, active: 1, password: "" });
  const { confirmDelete, dialog } = useConfirm();

  async function loadAccounts() {
    if (!can("users.manage")) return;
    const [users, roleRes] = await Promise.all([
      get<{ data: any[] }>("/api/users"),
      get<{ roles: any[] }>("/api/roles"),
    ]);
    setAccounts(users.data || []);
    setRoles(roleRes.roles || []);
  }
  useEffect(() => { loadAccounts().catch(() => {}); }, []);

  return (
    <div className="mb-8 space-y-4">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <h3 className="mb-3 font-bold">{tr("changePassword")}</h3>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label={tr("currentPassword")}>
            <input className={inputCls} type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          </Field>
          <Field label={tr("newPassword")}>
            <input className={inputCls} type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
          </Field>
          <Field label={tr("confirmPassword")}>
            <input className={inputCls} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          </Field>
        </div>
        {pwErr ? <div className="mt-2 text-sm text-rose-600">{pwErr}</div> : null}
        {pwMsg ? <div className="mt-2 text-sm font-bold text-emerald-700">{pwMsg}</div> : null}
        <Btn className="mt-3" onClick={async () => {
          setPwErr("");
          setPwMsg("");
          if (!current || !next) return;
          if (next !== confirm) { setPwErr(tr("passwordMismatch")); return; }
          try {
            await post("/api/auth/password", { current, next });
            setCurrent(""); setNext(""); setConfirm("");
            setPwMsg(tr("passwordChanged"));
          } catch (e) {
            setPwErr((e as Error).message === "invalid_current" ? tr("invalidCurrent") : (e as Error).message);
          }
        }}>{tr("save")}</Btn>
      </div>
      {can("users.manage") ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="font-bold">{tr("employeeAccounts")}</h3>
            <Btn onClick={() => { setAccErr(""); setAccMsg(""); setForm({ id: 0, username: "", full_name: "", phone: "", role_id: roles[0]?.id || 2, active: 1, password: "" }); setOpen(true); }}>{tr("add")}</Btn>
          </div>
          {accMsg ? <div className="mb-2 text-sm font-bold text-emerald-700">{accMsg}</div> : null}
          <Table
            cols={[tr("username"), tr("name"), tr("phone"), tr("role"), tr("status"), ""]}
            rows={accounts.map((u) => [
              u.username,
              u.full_name,
              u.phone || "—",
              u.role_name_ar,
              u.active ? tr("active") : tr("inactive"),
              <ActionBtns
                key={u.id}
                canEdit
                canDelete={u.id !== user?.id}
                onEdit={() => {
                  setAccErr(""); setAccMsg("");
                  setForm({ id: u.id, username: u.username, full_name: u.full_name || "", phone: u.phone || "", role_id: u.role_id, active: u.active ? 1 : 0, password: "" });
                  setOpen(true);
                }}
                onDelete={() => confirmDelete(u.username, async () => { await del(`/api/users/${u.id}`); await loadAccounts(); })}
              />,
            ])}
          />
          <Modal open={open} title={form.id ? tr("edit") : tr("add")} onClose={() => setOpen(false)}>
            <div className="grid gap-3">
              <Field label={tr("username")}>
                <input className={inputCls} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
              </Field>
              <Field label={tr("name")}>
                <input className={inputCls} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
              </Field>
              <Field label={tr("phone")}>
                <input className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </Field>
              <Field label={tr("role")}>
                <select className={inputCls} value={form.role_id} onChange={(e) => setForm({ ...form, role_id: Number(e.target.value) })}>
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.name_ar}</option>)}
                </select>
              </Field>
              <Field label={tr("password")}>
                <input className={inputCls} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={form.id ? tr("leaveBlankPassword") : ""} />
              </Field>
              {form.id && form.id !== user?.id ? (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.active === 1} onChange={(e) => setForm({ ...form, active: e.target.checked ? 1 : 0 })} />
                  {tr("active")}
                </label>
              ) : null}
              {accErr ? <div className="text-sm text-rose-600">{accErr}</div> : null}
              <Btn onClick={async () => {
                setAccErr("");
                if (!form.username.trim() || !form.full_name.trim()) return;
                if (!form.id && !form.password) { setAccErr(tr("newPassword")); return; }
                try {
                  if (form.id) {
                    const body: Record<string, unknown> = { username: form.username.trim(), full_name: form.full_name.trim(), phone: form.phone, role_id: form.role_id, active: form.active };
                    if (form.password) body.password = form.password;
                    await put(`/api/users/${form.id}`, body);
                  } else {
                    await post("/api/users", { username: form.username.trim(), full_name: form.full_name.trim(), phone: form.phone, role_id: form.role_id, password: form.password });
                  }
                  setOpen(false);
                  setAccMsg(tr("accountSaved"));
                  await loadAccounts();
                } catch (e) {
                  setAccErr((e as Error).message === "username_taken" ? tr("usernameTaken") : (e as Error).message);
                }
              }}>{tr("save")}</Btn>
            </div>
          </Modal>
          {dialog}
        </div>
      ) : null}
    </div>
  );
}

export function SettingsPage() {
  const { tr, settings, refreshSettings, refreshLookups, lang, can } = useApp();
  const [form, setForm] = useState<Record<string, string>>({});
  const [templates, setTemplates] = useState<any[]>([]);
  const [backs, setBacks] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [demo, setDemo] = useState<{ active?: boolean; products?: number; customers?: number; invoices?: number }>({});
  const [restoreOnImport, setRestoreOnImport] = useState(true);
  const [impKind, setImpKind] = useState("products");
  const [impCsv, setImpCsv] = useState("");
  const [impPreview, setImpPreview] = useState<any>(null);
  const [impResult, setImpResult] = useState<any>(null);
  const { confirm, dialog } = useConfirm();
  const canBackup = can("backup.manage") || can("settings.edit");
  async function loadBackups() {
    if (!canBackup) return;
    const r = await get<{ data: any[]; files: any[] }>("/api/backup");
    setBacks(r.files || r.data || []);
  }
  async function loadDemo() {
    if (!canBackup) return;
    setDemo(await get("/api/backup/demo"));
  }
  async function downloadNamed(filename: string) {
    const res = await fetch(`/api/backup/${filename}`, { credentials: "include", headers: authHeaders() });
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  useEffect(() => {
    setForm(settings);
    get<{ templates: any[] }>("/api/settings").then((r) => setTemplates(r.templates || []));
    loadBackups().catch(() => {});
    loadDemo().catch(() => {});
  }, [settings]);
  return (
    <Page title={tr("settings")}>
      {dialog}
      <AccountSettings />
      <div className="grid gap-3 md:grid-cols-2">
        {["store_name","store_name_ar","store_address","store_phone","invoice_prefix","invoice_footer","invoice_header","default_delivery_time","whatsapp_enabled","sound_enabled","tax_enabled","tax_rate","allow_negative_stock","use_last_customer_price","price_2_name","price_3_name","price_4_name","workplace_lat","workplace_lng","geofence_meters","usd_egp_rate"].map((k) => (
          <Field key={k} label={k === "workplace_lat" ? tr("workplaceLat") : k === "workplace_lng" ? tr("workplaceLng") : k === "geofence_meters" ? tr("geofence") : k === "tax_enabled" ? tr("taxEnabled") : k === "sound_enabled" ? tr("soundEnabled") : k === "tax_rate" ? tr("taxRate") : k === "allow_negative_stock" ? tr("allowNegative") : k === "use_last_customer_price" ? tr("useLastPrice") : k === "invoice_header" ? tr("invoiceHeader") : k === "price_2_name" ? tr("price2") : k === "price_3_name" ? tr("price3") : k === "price_4_name" ? tr("price4") : k === "usd_egp_rate" ? tr("usdRate") : k}>
            <input className={inputCls} value={form[k] ?? (k === "sound_enabled" ? "1" : "")} onChange={(e) => setForm({ ...form, [k]: e.target.value })} placeholder={k === "sound_enabled" || k === "tax_enabled" || k === "whatsapp_enabled" ? "1 / 0" : ""} />
          </Field>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500">{tr("pickOnMap")}</p>
      <div className="mt-2 no-print">
        <OsmMap
          center={{ lat: Number(form.workplace_lat || 30.0566), lng: Number(form.workplace_lng || 31.33) }}
          shop={{ lat: Number(form.workplace_lat || 30.0566), lng: Number(form.workplace_lng || 31.33) }}
          geofence={Number(form.geofence_meters || 100)}
          height={280}
          onPick={(lat, lng) => setForm({ ...form, workplace_lat: String(lat), workplace_lng: String(lng) })}
        />
      </div>
      <Btn className="mt-4" onClick={async () => { await put("/api/settings", form); refreshSettings(); }}>{tr("save")}</Btn>
      {can("import.manage") ? (
        <div className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <h3 className="mb-2 font-bold">{tr("importCsv")}</h3>
          <p className="mb-3 text-xs text-slate-500">{tr("importHint")}</p>
          <div className="mb-3 grid gap-3 md:grid-cols-2">
            <Field label={tr("importKind")}>
              <select className={inputCls} value={impKind} onChange={(e) => { setImpKind(e.target.value); setImpPreview(null); setImpResult(null); }}>
                <option value="products">{tr("products")}</option>
                <option value="customers">{tr("customers")}</option>
                <option value="suppliers">{tr("suppliers")}</option>
              </select>
            </Field>
            <Field label="CSV">
              <input className={inputCls} type="file" accept=".csv,text/csv" onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                f.text().then((t) => { setImpCsv(t); setImpPreview(null); setImpResult(null); });
              }} />
            </Field>
          </div>
          <textarea className={`${inputCls} min-h-32 font-mono text-xs`} value={impCsv} onChange={(e) => setImpCsv(e.target.value)} placeholder={impKind === "products" ? "sku,name_ar,name_en,selling_price,color,quality" : "name,phone,city"} />
          <div className="mt-3 flex flex-wrap gap-2">
            <Btn kind="soft" disabled={!impCsv.trim()} onClick={async () => {
              setImpResult(null);
              setImpPreview(await post("/api/import/preview", { kind: impKind, csv: impCsv }));
            }}>{tr("preview")}</Btn>
            <Btn disabled={!impPreview || !impPreview.valid} onClick={async () => {
              setImpResult(await post("/api/import/commit", { kind: impKind, csv: impCsv }));
            }}>{tr("commitImport")}</Btn>
          </div>
          {impPreview ? (
            <div className="mt-3 text-sm">
              {tr("csvPreview")}: {impPreview.valid}/{impPreview.total} — {tr("skipped")}: {impPreview.invalid}
              <div className="table-wrap mt-2">
                <table>
                  <thead><tr><th>#</th>{(impPreview.headers || []).map((h: string) => <th key={h}>{h}</th>)}<th>{tr("status")}</th></tr></thead>
                  <tbody>
                    {(impPreview.preview || []).map((r: any) => (
                      <tr key={r.line}>
                        <td>{r.line}</td>
                        {(impPreview.headers || []).map((h: string) => <td key={h}>{r.row?.[h]}</td>)}
                        <td>{r.ok ? "✓" : (r.errors || []).join(",")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
          {impResult ? <div className="mt-2 text-sm font-bold">{tr("imported")}: {impResult.inserted} · {tr("skipped")}: {impResult.skipped}</div> : null}
        </div>
      ) : null}
      {canBackup ? (
        <div className="mt-8 space-y-6">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <h3 className="font-bold">{tr("demoData")}</h3>
            <p className="mt-1 text-sm text-slate-500">{tr("demoDataHint")}</p>
            {demo.active ? (
              <div className="mt-2 text-sm font-bold text-amber-700">
                {tr("demoActive")} — {tr("products")} {demo.products || 0} · {tr("customers")} {demo.customers || 0} · {tr("sales")} {demo.invoices || 0}
              </div>
            ) : null}
            {msg ? <div className="mt-2 text-sm font-bold text-emerald-700">{msg}</div> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <Btn disabled={busy} onClick={async () => {
                setBusy(true);
                setMsg("");
                try {
                  const r = await post<{ already?: boolean }>("/api/backup/demo", {});
                  setMsg(r.already ? tr("demoAlready") : tr("demoAdded"));
                  await loadDemo();
                  await refreshLookups();
                } catch (e) {
                  setMsg((e as Error).message || tr("error"));
                } finally {
                  setBusy(false);
                }
              }}>{tr("addDemoData")}</Btn>
              <Btn kind="danger" disabled={busy || !demo.active} onClick={() => confirm(tr("clearDemoData"), tr("demoClearConfirm"), async () => {
                setBusy(true);
                setMsg("");
                try {
                  await post("/api/backup/demo/clear", { confirm: true });
                  setMsg(tr("demoCleared"));
                  await loadDemo();
                  await refreshLookups();
                } finally {
                  setBusy(false);
                }
              })}>{tr("clearDemoData")}</Btn>
            </div>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold">{tr("backup")}</h3>
              <div className="flex flex-wrap gap-2">
                <Btn disabled={busy} onClick={async () => {
                  setBusy(true);
                  setMsg("");
                  try {
                    const r = await post<{ filename: string }>("/api/backup", {});
                    await loadBackups();
                    if (r.filename) await downloadNamed(r.filename);
                    setMsg(tr("backupExported"));
                  } finally {
                    setBusy(false);
                  }
                }}>{tr("exportBackup")}</Btn>
                <label className="ui-btn inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2 text-sm font-bold">
                  {tr("importBackup")}
                  <input
                    className="hidden"
                    type="file"
                    accept=".sql,application/sql,text/plain"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      const go = async () => {
                        setBusy(true);
                        setMsg("");
                        try {
                          const fd = new FormData();
                          fd.append("file", file);
                          fd.append("restore", restoreOnImport ? "1" : "0");
                          fd.append("confirm", restoreOnImport ? "1" : "0");
                          const res = await fetch("/api/backup/import", { method: "POST", credentials: "include", headers: authHeaders(), body: fd });
                          const data = await res.json().catch(() => ({}));
                          if (!res.ok) {
                            setMsg(data.error === "not_sqlite" ? tr("notSqlite") : (data.error || tr("error")));
                            return;
                          }
                          setMsg(tr("backupImported"));
                          await loadBackups();
                          await loadDemo();
                          if (data.restored) window.location.reload();
                        } finally {
                          setBusy(false);
                        }
                      };
                      if (restoreOnImport) confirm(tr("importBackup"), tr("restoreConfirm"), go);
                      else void go();
                    }}
                  />
                </label>
              </div>
            </div>
            <p className="mb-3 text-xs text-slate-500">{tr("importFileHint")}</p>
            <label className="mb-3 flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" checked={restoreOnImport} onChange={(e) => setRestoreOnImport(e.target.checked)} />
              {tr("importRestoreNow")}
            </label>
            <label className="mb-4 flex items-center gap-2 text-sm font-bold">
              <input
                type="checkbox"
                checked={(form.auto_backup_on_login ?? "1") !== "0"}
                onChange={async (e) => {
                  const next = e.target.checked ? "1" : "0";
                  setForm({ ...form, auto_backup_on_login: next });
                  await put("/api/settings", { ...form, auto_backup_on_login: next });
                  refreshSettings();
                }}
              />
              {tr("autoBackupOnLogin")}
            </label>
            <Table
              cols={[tr("name"), tr("amount"), ""]}
              rows={backs.map((b: any) => [
                b.filename,
                b.size_bytes ? `${Math.round(b.size_bytes / 1024)} KB` : "",
                <div className="flex flex-wrap gap-3">
                  <button className="font-bold text-cyan-700" onClick={() => downloadNamed(b.filename)}>{tr("downloadBackup")}</button>
                  <button className="font-bold text-rose-700" onClick={() => confirm(tr("restoreBackup"), tr("restoreConfirm"), async () => {
                    await post(`/api/backup/${b.filename}/restore`, { confirm: true });
                    window.location.reload();
                  })}>{tr("restoreBackup")}</button>
                </div>,
              ])}
            />
          </div>
        </div>
      ) : null}
      <h3 className="mt-8 font-bold">{tr("waTemplates")}</h3>
      {templates.map((t) => (
        <div key={t.code} className="mt-3 rounded-xl bg-white p-3">
          <div className="font-bold">{t.code}</div>
          <textarea className={`${inputCls} mt-2 min-h-32`} value={lang === "ar" ? t.body_ar : t.body_en} onChange={(e) => setTemplates(templates.map((x) => x.code === t.code ? { ...x, [lang === "ar" ? "body_ar" : "body_en"]: e.target.value } : x))} />
          <Btn kind="ghost" className="mt-2" onClick={async () => { await put(`/api/settings/whatsapp-templates/${t.code}`, t); }}>{tr("save")}</Btn>
        </div>
      ))}
    </Page>
  );
}

export function UsersPage() {
  const { tr, can } = useApp();
  const f = useListQuery("users");
  const [rows, setRows] = useState<any[]>([]);
  const [roles, setRoles] = useState<any>(null);
  const [pq, setPq] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ id: 0, username: "", full_name: "", phone: "", role_id: 2, active: 1, password: "" });
  const { confirmDelete, dialog } = useConfirm();
  async function loadUsers() {
    setRows((await get<{ data: any[] }>(`/api/users?${f.qs}`)).data);
  }
  useEffect(() => { loadUsers().catch(() => {}); }, [f.qs]);
  useEffect(() => {
    get("/api/roles").then(setRoles);
  }, []);
  const perms = (roles?.permissions || []).filter((p: any) => !pq || `${p.code} ${p.name_ar} ${p.module}`.includes(pq));
  const modules = [...new Set(perms.map((p: any) => p.module))];
  return (
    <Page title={tr("users")}>
      <SmartFilter f={f} date={false} fields={[
        { key: "status", label: "status", type: "select", quick: true, options: [{ value: "active", label: tr("active") }, { value: "inactive", label: tr("inactive") }] },
      ]} />
      <Table cols={[tr("username"), tr("name"), tr("role"), tr("status"), ""]} rows={rows.map((u) => [
        u.username,
        u.full_name,
        u.role_name_ar,
        u.active ? tr("active") : tr("inactive"),
        can("users.manage") ? (
          <ActionBtns
            canEdit
            canDelete
            onEdit={() => { setForm({ id: u.id, username: u.username, full_name: u.full_name || "", phone: u.phone || "", role_id: u.role_id, active: u.active ? 1 : 0, password: "" }); setOpen(true); }}
            onDelete={() => confirmDelete(u.username, async () => { await del(`/api/users/${u.id}`); loadUsers(); })}
          />
        ) : null,
      ])} />
      <Modal open={open} title={form.id ? tr("edit") : tr("add")} onClose={() => setOpen(false)}>
        <div className="grid gap-3">
          <Field label={tr("username")}><input className={inputCls} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></Field>
          <Field label={tr("name")}><input className={inputCls} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></Field>
          <Field label={tr("phone")}><input className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label={tr("role")}>
            <select className={inputCls} value={form.role_id} onChange={(e) => setForm({ ...form, role_id: Number(e.target.value) })}>
              {(roles?.roles || []).map((r: any) => <option key={r.id} value={r.id}>{r.name_ar}</option>)}
            </select>
          </Field>
          <Field label={tr("newPassword")}><input className={inputCls} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
          <Btn onClick={async () => {
            const body: Record<string, unknown> = { username: form.username.trim(), full_name: form.full_name.trim(), phone: form.phone, role_id: form.role_id, active: form.active };
            if (form.password) body.password = form.password;
            await put(`/api/users/${form.id}`, body);
            setOpen(false);
            loadUsers();
          }}>{tr("save")}</Btn>
        </div>
      </Modal>
      {roles ? (
        <div className="mt-6">
          <h3 className="font-bold">{tr("permissions")}</h3>
          <FilterBar>
            <input className={`${inputCls} max-w-sm`} value={pq} onChange={(e) => setPq(e.target.value)} placeholder={tr("search")} />
          </FilterBar>
          {(roles.roles || []).map((r: any) => (
            <details key={r.id} className="mt-2 rounded-xl bg-white p-3">
              <summary className="cursor-pointer font-bold">{r.name_ar}</summary>
              {modules.map((mod) => (
                <div key={String(mod)} className="mt-3">
                  <div className="text-xs font-bold uppercase text-slate-400">{String(mod)}</div>
                  <div className="mt-1 grid gap-1 md:grid-cols-2">
                    {perms.filter((p: any) => p.module === mod).map((p: any) => {
                      const on = (roles.role_permissions || []).some((x: any) => x.role_id === r.id && x.permission_id === p.id);
                      return (
                        <label key={p.id} className="flex items-center gap-2 text-sm">
                          <input type="checkbox" defaultChecked={on} onChange={async (e) => {
                            const current = (roles.role_permissions || []).filter((x: any) => x.role_id === r.id).map((x: any) => x.permission_id);
                            const next = e.target.checked ? [...current, p.id] : current.filter((id: number) => id !== p.id);
                            await put(`/api/roles/${r.id}/permissions`, { permission_ids: next });
                          }} />
                          <span>{p.name_ar}<span className="ms-1 text-xs text-slate-400">{p.code}</span></span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </details>
          ))}
        </div>
      ) : null}
      {dialog}
    </Page>
  );
}

export function AuditPage() {
  const { tr, can } = useApp();
  const [sp] = useSearchParams();
  const [tab, setTab] = useState<"log" | "approvals">(sp.get("tab") === "approvals" ? "approvals" : "log");
  const f = useListQuery("audit");
  const [rows, setRows] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [pending, setPending] = useState<any>({ purchases: [], stocktakes: [], leaves: [] });
  const [kind, setKind] = useState("");
  async function loadLog() {
    setRows((await get<{ data: any[] }>(`/api/audit?${f.qs}`)).data || []);
  }
  async function loadPending() {
    if (!can("approvals.view", "purchases.approve", "leaves.manage", "stocktake.approve")) return;
    setPending(await get(`/api/approvals?kind=${encodeURIComponent(kind)}`));
  }
  useEffect(() => { if (tab === "log" && can("audit.view")) loadLog().catch(() => {}); }, [f.qs, tab]);
  useEffect(() => { if (tab === "approvals") loadPending().catch(() => {}); }, [tab, kind]);
  return (
    <Page title={tab === "approvals" ? tr("approvals") : tr("audit")}>
      <div className="mb-3 flex flex-wrap gap-2 no-print">
        {can("audit.view") ? <button className={`rounded-xl px-3 py-1.5 text-sm font-bold ${tab === "log" ? "bg-[var(--ink)] text-white" : "border border-[var(--border)]"}`} onClick={() => setTab("log")}>{tr("audit")}</button> : null}
        {can("approvals.view", "purchases.approve") ? <button className={`rounded-xl px-3 py-1.5 text-sm font-bold ${tab === "approvals" ? "bg-[var(--ink)] text-white" : "border border-[var(--border)]"}`} onClick={() => setTab("approvals")}>{tr("pendingApprovals")}</button> : null}
      </div>
      {tab === "log" ? (
        <>
          <SmartFilter f={f} fields={[
            { key: "action", label: "actions", type: "select", quick: true, options: ["create", "edit", "delete", "approve", "cancel", "login"].map((a) => ({ value: a, label: a })) },
            { key: "entity", label: "source", type: "text" },
            { key: "entity_id", label: "invoiceNo", type: "text" },
            { key: "user_id", label: "users", type: "text" },
          ]} />
          {!rows.length ? <EmptyFilterState onClear={f.clear} /> : (
          <Table
            cols={[tr("name"), tr("actions"), tr("details"), tr("oldValue"), tr("time")]}
            rows={rows.map((a) => [
              a.user_name,
              `${a.action} · ${a.entity_type || ""} #${a.entity_id || ""}`,
              a.details,
              a.old_value || a.new_value ? (
                <button className="font-bold text-cyan-700" onClick={() => setDetail(a)}>{tr("view")}</button>
              ) : "—",
              a.created_at,
            ])}
          />
          )}
          <Modal open={!!detail} title={detail?.action || ""} onClose={() => setDetail(null)} wide>
            <pre className="whitespace-pre-wrap text-xs">{JSON.stringify({
              old: (() => { try { return detail?.old_value ? JSON.parse(detail.old_value) : null; } catch { return detail?.old_value; } })(),
              new: (() => { try { return detail?.new_value ? JSON.parse(detail.new_value) : null; } catch { return detail?.new_value; } })(),
            }, null, 2)}</pre>
          </Modal>
        </>
      ) : (
        <div className="space-y-6">
          <select className={`${inputCls} no-print mb-2 max-w-xs`} value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">{tr("all")}</option>
            <option value="purchases">{tr("purchases")}</option>
            <option value="stocktakes">{tr("stocktake")}</option>
            <option value="leaves">{tr("leaves")}</option>
          </select>
          <h3 className="font-bold">{tr("purchases")}</h3>
          <Table
            cols={[tr("invoiceNo"), tr("date"), tr("total"), tr("status"), ""]}
            rows={(pending.purchases || []).map((r: any) => [
              <Link className="font-bold" to={`/purchases/${r.id}`}>{r.number}</Link>,
              r.date,
              r.total,
              statusLabel(r.status, "ar"),
              r.status === "submitted" || r.status === "draft" ? (
                <button className="font-bold text-cyan-700" onClick={async () => { await post(`/api/inventory/purchases/${r.id}/approve`, {}); loadPending(); }}>{tr("approve")}</button>
              ) : null,
            ])}
          />
          <h3 className="font-bold">{tr("stocktake")}</h3>
          <Table
            cols={[tr("invoiceNo"), tr("date"), tr("status"), ""]}
            rows={(pending.stocktakes || []).map((r: any) => [
              <Link className="font-bold" to={`/stocktake/${r.id}`}>{r.number}</Link>,
              r.date,
              statusLabel(r.status, "ar"),
              <button className="font-bold text-cyan-700" onClick={async () => { await post(`/api/inventory/stocktakes/${r.id}/approve`, {}); loadPending(); }}>{tr("approve")}</button>,
            ])}
          />
          <h3 className="font-bold">{tr("leaves")}</h3>
          <Table
            cols={[tr("name"), tr("leaveType"), tr("date"), ""]}
            rows={(pending.leaves || []).map((r: any) => [
              r.employee_name,
              r.type,
              `${r.date_from} → ${r.date_to}`,
              <button className="font-bold text-cyan-700" onClick={async () => { await post(`/api/hr/leaves/${r.id}/approve`, {}); loadPending(); }}>{tr("approve")}</button>,
            ])}
          />
        </div>
      )}
    </Page>
  );
}

function Page({ title, action, children }: { title: string; action?: any; children: any }) {
  return (
    <div>
      <PrintLetterhead title={title} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-black">{title}</h1>
        <div className="no-print flex flex-wrap items-center gap-2">
          {action}
          <PrintBtn />
        </div>
      </div>
      {children}
    </div>
  );
}

function Table({ cols, rows }: { cols: any[]; rows: any[][] }) {
  const { tr } = useApp();
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>{cols.map((c, i) => <th key={i}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={cols.length} className="py-8 text-center text-slate-400">{tr("noData")}</td></tr>
            ) : rows.map((r, i) => (
              <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
