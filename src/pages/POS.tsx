import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Minus, Plus, Search, ShoppingBag, X } from "lucide-react";
import { get, post } from "../lib/api";
import { apiMessage } from "../lib/errors";
import { money, num, statusClass, statusLabel } from "../lib/format";
import { Btn, Field, Modal, PrintBtn, Stat, inputCls } from "../components/ui";
import { InvoicePrint } from "../components/InvoicePrint";
import { Barcode } from "../components/Barcode";
import { playSound } from "../lib/sounds";
import { ProductSuggestList } from "../components/ProductSuggest";
import {
  PosHeaderFilter,
  applyPosHeaderFilters,
  uniqueFilterValues,
} from "../components/PosHeaderFilter";
import { usePOSLogic, type Product } from "../hooks/usePOSLogic";

export default function POS() {
  const {
    tr,
    lang,
    lookups,
    can,
    nav,
    quoteMode,
    q,
    setQ,
    cart,
    setCart,
    sel,
    setSel,
    type,
    setType,
    customerQ,
    setCustomerQ,
    customers,
    custListOpen,
    setCustListOpen,
    customer,
    setCustomer,
    walkIn,
    setWalkIn,
    method,
    setMethod,
    cashAccountId,
    setCashAccountId,
    agentId,
    setAgentId,
    salesAgentId,
    setSalesAgentId,
    address,
    setAddress,
    area,
    setArea,
    paid,
    setPaid,
    discount,
    setDiscount,
    discMode,
    setDiscMode,
    invDate,
    setInvDate,
    extrasOpen,
    setExtrasOpen,
    extraAmount,
    setExtraAmount,
    notes,
    setNotes,
    due,
    setDue,
    taxOn,
    setTaxOn,
    taxRate,
    setTaxRate,
    pays,
    setPays,
    held,
    heldOpen,
    setHeldOpen,
    heldTab,
    setHeldTab,
    todayInv,
    todayStats,
    doneOpen,
    setDoneOpen,
    doneInv,
    waOpen,
    setWaOpen,
    waPreview,
    waMsg,
    setWaMsg,
    picked,
    clock,
    listId,
    setListId,
    err,
    setErr,
    busy,
    custOpen,
    setCustOpen,
    retOpen,
    setRetOpen,
    retNo,
    setRetNo,
    retInv,
    setRetInv,
    retItems,
    setRetItems,
    newCust,
    setNewCust,
    qtyField,
    setQtyField,
    priceField,
    setPriceField,
    searchRef,
    customerRef,
    qtyRef,
    priceRef,
    extraRef,
    custBlurRef,
    suggest,
    visible,
    offerDisc,
    pickPrice,
    canSell,
    add,
    addFromSearch,
    clearCart,
    subtotal,
    discAmt,
    taxAmount,
    total,
    creditNeedCustomer,
    printRows,
    printInvoice,
    related,
    waEnabled,
    loadToday,
    setStockTick,
    openHeld,
    cancelHeld,
    finalizeHeld,
    previewWa,
    submit,
    holdInvoice,
  } = usePOSLogic("modern");
  const [cartOpen, setCartOpen] = useState(false);
  const [headerFilters, setHeaderFilters] = useState<Record<string, string>>(
    {},
  );
  const setHeaderFilter = (col: string, v: string) =>
    setHeaderFilters((prev) => ({ ...prev, [col]: v }));
  const catalogRows = useMemo(
    () => applyPosHeaderFilters(visible, headerFilters, lang, pickPrice),
    [visible, headerFilters, lang, pickPrice],
  );
  const extraPriceCols = (["price_2", "price_3", "price_4"] as const).filter(
    (k) => visible.some((p) => Number(p[k])),
  );
  const payMethod = method === "visa" ? "cash" : method;
  useEffect(() => {
    if (method === "visa") setMethod("cash");
  }, [method, setMethod]);
  useEffect(() => {
    if (!cartOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCartOpen(false);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [cartOpen]);
  const cartQty = cart.reduce((s, l) => s + (Number(l.qty) || 0), 0);
  const canBelowMin = can("sales.override_min");
  function setLinePrice(i: number, raw: number) {
    const line = cart[i];
    if (!line) return;
    const min = Number(line.min_selling_price || 0);
    let price = Number.isFinite(raw) ? raw : 0;
    if (min && price < min && !canBelowMin) {
      price = min;
      setErr(tr("errBelowMinPrice"));
    } else {
      setErr("");
    }
    setCart((c) =>
      c.map((x, j) =>
        j === i
          ? { ...x, unit_price: price, discount: offerDisc(x.id, x.qty, price) }
          : x,
      ),
    );
  }

  return (
    <div className="pos-modern flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="print-sheet print-only">
        <InvoicePrint
          inv={printInvoice}
          title={quoteMode ? tr("quoteMode") : tr("invoice")}
        />
      </div>
      <div className="print-only barcode-sheet">
        {printRows.map((l: any) => (
          <Barcode
            key={`${l.id}-bc`}
            value={l.barcode || l.sku}
            label={l.product_name || (lang === "ar" ? l.name_ar : l.name_en)}
            price={money(l.unit_price, lang)}
          />
        ))}
      </div>

      <div className="pos-modern-shell no-print flex h-full min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden lg:flex-row">
        <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--surface-2)] max-lg:pb-[4.75rem]">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-[var(--surface)] px-3 py-2">
            <div className="relative min-w-[12rem] flex-1">
              <Search className="pointer-events-none absolute start-2 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchRef}
                tabIndex={4}
                className={`${inputCls} ps-8`}
                placeholder={tr("searchProduct")}
                value={q}
                autoComplete="off"
                onFocus={() => {
                  suggest.cancelClose();
                  if (q.trim()) suggest.setOpen(true);
                }}
                onBlur={() => suggest.scheduleClose()}
                onChange={(e) => {
                  setQ(e.target.value);
                  suggest.setOpen(true);
                }}
                onKeyDown={(e) => {
                  suggest.onKeyDown(
                    e,
                    (p) => add(p as Product),
                    () => addFromSearch(),
                  );
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
            </div>
            <button
              type="button"
              tabIndex={-1}
              className="relative inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-bold"
              onClick={() => void openHeld()}
            >
              {tr("heldInvoices")}
              {held.length ? (
                <span className="ms-1 rounded-full bg-rose-500 px-1.5 text-[10px] text-white">
                  {held.length}
                </span>
              ) : null}
              <kbd className="ms-1 rounded border border-slate-200 px-1 text-[10px] font-normal text-slate-500">
                {tr("view")}
              </kbd>
            </button>
            <div className="ms-auto text-xs text-slate-500" tabIndex={-1}>
              <b>
                {clock.toLocaleTimeString(lang === "ar" ? "ar-EG" : "en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </b>
            </div>
          </div>
          {related.length ? (
            <div className="gx-related shrink-0 px-3">
              {related.map((p) => (
                <button
                  key={`rel-${p.id}`}
                  type="button"
                  tabIndex={-1}
                  className="gx-related-item"
                  onClick={() => add(p)}
                >
                  <div className="text-xs font-bold">
                    {lang === "ar" ? p.name_ar : p.name_en}
                  </div>
                  <div className="mt-1 text-[11px]">
                    {money(p.selling_price, lang)}
                  </div>
                </button>
              ))}
            </div>
          ) : null}
          <div
            className="min-h-0 w-full min-w-0 flex-1 overflow-auto overscroll-none"
            dir="ltr"
          >
            <table
              className="pos-modern-table w-full text-sm"
              dir={lang === "ar" ? "rtl" : "ltr"}
            >
              <thead className="sticky top-0 z-10">
                <tr className="text-[11px]">
                  <PosHeaderFilter
                    column="name"
                    label={tr("posColName")}
                    values={uniqueFilterValues(
                      visible,
                      "name",
                      lang,
                      pickPrice,
                    )}
                    value={headerFilters.name || ""}
                    onChange={(v) => setHeaderFilter("name", v)}
                  />
                  <th className="text-start font-black">{tr("available")}</th>
                  <PosHeaderFilter
                    column="category"
                    label={tr("posColCategory")}
                    values={uniqueFilterValues(
                      visible,
                      "category",
                      lang,
                      pickPrice,
                    )}
                    value={headerFilters.category || ""}
                    onChange={(v) => setHeaderFilter("category", v)}
                  />
                  <PosHeaderFilter
                    column="partType"
                    label={tr("posColKind")}
                    values={uniqueFilterValues(
                      visible,
                      "partType",
                      lang,
                      pickPrice,
                    )}
                    value={headerFilters.partType || ""}
                    onChange={(v) => setHeaderFilter("partType", v)}
                  />
                  <PosHeaderFilter
                    column="brand"
                    label={tr("posColBrand")}
                    values={uniqueFilterValues(
                      visible,
                      "brand",
                      lang,
                      pickPrice,
                    )}
                    value={headerFilters.brand || ""}
                    onChange={(v) => setHeaderFilter("brand", v)}
                  />
                  <PosHeaderFilter
                    column="sku"
                    label={tr("posColSku")}
                    values={uniqueFilterValues(visible, "sku", lang, pickPrice)}
                    value={headerFilters.sku || ""}
                    onChange={(v) => setHeaderFilter("sku", v)}
                  />
                  <PosHeaderFilter
                    column="warehouse"
                    label={tr("warehouses")}
                    values={uniqueFilterValues(
                      visible,
                      "warehouse",
                      lang,
                      pickPrice,
                    )}
                    value={headerFilters.warehouse || ""}
                    onChange={(v) => setHeaderFilter("warehouse", v)}
                  />
                  <PosHeaderFilter
                    column="box"
                    label={tr("kindBay")}
                    values={uniqueFilterValues(visible, "box", lang, pickPrice)}
                    value={headerFilters.box || ""}
                    onChange={(v) => setHeaderFilter("box", v)}
                  />
                  <PosHeaderFilter
                    column="shelf"
                    label={tr("shelf")}
                    values={uniqueFilterValues(
                      visible,
                      "shelf",
                      lang,
                      pickPrice,
                    )}
                    value={headerFilters.shelf || ""}
                    onChange={(v) => setHeaderFilter("shelf", v)}
                  />
                  <PosHeaderFilter
                    column="selling"
                    label={tr("sellingPrice")}
                    values={uniqueFilterValues(
                      visible,
                      "selling",
                      lang,
                      pickPrice,
                    )}
                    value={headerFilters.selling || ""}
                    onChange={(v) => setHeaderFilter("selling", v)}
                  />
                  <PosHeaderFilter
                    column="min"
                    label={tr("posColMinPrice")}
                    values={uniqueFilterValues(visible, "min", lang, pickPrice)}
                    value={headerFilters.min || ""}
                    onChange={(v) => setHeaderFilter("min", v)}
                  />
                  <PosHeaderFilter
                    column="wholesale"
                    label={tr("wholesale")}
                    values={uniqueFilterValues(
                      visible,
                      "wholesale",
                      lang,
                      pickPrice,
                    )}
                    value={headerFilters.wholesale || ""}
                    onChange={(v) => setHeaderFilter("wholesale", v)}
                  />
                  {extraPriceCols.map((k) => (
                    <th key={k} className="text-start font-black">
                      {k.replace("price_", "#")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {catalogRows.map((p) => {
                  const sell = canSell(p);
                  return (
                    <tr
                      key={p.id}
                      tabIndex={-1}
                      onClick={() => {
                        if (sell) add(p);
                        else playSound("err");
                      }}
                      className={`cursor-pointer ${sell ? "" : "is-oos cursor-not-allowed"} ${picked === p.id ? "ring-2 ring-inset ring-[var(--ink)]" : ""}`}
                    >
                      <td className="font-bold">
                        {lang === "ar" ? p.name_ar : p.name_en}
                      </td>
                      <td
                        className={`font-black ${sell ? "" : "text-rose-500"}`}
                      >
                        {p.kind === "service" || p.non_stock
                          ? "∞"
                          : num(p.available, lang)}
                      </td>
                      <td className="text-slate-500">{p.quality || "—"}</td>
                      <td className="text-slate-500">
                        {(lang === "ar" ? p.part_type_ar : p.part_type_en) ||
                          p.part_type_ar ||
                          "—"}
                      </td>
                      <td className="text-slate-500">
                        {(lang === "ar" ? p.brand_ar : p.brand_en) ||
                          p.brand_ar ||
                          "—"}
                      </td>
                      <td className="font-mono text-xs text-slate-500">
                        {[p.sku, p.barcode].filter(Boolean).join(" / ") || "—"}
                      </td>
                      <td className="text-slate-500">
                        {p.warehouse || p.location_name || "—"}
                      </td>
                      <td className="text-slate-500">{p.box || "—"}</td>
                      <td className="text-slate-500">{p.shelf || "—"}</td>
                      <td className="is-sell">{money(pickPrice(p), lang)}</td>
                      <td>
                        {p.min_selling_price
                          ? money(p.min_selling_price, lang)
                          : "—"}
                      </td>
                      <td>
                        {p.wholesale_price
                          ? money(p.wholesale_price, lang)
                          : "—"}
                      </td>
                      {extraPriceCols.map((k) => (
                        <td key={k}>
                          {Number(p[k]) ? money(Number(p[k]), lang) : "—"}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!catalogRows.length ? (
              <div className="py-16 text-center text-sm text-slate-400">
                {tr("noResults")}
              </div>
            ) : null}
          </div>
        </section>

        {cartOpen ? (
          <button
            type="button"
            className="pos-cart-backdrop lg:hidden"
            aria-label={tr("close")}
            onClick={() => setCartOpen(false)}
          />
        ) : null}
        <aside
          className={`pos-cart-panel flex h-full flex-1 min-h-0 w-full flex-col overflow-hidden overscroll-none border-s border-slate-200 bg-[var(--surface)] lg:w-96 lg:min-w-[350px] lg:max-w-sm lg:shrink-0 lg:flex-none ${cartOpen ? "is-open" : ""}`}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-3 py-2 lg:hidden">
            <div className="text-sm font-black">{tr("posCurrentCart")}</div>
            <button
              type="button"
              className="rounded-lg p-2"
              aria-label={tr("close")}
              onClick={() => setCartOpen(false)}
            >
              <X size={18} />
            </button>
          </div>
          <div className="relative z-30 shrink-0 space-y-2 overflow-visible border-b border-slate-200 p-3">
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <input
                  ref={customerRef}
                  tabIndex={1}
                  className={`${inputCls} pe-16`}
                  placeholder={tr("posFieldCustomer")}
                  value={customer ? customer.name : customerQ}
                  autoComplete="off"
                  onFocus={() => {
                    window.clearTimeout(custBlurRef.current);
                    setCustListOpen(true);
                  }}
                  onChange={(e) => {
                    window.clearTimeout(custBlurRef.current);
                    setCustomer(null);
                    setCustomerQ(e.target.value);
                    setWalkIn(e.target.value);
                    setCustListOpen(true);
                  }}
                  onBlur={() => {
                    custBlurRef.current = window.setTimeout(
                      () => setCustListOpen(false),
                      200,
                    );
                  }}
                />
                <span className="absolute end-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5 text-slate-400">
                  {customer ? (
                    <button
                      type="button"
                      tabIndex={-1}
                      className="rounded p-1"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setCustomer(null);
                        setCustomerQ("");
                        setWalkIn("");
                        setCustListOpen(true);
                        customerRef.current?.focus();
                      }}
                    >
                      <X size={14} />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    tabIndex={-1}
                    className="rounded p-1"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setCustListOpen((v) => !v);
                      customerRef.current?.focus();
                    }}
                  >
                    <ChevronDown size={14} />
                  </button>
                </span>
                {custListOpen ? (
                  <div className="absolute start-0 end-0 z-50 mt-1 max-h-56 overflow-auto rounded-xl border border-slate-200 bg-[var(--surface)] text-[var(--ink)] shadow-lg">
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-start text-sm hover:bg-[var(--surface-2)]"
                      onMouseDown={(e) => e.preventDefault()}
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
                        className="block w-full px-3 py-2 text-start text-sm hover:bg-[var(--surface-2)]"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setCustomer(c);
                          setCustomerQ("");
                          setWalkIn("");
                          setAddress(c.address || "");
                          setArea(c.area || "");
                          if (c.price_list_id)
                            setListId(Number(c.price_list_id));
                          setCustListOpen(false);
                        }}
                      >
                        <div className="font-bold">{c.name}</div>
                        <div className="text-[11px] text-slate-500">
                          {[c.phone, c.area, c.city]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      </button>
                    ))}
                    {!customers.length ? (
                      <div className="px-3 py-3 text-sm text-slate-400">
                        {tr("noResults")}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                tabIndex={-1}
                className="shrink-0 rounded-xl border border-slate-200 px-2 text-xs font-bold"
                onClick={() => setCustOpen(true)}
              >
                + {tr("new")}
              </button>
            </div>
            <div className="flex w-full flex-col gap-2">
              <button
                type="button"
                tabIndex={-1}
                className={`w-fit whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold ${type === "delivery" ? "bg-[var(--ink)] text-white" : "border border-slate-200 bg-[var(--surface)]"}`}
                onClick={() =>
                  setType(type === "delivery" ? "normal" : "delivery")
                }
              >
                {tr("deliverySale")}
              </button>
              {type === "delivery" ? (
                <div className="flex w-full items-center gap-2">
                  <select
                    tabIndex={2}
                    className={`${inputCls} min-w-0 flex-1`}
                    value={agentId}
                    onChange={(e) =>
                      setAgentId(e.target.value ? Number(e.target.value) : "")
                    }
                  >
                    <option value="">{tr("agent")}</option>
                    {(lookups?.delivery_agents || [])
                      .filter(
                        (a) =>
                          !a.role_type ||
                          a.role_type === "delivery" ||
                          a.role_type === "both",
                      )
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                  <input
                    tabIndex={3}
                    className={`${inputCls} w-24 shrink-0`}
                    type="number"
                    placeholder={tr("deliveryFee")}
                    value={extraAmount}
                    onChange={(e) => setExtraAmount(Number(e.target.value))}
                  />
                </div>
              ) : null}
            </div>

            <div className="flex gap-1 overflow-x-auto">
              <button
                type="button"
                className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${listId === "" ? "bg-[var(--ink)] text-white" : "border border-slate-200"}`}
                onClick={() => setListId("")}
              >
                {tr("priceList")}
              </button>
              {(lookups?.price_lists || []).map((l) => (
                <button
                  key={l.id}
                  type="button"
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${listId === l.id ? "bg-[var(--ink)] text-white" : "border border-slate-200"}`}
                  onClick={() => setListId(l.id)}
                >
                  {lang === "ar" ? l.name : l.name_en || l.name}
                </button>
              ))}
            </div>
          </div>
          <div className="pos-cart-scroll flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
            <div className="flex min-h-full flex-col">
              <div className="flex-1 p-3">
                {cart.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-8 text-slate-400">
                    <ShoppingBag size={36} />
                    <div className="text-sm font-bold">{tr("cartEmpty")}</div>
                    <div className="text-xs">{tr("emptyCart")}</div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {cart.map((l, i) => (
                      <div
                        key={`${l.id}-${l.unit_name}-${i}`}
                        className={`rounded-xl border px-3 py-2 ${sel === i ? "border-[var(--ink)]" : "border-slate-200"}`}
                        onClick={() => setSel(i)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-bold">
                              {lang === "ar" ? l.name_ar : l.name_en}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {l.sku}
                              {l.unit_name ? ` · ${l.unit_name}` : ""}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="text-rose-500"
                            onClick={() =>
                              setCart((c) => c.filter((_, j) => j !== i))
                            }
                          >
                            <X size={14} />
                          </button>
                        </div>
                        {l.track_serial ? (
                          <input
                            className={`${inputCls} mt-1`}
                            placeholder={tr("serials")}
                            value={l.serials.join(",")}
                            onChange={(e) =>
                              setCart((c) =>
                                c.map((x, j) =>
                                  j === i
                                    ? {
                                        ...x,
                                        serials: e.target.value
                                          .split(/[,]+/)
                                          .map((s) => s.trim())
                                          .filter(Boolean),
                                      }
                                    : x,
                                ),
                              )
                            }
                          />
                        ) : null}
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              className="rounded-lg border p-1"
                              onClick={() =>
                                setCart((c) =>
                                  c.map((x, j) => {
                                    if (j !== i) return x;
                                    const qty = Math.max(1, x.qty - 1);
                                    return {
                                      ...x,
                                      qty,
                                      discount: offerDisc(
                                        x.id,
                                        qty,
                                        x.unit_price,
                                      ),
                                    };
                                  }),
                                )
                              }
                            >
                              <Minus size={12} />
                            </button>
                            <span className="w-8 text-center text-sm font-black">
                              {l.qty}
                            </span>
                            <button
                              type="button"
                              className="rounded-lg border p-1"
                              onClick={() =>
                                setCart((c) =>
                                  c.map((x, j) => {
                                    if (j !== i) return x;
                                    const cap =
                                      x.kind === "service" || x.non_stock
                                        ? 9999
                                        : Math.max(1, Number(x.available) || 1);
                                    const qty = Math.min(x.qty + 1, cap);
                                    return {
                                      ...x,
                                      qty,
                                      discount: offerDisc(
                                        x.id,
                                        qty,
                                        x.unit_price,
                                      ),
                                    };
                                  }),
                                )
                              }
                            >
                              <Plus size={12} />
                            </button>
                          </div>
                          <input
                            className={`${inputCls} w-24 py-1 text-end`}
                            type="number"
                            min={
                              canBelowMin ? 0 : Number(l.min_selling_price || 0)
                            }
                            value={l.unit_price}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              const price = Number(e.target.value);
                              setCart((c) =>
                                c.map((x, j) =>
                                  j === i
                                    ? {
                                        ...x,
                                        unit_price: Number.isFinite(price)
                                          ? price
                                          : 0,
                                        discount: offerDisc(
                                          x.id,
                                          x.qty,
                                          Number.isFinite(price) ? price : 0,
                                        ),
                                      }
                                    : x,
                                ),
                              );
                            }}
                            onBlur={() => setLinePrice(i, Number(l.unit_price))}
                            title={
                              l.min_selling_price
                                ? `${tr("posColMinPrice")}: ${l.min_selling_price}`
                                : tr("sellingPrice")
                            }
                          />
                          <div className="text-sm font-black">
                            {money(l.qty * l.unit_price - l.discount, lang)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="mt-auto shrink-0 space-y-2 border-t border-slate-200 bg-[var(--surface)] p-3">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span>{tr("subtotal")}</span>
                  <span className="font-bold">{money(subtotal, lang)}</span>
                </div>
                {can("sales.discount") ? (
                  <div className="flex w-full flex-wrap items-center gap-2">
                    <span className="shrink-0 text-xs font-bold">
                      {tr("discount")}
                    </span>
                    <input
                      tabIndex={5}
                      className={`${inputCls} w-20 min-w-0 shrink-0`}
                      type="number"
                      value={discount}
                      onChange={(e) => setDiscount(Number(e.target.value))}
                    />
                    <button
                      type="button"
                      className={`shrink-0 whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-bold ${discMode === "egp" ? "bg-[var(--ink)] text-white" : "border"}`}
                      onClick={() => setDiscMode("egp")}
                    >
                      {tr("discountEgp")}
                    </button>
                    <button
                      type="button"
                      className={`shrink-0 whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-bold ${discMode === "pct" ? "bg-[var(--ink)] text-white" : "border"}`}
                      onClick={() => setDiscMode("pct")}
                    >
                      %
                    </button>
                    <span className="ms-auto shrink-0 text-xs text-slate-500">
                      {money(discAmt, lang)}
                    </span>
                  </div>
                ) : null}
                {type === "delivery" ? (
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span>{tr("deliveryFee")}</span>
                    <span className="font-bold">
                      {money(Number(extraAmount || 0), lang)}
                    </span>
                  </div>
                ) : null}
                {taxOn ? (
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span>{tr("taxAmount")}</span>
                    <span>{money(taxAmount, lang)}</span>
                  </div>
                ) : null}
                <div className="flex items-end justify-between gap-2">
                  <span className="text-sm font-bold">{tr("total")}</span>
                  <span className="text-2xl font-black">
                    {money(total, lang)}
                  </span>
                </div>
                <div className="flex w-full gap-2">
                  <button
                    type="button"
                    tabIndex={6}
                    className={`min-w-0 flex-1 whitespace-nowrap rounded-xl py-1.5 text-xs font-bold ${payMethod === "cash" ? "bg-[var(--ink)] text-white" : "border border-slate-200"}`}
                    onClick={() => setMethod("cash")}
                  >
                    {tr("posPayCash")}{" "}
                    <kbd className="ms-1 rounded border border-white/30 px-1 text-[10px] font-normal">
                      6
                    </kbd>
                  </button>
                  <button
                    type="button"
                    tabIndex={7}
                    className={`min-w-0 flex-1 whitespace-nowrap rounded-xl py-1.5 text-xs font-bold ${payMethod === "credit" ? "bg-[var(--ink)] text-white" : "border border-slate-200"}`}
                    onClick={() => setMethod("credit")}
                  >
                    {tr("posPayCredit")}{" "}
                    <kbd className="ms-1 rounded border border-slate-200 px-1 text-[10px] font-normal">
                      7
                    </kbd>
                  </button>
                </div>
                <label className="flex w-full items-center justify-between gap-2 text-xs">
                  <span className="shrink-0">{tr("invoiceDate")}</span>
                  <input
                    className={`${inputCls} min-w-0 flex-1`}
                    type="date"
                    value={invDate}
                    onChange={(e) => {
                      setInvDate(e.target.value);
                      if (method === "credit") setDue(e.target.value);
                    }}
                  />
                </label>
                {method === "credit" ? (
                  <label className="flex w-full items-center justify-between gap-2 text-xs">
                    <span className="shrink-0">{tr("dueDate")}</span>
                    <input
                      className={`${inputCls} min-w-0 flex-1`}
                      type="date"
                      value={due}
                      onChange={(e) => setDue(e.target.value)}
                    />
                  </label>
                ) : null}
                {err ? (
                  <div className="text-sm text-rose-600">{err}</div>
                ) : null}
                <div className="grid w-full grid-cols-1 gap-2">
                  <Btn
                    kind="ghost"
                    className="w-full whitespace-nowrap"
                    disabled={busy || !cart.length}
                    onClick={holdInvoice}
                  >
                    {tr("posHold")}
                  </Btn>
                  <Btn
                    className="gx-confirm w-full whitespace-nowrap"
                    disabled={
                      busy ||
                      !cart.length ||
                      !can("sales.create") ||
                      creditNeedCustomer
                    }
                    onClick={() => submit({ print: true })}
                  >
                    {quoteMode ? tr("quoteMode") : tr("confirmSale")}
                  </Btn>
                  <Btn
                    className="gx-quiet w-full whitespace-nowrap"
                    disabled={
                      busy ||
                      !cart.length ||
                      !can("sales.create") ||
                      creditNeedCustomer
                    }
                    onClick={() => submit()}
                  >
                    {tr("saleWithoutPrint")}
                  </Btn>
                </div>
              </div>
            </div>
          </div>
        </aside>
        <button
          type="button"
          className="pos-cart-bar lg:hidden"
          onClick={() => setCartOpen(true)}
        >
          <span className="inline-flex items-center gap-2">
            <ShoppingBag size={18} />
            <span className="font-black">{tr("cart")}</span>
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">
              {num(cartQty, lang)}
            </span>
          </span>
          <span className="text-base font-black">{money(total, lang)}</span>
        </button>
      </div>

      <Modal
        open={extrasOpen}
        title={tr("posMore")}
        onClose={() => setExtrasOpen(false)}
        wide
      >
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Stat
              label={tr("salesToday")}
              value={money(todayStats.sales_today, lang)}
              hint={`${num(todayStats.invoices_today, lang)} ${tr("invoicesCount")}`}
            />
            <Stat
              label={tr("collected")}
              value={money(todayStats.collected_today, lang)}
              accent="emerald"
            />
            <Stat
              label={tr("accountCredit")}
              value={money(todayStats.credit_today, lang)}
              accent="rose"
            />
          </div>
          <div>
            <div className="mb-2 text-sm font-bold">
              {tr("todayTransactions")}
            </div>
            {!todayInv.length ? (
              <div className="text-sm text-slate-400">{tr("noData")}</div>
            ) : (
              <div className="max-h-32 space-y-1 overflow-auto">
                {todayInv.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-start text-sm"
                    onClick={() => nav(`/sales/${h.id}`)}
                  >
                    <span>
                      {h.number} · {h.customer_name || tr("walkIn")} ·{" "}
                      {statusLabel(h.status, lang)}
                    </span>
                    <span className="font-bold">{money(h.total, lang)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <label className="text-xs">
              <span className="mb-1 block font-bold">{tr("qty")} F5</span>
              <input
                ref={qtyRef}
                className={inputCls}
                type="number"
                min={1}
                value={qtyField}
                onChange={(e) => setQtyField(Number(e.target.value) || 1)}
              />
            </label>
            <label className="text-xs">
              <span className="mb-1 block font-bold">
                {tr("sellingPrice")} F6
              </span>
              <input
                ref={priceRef}
                className={inputCls}
                value={priceField}
                onChange={(e) => setPriceField(e.target.value)}
              />
            </label>
            <label className="text-xs">
              <span className="mb-1 block font-bold">{tr("posExtra")} F7</span>
              <input
                ref={extraRef}
                className={inputCls}
                type="number"
                value={extraAmount}
                onChange={(e) => setExtraAmount(Number(e.target.value))}
              />
            </label>
            <label className="text-xs">
              <span className="mb-1 block font-bold">{tr("tax")} %</span>
              <span className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={taxOn}
                  onChange={(e) => setTaxOn(e.target.checked)}
                />
                <input
                  className={inputCls}
                  type="number"
                  value={taxRate}
                  onChange={(e) => setTaxRate(Number(e.target.value))}
                />
              </span>
            </label>
            <label className="text-xs">
              <span className="mb-1 block font-bold">{tr("notes")}</span>
              <input
                className={inputCls}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
            <label className="text-xs">
              <span className="mb-1 block font-bold">{tr("salesAgent")}</span>
              <select
                className={inputCls}
                value={salesAgentId}
                onChange={(e) =>
                  setSalesAgentId(e.target.value ? Number(e.target.value) : "")
                }
              >
                <option value="">-</option>
                {(lookups?.delivery_agents || [])
                  .filter(
                    (a) =>
                      !a.role_type ||
                      a.role_type === "sales" ||
                      a.role_type === "both",
                  )
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </label>
            {method === "cash" || method === "treasury" ? (
              <label className="text-xs">
                <span className="mb-1 block font-bold">
                  {tr("cashAccount")}
                </span>
                <select
                  className={inputCls}
                  value={cashAccountId}
                  onChange={(e) =>
                    setCashAccountId(
                      e.target.value ? Number(e.target.value) : "",
                    )
                  }
                >
                  <option value="">-</option>
                  {(lookups?.cash_accounts || []).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {method === "credit" || type === "delivery" ? (
              <label className="text-xs">
                <span className="mb-1 block font-bold">{tr("paid")}</span>
                <input
                  className={inputCls}
                  type="number"
                  value={paid}
                  onChange={(e) => setPaid(Number(e.target.value))}
                />
              </label>
            ) : null}
          </div>
          <div>
            <div className="mb-1 text-xs font-bold">{tr("splitPay")}</div>
            {pays.map((p, i) => (
              <div key={i} className="mb-1 flex gap-2">
                <select
                  className={inputCls}
                  value={p.method}
                  onChange={(e) =>
                    setPays(
                      pays.map((x, j) =>
                        j === i ? { ...x, method: e.target.value } : x,
                      ),
                    )
                  }
                >
                  <option value="cash">{tr("posPayCash")}</option>
                  <option value="visa">{tr("posPayCard")}</option>
                  <option value="treasury">{tr("posPayTreasury")}</option>
                </select>
                <input
                  className={inputCls}
                  type="number"
                  value={p.amount}
                  onChange={(e) =>
                    setPays(
                      pays.map((x, j) =>
                        j === i ? { ...x, amount: Number(e.target.value) } : x,
                      ),
                    )
                  }
                />
              </div>
            ))}
            <button
              type="button"
              className="text-xs font-bold text-cyan-700"
              onClick={() => setPays([...pays, { method: "cash", amount: 0 }])}
            >
              {tr("addPayment")}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Btn
              kind="soft"
              disabled={busy || !cart.length || !can("sales.create")}
              onClick={() => submit({ paid: total, method: "cash" })}
            >
              {tr("payNow")}
            </Btn>
            <PrintBtn />
            <Btn
              kind="ghost"
              disabled={busy || !cart.length}
              onClick={() => submit({ quote: true })}
            >
              {tr("reserveQuote")}
            </Btn>
            <Btn
              kind="ghost"
              disabled={busy || !cart.length}
              onClick={() => submit({ order: true })}
            >
              {tr("saveOrder")}
            </Btn>
            <Btn kind="ghost" onClick={clearCart}>
              {tr("posClear")} F4
            </Btn>
            {can("returns.create") ? (
              <Btn
                kind="ghost"
                onClick={() => {
                  setExtrasOpen(false);
                  setRetOpen(true);
                }}
              >
                {tr("returnFromInvoice")}
              </Btn>
            ) : null}
          </div>
        </div>
      </Modal>

      <Modal
        open={heldOpen}
        title={tr("heldInvoices")}
        onClose={() => setHeldOpen(false)}
        xl
      >
        <div className="mb-3 flex flex-wrap gap-1">
          {(
            [
              ["held", tr("heldInvoices")],
              ["print", tr("heldPrint")],
              ["wa", tr("whatsapp")],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`period-chip ${heldTab === id ? "is-on" : ""}`}
              onClick={() => setHeldTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {err ? (
          <div className="mb-3 text-sm font-bold text-rose-500">{err}</div>
        ) : null}
        {heldTab === "held" ? (
          <div className="table-wrap">
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
                    <td className="font-bold">{money(h.total, lang)}</td>
                    <td>{statusLabel(h.status, lang)}</td>
                    <td>
                      <div className="held-act">
                        <button
                          type="button"
                          className="is-pay"
                          disabled={busy || !can("sales.create")}
                          onClick={() => void finalizeHeld(h.id, "pay")}
                        >
                          {tr("completeHeldPay")}
                        </button>
                        <button
                          type="button"
                          className="is-credit"
                          disabled={busy || !can("sales.create")}
                          onClick={() => void finalizeHeld(h.id, "credit")}
                        >
                          {tr("completeHeldCredit")}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setHeldOpen(false);
                            nav(`/pos?held=${h.id}`);
                          }}
                        >
                          {tr("restoreHeld")}
                        </button>
                        <button
                          type="button"
                          onClick={() => nav(`/sales/${h.id}`)}
                        >
                          {tr("preview")}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setHeldOpen(false);
                            nav(`/sales/${h.id}`);
                            setTimeout(() => window.print(), 400);
                          }}
                        >
                          {tr("print")}
                        </button>
                        <button
                          type="button"
                          disabled={!waEnabled || !can("whatsapp.send")}
                          onClick={() => void previewWa(h.id)}
                        >
                          {tr("whatsapp")}
                        </button>
                        <button
                          type="button"
                          className="is-del"
                          onClick={() => void cancelHeld(h.id)}
                        >
                          {tr("delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!held.length ? (
              <div className="p-3 text-sm text-slate-400">{tr("noData")}</div>
            ) : null}
          </div>
        ) : (
          <>
            {(todayInv || []).map((h) => (
              <div
                key={`${heldTab}-${h.id}`}
                className="mb-2 flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm"
              >
                <div>
                  {h.number} · {h.customer_name || tr("walkIn")} ·{" "}
                  {money(h.total, lang)}
                </div>
                {heldTab === "print" ? (
                  <button
                    type="button"
                    className="font-bold text-cyan-700"
                    onClick={() => {
                      setHeldOpen(false);
                      nav(`/sales/${h.id}`);
                      setTimeout(() => window.print(), 400);
                    }}
                  >
                    {tr("print")}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="font-bold text-emerald-700"
                    disabled={!waEnabled || !can("whatsapp.send")}
                    onClick={() => void previewWa(h.id)}
                  >
                    {tr("whatsapp")}
                  </button>
                )}
              </div>
            ))}
            {!todayInv.length ? (
              <div className="text-sm text-slate-400">{tr("noData")}</div>
            ) : null}
          </>
        )}
      </Modal>
      <Modal
        open={doneOpen}
        title={tr("saleDone")}
        onClose={() => setDoneOpen(false)}
      >
        {doneInv ? (
          <div className="space-y-3">
            <div className="text-lg font-black">{doneInv.number}</div>
            <div className="text-sm text-slate-500">
              {doneInv.customer_name || tr("walkIn")} ·{" "}
              {money(doneInv.total, lang)}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span
                className={statusClass(
                  Number(doneInv.remaining) > 0 && Number(doneInv.paid) <= 0
                    ? "unpaid_sale"
                    : doneInv.status,
                )}
              >
                {statusLabel(
                  Number(doneInv.remaining) > 0 && Number(doneInv.paid) <= 0
                    ? "unpaid_sale"
                    : doneInv.status,
                  lang,
                )}
              </span>
              <span>
                {tr("paid")}: {money(doneInv.paid, lang)}
              </span>
              <span>
                {tr("remaining")}: {money(doneInv.remaining, lang)}
              </span>
            </div>
            <div className="print-sheet max-h-[50vh] overflow-auto rounded-2xl border border-slate-100 bg-white p-4">
              <InvoicePrint
                inv={
                  printInvoice.number
                    ? printInvoice
                    : { ...printInvoice, ...doneInv }
                }
                screen
                title={quoteMode ? tr("quoteMode") : tr("invoice")}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Btn onClick={() => window.print()}>{tr("print")}</Btn>
              {waEnabled && can("whatsapp.send") ? (
                <Btn kind="soft" onClick={() => void previewWa(doneInv.id)}>
                  {tr("sendWhatsapp")}
                </Btn>
              ) : null}
              <Btn kind="ghost" onClick={() => setDoneOpen(false)}>
                {tr("continueSale")}
              </Btn>
            </div>
          </div>
        ) : null}
      </Modal>
      <Modal
        open={waOpen}
        title={tr("previewWhatsapp")}
        onClose={() => setWaOpen(false)}
        wide
      >
        <textarea
          className={`${inputCls} min-h-40`}
          value={waMsg}
          onChange={(e) => setWaMsg(e.target.value)}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <Btn
            onClick={async () => {
              const phone = waPreview?.phone;
              if (!phone || !waPreview?.invoice_id) return;
              const intl = String(phone).replace(/\D/g, "").replace(/^0/, "20");
              const link = `https://wa.me/${intl}?text=${encodeURIComponent(waMsg)}`;
              await post(
                `/api/invoices/${waPreview.invoice_id}/whatsapp/opened`,
                { type: waPreview.type, message: waMsg, phone },
              );
              window.open(link, "_blank");
            }}
          >
            {tr("openWhatsapp")}
          </Btn>
          <Btn kind="ghost" onClick={() => setWaOpen(false)}>
            {tr("cancel")}
          </Btn>
        </div>
      </Modal>
      <Modal
        open={custOpen}
        title={tr("addCustomer")}
        onClose={() => setCustOpen(false)}
      >
        <div className="space-y-3">
          <input
            className={inputCls}
            placeholder={tr("name")}
            value={newCust.name}
            onChange={(e) => setNewCust({ ...newCust, name: e.target.value })}
          />
          <input
            className={inputCls}
            placeholder={tr("phone")}
            value={newCust.phone}
            onChange={(e) => setNewCust({ ...newCust, phone: e.target.value })}
          />
          <input
            className={inputCls}
            placeholder={tr("address")}
            value={newCust.address}
            onChange={(e) =>
              setNewCust({ ...newCust, address: e.target.value })
            }
          />
          <input
            className={inputCls}
            placeholder={tr("area")}
            value={newCust.area}
            onChange={(e) => setNewCust({ ...newCust, area: e.target.value })}
          />
          {err ? <div className="text-sm text-rose-600">{err}</div> : null}
          <Btn
            onClick={async () => {
              if (!newCust.name.trim()) {
                setErr(tr("errNameRequired"));
                return;
              }
              try {
                const r = await post<{ id: number }>("/api/customers", newCust);
                setCustomer({ id: r.id, ...newCust, whatsapp: newCust.phone });
                setCustOpen(false);
                setErr("");
              } catch (e) {
                setErr(apiMessage(tr, e));
              }
            }}
          >
            {tr("save")}
          </Btn>
        </div>
      </Modal>
      <Modal
        open={retOpen}
        title={tr("returnFromInvoice")}
        onClose={() => {
          setRetOpen(false);
          setRetInv(null);
        }}
      >
        <div className="space-y-3">
          <Field label={tr("invoiceNo")}>
            <input
              className={inputCls}
              value={retNo}
              onChange={(e) => setRetNo(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key !== "Enter" || !retNo.trim()) return;
                const list = await get<{ data: any[] }>(
                  `/api/invoices?q=${encodeURIComponent(retNo.trim())}&pageSize=5`,
                );
                const hit =
                  (list.data || []).find(
                    (x) => String(x.number) === retNo.trim(),
                  ) || list.data?.[0];
                if (!hit) {
                  playSound("err");
                  return;
                }
                playSound("ok");
                const full = await get<{ data: any }>(
                  `/api/invoices/${hit.id}`,
                );
                if (
                  [
                    "cancelled",
                    "fully_returned",
                    "held",
                    "quote",
                    "order",
                  ].includes(full.data.status)
                ) {
                  playSound("err");
                  setErr(tr("errCannotReturn"));
                  setRetInv(null);
                  return;
                }
                setErr("");
                setRetInv(full.data);
                setRetItems(
                  (full.data.items || []).map((i: any) => ({
                    invoice_item_id: i.id,
                    qty: 0,
                    max: i.quantity - (i.returned_qty || 0),
                    name: i.product_name,
                  })),
                );
              }}
            />
          </Field>
          {retInv ? (
            <>
              <div className="text-sm font-bold">
                {retInv.number} · {retInv.customer_name || tr("walkIn")}
              </div>
              {retItems.map((i) => (
                <div
                  key={i.invoice_item_id}
                  className="flex items-center justify-between gap-2"
                >
                  <span>{i.name}</span>
                  <input
                    className={`${inputCls} w-24`}
                    type="number"
                    min={0}
                    max={i.max}
                    value={i.qty}
                    onChange={(e) => {
                      const qty = Math.max(
                        0,
                        Math.min(i.max, Number(e.target.value) || 0),
                      );
                      setRetItems(
                        retItems.map((x) =>
                          x.invoice_item_id === i.invoice_item_id
                            ? { ...x, qty }
                            : x,
                        ),
                      );
                    }}
                  />
                </div>
              ))}
              <Btn
                onClick={async () => {
                  try {
                    await post(`/api/invoices/${retInv.id}/returns`, {
                      items: retItems.filter((x) => x.qty > 0),
                    });
                    playSound("done");
                    setStockTick((n) => n + 1);
                    await loadToday().catch(() => {});
                    setRetOpen(false);
                    setRetInv(null);
                    setErr("");
                  } catch (e) {
                    playSound("err");
                    setErr(apiMessage(tr, e));
                  }
                }}
              >
                {tr("save")}
              </Btn>
            </>
          ) : (
            <div className="text-xs text-slate-400">{tr("invoiceNo")}</div>
          )}
          {err ? <div className="text-sm text-rose-600">{err}</div> : null}
        </div>
      </Modal>
    </div>
  );
}
