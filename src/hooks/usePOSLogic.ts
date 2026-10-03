import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useApp } from "../context";
import { get, post } from "../lib/api";
import { apiMessage } from "../lib/errors";
import { playSound } from "../lib/sounds";
import { useProductSuggest } from "../components/ProductSuggest";

export type Unit = { id?: number; name: string; factor: number; barcode?: string; selling_price: number; is_base?: number };

export type Product = {
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
  supplier_name?: string;
  current_stock?: number;
  reserved_stock?: string | number;
  purchase_price?: number;
  last_purchase_price?: number;
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

export type Line = Product & {
  qty: number;
  unit_price: number;
  discount: number;
  batch_id: number | null;
  serials: string[];
  unit_name: string;
  unit_factor: number;
};

export type PartyKind = "customer" | "supplier" | "agent";

function todayIso() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
}

export function usePOSLogic(variant: "modern" | "classic" = "modern") {
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
  const [custPool, setCustPool] = useState<any[]>([]);
  const [custListOpen, setCustListOpen] = useState(false);
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
  const [discMode, setDiscMode] = useState<"egp" | "pct">("egp");
  const [invDate, setInvDate] = useState(todayIso());
  const [extrasOpen, setExtrasOpen] = useState(false);
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
  const [todayStats, setTodayStats] = useState({ sales_today: 0, collected_today: 0, credit_today: 0, invoices_today: 0, expenses_today: 0, expected_cash: 0 });
  const [stockTick, setStockTick] = useState(0);
  const [doneOpen, setDoneOpen] = useState(false);
  const [doneInv, setDoneInv] = useState<any>(null);
  const [waOpen, setWaOpen] = useState(false);
  const [waPreview, setWaPreview] = useState<any>(null);
  const [waMsg, setWaMsg] = useState("");
  const [printSnap, setPrintSnap] = useState<{ items: Line[]; total: number; extra: number } | null>(null);
  const [brandFilter, setBrandFilter] = useState<number | "">("");
  const [catFilter, setCatFilter] = useState<number | "">("");
  const [picked, setPicked] = useState<number | null>(null);
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
  const [partyKind, setPartyKind] = useState<PartyKind>("customer");
  const [accountCode, setAccountCode] = useState("");
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [supplier, setSupplier] = useState<any>(null);
  const [forceGoods, setForceGoods] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const customerRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const extraRef = useRef<HTMLInputElement>(null);
  const custBlurRef = useRef<number>(0);
  const catalogRef = useRef<Product[]>([]);
  const pickRef = useRef<(p: Product) => void>(() => {});
  const suggest = useProductSuggest(q, true, catalog);

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
      if (warehouseId) p.set("location_id", String(warehouseId));
      get<{ data: Product[] }>(`/api/products?${p}`).then((r) => {
        if (!live) return;
        setCatalog(r.data || []);
      }).catch(() => {});
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [q, listId, kindFilter, typeFilter, brandFilter, catFilter, stockTick, warehouseId]);

  useEffect(() => {
    const heldId = Number(params.get("held") || 0);
    if (!heldId) return;
    get<{ data: any }>(`/api/invoices/${heldId}`).then((r) => {
      const inv = r.data;
      if (!["held", "quote", "order"].includes(inv?.status)) return;
      setType(inv.type === "delivery" ? "delivery" : "normal");
      setDiscount(inv.discount || 0);
      setDiscMode("egp");
      setExtraAmount(Number(inv.extra_amount || 0));
      setNotes(inv.notes || "");
      setForceGoods(true);
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
    get<{ data: any[] }>("/api/customers?pageSize=80").then((r) => {
      const rows = r.data || [];
      setCustPool(rows);
      setCustomers(rows);
    }).catch(() => {});
    get<{ data: any[] }>("/api/suppliers?pageSize=80").then((r) => setSuppliers(r.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!custListOpen) return;
    const qv = customerQ.trim();
    if (partyKind === "supplier") {
      if (!qv) return;
      const tmr = setTimeout(() => {
        get<{ data: any[] }>(`/api/suppliers?pageSize=50&q=${encodeURIComponent(qv)}`).then((r) => setSuppliers(r.data || [])).catch(() => {});
      }, 200);
      return () => clearTimeout(tmr);
    }
    const local = qv
      ? custPool.filter((c) => [c.name, c.phone, c.whatsapp, c.area, c.city, String(c.id)].some((v) => String(v || "").toLowerCase().includes(qv.toLowerCase())))
      : custPool;
    setCustomers(local);
    if (!qv) return;
    const tmr = setTimeout(() => {
      get<{ data: any[] }>(`/api/customers?pageSize=50&q=${encodeURIComponent(qv)}`).then((r) => setCustomers(r.data || local)).catch(() => {});
    }, 200);
    return () => clearTimeout(tmr);
  }, [customerQ, custListOpen, custPool, partyKind]);

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
    setQtyField((n) => n || 1);
    setPriceField(String(pickPrice(p)));
  }

  function locLines(p: Product) {
    const rows: string[] = [];
    if (p.warehouse) rows.push(`${tr("warehouse")}: ${p.warehouse}`);
    if (p.drawer) rows.push(`${tr("bay")}: ${p.drawer}`);
    if (p.rack) rows.push(`${tr("locRack")}: ${p.rack}`);
    if (p.shelf) rows.push(`${tr("locColumn")}: ${p.shelf}`);
    if (p.box) rows.push(`${tr("box")}: ${p.box}`);
    return rows;
  }

  function canSell(p: Product) {
    return p.kind === "service" || !!p.non_stock || Number(p.available) > 0;
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
    setForceGoods(true);
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
    if (!scan) {
      setForceGoods(true);
      return;
    }
    const exact = visible.find((p) =>
      p.sku === scan || p.barcode === scan || p.extra_code1 === scan || p.extra_code2 === scan
      || (p.units || []).some((u) => u.barcode === scan),
    );
    if (!exact) {
      const first = visible[0];
      if (first) {
        add(first, { qty: qtyField, price: priceField ? Number(priceField) : undefined });
        return;
      }
      playSound("err");
      setErr(tr("productNotFound"));
      return;
    }
    add(exact, { unit: unitForScan(exact, scan), qty: qtyField, price: priceField ? Number(priceField) : undefined });
  }

  function addPicked() {
    const p = visible.find((x) => x.id === picked) || visible[0];
    if (!p) {
      setForceGoods(true);
      return;
    }
    add(p, { qty: qtyField, price: priceField ? Number(priceField) : undefined });
  }

  function clearCart() {
    setCart([]);
    setDiscount(0);
    setDiscMode("egp");
    setExtraAmount(0);
    setNotes("");
    setPaid(0);
    setPays([]);
    setErr("");
    setSel(0);
    setForceGoods(false);
    setPicked(null);
    searchRef.current?.focus();
  }

  const subtotal = cart.reduce((s, l) => s + l.qty * l.unit_price, 0);
  const lineDisc = cart.reduce((s, l) => s + l.discount, 0);
  const discAmt = discMode === "pct"
    ? Math.round((subtotal * Number(discount || 0) / 100) * 100) / 100
    : Number(discount || 0);
  const taxAmount = taxOn ? Math.round(Math.max(0, subtotal - discAmt - lineDisc) * (taxRate / 100) * 100) / 100 : 0;
  const total = Math.max(0, subtotal - discAmt - lineDisc + taxAmount + Number(extraAmount || 0));
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
  const showGoods = forceGoods || !!q.trim() || cart.length > 0;
  const cartQty = (id: number) => cart.filter((l) => l.id === id).reduce((s, l) => s + l.qty, 0);

  async function loadToday() {
    const r = await get<{
      sales_today: number;
      collected_today: number;
      credit_today: number;
      invoices_today: number;
      expenses_today?: number;
      expected_cash?: number;
      invoices: any[];
    }>("/api/pos/today");
    setTodayStats({
      sales_today: Number(r.sales_today) || 0,
      collected_today: Number(r.collected_today) || 0,
      credit_today: Number(r.credit_today) || 0,
      invoices_today: Number(r.invoices_today) || 0,
      expenses_today: Number(r.expenses_today) || 0,
      expected_cash: Number(r.expected_cash) || 0,
    });
    setTodayInv(r.invoices || []);
  }

  async function loadHeldList() {
    const [heldInv, quoteInv, orderInv] = await Promise.all([
      get<{ data: any[] }>("/api/invoices?status=held"),
      get<{ data: any[] }>("/api/invoices?status=quote"),
      get<{ data: any[] }>("/api/invoices?status=order"),
    ]);
    setHeld([...(heldInv.data || []), ...(quoteInv.data || []), ...(orderInv.data || [])]);
  }

  useEffect(() => {
    loadToday().catch(() => {});
    loadHeldList().catch(() => {});
  }, []);

  async function openHeld() {
    await loadHeldList().catch(() => {});
    await loadToday().catch(() => {});
    setHeldTab("held");
    setHeldOpen(true);
  }

  async function cancelHeld(id: number) {
    try {
      await post(`/api/invoices/${id}/cancel`);
      await loadHeldList();
      await loadToday().catch(() => {});
    } catch (e) {
      setErr(apiMessage(tr, e));
    }
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
        customer_phone: customer?.phone || newCust.phone,
        customer_whatsapp: customer?.whatsapp || customer?.phone || newCust.phone,
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
        discount: discAmt,
        due_date: payMethod === "credit" ? (due || invDate || null) : (due || null),
        notes,
        items: cartItems(),
      };
      const res = await post<{ data: any }>("/api/invoices", body);
      if (opts?.hold) {
        playSound("ok");
        clearCart();
        void loadHeldList();
        return;
      }
      playSound("done");
      setPrintSnap({ items: cart, total, extra: Number(extraAmount || 0) });
      setDoneInv(res.data);
      setStockTick((n) => n + 1);
      await loadToday().catch(() => {});
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

  async function saveAccount() {
    const name = (newCust.name || customerQ || walkIn || customer?.name || "").trim();
    if (!name) {
      setErr(tr("errNameRequired"));
      return;
    }
    setBusy(true);
    setErr("");
    try {
      if (partyKind === "supplier") {
        const r = await post<{ id: number }>("/api/suppliers", { name, phone: newCust.phone, address });
        setSupplier({ id: r.id, name, phone: newCust.phone, address });
        setWalkIn(name);
        setCustomer(null);
      } else if (partyKind === "agent") {
        const hit = (lookups?.delivery_agents || []).find((a) =>
          a.name === name || String(a.id) === accountCode || a.code === accountCode,
        );
        if (hit) setSalesAgentId(hit.id);
        setWalkIn(name);
      } else {
        const r = await post<{ id: number }>("/api/customers", { name, phone: newCust.phone, address, area });
        setCustomer({ id: r.id, name, phone: newCust.phone, address, area, whatsapp: newCust.phone });
        setCustomerQ("");
        setWalkIn("");
      }
    } catch (e) {
      setErr(apiMessage(tr, e));
    } finally {
      setBusy(false);
    }
  }

  function applyParty(row: any, kind = partyKind) {
    if (kind === "supplier") {
      setSupplier(row);
      setWalkIn(row.name || "");
      setAccountCode(String(row.id || ""));
      setNewCust((c) => ({ ...c, name: row.name || "", phone: row.phone || "", address: row.address || "" }));
      setAddress(row.address || "");
      setCustomer(null);
      return;
    }
    if (kind === "agent") {
      setSalesAgentId(row.id);
      setWalkIn(row.name || "");
      setAccountCode(String(row.code || row.id || ""));
      setNewCust((c) => ({ ...c, name: row.name || "", phone: row.phone || "" }));
      return;
    }
    setCustomer(row);
    setCustomerQ("");
    setWalkIn("");
    setAccountCode(String(row.id || ""));
    setAddress(row.address || "");
    setArea(row.area || "");
    setNewCust({ name: row.name || "", phone: row.phone || "", address: row.address || "", area: row.area || "" });
    if (row.price_list_id) setListId(Number(row.price_list_id));
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
      if (variant === "classic") {
        if (e.key === "F12") {
          e.preventDefault();
          if (cartRef.current.length) void submitRef.current({ print: true });
        } else if (e.key === "F11") {
          e.preventDefault();
          if (cartRef.current.length) void submitRef.current({ paid: undefined, method: "cash", print: false });
        } else if (e.key === "F9") {
          e.preventDefault();
          void submitRef.current();
        } else if (e.key === "F10") {
          e.preventDefault();
          clearCart();
        } else if (e.key === "F4") {
          e.preventDefault();
          if (cartRef.current.length) void submitRef.current({ print: true });
          else window.print();
        }
      } else if (e.key === "F12") {
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
      }
      if (e.key === "F5") {
        e.preventDefault();
        setExtrasOpen(true);
        setTimeout(() => {
          qtyRef.current?.focus();
          qtyRef.current?.select();
        }, 50);
      } else if (e.key === "F6") {
        e.preventDefault();
        setExtrasOpen(true);
        setTimeout(() => {
          priceRef.current?.focus();
          priceRef.current?.select();
        }, 50);
      } else if (e.key === "F7") {
        e.preventDefault();
        setExtrasOpen(true);
        setTimeout(() => {
          extraRef.current?.focus();
          extraRef.current?.select();
        }, 50);
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
  }, [variant]);

  const partyHits = partyKind === "supplier"
    ? suppliers
    : partyKind === "agent"
      ? (lookups?.delivery_agents || []).filter((a) => {
        const qv = customerQ.trim().toLowerCase();
        if (!qv) return true;
        return [a.name, a.code, a.phone, String(a.id)].some((v) => String(v || "").toLowerCase().includes(qv));
      })
      : customers;

  return {
    tr, lang, lookups, can, nav, quoteMode, showCost,
    q, setQ, catalog, typeFilter, setTypeFilter, kindFilter, setKindFilter,
    cart, setCart, sel, setSel, type, setType,
    customerQ, setCustomerQ, customers, custListOpen, setCustListOpen,
    customer, setCustomer, walkIn, setWalkIn, method, setMethod,
    cashAccountId, setCashAccountId, agentId, setAgentId, salesAgentId, setSalesAgentId,
    address, setAddress, area, setArea, time, setTime, paid, setPaid,
    discount, setDiscount, discMode, setDiscMode, invDate, setInvDate,
    extrasOpen, setExtrasOpen, extraAmount, setExtraAmount, notes, setNotes,
    due, setDue, taxOn, setTaxOn, taxRate, setTaxRate, pays, setPays,
    held, heldOpen, setHeldOpen, heldTab, setHeldTab, todayInv, todayStats,
    doneOpen, setDoneOpen, doneInv, waOpen, setWaOpen, waPreview, waMsg, setWaMsg,
    brandFilter, setBrandFilter, catFilter, setCatFilter, picked, setPicked, clock,
    listId, setListId, err, setErr, busy, custOpen, setCustOpen,
    retOpen, setRetOpen, retNo, setRetNo, retInv, setRetInv, retItems, setRetItems,
    newCust, setNewCust, qtyField, setQtyField, priceField, setPriceField,
    partyKind, setPartyKind, accountCode, setAccountCode, supplier, setSupplier,
    forceGoods, setForceGoods, showGoods, partyHits, applyParty, saveAccount, addPicked,
    searchRef, customerRef, qtyRef, priceRef, extraRef, custBlurRef, suggest,
    visible, offerDisc, pickPrice, pickProduct, locLines, canSell, add, addFromSearch, clearCart,
    subtotal, discAmt, taxAmount, total, remaining, creditNeedCustomer,
    printRows, printTotal, printExtra, related, waEnabled, cartQty,
    loadToday, loadHeldList, setStockTick, openHeld, cancelHeld, previewWa, submit, holdInvoice,
  };
}
