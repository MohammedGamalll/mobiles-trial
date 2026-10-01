import { Hono } from "hono";
import {
  audit,
  getSettings,
  like,
  nextNumber,
  notify,
  paginate,
  round2,
  todayIso,
  type AppBindings,
  type AppVars,
  type AppDb,
} from "../lib/helpers";
import { applyInvoiceListFilters, INVOICE_SORT, listParams, sortSql } from "../lib/filters";
import { requirePerm } from "../lib/auth";
import { accrueCommission } from "../lib/commission";
import { postCollectionJournal, postReturnJournal, postSaleJournal, reverseJournal, tryLedger } from "../lib/ledger";
import { invoiceTotals, settleReturn } from "../lib/invoice-math";
import {
  applyIssue,
  applyReserve,
  availableBatches,
  logMovement,
  maybeStockAlerts,
  planAllocation,
  releaseReserve,
  restockToBatch,
  weightedCost,
  type Allocation,
} from "../lib/stock";
import { invoiceTemplateVars, renderTemplate, waLink } from "../lib/whatsapp";

export const salesRoutes = new Hono<{ Bindings: AppBindings; Variables: AppVars }>();

type CartItem = {
  product_id: number;
  quantity: number;
  unit_price: number;
  discount?: number;
  batch_id?: number | null;
  notes?: string;
  serials?: string[];
  unit_name?: string;
  unit_factor?: number;
};

salesRoutes.get("/invoices/last-price", requirePerm("sales.create", "sales.view"), async (c) => {
  const url = new URL(c.req.url);
  const customerId = Number(url.searchParams.get("customer_id") || 0);
  const productId = Number(url.searchParams.get("product_id") || 0);
  if (!customerId || !productId) return c.json({ price: null });
  const row = await c.env.DB
    .prepare(
      `SELECT sii.unit_price FROM sales_invoice_items sii
       JOIN sales_invoices si ON si.id = sii.invoice_id
       WHERE si.customer_id = ? AND sii.product_id = ? AND si.deleted_at IS NULL
         AND si.status NOT IN ('cancelled','held','quote','order','draft')
       ORDER BY si.id DESC LIMIT 1`,
    )
    .bind(customerId, productId)
    .first<{ unit_price: number }>();
  return c.json({ price: row?.unit_price ?? null });
});

salesRoutes.get("/invoices", requirePerm("sales.view"), async (c) => {
  const url = new URL(c.req.url);
  const p = listParams(url);
  const { page, pageSize, offset } = paginate(url);
  const user = c.get("user");
  const where = ["si.deleted_at IS NULL"];
  const params: (string | number)[] = [];
  await applyInvoiceListFilters(c.env.DB, where, params, p, user);
  const whereSql = where.join(" AND ");
  const count = await c.env.DB.prepare(`SELECT COUNT(*) as n FROM sales_invoices si WHERE ${whereSql}`).bind(...params).first<{ n: number }>();
  const sums = await c.env.DB
    .prepare(`SELECT COALESCE(SUM(si.total),0) as total, COALESCE(SUM(si.paid),0) as paid, COALESCE(SUM(si.remaining),0) as remaining FROM sales_invoices si WHERE ${whereSql}`)
    .bind(...params)
    .first<{ total: number; paid: number; remaining: number }>();
  const { results } = await c.env.DB
    .prepare(`SELECT si.* FROM sales_invoices si WHERE ${whereSql} ${sortSql(p.sort, INVOICE_SORT, "si.id DESC")} LIMIT ? OFFSET ?`)
    .bind(...params, pageSize, offset)
    .all();
  return c.json({
    data: results,
    total: count?.n || 0,
    page,
    pageSize,
    totals: { count: count?.n || 0, total: sums?.total || 0, paid: sums?.paid || 0, remaining: sums?.remaining || 0 },
  });
});

async function loadInvoice(db: AppDb, id: number) {
  const inv = await db.prepare("SELECT * FROM sales_invoices WHERE id = ? AND deleted_at IS NULL").bind(id).first();
  if (!inv) return null;
  const items = await db
    .prepare(
      `SELECT sii.*, p.sku as product_sku, p.name_en as name_en, p.kind as product_kind
       FROM sales_invoice_items sii JOIN products p ON p.id = sii.product_id WHERE sii.invoice_id = ?`,
    )
    .bind(id)
    .all();
  const batches = await db
    .prepare(
      `SELECT sib.*, ib.batch_code FROM sales_item_batches sib
       JOIN sales_invoice_items sii ON sii.id = sib.invoice_item_id
       JOIN inventory_batches ib ON ib.id = sib.batch_id
       WHERE sii.invoice_id = ?`,
    )
    .bind(id)
    .all();
  const serials = await db.prepare("SELECT * FROM product_serials WHERE invoice_id = ?").bind(id).all();
  const payments = await db.prepare("SELECT * FROM payments WHERE invoice_id = ? AND voided_at IS NULL").bind(id).all();
  const results = await db.prepare("SELECT * FROM delivery_results WHERE invoice_id = ? ORDER BY id DESC").bind(id).all();
  const wa = await db.prepare("SELECT * FROM whatsapp_logs WHERE invoice_id = ? ORDER BY id DESC").bind(id).all();
  const salesAgent = (inv as { sales_agent_id?: number | null }).sales_agent_id
    ? await db.prepare("SELECT name, code FROM delivery_agents WHERE id = ?").bind((inv as { sales_agent_id: number }).sales_agent_id).first<{ name: string; code: string }>()
    : null;
  return {
    ...inv,
    items: items.results,
    item_batches: batches.results,
    serials: serials.results,
    payments: payments.results,
    delivery_results: results.results,
    whatsapp_logs: wa.results,
    sales_agent_name: salesAgent?.name || null,
    sales_agent_code: salesAgent?.code || null,
  };
}

salesRoutes.get("/invoices/:id", requirePerm("sales.view", "delivery.view"), async (c) => {
  const data = await loadInvoice(c.env.DB, Number(c.req.param("id")));
  if (!data) return c.json({ error: "not_found" }, 404);
  const user = c.get("user");
  if (user.role_slug === "delivery" && user.delivery_agent_id && (data as { delivery_agent_id: number }).delivery_agent_id !== user.delivery_agent_id) {
    return c.json({ error: "forbidden" }, 403);
  }
  if (user.role_slug !== "admin" && !user.permissions.includes("costs.view")) {
    const hide = data as { cost_total?: number; profit?: number; items: { unit_cost?: number; profit?: number }[] };
    hide.cost_total = 0;
    hide.profit = 0;
    for (const it of hide.items || []) {
      it.unit_cost = 0;
      it.profit = 0;
    }
  }
  return c.json({ data });
});

salesRoutes.post("/invoices", requirePerm("sales.create"), async (c) => {
  const b = await c.req.json<{
    type?: "normal" | "delivery";
    hold?: boolean;
    quote?: boolean;
    order?: boolean;
    reserve?: boolean;
    branch_id?: number | null;
    tax_rate?: number;
    price_list_id?: number;
    payments?: { method: string; amount: number }[];
    customer_id?: number | null;
    customer_name?: string;
    customer_phone?: string;
    customer_whatsapp?: string;
    address?: string;
    area?: string;
    delivery_agent_id?: number | null;
    sales_agent_id?: number | null;
    expected_delivery_time?: string;
    payment_method?: string;
    paid?: number;
    discount?: number;
    due_date?: string;
    notes?: string;
    client_token?: string;
    extra_amount?: number;
    cash_account_id?: number | null;
    items: CartItem[];
  }>();
  if (!b.items?.length) return c.json({ error: "no_items" }, 400);
  if (b.client_token) {
    const dup = await c.env.DB.prepare("SELECT id FROM sales_invoices WHERE client_token = ?").bind(b.client_token).first<{ id: number }>();
    if (dup) return c.json({ data: await loadInvoice(c.env.DB, dup.id), duplicate: true }, 200);
  }
  const user = c.get("user");
  const type = b.type === "delivery" ? "delivery" : "normal";
  let customer = null as null | {
    id: number;
    name: string;
    phone: string | null;
    whatsapp: string | null;
    address: string | null;
    area: string | null;
    current_balance: number;
    credit_limit: number;
    price_list_id?: number | null;
  };
  if (b.customer_id) {
    customer = await c.env.DB.prepare("SELECT * FROM customers WHERE id = ?").bind(b.customer_id).first();
  }
  let agent = null as null | { id: number; name: string; code: string; phone: string | null };
  if (type === "delivery" && b.delivery_agent_id) {
    agent = await c.env.DB.prepare("SELECT * FROM delivery_agents WHERE id = ?").bind(b.delivery_agent_id).first();
  }
  let salesAgentId = b.sales_agent_id || null;
  if (salesAgentId) {
    const salesAgent = await c.env.DB.prepare("SELECT id FROM delivery_agents WHERE id = ? AND deleted_at IS NULL").bind(salesAgentId).first();
    if (!salesAgent) salesAgentId = null;
  }
  const planned: { item: CartItem; product: { id: number; name_ar: string; sku: string; min_selling_price: number; selling_price: number; kind: string; track_serial?: number }; alloc: Allocation[]; lineTotal: number; unitCost: number; isService: boolean; stockQty: number }[] = [];
  const reserveHold = !!(b.reserve && (b.quote || b.hold || b.order));
  for (const item of b.items) {
    const product = await c.env.DB
      .prepare("SELECT id, name_ar, sku, min_selling_price, selling_price, current_stock, reserved_stock, kind, purchase_price, track_serial, non_stock FROM products WHERE id = ? AND deleted_at IS NULL AND active = 1")
      .bind(item.product_id)
      .first<{
        id: number;
        name_ar: string;
        sku: string;
        min_selling_price: number;
        selling_price: number;
        current_stock: number;
        reserved_stock: number;
        kind: string;
        purchase_price: number;
        track_serial: number;
        non_stock: number;
      }>();
    if (!product) return c.json({ error: "product_missing", product_id: item.product_id }, 400);
    if (item.unit_price < Number(product.min_selling_price || 0) && user.role_slug !== "admin" && !user.permissions.includes("sales.override_min")) {
      return c.json({ error: "below_min_price", sku: product.sku }, 400);
    }
    const isService = product.kind === "service" || Number(product.non_stock) === 1;
    let alloc: Allocation[] = [];
    let unitCost = Number(product.purchase_price || 0);
    if (!isService && product.track_serial && !b.hold && !b.quote && !b.order) {
      const serials = (item.serials || []).map((s) => String(s).trim()).filter(Boolean);
      if (serials.length !== item.quantity) return c.json({ error: "serials_required", sku: product.sku }, 400);
      for (const serial of serials) {
        const row = await c.env.DB.prepare("SELECT id FROM product_serials WHERE product_id=? AND serial=? AND status='in_stock'").bind(product.id, serial).first();
        if (!row) return c.json({ error: "serial_missing", sku: product.sku, serial }, 400);
      }
    }
    const factor = Number(item.unit_factor || 1) || 1;
    const stockQty = item.quantity * factor;
    if (!isService && ((!b.hold && !b.quote && !b.order) || reserveHold)) {
      const batches = await availableBatches(c.env.DB, product.id);
      try {
        alloc = planAllocation(batches, stockQty, item.batch_id);
        unitCost = weightedCost(alloc);
      } catch {
        const settingsEarly = await getSettings(c.env.DB);
        const allowNeg = settingsEarly.allow_negative_stock === "1" && (user.role_slug === "admin" || user.permissions.includes("sales.override_min"));
        if (!allowNeg) return c.json({ error: "insufficient_stock", sku: product.sku }, 400);
        alloc = [];
        unitCost = Number(product.purchase_price || 0);
      }
    }
    const lineTotal = round2(item.quantity * item.unit_price - (item.discount || 0));
    planned.push({ item, product, alloc, lineTotal, unitCost, isService, stockQty });
  }
  const subtotal = round2(planned.reduce((s, p) => s + p.item.quantity * p.item.unit_price, 0));
  const lineDiscount = round2(planned.reduce((s, p) => s + (p.item.discount || 0), 0));
  const settings = await getSettings(c.env.DB);
  const taxRate = b.tax_rate != null ? Number(b.tax_rate) : settings.tax_enabled === "1" ? Number(settings.tax_rate || 0) : 0;
  const extra = round2(Number(b.extra_amount || 0));
  const totals = invoiceTotals(subtotal, lineDiscount, b.discount || 0, taxRate);
  const discount = totals.discount;
  const taxAmount = totals.tax;
  const total = round2(totals.total + extra);
  const costTotal = round2(planned.reduce((s, p) => s + p.unitCost * p.stockQty, 0));
  const profit = round2(total - costTotal);
  const hold = !!b.hold || !!b.quote || !!b.order;
  const splitPays = (b.payments || []).filter((p) => Number(p.amount) > 0).map((p) => ({ method: p.method || "cash", amount: round2(p.amount) }));
  const paid = hold
    ? 0
    : splitPays.length
      ? round2(splitPays.reduce((s, p) => s + p.amount, 0))
      : round2(b.payment_method === "credit" ? b.paid || 0 : b.paid ?? (type === "normal" ? total : 0));
  const remaining = hold ? 0 : round2(total - paid);
  if (!hold && b.payment_method === "credit" && customer && customer.credit_limit > 0 && customer.current_balance + remaining > customer.credit_limit) {
    return c.json({ error: "credit_limit" }, 400);
  }
  const number = await nextNumber(c.env.DB, "sales");
  const payState = remaining <= 0 ? "completed" : paid > 0 ? "partial" : "completed";
  const status = b.order ? "order" : b.quote ? "quote" : hold ? "held" : type === "delivery" ? "pending_delivery" : payState;
  const deliveryStatus = hold ? null : type === "delivery" ? "pending_delivery" : null;
  const ins = await c.env.DB
    .prepare(
      `INSERT INTO sales_invoices (
        number, date, type, status, delivery_status, customer_id, customer_name, customer_phone, customer_whatsapp,
        address, area, delivery_agent_id, delivery_agent_name, delivery_agent_code, delivery_agent_phone,
        expected_delivery_time, payment_method, subtotal, discount, total, paid, remaining, cost_total, profit, due_date, notes, created_by, completed_at,
        tax_rate, tax_amount, price_list_id, held_at, branch_id, client_token
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      number,
      todayIso(),
      type,
      status,
      deliveryStatus,
      customer?.id || null,
      b.customer_name || customer?.name || null,
      b.customer_phone || customer?.phone || null,
      b.customer_whatsapp || customer?.whatsapp || customer?.phone || null,
      b.address || customer?.address || null,
      b.area || customer?.area || null,
      agent?.id || null,
      agent?.name || null,
      agent?.code || null,
      agent?.phone || null,
      b.expected_delivery_time || null,
      b.payment_method || "cash",
      subtotal,
      discount,
      total,
      paid,
      remaining,
      costTotal,
      profit,
      b.due_date || null,
      b.notes || null,
      user.id,
      hold || type !== "normal" ? null : todayIso(),
      taxRate,
      taxAmount,
      b.price_list_id || customer?.price_list_id || null,
      hold ? todayIso() : null,
      b.branch_id || 1,
      b.client_token || null,
    )
    .run();
  const invoiceId = ins.meta.last_row_id;
  if (extra || b.cash_account_id) {
    await c.env.DB
      .prepare("UPDATE sales_invoices SET extra_amount = ?, cash_account_id = ? WHERE id = ?")
      .bind(extra, b.cash_account_id || null, invoiceId)
      .run();
  }
  for (const p of planned) {
    const itemIns = await c.env.DB
      .prepare(
        `INSERT INTO sales_invoice_items (invoice_id, product_id, product_name, sku, quantity, delivered_qty, returned_qty, unit_price, discount, total, unit_cost, profit, notes, item_kind, unit_name, unit_factor)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        invoiceId,
        p.product.id,
        p.product.name_ar,
        p.product.sku,
        p.item.quantity,
        hold ? 0 : type === "normal" ? p.item.quantity : 0,
        p.item.unit_price,
        p.item.discount || 0,
        p.lineTotal,
        round2(p.unitCost),
        round2(p.lineTotal - p.unitCost * p.stockQty),
        p.item.notes || null,
        p.isService ? "service" : "product",
        p.item.unit_name || null,
        Number(p.item.unit_factor || 1) || 1,
      )
      .run();
    const itemId = itemIns.meta.last_row_id;
    if ((!hold || reserveHold) && p.alloc.length) {
      await c.env.DB.batch(
        p.alloc.map((a) =>
          c.env.DB.prepare("INSERT INTO sales_item_batches (invoice_item_id, batch_id, qty, unit_cost) VALUES (?, ?, ?, ?)").bind(itemId, a.batch_id, a.qty, a.unit_cost),
        ),
      );
    }
    const serials = (p.item.serials || []).map((s) => String(s).trim()).filter(Boolean);
    if (p.isService) continue;
    if (hold) {
      if (reserveHold && p.alloc.length) {
        await applyReserve(c.env.DB, p.alloc, p.product.id);
        for (const serial of serials) {
          await c.env.DB.prepare("UPDATE product_serials SET status='reserved', invoice_id=?, invoice_item_id=? WHERE product_id=? AND serial=? AND status='in_stock'").bind(invoiceId, itemId, p.product.id, serial).run();
        }
      }
      continue;
    }
    for (const serial of serials) {
      await c.env.DB.prepare("UPDATE product_serials SET status='sold', invoice_id=?, invoice_item_id=? WHERE product_id=? AND serial=? AND status='in_stock'").bind(invoiceId, itemId, p.product.id, serial).run();
    }
    if (type === "delivery") {
      await applyReserve(c.env.DB, p.alloc, p.product.id);
      for (const a of p.alloc) {
        await logMovement(c.env.DB, {
          productId: p.product.id,
          batchId: a.batch_id,
          type: "reserve",
          qty: a.qty,
          unitCost: a.unit_cost,
          referenceType: "sale",
          referenceId: invoiceId,
          notes: `Reserve ${number}`,
          userId: user.id,
        });
      }
    } else {
      await applyIssue(c.env.DB, p.alloc, p.product.id, false);
      for (const a of p.alloc) {
        await logMovement(c.env.DB, {
          productId: p.product.id,
          batchId: a.batch_id,
          type: "out",
          qty: a.qty,
          unitCost: a.unit_cost,
          referenceType: "sale",
          referenceId: invoiceId,
          notes: `Issue ${number}`,
          userId: user.id,
        });
      }
      await maybeStockAlerts(c.env.DB, p.product.id);
    }
  }
  if (!hold && paid > 0) {
    const rows = splitPays.length ? splitPays : [{ method: b.payment_method || "cash", amount: paid }];
    for (const pay of rows) {
      await c.env.DB
        .prepare("INSERT INTO payments (invoice_id, customer_id, method, amount, date, created_by) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(invoiceId, customer?.id || null, pay.method, pay.amount, todayIso(), user.id)
        .run();
    }
  }
  if (!hold && customer && remaining > 0) {
    await c.env.DB.prepare("UPDATE customers SET current_balance = current_balance + ?, updated_at = datetime('now') WHERE id = ?").bind(remaining, customer.id).run();
  }
  if (salesAgentId) {
    await c.env.DB.prepare("UPDATE sales_invoices SET sales_agent_id = ? WHERE id = ?").bind(salesAgentId, invoiceId).run();
  }
  if (!hold && status === "completed") {
    await accrueCommission(c.env.DB, invoiceId);
  }
  if (!hold) {
    await tryLedger(() =>
      postSaleJournal(c.env.DB, { id: invoiceId, number, date: todayIso(), total, paid, remaining, payment_method: b.payment_method, cost_total: costTotal }, user.id),
    );
  }
  await audit(c.env.DB, user, "create_invoice", "invoice", invoiceId, `Create ${number}`);
  await notify(
    c.env.DB,
    type === "delivery" ? "new_delivery" : "new_sale",
    type === "delivery" ? "طلب توصيل جديد" : "عملية بيع جديدة",
    type === "delivery" ? "New delivery order" : "New sale",
    `${number} — ${formatLite(total)}`,
    `${number} — ${formatLite(total)}`,
    "invoice",
    invoiceId,
  );
  const data = await loadInvoice(c.env.DB, invoiceId);
  return c.json({ data }, 201);
});

salesRoutes.post("/invoices/:id/finalize", requirePerm("sales.create"), async (c) => {
  const id = Number(c.req.param("id"));
  const held = await loadInvoice(c.env.DB, id);
  if (!held) return c.json({ error: "not_found" }, 404);
  const row = held as { status: string; type: string; number: string; customer_id: number | null; payment_method: string; total: number; items: { id: number; product_id: number; quantity: number; unit_price: number; discount: number; item_kind?: string }[] };
  if (row.status !== "held" && row.status !== "quote" && row.status !== "order") return c.json({ error: "not_held" }, 400);
  const b = await c.req.json<{ payments?: { method: string; amount: number }[]; paid?: number; payment_method?: string }>().catch(() => ({} as { payments?: { method: string; amount: number }[]; paid?: number; payment_method?: string }));
  const user = c.get("user");
  let costTotal = 0;
  for (const item of row.items) {
    if (item.item_kind === "service") continue;
    const batches = await availableBatches(c.env.DB, item.product_id);
    let alloc: Allocation[] = [];
    try {
      alloc = planAllocation(batches, item.quantity);
    } catch {
      return c.json({ error: "insufficient_stock" }, 400);
    }
    costTotal = round2(costTotal + alloc.reduce((s, a) => s + a.qty * a.unit_cost, 0));
    if (alloc.length) {
      await c.env.DB.batch(
        alloc.map((a) =>
          c.env.DB.prepare("INSERT INTO sales_item_batches (invoice_item_id, batch_id, qty, unit_cost) VALUES (?, ?, ?, ?)").bind(item.id, a.batch_id, a.qty, a.unit_cost),
        ),
      );
    }
    if (row.type === "delivery") {
      await applyReserve(c.env.DB, alloc, item.product_id);
    } else {
      await applyIssue(c.env.DB, alloc, item.product_id, false);
      await maybeStockAlerts(c.env.DB, item.product_id);
    }
  }
  const splitPays = (b.payments || []).filter((p) => Number(p.amount) > 0).map((p) => ({ method: p.method || "cash", amount: round2(p.amount) }));
  const paid = splitPays.length ? round2(splitPays.reduce((s, p) => s + p.amount, 0)) : round2(b.paid ?? (row.type === "normal" ? row.total : 0));
  const remaining = round2(row.total - paid);
  const status = row.type === "delivery" ? "pending_delivery" : "completed";
  await c.env.DB
    .prepare("UPDATE sales_invoices SET status=?, delivery_status=?, paid=?, remaining=?, payment_method=?, cost_total=?, profit=?, held_at=NULL, completed_at=? WHERE id=?")
    .bind(status, row.type === "delivery" ? "pending_delivery" : null, paid, remaining, b.payment_method || row.payment_method, costTotal, round2(row.total - costTotal), row.type === "normal" ? todayIso() : null, id)
    .run();
  if (paid > 0) {
    const pays = splitPays.length ? splitPays : [{ method: b.payment_method || row.payment_method || "cash", amount: paid }];
    for (const pay of pays) {
      await c.env.DB
        .prepare("INSERT INTO payments (invoice_id, customer_id, method, amount, date, created_by) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(id, row.customer_id, pay.method, pay.amount, todayIso(), user.id)
        .run();
    }
  }
  if (row.customer_id && remaining > 0) {
    await c.env.DB.prepare("UPDATE customers SET current_balance = current_balance + ?, updated_at = datetime('now') WHERE id = ?").bind(remaining, row.customer_id).run();
  }
  if (status === "completed") {
    await accrueCommission(c.env.DB, id);
  }
  await tryLedger(() =>
    postSaleJournal(c.env.DB, { id, number: row.number, date: todayIso(), total: row.total, paid, remaining, payment_method: b.payment_method || row.payment_method, cost_total: costTotal }, user.id),
  );
  await audit(c.env.DB, user, "finalize_invoice", "invoice", id, `Finalize ${row.number}`);
  return c.json({ data: await loadInvoice(c.env.DB, id) });
});

function formatLite(n: number) {
  return `${round2(n)} EGP`;
}

salesRoutes.post("/invoices/:id/cancel", requirePerm("sales.cancel"), async (c) => {
  const id = Number(c.req.param("id"));
  const inv = await loadInvoice(c.env.DB, id);
  if (!inv) return c.json({ error: "not_found" }, 404);
  const row = inv as unknown as { id: number; number: string; status: string; type: string; remaining: number; customer_id: number | null; items: { id: number; product_id: number; quantity: number }[]; item_batches: { invoice_item_id: number; batch_id: number; qty: number; unit_cost: number }[] };
  if (["cancelled", "completed", "delivered"].includes(row.status) && row.type === "normal" && row.status === "cancelled") {
    return c.json({ error: "already_cancelled" }, 400);
  }
  if (row.status === "cancelled") return c.json({ error: "already_cancelled" }, 400);
  const user = c.get("user");
  if (row.status === "held" || row.status === "quote" || row.status === "order") {
    await c.env.DB.prepare("UPDATE sales_invoices SET status = 'cancelled', voided_at = datetime('now') WHERE id = ?").bind(id).run();
    await audit(c.env.DB, user, "cancel_invoice", "invoice", id, `Cancel ${row.status} ${row.number}`, { old_value: { status: row.status }, new_value: { status: "cancelled" } });
    return c.json({ ok: true });
  }
  for (const item of row.items) {
    const alloc = row.item_batches
      .filter((b) => b.invoice_item_id === item.id)
      .map((b) => ({ batch_id: b.batch_id, batch_code: "", qty: b.qty, unit_cost: b.unit_cost }));
    if (!alloc.length) continue;
    if (row.type === "delivery" && ["pending_delivery", "out_for_delivery", "rescheduled"].includes(row.status)) {
      await releaseReserve(c.env.DB, alloc, item.product_id);
    } else if (row.type === "normal" || ["delivered", "partially_delivered", "completed", "partial"].includes(row.status)) {
      for (const a of alloc) await restockToBatch(c.env.DB, a.batch_id, item.product_id, a.qty);
    }
  }
  if (row.customer_id && row.remaining > 0) {
    await c.env.DB.prepare("UPDATE customers SET current_balance = current_balance - ? WHERE id = ?").bind(row.remaining, row.customer_id).run();
  }
  const pays = await c.env.DB.prepare("SELECT id FROM payments WHERE invoice_id = ? AND voided_at IS NULL").bind(id).all<{ id: number }>();
  for (const pay of pays.results) {
    await c.env.DB.prepare("UPDATE payments SET voided_at = datetime('now') WHERE id = ?").bind(pay.id).run();
    await tryLedger(() => reverseJournal(c.env.DB, "payment", pay.id, user.id));
  }
  for (const item of row.items) {
    const alloc = row.item_batches.filter((b) => b.invoice_item_id === item.id);
    for (const a of alloc) {
      await logMovement(c.env.DB, {
        productId: item.product_id,
        batchId: a.batch_id,
        type: "in",
        qty: a.qty,
        unitCost: a.unit_cost,
        referenceType: "sale_cancel",
        referenceId: id,
        notes: `Cancel ${row.number}`,
        userId: user.id,
      });
    }
  }
  await c.env.DB.prepare("UPDATE sales_invoices SET status = 'cancelled', delivery_status = 'cancelled', voided_at = datetime('now') WHERE id = ?").bind(id).run();
  await tryLedger(() => reverseJournal(c.env.DB, "sale", id, user.id));
  await audit(c.env.DB, user, "cancel_invoice", "invoice", id, `Cancel ${row.number}`, { old_value: { status: row.status, remaining: row.remaining }, new_value: { status: "cancelled" } });
  return c.json({ ok: true });
});

salesRoutes.delete("/invoices/:id", requirePerm("sales.cancel"), async (c) => {
  return salesRoutes.request(`/invoices/${c.req.param("id")}/cancel`, { method: "POST", headers: c.req.raw.headers }, c.env);
});

salesRoutes.post("/invoices/:id/pay", requirePerm("payments.create"), async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json<{ amount: number; method?: string; notes?: string }>();
  const inv = await c.env.DB.prepare("SELECT * FROM sales_invoices WHERE id = ?").bind(id).first<{
    remaining: number;
    paid: number;
    customer_id: number | null;
    number: string;
  }>();
  if (!inv) return c.json({ error: "not_found" }, 404);
  const amount = round2(b.amount);
  if (amount <= 0) return c.json({ error: "invalid_amount" }, 400);
  if (amount > round2(inv.remaining) + 0.001) return c.json({ error: "overpay" }, 400);
  const paid = round2(inv.paid + amount);
  const remaining = round2(Math.max(0, inv.remaining - amount));
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO payments (invoice_id, customer_id, method, amount, date, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(
      id,
      inv.customer_id,
      b.method || "cash",
      amount,
      todayIso(),
      b.notes || null,
      c.get("user").id,
    ),
    c.env.DB.prepare("UPDATE sales_invoices SET paid = ?, remaining = ? WHERE id = ?").bind(paid, remaining, id),
  ]);
  if (inv.customer_id) {
    await c.env.DB.prepare("UPDATE customers SET current_balance = current_balance - ? WHERE id = ?").bind(amount, inv.customer_id).run();
  }
  const nextStatus = remaining <= 0 ? "completed" : "partial";
  await c.env.DB.prepare("UPDATE sales_invoices SET status = ? WHERE id = ? AND type = 'normal' AND status NOT IN ('cancelled','fully_returned')").bind(nextStatus, id).run();
  const payRow = await c.env.DB.prepare("SELECT id FROM payments WHERE invoice_id = ? ORDER BY id DESC LIMIT 1").bind(id).first<{ id: number }>();
  if (payRow) {
    await tryLedger(() =>
      postCollectionJournal(c.env.DB, { paymentId: payRow.id, invoiceNumber: inv.number, amount, method: b.method, date: todayIso(), userId: c.get("user").id }),
    );
  }
  await audit(c.env.DB, c.get("user"), "payment", "invoice", id, `Pay ${amount} on ${inv.number}`);
  return c.json({ ok: true, paid, remaining });
});

salesRoutes.post("/invoices/:id/returns", requirePerm("returns.create"), async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json<{ reason?: string; items: { invoice_item_id: number; qty: number }[] }>();
  if (!b.items?.length) return c.json({ error: "no_items" }, 400);
  const inv = await loadInvoice(c.env.DB, id);
  if (!inv) return c.json({ error: "not_found" }, 404);
  const row = inv as unknown as {
    id: number;
    number: string;
    customer_id: number | null;
    total: number;
    paid: number;
    remaining: number;
    type: string;
    status: string;
    items: { id: number; product_id: number; quantity: number; delivered_qty: number; returned_qty: number; unit_price: number }[];
    item_batches: { invoice_item_id: number; batch_id: number; qty: number; unit_cost: number }[];
  };
  const number = await nextNumber(c.env.DB, "return");
  const ret = await c.env.DB
    .prepare("INSERT INTO sales_returns (number, invoice_id, customer_id, date, reason, status, total, created_by) VALUES (?, ?, ?, ?, ?, 'completed', 0, ?)")
    .bind(number, id, row.customer_id, todayIso(), b.reason || null, c.get("user").id)
    .run();
  const retId = ret.meta.last_row_id;
  let retTotal = 0;
  let cogsBack = 0;
  for (const line of b.items) {
    const item = row.items.find((i) => i.id === line.invoice_item_id);
    if (!item) continue;
    const maxQty = item.quantity - item.returned_qty;
    const qty = Math.min(line.qty, maxQty);
    if (qty <= 0) continue;
    const lineTotal = round2(qty * item.unit_price);
    retTotal += lineTotal;
    const batches = row.item_batches.filter((x) => x.invoice_item_id === item.id);
    let left = qty;
    for (const bt of batches) {
      if (left <= 0) break;
      const take = Math.min(bt.qty, left);
      await restockToBatch(c.env.DB, bt.batch_id, item.product_id, take);
      cogsBack += take * bt.unit_cost;
      await logMovement(c.env.DB, {
        productId: item.product_id,
        batchId: bt.batch_id,
        type: "return",
        qty: take,
        unitCost: bt.unit_cost,
        referenceType: "return",
        referenceId: retId,
        notes: `Return ${number}`,
        userId: c.get("user").id,
      });
      left -= take;
    }
    const sold = await c.env.DB.prepare("SELECT id FROM product_serials WHERE invoice_item_id=? AND status='sold' LIMIT ?").bind(item.id, qty).all<{ id: number }>();
    for (const s of sold.results) {
      await c.env.DB.prepare("UPDATE product_serials SET status='returned', invoice_id=NULL, invoice_item_id=NULL WHERE id=?").bind(s.id).run();
    }
    await c.env.DB
      .prepare("INSERT INTO sales_return_items (return_id, invoice_item_id, product_id, qty, unit_price, total, batch_id) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(retId, item.id, item.product_id, qty, item.unit_price, lineTotal, batches[0]?.batch_id || null)
      .run();
    await c.env.DB
      .prepare("UPDATE sales_invoice_items SET returned_qty = returned_qty + ? WHERE id = ?")
      .bind(qty, item.id)
      .run();
  }
  retTotal = round2(retTotal);
  cogsBack = round2(cogsBack);
  await c.env.DB.prepare("UPDATE sales_returns SET total = ? WHERE id = ?").bind(retTotal, retId).run();
  const itemsNow = await c.env.DB.prepare("SELECT quantity, returned_qty FROM sales_invoice_items WHERE invoice_id = ?").bind(id).all<{ quantity: number; returned_qty: number }>();
  const allReturned = itemsNow.results.every((i) => i.returned_qty >= i.quantity);
  const someReturned = itemsNow.results.some((i) => i.returned_qty > 0);
  const newStatus = allReturned ? "fully_returned" : someReturned ? "partially_returned" : row.status;
  const settled = settleReturn({ total: row.total, paid: row.paid, remaining: row.remaining, retTotal, cogs: cogsBack });
  await c.env.DB
    .prepare("UPDATE sales_invoices SET status = ?, delivery_status = ?, total = ?, paid = ?, remaining = ?, cost_total = MAX(cost_total - ?, 0), profit = profit - ? WHERE id = ?")
    .bind(newStatus, allReturned ? "fully_returned" : someReturned ? "partially_returned" : row.status, settled.newTotal, settled.newPaid, settled.newRemaining, cogsBack, settled.profitDrop, id)
    .run();
  if (row.customer_id && settled.arDrop) {
    await c.env.DB.prepare("UPDATE customers SET current_balance = current_balance - ? WHERE id = ?").bind(settled.arDrop, row.customer_id).run();
  }
  if (settled.refund > 0) {
    await c.env.DB
      .prepare("INSERT INTO payments (invoice_id, customer_id, method, amount, date, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(id, row.customer_id, "refund", -settled.refund, todayIso(), `Refund ${number}`, c.get("user").id)
      .run();
  }
  await tryLedger(() =>
    postReturnJournal(c.env.DB, {
      returnId: retId,
      number,
      date: todayIso(),
      retTotal,
      cogs: cogsBack,
      arDrop: settled.arDrop,
      refund: settled.refund,
      method: "cash",
      userId: c.get("user").id,
    }),
  );
  await audit(c.env.DB, c.get("user"), "return", "invoice", id, `${number} ${b.reason || ""}`);
  await notify(c.env.DB, "return_created", "مرتجع جديد", "Return created", `${number} على ${row.number}`, `${number} on ${row.number}`, "invoice", id);
  return c.json({ id: retId, number, total: round2(retTotal) }, 201);
});

salesRoutes.get("/invoices/:id/whatsapp", requirePerm("whatsapp.send", "sales.view"), async (c) => {
  const id = Number(c.req.param("id"));
  const type = new URL(c.req.url).searchParams.get("type") || "invoice_created";
  const lang = (new URL(c.req.url).searchParams.get("lang") || "ar") as "ar" | "en";
  const data = await loadInvoice(c.env.DB, id);
  if (!data) return c.json({ error: "not_found" }, 404);
  const inv = data as unknown as {
    customer_whatsapp: string | null;
    customer_phone: string | null;
    number: string;
    customer_name: string | null;
    type: string;
    total: number;
    address: string | null;
    expected_delivery_time: string | null;
    delivery_agent_name: string | null;
    delivery_agent_code: string | null;
    delivery_agent_phone: string | null;
    items: { product_name: string; quantity: number; delivered_qty: number; returned_qty: number }[];
  };
  const tpl = await c.env.DB.prepare("SELECT * FROM whatsapp_templates WHERE code = ?").bind(type).first<{ body_ar: string; body_en: string }>();
  if (!tpl) return c.json({ error: "template_missing" }, 404);
  const settings = await getSettings(c.env.DB);
  const vars = invoiceTemplateVars(inv, inv.items, settings.store_name || "المتميز", lang);
  const message = renderTemplate(lang === "en" ? tpl.body_en : tpl.body_ar, vars);
  const phone = inv.customer_whatsapp || inv.customer_phone;
  return c.json({ message, phone, link: phone ? waLink(phone, message) : null, type });
});

salesRoutes.post("/invoices/:id/whatsapp/opened", requirePerm("whatsapp.send"), async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json<{ type?: string; message?: string; phone?: string }>();
  await c.env.DB
    .prepare("INSERT INTO whatsapp_logs (invoice_id, customer_id, user_id, message_type, phone, message, marked_sent) VALUES (?, (SELECT customer_id FROM sales_invoices WHERE id = ?), ?, ?, ?, ?, 0)")
    .bind(id, id, c.get("user").id, b.type || "invoice_created", b.phone || null, b.message || "")
    .run();
  return c.json({ ok: true });
});

salesRoutes.post("/invoices/:id/whatsapp/mark-sent", requirePerm("whatsapp.send"), async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json<{ log_id?: number; type?: string; message?: string; phone?: string }>();
  if (b.log_id) {
    await c.env.DB.prepare("UPDATE whatsapp_logs SET marked_sent = 1 WHERE id = ?").bind(b.log_id).run();
  } else {
    await c.env.DB
      .prepare("INSERT INTO whatsapp_logs (invoice_id, customer_id, user_id, message_type, phone, message, marked_sent) VALUES (?, (SELECT customer_id FROM sales_invoices WHERE id = ?), ?, ?, ?, ?, 1)")
      .bind(id, id, c.get("user").id, b.type || "invoice_created", b.phone || null, b.message || "")
      .run();
  }
  await audit(c.env.DB, c.get("user"), "whatsapp_mark_sent", "invoice", id, b.type || "invoice_created");
  return c.json({ ok: true });
});
