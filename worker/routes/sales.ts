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
import { postCollectionJournal, postReturnJournal, postSaleJournal, reverseJournal } from "../lib/ledger";
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
  location_id?: number | null;
};

function isStockErr(err: unknown) {
  return String((err as Error)?.message || "") === "INSUFFICIENT_STOCK";
}

function errMsg(err: unknown) {
  return String((err as Error)?.message || "");
}

function isLedgerErr(err: unknown) {
  const m = errMsg(err);
  return m === "ledger" || m === "unbalanced_journal";
}

function ledgerFail(c: { json: (body: unknown, status: 500) => Response }) {
  return c.json({ error: "ledger" }, 500);
}

const RETURNABLE_STATUSES = new Set([
  "completed",
  "partial",
  "pending_delivery",
  "out_for_delivery",
  "delivered",
  "partially_delivered",
  "partially_returned",
  "rescheduled",
]);

function creditError(customer: { credit_limit: number; current_balance: number } | null, remaining: number) {
  if (remaining <= 0) return null;
  if (!customer) return "customer_required";
  const limit = Number(customer.credit_limit || 0);
  const balance = Number(customer.current_balance || 0);
  if (!(limit > 0) || balance + remaining > limit) return "credit_limit";
  return null;
}

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
      `SELECT sib.*, ib.batch_code, ib.location_id FROM sales_item_batches sib
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
  if (user.role_slug === "delivery" && user.delivery_agent_id && (data as unknown as { delivery_agent_id: number }).delivery_agent_id !== user.delivery_agent_id) {
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
    location_id?: number | null;
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
  const planned: { item: CartItem; product: { id: number; name_ar: string; sku: string; min_selling_price: number; selling_price: number; kind: string; track_serial?: number; location_id?: number | null }; alloc: Allocation[]; lineTotal: number; unitCost: number; isService: boolean; stockQty: number }[] = [];
  const reserveHold = !!(b.reserve && (b.quote || b.hold || b.order));
  const saleLocationId = Number(b.location_id || 0) || null;
  for (const item of b.items) {
    if (!(Number(item.quantity) > 0)) return c.json({ error: "invalid_qty", product_id: item.product_id }, 400);
    const product = await c.env.DB
      .prepare("SELECT id, name_ar, sku, min_selling_price, selling_price, current_stock, reserved_stock, kind, purchase_price, track_serial, non_stock, location_id FROM products WHERE id = ? AND deleted_at IS NULL AND active = 1")
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
        location_id: number | null;
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
      const locId = Number(item.location_id || saleLocationId || product.location_id || 0) || null;
      const batches = await availableBatches(c.env.DB, product.id, locId);
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
  if (!hold) {
    const cred = creditError(customer, remaining);
    if (cred) return c.json({ error: cred }, 400);
  }
  const payState = remaining <= 0 ? "completed" : "partial";
  const status = b.order ? "order" : b.quote ? "quote" : hold ? "held" : type === "delivery" ? "pending_delivery" : payState;
  const deliveryStatus = hold ? null : type === "delivery" ? "pending_delivery" : null;
  let invoiceId = 0;
  let number = "";
  try {
    const created = await c.env.DB.transaction(async (tx) => {
      const invNumber = await nextNumber(tx, "sales");
      const ins = await tx
        .prepare(
          `INSERT INTO sales_invoices (
        number, date, type, status, delivery_status, customer_id, customer_name, customer_phone, customer_whatsapp,
        address, area, delivery_agent_id, delivery_agent_name, delivery_agent_code, delivery_agent_phone,
        expected_delivery_time, payment_method, subtotal, discount, total, paid, remaining, cost_total, profit, due_date, notes, created_by, completed_at,
        tax_rate, tax_amount, price_list_id, held_at, branch_id, client_token
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          invNumber,
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
          hold || type !== "normal" || remaining > 0 ? null : todayIso(),
          taxRate,
          taxAmount,
          b.price_list_id || customer?.price_list_id || null,
          hold ? todayIso() : null,
          b.branch_id || 1,
          b.client_token || null,
        )
        .run();
      const id = ins.meta.last_row_id;
      if (extra || b.cash_account_id) {
        await tx
          .prepare("UPDATE sales_invoices SET extra_amount = ?, cash_account_id = ? WHERE id = ?")
          .bind(extra, b.cash_account_id || null, id)
          .run();
      }
      for (const p of planned) {
        const itemIns = await tx
          .prepare(
            `INSERT INTO sales_invoice_items (invoice_id, product_id, product_name, sku, quantity, delivered_qty, returned_qty, unit_price, discount, total, unit_cost, profit, notes, item_kind, unit_name, unit_factor)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            id,
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
          await tx.batch(
            p.alloc.map((a) =>
              tx.prepare("INSERT INTO sales_item_batches (invoice_item_id, batch_id, qty, unit_cost) VALUES (?, ?, ?, ?)").bind(itemId, a.batch_id, a.qty, a.unit_cost),
            ),
          );
        }
        const serials = (p.item.serials || []).map((s) => String(s).trim()).filter(Boolean);
        if (p.isService) continue;
        if (hold) {
          if (reserveHold && p.alloc.length) {
            await applyReserve(tx, p.alloc, p.product.id);
            for (const serial of serials) {
              await tx.prepare("UPDATE product_serials SET status='reserved', invoice_id=?, invoice_item_id=? WHERE product_id=? AND serial=? AND status='in_stock'").bind(id, itemId, p.product.id, serial).run();
            }
          }
          continue;
        }
        for (const serial of serials) {
          await tx.prepare("UPDATE product_serials SET status='sold', invoice_id=?, invoice_item_id=? WHERE product_id=? AND serial=? AND status='in_stock'").bind(id, itemId, p.product.id, serial).run();
        }
        if (type === "delivery") {
          await applyReserve(tx, p.alloc, p.product.id);
          for (const a of p.alloc) {
            await logMovement(tx, {
              productId: p.product.id,
              batchId: a.batch_id,
              type: "reserve",
              qty: a.qty,
              unitCost: a.unit_cost,
              referenceType: "sale",
              referenceId: id,
              notes: `Reserve ${invNumber}`,
              userId: user.id,
              fromLocationId: a.location_id ?? null,
            });
          }
        } else {
          await applyIssue(tx, p.alloc, p.product.id, false);
          for (const a of p.alloc) {
            await logMovement(tx, {
              productId: p.product.id,
              batchId: a.batch_id,
              type: "sale_out",
              qty: a.qty,
              unitCost: a.unit_cost,
              referenceType: "sale",
              referenceId: id,
              notes: `Issue ${invNumber}`,
              userId: user.id,
              fromLocationId: a.location_id ?? null,
            });
          }
          await maybeStockAlerts(tx, p.product.id);
        }
      }
      if (!hold && paid > 0) {
        const rows = splitPays.length ? splitPays : [{ method: b.payment_method || "cash", amount: paid }];
        for (const pay of rows) {
          await tx
            .prepare("INSERT INTO payments (invoice_id, customer_id, method, amount, date, created_by) VALUES (?, ?, ?, ?, ?, ?)")
            .bind(id, customer?.id || null, pay.method, pay.amount, todayIso(), user.id)
            .run();
        }
      }
      if (!hold && customer && remaining > 0) {
        await tx.prepare("UPDATE customers SET current_balance = current_balance + ?, updated_at = datetime('now') WHERE id = ?").bind(remaining, customer.id).run();
      }
      if (salesAgentId) {
        await tx.prepare("UPDATE sales_invoices SET sales_agent_id = ? WHERE id = ?").bind(salesAgentId, id).run();
      }
      if (!hold) {
        await postSaleJournal(
          tx,
          { id, number: invNumber, date: todayIso(), total, paid, remaining, payment_method: b.payment_method, cost_total: costTotal, cash_account_id: b.cash_account_id || null },
          user.id,
        );
      }
      return { id, invNumber };
    });
    invoiceId = created.id;
    number = created.invNumber;
  } catch (err) {
    if (isStockErr(err)) return c.json({ error: "insufficient_stock" }, 400);
    if (isLedgerErr(err)) return ledgerFail(c);
    throw err;
  }
  if (!hold && status === "completed") {
    await accrueCommission(c.env.DB, invoiceId);
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
  const row = held as unknown as {
    status: string;
    type: string;
    number: string;
    customer_id: number | null;
    payment_method: string;
    total: number;
    cash_account_id?: number | null;
    items: { id: number; product_id: number; quantity: number; unit_price: number; discount: number; item_kind?: string }[];
    item_batches: { invoice_item_id: number; batch_id: number; qty: number; unit_cost: number }[];
  };
  if (row.status !== "held" && row.status !== "quote" && row.status !== "order") return c.json({ error: "not_held" }, 400);
  const b = await c.req.json<{ payments?: { method: string; amount: number }[]; paid?: number; payment_method?: string }>().catch(() => ({} as { payments?: { method: string; amount: number }[]; paid?: number; payment_method?: string }));
  const user = c.get("user");
  const wasReserved = row.status === "quote" || row.status === "order";
  let costTotal = 0;
  const splitPays = (b.payments || []).filter((p) => Number(p.amount) > 0).map((p) => ({ method: p.method || "cash", amount: round2(p.amount) }));
  const paid = splitPays.length ? round2(splitPays.reduce((s, p) => s + p.amount, 0)) : round2(b.paid ?? (row.type === "normal" ? row.total : 0));
  const remaining = round2(row.total - paid);
  const status = row.type === "delivery" ? "pending_delivery" : remaining <= 0 ? "completed" : "partial";
  let customer = null as { credit_limit: number; current_balance: number } | null;
  if (row.customer_id) {
    customer = await c.env.DB.prepare("SELECT credit_limit, current_balance FROM customers WHERE id = ?").bind(row.customer_id).first();
  }
  const cred = creditError(customer, remaining);
  if (cred) return c.json({ error: cred }, 400);
  try {
    await c.env.DB.transaction(async (tx) => {
      costTotal = 0;
      for (const item of row.items) {
        if (item.item_kind === "service") continue;
        const existing = (row.item_batches || []).filter((x) => x.invoice_item_id === item.id);
        let alloc: Allocation[] = existing.map((x) => ({ batch_id: x.batch_id, batch_code: "", qty: x.qty, unit_cost: x.unit_cost }));
        if (!alloc.length) {
          const batches = await availableBatches(tx, item.product_id);
          try {
            alloc = planAllocation(batches, item.quantity);
          } catch {
            throw new Error("INSUFFICIENT_STOCK");
          }
          if (alloc.length) {
            await tx.batch(
              alloc.map((a) =>
                tx.prepare("INSERT INTO sales_item_batches (invoice_item_id, batch_id, qty, unit_cost) VALUES (?, ?, ?, ?)").bind(item.id, a.batch_id, a.qty, a.unit_cost),
              ),
            );
          }
        }
        costTotal = round2(costTotal + alloc.reduce((s, a) => s + a.qty * a.unit_cost, 0));
        if (row.type === "delivery") {
          if (!existing.length) await applyReserve(tx, alloc, item.product_id);
        } else {
          await applyIssue(tx, alloc, item.product_id, wasReserved && existing.length > 0);
          await maybeStockAlerts(tx, item.product_id);
        }
      }
      await tx
        .prepare("UPDATE sales_invoices SET status=?, delivery_status=?, paid=?, remaining=?, payment_method=?, cost_total=?, profit=?, held_at=NULL, completed_at=? WHERE id=?")
        .bind(status, row.type === "delivery" ? "pending_delivery" : null, paid, remaining, b.payment_method || row.payment_method, costTotal, round2(row.total - costTotal), row.type === "normal" && remaining <= 0 ? todayIso() : null, id)
        .run();
      if (paid > 0) {
        const pays = splitPays.length ? splitPays : [{ method: b.payment_method || row.payment_method || "cash", amount: paid }];
        for (const pay of pays) {
          await tx
            .prepare("INSERT INTO payments (invoice_id, customer_id, method, amount, date, created_by) VALUES (?, ?, ?, ?, ?, ?)")
            .bind(id, row.customer_id, pay.method, pay.amount, todayIso(), user.id)
            .run();
        }
      }
      if (row.customer_id && remaining > 0) {
        await tx.prepare("UPDATE customers SET current_balance = current_balance + ?, updated_at = datetime('now') WHERE id = ?").bind(remaining, row.customer_id).run();
      }
      await postSaleJournal(
        tx,
        { id, number: row.number, date: todayIso(), total: row.total, paid, remaining, payment_method: b.payment_method || row.payment_method, cost_total: costTotal, cash_account_id: row.cash_account_id || null },
        user.id,
      );
    });
  } catch (err) {
    if (isStockErr(err)) return c.json({ error: "insufficient_stock" }, 400);
    if (isLedgerErr(err)) return ledgerFail(c);
    throw err;
  }
  if (status === "completed") {
    await accrueCommission(c.env.DB, id);
  }
  await audit(c.env.DB, user, "finalize_invoice", "invoice", id, `Finalize ${row.number}`);
  return c.json({ data: await loadInvoice(c.env.DB, id) });
});

function formatLite(n: number) {
  return `${round2(n)} EGP`;
}

async function zeroItemBatches(db: AppDb, invoiceId: number) {
  await db.prepare("UPDATE sales_item_batches SET qty = 0 WHERE invoice_item_id IN (SELECT id FROM sales_invoice_items WHERE invoice_id = ?)").bind(invoiceId).run();
}

salesRoutes.post("/invoices/:id/cancel", requirePerm("sales.cancel"), async (c) => {
  const id = Number(c.req.param("id"));
  const inv = await loadInvoice(c.env.DB, id);
  if (!inv) return c.json({ error: "not_found" }, 404);
  const row = inv as unknown as { id: number; number: string; status: string; type: string; remaining: number; customer_id: number | null; items: { id: number; product_id: number; quantity: number }[]; item_batches: { invoice_item_id: number; batch_id: number; qty: number; unit_cost: number; location_id?: number | null }[] };
  if (row.status === "cancelled") return c.json({ error: "already_cancelled" }, 400);
  const user = c.get("user");
  try {
    await c.env.DB.transaction(async (tx) => {
      if (row.status === "held" || row.status === "quote" || row.status === "order") {
        for (const item of row.items) {
          const alloc = row.item_batches
            .filter((b) => b.invoice_item_id === item.id && b.qty > 0)
            .map((b) => ({ batch_id: b.batch_id, batch_code: "", qty: b.qty, unit_cost: b.unit_cost }));
          if (alloc.length) await releaseReserve(tx, alloc, item.product_id);
        }
        await tx.prepare("UPDATE product_serials SET status='in_stock', invoice_id=NULL, invoice_item_id=NULL WHERE invoice_id=? AND status='reserved'").bind(id).run();
        await zeroItemBatches(tx, id);
        await tx.prepare("UPDATE sales_invoices SET status = 'cancelled', voided_at = datetime('now') WHERE id = ?").bind(id).run();
        return;
      }
      for (const item of row.items) {
        const alloc = row.item_batches
          .filter((b) => b.invoice_item_id === item.id && b.qty > 0)
          .map((b) => ({ batch_id: b.batch_id, batch_code: "", qty: b.qty, unit_cost: b.unit_cost }));
        if (!alloc.length) continue;
        if (row.type === "delivery" && ["pending_delivery", "out_for_delivery", "rescheduled"].includes(row.status)) {
          await releaseReserve(tx, alloc, item.product_id);
        } else if (row.type === "normal" || ["delivered", "partially_delivered", "completed", "partial"].includes(row.status)) {
          for (const a of alloc) await restockToBatch(tx, a.batch_id, item.product_id, a.qty);
        }
      }
      await zeroItemBatches(tx, id);
      if (row.customer_id && row.remaining > 0) {
        await tx.prepare("UPDATE customers SET current_balance = current_balance - ? WHERE id = ?").bind(row.remaining, row.customer_id).run();
      }
      const pays = await tx.prepare("SELECT id FROM payments WHERE invoice_id = ? AND voided_at IS NULL").bind(id).all<{ id: number }>();
      for (const pay of pays.results) {
        await tx.prepare("UPDATE payments SET voided_at = datetime('now') WHERE id = ?").bind(pay.id).run();
        await reverseJournal(tx, "payment", pay.id, user.id);
      }
      for (const item of row.items) {
        const alloc = row.item_batches.filter((b) => b.invoice_item_id === item.id && b.qty > 0);
        for (const a of alloc) {
          await logMovement(tx, {
            productId: item.product_id,
            batchId: a.batch_id,
            type: "in",
            qty: a.qty,
            unitCost: a.unit_cost,
            referenceType: "sale_cancel",
            referenceId: id,
            notes: `Cancel ${row.number}`,
            userId: user.id,
            toLocationId: a.location_id ?? null,
          });
        }
      }
      await tx.prepare("UPDATE sales_invoices SET status = 'cancelled', delivery_status = 'cancelled', voided_at = datetime('now') WHERE id = ?").bind(id).run();
      await reverseJournal(tx, "sale", id, user.id);
    });
  } catch (err) {
    if (isLedgerErr(err)) return ledgerFail(c);
    throw err;
  }
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
    cash_account_id?: number | null;
  }>();
  if (!inv) return c.json({ error: "not_found" }, 404);
  const amount = round2(b.amount);
  if (amount <= 0) return c.json({ error: "invalid_amount" }, 400);
  if (amount > round2(inv.remaining) + 0.001) return c.json({ error: "overpay" }, 400);
  const paid = round2(inv.paid + amount);
  const remaining = round2(Math.max(0, inv.remaining - amount));
  const user = c.get("user");
  let payId = 0;
  try {
    await c.env.DB.transaction(async (tx) => {
      const payIns = await tx
        .prepare("INSERT INTO payments (invoice_id, customer_id, method, amount, date, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(id, inv.customer_id, b.method || "cash", amount, todayIso(), b.notes || null, user.id)
        .run();
      payId = payIns.meta.last_row_id;
      await tx.prepare("UPDATE sales_invoices SET paid = ?, remaining = ? WHERE id = ?").bind(paid, remaining, id).run();
      if (inv.customer_id) {
        await tx.prepare("UPDATE customers SET current_balance = current_balance - ? WHERE id = ?").bind(amount, inv.customer_id).run();
      }
      const nextStatus = remaining <= 0 ? "completed" : "partial";
      await tx
        .prepare("UPDATE sales_invoices SET status = ?, completed_at = CASE WHEN ? = 'completed' THEN COALESCE(completed_at, datetime('now')) ELSE completed_at END WHERE id = ? AND type = 'normal' AND status NOT IN ('cancelled','fully_returned')")
        .bind(nextStatus, nextStatus, id)
        .run();
      await postCollectionJournal(tx, { paymentId: payId, invoiceNumber: inv.number, amount, method: b.method, date: todayIso(), cashAccountId: inv.cash_account_id, userId: user.id });
    });
  } catch (err) {
    if (isLedgerErr(err)) return ledgerFail(c);
    throw err;
  }
  if (remaining <= 0) await accrueCommission(c.env.DB, id);
  await audit(c.env.DB, user, "payment", "invoice", id, `Pay ${amount} on ${inv.number}`);
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
    cost_total?: number;
    type: string;
    status: string;
    payment_method?: string | null;
    cash_account_id?: number | null;
    items: { id: number; product_id: number; quantity: number; delivered_qty: number; returned_qty: number; unit_price: number; item_kind?: string }[];
    item_batches: { invoice_item_id: number; batch_id: number; qty: number; unit_cost: number; location_id?: number | null }[];
  };
  if (!RETURNABLE_STATUSES.has(row.status)) return c.json({ error: "cannot_return" }, 400);
  const user = c.get("user");
  let result: { retId: number; number: string; retTotal: number };
  try {
    result = await c.env.DB.transaction(async (tx) => {
      const number = await nextNumber(tx, "return");
      const ret = await tx
        .prepare("INSERT INTO sales_returns (number, invoice_id, customer_id, date, reason, status, total, created_by) VALUES (?, ?, ?, ?, ?, 'completed', 0, ?)")
        .bind(number, id, row.customer_id, todayIso(), b.reason || null, user.id)
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
        const batches = row.item_batches.filter((x) => x.invoice_item_id === item.id && x.qty > 0);
        const isService = item.item_kind === "service";
        let left = isService ? 0 : qty;
        for (const bt of batches) {
          if (left <= 0) break;
          const take = Math.min(bt.qty, left);
          await restockToBatch(tx, bt.batch_id, item.product_id, take);
          await tx.prepare("UPDATE sales_item_batches SET qty = qty - ? WHERE invoice_item_id = ? AND batch_id = ? AND qty >= ?").bind(take, item.id, bt.batch_id, take).run();
          cogsBack += take * bt.unit_cost;
          await logMovement(tx, {
            productId: item.product_id,
            batchId: bt.batch_id,
            type: "return_in",
            qty: take,
            unitCost: bt.unit_cost,
            referenceType: "return",
            referenceId: retId,
            notes: `Return ${number}`,
            userId: user.id,
            toLocationId: bt.location_id ?? null,
          });
          left -= take;
        }
        if (left > 0) throw new Error("BATCH_MISSING");
        retTotal += lineTotal;
        const sold = await tx.prepare("SELECT id FROM product_serials WHERE invoice_item_id=? AND status='sold' LIMIT ?").bind(item.id, qty).all<{ id: number }>();
        for (const s of sold.results) {
          await tx.prepare("UPDATE product_serials SET status='returned', invoice_id=NULL, invoice_item_id=NULL WHERE id=?").bind(s.id).run();
        }
        await tx
          .prepare("INSERT INTO sales_return_items (return_id, invoice_item_id, product_id, qty, unit_price, total, batch_id) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .bind(retId, item.id, item.product_id, qty, item.unit_price, lineTotal, batches[0]?.batch_id || null)
          .run();
        await tx.prepare("UPDATE sales_invoice_items SET returned_qty = returned_qty + ? WHERE id = ?").bind(qty, item.id).run();
      }
      retTotal = round2(retTotal);
      cogsBack = round2(cogsBack);
      if (retTotal <= 0) throw new Error("NO_ITEMS");
      await tx.prepare("UPDATE sales_returns SET total = ? WHERE id = ?").bind(retTotal, retId).run();
      const itemsNow = await tx.prepare("SELECT quantity, returned_qty FROM sales_invoice_items WHERE invoice_id = ?").bind(id).all<{ quantity: number; returned_qty: number }>();
      const allReturned = itemsNow.results.every((i) => i.returned_qty >= i.quantity);
      const someReturned = itemsNow.results.some((i) => i.returned_qty > 0);
      const newStatus = allReturned ? "fully_returned" : someReturned ? "partially_returned" : row.status;
      const settled = settleReturn({ total: row.total, paid: row.paid, remaining: row.remaining, retTotal, cogs: cogsBack });
      const nextCost = round2(Math.max(0, Number(row.cost_total || 0) - cogsBack));
      await tx
        .prepare("UPDATE sales_invoices SET status = ?, delivery_status = ?, total = ?, paid = ?, remaining = ?, cost_total = ?, profit = profit - ? WHERE id = ?")
        .bind(newStatus, allReturned ? "fully_returned" : someReturned ? "partially_returned" : row.status, settled.newTotal, settled.newPaid, settled.newRemaining, nextCost, settled.profitDrop, id)
        .run();
      if (row.customer_id && settled.arDrop) {
        await tx.prepare("UPDATE customers SET current_balance = current_balance - ? WHERE id = ?").bind(settled.arDrop, row.customer_id).run();
      }
      if (settled.refund > 0) {
        await tx
          .prepare("INSERT INTO payments (invoice_id, customer_id, method, amount, date, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .bind(id, row.customer_id, "refund", -settled.refund, todayIso(), `Refund ${number}`, user.id)
          .run();
      }
      await postReturnJournal(tx, {
        returnId: retId,
        number,
        date: todayIso(),
        retTotal,
        cogs: cogsBack,
        arDrop: settled.arDrop,
        refund: settled.refund,
        method: row.payment_method || "cash",
        cashAccountId: row.cash_account_id || null,
        userId: user.id,
      });
      return { retId, number, retTotal };
    });
  } catch (err) {
    const m = errMsg(err);
    if (m === "BATCH_MISSING") return c.json({ error: "batch_missing" }, 400);
    if (m === "NO_ITEMS") return c.json({ error: "no_items" }, 400);
    if (isLedgerErr(err)) return ledgerFail(c);
    throw err;
  }
  await audit(c.env.DB, user, "return", "invoice", id, `${result.number} ${b.reason || ""}`);
  await notify(c.env.DB, "return_created", "مرتجع جديد", "Return created", `${result.number} على ${row.number}`, `${result.number} on ${row.number}`, "invoice", id);
  return c.json({ id: result.retId, number: result.number, total: round2(result.retTotal) }, 201);
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
