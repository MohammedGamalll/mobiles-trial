import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Check, Search, ShoppingBag } from "lucide-react";
import { useApp } from "../context";
import { get, post } from "../lib/api";
import { apiMessage } from "../lib/errors";
import { money, num, statusClass, statusLabel } from "../lib/format";
import { Btn, Field, Modal, PixelMark, PrintBtn, PrintLetterhead, inputCls } from "../components/ui";
import { Barcode } from "../components/Barcode";
import { playSound } from "../lib/sounds";

type Unit = { id?: number; name: string; factor: number; barcode?: string; selling_price: number; is_base?: number };

type Product = {
  id: number;
  name_ar: string;
  name_en: string;
  sku: string;
  barcode?: string;
  extra_code1?: string;
  extra_code2?: string;
  selling_price: number;
  wholesale_price: number;
  min_selling_price: number;
  price_2?: number;
  price_3?: number;
  price_4?: number;
  discount_pct?: number;
  available: number;
  stock_status: string;
  brand_id?: number;
  brand_ar?: string;
  brand_en?: string;
  part_type_id?: number;
  part_type_ar?: string;
  part_type_en?: string;
  category_ar?: string;
  category_en?: string;
  location_name?: string;
  warehouse?: string;
  rack?: string;
  shelf?: string;
  drawer?: string;
  box?: string;
  current_stock?: number;
  reserved_stock?: number;
  purchase_price?: number;
  models?: { name: string }[];
  kind?: string;
  track_serial?: number;
  no_qty?: number;
  quick_list?: number;
  non_stock?: number;
  unit?: string;
  units?: Unit[];
  image_url?: string;
};

type Line = Product & {
  qty: number;
  unit_price: number;
  discount: number;
  batch_id: number | null;
  serials: string[];
  unit_name: string;
  unit_factor: number;
};

export default function POS() {
  const { tr, lang, lookups, can, settings, branchId, warehouseId } = useApp();
  const showCost = can("costs.view");
  const nav = useNavigate();
  const [params] = useSearchParams();
  const quoteMode = params.get("mode") === "quote";
  const [q, setQ] = useState("");
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [typeFilter, setTypeFilter] = useState<number | "">("");
  const [kindFilter, setKindFilter] = useState<"" | "product" | "service">("");
  const [cart, setCart] = useState<Line[]>([]);
  const [sel, setSel] = useState(0);
  const [type, setType] = useState<"normal" | "delivery">("normal");
  const [customerQ, setCustomerQ] = useState("");
  const [customers, setCustomers] = useState<any[]>([]);
  const [customer, setCustomer] = useState<any>(null);
  const [walkIn, setWalkIn] = useState("");
  const [method, setMethod] = useState("cash");
  const [cashAccountId, setCashAccountId] = useState<number | "">("");
  const [agentId, setAgentId] = useState<number | "">("");
  const [salesAgentId, setSalesAgentId] = useState<number | "">("");
  const [address, setAddress] = useState("");
  const [area, setArea] = useState("");
  const [time, setTime] = useState("");
  const [paid, setPaid] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [extraAmount, setExtraAmount] = useState(0);
  const [notes, setNotes] = useState("");
  const [due, setDue] = useState("");
  const [taxOn, setTaxOn] = useState(settings.tax_enabled === "1");
  const [taxRate, setTaxRate] = useState(Number(settings.tax_rate || 14));
  const [pays, setPays] = useState<{ method: string; amount: number }[]>([]);
  const [held, setHeld] = useState<any[]>([]);
  const [heldOpen, setHeldOpen] = useState(false);
  const [heldTab, setHeldTab] = useState<"held" | "print" | "wa">("held");
  const [todayInv, setTodayInv] = useState<any[]>([]);
  const [doneOpen, setDoneOpen] = useState(false);
  const [doneInv, setDoneInv] = useState<any>(null);
  const [waOpen, setWaOpen] = useState(false);
  const [waPreview, setWaPreview] = useState<any>(null);
  const [waMsg, setWaMsg] = useState("");
  const [printSnap, setPrintSnap] = useState<{ items: Line[]; total: number; extra: number } | null>(null);
  const [brandFilter, setBrandFilter] = useState<number | "">("");
  const [catFilter, setCatFilter] = useState<number | "">("");
  const [picked, setPicked] = useState<number | null>(null);
  const [inquiry, setInquiry] = useState("");
  const [cartOpen, setCartOpen] = useState(true);
  const [clock, setClock] = useState(() => new Date());
  const [offers, setOffers] = useState<any[]>([]);
  const [listId, setListId] = useState<number | "">("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [custOpen, setCustOpen] = useState(false);
  const [retOpen, setRetOpen] = useState(false);
  const [retNo, setRetNo] = useState("");
  const [retInv, setRetInv] = useState<any>(null);
  const [retItems, setRetItems] = useState<any[]>([]);
  const [newCust, setNewCust] = useState({ name: "", phone: "", address: "", area: "" });
  const [qtyField, setQtyField] = useState(1);
  const [priceField, setPriceField] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const customerRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const extraRef = useRef<HTMLInputElement>(null);
  const catalogRef = useRef<Product[]>([]);
  const pickRef = useRef<(p: Product) => void>(() => {});

  useEffect(() => {
    get<{ data: any[] }>("/api/offers").then((r) => setOffers(r.data || [])).catch(() => {});
    searchRef.current?.focus();
  }, [listId]);

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      const p = new URLSearchParams();
      p.set("pageSize", "200");
      p.set("active", "1");
      if (listId) p.set("price_list_id", String(listId));
      if (q.trim()) p.set("q", q.trim());
      if (kindFilter) p.set("kind", kindFilter);
      if (typeFilter) p.set("part_type_id", String(typeFilter));
      if (brandFilter) p.set("brand_id", String(brandFilter));
      if (catFilter) p.set("category_id", String(catFilter));
      get<{ data: Product[] }>(`/api/products?${p}`).then((r) => {
        if (!live) return;
        setCatalog(r.data || []);
      }).catch(() => {});
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [q, listId, kindFilter, typeFilter, brandFilter, catFilter]);

  useEffect(() => {
    const heldId = Number(params.get("held") || 0);
    if (!heldId) return;
    get<{ data: any }>(`/api/invoices/${heldId}`).then((r) => {
      const inv = r.data;
      if (!["held", "quote", "order"].includes(inv?.status)) return;
      setType(inv.type === "delivery" ? "delivery" : "normal");
      setDiscount(inv.discount || 0);
      setExtraAmount(Number(inv.extra_amount || 0));
      setNotes(inv.notes || "");
      setCart((inv.items || []).map((it: any) => ({
        id: it.product_id,
        name_ar: it.product_name,
        name_en: it.product_name,
        sku: it.sku,
        selling_price: it.unit_price,
        wholesale_price: it.unit_price,
        min_selling_price: 0,
        available: 9999,
        stock_status: "in",
        kind: it.item_kind,
        qty: it.quantity,
        unit_price: it.unit_price,
        discount: it.discount || 0,
        batch_id: null,
        serials: [],
        unit_name: it.unit_name || "",
        unit_factor: Number(it.unit_factor || 1) || 1,
      })));
    }).catch(() => {});
  }, [params]);

  useEffect(() => {
    if (!customerQ.trim()) {
      setCustomers([]);
      return;
    }
    const tmr = setTimeout(() => {
      get<{ data: any[] }>(`/api/customers?q=${encodeURIComponent(customerQ)}&pageSize=8`).then((r) => setCustomers(r.data)).catch(() => {});
    }, 300);
    return () => clearTimeout(tmr);
  }, [customerQ]);

  const visible = catalog;

  function offerDisc(productId: number, qty: number, price: number) {
    const hit = offers.filter((o) => Number(o.product_id) === productId && qty >= Number(o.min_qty)).sort((a, b) => Number(b.min_qty) - Number(a.min_qty))[0];
    if (!hit) return 0;
    const base = qty * price;
    return hit.discount_type === "fixed" ? Number(hit.discount_value) : Math.round((base * Number(hit.discount_value)) / 100 * 100) / 100;
  }

  function unitForScan(p: Product, scan: string): Unit | undefined {
    const s = scan.trim();
    return (p.units || []).find((u) => u.barcode && u.barcode === s);
  }

  function pickPrice(p: Product, unit?: Unit) {
    if (unit && Number(unit.selling_price) > 0) return Number(unit.selling_price);
    let price = Number(p.selling_price || 0);
    if (customer?.discount_pct) price = Math.round(price * (1 - Number(customer.discount_pct) / 100) * 100) / 100;
    if (p.discount_pct) price = Math.round(price * (1 - Number(p.discount_pct) / 100) * 100) / 100;
    return price;
  }

  function pickProduct(p: Product) {
    setPicked(p.id);
    setInquiry(lang === "ar" ? p.name_ar : p.name_en);
    setQtyField((n) => n || 1);
    setPriceField(String(pickPrice(p)));
  }

  function addPicked() {
    const p = visible.find((x) => x.id === picked);
    if (p) {
      add(p, { qty: qtyField, price: priceField ? Number(priceField) : undefined });
      return;
    }
    if (q.trim()) {
      addFromSearch();
      return;
    }
    playSound("err");
  }

  function slotOf(p: Product) {
    return [p.drawer, p.rack, p.shelf, p.box, p.location_name].filter(Boolean).join(" / ");
  }

  function add(p: Product, opts?: { qty?: number; price?: number; unit?: Unit }) {
    const cap = p.kind === "service" || p.non_stock ? 9999 : p.available;
    if (cap <= 0 && !p.non_stock) {
      playSound("err");
      setErr(tr("insufficient"));
      return;
    }
    const unit = opts?.unit;
    const qtyAdd = p.no_qty ? 1 : Math.max(1, Number(opts?.qty || qtyField || 1));
    const price = opts?.price != null && opts.price !== 0 ? Number(opts.price) : (priceField ? Number(priceField) : pickPrice(p, unit));
    setCart((prev) => {
      const i = prev.findIndex((x) => x.id === p.id && x.unit_factor === (unit?.factor || x.unit_factor || 1) && x.unit_name === (unit?.name || x.unit_name || ""));
      if (i >= 0 && !p.track_serial) {
        const next = [...prev];
        const qty = Math.min(next[i].qty + qtyAdd, cap);
        next[i] = { ...next[i], qty, unit_price: price || next[i].unit_price, discount: offerDisc(p.id, qty, price || next[i].unit_price) };
        setSel(i);
        return next;
      }
      const line: Line = {
        ...p,
        qty: Math.min(qtyAdd, cap),
        unit_price: price,
        discount: offerDisc(p.id, qtyAdd, price),
        batch_id: null,
        serials: [],
        unit_name: unit?.name || p.unit || "",
        unit_factor: Number(unit?.factor || 1) || 1,
      };
      setSel(prev.length);
      return [...prev, line];
    });
    playSound("ok");
    setErr("");
    if (settings.use_last_customer_price === "1" && customer?.id && !opts?.price && !priceField) {
      get<{ price: number | null }>(`/api/invoices/last-price?customer_id=${customer.id}&product_id=${p.id}`).then((r) => {
        if (r.price == null) return;
        setCart((c) => c.map((x) => (x.id === p.id ? { ...x, unit_price: Number(r.price) } : x)));
      }).catch(() => {});
    }
    setQ("");
    setQtyField(1);
    setPriceField("");
    searchRef.current?.focus();
  }

  function addFromSearch() {
    const scan = q.trim();
    if (!scan) return;
    const exact = visible.find((p) =>
      p.sku === scan || p.barcode === scan || p.extra_code1 === scan || p.extra_code2 === scan
      || (p.units || []).some((u) => u.barcode === scan),
    );
    if (!exact) {
      playSound("err");
      setErr(tr("productNotFound"));
      return;
    }
    add(exact, { unit: unitForScan(exact, scan), qty: qtyField, price: priceField ? Number(priceField) : undefined });
  }

  function clearCart() {
    setCart([]);
    setDiscount(0);
    setExtraAmount(0);
    setNotes("");
    setPaid(0);
    setPays([]);
    setErr("");
    setSel(0);
    searchRef.current?.focus();
  }

  const subtotal = cart.reduce((s, l) => s + l.qty * l.unit_price, 0);
  const lineDisc = cart.reduce((s, l) => s + l.discount, 0);
  const taxAmount = taxOn ? Math.round(Math.max(0, subtotal - discount - lineDisc) * (taxRate / 100) * 100) / 100 : 0;
  const total = Math.max(0, subtotal - discount - lineDisc + taxAmount + Number(extraAmount || 0));
  const splitPaid = pays.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const remaining = method === "credit" || type === "delivery" || pays.length
    ? Math.max(0, total - (splitPaid || paid))
    : Math.max(0, total - (paid || total));
  const creditNeedCustomer = method === "credit" && !customer && !quoteMode;
  const printRows = printSnap?.items || cart;
  const printTotal = printSnap?.total ?? total;
  const printExtra = printSnap?.extra ?? Number(extraAmount || 0);
  const cartModelNames = new Set(cart.flatMap((l) => (l.models || []).map((m) => m.name)));
  const related = visible.filter((p) => !cart.some((c) => c.id === p.id) && (p.models || []).some((m) => cartModelNames.has(m.name))).slice(0, 8);
  const waEnabled = settings.whatsapp_enabled !== "0";

  async function openHeld() {
    const [heldInv, quoteInv, orderInv, today] = await Promise.all([
      get<{ data: any[] }>("/api/invoices?status=held"),
      get<{ data: any[] }>("/api/invoices?status=quote"),
      get<{ data: any[] }>("/api/invoices?status=order"),
      get<{ data: any[] }>("/api/invoices?period=today&pageSize=40"),
    ]);
    setHeld([...(heldInv.data || []), ...(quoteInv.data || []), ...(orderInv.data || [])]);
    setTodayInv((today.data || []).filter((x) => !["held", "quote", "order"].includes(x.status)));
    setHeldTab("held");
    setHeldOpen(true);
  }

  async function previewWa(invoiceId: number) {
    const r = await get<any>(`/api/invoices/${invoiceId}/whatsapp?type=invoice_created&lang=${lang}`);
    setWaPreview({ ...r, invoice_id: invoiceId });
    setWaMsg(r.message || "");
    setWaOpen(true);
  }

  function cartItems() {
    return cart.map((l) => ({
      product_id: l.id,
      quantity: l.qty,
      unit_price: l.unit_price,
      discount: l.discount,
      batch_id: l.batch_id,
      serials: l.serials,
      unit_name: l.unit_name,
      unit_factor: l.unit_factor,
    }));
  }

  async function submit(opts?: { paid?: number; method?: string; hold?: boolean; quote?: boolean; order?: boolean; print?: boolean }) {
    const payMethod = opts?.method ?? method;
    if (payMethod === "credit" && !customer && !opts?.hold && !opts?.quote && !opts?.order) {
      playSound("err");
      setErr(tr("errCustomerRequired"));
      return;
    }
    setBusy(true);
    setErr("");
    const paidAmt = opts?.paid ?? paid;
    const asQuote = !!(opts?.quote || quoteMode);
    try {
      const body = {
        type,
        hold: !!opts?.hold,
        quote: asQuote && !opts?.hold && !opts?.order,
        order: !!opts?.order,
        reserve: asQuote,
        branch_id: branchId || null,
        customer_id: customer?.id || null,
        customer_name: customer?.name || walkIn || customerQ || null,
        customer_phone: customer?.phone,
        customer_whatsapp: customer?.whatsapp || customer?.phone,
        address: address || customer?.address,
        area: area || customer?.area,
        delivery_agent_id: type === "delivery" ? agentId || null : null,
        sales_agent_id: salesAgentId || null,
        expected_delivery_time: time || null,
        payment_method: payMethod,
        cash_account_id: cashAccountId || null,
        location_id: warehouseId || null,
        extra_amount: extraAmount || 0,
        paid: payMethod === "credit" || type === "delivery" ? (splitPaid || paidAmt) : splitPaid || paidAmt || total,
        payments: pays.filter((p) => p.amount > 0),
        tax_rate: taxOn ? taxRate : 0,
        price_list_id: listId || customer?.price_list_id || null,
        discount,
        due_date: due || null,
        notes,
        items: cartItems(),
      };
      const res = await post<{ data: any }>("/api/invoices", body);
      if (opts?.hold) {
        playSound("ok");
        clearCart();
        return;
      }
      playSound("done");
      setPrintSnap({ items: cart, total, extra: Number(extraAmount || 0) });
      setDoneInv(res.data);
      if (customer?.id) {
        try {
          const fresh = await get<{ data: any }>(`/api/customers/${customer.id}`);
          if (fresh.data) setCustomer({ ...customer, current_balance: fresh.data.current_balance });
        } catch {
          /* keep prior snapshot */
        }
      }
      clearCart();
      setDoneOpen(true);
      if (opts?.print) setTimeout(() => window.print(), 350);
    } catch (e: any) {
      playSound("err");
      setErr(apiMessage(tr, e));
    } finally {
      setBusy(false);
    }
  }

  async function holdInvoice() {
    if (!cart.length) return;
    await submit({ hold: true });
  }

  const submitRef = useRef(submit);
  submitRef.current = submit;
  const holdRef = useRef(holdInvoice);
  holdRef.current = holdInvoice;
  const cartRef = useRef(cart);
  cartRef.current = cart;
  const selRef = useRef(sel);
  selRef.current = sel;
  catalogRef.current = catalog;
  pickRef.current = pickProduct;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "TEXTAREA") return;
      if (e.key === "F12") {
        e.preventDefault();
        clearCart();
      } else if (e.key === "F11") {
        e.preventDefault();
        if (cartRef.current.length) void submitRef.current({ print: true });
      } else if (e.key === "F9") {
        e.preventDefault();
        void submitRef.current();
      } else if (e.key === "F10") {
        e.preventDefault();
        if (cartRef.current.length) void submitRef.current({ print: true });
        else window.print();
      } else if (e.key === "F4") {
        e.preventDefault();
        clearCart();
      } else if (e.key === "F5") {
        e.preventDefault();
        qtyRef.current?.focus();
        qtyRef.current?.select();
      } else if (e.key === "F6") {
        e.preventDefault();
        priceRef.current?.focus();
        priceRef.current?.select();
      } else if (e.key === "F7") {
        e.preventDefault();
        extraRef.current?.focus();
        extraRef.current?.select();
      } else if (e.key === "F8") {
        e.preventDefault();
        const i = selRef.current;
        setCart((c) => c.filter((_, idx) => idx !== i));
        setSel((s) => Math.max(0, s - 1));
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (tag === "INPUT" && (e.target as HTMLElement) !== searchRef.current) return;
        e.preventDefault();
        setPicked((cur) => {
          const list = catalogRef.current;
          if (!list.length) return cur;
          const idx = Math.max(0, list.findIndex((p) => p.id === cur));
          const next = e.key === "ArrowDown" ? Math.min(list.length - 1, idx + 1) : Math.max(0, idx - 1);
          const row = list[next];
          if (row) pickRef.current(row);
          return row?.id ?? cur;
        });
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        window.print();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const agent = lookups?.delivery_agents.find((a) => a.id === Number(agentId));
  const payBtns = [
    { code: "cash", label: tr("posPayCash") },
    { code: "visa", label: tr("posPayCard") },
    { code: "treasury", label: tr("posPayTreasury") },
    { code: "credit", label: tr("posPayCredit") },
  ];

  return (
    <div>
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
                <td>{lang === "ar" ? l.name_ar : l.name_en}{l.unit_name ? ` · ${l.unit_name}` : ""}</td>
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
          <Barcode key={`${l.id}-bc`} value={l.barcode || l.sku} label={lang === "ar" ? l.name_ar : l.name_en} price={money(l.unit_price, lang)} />
        ))}
      </div>

      <div className={`sahl-pos no-print ${cartOpen ? "" : "is-cart-off"}`}>
        <aside className="sahl-pos-rail">
          <PixelMark size={28} />
          <div className="sahl-pos-rail-title">{quoteMode ? tr("quoteMode") : tr("easySell")}</div>
          <button type="button" className="sahl-pos-rail-btn is-sell" title={tr("easySell")}>
            <ShoppingBag size={18} />
            <small>{tr("easySell")}</small>
          </button>
          <button type="button" className="sahl-pos-rail-btn" onClick={() => searchRef.current?.focus()} title={tr("posFieldSearch")}>
            <Search size={18} />
            <span>1</span>
          </button>
          <button type="button" className="sahl-pos-rail-btn" onClick={clearCart} title={`${tr("posSavePrintNew")} F12`}>
            F12
            <small>{tr("posSavePrintNew")}</small>
          </button>
          <button type="button" className="sahl-pos-rail-btn" disabled={busy || !cart.length || !can("sales.create") || creditNeedCustomer} onClick={() => submit({ print: true })} title={`${tr("posPaySettle")} F11`}>
            F11
            <small>{tr("posPaySettle")}</small>
          </button>
          <p className="sahl-pos-rail-hint">{tr("posShortcuts")}</p>
        </aside>

        <div className="sahl-pos-fields">
          <label className="sahl-pos-field" data-n="1">
            <span className="sahl-pos-flab"><b>1</b> {tr("posFieldSearch")}</span>
            <input
              ref={searchRef}
              className={inputCls}
              placeholder={`${tr("searchProduct")} / ${tr("barcode")}`}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addFromSearch(); } }}
            />
          </label>
          <label className="sahl-pos-field" data-n="2">
            <span className="sahl-pos-flab"><b>2</b> {tr("posFieldInquiry")}</span>
            <input className={inputCls} readOnly value={inquiry} placeholder={tr("posFieldInquiry")} />
          </label>
          <label className="sahl-pos-field is-qty" data-n="3">
            <span className="sahl-pos-flab"><b>3</b> {tr("qty")}</span>
            <input ref={qtyRef} className={inputCls} type="number" min={1} value={qtyField} onChange={(e) => setQtyField(Number(e.target.value) || 1)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPicked(); } }} />
          </label>
          <label className="sahl-pos-field is-price" data-n="4">
            <span className="sahl-pos-flab"><b>4</b> {tr("sellingPrice")}</span>
            <input ref={priceRef} className={inputCls} type="number" value={priceField} onChange={(e) => setPriceField(e.target.value)} placeholder={tr("sellingPrice")} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPicked(); } }} />
          </label>
          <button type="button" className="sahl-pos-add" data-n="5" onClick={addPicked}>
            <span className="sahl-pos-flab"><b>5</b></span>
            <Check size={18} />
            {tr("add")}
          </button>
          <label className="sahl-pos-field" data-n="6">
            <span className="sahl-pos-flab"><b>6</b> {tr("posFieldCustomer")}</span>
            <input
              ref={customerRef}
              className={inputCls}
              value={customer ? `${customer.name} — ${customer.phone || ""} — ${money(customer.current_balance, lang)}` : customerQ}
              onChange={(e) => { setCustomer(null); setCustomerQ(e.target.value); setWalkIn(e.target.value); }}
              placeholder={`${tr("walkIn")} / ${tr("posUnregistered")}`}
            />
            {customers.length ? (
              <div className="sahl-pos-suggest">
                {customers.map((c) => (
                  <button key={c.id} type="button" onClick={() => {
                    setCustomer(c);
                    setAddress(c.address || "");
                    setArea(c.area || "");
                    setCustomers([]);
                    setCustomerQ("");
                    setWalkIn("");
                    if (c.price_list_id) setListId(c.price_list_id);
                    if (c.discount_pct) setDiscount(Number(c.discount_pct) || 0);
                  }}>
                    {c.name} · {c.phone} · {money(c.current_balance, lang)}
                  </button>
                ))}
              </div>
            ) : null}
          </label>
          <div className="sahl-pos-clock">
            <b>{clock.toLocaleTimeString(lang === "ar" ? "ar-EG" : "en-GB", { hour: "2-digit", minute: "2-digit" })}</b>
            <span>{clock.toLocaleDateString("en-GB")}</span>
          </div>
        </div>

        <section className="sahl-pos-cart">
          <button type="button" className="sahl-pos-cart-tog" onClick={() => setCartOpen((v) => !v)} title={tr("cart")}>
            {cartOpen ? "»" : "«"}
          </button>
          {cartOpen ? (
            cart.length === 0 ? <div className="py-10 text-center text-slate-400">{tr("emptyCart")}</div> : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{tr("items")}</th>
                    <th>{tr("qty")}</th>
                    <th>{tr("price")}</th>
                    <th>{tr("discount")}</th>
                    <th>{tr("total")}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((l, i) => (
                    <tr key={`${l.id}-${l.unit_name}-${i}`} className={sel === i ? "is-sel" : ""} onClick={() => setSel(i)}>
                      <td>{i + 1}</td>
                      <td>
                        <div className="font-bold">{lang === "ar" ? l.name_ar : l.name_en}</div>
                        <div className="text-[11px] text-slate-400">{l.sku}{l.unit_name ? ` · ${l.unit_name}` : ""}</div>
                        {l.track_serial ? (
                          <input className={`${inputCls} mt-1`} placeholder={tr("serials")} value={l.serials.join(",")} onChange={(e) => setCart((c) => c.map((x, j) => (j === i ? { ...x, serials: e.target.value.split(/[,]+/).map((s) => s.trim()).filter(Boolean) } : x)))} />
                        ) : null}
                      </td>
                      <td>
                        <input className={`${inputCls} w-16`} type="number" min={1} max={l.kind === "service" || l.non_stock ? 9999 : l.available} value={l.qty} onChange={(e) => setCart((c) => c.map((x, j) => {
                          if (j !== i) return x;
                          const cap = x.kind === "service" || x.non_stock ? 9999 : Math.max(1, Number(x.available) || 1);
                          const qty = Math.min(Math.max(1, Number(e.target.value) || 1), cap);
                          return { ...x, qty, discount: offerDisc(x.id, qty, x.unit_price) };
                        }))} />
                      </td>
                      <td>
                        <input className={`${inputCls} w-20`} type="number" value={l.unit_price} onChange={(e) => setCart((c) => c.map((x, j) => (j === i ? { ...x, unit_price: Number(e.target.value) } : x)))} />
                      </td>
                      <td>
                        <input className={`${inputCls} w-16`} type="number" value={l.discount} onChange={(e) => setCart((c) => c.map((x, j) => (j === i ? { ...x, discount: Number(e.target.value) } : x)))} />
                      </td>
                      <td className="font-black">{money(l.qty * l.unit_price - l.discount, lang)}</td>
                      <td>
                        <button className="text-rose-500" onClick={() => setCart((c) => c.filter((_, j) => j !== i))}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )
          ) : null}
        </section>

        <footer className="sahl-pos-pay">
          <div className="sahl-pos-paybtns">
            {payBtns.map((b) => (
              <button key={b.code} type="button" className={`sahl-pos-paybtn ${method === b.code ? "is-on" : ""}`} onClick={() => setMethod(b.code)}>
                {b.label}
              </button>
            ))}
          </div>
          <label className="sahl-pos-mini">
            <span>{tr("tax")} %</span>
            <span className="flex items-center gap-1">
              <input type="checkbox" checked={taxOn} onChange={(e) => setTaxOn(e.target.checked)} />
              <input className={`${inputCls} w-16`} type="number" value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))} />
            </span>
          </label>
          <label className="sahl-pos-mini">
            <span>{tr("posExtra")} F7</span>
            <input ref={extraRef} className={`${inputCls} w-24`} type="number" value={extraAmount} onChange={(e) => setExtraAmount(Number(e.target.value))} />
          </label>
          <label className="sahl-pos-mini">
            <span>{tr("discount")}</span>
            <input className={`${inputCls} w-24`} type="number" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} />
          </label>
          <label className="sahl-pos-mini grow">
            <span>{tr("notes")}</span>
            <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          {method === "cash" || method === "treasury" ? (
            <label className="sahl-pos-mini">
              <span>{tr("cashAccount")}</span>
              <select className={inputCls} value={cashAccountId} onChange={(e) => setCashAccountId(e.target.value ? Number(e.target.value) : "")}>
                <option value="">-</option>
                {(lookups?.cash_accounts || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
          ) : null}
          {(method === "credit" || type === "delivery") ? (
            <label className="sahl-pos-mini">
              <span>{tr("paid")}</span>
              <input className={`${inputCls} w-24`} type="number" value={paid} onChange={(e) => setPaid(Number(e.target.value))} />
            </label>
          ) : null}
          {method === "credit" ? (
            <label className="sahl-pos-mini">
              <span>{tr("dueDate")}</span>
              <input className={inputCls} type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </label>
          ) : null}
          <div className="sahl-pos-totals">
            <span>{tr("subtotal")}: {money(subtotal, lang)}</span>
            {taxOn ? <span>{tr("taxAmount")}: {money(taxAmount, lang)}</span> : null}
            <b>{tr("total")}: {money(total, lang)}</b>
            <span>{tr("remaining")}: {money(remaining, lang)}</span>
          </div>
          {err ? <div className="w-full text-sm text-rose-600">{err}</div> : null}
          <div className="sahl-pos-actions">
            <Btn className="gx-confirm" disabled={busy || !cart.length || !can("sales.create") || creditNeedCustomer} onClick={() => submit({ print: true })}>{quoteMode ? tr("quoteMode") : tr("confirmSale")} F10</Btn>
            <Btn className="gx-quiet" disabled={busy || !cart.length || !can("sales.create") || creditNeedCustomer} onClick={() => submit()}>{tr("saleWithoutPrint")} F9</Btn>
            <Btn kind="soft" disabled={busy || !cart.length || !can("sales.create")} onClick={() => submit({ paid: total, method: "cash" })}>{tr("payNow")}</Btn>
            <PrintBtn />
            <Btn kind="ghost" disabled={busy || !cart.length} onClick={holdInvoice}>{tr("posHold")}</Btn>
            <Btn kind="ghost" disabled={busy || !cart.length} onClick={() => submit({ quote: true })}>{tr("reserveQuote")}</Btn>
            <Btn kind="ghost" disabled={busy || !cart.length} onClick={() => submit({ order: true })}>{tr("saveOrder")}</Btn>
            <Btn kind="ghost" onClick={clearCart}>{tr("posClear")} F4</Btn>
            {can("returns.create") ? <Btn kind="ghost" onClick={() => setRetOpen(true)}>{tr("returnFromInvoice")}</Btn> : null}
            <Btn kind="soft" onClick={() => void openHeld()}>{tr("heldInvoices")}</Btn>
            <button type="button" className="text-xs font-bold text-cyan-700" onClick={() => setCustOpen(true)}>{tr("addCustomer")}</button>
            <select className={`${inputCls} w-36`} value={type} onChange={(e) => setType(e.target.value as "normal" | "delivery")}>
              <option value="normal">{tr("normalSale")}</option>
              <option value="delivery">{tr("deliverySale")}</option>
            </select>
            <select className={`${inputCls} w-36`} value={listId} onChange={(e) => setListId(e.target.value ? Number(e.target.value) : "")}>
              <option value="">{tr("priceList")}</option>
              {(lookups?.price_lists || []).map((l) => <option key={l.id} value={l.id}>{lang === "ar" ? l.name : (l.name_en || l.name)}</option>)}
            </select>
            <select className={`${inputCls} w-36`} value={salesAgentId} onChange={(e) => setSalesAgentId(e.target.value ? Number(e.target.value) : "")}>
              <option value="">{tr("salesAgent")}</option>
              {(lookups?.delivery_agents || []).filter((a) => !a.role_type || a.role_type === "sales" || a.role_type === "both").map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            {type === "delivery" ? (
              <>
                <select className={`${inputCls} w-36`} value={agentId} onChange={(e) => setAgentId(e.target.value ? Number(e.target.value) : "")}>
                  <option value="">{tr("agent")}</option>
                  {(lookups?.delivery_agents || []).filter((a) => !a.role_type || a.role_type === "delivery" || a.role_type === "both").map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                {agent ? <span className="text-xs">{agent.code} {agent.phone || ""}</span> : null}
                <input className={`${inputCls} w-40`} placeholder={tr("address")} value={address} onChange={(e) => setAddress(e.target.value)} />
                <input className={`${inputCls} w-28`} placeholder={tr("area")} value={area} onChange={(e) => setArea(e.target.value)} />
              </>
            ) : null}
          </div>
        </footer>

        <section className="sahl-pos-grid">
          <div className="sahl-pos-grid-tools">
            <button type="button" className={`sahl-pos-chip ${kindFilter === "" && brandFilter === "" && typeFilter === "" && catFilter === "" ? "is-on" : ""}`} onClick={() => { setKindFilter(""); setTypeFilter(""); setBrandFilter(""); setCatFilter(""); }}>{tr("all")}</button>
            <button type="button" className={`sahl-pos-chip ${kindFilter === "product" ? "is-on" : ""}`} onClick={() => setKindFilter(kindFilter === "product" ? "" : "product")}>{tr("products")}</button>
            <button type="button" className={`sahl-pos-chip ${kindFilter === "service" ? "is-on" : ""}`} onClick={() => setKindFilter(kindFilter === "service" ? "" : "service")}>{tr("services")}</button>
            {(lookups?.categories || []).slice(0, 8).map((c) => (
              <button key={`cat-${c.id}`} type="button" className={`sahl-pos-chip ${catFilter === c.id ? "is-on" : ""}`} onClick={() => setCatFilter(catFilter === c.id ? "" : c.id)}>
                {lang === "ar" ? c.name_ar : c.name_en}
              </button>
            ))}
            {(lookups?.brands || []).slice(0, 8).map((b) => (
              <button key={b.id} type="button" className={`sahl-pos-chip ${brandFilter === b.id ? "is-on" : ""}`} onClick={() => setBrandFilter(brandFilter === b.id ? "" : b.id)}>
                {lang === "ar" ? b.name_ar : b.name_en}
              </button>
            ))}
            {(lookups?.part_types || []).slice(0, 6).map((t) => (
              <button key={t.id} type="button" className={`sahl-pos-chip ${typeFilter === t.id ? "is-on" : ""}`} onClick={() => setTypeFilter(typeFilter === t.id ? "" : t.id)}>
                {lang === "ar" ? t.name_ar : t.name_en}
              </button>
            ))}
          </div>
          {related.length ? (
            <div className="gx-related">
              {related.map((p) => (
                <button key={`rel-${p.id}`} type="button" className="gx-related-item" onClick={() => add(p)}>
                  <div className="text-xs font-bold">{lang === "ar" ? p.name_ar : p.name_en}</div>
                  <div className="mt-1 text-[11px]">{money(p.selling_price, lang)}</div>
                </button>
              ))}
            </div>
          ) : null}
          <div className="sahl-pos-grid-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>{tr("items")}</th>
                  <th>{tr("unit")}</th>
                  <th>{tr("warehouseQty")}</th>
                  <th>{tr("accountsQty")}</th>
                  <th>{tr("category")}</th>
                  <th>{tr("partType")}</th>
                  <th>{tr("brand")}</th>
                  <th>{tr("compatible")}</th>
                  <th>{tr("packQty")}</th>
                  <th>{tr("slotNo")}</th>
                  <th>{tr("sellingPrice")}</th>
                  <th>{tr("minPrice")}</th>
                  {showCost ? <th>{tr("lastBuyPrice")}</th> : null}
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => {
                  const inCart = cart.find((c) => c.id === p.id);
                  const models = (p.models || []).map((m) => m.name).join(" / ");
                  const pack = p.units?.find((u) => u.is_base)?.factor || p.units?.[0]?.factor || 1;
                  return (
                    <tr
                      key={p.id}
                      className={`${picked === p.id ? "is-pick" : ""} ${inCart ? "is-in" : ""}`}
                      onClick={() => pickProduct(p)}
                      onDoubleClick={() => add(p)}
                    >
                      <td>{p.id}</td>
                      <td className="is-name">{lang === "ar" ? p.name_ar : p.name_en}</td>
                      <td>{p.unit || "-"}</td>
                      <td>{p.kind === "service" || p.non_stock ? "-" : num(p.available, lang)}</td>
                      <td>{p.kind === "service" || p.non_stock ? "-" : num(p.current_stock ?? p.available, lang)}</td>
                      <td>{(lang === "ar" ? p.category_ar : p.category_en) || "-"}</td>
                      <td>{(lang === "ar" ? p.part_type_ar : p.part_type_en) || "-"}</td>
                      <td>{(lang === "ar" ? p.brand_ar : p.brand_en) || "-"}</td>
                      <td className="is-name">{models || "-"}</td>
                      <td>{pack}</td>
                      <td>{slotOf(p) || "-"}</td>
                      <td className="is-price">{money(p.selling_price, lang)}</td>
                      <td className="is-price">{money(p.min_selling_price, lang)}</td>
                      {showCost ? <td className="is-price">{money(Number(p.purchase_price || 0), lang)}</td> : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <Modal open={heldOpen} title={tr("heldInvoices")} onClose={() => setHeldOpen(false)}>
        <div className="mb-3 flex flex-wrap gap-1">
          {([["held", tr("heldInvoices")], ["print", tr("heldPrint")], ["wa", tr("whatsapp")]] as const).map(([id, label]) => (
            <button key={id} type="button" className={`period-chip ${heldTab === id ? "is-on" : ""}`} onClick={() => setHeldTab(id)}>{label}</button>
          ))}
        </div>
        {heldTab === "held" ? (
          <>
            {(held || []).map((h) => (
              <button key={h.id} className="mb-2 block w-full rounded-xl border px-3 py-2 text-start text-sm" onClick={() => { setHeldOpen(false); nav(`/pos?held=${h.id}`); }}>
                {h.number} · {statusLabel(h.status, lang)} · {h.customer_name || tr("walkIn")} · {money(h.total, lang)}
              </button>
            ))}
            {!held.length ? <div className="text-sm text-slate-400">{tr("noData")}</div> : null}
          </>
        ) : (
          <>
            {(todayInv || []).map((h) => (
              <div key={`${heldTab}-${h.id}`} className="mb-2 flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm">
                <div>{h.number} · {h.customer_name || tr("walkIn")} · {money(h.total, lang)}</div>
                {heldTab === "print" ? (
                  <button type="button" className="font-bold text-cyan-700" onClick={() => { setHeldOpen(false); nav(`/sales/${h.id}`); setTimeout(() => window.print(), 400); }}>{tr("print")}</button>
                ) : (
                  <button type="button" className="font-bold text-emerald-700" disabled={!waEnabled || !can("whatsapp.send")} onClick={() => void previewWa(h.id)}>{tr("whatsapp")}</button>
                )}
              </div>
            ))}
            {!todayInv.length ? <div className="text-sm text-slate-400">{tr("noData")}</div> : null}
          </>
        )}
      </Modal>
      <Modal open={doneOpen} title={tr("saleDone")} onClose={() => setDoneOpen(false)}>
        {doneInv ? (
          <div className="space-y-3">
            <div className="text-lg font-black">{doneInv.number}</div>
            <div className="text-sm text-slate-500">{doneInv.customer_name || tr("walkIn")} · {money(doneInv.total, lang)}</div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className={statusClass(Number(doneInv.remaining) > 0 && Number(doneInv.paid) <= 0 ? "unpaid_sale" : doneInv.status)}>{statusLabel(Number(doneInv.remaining) > 0 && Number(doneInv.paid) <= 0 ? "unpaid_sale" : doneInv.status, lang)}</span>
              <span>{tr("paid")}: {money(doneInv.paid, lang)}</span>
              <span>{tr("remaining")}: {money(doneInv.remaining, lang)}</span>
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
          <Btn kind="ghost" onClick={() => setWaOpen(false)}>{tr("cancel")}</Btn>
        </div>
      </Modal>
      <Modal open={custOpen} title={tr("addCustomer")} onClose={() => setCustOpen(false)}>
        <div className="space-y-3">
          <input className={inputCls} placeholder={tr("name")} value={newCust.name} onChange={(e) => setNewCust({ ...newCust, name: e.target.value })} />
          <input className={inputCls} placeholder={tr("phone")} value={newCust.phone} onChange={(e) => setNewCust({ ...newCust, phone: e.target.value })} />
          <input className={inputCls} placeholder={tr("address")} value={newCust.address} onChange={(e) => setNewCust({ ...newCust, address: e.target.value })} />
          <input className={inputCls} placeholder={tr("area")} value={newCust.area} onChange={(e) => setNewCust({ ...newCust, area: e.target.value })} />
          {err ? <div className="text-sm text-rose-600">{err}</div> : null}
          <Btn
            onClick={async () => {
              if (!newCust.name.trim()) { setErr(tr("errNameRequired")); return; }
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
      <Modal open={retOpen} title={tr("returnFromInvoice")} onClose={() => { setRetOpen(false); setRetInv(null); }}>
        <div className="space-y-3">
          <Field label={tr("invoiceNo")}>
            <input className={inputCls} value={retNo} onChange={(e) => setRetNo(e.target.value)} onKeyDown={async (e) => {
              if (e.key !== "Enter" || !retNo.trim()) return;
              const list = await get<{ data: any[] }>(`/api/invoices?q=${encodeURIComponent(retNo.trim())}&pageSize=5`);
              const hit = (list.data || []).find((x) => String(x.number) === retNo.trim()) || list.data?.[0];
              if (!hit) {
                playSound("err");
                return;
              }
              playSound("ok");
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
              <div className="text-sm font-bold">{retInv.number} · {retInv.customer_name || tr("walkIn")}</div>
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
                  setRetOpen(false);
                  setRetInv(null);
                  setErr("");
                } catch (e) {
                  playSound("err");
                  setErr(apiMessage(tr, e));
                }
              }}>{tr("save")}</Btn>
            </>
          ) : <div className="text-xs text-slate-400">{tr("invoiceNo")}</div>}
          {err ? <div className="text-sm text-rose-600">{err}</div> : null}
        </div>
      </Modal>
    </div>
  );
}
