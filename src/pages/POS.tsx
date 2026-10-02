import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronDown, Minus, MoreHorizontal, Plus, Search, ShoppingBag, X } from "lucide-react";
import { useApp } from "../context";
import { get, post } from "../lib/api";
import { apiMessage } from "../lib/errors";
import { money, num, statusClass, statusLabel } from "../lib/format";
import { Btn, Field, Modal, PrintBtn, PrintLetterhead, Stat, inputCls } from "../components/ui";
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
  supplier_name?: string;
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

function todayIso() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
}

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
  const [todayStats, setTodayStats] = useState({ sales_today: 0, collected_today: 0, credit_today: 0, invoices_today: 0 });
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
  const searchRef = useRef<HTMLInputElement>(null);
  const customerRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const extraRef = useRef<HTMLInputElement>(null);
  const custBlurRef = useRef<number>(0);
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
  }, [q, listId, kindFilter, typeFilter, brandFilter, catFilter, stockTick]);

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
  }, []);

  useEffect(() => {
    if (!custListOpen) return;
    const q = customerQ.trim();
    const local = q
      ? custPool.filter((c) => [c.name, c.phone, c.whatsapp, c.area, c.city, String(c.id)].some((v) => String(v || "").toLowerCase().includes(q.toLowerCase())))
      : custPool;
    setCustomers(local);
    if (!q) return;
    const tmr = setTimeout(() => {
      get<{ data: any[] }>(`/api/customers?pageSize=50&q=${encodeURIComponent(q)}`).then((r) => setCustomers(r.data || local)).catch(() => {});
    }, 200);
    return () => clearTimeout(tmr);
  }, [customerQ, custListOpen, custPool]);

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
    setDiscMode("egp");
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

  async function loadToday() {
    const r = await get<{
      sales_today: number;
      collected_today: number;
      credit_today: number;
      invoices_today: number;
      invoices: any[];
    }>("/api/pos/today");
    setTodayStats({
      sales_today: Number(r.sales_today) || 0,
      collected_today: Number(r.collected_today) || 0,
      credit_today: Number(r.credit_today) || 0,
      invoices_today: Number(r.invoices_today) || 0,
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
  }, []);

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

      <div className="no-print flex h-[calc(100dvh-4.5rem)] min-h-0 flex-col md:flex-row">
        <section className="flex min-h-0 min-w-0 flex-[7] flex-col overflow-hidden bg-[var(--surface-2)]">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-[var(--surface)] px-3 py-2">
            <div className="relative min-w-[12rem] flex-1">
              <Search className="pointer-events-none absolute start-2 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchRef}
                className={`${inputCls} ps-8`}
                placeholder={tr("searchProduct")}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addFromSearch(); }}
              />
            </div>
            <button
              type="button"
              className={`rounded-full px-3 py-1.5 text-xs font-bold ${type === "delivery" ? "bg-[var(--ink)] text-white" : "border border-slate-200 bg-[var(--surface)]"}`}
              onClick={() => setType(type === "delivery" ? "normal" : "delivery")}
            >
              {tr("deliverySale")}
            </button>
            <button type="button" className="relative rounded-full border border-slate-200 px-3 py-1.5 text-xs font-bold" onClick={() => void openHeld()}>
              {tr("heldInvoices")}
              {held.length ? <span className="ms-1 rounded-full bg-rose-500 px-1.5 text-[10px] text-white">{held.length}</span> : null}
            </button>
            <button type="button" className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-bold" onClick={() => setExtrasOpen(true)}>
              <MoreHorizontal size={14} /> {tr("posMore")}
            </button>
            <div className="ms-auto text-xs text-slate-500">
              <b>{clock.toLocaleTimeString(lang === "ar" ? "ar-EG" : "en-GB", { hour: "2-digit", minute: "2-digit" })}</b>
            </div>
          </div>
          {type === "delivery" ? (
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-[var(--surface)] px-3 py-2">
              <select className={`${inputCls} w-44`} value={agentId} onChange={(e) => setAgentId(e.target.value ? Number(e.target.value) : "")}>
                <option value="">{tr("agent")}</option>
                {(lookups?.delivery_agents || []).filter((a) => !a.role_type || a.role_type === "delivery" || a.role_type === "both").map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              <input className={`${inputCls} w-32`} type="number" placeholder={tr("deliveryFee")} value={extraAmount} onChange={(e) => setExtraAmount(Number(e.target.value))} />
              <input className={`${inputCls} w-40`} placeholder={tr("address")} value={address} onChange={(e) => setAddress(e.target.value)} />
              <input className={`${inputCls} w-28`} placeholder={tr("area")} value={area} onChange={(e) => setArea(e.target.value)} />
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2 overflow-x-auto px-3 py-2">
            <button
              type="button"
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${kindFilter === "" && brandFilter === "" && typeFilter === "" && catFilter === "" ? "bg-[var(--ink)] text-white" : "border border-slate-200 bg-[var(--surface)]"}`}
              onClick={() => { setKindFilter(""); setTypeFilter(""); setBrandFilter(""); setCatFilter(""); }}
            >
              {tr("all")}
            </button>
            <button
              type="button"
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${kindFilter === "product" ? "bg-[var(--ink)] text-white" : "border border-slate-200 bg-[var(--surface)]"}`}
              onClick={() => setKindFilter(kindFilter === "product" ? "" : "product")}
            >
              {tr("products")}
            </button>
            <button
              type="button"
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${kindFilter === "service" ? "bg-[var(--ink)] text-white" : "border border-slate-200 bg-[var(--surface)]"}`}
              onClick={() => setKindFilter(kindFilter === "service" ? "" : "service")}
            >
              {tr("services")}
            </button>
            {(lookups?.categories || []).map((c) => (
              <button
                key={`cat-${c.id}`}
                type="button"
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${catFilter === c.id ? "bg-[var(--ink)] text-white" : "border border-slate-200 bg-[var(--surface)]"}`}
                onClick={() => setCatFilter(catFilter === c.id ? "" : c.id)}
              >
                {lang === "ar" ? c.name_ar : c.name_en}
              </button>
            ))}
            {(lookups?.brands || []).map((b) => (
              <button
                key={`brand-${b.id}`}
                type="button"
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${brandFilter === b.id ? "bg-[var(--ink)] text-white" : "border border-slate-200 bg-[var(--surface)]"}`}
                onClick={() => setBrandFilter(brandFilter === b.id ? "" : b.id)}
              >
                {lang === "ar" ? b.name_ar : b.name_en}
              </button>
            ))}
            {(lookups?.part_types || []).map((t) => (
              <button
                key={`pt-${t.id}`}
                type="button"
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${typeFilter === t.id ? "bg-[var(--ink)] text-white" : "border border-slate-200 bg-[var(--surface)]"}`}
                onClick={() => setTypeFilter(typeFilter === t.id ? "" : t.id)}
              >
                {lang === "ar" ? t.name_ar : t.name_en}
              </button>
            ))}
          </div>
          {related.length ? (
            <div className="gx-related px-3">
              {related.map((p) => (
                <button key={`rel-${p.id}`} type="button" className="gx-related-item" onClick={() => add(p)}>
                  <div className="text-xs font-bold">{lang === "ar" ? p.name_ar : p.name_en}</div>
                  <div className="mt-1 text-[11px]">{money(p.selling_price, lang)}</div>
                </button>
              ))}
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
              {visible.map((p) => {
                const sell = canSell(p);
                const loc = locLines(p);
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={!sell}
                    onClick={() => { if (sell) add(p); else playSound("err"); }}
                    className={`relative rounded-2xl border border-slate-200 bg-[var(--surface)] p-3 text-start shadow-sm transition ${sell ? "hover:border-[var(--ink)]" : "cursor-not-allowed opacity-50 grayscale"} ${picked === p.id ? "ring-2 ring-[var(--ink)]" : ""}`}
                  >
                    {sell ? (
                      <span className="absolute end-2 top-2 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-black">{p.kind === "service" || p.non_stock ? "∞" : num(p.available, lang)}</span>
                    ) : (
                      <span className="absolute end-2 top-2 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-black text-rose-700">{tr("nfd")}</span>
                    )}
                    <div className="pe-10 text-sm font-black leading-snug">{lang === "ar" ? p.name_ar : p.name_en}</div>
                    <div className="mt-1 text-[11px] text-slate-500">{(lang === "ar" ? p.category_ar : p.category_en) || tr("category")}</div>
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      {[(lang === "ar" ? p.brand_ar : p.brand_en), (lang === "ar" ? p.part_type_ar : p.part_type_en)].filter(Boolean).join(" · ") || "—"}
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-slate-400">{p.barcode || p.sku}</div>
                    {loc.length ? <div className="mt-1 space-y-0.5 text-[10px] text-slate-500">{loc.map((row) => <div key={row}>{row}</div>)}</div> : null}
                    {p.supplier_name ? <div className="mt-1 text-[11px] text-slate-500">{tr("supplier")}: {p.supplier_name}</div> : null}
                    <div className="mt-2 text-base font-black text-[var(--ink)]">{money(pickPrice(p), lang)}</div>
                  </button>
                );
              })}
            </div>
            {!visible.length ? <div className="py-16 text-center text-sm text-slate-400">{tr("noResults")}</div> : null}
          </div>
        </section>

        <aside className="flex min-h-0 min-w-0 flex-[3] flex-col border-s border-slate-200 bg-[var(--surface)] md:max-w-[32%]">
          <div className="relative z-30 space-y-2 overflow-visible border-b border-slate-200 p-3">
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <input
                  ref={customerRef}
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
                    custBlurRef.current = window.setTimeout(() => setCustListOpen(false), 200);
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
                          if (c.price_list_id) setListId(Number(c.price_list_id));
                          setCustListOpen(false);
                        }}
                      >
                        <div className="font-bold">{c.name}</div>
                        <div className="text-[11px] text-slate-500">{[c.phone, c.area, c.city].filter(Boolean).join(" · ")}</div>
                      </button>
                    ))}
                    {!customers.length ? <div className="px-3 py-3 text-sm text-slate-400">{tr("noResults")}</div> : null}
                  </div>
                ) : null}
              </div>
              <button type="button" className="shrink-0 rounded-xl border border-slate-200 px-2 text-xs font-bold" onClick={() => setCustOpen(true)}>+ {tr("new")}</button>
            </div>
            <div className="flex gap-1 overflow-x-auto">
              <button type="button" className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${listId === "" ? "bg-[var(--ink)] text-white" : "border border-slate-200"}`} onClick={() => setListId("")}>{tr("priceList")}</button>
              {(lookups?.price_lists || []).map((l) => (
                <button key={l.id} type="button" className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${listId === l.id ? "bg-[var(--ink)] text-white" : "border border-slate-200"}`} onClick={() => setListId(l.id)}>
                  {lang === "ar" ? l.name : (l.name_en || l.name)}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {cart.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-slate-400">
                <ShoppingBag size={36} />
                <div className="text-sm font-bold">{tr("cartEmpty")}</div>
                <div className="text-xs">{tr("emptyCart")}</div>
              </div>
            ) : (
              <div className="space-y-2">
                {cart.map((l, i) => (
                  <div key={`${l.id}-${l.unit_name}-${i}`} className={`rounded-xl border px-3 py-2 ${sel === i ? "border-[var(--ink)]" : "border-slate-200"}`} onClick={() => setSel(i)}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold">{lang === "ar" ? l.name_ar : l.name_en}</div>
                        <div className="text-[11px] text-slate-400">{l.sku}{l.unit_name ? ` · ${l.unit_name}` : ""}</div>
                      </div>
                      <button type="button" className="text-rose-500" onClick={() => setCart((c) => c.filter((_, j) => j !== i))}><X size={14} /></button>
                    </div>
                    {l.track_serial ? (
                      <input className={`${inputCls} mt-1`} placeholder={tr("serials")} value={l.serials.join(",")} onChange={(e) => setCart((c) => c.map((x, j) => (j === i ? { ...x, serials: e.target.value.split(/[,]+/).map((s) => s.trim()).filter(Boolean) } : x)))} />
                    ) : null}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        <button type="button" className="rounded-lg border p-1" onClick={() => setCart((c) => c.map((x, j) => {
                          if (j !== i) return x;
                          const qty = Math.max(1, x.qty - 1);
                          return { ...x, qty, discount: offerDisc(x.id, qty, x.unit_price) };
                        }))}><Minus size={12} /></button>
                        <span className="w-8 text-center text-sm font-black">{l.qty}</span>
                        <button type="button" className="rounded-lg border p-1" onClick={() => setCart((c) => c.map((x, j) => {
                          if (j !== i) return x;
                          const cap = x.kind === "service" || x.non_stock ? 9999 : Math.max(1, Number(x.available) || 1);
                          const qty = Math.min(x.qty + 1, cap);
                          return { ...x, qty, discount: offerDisc(x.id, qty, x.unit_price) };
                        }))}><Plus size={12} /></button>
                      </div>
                      <div className="text-sm font-black">{money(l.qty * l.unit_price - l.discount, lang)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="sticky bottom-0 space-y-2 border-t border-slate-200 bg-[var(--surface)] p-3">
            <div className="flex items-center justify-between text-sm">
              <span>{tr("subtotal")}</span>
              <span className="font-bold">{money(subtotal, lang)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold">{tr("discount")}</span>
              <input className={`${inputCls} w-20`} type="number" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} />
              <button type="button" className={`rounded-full px-2 py-1 text-[11px] font-bold ${discMode === "egp" ? "bg-[var(--ink)] text-white" : "border"}`} onClick={() => setDiscMode("egp")}>{tr("discountEgp")}</button>
              <button type="button" className={`rounded-full px-2 py-1 text-[11px] font-bold ${discMode === "pct" ? "bg-[var(--ink)] text-white" : "border"}`} onClick={() => setDiscMode("pct")}>%</button>
              <span className="ms-auto text-xs text-slate-500">{money(discAmt, lang)}</span>
            </div>
            {type === "delivery" ? (
              <div className="flex items-center justify-between text-sm">
                <span>{tr("deliveryFee")}</span>
                <span className="font-bold">{money(Number(extraAmount || 0), lang)}</span>
              </div>
            ) : null}
            {taxOn ? (
              <div className="flex items-center justify-between text-sm">
                <span>{tr("taxAmount")}</span>
                <span>{money(taxAmount, lang)}</span>
              </div>
            ) : null}
            <div className="flex items-end justify-between">
              <span className="text-sm font-bold">{tr("total")}</span>
              <span className="text-2xl font-black text-[var(--ink)]">{money(total, lang)}</span>
            </div>
            <div className="flex gap-1">
              {[{ code: "cash", label: tr("posPayCash") }, { code: "visa", label: tr("posPayCard") }, { code: "credit", label: tr("posPayCredit") }].map((b) => (
                <button key={b.code} type="button" className={`flex-1 rounded-xl py-1.5 text-xs font-bold ${method === b.code ? "bg-[var(--ink)] text-white" : "border border-slate-200"}`} onClick={() => setMethod(b.code)}>{b.label}</button>
              ))}
            </div>
            <label className="flex items-center justify-between gap-2 text-xs">
              <span>{tr("invoiceDate")}</span>
              <input className={`${inputCls} w-36`} type="date" value={invDate} onChange={(e) => { setInvDate(e.target.value); if (method === "credit") setDue(e.target.value); }} />
            </label>
            {method === "credit" ? (
              <label className="flex items-center justify-between gap-2 text-xs">
                <span>{tr("dueDate")}</span>
                <input className={`${inputCls} w-36`} type="date" value={due} onChange={(e) => setDue(e.target.value)} />
              </label>
            ) : null}
            {err ? <div className="text-sm text-rose-600">{err}</div> : null}
            <div className="grid grid-cols-1 gap-2">
              <Btn kind="ghost" disabled={busy || !cart.length} onClick={holdInvoice}>{tr("posHold")}</Btn>
              <Btn className="gx-confirm" disabled={busy || !cart.length || !can("sales.create") || creditNeedCustomer} onClick={() => submit({ print: true })}>{quoteMode ? tr("quoteMode") : tr("confirmSale")}</Btn>
              <Btn className="gx-quiet" disabled={busy || !cart.length || !can("sales.create") || creditNeedCustomer} onClick={() => submit()}>{tr("saleWithoutPrint")}</Btn>
            </div>
          </div>
        </aside>
      </div>

      <Modal open={extrasOpen} title={tr("posMore")} onClose={() => setExtrasOpen(false)} wide>
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Stat label={tr("salesToday")} value={money(todayStats.sales_today, lang)} hint={`${num(todayStats.invoices_today, lang)} ${tr("invoicesCount")}`} />
            <Stat label={tr("collected")} value={money(todayStats.collected_today, lang)} accent="emerald" />
            <Stat label={tr("accountCredit")} value={money(todayStats.credit_today, lang)} accent="rose" />
          </div>
          <div>
            <div className="mb-2 text-sm font-bold">{tr("todayTransactions")}</div>
            {!todayInv.length ? <div className="text-sm text-slate-400">{tr("noData")}</div> : (
              <div className="max-h-32 space-y-1 overflow-auto">
                {todayInv.map((h) => (
                  <button key={h.id} type="button" className="flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-start text-sm" onClick={() => nav(`/sales/${h.id}`)}>
                    <span>{h.number} · {h.customer_name || tr("walkIn")} · {statusLabel(h.status, lang)}</span>
                    <span className="font-bold">{money(h.total, lang)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <label className="text-xs">
              <span className="mb-1 block font-bold">{tr("qty")} F5</span>
              <input ref={qtyRef} className={inputCls} type="number" min={1} value={qtyField} onChange={(e) => setQtyField(Number(e.target.value) || 1)} />
            </label>
            <label className="text-xs">
              <span className="mb-1 block font-bold">{tr("sellingPrice")} F6</span>
              <input ref={priceRef} className={inputCls} value={priceField} onChange={(e) => setPriceField(e.target.value)} />
            </label>
            <label className="text-xs">
              <span className="mb-1 block font-bold">{tr("posExtra")} F7</span>
              <input ref={extraRef} className={inputCls} type="number" value={extraAmount} onChange={(e) => setExtraAmount(Number(e.target.value))} />
            </label>
            <label className="text-xs">
              <span className="mb-1 block font-bold">{tr("tax")} %</span>
              <span className="flex items-center gap-1">
                <input type="checkbox" checked={taxOn} onChange={(e) => setTaxOn(e.target.checked)} />
                <input className={inputCls} type="number" value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))} />
              </span>
            </label>
            <label className="text-xs">
              <span className="mb-1 block font-bold">{tr("notes")}</span>
              <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
            <label className="text-xs">
              <span className="mb-1 block font-bold">{tr("salesAgent")}</span>
              <select className={inputCls} value={salesAgentId} onChange={(e) => setSalesAgentId(e.target.value ? Number(e.target.value) : "")}>
                <option value="">-</option>
                {(lookups?.delivery_agents || []).filter((a) => !a.role_type || a.role_type === "sales" || a.role_type === "both").map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </label>
            {(method === "cash" || method === "treasury") ? (
              <label className="text-xs">
                <span className="mb-1 block font-bold">{tr("cashAccount")}</span>
                <select className={inputCls} value={cashAccountId} onChange={(e) => setCashAccountId(e.target.value ? Number(e.target.value) : "")}>
                  <option value="">-</option>
                  {(lookups?.cash_accounts || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </label>
            ) : null}
            {(method === "credit" || type === "delivery") ? (
              <label className="text-xs">
                <span className="mb-1 block font-bold">{tr("paid")}</span>
                <input className={inputCls} type="number" value={paid} onChange={(e) => setPaid(Number(e.target.value))} />
              </label>
            ) : null}
          </div>
          <div>
            <div className="mb-1 text-xs font-bold">{tr("splitPay")}</div>
            {pays.map((p, i) => (
              <div key={i} className="mb-1 flex gap-2">
                <select className={inputCls} value={p.method} onChange={(e) => setPays(pays.map((x, j) => j === i ? { ...x, method: e.target.value } : x))}>
                  <option value="cash">{tr("posPayCash")}</option>
                  <option value="visa">{tr("posPayCard")}</option>
                  <option value="treasury">{tr("posPayTreasury")}</option>
                </select>
                <input className={inputCls} type="number" value={p.amount} onChange={(e) => setPays(pays.map((x, j) => j === i ? { ...x, amount: Number(e.target.value) } : x))} />
              </div>
            ))}
            <button type="button" className="text-xs font-bold text-cyan-700" onClick={() => setPays([...pays, { method: "cash", amount: 0 }])}>{tr("addPayment")}</button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Btn kind="soft" disabled={busy || !cart.length || !can("sales.create")} onClick={() => submit({ paid: total, method: "cash" })}>{tr("payNow")}</Btn>
            <PrintBtn />
            <Btn kind="ghost" disabled={busy || !cart.length} onClick={() => submit({ quote: true })}>{tr("reserveQuote")}</Btn>
            <Btn kind="ghost" disabled={busy || !cart.length} onClick={() => submit({ order: true })}>{tr("saveOrder")}</Btn>
            <Btn kind="ghost" onClick={clearCart}>{tr("posClear")} F4</Btn>
            {can("returns.create") ? <Btn kind="ghost" onClick={() => { setExtrasOpen(false); setRetOpen(true); }}>{tr("returnFromInvoice")}</Btn> : null}
          </div>
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
                      <div className="flex flex-wrap gap-2 text-xs font-bold">
                        <button type="button" className="text-cyan-700" onClick={() => { setHeldOpen(false); nav(`/pos?held=${h.id}`); }}>{tr("restoreHeld")}</button>
                        <button type="button" className="text-slate-600" onClick={() => nav(`/sales/${h.id}`)}>{tr("preview")}</button>
                        <button type="button" className="text-cyan-700" onClick={() => { setHeldOpen(false); nav(`/sales/${h.id}`); setTimeout(() => window.print(), 400); }}>{tr("print")}</button>
                        <button type="button" className="text-emerald-700" disabled={!waEnabled || !can("whatsapp.send")} onClick={() => void previewWa(h.id)}>{tr("whatsapp")}</button>
                        <button type="button" className="text-rose-600" onClick={() => void cancelHeld(h.id)}>{tr("delete")}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!held.length ? <div className="p-3 text-sm text-slate-400">{tr("noData")}</div> : null}
          </div>
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
                  setStockTick((n) => n + 1);
                  await loadToday().catch(() => {});
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
