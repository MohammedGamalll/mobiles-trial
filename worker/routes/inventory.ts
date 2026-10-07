import { Hono } from "hono";
import { audit, nextNumber, paginate, round2, todayIso, type AppBindings, type AppVars, type AppDb, type AuthUser } from "../lib/helpers";
import { requirePerm } from "../lib/auth";
import { applyDate, applyEq, applyLocationCol, applyRange, applySearch, listParams, sqlText, stockScopeIds } from "../lib/filters";
import { availCostSql, availQtySql, availableBatches, consumeFromBatch, logMovement, maybeStockAlerts, reservedCostSql, reservedQtySql } from "../lib/stock";
import { postPurchaseJournal, postPurchaseReturnJournal, postSupplierPaymentJournal } from "../lib/ledger";
import { returnLineNet, settleReturn } from "../lib/invoice-math";
import { splitInvoiceCash } from "../lib/party-money";
import { mergeWarehouseStats } from "../lib/warehouse";
import { notifyAdmins, safeNotify } from "../lib/notifications";

export const inventoryRoutes = new Hono<{ Bindings: AppBindings; Variables: AppVars }>();

function errMsg(err: unknown) {
  return String((err as Error)?.message || "");
}
function isStockErr(err: unknown) {
  return errMsg(err) === "INSUFFICIENT_STOCK";
}
function isLedgerErr(err: unknown) {
  const m = errMsg(err);
  return m === "ledger" || m === "unbalanced_journal";
}
function ledgerFail(c: { json: (body: unknown, status: 500) => Response }) {
  return c.json({ error: "ledger" }, 500);
}

type PurchaseRow = {
  id: number;
  number: string;
  status: string;
  supplier_id: number | null;
  date: string;
  total: number;
  paid: number;
  remaining: number;
  payment_method: string | null;
  wallet_surplus?: number;
};

async function receivePurchase(db: AppDb, inv: PurchaseRow, user: AuthUser) {
  const { results: items } = await db
    .prepare("SELECT * FROM purchase_invoice_items WHERE purchase_id = ?")
    .bind(inv.id)
    .all<{
      id: number;
      product_id: number;
      quantity: number;
      unit_cost: number;
      expiry_date: string | null;
      production_date: string | null;
    }>();
  for (const item of items) {
    const code = await nextNumber(db, "batch");
    const prod = await db.prepare("SELECT location_id FROM products WHERE id = ?").bind(item.product_id).first<{ location_id: number | null }>();
    const batch = await db
      .prepare(
        `INSERT INTO inventory_batches (batch_code, product_id, purchase_id, purchase_item_id, supplier_id, purchase_date, original_qty, remaining_qty, reserved_qty, unit_cost, expiry_date, production_date, location_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
      )
      .bind(
        code,
        item.product_id,
        inv.id,
        item.id,
        inv.supplier_id,
        inv.date,
        item.quantity,
        item.quantity,
        item.unit_cost,
        item.expiry_date,
        item.production_date,
        prod?.location_id || null,
      )
      .run();
    await db
      .prepare("UPDATE products SET current_stock = current_stock + ?, purchase_price = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(item.quantity, item.unit_cost, item.product_id)
      .run();
    await logMovement(db, {
      productId: item.product_id,
      batchId: batch.meta.last_row_id,
      type: "purchase_in",
      qty: item.quantity,
      unitCost: item.unit_cost,
      referenceType: "purchase",
      referenceId: inv.id,
      notes: `Receive ${inv.number}`,
      userId: user.id,
      toLocationId: prod?.location_id || null,
    });
    if (inv.supplier_id) {
      await db
        .prepare(
          `INSERT INTO supplier_product_prices (supplier_id, product_id, unit_cost, last_purchase_id, last_date)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(supplier_id, product_id) DO UPDATE SET unit_cost = excluded.unit_cost, last_purchase_id = excluded.last_purchase_id, last_date = excluded.last_date`,
        )
        .bind(inv.supplier_id, item.product_id, item.unit_cost, inv.id, inv.date)
        .run();
    }
  }
  await db
    .prepare("UPDATE purchase_invoices SET status = 'approved', approved_at = datetime('now'), approved_by = ? WHERE id = ?")
    .bind(user.id, inv.id)
    .run();
  const paid = round2(Number(inv.paid || 0));
  const remaining = round2(Number(inv.remaining ?? inv.total - paid));
  const surplus = round2(Number(inv.wallet_surplus || 0));
  if (inv.supplier_id && remaining > 0) {
    await db.prepare("UPDATE suppliers SET balance = COALESCE(balance,0) + ? WHERE id = ?").bind(remaining, inv.supplier_id).run();
  }
  if (inv.supplier_id && surplus > 0) {
    await db.prepare("UPDATE suppliers SET balance = COALESCE(balance,0) - ? WHERE id = ?").bind(surplus, inv.supplier_id).run();
  }
  await postPurchaseJournal(
    db,
    { id: inv.id, number: inv.number, date: inv.date, total: Number(inv.total), paid: round2(paid + surplus), remaining, surplus, payment_method: inv.payment_method },
    user.id,
  );
}

inventoryRoutes.get("/daily-ops", requirePerm("inventory.view", "products.view"), async (c) => {
  const p = listParams(new URL(c.req.url));
  const day = /^\d{4}-\d{2}-\d{2}$/.test(p.day || p.date || "") ? (p.day || p.date) : todayIso();
  const extra: string[] = [];
  const binds: (string | number)[] = [day];
  if (p.category_id) {
    extra.push("p.category_id = ?");
    binds.push(Number(p.category_id));
  }
  if (p.product_id) {
    extra.push("p.id = ?");
    binds.push(Number(p.product_id));
  }
  const sx = extra.length ? ` AND ${extra.join(" AND ")}` : "";
  let purchases: { results: unknown[] } = { results: [] };
  let shipments: { results: unknown[] } = { results: [] };
  try {
    purchases = await c.env.DB
      .prepare(
        `SELECT pi.id as purchase_id, pi.number, pi.date, p.id as product_id, p.sku, p.name_ar, p.name_en,
                pii.quantity, pii.unit_cost, pii.total, s.name as supplier_name
         FROM purchase_invoice_items pii
         JOIN purchase_invoices pi ON pi.id = pii.purchase_id
         JOIN products p ON p.id = pii.product_id
         LEFT JOIN suppliers s ON s.id = pi.supplier_id
         WHERE pi.deleted_at IS NULL AND pi.status = 'approved' AND DATE(pi.date) = ?${sx}
         ORDER BY pi.id DESC, pii.id DESC`,
      )
      .bind(...binds)
      .all();
  } catch {
    purchases = { results: [] };
  }
  try {
    shipments = await c.env.DB
      .prepare(
        `SELECT sm.id, sm.type, sm.qty, sm.unit_cost, sm.reference_type, sm.reference_id, sm.notes, sm.created_at,
                p.id as product_id, p.sku, p.name_ar, p.name_en,
                fl.name as from_location, tl.name as to_location, sl.warehouse as warehouse
         FROM stock_movements sm
         JOIN products p ON p.id = sm.product_id
         LEFT JOIN storage_locations fl ON fl.id = sm.from_location_id
         LEFT JOIN storage_locations tl ON tl.id = sm.to_location_id
         LEFT JOIN inventory_batches ib ON ib.id = sm.batch_id
         LEFT JOIN storage_locations sl ON sl.id = COALESCE(sm.to_location_id, sm.from_location_id, ib.location_id)
         WHERE DATE(sm.created_at) = ?
           AND (sm.type IN ('in','purchase_in','transfer_in','transfer_out','out','sale_out') OR sm.reference_type IN ('purchase','transfer','sale','opening'))
           ${sx}
         ORDER BY sm.id DESC
         LIMIT 200`,
      )
      .bind(...binds)
      .all();
  } catch {
    shipments = { results: [] };
  }
  return c.json({ date: day, purchases: purchases.results, shipments: shipments.results });
});

inventoryRoutes.get("/summary", requirePerm("inventory.view"), async (c) => {
  const url = new URL(c.req.url);
  const p = listParams(url);
  const stockIds = await stockScopeIds(c.env.DB, p);
  const avail = availQtySql("ib.remaining_qty", "ib.reserved_qty");
  const availCost = availCostSql("ib.remaining_qty", "ib.reserved_qty", "ib.unit_cost");
  const availRetail = `(${avail} * COALESCE(p.selling_price,0))`;
  const reserved = reservedQtySql("ib.reserved_qty");
  const reservedCost = reservedCostSql("ib.reserved_qty", "ib.unit_cost");
  const reservedRetail = `(${reserved} * COALESCE(p.selling_price,0))`;
  const warehouseName = `COALESCE(NULLIF(TRIM(sl.warehouse), ''), sl.name, 'بدون مخزن')`;

  const batchWhere = ["p.deleted_at IS NULL", "COALESCE(p.kind,'product') != 'service'"];
  const batchParams: (string | number)[] = [];
  if (stockIds) {
    if (!stockIds.length) batchWhere.push("1=0");
    else {
      batchWhere.push(`ib.location_id IN (${stockIds.map(() => "?").join(",")})`);
      batchParams.push(...stockIds);
    }
  }
  if (p.brand_id) {
    batchWhere.push("p.brand_id = ?");
    batchParams.push(Number(p.brand_id));
  }
  if (p.category_id) {
    batchWhere.push("p.category_id = ?");
    batchParams.push(Number(p.category_id));
  }
  if (p.model_id) {
    batchWhere.push("EXISTS (SELECT 1 FROM product_models pm WHERE pm.product_id = p.id AND pm.model_id = ?)");
    batchParams.push(Number(p.model_id));
  }
  const batchSql = batchWhere.join(" AND ");
  const batchFrom = `FROM inventory_batches ib
       JOIN products p ON p.id = ib.product_id`;

  const locWhere = ["1=1"];
  const locParams: (string | number)[] = [];
  if (stockIds) {
    if (!stockIds.length) locWhere.push("1=0");
    else {
      locWhere.push(`ib.location_id IN (${stockIds.map(() => "?").join(",")})`);
      locParams.push(...stockIds);
    }
  }

  const prodWhere = ["p.deleted_at IS NULL", "COALESCE(p.kind,'product') != 'service'"];
  const prodParams: (string | number)[] = [];
  if (p.brand_id) {
    prodWhere.push("p.brand_id = ?");
    prodParams.push(Number(p.brand_id));
  }
  if (p.category_id) {
    prodWhere.push("p.category_id = ?");
    prodParams.push(Number(p.category_id));
  }
  if (p.model_id) {
    prodWhere.push("EXISTS (SELECT 1 FROM product_models pm WHERE pm.product_id = p.id AND pm.model_id = ?)");
    prodParams.push(Number(p.model_id));
  }
  if (stockIds) {
    if (!stockIds.length) prodWhere.push("1=0");
    else {
      const ph = stockIds.map(() => "?").join(",");
      prodWhere.push(`(p.location_id IN (${ph}) OR EXISTS (
        SELECT 1 FROM inventory_batches ibx WHERE ibx.product_id = p.id AND ibx.location_id IN (${ph})
      ))`);
      prodParams.push(...stockIds, ...stockIds);
    }
  }

  const aggJoin = `LEFT JOIN (
      SELECT ib.product_id,
             COALESCE(SUM(${avail}),0) as units,
             COALESCE(SUM(${availCost}),0) as stock_value
      FROM inventory_batches ib
      WHERE ${locWhere.join(" AND ")}
      GROUP BY ib.product_id
    ) a ON a.product_id = p.id`;
  const lowRule = `COALESCE(a.units,0) > 0 AND COALESCE(a.units,0) <= CASE WHEN COALESCE(p.reorder_point,0) > COALESCE(p.min_stock,0) THEN p.reorder_point ELSE COALESCE(p.min_stock,0) END`;
  const prodSql = prodWhere.join(" AND ");

  const [value, low, out, warehouses] = await c.env.DB.batch([
    c.env.DB
      .prepare(
        `SELECT COALESCE(SUM(${availCost}),0) as stock_value,
                COALESCE(SUM(${availRetail}),0) as stock_retail,
                COALESCE(SUM(${avail}),0) as units,
                COALESCE(SUM(${reserved}),0) as reserved,
                COALESCE(SUM(${reservedCost}),0) as reserved_value,
                COALESCE(SUM(${reservedRetail}),0) as reserved_retail
         ${batchFrom}
         WHERE ${batchSql}`,
      )
      .bind(...batchParams),
    c.env.DB
      .prepare(
        `SELECT COUNT(*) as n,
                COALESCE(SUM(COALESCE(a.units,0)),0) as units,
                COALESCE(SUM(COALESCE(a.stock_value,0)),0) as stock_value,
                COALESCE(SUM(COALESCE(a.units,0) * COALESCE(p.selling_price,0)),0) as stock_retail
         FROM products p
         ${aggJoin}
         WHERE ${prodSql} AND ${lowRule}`,
      )
      .bind(...locParams, ...prodParams),
    c.env.DB
      .prepare(
        `SELECT COUNT(*) as n,
                COALESCE(SUM(COALESCE(a.units,0)),0) as units,
                COALESCE(SUM(COALESCE(a.stock_value,0)),0) as stock_value,
                COALESCE(SUM(COALESCE(a.units,0) * COALESCE(p.selling_price,0)),0) as stock_retail
         FROM products p
         ${aggJoin}
         WHERE ${prodSql} AND COALESCE(a.units,0) <= 0`,
      )
      .bind(...locParams, ...prodParams),
    c.env.DB
      .prepare(
        `SELECT ${warehouseName} as name,
                COALESCE(SUM(${availCost}),0) as stock_value,
                COALESCE(SUM(${availRetail}),0) as retail_value,
                COALESCE(SUM(${avail}),0) as units
         ${batchFrom}
         LEFT JOIN storage_locations sl ON sl.id = ib.location_id
         WHERE ${batchSql}
         GROUP BY ${warehouseName}`,
      )
      .bind(...batchParams),
  ]);
  const valueRow = (value.results[0] || {}) as { stock_value?: number; stock_retail?: number; units?: number; reserved?: number; reserved_value?: number; reserved_retail?: number };
  const lowRow = (low.results[0] || {}) as { n?: number; units?: number; stock_value?: number; stock_retail?: number };
  const outRow = (out.results[0] || {}) as { n?: number; units?: number; stock_value?: number; stock_retail?: number };
  return c.json({
    stock_value: Number(valueRow.stock_value) || 0,
    stock_retail: Number(valueRow.stock_retail) || 0,
    units: Number(valueRow.units) || 0,
    reserved: Number(valueRow.reserved) || 0,
    reserved_value: Number(valueRow.reserved_value) || 0,
    reserved_retail: Number(valueRow.reserved_retail) || 0,
    low: Number(lowRow.n) || 0,
    low_units: Number(lowRow.units) || 0,
    low_value: Number(lowRow.stock_value) || 0,
    low_retail: Number(lowRow.stock_retail) || 0,
    out: Number(outRow.n) || 0,
    out_units: Number(outRow.units) || 0,
    out_value: Number(outRow.stock_value) || 0,
    out_retail: Number(outRow.stock_retail) || 0,
    by_warehouse: mergeWarehouseStats(warehouses.results as { name?: string; stock_value?: number; retail_value?: number; units?: number }[]),
  });
});

inventoryRoutes.get("/batches", requirePerm("inventory.view"), async (c) => {
  const url = new URL(c.req.url);
  const p = listParams(url);
  const { page, pageSize, offset } = paginate(url);
  const where = ["p.deleted_at IS NULL"];
  const params: (string | number)[] = [];
  applyEq(where, params, "ib.product_id", p.product_id, true);
  applyEq(where, params, "p.brand_id", p.brand_id, true);
  applyEq(where, params, "p.category_id", p.category_id, true);
  await applyLocationCol(c.env.DB, where, params, "ib.location_id", p);
  applyRange(where, params, "GREATEST(COALESCE(ib.remaining_qty,0) - COALESCE(ib.reserved_qty,0), 0)", p.qty_min, p.qty_max);
  applySearch(where, params, p.q, ["ib.batch_code", "p.name_ar", "p.name_en", "p.sku", "IFNULL(p.barcode,'')", "IFNULL(pi.number,'')"], ["p.barcode", "p.sku"]);
  const whereSql = where.join(" AND ");
  const count = await c.env.DB
    .prepare(
      `SELECT COUNT(*) as n FROM inventory_batches ib JOIN products p ON p.id = ib.product_id LEFT JOIN purchase_invoices pi ON pi.id = ib.purchase_id WHERE ${whereSql}`,
    )
    .bind(...params)
    .first<{ n: number }>();
  const { results } = await c.env.DB
    .prepare(
      `SELECT ib.*, p.name_ar, p.name_en, p.sku, pi.number as purchase_number, s.name as supplier_name,
              sl.name as location_name, sl.path as location_path,
              GREATEST(COALESCE(ib.remaining_qty,0) - COALESCE(ib.reserved_qty,0), 0) as available
       FROM inventory_batches ib
       JOIN products p ON p.id = ib.product_id
       LEFT JOIN purchase_invoices pi ON pi.id = ib.purchase_id
       LEFT JOIN suppliers s ON s.id = ib.supplier_id
       LEFT JOIN storage_locations sl ON sl.id = ib.location_id
       WHERE ${whereSql}
       ORDER BY ib.id DESC LIMIT ? OFFSET ?`,
    )
    .bind(...params, pageSize, offset)
    .all();
  return c.json({ data: results, total: count?.n || 0, page, pageSize });
});

inventoryRoutes.get("/movements", requirePerm("inventory.view"), async (c) => {
  const url = new URL(c.req.url);
  const p = listParams(url);
  const { page, pageSize, offset } = paginate(url);
  const where = ["1=1"];
  const params: (string | number)[] = [];
  applyEq(where, params, "sm.product_id", p.product_id, true);
  applyEq(where, params, "p.brand_id", p.brand_id, true);
  applyEq(where, params, "p.category_id", p.category_id, true);
  applyEq(where, params, "p.part_type_id", p.part_type_id, true);
  const moveType = p.type || p.movement_type;
  if (moveType === "sale_out") where.push("sm.type IN ('sale_out','out')");
  else if (moveType === "return_in") where.push("sm.type IN ('return_in','return')");
  else applyEq(where, params, "sm.type", moveType);
  applyEq(where, params, "sm.reference_type", p.reference_type);
  applyEq(where, params, "sm.created_by", p.created_by, true);
  applyDate(where, params, "sm.created_at", p);
  if (p.model_id) {
    where.push("EXISTS (SELECT 1 FROM product_models pm WHERE pm.product_id = p.id AND pm.model_id = ?)");
    params.push(Number(p.model_id));
  }
  await applyLocationCol(c.env.DB, where, params, "COALESCE(sm.to_location_id, sm.from_location_id)", p);
  applySearch(
    where,
    params,
    p.q,
    p.product_id
      ? ["p.name_ar", "p.name_en", "p.sku", "IFNULL(p.barcode,'')", "IFNULL(ib.batch_code,'')"]
      : ["p.name_ar", "p.name_en", "p.sku", "IFNULL(p.barcode,'')", "IFNULL(sm.reference_type,'')", `IFNULL(${sqlText("sm.reference_id")},'')`, "IFNULL(ib.batch_code,'')"],
    ["p.barcode", "p.sku"],
  );
  const whereSql = where.join(" AND ");
  const count = await c.env.DB
    .prepare(`SELECT COUNT(*) as n FROM stock_movements sm JOIN products p ON p.id = sm.product_id LEFT JOIN inventory_batches ib ON ib.id = sm.batch_id WHERE ${whereSql}`)
    .bind(...params)
    .first<{ n: number }>();
  const { results } = await c.env.DB
    .prepare(
      `SELECT sm.*, p.name_ar, p.name_en, p.sku, ib.batch_code,
              fl.name as from_location, tl.name as to_location
       FROM stock_movements sm
       JOIN products p ON p.id = sm.product_id
       LEFT JOIN inventory_batches ib ON ib.id = sm.batch_id
       LEFT JOIN storage_locations fl ON fl.id = sm.from_location_id
       LEFT JOIN storage_locations tl ON tl.id = sm.to_location_id
       WHERE ${whereSql}
       ORDER BY sm.id DESC LIMIT ? OFFSET ?`,
    )
    .bind(...params, pageSize, offset)
    .all();
  return c.json({ data: results, total: count?.n || 0, page, pageSize });
});

inventoryRoutes.post("/adjust", requirePerm("inventory.adjust"), async (c) => {
  const b = await c.req.json<{ product_id: number; batch_id?: number; qty: number; reason: string }>();
  if (!b.product_id || !b.qty) return c.json({ error: "missing" }, 400);
  const user = c.get("user");
  const prod = await c.env.DB.prepare("SELECT location_id FROM products WHERE id = ?").bind(b.product_id).first<{ location_id: number | null }>();
  let locId = prod?.location_id || null;
  let batchId = b.batch_id;
  if (batchId) {
    const batch = await c.env.DB.prepare("SELECT location_id FROM inventory_batches WHERE id = ?").bind(batchId).first<{ location_id: number | null }>();
    if (batch?.location_id) locId = batch.location_id;
  }
  if (!batchId) {
    const batches = await availableBatches(c.env.DB, b.product_id);
    if (!batches.length && b.qty < 0) return c.json({ error: "no_batch" }, 400);
    if (b.qty > 0) {
      const code = await nextNumber(c.env.DB, "batch");
      const ins = await c.env.DB
        .prepare(
          `INSERT INTO inventory_batches (batch_code, product_id, purchase_date, original_qty, remaining_qty, reserved_qty, unit_cost, notes, location_id)
           VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)`,
        )
        .bind(code, b.product_id, todayIso(), b.qty, b.qty, b.reason || "adjustment", locId)
        .run();
      batchId = ins.meta.last_row_id;
      await c.env.DB.prepare("UPDATE products SET current_stock = current_stock + ?, updated_at = datetime('now') WHERE id = ?").bind(b.qty, b.product_id).run();
    } else {
      batchId = batches[0].id;
      const fromBatch = await c.env.DB.prepare("SELECT location_id FROM inventory_batches WHERE id = ?").bind(batchId).first<{ location_id: number | null }>();
      if (fromBatch?.location_id) locId = fromBatch.location_id;
    }
  }
  if (b.qty > 0 && b.batch_id) {
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE inventory_batches SET remaining_qty = remaining_qty + ? WHERE id = ?").bind(b.qty, batchId),
      c.env.DB.prepare("UPDATE products SET current_stock = current_stock + ?, updated_at = datetime('now') WHERE id = ?").bind(b.qty, b.product_id),
    ]);
  } else if (b.qty < 0) {
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE inventory_batches SET remaining_qty = remaining_qty + ? WHERE id = ?").bind(b.qty, batchId),
      c.env.DB.prepare("UPDATE products SET current_stock = current_stock + ?, updated_at = datetime('now') WHERE id = ?").bind(b.qty, b.product_id),
    ]);
  }
  await logMovement(c.env.DB, {
    productId: b.product_id,
    batchId: batchId || null,
    type: "adjust",
    qty: b.qty,
    unitCost: null,
    referenceType: "adjustment",
    referenceId: 0,
    notes: b.reason || "",
    userId: user.id,
    toLocationId: b.qty > 0 ? locId : null,
    fromLocationId: b.qty < 0 ? locId : null,
  });
  await audit(c.env.DB, user, "stock_adjustment", "product", b.product_id, `Adjust ${b.qty}: ${b.reason || ""}`);
  await maybeStockAlerts(c.env.DB, b.product_id);
  return c.json({ ok: true });
});

inventoryRoutes.get("/purchases", requirePerm("purchases.view"), async (c) => {
  const url = new URL(c.req.url);
  const p = listParams(url);
  const { page, pageSize, offset } = paginate(url);
  const where = ["pi.deleted_at IS NULL"];
  const params: (string | number)[] = [];
  applySearch(where, params, p.q, ["pi.number", "IFNULL(s.name,'')", "IFNULL(s.phone,'')"]);
  applyEq(where, params, "pi.supplier_id", p.supplier_id, true);
  applyEq(where, params, "pi.status", p.status);
  applyEq(where, params, "pi.created_by", p.created_by, true);
  applyDate(where, params, "pi.date", p);
  applyRange(where, params, "pi.total", p.amount_min, p.amount_max);
  if (p.product_id || p.brand_id || p.model_id) {
    const inner = ["pii.purchase_id = pi.id"];
    if (p.product_id) {
      inner.push("pii.product_id = ?");
      params.push(Number(p.product_id));
    }
    if (p.brand_id) {
      inner.push("pr.brand_id = ?");
      params.push(Number(p.brand_id));
    }
    if (p.model_id) {
      inner.push("EXISTS (SELECT 1 FROM product_models pm WHERE pm.product_id = pr.id AND pm.model_id = ?)");
      params.push(Number(p.model_id));
    }
    where.push(`EXISTS (SELECT 1 FROM purchase_invoice_items pii JOIN products pr ON pr.id = pii.product_id WHERE ${inner.join(" AND ")})`);
  }
  const whereSql = where.join(" AND ");
  const count = await c.env.DB
    .prepare(`SELECT COUNT(*) as n FROM purchase_invoices pi LEFT JOIN suppliers s ON s.id = pi.supplier_id WHERE ${whereSql}`)
    .bind(...params)
    .first<{ n: number }>();
  const sums = await c.env.DB
    .prepare(`SELECT COALESCE(SUM(pi.total),0) as total, COALESCE(SUM(pi.paid),0) as paid, COALESCE(SUM(pi.remaining),0) as remaining FROM purchase_invoices pi LEFT JOIN suppliers s ON s.id = pi.supplier_id WHERE ${whereSql}`)
    .bind(...params)
    .first<{ total: number; paid: number; remaining: number }>();
  const { results } = await c.env.DB
    .prepare(
      `SELECT pi.*, s.name as supplier_name FROM purchase_invoices pi
       LEFT JOIN suppliers s ON s.id = pi.supplier_id
       WHERE ${whereSql} ORDER BY pi.id DESC LIMIT ? OFFSET ?`,
    )
    .bind(...params, pageSize, offset)
    .all();
  return c.json({ data: results, total: count?.n || 0, page, pageSize, totals: { count: count?.n || 0, total: sums?.total || 0, paid: sums?.paid || 0, remaining: sums?.remaining || 0 } });
});

inventoryRoutes.get("/purchases/:id", requirePerm("purchases.view"), async (c) => {
  const id = Number(c.req.param("id"));
  const inv = await c.env.DB
    .prepare(`SELECT pi.*, s.name as supplier_name FROM purchase_invoices pi LEFT JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.id = ?`)
    .bind(id)
    .first();
  if (!inv) return c.json({ error: "not_found" }, 404);
  const items = await c.env.DB
    .prepare(
      `SELECT pii.*, p.name_ar, p.name_en, p.sku FROM purchase_invoice_items pii JOIN products p ON p.id = pii.product_id WHERE pii.purchase_id = ?`,
    )
    .bind(id)
    .all();
  const returns = await c.env.DB.prepare("SELECT * FROM purchase_returns WHERE purchase_id = ? ORDER BY id DESC").bind(id).all().catch(() => ({ results: [] as unknown[] }));
  const payments = await c.env.DB
    .prepare("SELECT * FROM payments WHERE purchase_id = ? AND voided_at IS NULL ORDER BY id")
    .bind(id)
    .all()
    .catch(() => ({ results: [] as unknown[] }));
  return c.json({ data: { ...inv, items: items.results, returns: returns.results, payments: payments.results } });
});

inventoryRoutes.post("/purchases", requirePerm("purchases.create"), async (c) => {
  const b = await c.req.json<{
    supplier_id?: number;
    date?: string;
    discount?: number;
    extra_expenses?: number;
    notes?: string;
    paid?: number;
    payment_method?: string;
    surplus_mode?: string;
    items: { product_id: number; quantity: number; unit_cost: number; selling_price?: number; discount?: number; expiry_date?: string; production_date?: string }[];
  }>();
  if (!b.items?.length) return c.json({ error: "no_items" }, 400);
  if (!b.supplier_id) return c.json({ error: "supplier_required" }, 400);
  if (b.items.some((i) => Number(i.quantity) <= 0)) return c.json({ error: "invalid_qty" }, 400);
  const number = await nextNumber(c.env.DB, "purchase");
  const subtotal = round2(b.items.reduce((s, i) => s + i.quantity * i.unit_cost - (i.discount || 0), 0));
  const total = round2(subtotal - (b.discount || 0) + (b.extra_expenses || 0));
  const surplusMode = b.surplus_mode === "ignore" ? "ignore" : "wallet";
  const split = splitInvoiceCash(Number(b.paid || 0), total, surplusMode);
  const paid = split.invoicePaid;
  const remaining = split.remaining;
  const walletSurplus = split.surplus;
  const user = c.get("user");
  let id = 0;
  try {
    id = await c.env.DB.transaction(async (tx) => {
      const ins = await tx
        .prepare(
          `INSERT INTO purchase_invoices (number, supplier_id, date, status, subtotal, discount, extra_expenses, total, notes, created_by, paid, remaining, payment_method, wallet_surplus)
           VALUES (?, ?, ?, 'approved', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(number, b.supplier_id || null, b.date || todayIso(), subtotal, b.discount || 0, b.extra_expenses || 0, total, b.notes || null, user.id, paid, remaining, b.payment_method || (remaining > 0 ? "credit" : "cash"), walletSurplus)
        .run();
      const purchaseId = ins.meta.last_row_id;
      await tx.batch(
        b.items.map((i) =>
          tx
            .prepare(
              `INSERT INTO purchase_invoice_items (purchase_id, product_id, quantity, unit_cost, discount, total, expiry_date, production_date)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(purchaseId, i.product_id, i.quantity, i.unit_cost, i.discount || 0, round2(i.quantity * i.unit_cost - (i.discount || 0)), i.expiry_date || null, i.production_date || null),
        ),
      );
      const sellUpdates = b.items
        .filter((i) => i.selling_price != null && Number.isFinite(Number(i.selling_price)))
        .map((i) =>
          tx.prepare("UPDATE products SET selling_price = ?, updated_at = datetime('now') WHERE id = ?").bind(Number(i.selling_price), i.product_id),
        );
      if (sellUpdates.length) await tx.batch(sellUpdates);
      await receivePurchase(
        tx,
        {
          id: purchaseId,
          number,
          status: "approved",
          supplier_id: b.supplier_id || null,
          date: b.date || todayIso(),
          total,
          paid,
          remaining,
          payment_method: b.payment_method || (remaining > 0 ? "credit" : "cash"),
          wallet_surplus: walletSurplus,
        },
        user,
      );
      return purchaseId;
    });
  } catch (err) {
    if (isLedgerErr(err)) return ledgerFail(c);
    throw err;
  }
  await audit(c.env.DB, user, "purchase", "purchase", id, `Create ${number}`);
  await safeNotify(async () => {
    const supplier = b.supplier_id
      ? await c.env.DB.prepare("SELECT name FROM suppliers WHERE id = ?").bind(b.supplier_id).first<{ name: string }>()
      : null;
    await notifyAdmins(c.env.DB, {
      type: "stock",
      titleAr: "فاتورة مشتريات جديدة",
      titleEn: "New purchase invoice",
      bodyAr: `تم تسجيل فاتورة مشتريات جديدة من المورد ${supplier?.name || ""} — ${number}`,
      bodyEn: `A new purchase was recorded from ${supplier?.name || "a supplier"} — ${number}`,
      entityType: "purchase",
      entityId: Number(id),
      actionUrl: `/purchases/${id}`,
    });
  });
  return c.json({ id, number }, 201);
});

inventoryRoutes.post("/purchases/:id/approve", requirePerm("purchases.approve"), async (c) => {
  const id = Number(c.req.param("id"));
  const inv = await c.env.DB.prepare("SELECT * FROM purchase_invoices WHERE id = ? AND deleted_at IS NULL").bind(id).first<PurchaseRow>();
  if (!inv) return c.json({ error: "not_found" }, 404);
  if (inv.status === "approved" || inv.status === "partially_returned") return c.json({ error: "already_approved" }, 400);
  if (inv.status === "rejected" || inv.status === "void") return c.json({ error: "cannot_approve" }, 400);
  const user = c.get("user");
  try {
    await c.env.DB.transaction(async (tx) => {
      await receivePurchase(tx, inv, user);
    });
  } catch (err) {
    if (isLedgerErr(err)) return ledgerFail(c);
    throw err;
  }
  await audit(c.env.DB, user, "purchase", "purchase", id, `Approve ${inv.number}`, { old_value: { status: inv.status }, new_value: { status: "approved" } });
  return c.json({ ok: true });
});

inventoryRoutes.post("/purchases/:id/submit", requirePerm("purchases.create"), async (c) => {
  const id = Number(c.req.param("id"));
  const inv = await c.env.DB.prepare("SELECT status, number FROM purchase_invoices WHERE id = ? AND deleted_at IS NULL").bind(id).first<{ status: string; number: string }>();
  if (!inv) return c.json({ error: "not_found" }, 404);
  if (inv.status !== "draft") return c.json({ error: "not_draft" }, 400);
  await c.env.DB.prepare("UPDATE purchase_invoices SET status = 'submitted', submitted_at = datetime('now') WHERE id = ?").bind(id).run();
  await audit(c.env.DB, c.get("user"), "submit_purchase", "purchase", id, `Submit ${inv.number}`, { old_value: { status: inv.status }, new_value: { status: "submitted" } });
  return c.json({ ok: true });
});

inventoryRoutes.post("/purchases/:id/reject", requirePerm("purchases.approve"), async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json<{ reason?: string }>().catch(() => ({ reason: "" }));
  const inv = await c.env.DB.prepare("SELECT status, number FROM purchase_invoices WHERE id = ? AND deleted_at IS NULL").bind(id).first<{ status: string; number: string }>();
  if (!inv) return c.json({ error: "not_found" }, 404);
  if (inv.status !== "submitted" && inv.status !== "draft") return c.json({ error: "cannot_reject" }, 400);
  await c.env.DB
    .prepare("UPDATE purchase_invoices SET status = 'rejected', rejected_at = datetime('now'), reject_reason = ? WHERE id = ?")
    .bind(b.reason || null, id)
    .run();
  await audit(c.env.DB, c.get("user"), "reject_purchase", "purchase", id, `Reject ${inv.number}`);
  return c.json({ ok: true });
});

inventoryRoutes.post("/purchases/:id/pay", requirePerm("payments.create", "purchases.approve"), async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json<{ amount: number; method?: string; notes?: string; surplus_mode?: string }>();
  const inv = await c.env.DB.prepare("SELECT * FROM purchase_invoices WHERE id = ? AND deleted_at IS NULL").bind(id).first<{
    id: number;
    number: string;
    status: string;
    supplier_id: number | null;
    paid: number;
    remaining: number;
    payment_method: string | null;
  }>();
  if (!inv) return c.json({ error: "not_found" }, 404);
  if (inv.status !== "approved" && inv.status !== "partially_returned") return c.json({ error: "cannot_approve" }, 400);
  const surplusMode = b.surplus_mode === "ignore" ? "ignore" : "wallet";
  const split = splitInvoiceCash(Number(b.amount || 0), Number(inv.remaining || 0), surplusMode);
  if (split.cash <= 0) return c.json({ error: "invalid_amount" }, 400);
  const invoiceTake = split.invoicePaid;
  const surplus = split.surplus;
  const paid = round2(Number(inv.paid || 0) + invoiceTake);
  const remaining = split.remaining;
  const take = round2(invoiceTake + surplus);
  const user = c.get("user");
  try {
    await c.env.DB.transaction(async (tx) => {
      const payIns = await tx
        .prepare("INSERT INTO payments (invoice_id, customer_id, supplier_id, purchase_id, method, amount, date, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(null, null, inv.supplier_id, invoiceTake > 0 ? id : null, b.method || "cash", invoiceTake > 0 ? invoiceTake : take, todayIso(), invoiceTake > 0 ? (b.notes || null) : "surplus wallet", user.id)
        .run();
      const payId = payIns.meta.last_row_id;
      await tx.prepare("UPDATE purchase_invoices SET paid = ?, remaining = ? WHERE id = ?").bind(paid, remaining, id).run();
      if (inv.supplier_id) {
        await tx.prepare("UPDATE suppliers SET balance = COALESCE(balance,0) - ? WHERE id = ?").bind(take, inv.supplier_id).run();
      }
      if (surplus > 0 && invoiceTake > 0 && inv.supplier_id) {
        await tx
          .prepare("INSERT INTO payments (invoice_id, customer_id, supplier_id, purchase_id, method, amount, date, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(null, null, inv.supplier_id, null, b.method || "cash", surplus, todayIso(), "surplus wallet", user.id)
          .run();
      }
      await postSupplierPaymentJournal(tx, {
        paymentId: payId,
        invoiceNumber: inv.number,
        amount: take,
        method: b.method || inv.payment_method || "cash",
        date: todayIso(),
        userId: user.id,
      });
    });
  } catch (err) {
    if (isLedgerErr(err)) return ledgerFail(c);
    throw err;
  }
  await audit(c.env.DB, user, "payment", "purchase", id, `Pay ${take} on ${inv.number}`);
  return c.json({ ok: true, paid, remaining, surplus });
});

inventoryRoutes.post("/purchases/:id/returns", requirePerm("purchases.return", "purchases.approve"), async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json<{ reason?: string; items: { purchase_item_id: number; qty: number }[] }>();
  if (!b.items?.length) return c.json({ error: "no_items" }, 400);
  const inv = await c.env.DB.prepare("SELECT * FROM purchase_invoices WHERE id = ? AND deleted_at IS NULL").bind(id).first<{
    id: number;
    number: string;
    status: string;
    supplier_id: number | null;
    date: string;
    subtotal: number;
    discount: number;
    extra_expenses: number;
    total: number;
    paid: number;
    remaining: number;
    returned_total?: number;
    payment_method: string | null;
  }>();
  if (!inv) return c.json({ error: "not_found" }, 404);
  if (inv.status !== "approved" && inv.status !== "partially_returned") return c.json({ error: "cannot_return" }, 400);
  const { results: items } = await c.env.DB
    .prepare("SELECT * FROM purchase_invoice_items WHERE purchase_id = ?")
    .bind(id)
    .all<{
      id: number;
      product_id: number;
      quantity: number;
      unit_cost: number;
      discount: number;
      total: number;
      returned_qty: number;
    }>();
  const user = c.get("user");
  const goodsBase = round2(Number(inv.subtotal || 0));
  const headerDiscount = round2(Number(inv.discount || 0));
  const extra = round2(Number(inv.extra_expenses || 0));
  try {
    const result = await c.env.DB.transaction(async (tx) => {
      const number = await nextNumber(tx, "return");
      const ret = await tx
        .prepare("INSERT INTO purchase_returns (number, purchase_id, supplier_id, date, reason, status, total, created_by) VALUES (?, ?, ?, ?, ?, 'completed', 0, ?)")
        .bind(number, id, inv.supplier_id, todayIso(), b.reason || null, user.id)
        .run();
      const retId = ret.meta.last_row_id;
      let retTotal = 0;
      for (const line of b.items) {
        const item = items.find((i) => i.id === line.purchase_item_id);
        if (!item) continue;
        const maxQty = Number(item.quantity) - Number(item.returned_qty || 0);
        const qty = Math.min(line.qty, maxQty);
        if (qty <= 0) continue;
        const lineTotal = returnLineNet({
          lineQty: Number(item.quantity),
          qty,
          lineNetAfterLineDisc: Number(item.total),
          goodsBase,
          headerDiscount,
          extraAmount: extra,
          includeExtra: true,
        });
        const { results: batches } = await tx
          .prepare("SELECT id, remaining_qty, reserved_qty, unit_cost, location_id FROM inventory_batches WHERE purchase_item_id = ? ORDER BY id")
          .bind(item.id)
          .all<{ id: number; remaining_qty: number; reserved_qty: number; unit_cost: number; location_id: number | null }>();
        let left = qty;
        let batchId: number | null = batches[0]?.id || null;
        for (const bt of batches) {
          if (left <= 0) break;
          const avail = Math.max(0, Number(bt.remaining_qty) - Number(bt.reserved_qty || 0));
          const take = Math.min(avail, left);
          if (take <= 0) continue;
          await consumeFromBatch(tx, bt.id, item.product_id, take);
          await logMovement(tx, {
            productId: item.product_id,
            batchId: bt.id,
            type: "purchase_return",
            qty: -take,
            unitCost: bt.unit_cost,
            referenceType: "purchase_return",
            referenceId: retId,
            notes: `Return ${number}`,
            userId: user.id,
            fromLocationId: bt.location_id,
          });
          batchId = bt.id;
          left -= take;
        }
        if (left > 0) throw new Error("INSUFFICIENT_STOCK");
        retTotal = round2(retTotal + lineTotal);
        await tx
          .prepare("INSERT INTO purchase_return_items (return_id, purchase_item_id, product_id, qty, unit_cost, total, batch_id) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .bind(retId, item.id, item.product_id, qty, item.unit_cost, lineTotal, batchId)
          .run();
        await tx.prepare("UPDATE purchase_invoice_items SET returned_qty = COALESCE(returned_qty,0) + ? WHERE id = ?").bind(qty, item.id).run();
      }
      if (retTotal <= 0) throw new Error("NO_ITEMS");
      await tx.prepare("UPDATE purchase_returns SET total = ? WHERE id = ?").bind(retTotal, retId).run();
      const settled = settleReturn({
        total: Number(inv.total),
        paid: Number(inv.paid || 0),
        remaining: Number(inv.remaining || 0),
        retTotal,
        cogs: retTotal,
      });
      const returnedTotal = round2(Number(inv.returned_total || 0) + retTotal);
      await tx
        .prepare("UPDATE purchase_invoices SET total = ?, paid = ?, remaining = ?, returned_total = ? WHERE id = ?")
        .bind(settled.newTotal, settled.newPaid, settled.newRemaining, returnedTotal, id)
        .run();
      if (inv.supplier_id && settled.arDrop) {
        await tx.prepare("UPDATE suppliers SET balance = COALESCE(balance,0) - ? WHERE id = ?").bind(settled.arDrop, inv.supplier_id).run();
      }
      if (settled.refund > 0) {
        await tx
          .prepare("INSERT INTO payments (invoice_id, customer_id, supplier_id, purchase_id, method, amount, date, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(null, null, inv.supplier_id, id, "refund", -settled.refund, todayIso(), `Refund ${number}`, user.id)
          .run();
      }
      await postPurchaseReturnJournal(tx, {
        returnId: retId,
        number,
        date: todayIso(),
        retTotal,
        apDrop: settled.arDrop,
        refund: settled.refund,
        method: inv.payment_method || "cash",
        userId: user.id,
      });
      return { retId, number, retTotal };
    });
    await audit(c.env.DB, user, "return", "purchase", id, `${result.number} ${b.reason || ""}`);
    return c.json({ id: result.retId, number: result.number, total: round2(result.retTotal) }, 201);
  } catch (err) {
    if (isStockErr(err)) return c.json({ error: "insufficient_stock" }, 400);
    if (errMsg(err) === "NO_ITEMS") return c.json({ error: "no_items" }, 400);
    if (isLedgerErr(err)) return ledgerFail(c);
    throw err;
  }
});

inventoryRoutes.post("/purchases/:id/void", requirePerm("purchases.approve"), async (c) => {
  const id = Number(c.req.param("id"));
  const inv = await c.env.DB.prepare("SELECT * FROM purchase_invoices WHERE id = ?").bind(id).first<{
    status: string;
    number: string;
    supplier_id: number | null;
    remaining: number;
  }>();
  if (!inv) return c.json({ error: "not_found" }, 404);
  if (inv.status === "approved") {
    const { results: batches } = await c.env.DB
      .prepare(
        "SELECT id, product_id, remaining_qty, original_qty, reserved_qty, location_id, unit_cost FROM inventory_batches WHERE purchase_id = ?",
      )
      .bind(id)
      .all<{
        id: number;
        product_id: number;
        remaining_qty: number;
        original_qty: number;
        reserved_qty: number;
        location_id: number | null;
        unit_cost: number;
      }>();
    if (batches.some((bt) => Number(bt.remaining_qty) < Number(bt.original_qty) || Number(bt.reserved_qty) > 0)) {
      return c.json({ error: "stock_already_consumed" }, 400);
    }
    const user = c.get("user");
    for (const bt of batches) {
      const qty = Number(bt.remaining_qty);
      if (qty <= 0) continue;
      await c.env.DB.batch([
        c.env.DB.prepare("UPDATE inventory_batches SET remaining_qty = 0 WHERE id = ?").bind(bt.id),
        c.env.DB.prepare("UPDATE products SET current_stock = current_stock - ?, updated_at = datetime('now') WHERE id = ?").bind(qty, bt.product_id),
      ]);
      await logMovement(c.env.DB, {
        productId: bt.product_id,
        batchId: bt.id,
        type: "purchase_void",
        qty: -qty,
        unitCost: bt.unit_cost,
        referenceType: "purchase",
        referenceId: id,
        notes: `Void ${inv.number}`,
        userId: user.id,
        fromLocationId: bt.location_id,
      });
    }
    const remaining = round2(Number(inv.remaining || 0));
    if (inv.supplier_id && remaining > 0) {
      await c.env.DB.prepare("UPDATE suppliers SET balance = COALESCE(balance,0) - ? WHERE id = ?").bind(remaining, inv.supplier_id).run();
    }
  }
  await c.env.DB.prepare("UPDATE purchase_invoices SET deleted_at = datetime('now'), status = 'void' WHERE id = ?").bind(id).run();
  await audit(c.env.DB, c.get("user"), "purchase", "purchase", id, `Void ${inv.number}`);
  return c.json({ ok: true });
});
