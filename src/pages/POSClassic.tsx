import { useState } from "react";
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
import { money, num, statusClass, statusLabel } from "../lib/format";
import { Btn, Field, Modal, PrintLetterhead, inputCls } from "../components/ui";
import { Barcode } from "../components/Barcode";
import { playSound } from "../lib/sounds";
import { ProductSuggestList } from "../components/ProductSuggest";
import { ProductDialogClassic } from "../components/classic/ProductDialogClassic";
import { AccountDialogClassic } from "../components/classic/AccountDialogClassic";
import { emptyProduct, type ProductForm } from "../hooks/useProductCatalog";
import { usePOSLogic, type Product } from "../hooks/usePOSLogic";

function binText(p: Product) {
  return [p.rack, p.shelf, p.drawer].filter(Boolean).join("+");
}

export default function POSClassic() {
  const pos = usePOSLogic("classic");
  const {
    tr, lang, lookups, can, nav, quoteMode, showCost,
    q, setQ, typeFilter, setTypeFilter,
    cart, setCart, sel, setSel, type, method, setMethod,
    customerQ, setCustomerQ, custListOpen, setCustListOpen,
    customer, setCustomer, walkIn, setWalkIn,
    cashAccountId, setCashAccountId,
    address, setAddress, paid, setPaid,
    discount, setDiscount, discMode, setDiscMode, invDate, setInvDate,
    extrasOpen, setExtrasOpen, extraAmount, notes, setNotes,
    due, setDue, pays, setPays,
    held, heldOpen, setHeldOpen, heldTab, setHeldTab, todayInv, todayStats,
    doneOpen, setDoneOpen, doneInv, waOpen, setWaOpen, waPreview, waMsg, setWaMsg,
    brandFilter, setBrandFilter, picked, clock,
    listId, setListId, err, setErr, busy, custOpen, setCustOpen,
    retOpen, setRetOpen, retNo, setRetNo, retInv, setRetInv, retItems, setRetItems,
    newCust, setNewCust, qtyField, setQtyField, priceField, setPriceField,
    partyKind, setPartyKind, accountCode, setAccountCode,
    searchRef, suggest,
    visible, offerDisc, pickPrice, pickProduct, add, addFromSearch, addPicked, clearCart,
    subtotal, discAmt, total, creditNeedCustomer,
    printRows, printTotal, printExtra, waEnabled, cartQty, showGoods, partyHits, applyParty, saveAccount,
    loadToday, loadHeldList, openHeld, cancelHeld, previewWa, submit, holdInvoice,
    forceGoods, setForceGoods, setStockTick,
  } = pos;
  const [railOpen, setRailOpen] = useState(true);
  const [desk, setDesk] = useState<"sale" | "cart" | "held" | "sold" | "control">("sale");
  const [prodOpen, setProdOpen] = useState(false);
  const [prodForm, setProdForm] = useState<ProductForm>(emptyProduct());
  const [prodBusy, setProdBusy] = useState(false);
  const [prodErr, setProdErr] = useState("");
  const [acctOpen, setAcctOpen] = useState(false);
  const rtl = lang === "ar";
  const Collapse = rtl ? ChevronRight : ChevronLeft;
  const Expand = rtl ? ChevronLeft : ChevronRight;
  const nameOf = (p: Product) => (lang === "ar" ? p.name_ar : p.name_en) || p.name_ar;
  const kindLabel = (p: Product) => (p.kind === "service" ? tr("services") : tr("products"));
  const clockLabel = clock.toLocaleTimeString(lang === "ar" ? "en-US" : "en-GB", { hour: "numeric", minute: "2-digit" });
  const dateLabel = invDate.split("-").reverse().join("/");
  const invoiceNo = doneInv?.number || "";
  const accountName = customer?.name || supplierName() || newCust.name || customerQ || walkIn;

  function supplierName() {
    return partyKind === "supplier" || partyKind === "agent" ? (newCust.name || walkIn || "") : "";
  }

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
      <PrintLetterhead title={quoteMode ? tr("quoteMode") : tr("pos")} />
      <div className="print-only table-wrap">
        <table>
          <thead>
            <tr>
              <th>{tr("items")}</th>
              <th>{tr("qty")}</th>
              <th>{tr("unitPrice")}</th>
              <th>{tr("total")}</th>
            </tr>
          </thead>
          <tbody>
            {printRows.map((l) => (
              <tr key={`${l.id}-${l.unit_name}`}>
                <td>{nameOf(l)}{l.unit_name ? ` · ${l.unit_name}` : ""}</td>
                <td>{l.qty}</td>
                <td>{money(l.unit_price, lang)}</td>
                <td>{money(l.qty * l.unit_price - l.discount, lang)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 text-end font-black">{tr("total")}: {money(printTotal, lang)}</div>
        {Number(printExtra) ? <div className="text-end text-sm">{tr("extraAmount")}: {money(printExtra, lang)}</div> : null}
      </div>
      <div className="print-only barcode-sheet">
        {printRows.map((l) => (
          <Barcode key={`${l.id}-bc`} value={l.barcode || l.sku} label={nameOf(l)} price={money(l.unit_price, lang)} />
        ))}
      </div>

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
                {held.length ? <small>{held.length}</small> : null}
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
            <button type="button" className={desk === "held" ? "is-on" : ""} onClick={() => openDesk("held")}>{tr("heldInvoices")}{held.length ? ` (${held.length})` : ""}</button>
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
                      <th>{tr("total")}</th>
                      <th>{tr("status")}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(held || []).map((h) => (
                      <tr key={h.id}>
                        <td>{h.number}</td>
                        <td>{h.customer_name || tr("walkIn")}</td>
                        <td className="is-price">{money(h.total, lang)}</td>
                        <td>{statusLabel(h.status, lang)}</td>
                        <td>
                          <button type="button" onClick={() => { setDesk("sale"); nav(`/pos?held=${h.id}`); }}>{tr("restoreHeld")}</button>
                          <button type="button" onClick={() => nav(`/sales/${h.id}`)}>{tr("view")}</button>
                          <button type="button" onClick={() => void cancelHeld(h.id)}>{tr("delete")}</button>
                        </td>
                      </tr>
                    ))}
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
          ) : !showGoods ? (
            <div className="pos-classic-account">
              <div className="pos-classic-account-card">
                <div className="pos-classic-account-title">{tr("invoice")}</div>
                <label>
                  <span>{tr("posAccountName")}</span>
                  <div className="pos-classic-suggest-wrap">
                    <input
                      value={accountName}
                      autoComplete="off"
                      onFocus={() => setCustListOpen(true)}
                      onChange={(e) => {
                        setCustomer(null);
                        setCustomerQ(e.target.value);
                        setWalkIn(e.target.value);
                        setNewCust({ ...newCust, name: e.target.value });
                        setCustListOpen(true);
                      }}
                    />
                    {custListOpen ? (
                      <div className="pos-classic-suggest">
                        {partyHits.map((row: any) => (
                          <button
                            key={`${partyKind}-${row.id}`}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => { applyParty(row); setCustListOpen(false); }}
                          >
                            <b>{row.name}</b>
                            <small>{[row.phone, row.code, row.area].filter(Boolean).join(" · ")}</small>
                          </button>
                        ))}
                        {!partyHits.length ? <div className="px-2 py-2 text-xs text-slate-400">{tr("noResults")}</div> : null}
                      </div>
                    ) : null}
                  </div>
                </label>
                <label>
                  <span>{tr("posAccountCode")}</span>
                  <input value={accountCode || (customer?.id ? String(customer.id) : "")} onChange={(e) => setAccountCode(e.target.value)} />
                </label>
                <div className="pos-classic-radios">
                  <span>{tr("posAccountType")}</span>
                  {([["customer", tr("posPartyCustomer")], ["supplier", tr("posPartySupplier")], ["agent", tr("posPartyAgent")]] as const).map(([id, label]) => (
                    <label key={id} className="pos-classic-radio">
                      <input
                        type="radio"
                        checked={partyKind === id}
                        onChange={() => {
                          setPartyKind(id);
                          setCustomer(null);
                          setCustListOpen(false);
                        }}
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <label>
                  <span>{tr("posMobile")}</span>
                  <input value={newCust.phone || customer?.phone || ""} onChange={(e) => setNewCust({ ...newCust, phone: e.target.value })} />
                </label>
                <label>
                  <span>{tr("address")}</span>
                  <input value={address || newCust.address} onChange={(e) => { setAddress(e.target.value); setNewCust({ ...newCust, address: e.target.value }); }} />
                </label>
                <button type="button" className="pos-classic-save-acc" disabled={busy} onClick={() => void saveAccount()}>
                  <Check size={16} /> {tr("posSaveAccount")}
                </button>
              </div>
            </div>
          ) : (
            <div className="pos-classic-grid-wrap">
              <div className="pos-classic-filters">
                <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value ? Number(e.target.value) : "")}>
                  <option value="">{tr("posColKind")}</option>
                  {(lookups?.part_types || []).map((t) => <option key={t.id} value={t.id}>{lang === "ar" ? t.name_ar : t.name_en}</option>)}
                </select>
                <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value ? Number(e.target.value) : "")}>
                  <option value="">{tr("posColBrand")}</option>
                  {(lookups?.brands || []).map((b) => <option key={b.id} value={b.id}>{lang === "ar" ? b.name_ar : b.name_en}</option>)}
                </select>
                <select value={listId} onChange={(e) => setListId(e.target.value ? Number(e.target.value) : "")}>
                  <option value="">{tr("priceList")}</option>
                  {(lookups?.price_lists || []).map((l) => <option key={l.id} value={l.id}>{lang === "ar" ? l.name : (l.name_en || l.name)}</option>)}
                </select>
              </div>
              <div className="pos-classic-table">
                <table>
                  <thead>
                    <tr>
                      <th>{tr("posColSku")}</th>
                      <th>{tr("posColName")}</th>
                      <th>{tr("posColTotalQty")}</th>
                      <th>{tr("posColUnit")}</th>
                      <th>{tr("posColStoreQty")}</th>
                      <th>{tr("posColShopQty")}</th>
                      <th>{tr("posColCategory")}</th>
                      <th>{tr("posColKind")}</th>
                      <th>{tr("posColBrand")}</th>
                      <th>{tr("supplier")}</th>
                      <th>{tr("posColPack")}</th>
                      <th>{tr("posColBin")}</th>
                      <th>{tr("sellingPrice")}</th>
                      <th>{tr("posColMinPrice")}</th>
                      {showCost ? <th>{tr("posColAvgBuy")}</th> : null}
                      {showCost ? <th>{tr("posColLastBuy")}</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((p) => {
                      const inCart = cartQty(p.id);
                      return (
                        <tr
                          key={p.id}
                          className={`${picked === p.id ? "is-pick" : ""} ${inCart ? "is-in" : ""}`}
                          onClick={() => pickProduct(p)}
                          onDoubleClick={() => add(p)}
                        >
                          <td>{p.sku}</td>
                          <td className="is-name">{nameOf(p)}{inCart ? ` (${inCart})` : ""}</td>
                          <td>{num(p.current_stock ?? p.available, lang)}</td>
                          <td>{p.unit || ""}</td>
                          <td>{num(p.current_stock ?? p.available, lang)}</td>
                          <td>{num(p.available, lang)}</td>
                          <td>{(lang === "ar" ? p.category_ar : p.category_en) || ""}</td>
                          <td>{kindLabel(p)}</td>
                          <td>{(lang === "ar" ? p.brand_ar : p.brand_en) || ""}</td>
                          <td>{p.supplier_name || ""}</td>
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
                      <td colSpan={2}>{tr("posGoods")}</td>
                      <td>{num(visible.reduce((s, p) => s + Number(p.current_stock ?? p.available ?? 0), 0), lang)}</td>
                      <td colSpan={showCost ? 13 : 11}>{cart.length ? `${tr("total")}: ${money(total, lang)} · ${num(cart.reduce((s, l) => s + l.qty, 0), lang)}` : ""}</td>
                    </tr>
                  </tfoot>
                </table>
                {!visible.length ? <div className="pos-classic-empty">{tr("noResults")}</div> : null}
              </div>
            </div>
          )}

          {err ? <div className="pos-classic-err">{err}</div> : null}

          <div className="pos-classic-green">
            <label>
              <span>{tr("posTreasury")}</span>
              <select value={cashAccountId} onChange={(e) => setCashAccountId(e.target.value ? Number(e.target.value) : "")}>
                <option value="">-</option>
                {(lookups?.cash_accounts || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            <label>
              <span>{tr("sellingPrice")}</span>
              <input value={priceField} onChange={(e) => setPriceField(e.target.value)} />
            </label>
            <label>
              <span>{tr("posAddKind")}</span>
              <select value={type} disabled>
                <option value="normal">{tr("posSell")}</option>
              </select>
            </label>
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
            <div className="pos-classic-green-total">{money(total, lang)}</div>
          </div>

          <div className="pos-classic-black">
            <button type="button" disabled={busy || !cart.length} onClick={() => void submit()}>{tr("posF9Save")}</button>
            <button type="button" onClick={clearCart}>{tr("posF10New")}</button>
            <button type="button" disabled={busy || !cart.length} onClick={() => void submit({ print: true })}>{tr("posF4Print")}</button>
            <button type="button" onClick={clearCart}><X size={12} /> {tr("posDeleteInvoice")}</button>
            <button type="button" onClick={() => setExtrasOpen(true)}>{tr("posEditPrices")}</button>
            <button type="button" onClick={() => window.print()}><Printer size={12} /> {tr("posPrintBarcode")}</button>
            <button type="button" onClick={() => nav("/settings")}><Settings size={12} /> {tr("settings")}</button>
            <button type="button" onClick={() => nav("/")}>{tr("posClose")}</button>
            <span className="pos-classic-black-gap" />
            <button type="button" disabled={busy || !cart.length} onClick={() => void holdInvoice()}>{tr("posHold")}</button>
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

      <Modal open={heldOpen} title={tr("heldInvoices")} onClose={() => setHeldOpen(false)} wide>
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
                      <button type="button" className="text-xs font-bold text-cyan-700" onClick={() => { setHeldOpen(false); nav(`/pos?held=${h.id}`); }}>{tr("restoreHeld")}</button>
                      <button type="button" className="ms-2 text-xs font-bold text-rose-600" onClick={() => void cancelHeld(h.id)}>{tr("delete")}</button>
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
              <span className={statusClass(Number(doneInv.remaining) > 0 && Number(doneInv.paid) <= 0 ? "unpaid_sale" : doneInv.status)}>{statusLabel(Number(doneInv.remaining) > 0 && Number(doneInv.paid) <= 0 ? "unpaid_sale" : doneInv.status, lang)}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Btn onClick={() => { nav(`/sales/${doneInv.id}`); setTimeout(() => window.print(), 400); }}>{tr("print")}</Btn>
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
              <Btn onClick={async () => {
                try {
                  await post(`/api/invoices/${retInv.id}/returns`, { items: retItems.filter((x) => x.qty > 0) });
                  playSound("done");
                  await loadToday().catch(() => {});
                  setRetOpen(false);
                  setRetInv(null);
                } catch (e) {
                  playSound("err");
                  setErr(apiMessage(tr, e));
                }
              }}>{tr("save")}</Btn>
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
