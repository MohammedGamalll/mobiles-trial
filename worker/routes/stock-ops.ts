import { Hono } from "hono";
import { audit, nextNumber, paginate, todayIso, type AppBindings, type AppVars, type AppDb } from "../lib/helpers";
import { applyDate, applyEq, applyLocationCol, applySearch, listParams } from "../lib/filters";
import { requirePerm } from "../lib/auth";
import { logMovement, maybeStockAlerts } from "../lib/stock";
import { withLocationLabels } from "../lib/location-label";

export const stockOpsRoutes = new Hono<{ Bindings: AppBindings; Variables: AppVars }>();

const KINDS = ["warehouse", "zone", "aisle", "bay", "shelf", "bin"] as const;

async function locationById(db: AppDb, id: number) {
  return db.prepare("SELECT * FROM storage_locations WHERE id = ? AND deleted_at IS NULL").bind(id).first<{
    id: number;
    name: string;
    kind: string;
    code: string | null;
    path: string | null;
    parent_id: number | null;
    warehouse: string | null;
    notes: string | null;
  }>();
}

async function descendantIds(db: AppDb, rootId: number) {
  const { results } = await db.prepare("SELECT id, parent_id FROM storage_locations WHERE deleted_at IS NULL").all<{
    id: number;
    parent_id: number | null;
  }>();
  const kids = new Map<number, number[]>();
  for (const r of results) {
    if (r.parent_id) {
      const list = kids.get(r.parent_id) || [];
      list.push(r.id);
      kids.set(r.parent_id, list);
    }
  }
  const out = new Set<number>([rootId]);
  const stack = [rootId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const id of kids.get(cur) || []) {
      if (!out.has(id)) {
        out.add(id);
        stack.push(id);
      }
    }
  }
  return [...out];
}

stockOpsRoutes.get("/locations", requirePerm("locations.manage", "inventory.view", "products.view", "sales.create"), async (c) => {
  const { results } = await c.env.DB
    .prepare("SELECT * FROM storage_locations WHERE deleted_at IS NULL ORDER BY COALESCE(sort_order, 0), id")
    .all();
  const labeled = withLocationLabels(results || []);
  return c.json({ data: labeled.filter((l) => Number((l as { active?: number }).active) !== 0) });
});

stockOpsRoutes.get("/locations/tree", requirePerm("locations.manage", "inventory.view"), async (c) => {
  const { results } = await c.env.DB
    .prepare(
      `SELECT sl.*,
              (SELECT COUNT(*) FROM inventory_batches ib WHERE ib.location_id = sl.id AND ib.remaining_qty > 0) as batch_count,
              (SELECT COALESCE(SUM(ib.remaining_qty * ib.unit_cost),0) FROM inventory_batches ib WHERE ib.location_id = sl.id) as stock_value
       FROM storage_locations sl
       WHERE sl.deleted_at IS NULL
       ORDER BY COALESCE(sl.sort_order, 0), sl.id`,
    )
    .all();
  return c.json({ data: withLocationLabels(results || []) });
});

stockOpsRoutes.post("/locations", requirePerm("locations.manage"), async (c) => {
  const b = await c.req.json<{
    name: string;
    kind?: string;
    code?: string;
    parent_id?: number | null;
    warehouse?: string;
    section?: string;
    rack?: string;
    shelf?: string;
    drawer?: string;
    box?: string;
    notes?: string;
    active?: number;
  }>();
  if (!b.name?.trim()) return c.json({ error: "missing" }, 400);
  const kind = KINDS.includes((b.kind || "bin") as (typeof KINDS)[number]) ? b.kind || "bin" : "bin";
  let parentPath = "";
  let warehouse = b.warehouse || "";
  if (b.parent_id) {
    const parent = await locationById(c.env.DB, Number(b.parent_id));
    if (!parent) return c.json({ error: "parent_missing" }, 400);
    parentPath = parent.path || parent.code || "";
    if (!warehouse) {
      const wh = await c.env.DB
        .prepare("SELECT warehouse FROM storage_locations WHERE id = ?")
        .bind(parent.id)
        .first<{ warehouse: string | null }>();
      warehouse = wh?.warehouse || parent.name;
    }
  }
  const code = (b.code || b.name).replace(/\s+/g, "-").toUpperCase().slice(0, 32);
  const dupCode = await c.env.DB
    .prepare("SELECT id FROM storage_locations WHERE code = ? AND deleted_at IS NULL")
    .bind(code)
    .first();
  if (dupCode) return c.json({ error: "duplicate_code" }, 400);
  const path = parentPath ? `${parentPath}/${code}` : code;
  const ins = await c.env.DB
    .prepare(
      `INSERT INTO storage_locations (name, warehouse, section, rack, shelf, drawer, box, notes, active, parent_id, kind, code, path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      b.name.trim(),
      warehouse || null,
      b.section || null,
      b.rack || null,
      b.shelf || null,
      b.drawer || null,
      b.box || null,
      b.notes || null,
      b.active === 0 ? 0 : 1,
      b.parent_id || null,
      kind,
      code,
      path,
    )
    .run();
  await audit(c.env.DB, c.get("user"), "create_location", "storage_locations", ins.meta.last_row_id, `Create ${b.name}`);
  return c.json({ id: ins.meta.last_row_id, code, path }, 201);
});

stockOpsRoutes.put("/locations/:id", requirePerm("locations.manage"), async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json<Record<string, unknown>>();
  const cur = await locationById(c.env.DB, id);
  if (!cur) return c.json({ error: "not_found" }, 404);
  const kind = KINDS.includes(String(b.kind || cur.kind || "bin") as (typeof KINDS)[number]) ? String(b.kind || cur.kind || "bin") : "bin";
  const parentId = b.parent_id === undefined ? cur.parent_id : b.parent_id ? Number(b.parent_id) : null;
  if (parentId === id) return c.json({ error: "invalid_parent" }, 400);
  if (parentId) {
    const desc = await descendantIds(c.env.DB, id);
    if (desc.includes(parentId)) return c.json({ error: "invalid_parent" }, 400);
  }
  const code = String(b.code || cur.code || "");
  if (code) {
    const dupCode = await c.env.DB
      .prepare("SELECT id FROM storage_locations WHERE code = ? AND deleted_at IS NULL AND id != ?")
      .bind(code, id)
      .first();
    if (dupCode) return c.json({ error: "duplicate_code" }, 400);
  }
  await c.env.DB
    .prepare("UPDATE storage_locations SET name=?, warehouse=?, notes=?, active=?, parent_id=?, kind=?, code=? WHERE id=?")
    .bind(b.name || cur.name, b.warehouse ?? cur.warehouse, b.notes ?? cur.notes, b.active === 0 ? 0 : 1, parentId, kind, code || cur.code, id)
    .run();
  await audit(c.env.DB, c.get("user"), "edit_location", "storage_locations", id, `Edit ${String(b.name || cur.name)}`);
  return c.json({ ok: true });
});

stockOpsRoutes.delete("/locations/:id", requirePerm("locations.manage"), async (c) => {
  const id = Number(c.req.param("id"));
  const ids = await descendantIds(c.env.DB, id);
  const placeholders = ids.map(() => "?").join(",");
  const stock = await c.env.DB
    .prepare(`SELECT COUNT(*) as n FROM inventory_batches WHERE location_id IN (${placeholders}) AND remaining_qty > 0`)
    .bind(...ids)
    .first<{ n: number }>();
  if (Number(stock?.n || 0) > 0) return c.json({ error: "location_has_stock" }, 400);
  await c.env.DB.prepare("UPDATE storage_locations SET deleted_at = datetime('now'), active = 0 WHERE id = ?").bind(id).run();
  await audit(c.env.DB, c.get("user"), "delete_location", "storage_locations", id, "Soft delete location");
  return c.json({ ok: true });
});

stockOpsRoutes.get("/by-location", requirePerm("inventory.view"), async (c) => {
  const locationId = Number(new URL(c.req.url).searchParams.get("location_id") || 0);
  if (!locationId) return c.json({ data: [] });
  const ids = await descendantIds(c.env.DB, locationId);
  const placeholders = ids.map(() => "?").join(",");
  const { results } = await c.env.DB
    .prepare(
      `SELECT ib.*, p.name_ar, p.name_en, p.sku, sl.name as location_name, sl.path as location_path,
              (ib.remaining_qty - ib.reserved_qty) as available
       FROM inventory_batches ib
       JOIN products p ON p.id = ib.product_id
       LEFT JOIN storage_locations sl ON sl.id = ib.location_id
       WHERE ib.location_id IN (${placeholders}) AND ib.remaining_qty > 0
       ORDER BY p.name_ar, ib.id`,
    )
    .bind(...ids)
    .all();
  return c.json({ data: results });
});

stockOpsRoutes.get("/transfers", requirePerm("transfers.view"), async (c) => {
  const url = new URL(c.req.url);
  const p = listParams(url);
  const { page, pageSize, offset } = paginate(url);
  const where = ["1=1"];
  const params: (string | number)[] = [];
  applySearch(where, params, p.q, ["t.number", "f.name", "d.name"]);
  applyEq(where, params, "t.status", p.status);
  applyEq(where, params, "t.from_location_id", p.from_location_id || p.warehouse_id, true);
  applyEq(where, params, "t.to_location_id", p.to_location_id, true);
  applyEq(where, params, "t.created_by", p.created_by, true);
  applyDate(where, params, "t.date", p);
  if (p.product_id) {
    where.push("EXISTS (SELECT 1 FROM stock_transfer_items i WHERE i.transfer_id = t.id AND i.product_id = ?)");
    params.push(Number(p.product_id));
  }
  const { results } = await c.env.DB
    .prepare(
      `SELECT t.*, f.name as from_name, f.path as from_path, d.name as to_name, d.path as to_path
       FROM stock_transfers t
       JOIN storage_locations f ON f.id = t.from_location_id
       JOIN storage_locations d ON d.id = t.to_location_id
       WHERE ${where.join(" AND ")}
       ORDER BY t.id DESC LIMIT ? OFFSET ?`,
    )
    .bind(...params, pageSize, offset)
    .all();
  return c.json({ data: results, page, pageSize });
});

stockOpsRoutes.get("/transfers/:id", requirePerm("transfers.view"), async (c) => {
  const id = Number(c.req.param("id"));
  const row = await c.env.DB
    .prepare(
      `SELECT t.*, f.name as from_name, d.name as to_name
       FROM stock_transfers t
       JOIN storage_locations f ON f.id = t.from_location_id
       JOIN storage_locations d ON d.id = t.to_location_id
       WHERE t.id = ?`,
    )
    .bind(id)
    .first();
  if (!row) return c.json({ error: "not_found" }, 404);
  const items = await c.env.DB
    .prepare(
      `SELECT ti.*, p.name_ar, p.sku, ib.batch_code
       FROM stock_transfer_items ti
       JOIN products p ON p.id = ti.product_id
       JOIN inventory_batches ib ON ib.id = ti.batch_id
       WHERE ti.transfer_id = ?`,
    )
    .bind(id)
    .all();
  return c.json({ data: { ...row, items: items.results } });
});

stockOpsRoutes.post("/transfers", requirePerm("transfers.create"), async (c) => {
  const b = await c.req.json<{
    from_location_id: number;
    to_location_id: number;
    date?: string;
    notes?: string;
    items: { product_id: number; batch_id: number; qty: number }[];
  }>();
  if (!b.from_location_id || !b.to_location_id) {
    return c.json({ error: "locations_required" }, 400);
  }
  if (b.from_location_id === b.to_location_id) {
    return c.json({ error: "same_location" }, 400);
  }
  if (!b.items?.length) return c.json({ error: "no_items" }, 400);
  const from = await locationById(c.env.DB, b.from_location_id);
  const to = await locationById(c.env.DB, b.to_location_id);
  if (!from || !to) return c.json({ error: "location_missing" }, 400);
  const number = await nextNumber(c.env.DB, "transfer");
  const ins = await c.env.DB
    .prepare(
      `INSERT INTO stock_transfers (number, date, status, from_location_id, to_location_id, notes, created_by)
       VALUES (?, ?, 'draft', ?, ?, ?, ?)`,
    )
    .bind(number, b.date || todayIso(), from.id, to.id, b.notes || null, c.get("user").id)
    .run();
  const id = ins.meta.last_row_id;
  for (const item of b.items) {
    const batch = await c.env.DB
      .prepare("SELECT id, product_id, remaining_qty, reserved_qty, unit_cost FROM inventory_batches WHERE id = ?")
      .bind(item.batch_id)
      .first<{ id: number; product_id: number; remaining_qty: number; reserved_qty: number; unit_cost: number }>();
    if (!batch || batch.product_id !== item.product_id) return c.json({ error: "batch_missing" }, 400);
    if (item.qty <= 0 || item.qty > batch.remaining_qty - batch.reserved_qty) return c.json({ error: "insufficient_stock" }, 400);
    await c.env.DB
      .prepare("INSERT INTO stock_transfer_items (transfer_id, product_id, batch_id, qty, unit_cost) VALUES (?, ?, ?, ?, ?)")
      .bind(id, item.product_id, item.batch_id, item.qty, batch.unit_cost)
      .run();
  }
  await audit(c.env.DB, c.get("user"), "create_transfer", "stock_transfer", id, `Create ${number}`);
  return c.json({ id, number }, 201);
});

stockOpsRoutes.post("/transfers/:id/complete", requirePerm("transfers.complete"), async (c) => {
  const id = Number(c.req.param("id"));
  const trn = await c.env.DB.prepare("SELECT * FROM stock_transfers WHERE id = ?").bind(id).first<{
    id: number;
    number: string;
    status: string;
    from_location_id: number;
    to_location_id: number;
  }>();
  if (!trn) return c.json({ error: "not_found" }, 404);
  if (trn.status === "completed") return c.json({ error: "already_completed" }, 400);
  if (trn.status === "cancelled") return c.json({ error: "cancelled" }, 400);
  const { results: items } = await c.env.DB
    .prepare("SELECT * FROM stock_transfer_items WHERE transfer_id = ?")
    .bind(id)
    .all<{ id: number; product_id: number; batch_id: number; qty: number; unit_cost: number }>();
  const user = c.get("user");
  for (const item of items) {
    const batch = await c.env.DB
      .prepare("SELECT * FROM inventory_batches WHERE id = ?")
      .bind(item.batch_id)
      .first<{
        id: number;
        remaining_qty: number;
        reserved_qty: number;
        unit_cost: number;
        product_id: number;
        batch_code: string;
        purchase_id: number | null;
        supplier_id: number | null;
        purchase_date: string | null;
        expiry_date: string | null;
        production_date: string | null;
      }>();
    if (!batch) return c.json({ error: "batch_missing" }, 400);
    const avail = batch.remaining_qty - batch.reserved_qty;
    if (item.qty > avail) return c.json({ error: "insufficient_stock", batch: batch.batch_code }, 400);
    const moveAll = item.qty === batch.remaining_qty && batch.reserved_qty === 0;
    let destBatchId = batch.id;
    if (moveAll) {
      await c.env.DB.prepare("UPDATE inventory_batches SET location_id = ? WHERE id = ?").bind(trn.to_location_id, batch.id).run();
    } else {
      const code = await nextNumber(c.env.DB, "batch");
      const dest = await c.env.DB
        .prepare(
          `INSERT INTO inventory_batches (batch_code, product_id, purchase_id, supplier_id, purchase_date, original_qty, remaining_qty, reserved_qty, unit_cost, expiry_date, production_date, notes, location_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
        )
        .bind(
          code,
          item.product_id,
          batch.purchase_id,
          batch.supplier_id,
          batch.purchase_date,
          item.qty,
          item.qty,
          batch.unit_cost,
          batch.expiry_date,
          batch.production_date,
          `Transfer ${trn.number}`,
          trn.to_location_id,
        )
        .run();
      destBatchId = dest.meta.last_row_id;
      await c.env.DB.prepare("UPDATE inventory_batches SET remaining_qty = remaining_qty - ? WHERE id = ?").bind(item.qty, batch.id).run();
    }
    await logMovement(c.env.DB, {
      productId: item.product_id,
      batchId: batch.id,
      type: "transfer_out",
      qty: -item.qty,
      unitCost: item.unit_cost,
      referenceType: "transfer",
      referenceId: id,
      notes: trn.number,
      userId: user.id,
      fromLocationId: trn.from_location_id,
      toLocationId: trn.to_location_id,
    });
    await logMovement(c.env.DB, {
      productId: item.product_id,
      batchId: destBatchId,
      type: "transfer_in",
      qty: item.qty,
      unitCost: item.unit_cost,
      referenceType: "transfer",
      referenceId: id,
      notes: trn.number,
      userId: user.id,
      fromLocationId: trn.from_location_id,
      toLocationId: trn.to_location_id,
    });
  }
  await c.env.DB
    .prepare("UPDATE stock_transfers SET status = 'completed', completed_by = ?, completed_at = datetime('now') WHERE id = ?")
    .bind(user.id, id)
    .run();
  await audit(c.env.DB, user, "complete_transfer", "stock_transfer", id, `Complete ${trn.number}`);
  return c.json({ ok: true });
});

stockOpsRoutes.post("/transfers/:id/cancel", requirePerm("transfers.create"), async (c) => {
  const id = Number(c.req.param("id"));
  const trn = await c.env.DB.prepare("SELECT status, number FROM stock_transfers WHERE id = ?").bind(id).first<{ status: string; number: string }>();
  if (!trn) return c.json({ error: "not_found" }, 404);
  if (trn.status !== "draft") return c.json({ error: "cannot_cancel" }, 400);
  await c.env.DB.prepare("UPDATE stock_transfers SET status = 'cancelled' WHERE id = ?").bind(id).run();
  await audit(c.env.DB, c.get("user"), "cancel_transfer", "stock_transfer", id, `Cancel ${trn.number}`);
  return c.json({ ok: true });
});

stockOpsRoutes.get("/stocktakes", requirePerm("stocktake.view"), async (c) => {
  const url = new URL(c.req.url);
  const p = listParams(url);
  const { page, pageSize, offset } = paginate(url);
  const where = ["1=1"];
  const params: (string | number)[] = [];
  applySearch(where, params, p.q, ["s.number", "IFNULL(sl.name,'')"]);
  applyEq(where, params, "s.status", p.status);
  applyEq(where, params, "s.created_by", p.created_by, true);
  applyDate(where, params, "s.date", p);
  await applyLocationCol(c.env.DB, where, params, "s.location_id", p);
  if (p.variance === "yes") where.push("EXISTS (SELECT 1 FROM stocktake_items i WHERE i.stocktake_id = s.id AND IFNULL(i.variance,0) != 0)");
  if (p.variance === "no") where.push("NOT EXISTS (SELECT 1 FROM stocktake_items i WHERE i.stocktake_id = s.id AND IFNULL(i.variance,0) != 0)");
  if (p.shortage === "1") where.push("EXISTS (SELECT 1 FROM stocktake_items i WHERE i.stocktake_id = s.id AND IFNULL(i.variance,0) < 0)");
  if (p.surplus === "1") where.push("EXISTS (SELECT 1 FROM stocktake_items i WHERE i.stocktake_id = s.id AND IFNULL(i.variance,0) > 0)");
  if (p.product_id) {
    where.push("EXISTS (SELECT 1 FROM stocktake_items i WHERE i.stocktake_id = s.id AND i.product_id = ?)");
    params.push(Number(p.product_id));
  }
  const { results } = await c.env.DB
    .prepare(
      `SELECT s.*, sl.name as location_name
       FROM stocktakes s
       LEFT JOIN storage_locations sl ON sl.id = s.location_id
       WHERE ${where.join(" AND ")}
       ORDER BY s.id DESC LIMIT ? OFFSET ?`,
    )
    .bind(...params, pageSize, offset)
    .all();
  return c.json({ data: results, page, pageSize });
});

stockOpsRoutes.get("/stocktakes/:id", requirePerm("stocktake.view"), async (c) => {
  const id = Number(c.req.param("id"));
  const row = await c.env.DB
    .prepare(
      `SELECT s.*, sl.name as location_name FROM stocktakes s LEFT JOIN storage_locations sl ON sl.id = s.location_id WHERE s.id = ?`,
    )
    .bind(id)
    .first();
  if (!row) return c.json({ error: "not_found" }, 404);
  const items = await c.env.DB
    .prepare(
      `SELECT si.*, p.name_ar, p.name_en, p.sku, ib.batch_code, sl.name as item_location
       FROM stocktake_items si
       JOIN products p ON p.id = si.product_id
       LEFT JOIN inventory_batches ib ON ib.id = si.batch_id
       LEFT JOIN storage_locations sl ON sl.id = si.location_id
       WHERE si.stocktake_id = ?
       ORDER BY p.name_ar`,
    )
    .bind(id)
    .all();
  return c.json({ data: { ...row, items: items.results } });
});

stockOpsRoutes.post("/stocktakes", requirePerm("stocktake.create"), async (c) => {
  const b = await c.req.json<{ location_id?: number | null; date?: string; notes?: string }>();
  const number = await nextNumber(c.env.DB, "stocktake");
  const ins = await c.env.DB
    .prepare("INSERT INTO stocktakes (number, date, location_id, status, notes, created_by) VALUES (?, ?, ?, 'draft', ?, ?)")
    .bind(number, b.date || todayIso(), b.location_id || null, b.notes || null, c.get("user").id)
    .run();
  const id = ins.meta.last_row_id;
  let sql = `SELECT ib.id, ib.product_id, ib.location_id, ib.remaining_qty, ib.unit_cost
             FROM inventory_batches ib
             JOIN products p ON p.id = ib.product_id
             WHERE p.deleted_at IS NULL AND COALESCE(p.kind,'product') != 'service' AND ib.remaining_qty >= 0`;
  const params: number[] = [];
  if (b.location_id) {
    const ids = await descendantIds(c.env.DB, Number(b.location_id));
    sql += ` AND ib.location_id IN (${ids.map(() => "?").join(",")})`;
    params.push(...ids);
  }
  const { results: batches } = await c.env.DB.prepare(sql).bind(...params).all<{
    id: number;
    product_id: number;
    location_id: number | null;
    remaining_qty: number;
    unit_cost: number;
  }>();
  if (batches.length) {
    await c.env.DB.batch(
      batches.map((row) =>
        c.env.DB
          .prepare(
            `INSERT INTO stocktake_items (stocktake_id, product_id, batch_id, location_id, system_qty, counted_qty, variance, unit_cost)
             VALUES (?, ?, ?, ?, ?, NULL, NULL, ?)`,
          )
          .bind(id, row.product_id, row.id, row.location_id, row.remaining_qty, row.unit_cost),
      ),
    );
  }
  await audit(c.env.DB, c.get("user"), "create_stocktake", "stocktake", id, `Create ${number}`);
  return c.json({ id, number }, 201);
});

stockOpsRoutes.put("/stocktakes/:id/counts", requirePerm("stocktake.create"), async (c) => {
  const id = Number(c.req.param("id"));
  const st = await c.env.DB.prepare("SELECT status FROM stocktakes WHERE id = ?").bind(id).first<{ status: string }>();
  if (!st) return c.json({ error: "not_found" }, 404);
  if (st.status !== "draft" && st.status !== "submitted") return c.json({ error: "locked" }, 400);
  const b = await c.req.json<{ items: { id: number; counted_qty: number; notes?: string }[] }>();
  for (const item of b.items || []) {
    const row = await c.env.DB.prepare("SELECT system_qty FROM stocktake_items WHERE id = ? AND stocktake_id = ?").bind(item.id, id).first<{ system_qty: number }>();
    if (!row) continue;
    const counted = Number(item.counted_qty);
    await c.env.DB
      .prepare("UPDATE stocktake_items SET counted_qty = ?, variance = ?, notes = ? WHERE id = ?")
      .bind(counted, counted - row.system_qty, item.notes || null, item.id)
      .run();
  }
  return c.json({ ok: true });
});

stockOpsRoutes.post("/stocktakes/:id/submit", requirePerm("stocktake.create"), async (c) => {
  const id = Number(c.req.param("id"));
  const st = await c.env.DB.prepare("SELECT status, number FROM stocktakes WHERE id = ?").bind(id).first<{ status: string; number: string }>();
  if (!st) return c.json({ error: "not_found" }, 404);
  if (st.status !== "draft") return c.json({ error: "not_draft" }, 400);
  await c.env.DB.prepare("UPDATE stocktakes SET status = 'submitted', submitted_at = datetime('now') WHERE id = ?").bind(id).run();
  await audit(c.env.DB, c.get("user"), "submit_stocktake", "stocktake", id, `Submit ${st.number}`);
  return c.json({ ok: true });
});

stockOpsRoutes.post("/stocktakes/:id/approve", requirePerm("stocktake.approve"), async (c) => {
  const id = Number(c.req.param("id"));
  const st = await c.env.DB.prepare("SELECT * FROM stocktakes WHERE id = ?").bind(id).first<{
    id: number;
    number: string;
    status: string;
  }>();
  if (!st) return c.json({ error: "not_found" }, 404);
  if (st.status === "approved") return c.json({ error: "already_approved" }, 400);
  if (st.status !== "submitted") return c.json({ error: "not_submitted" }, 400);
  const { results: items } = await c.env.DB
    .prepare("SELECT * FROM stocktake_items WHERE stocktake_id = ? AND counted_qty IS NOT NULL")
    .bind(id)
    .all<{
      id: number;
      product_id: number;
      batch_id: number | null;
      location_id: number | null;
      system_qty: number;
      counted_qty: number;
      unit_cost: number;
    }>();
  const user = c.get("user");
  for (const item of items) {
    const variance = item.counted_qty - item.system_qty;
    if (!variance || !item.batch_id) continue;
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE inventory_batches SET remaining_qty = remaining_qty + ? WHERE id = ?").bind(variance, item.batch_id),
      c.env.DB.prepare("UPDATE products SET current_stock = current_stock + ?, updated_at = datetime('now') WHERE id = ?").bind(variance, item.product_id),
    ]);
    await logMovement(c.env.DB, {
      productId: item.product_id,
      batchId: item.batch_id,
      type: "stocktake_adjust",
      qty: variance,
      unitCost: item.unit_cost,
      referenceType: "stocktake",
      referenceId: id,
      notes: `${st.number} ${variance > 0 ? "+" : ""}${variance}`,
      userId: user.id,
      toLocationId: item.location_id,
    });
    await maybeStockAlerts(c.env.DB, item.product_id);
  }
  await c.env.DB
    .prepare("UPDATE stocktakes SET status = 'approved', approved_by = ?, approved_at = datetime('now') WHERE id = ?")
    .bind(user.id, id)
    .run();
  await audit(c.env.DB, user, "approve_stocktake", "stocktake", id, `Approve ${st.number}`);
  return c.json({ ok: true });
});

stockOpsRoutes.post("/stocktakes/:id/cancel", requirePerm("stocktake.create"), async (c) => {
  const id = Number(c.req.param("id"));
  const st = await c.env.DB.prepare("SELECT status FROM stocktakes WHERE id = ?").bind(id).first<{ status: string }>();
  if (!st) return c.json({ error: "not_found" }, 404);
  if (st.status === "approved") return c.json({ error: "cannot_cancel" }, 400);
  await c.env.DB.prepare("UPDATE stocktakes SET status = 'cancelled' WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});
