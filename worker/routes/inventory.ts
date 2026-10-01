import { Hono } from "hono";
import { audit, nextNumber, notify, paginate, round2, todayIso, type AppBindings, type AppVars } from "../lib/helpers";
import { requirePerm } from "../lib/auth";
import { applyDate, applyEq, applyLocationCol, applyRange, applySearch, listParams } from "../lib/filters";
import { availableBatches, logMovement, maybeStockAlerts, planAllocation, restockToBatch, weightedCost } from "../lib/stock";
import { postPurchaseJournal, tryLedger } from "../lib/ledger";

export const inventoryRoutes = new Hono<{ Bindings: AppBindings; Variables: AppVars }>();

inventoryRoutes.get("/summary", requirePerm("inventory.view"), async (c) => {
  const [value, low, out, reserved, warehouses] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT COALESCE(SUM(remaining_qty * unit_cost),0) as stock_value,
              COALESCE(SUM(remaining_qty),0) as units
       FROM inventory_batches`,
    ),
    c.env.DB.prepare(
      `SELECT COUNT(*) as n FROM products WHERE deleted_at IS NULL AND COALESCE(kind,'product') != 'service' AND (current_stock - reserved_stock) > 0 AND (current_stock - reserved_stock) <= min_stock`,
    ),
    c.env.DB.prepare(`SELECT COUNT(*) as n FROM products WHERE deleted_at IS NULL AND COALESCE(kind,'product') != 'service' AND (current_stock - reserved_stock) <= 0`),
    c.env.DB.prepare(`SELECT COALESCE(SUM(reserved_stock),0) as n FROM products WHERE deleted_at IS NULL`),
    c.env.DB.prepare(
      `SELECT COALESCE(sl.warehouse, 'بدون مخزن') as name,
              COALESCE(SUM(ib.remaining_qty * ib.unit_cost),0) as stock_value,
              COALESCE(SUM(ib.remaining_qty),0) as units
       FROM inventory_batches ib
       LEFT JOIN storage_locations sl ON sl.id = ib.location_id
       GROUP BY sl.warehouse`,
    ),
  ]);
  return c.json({
    stock_value: (value.results[0] as { stock_value: number }).stock_value,
    units: (value.results[0] as { units: number }).units,
    low: (low.results[0] as { n: number }).n,
    out: (out.results[0] as { n: number }).n,
    reserved: (reserved.results[0] as { n: number }).n,
    by_warehouse: warehouses.results,
  });
});

inventoryRoutes.get("/batches", requirePerm("inventory.view"), async (c) => {
  const url = new URL(c.req.url);
  const p = listParams(url);
  const { page, pageSize, offset } = paginate(url);
  const where = ["1=1"];
  const params: (string | number)[] = [];
  applyEq(where, params, "ib.product_id", p.product_id, true);
  applyEq(where, params, "p.brand_id", p.brand_id, true);
  applyEq(where, params, "p.category_id", p.category_id, true);
  await applyLocationCol(c.env.DB, where, params, "ib.location_id", p);
  applyRange(where, params, "(ib.remaining_qty - ib.reserved_qty)", p.qty_min, p.qty_max);
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
              (ib.remaining_qty - ib.reserved_qty) as available
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
  applyEq(where, params, "sm.type", p.type || p.movement_type);
  applyEq(where, params, "sm.reference_type", p.reference_type);
  applyEq(where, params, "sm.created_by", p.created_by, true);
  applyDate(where, params, "sm.created_at", p);
  if (p.model_id) {
    where.push("EXISTS (SELECT 1 FROM product_models pm WHERE pm.product_id = p.id AND pm.model_id = ?)");
    params.push(Number(p.model_id));
  }
  await applyLocationCol(c.env.DB, where, params, "COALESCE(sm.to_location_id, sm.from_location_id)", p);
  applySearch(where, params, p.q, ["p.name_ar", "p.name_en", "p.sku", "IFNULL(p.barcode,'')", "IFNULL(sm.reference_type,'')", "IFNULL(CAST(sm.reference_id AS TEXT),'')", "IFNULL(ib.batch_code,'')"], ["p.barcode", "p.sku"]);
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
  let batchId = b.batch_id;
  if (!batchId) {
    const batches = await availableBatches(c.env.DB, b.product_id);
    if (!batches.length && b.qty < 0) return c.json({ error: "no_batch" }, 400);
    if (b.qty > 0) {
      const code = await nextNumber(c.env.DB, "batch");
      const ins = await c.env.DB
        .prepare(
          `INSERT INTO inventory_batches (batch_code, product_id, purchase_date, original_qty, remaining_qty, reserved_qty, unit_cost, notes)
           VALUES (?, ?, ?, ?, ?, 0, 0, ?)`,
        )
        .bind(code, b.product_id, todayIso(), b.qty, b.qty, b.reason || "adjustment")
        .run();
      batchId = ins.meta.last_row_id;
    } else {
      batchId = batches[0].id;
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
    .prepare(`SELECT COALESCE(SUM(pi.total),0) as total FROM purchase_invoices pi LEFT JOIN suppliers s ON s.id = pi.supplier_id WHERE ${whereSql}`)
    .bind(...params)
    .first<{ total: number }>();
  const { results } = await c.env.DB
    .prepare(
      `SELECT pi.*, s.name as supplier_name FROM purchase_invoices pi
       LEFT JOIN suppliers s ON s.id = pi.supplier_id
       WHERE ${whereSql} ORDER BY pi.id DESC LIMIT ? OFFSET ?`,
    )
    .bind(...params, pageSize, offset)
    .all();
  return c.json({ data: results, total: count?.n || 0, page, pageSize, totals: { count: count?.n || 0, total: sums?.total || 0 } });
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
  return c.json({ data: { ...inv, items: items.results } });
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
    items: { product_id: number; quantity: number; unit_cost: number; discount?: number; expiry_date?: string; production_date?: string }[];
  }>();
  if (!b.items?.length) return c.json({ error: "no_items" }, 400);
  const number = await nextNumber(c.env.DB, "purchase");
  const subtotal = round2(b.items.reduce((s, i) => s + i.quantity * i.unit_cost - (i.discount || 0), 0));
  const total = round2(subtotal - (b.discount || 0) + (b.extra_expenses || 0));
  const paid = round2(Math.min(Math.max(0, Number(b.paid || 0)), total));
  const remaining = round2(total - paid);
  const ins = await c.env.DB
    .prepare(
      `INSERT INTO purchase_invoices (number, supplier_id, date, status, subtotal, discount, extra_expenses, total, notes, created_by, paid, remaining, payment_method)
       VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(number, b.supplier_id || null, b.date || todayIso(), subtotal, b.discount || 0, b.extra_expenses || 0, total, b.notes || null, c.get("user").id, paid, remaining, b.payment_method || (remaining > 0 ? "credit" : "cash"))
    .run();
  const id = ins.meta.last_row_id;
  await c.env.DB.batch(
    b.items.map((i) =>
      c.env.DB
        .prepare(
          `INSERT INTO purchase_invoice_items (purchase_id, product_id, quantity, unit_cost, discount, total, expiry_date, production_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(id, i.product_id, i.quantity, i.unit_cost, i.discount || 0, round2(i.quantity * i.unit_cost - (i.discount || 0)), i.expiry_date || null, i.production_date || null),
    ),
  );
  await audit(c.env.DB, c.get("user"), "purchase", "purchase", id, `Create ${number}`);
  return c.json({ id, number }, 201);
});

inventoryRoutes.post("/purchases/:id/approve", requirePerm("purchases.approve"), async (c) => {
  const id = Number(c.req.param("id"));
  const inv = await c.env.DB.prepare("SELECT * FROM purchase_invoices WHERE id = ? AND deleted_at IS NULL").bind(id).first<{
    id: number;
    number: string;
    status: string;
    supplier_id: number | null;
    date: string;
    total: number;
    paid: number;
    remaining: number;
    payment_method: string | null;
  }>();
  if (!inv) return c.json({ error: "not_found" }, 404);
  if (inv.status === "approved") return c.json({ error: "already_approved" }, 400);
  if (inv.status === "rejected" || inv.status === "void") return c.json({ error: "cannot_approve" }, 400);
  const { results: items } = await c.env.DB
    .prepare("SELECT * FROM purchase_invoice_items WHERE purchase_id = ?")
    .bind(id)
    .all<{
      id: number;
      product_id: number;
      quantity: number;
      unit_cost: number;
      expiry_date: string | null;
      production_date: string | null;
    }>();
  const user = c.get("user");
  for (const item of items) {
    const code = await nextNumber(c.env.DB, "batch");
    const prod = await c.env.DB.prepare("SELECT location_id FROM products WHERE id = ?").bind(item.product_id).first<{ location_id: number | null }>();
    const batch = await c.env.DB
      .prepare(
        `INSERT INTO inventory_batches (batch_code, product_id, purchase_id, purchase_item_id, supplier_id, purchase_date, original_qty, remaining_qty, reserved_qty, unit_cost, expiry_date, production_date, location_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
      )
      .bind(
        code,
        item.product_id,
        id,
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
    await c.env.DB
      .prepare("UPDATE products SET current_stock = current_stock + ?, purchase_price = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(item.quantity, item.unit_cost, item.product_id)
      .run();
    await logMovement(c.env.DB, {
      productId: item.product_id,
      batchId: batch.meta.last_row_id,
      type: "purchase_in",
      qty: item.quantity,
      unitCost: item.unit_cost,
      referenceType: "purchase",
      referenceId: id,
      notes: `Receive ${inv.number}`,
      userId: user.id,
      toLocationId: prod?.location_id || null,
    });
    if (inv.supplier_id) {
      await c.env.DB
        .prepare(
          `INSERT INTO supplier_product_prices (supplier_id, product_id, unit_cost, last_purchase_id, last_date)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(supplier_id, product_id) DO UPDATE SET unit_cost = excluded.unit_cost, last_purchase_id = excluded.last_purchase_id, last_date = excluded.last_date`,
        )
        .bind(inv.supplier_id, item.product_id, item.unit_cost, id, inv.date)
        .run();
    }
  }
  await c.env.DB
    .prepare("UPDATE purchase_invoices SET status = 'approved', approved_at = datetime('now'), approved_by = ? WHERE id = ?")
    .bind(user.id, id)
    .run();
  const paid = round2(Number(inv.paid || 0));
  const remaining = round2(Number(inv.remaining ?? inv.total - paid));
  if (inv.supplier_id && remaining > 0) {
    await c.env.DB.prepare("UPDATE suppliers SET balance = COALESCE(balance,0) + ? WHERE id = ?").bind(remaining, inv.supplier_id).run();
  }
  await tryLedger(() =>
    postPurchaseJournal(
      c.env.DB,
      { id, number: inv.number, date: inv.date, total: Number(inv.total), paid, remaining, payment_method: inv.payment_method },
      user.id,
    ),
  );
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

inventoryRoutes.post("/purchases/:id/void", requirePerm("purchases.approve"), async (c) => {
  const id = Number(c.req.param("id"));
  const inv = await c.env.DB.prepare("SELECT * FROM purchase_invoices WHERE id = ?").bind(id).first<{ status: string; number: string }>();
  if (!inv) return c.json({ error: "not_found" }, 404);
  if (inv.status === "approved") return c.json({ error: "cannot_void_approved" }, 400);
  await c.env.DB.prepare("UPDATE purchase_invoices SET deleted_at = datetime('now'), status = 'void' WHERE id = ?").bind(id).run();
  await audit(c.env.DB, c.get("user"), "purchase", "purchase", id, `Void ${inv.number}`);
  return c.json({ ok: true });
});
