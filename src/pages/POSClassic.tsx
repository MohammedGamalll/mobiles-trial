import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  Pause,
  Printer,
  Search,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Wallet,
  X,
} from "lucide-react";
import { get, post, put } from "../lib/api";
import { apiMessage } from "../lib/errors";
import { invoicePayStatus, money, num, statusClass, statusLabel } from "../lib/format";
import { Btn, Field, Modal, inputCls } from "../components/ui";
import { InvoicePrint } from "../components/InvoicePrint";
import { Barcode } from "../components/Barcode";
import { playSound } from "../lib/sounds";
import { ProductSuggestList } from "../components/ProductSuggest";
import { ProductDialogClassic } from "../components/classic/ProductDialogClassic";
import { AccountDialogClassic } from "../components/classic/AccountDialogClassic";
import { emptyProduct, type ProductForm } from "../hooks/useProductCatalog";
import { isOpenHeld, usePOSLogic, type Product } from "../hooks/usePOSLogic";
import { PageSizeControl } from "../components/PageSizeControl";
import { PosHeaderFilter, applyPosHeaderFilters, uniqueFilterValues } from "../components/PosHeaderFilter";
import { binText, lastSupplierName } from "../lib/place";

function ClassicDropUp({
  label,
  display,
  open,
  onToggle,
  children,
  wide,
}: {
  label: string;
  display: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`pos-classic-dropup ${wide ? "is-wide" : ""}`}>
      <span>{label}</span>
      <button type="button" className="pos-classic-dropup-btn" onClick={onToggle}>
        {display}
      </button>
      {open ? <div className="pos-classic-dropup-menu">{children}</div> : null}
    </label>
  );
}

export default function POSClassic() {
  const pos = usePOSLogic("classic");
  const {
    tr, lang, lookups, can, nav, quoteMode, exchangeMode, showCost,
    q, setQ, typeFilter, setTypeFilter,
    cart, setCart, sel, setSel, type, setType, method, setMethod,
    customerQ, setCustomerQ, customers, custListOpen, setCustListOpen,
    customer, setCustomer, walkIn, setWalkIn,
    cashAccountId, setCashAccountId, agentId, setAgentId,
    address, setAddress, paid, setPaid,
    discount, setDiscount, discMode, setDiscMode, invDate, setInvDate,
    extrasOpen, setExtrasOpen, extraAmount, setExtraAmount, notes, setNotes,
    due, setDue, pays, setPays,
    held, heldOpenCount, heldOpen, setHeldOpen, heldTab, setHeldTab, todayInv, todayStats,
    doneOpen, setDoneOpen, doneInv, waOpen, setWaOpen, waPreview, waMsg, setWaMsg,
    brandFilter, setBrandFilter, picked, clock,
    listId, setListId, err, setErr, busy, resuming, custOpen, setCustOpen,
    retOpen, setRetOpen, retNo, setRetNo, retInv, setRetInv, retItems, setRetItems,
    newCust, setNewCust, qtyField, setQtyField, priceField, setPriceField,
    partyKind, setPartyKind,
    catalogLoading, catalogError, catalogPage, setCatalogPage, catalogTotal, catalogPageSize, setCatalogPageSize, reloadCatalog,
    searchRef, suggest,
    visible, offerDisc, pickPrice, pickProduct, add, addFromSearch, addPicked, clearCart,
    subtotal, discAmt, total, creditNeedCustomer,
    printRows, printInvoice, waEnabled, cartQty, applyParty, saveAccount,
    loadToday, loadHeldList, openHeld, cancelHeld, finalizeHeld, previewWa, submit, holdInvoice, submitInvoiceReturn,
    beginResumeHeld,
    forceGoods, setForceGoods, setStockTick,
  } = pos;
  const [railOpen, setRailOpen] = useState(true);
  const [desk, setDesk] = useState<"sale" | "cart" | "held" | "sold" | "control">("sale");
  const [prodOpen, setProdOpen] = useState(false);
  const [prodForm, setProdForm] = useState<ProductForm>(emptyProduct());
  const [prodBusy, setProdBusy] = useState(false);
  const [prodErr, setProdErr] = useState("");
  const [acctOpen, setAcctOpen] = useState(false);
  const [headerFilters, setHeaderFilters] = useState<Record<string, string>>({});
  const [cashOpen, setCashOpen] = useState(false);
  const [courierOpen, setCourierOpen] = useState(false);
  const cashAccounts = lookups?.cash_accounts || [];
  const couriers = (lookups?.delivery_agents || []).filter((a) => !a.role_type || a.role_type === "delivery" || a.role_type === "both");
  const cashName = cashAccounts.find((a) => a.id === cashAccountId)?.name || tr("posTreasury");
  const courierName = couriers.find((a) => a.id === agentId)?.name || tr("agent");
  const customerName = customer?.name || walkIn || customerQ || tr("walkIn");
  const setHeaderFilter = (col: string, v: string) => setHeaderFilters((prev) => ({ ...prev, [col]: v }));
  const catalogRows = useMemo(
    () => applyPosHeaderFilters(visible, headerFilters, lang, pickPrice),
    [visible, headerFilters, lang, pickPrice],
  );
  useEffect(() => {
    setForceGoods(true);
  }, [setForceGoods]);
  useEffect(() => {
    if (cashAccountId || !cashAccounts.length) return;
    const main = cashAccounts.find((a) => /صندوق رئيسي|الصندوق الرئيسي|main drawer|main cash/i.test(a.name));
    setCashAccountId((main || cashAccounts[0]).id);
  }, [cashAccountId, cashAccounts, setCashAccountId]);
  function closeFooterMenus() {
    setCashOpen(false);
    setCourierOpen(false);
    setCustListOpen(false);
  }
  const rtl = lang === "ar";
  const Collapse = rtl ? ChevronRight : ChevronLeft;
  const Expand = rtl ? ChevronLeft : ChevronRight;
  const nameOf = (p: Product & { product_name?: string }) => p.product_name || (lang === "ar" ? p.name_ar : p.name_en) || p.name_ar;
  const kindLabel = (p: Product) => (p.kind === "service" ? tr("services") : tr("products"));
  const clockLabel = clock.toLocaleTimeString(lang === "ar" ? "en-US" : "en-GB", { hour: "numeric", minute: "2-digit" });
  const dateLabel = invDate.split("-").reverse().join("/");
  const invoiceNo = doneInv?.number || "";
  function onAdd() {
    if (q.trim() || picked) addPicked();
    else addFromSearch();
    setDesk("sale");
    setForceGoods(true);
  }

  function openDesk(next: typeof desk) {
    setDesk(next);
    if (next === "sold" || next === "control") void loadToday().catch(() => {});
    if (next === "held") void loadHeldList().catch(() => {});
  }

  return (
    <div className="pos-classic">
      <div className="print-sheet print-only">
        <InvoicePrint inv={printInvoice} title={quoteMode ? tr("quoteMode") : tr("invoice")} />
      </div>
      <div className="print-only barcode-sheet">
        {printRows.map((l: any) => (
          <Barcode key={`${l.id}-bc`} value={l.barcode || l.sku} label={nameOf(l)} price={money(l.unit_price, lang)} />
        ))}
      </div>

      {exchangeMode ? (
        <div className="no-print bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">{tr("exchangeHint")}</div>
      ) : null}
      <div className={`pos-classic-body no-print ${railOpen ? "" : "is-rail-off"}`}>
        <aside className="pos-classic-rail">
          <button type="button" className="pos-classic-rail-tog" onClick={() => setRailOpen((v) => !v)} title={railOpen ? tr("collapse") : tr("expand")}>
            {railOpen ? <Collapse size={14} /> : <Expand size={14} />}
          </button>
          {railOpen ? (
            <>
              <button type="button" className={`pos-classic-rail-btn is-sell ${desk === "sale" ? "is-on" : ""}`} onClick={() => setDesk("sale")}>
                <ShoppingCart size={22} />
                <span>{tr("posSell")}</span>
              </button>
              <button type="button" className={`pos-classic-rail-btn ${desk === "cart" ? "is-on" : ""}`} onClick={() => openDesk("cart")}>
                <ShoppingBag size={18} />
                <span>{tr("posCurrentCart")}</span>
                {cart.length ? <small>{cart.length}</small> : null}
              </button>
              <button type="button" className={`pos-classic-rail-btn ${desk === "held" ? "is-on" : ""}`} onClick={() => openDesk("held")}>
                <Pause size={18} />
                <span>{tr("heldInvoices")}</span>
                {heldOpenCount ? <small>{heldOpenCount}</small> : null}
              </button>
              <button type="button" className={`pos-classic-rail-btn ${desk === "sold" ? "is-on" : ""}`} onClick={() => openDesk("sold")}>
                <FileText size={18} />
                <span>{tr("posSoldInvoices")}</span>
                {todayInv.length ? <small>{todayInv.length}</small> : null}
              </button>
              <button type="button" className={`pos-classic-rail-btn ${desk === "control" ? "is-on" : ""}`} onClick={() => openDesk("control")}>
                <ClipboardList size={18} />
                <span>{tr("posInvoiceControl")}</span>
              </button>
              <button type="button" className="pos-classic-rail-btn" onClick={() => { setDesk("sale"); setForceGoods(true); searchRef.current?.focus(); }}>
                <Search size={18} />
              </button>
              <button
                type="button"
                className="pos-classic-rail-btn is-save"
                disabled={busy || !cart.length || !can("sales.create") || creditNeedCustomer}
                onClick={() => void submit({ print: true })}
                title={tr("posSavePrintNew")}
              >
                <Check size={18} />
                <small>F12</small>
                <span>{tr("posSavePrintNew")}</span>
              </button>
              <button
                type="button"
                className="pos-classic-rail-btn is-pay"
                disabled={busy || !cart.length || !can("sales.create") || creditNeedCustomer}
                onClick={() => void submit({ method: "cash" })}
                title={`${tr("posPayF11")} F11`}
              >
                <Wallet size={18} />
                <small>F11</small>
                <span>{tr("posPayF11")}</span>
              </button>
            </>
          ) : null}
        </aside>

        <div className="pos-classic-main">
          <div className="pos-classic-top">
            <button type="button" className="pos-classic-cart-ico" title={tr("posCurrentCart")} onClick={() => openDesk("cart")}>
              <ShoppingCart size={20} />
              {cart.length ? <i>{cart.length}</i> : null}
            </button>
            <label className="pos-classic-field is-search">
              <span>{tr("posSearchItem")}</span>
              <input
                ref={searchRef}
                value={q}
                autoComplete="off"
                onFocus={() => { suggest.cancelClose(); if (q.trim()) suggest.setOpen(true); }}
                onBlur={() => suggest.scheduleClose()}
                onChange={(e) => { setQ(e.target.value); suggest.setOpen(true); setForceGoods(true); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !suggest.open) {
                    e.preventDefault();
                    onAdd();
                    return;
                  }
                  suggest.onKeyDown(e, (p) => add(p as Product), () => addFromSearch());
                }}
              />
              <ProductSuggestList
                hits={suggest.hits}
                open={suggest.open}
                hi={suggest.hi}
                onHover={suggest.setHi}
                showPrice
                onPick={(p) => add(p as Product)}
              />
            </label>
            <button type="button" className="pos-classic-inquire" onClick={() => setForceGoods(true)} title={tr("posInquire")}>?</button>
            <label className="pos-classic-field is-qty">
              <span>{tr("qty")}</span>
              <input type="number" min={1} value={qtyField} onChange={(e) => setQtyField(Number(e.target.value) || 1)} />
            </label>
            <label className="pos-classic-field is-price">
              <span>{tr("sellingPrice")}</span>
              <input value={priceField || "0"} onChange={(e) => setPriceField(e.target.value === "0" ? "" : e.target.value)} />
            </label>
            <button type="button" className="pos-classic-add" onClick={onAdd}>
              <Check size={16} /> {tr("posAdd")}
            </button>
            <div className="pos-classic-quick">
              <button type="button" onClick={() => setAcctOpen(true)}>{tr("posQuickCustomer")}</button>
              {can("products.create") ? <button type="button" onClick={() => { setProdForm(emptyProduct()); setProdErr(""); setProdOpen(true); }}>{tr("posQuickProduct")}</button> : null}
            </div>
            <label className="pos-classic-field is-no">
              <span>{tr("posInvoiceNoShort")}</span>
              <input readOnly value={invoiceNo} />
            </label>
            <div className="pos-classic-clock">
              <b>{clockLabel}</b>
              <span>{dateLabel}</span>
            </div>
          </div>

          <div className="pos-classic-docs">
            <button type="button" className={desk === "sale" ? "is-on" : ""} onClick={() => setDesk("sale")}>{tr("posBackDesk")}</button>
            <button type="button" className={desk === "cart" ? "is-on" : ""} onClick={() => openDesk("cart")}>{tr("posCurrentCart")}{cart.length ? ` (${cart.length})` : ""}</button>
            <button type="button" className={desk === "held" ? "is-on" : ""} onClick={() => openDesk("held")}>{tr("heldInvoices")}{heldOpenCount ? ` (${heldOpenCount})` : ""}</button>
            <button type="button" className={desk === "sold" ? "is-on" : ""} onClick={() => openDesk("sold")}>{tr("posSoldInvoices")}</button>
            <button type="button" className={desk === "control" ? "is-on" : ""} onClick={() => openDesk("control")}>{tr("posInvoiceControl")}</button>
          </div>

          {desk === "cart" ? (
            <div className="pos-classic-grid-wrap">
              <div className="pos-classic-pane-title">{tr("posCartLines")}</div>
              <div className="pos-classic-table">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{tr("posColName")}</th>
                      <th>{tr("posColSku")}</th>
                      <th>{tr("qty")}</th>
                      <th>{tr("sellingPrice")}</th>
                      <th>{tr("discount")}</th>
                      <th>{tr("total")}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((l, i) => (
                      <tr key={`${l.id}-${l.unit_name}-${i}`} className={sel === i ? "is-pick" : ""} onClick={() => setSel(i)}>
                        <td>{i + 1}</td>
                        <td className="is-name">{nameOf(l)}{l.unit_name ? ` · ${l.unit_name}` : ""}</td>
                        <td>{l.sku}</td>
                        <td>
                          <input
                            className="pos-classic-cell"
                            type="number"
                            min={1}
                            value={l.qty}
                            onChange={(e) => {
                              const qty = Math.max(1, Number(e.target.value) || 1);
                              setCart((c) => c.map((x, j) => (j === i ? { ...x, qty, discount: offerDisc(x.id, qty, x.unit_price) } : x)));
                            }}
                          />
                        </td>
                        <td>
                          <input
                            className="pos-classic-cell"
                            type="number"
                            value={l.unit_price}
                            onChange={(e) => setCart((c) => c.map((x, j) => (j === i ? { ...x, unit_price: Number(e.target.value) || 0 } : x)))}
                          />
                        </td>
                        <td>{money(l.discount, lang)}</td>
                        <td className="is-price">{money(l.qty * l.unit_price - l.discount, lang)}</td>
                        <td>
                          <button type="button" onClick={() => setCart((c) => c.filter((_, j) => j !== i))}>{tr("delete")}</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3}>{tr("posCurrentCart")}</td>
                      <td>{num(cart.reduce((s, l) => s + l.qty, 0), lang)}</td>
                      <td colSpan={4}>{money(total, lang)}</td>
                    </tr>
                  </tfoot>
                </table>
                {!cart.length ? <div className="pos-classic-empty">{tr("cartEmpty")}</div> : null}
              </div>
            </div>
          ) : desk === "held" ? (
            <div className="pos-classic-grid-wrap">
              <div className="pos-classic-pane-title">{tr("heldInvoices")}</div>
              <div className="pos-classic-table">
                <table>
                  <thead>
                    <tr>
                      <th>{tr("invoiceNo")}</th>
                      <th>{tr("customer")}</th>
                      <th>{tr("agent")}</th>
                      <th>{tr("total")}</th>
                      <th>{tr("status")}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(held || []).map((h) => {
                      const open = isOpenHeld(h.status);
                      return (
                      <tr key={h.id} style={open ? undefined : { opacity: 0.5 }}>
                        <td>{h.number}</td>
                        <td>{h.customer_name || tr("walkIn")}</td>
                        <td>{h.delivery_agent_name || "—"}</td>
                        <td className="is-price">{money(h.total, lang)}</td>
                        <td>{statusLabel(h.status, lang)}</td>
                        <td>
                          {open ? (
                          <div className="held-act">
                          <button type="button" className="is-pay" disabled={busy || !can("sales.create")} onClick={() => void finalizeHeld(h.id, "pay")}>{tr("completeHeldPay")}</button>
                          <button type="button" className="is-credit" disabled={busy || !can("sales.create")} onClick={() => void finalizeHeld(h.id, "credit")}>{tr("completeHeldCredit")}</button>
                          <button type="button" onClick={() => { beginResumeHeld(h.id); setDesk("sale"); nav(`/pos?held=${h.id}`); }}>{tr("restoreHeld")}</button>
                          <button type="button" onClick={() => nav(`/sales/${h.id}`)}>{tr("view")}</button>
                          <button type="button" onClick={() => void cancelHeld(h.id)}>{tr("delete")}</button>
                          </div>
                          ) : null}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!held.length ? <div className="pos-classic-empty">{tr("noData")}</div> : null}
              </div>
            </div>
          ) : desk === "sold" ? (
            <div className="pos-classic-grid-wrap">
              <div className="pos-classic-pane-title">{tr("posSoldToday")} · {money(todayStats.sales_today, lang)}</div>
              <div className="pos-classic-table">
                <table>
                  <thead>
                    <tr>
                      <th>{tr("invoiceNo")}</th>
                      <th>{tr("customer")}</th>
                      <th>{tr("total")}</th>
                      <th>{tr("status")}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(todayInv || []).map((h) => (
                      <tr key={h.id}>
                        <td>{h.number}</td>
                        <td>{h.customer_name || tr("walkIn")}</td>
                        <td className="is-price">{money(h.total, lang)}</td>
                        <td>{statusLabel(h.status, lang)}</td>
                        <td>
                          <button type="button" onClick={() => nav(`/sales/${h.id}`)}>{tr("view")}</button>
                          <button type="button" onClick={() => { nav(`/sales/${h.id}`); setTimeout(() => window.print(), 400); }}>{tr("print")}</button>
                          {waEnabled && can("whatsapp.send") ? <button type="button" onClick={() => void previewWa(h.id)}>{tr("whatsapp")}</button> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2}>{tr("posSoldInvoices")}</td>
                      <td colSpan={3}>{num(todayStats.invoices_today, lang)} · {money(todayStats.sales_today, lang)}</td>
                    </tr>
                  </tfoot>
                </table>
                {!todayInv.length ? <div className="pos-classic-empty">{tr("noData")}</div> : null}
              </div>
            </div>
          ) : desk === "control" ? (
            <div className="pos-classic-control">
              <div className="pos-classic-pane-title">{tr("posInvoiceControl")}</div>
              <div className="pos-classic-control-grid">
                <button type="button" onClick={() => nav("/sales")}>{tr("posOpenSales")}</button>
                <button type="button" onClick={() => openDesk("sold")}>{tr("posSoldInvoices")}</button>
                <button type="button" onClick={() => openDesk("held")}>{tr("heldInvoices")}</button>
                <button type="button" onClick={() => openDesk("cart")}>{tr("posCurrentCart")}</button>
                <button type="button" disabled={!cart.length} onClick={() => void holdInvoice()}>{tr("posHoldCurrent")}</button>
                <button type="button" disabled={!doneInv} onClick={() => doneInv && nav(`/sales/${doneInv.id}`)}>{tr("posLastInvoice")}</button>
                <button type="button" disabled={!doneInv} onClick={() => { if (!doneInv) return; nav(`/sales/${doneInv.id}`); setTimeout(() => window.print(), 400); }}>{tr("print")}</button>
                {can("returns.create") ? <button type="button" onClick={() => setRetOpen(true)}>{tr("returnFromInvoice")}</button> : null}
                <button type="button" onClick={clearCart}>{tr("posDeleteInvoice")}</button>
              </div>
            </div>
          ) : (
            <div className="pos-classic-grid-wrap">
              <div className="pos-classic-empty" style={{ display: "flex", gap: 8, justifyContent: "flex-end", opacity: 1, flex: "none" }}>
                <PageSizeControl value={catalogPageSize} onChange={setCatalogPageSize} />
              </div>
              <div className="pos-classic-table">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <PosHeaderFilter column="sku" label={tr("posColSku")} values={uniqueFilterValues(visible, "sku", lang, pickPrice)} value={headerFilters.sku || ""} onChange={(v) => setHeaderFilter("sku", v)} />
                      <PosHeaderFilter column="name" label={tr("posColName")} values={uniqueFilterValues(visible, "name", lang, pickPrice)} value={headerFilters.name || ""} onChange={(v) => setHeaderFilter("name", v)} />
                      <th>{tr("posColTotalQty")}</th>
                      <th>{tr("posColUnit")}</th>
                      <th>{tr("posColStoreQty")}</th>
                      <th>{tr("posColShopQty")}</th>
                      <PosHeaderFilter column="category" label={tr("posColCategory")} values={uniqueFilterValues(visible, "category", lang, pickPrice)} value={headerFilters.category || ""} onChange={(v) => setHeaderFilter("category", v)} />
                      <PosHeaderFilter column="partType" label={tr("posColKind")} values={uniqueFilterValues(visible, "partType", lang, pickPrice)} value={headerFilters.partType || ""} onChange={(v) => setHeaderFilter("partType", v)} />
                      <PosHeaderFilter column="brand" label={tr("posColBrand")} values={uniqueFilterValues(visible, "brand", lang, pickPrice)} value={headerFilters.brand || ""} onChange={(v) => setHeaderFilter("brand", v)} />
                      <th>{tr("supplier")}</th>
                      <PosHeaderFilter column="box" label={tr("posColPack")} values={uniqueFilterValues(visible, "box", lang, pickPrice)} value={headerFilters.box || ""} onChange={(v) => setHeaderFilter("box", v)} />
                      <PosHeaderFilter column="bin" label={tr("posColBin")} values={uniqueFilterValues(visible, "bin", lang, pickPrice)} value={headerFilters.bin || ""} onChange={(v) => setHeaderFilter("bin", v)} />
                      <PosHeaderFilter column="selling" label={tr("sellingPrice")} values={uniqueFilterValues(visible, "selling", lang, pickPrice)} value={headerFilters.selling || ""} onChange={(v) => setHeaderFilter("selling", v)} />
                      <PosHeaderFilter column="min" label={tr("posColMinPrice")} values={uniqueFilterValues(visible, "min", lang, pickPrice)} value={headerFilters.min || ""} onChange={(v) => setHeaderFilter("min", v)} />
                      {showCost ? <th>{tr("posColAvgBuy")}</th> : null}
                      {showCost ? <th>{tr("posColLastBuy")}</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {catalogRows.map((p, i) => {
                      const inCart = cartQty(p.id);
                      return (
                        <tr
                          key={p.id}
                          className={`${picked === p.id ? "is-pick" : ""} ${inCart ? "is-in" : ""}`}
                          onClick={() => pickProduct(p)}
                          onDoubleClick={() => add(p)}
                        >
                          <td>{(catalogPage - 1) * catalogPageSize + i + 1}</td>
                          <td>{p.sku}</td>
                          <td className="is-name">{nameOf(p)}{inCart ? ` (${inCart})` : ""}</td>
                          <td>{num(p.current_stock ?? p.available, lang)}</td>
                          <td>{p.unit || ""}</td>
                          <td>{num(p.current_stock ?? p.available, lang)}</td>
                          <td>{num(p.available, lang)}</td>
                          <td>{p.quality || (lang === "ar" ? p.category_ar : p.category_en) || p.category_ar || ""}</td>
                          <td>{(lang === "ar" ? p.part_type_ar : p.part_type_en) || p.part_type_ar || ""}</td>
                          <td>{(lang === "ar" ? p.brand_ar : p.brand_en) || ""}</td>
                          <td>{lastSupplierName(p)}</td>
                          <td>{p.box || ""}</td>
                          <td>{binText(p)}</td>
                          <td className="is-price">{money(pickPrice(p), lang)}</td>
                          <td>{money(p.min_selling_price || 0, lang)}</td>
                          {showCost ? <td>{money(p.purchase_price || 0, lang)}</td> : null}
                          {showCost ? <td>{money(p.last_purchase_price || p.purchase_price || 0, lang)}</td> : null}
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3}>{tr("posGoods")}</td>
                      <td>{num(visible.reduce((s, p) => s + Number(p.current_stock ?? p.available ?? 0), 0), lang)}</td>
                      <td colSpan={showCost ? 13 : 11}>{cart.length ? `${tr("total")}: ${money(total, lang)} · ${num(cart.reduce((s, l) => s + l.qty, 0), lang)}` : ""}</td>
                    </tr>
                  </tfoot>
                </table>
                {catalogTotal > 0 ? (
                  <div className="pos-classic-empty" style={{ display: "flex", gap: 8, justifyContent: "flex-end", opacity: 1 }}>
                    <PageSizeControl value={catalogPageSize} onChange={setCatalogPageSize} />
                    <span>{num((catalogPage - 1) * catalogPageSize + (visible.length ? 1 : 0), lang)}–{num((catalogPage - 1) * catalogPageSize + visible.length, lang)} {tr("of")} {num(catalogTotal, lang)}</span>
                    <button type="button" disabled={catalogPage <= 1 || catalogLoading} onClick={() => setCatalogPage((n) => Math.max(1, n - 1))}>{tr("prev")}</button>
                    <button type="button" disabled={catalogLoading || catalogPage >= Math.max(1, Math.ceil(catalogTotal / catalogPageSize))} onClick={() => setCatalogPage((n) => n + 1)}>{tr("next")}</button>
                  </div>
                ) : null}
                {catalogLoading && !visible.length ? <div className="pos-classic-empty">{tr("loadingProducts")}</div> : catalogError && !visible.length ? (
                  <div className="pos-classic-empty">
                    <div>{catalogError}</div>
                    <button type="button" onClick={() => reloadCatalog()}>{tr("retry")}</button>
                  </div>
                ) : !visible.length ? <div className="pos-classic-empty">{tr("noResults")}</div> : catalogError ? (
                  <div className="pos-classic-empty">
                    <div>{catalogError}</div>
                    <button type="button" onClick={() => reloadCatalog()}>{tr("retry")}</button>
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {err ? <div className="pos-classic-err">{err}</div> : null}

          <div className="pos-classic-green">
            <ClassicDropUp
              label={tr("posTreasury")}
              display={cashName}
              open={cashOpen}
              onToggle={() => { setCourierOpen(false); setCustListOpen(false); setCashOpen((v) => !v); }}
            >
              {cashAccounts.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={cashAccountId === a.id ? "is-on" : ""}
                  onClick={() => { setCashAccountId(a.id); setCashOpen(false); }}
                >
                  {a.name}
                </button>
              ))}
            </ClassicDropUp>
            {can("sales.discount") ? (
              <>
                <label>
                  <span>{tr("posDiscPct")}</span>
                  <input
                    type="number"
                    value={discMode === "pct" ? discount : ""}
                    onChange={(e) => { setDiscMode("pct"); setDiscount(Number(e.target.value) || 0); }}
                  />
                </label>
                <label>
                  <span>{tr("posDiscValue")}</span>
                  <input
                    type="number"
                    value={discMode === "egp" ? discount : discAmt}
                    onChange={(e) => { setDiscMode("egp"); setDiscount(Number(e.target.value) || 0); }}
                  />
                </label>
              </>
            ) : null}
            <ClassicDropUp
              wide
              label={tr("customer")}
              display={customerName}
              open={custListOpen}
              onToggle={() => { setCashOpen(false); setCourierOpen(false); setCustListOpen((v) => !v); }}
            >
              <input
                value={customer ? customer.name : customerQ}
                autoComplete="off"
                placeholder={tr("customer")}
                onChange={(e) => {
                  setCustomer(null);
                  setCustomerQ(e.target.value);
                  setWalkIn(e.target.value);
                  setCustListOpen(true);
                }}
              />
              <button
                type="button"
                onClick={() => {
                  setCustomer(null);
                  setCustomerQ("");
                  setWalkIn("");
                  setCustListOpen(false);
                }}
              >
                {tr("walkIn")}
              </button>
              {customers.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setCustomer(c);
                    setCustomerQ("");
                    setWalkIn("");
                    setAddress(c.address || "");
                    if (c.price_list_id) setListId(Number(c.price_list_id));
                    setCustListOpen(false);
                  }}
                >
                  <b>{c.name}</b>
                  <small>{[c.phone, c.area].filter(Boolean).join(" · ")}</small>
                </button>
              ))}
            </ClassicDropUp>
            <button
              type="button"
              className={`pos-classic-deliv ${type === "delivery" ? "is-on" : ""}`}
              onClick={() => { closeFooterMenus(); setType(type === "delivery" ? "normal" : "delivery"); }}
            >
              {tr("delivery")}
            </button>
            {type === "delivery" ? (
              <>
                <ClassicDropUp
                  wide
                  label={tr("agent")}
                  display={courierName}
                  open={courierOpen}
                  onToggle={() => { setCashOpen(false); setCustListOpen(false); setCourierOpen((v) => !v); }}
                >
                  <button type="button" onClick={() => { setAgentId(""); setCourierOpen(false); }}>{tr("agent")}</button>
                  {couriers.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className={agentId === a.id ? "is-on" : ""}
                      onClick={() => { setAgentId(a.id); setCourierOpen(false); }}
                    >
                      {a.name}
                    </button>
                  ))}
                </ClassicDropUp>
                <label>
                  <span>{tr("deliveryFee")}</span>
                  <input type="number" value={extraAmount} onChange={(e) => setExtraAmount(Number(e.target.value))} />
                </label>
              </>
            ) : null}
            <div className="pos-classic-green-total">{money(total, lang)}</div>
          </div>

          <div className="pos-classic-black">
            <button type="button" disabled={busy || !cart.length} onClick={() => void submit()}>{tr("posF9Save")}</button>
            <button type="button" onClick={clearCart}>{tr("posF10New")}</button>
            <button type="button" disabled={busy || !cart.length} onClick={() => void submit({ print: true })}>{tr("posF4Print")}</button>
            <button type="button" onClick={clearCart}><X size={12} /> {tr("posDeleteInvoice")}</button>
            <button type="button" onClick={() => setExtrasOpen(true)}>{tr("posEditPrices")}</button>
            <button type="button" onClick={() => window.print()}><Printer size={12} /> {tr("posPrintBarcode")}</button>
            {can("settings.edit") ? <button type="button" onClick={() => nav("/settings")}><Settings size={12} /> {tr("settings")}</button> : null}
            <button type="button" onClick={() => nav("/")}>{tr("posClose")}</button>
            <span className="pos-classic-black-gap" />
            <button type="button" className="is-hold" disabled={busy || resuming || !cart.length} onClick={() => void holdInvoice()}>{tr("posHold")}</button>
          </div>
        </div>
      </div>

      <Modal open={extrasOpen} title={tr("posEditPrices")} onClose={() => setExtrasOpen(false)} wide>
        <div className="space-y-3">
          <div className="grid gap-2 md:grid-cols-2">
            {cart.map((l, i) => (
              <label key={`${l.id}-${i}`} className="text-xs">
                <span className="mb-1 block font-bold">{nameOf(l)}</span>
                <input
                  className={inputCls}
                  type="number"
                  value={l.unit_price}
                  onChange={(e) => setCart((c) => c.map((x, j) => (j === i ? { ...x, unit_price: Number(e.target.value) || 0 } : x)))}
                />
              </label>
            ))}
          </div>
          <label className="text-xs">
            <span className="mb-1 block font-bold">{tr("notes")}</span>
            <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <div className="flex gap-2">
            {[{ code: "cash", label: tr("posPayCash") }, { code: "visa", label: tr("posPayCard") }, { code: "credit", label: tr("posPayCredit") }].map((b) => (
              <button key={b.code} type="button" className={`rounded-xl px-3 py-1.5 text-xs font-bold ${method === b.code ? "bg-[var(--ink)] text-white" : "border"}`} onClick={() => setMethod(b.code)}>{b.label}</button>
            ))}
          </div>
          {method === "credit" ? (
            <label className="flex items-center justify-between gap-2 text-xs">
              <span>{tr("dueDate")}</span>
              <input className={`${inputCls} w-36`} type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </label>
          ) : null}
          <label className="flex items-center justify-between gap-2 text-xs">
            <span>{tr("invoiceDate")}</span>
            <input className={`${inputCls} w-36`} type="date" value={invDate} onChange={(e) => { setInvDate(e.target.value); if (method === "credit") setDue(e.target.value); }} />
          </label>
          <label className="text-xs">
            <span className="mb-1 block font-bold">{tr("paid")}</span>
            <input className={inputCls} type="number" value={paid} onChange={(e) => setPaid(Number(e.target.value))} />
          </label>
          <div>
            <div className="mb-1 text-xs font-bold">{tr("splitPay")}</div>
            {pays.map((p, i) => (
              <div key={i} className="mb-1 flex gap-2">
                <select className={inputCls} value={p.method} onChange={(e) => setPays(pays.map((x, j) => j === i ? { ...x, method: e.target.value } : x))}>
                  <option value="cash">{tr("posPayCash")}</option>
                  <option value="visa">{tr("posPayCard")}</option>
                </select>
                <input className={inputCls} type="number" value={p.amount} onChange={(e) => setPays(pays.map((x, j) => j === i ? { ...x, amount: Number(e.target.value) } : x))} />
              </div>
            ))}
            <button type="button" className="text-xs font-bold text-cyan-700" onClick={() => setPays([...pays, { method: "cash", amount: 0 }])}>{tr("addPayment")}</button>
          </div>
          {can("returns.create") ? <Btn kind="ghost" onClick={() => { setExtrasOpen(false); setRetOpen(true); }}>{tr("returnFromInvoice")}</Btn> : null}
        </div>
      </Modal>

      <Modal open={heldOpen} title={tr("heldInvoices")} onClose={() => setHeldOpen(false)} xl>
        <div className="mb-3 flex flex-wrap gap-1">
          {([["held", tr("heldInvoices")], ["print", tr("heldPrint")], ["wa", tr("whatsapp")]] as const).map(([id, label]) => (
            <button key={id} type="button" className={`period-chip ${heldTab === id ? "is-on" : ""}`} onClick={() => setHeldTab(id)}>{label}</button>
          ))}
        </div>
        {heldTab === "held" ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{tr("invoiceNo")}</th>
                  <th>{tr("customer")}</th>
                  <th>{tr("total")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(held || []).map((h) => (
                  <tr key={h.id}>
                    <td>{h.number}</td>
                    <td>{h.customer_name || tr("walkIn")}</td>
                    <td className="font-bold">{money(h.total, lang)}</td>
                    <td>
                      <div className="held-act">
                        <button type="button" className="is-pay" disabled={busy || !can("sales.create")} onClick={() => void finalizeHeld(h.id, "pay")}>{tr("completeHeldPay")}</button>
                        <button type="button" className="is-credit" disabled={busy || !can("sales.create")} onClick={() => void finalizeHeld(h.id, "credit")}>{tr("completeHeldCredit")}</button>
                        <button type="button" onClick={() => { beginResumeHeld(h.id); setHeldOpen(false); nav(`/pos?held=${h.id}`); }}>{tr("restoreHeld")}</button>
                        <button type="button" className="is-del" onClick={() => void cancelHeld(h.id)}>{tr("delete")}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          (todayInv || []).map((h) => (
            <div key={`${heldTab}-${h.id}`} className="mb-2 flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm">
              <div>{h.number} · {h.customer_name || tr("walkIn")} · {money(h.total, lang)}</div>
              {heldTab === "print" ? (
                <button type="button" className="font-bold text-cyan-700" onClick={() => { setHeldOpen(false); nav(`/sales/${h.id}`); setTimeout(() => window.print(), 400); }}>{tr("print")}</button>
              ) : (
                <button type="button" className="font-bold text-emerald-700" disabled={!waEnabled || !can("whatsapp.send")} onClick={() => void previewWa(h.id)}>{tr("whatsapp")}</button>
              )}
            </div>
          ))
        )}
      </Modal>
      <Modal open={doneOpen} title={tr("saleDone")} onClose={() => setDoneOpen(false)}>
        {doneInv ? (
          <div className="space-y-3">
            <div className="text-lg font-black">{doneInv.number}</div>
            <div className="text-sm text-slate-500">{doneInv.customer_name || tr("walkIn")} · {money(doneInv.total, lang)}</div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className={statusClass(invoicePayStatus(doneInv))}>{statusLabel(invoicePayStatus(doneInv), lang)}</span>
            </div>
            <div className="print-sheet max-h-[50vh] overflow-auto rounded-2xl border border-slate-100 bg-white p-4">
              <InvoicePrint inv={printInvoice.number ? printInvoice : { ...printInvoice, ...doneInv }} screen title={quoteMode ? tr("quoteMode") : tr("invoice")} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Btn onClick={() => window.print()}>{tr("print")}</Btn>
              {waEnabled && can("whatsapp.send") ? <Btn kind="soft" onClick={() => void previewWa(doneInv.id)}>{tr("sendWhatsapp")}</Btn> : null}
              <Btn kind="ghost" onClick={() => setDoneOpen(false)}>{tr("continueSale")}</Btn>
            </div>
          </div>
        ) : null}
      </Modal>
      <Modal open={waOpen} title={tr("previewWhatsapp")} onClose={() => setWaOpen(false)} wide>
        <textarea className={`${inputCls} min-h-40`} value={waMsg} onChange={(e) => setWaMsg(e.target.value)} />
        <div className="mt-3 flex flex-wrap gap-2">
          <Btn
            onClick={async () => {
              const phone = waPreview?.phone;
              if (!phone || !waPreview?.invoice_id) return;
              const intl = String(phone).replace(/\D/g, "").replace(/^0/, "20");
              const link = `https://wa.me/${intl}?text=${encodeURIComponent(waMsg)}`;
              await post(`/api/invoices/${waPreview.invoice_id}/whatsapp/opened`, { type: waPreview.type, message: waMsg, phone });
              window.open(link, "_blank");
            }}
          >
            {tr("openWhatsapp")}
          </Btn>
        </div>
      </Modal>
      <Modal open={custOpen} title={tr("addCustomer")} onClose={() => setCustOpen(false)}>
        <div className="space-y-3">
          <input className={inputCls} placeholder={tr("name")} value={newCust.name} onChange={(e) => setNewCust({ ...newCust, name: e.target.value })} />
          <input className={inputCls} placeholder={tr("phone")} value={newCust.phone} onChange={(e) => setNewCust({ ...newCust, phone: e.target.value })} />
          <Btn onClick={() => void saveAccount()}>{tr("save")}</Btn>
        </div>
      </Modal>
      <Modal open={retOpen} title={tr("returnFromInvoice")} onClose={() => { setRetOpen(false); setRetInv(null); }}>
        <div className="space-y-3">
          <Field label={tr("invoiceNo")}>
            <input className={inputCls} value={retNo} onChange={(e) => setRetNo(e.target.value)} onKeyDown={async (e) => {
              if (e.key !== "Enter" || !retNo.trim()) return;
              const list = await get<{ data: any[] }>(`/api/invoices?q=${encodeURIComponent(retNo.trim())}&pageSize=5`);
              const hit = (list.data || []).find((x) => String(x.number) === retNo.trim()) || list.data?.[0];
              if (!hit) { playSound("err"); return; }
              const full = await get<{ data: any }>(`/api/invoices/${hit.id}`);
              if (["cancelled", "fully_returned", "held", "quote", "order"].includes(full.data.status)) {
                playSound("err");
                setErr(tr("errCannotReturn"));
                setRetInv(null);
                return;
              }
              setErr("");
              setRetInv(full.data);
              setRetItems((full.data.items || []).map((i: any) => ({ invoice_item_id: i.id, qty: 0, max: i.quantity - (i.returned_qty || 0), name: i.product_name })));
            }} />
          </Field>
          {retInv ? (
            <>
              <div className="text-sm font-bold">{retInv.number}</div>
              {retItems.map((i) => (
                <div key={i.invoice_item_id} className="flex items-center justify-between gap-2">
                  <span>{i.name}</span>
                  <input className={`${inputCls} w-24`} type="number" min={0} max={i.max} value={i.qty} onChange={(e) => {
                    const qty = Math.max(0, Math.min(i.max, Number(e.target.value) || 0));
                    setRetItems(retItems.map((x) => x.invoice_item_id === i.invoice_item_id ? { ...x, qty } : x));
                  }} />
                </div>
              ))}
              <div className="flex gap-2">
                <Btn onClick={() => void submitInvoiceReturn(false)}>{tr("save")}</Btn>
                <Btn kind="soft" onClick={() => void submitInvoiceReturn(true)}>{tr("exchange")}</Btn>
              </div>
            </>
          ) : null}
        </div>
      </Modal>
      <ProductDialogClassic
        open={prodOpen}
        form={prodForm}
        busy={prodBusy}
        err={prodErr}
        onChange={setProdForm}
        onClose={() => setProdOpen(false)}
        onSave={async () => {
          if (!String(prodForm.sku || "").trim() || !String(prodForm.name_ar || "").trim()) {
            setProdErr(tr("errMissing"));
            return;
          }
          setProdBusy(true);
          setProdErr("");
          try {
            const payload = {
              ...prodForm,
              brand_id: prodForm.brand_id || null,
              part_type_id: prodForm.part_type_id || null,
              category_id: prodForm.category_id || null,
              location_id: prodForm.location_id || null,
              supplier_id: prodForm.supplier_id || null,
            };
            if (prodForm.id) await put(`/api/products/${prodForm.id}`, payload);
            else await post("/api/products", payload);
            playSound("done");
            setProdOpen(false);
            setStockTick((n) => n + 1);
          } catch (e) {
            playSound("err");
            setProdErr(apiMessage(tr, e));
          } finally {
            setProdBusy(false);
          }
        }}
      />
      <AccountDialogClassic
        open={acctOpen}
        onClose={() => setAcctOpen(false)}
        onSaved={(kind, row) => {
          setPartyKind(kind);
          applyParty(row, kind);
        }}
      />
    </div>
  );
}
