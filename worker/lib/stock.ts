import type { AppDb } from "./db";
import { notifyAdmins, recentlyNotified, safeNotify } from "./notifications";

export type BatchRow = {
  id: number;
  batch_code: string;
  product_id: number;
  remaining_qty: number;
  reserved_qty: number;
  unit_cost: number;
  purchase_date: string | null;
  location_id?: number | null;
};

export type Allocation = { batch_id: number; batch_code: string; qty: number; unit_cost: number; location_id?: number | null };

/** Available qty = remaining − reserved, floored at 0. Null/undefined counts as 0. */
export function availQtySql(remainingCol: string, reservedCol: string) {
  return `GREATEST(COALESCE(${remainingCol},0) - COALESCE(${reservedCol},0), 0)`;
}

export function availCostSql(remainingCol: string, reservedCol: string, costCol: string) {
  return `(${availQtySql(remainingCol, reservedCol)} * COALESCE(${costCol},0))`;
}

export function reservedQtySql(reservedCol: string) {
  return `GREATEST(COALESCE(${reservedCol},0), 0)`;
}

export function reservedCostSql(reservedCol: string, costCol: string) {
  return `(${reservedQtySql(reservedCol)} * COALESCE(${costCol},0))`;
}

function asLocationIds(locationId?: number | number[] | null) {
  if (Array.isArray(locationId)) return locationId.map(Number).filter((n) => n > 0);
  const n = Number(locationId || 0);
  return n > 0 ? [n] : [];
}

export async function availableBatches(db: AppDb, productId: number, locationId?: number | number[] | null) {
  const ids = asLocationIds(locationId);
  const { results } = ids.length
    ? await db
        .prepare(
          `SELECT id, batch_code, product_id, remaining_qty, reserved_qty, unit_cost, purchase_date, location_id
           FROM inventory_batches
           WHERE product_id = ? AND (remaining_qty - reserved_qty) > 0 AND location_id IN (${ids.map(() => "?").join(",")})
           ORDER BY datetime(purchase_date) ASC, id ASC`,
        )
        .bind(productId, ...ids)
        .all<BatchRow>()
    : await db
        .prepare(
          `SELECT id, batch_code, product_id, remaining_qty, reserved_qty, unit_cost, purchase_date, location_id
           FROM inventory_batches
           WHERE product_id = ? AND (remaining_qty - reserved_qty) > 0
           ORDER BY datetime(purchase_date) ASC, id ASC`,
        )
        .bind(productId)
        .all<BatchRow>();
  return results;
}

async function assertAllocInScope(db: AppDb, alloc: Allocation[], locationId?: number | number[] | null) {
  const ids = asLocationIds(locationId);
  if (!ids.length || !alloc.length) return;
  const set = new Set(ids);
  for (const a of alloc) {
    const row = await db.prepare("SELECT location_id FROM inventory_batches WHERE id = ?").bind(a.batch_id).first<{ location_id: number | null }>();
    if (!row || !set.has(Number(row.location_id || 0))) throw new Error("INSUFFICIENT_STOCK");
  }
}

export function planAllocation(batches: BatchRow[], qty: number, preferredBatchId?: number | null): Allocation[] {
  if (!(qty > 0)) throw new Error("INVALID_QTY");
  const need = qty;
  const out: Allocation[] = [];
  let left = need;
  const ordered = [...batches];
  if (preferredBatchId) {
    const idx = ordered.findIndex((b) => b.id === preferredBatchId);
    if (idx > 0) {
      const [pref] = ordered.splice(idx, 1);
      ordered.unshift(pref);
    }
  }
  for (const b of ordered) {
    const avail = b.remaining_qty - b.reserved_qty;
    if (avail <= 0) continue;
    const take = Math.min(avail, left);
    out.push({ batch_id: b.id, batch_code: b.batch_code, qty: take, unit_cost: b.unit_cost, location_id: b.location_id ?? null });
    left -= take;
    if (left <= 0) break;
  }
  if (left > 0) throw new Error("INSUFFICIENT_STOCK");
  return out;
}

export function weightedCost(alloc: Allocation[]) {
  const qty = alloc.reduce((s, a) => s + a.qty, 0);
  const cost = alloc.reduce((s, a) => s + a.qty * a.unit_cost, 0);
  return qty ? cost / qty : 0;
}

export async function applyReserve(db: AppDb, alloc: Allocation[], productId: number, locationId?: number | number[] | null) {
  await assertAllocInScope(db, alloc, locationId);
  const stmts = alloc.map((a) =>
    db.prepare("UPDATE inventory_batches SET reserved_qty = reserved_qty + ? WHERE id = ?").bind(a.qty, a.batch_id),
  );
  const total = alloc.reduce((s, a) => s + a.qty, 0);
  stmts.push(
    db.prepare("UPDATE products SET reserved_stock = reserved_stock + ?, updated_at = datetime('now') WHERE id = ?").bind(total, productId),
  );
  await db.batch(stmts);
}

export async function applyIssue(db: AppDb, alloc: Allocation[], productId: number, fromReserved: boolean, locationId?: number | number[] | null) {
  await assertAllocInScope(db, alloc, locationId);
  for (const a of alloc) {
    const upd = fromReserved
      ? await db
          .prepare("UPDATE inventory_batches SET remaining_qty = remaining_qty - ?, reserved_qty = reserved_qty - ? WHERE id = ? AND remaining_qty >= ? AND reserved_qty >= ?")
          .bind(a.qty, a.qty, a.batch_id, a.qty, a.qty)
          .run()
      : await db
          .prepare("UPDATE inventory_batches SET remaining_qty = remaining_qty - ? WHERE id = ? AND remaining_qty >= ?")
          .bind(a.qty, a.batch_id, a.qty)
          .run();
    if (!upd.meta.changes) throw new Error("INSUFFICIENT_STOCK");
  }
  const stmts: ReturnType<AppDb["prepare"]>[] = [];
  const total = alloc.reduce((s, a) => s + a.qty, 0);
  if (fromReserved) {
    stmts.push(
      db
        .prepare("UPDATE products SET current_stock = current_stock - ?, reserved_stock = reserved_stock - ?, updated_at = datetime('now') WHERE id = ?")
        .bind(total, total, productId),
    );
  } else {
    stmts.push(
      db.prepare("UPDATE products SET current_stock = current_stock - ?, updated_at = datetime('now') WHERE id = ? AND current_stock >= ?").bind(total, productId, total),
    );
  }
  await db.batch(stmts);
}

export async function releaseReserve(db: AppDb, alloc: Allocation[], productId: number) {
  const stmts = alloc.map((a) =>
    db
      .prepare("UPDATE inventory_batches SET reserved_qty = CASE WHEN reserved_qty > ? THEN reserved_qty - ? ELSE 0 END WHERE id = ?")
      .bind(a.qty, a.qty, a.batch_id),
  );
  const total = alloc.reduce((s, a) => s + a.qty, 0);
  stmts.push(
    db
      .prepare("UPDATE products SET reserved_stock = CASE WHEN reserved_stock > ? THEN reserved_stock - ? ELSE 0 END, updated_at = datetime('now') WHERE id = ?")
      .bind(total, total, productId),
  );
  await db.batch(stmts);
}

export async function restockToBatch(db: AppDb, batchId: number, productId: number, qty: number) {
  await db.batch([
    db.prepare("UPDATE inventory_batches SET remaining_qty = remaining_qty + ? WHERE id = ?").bind(qty, batchId),
    db.prepare("UPDATE products SET current_stock = current_stock + ?, updated_at = datetime('now') WHERE id = ?").bind(qty, productId),
  ]);
}

export async function logMovement(
  db: AppDb,
  opts: {
    productId: number;
    batchId: number | null;
    type: string;
    qty: number;
    unitCost: number | null;
    referenceType: string;
    referenceId: number;
    notes: string;
    userId: number | null;
    fromLocationId?: number | null;
    toLocationId?: number | null;
  },
) {
  await db
    .prepare(
      "INSERT INTO stock_movements (product_id, batch_id, type, qty, unit_cost, reference_type, reference_id, notes, created_by, from_location_id, to_location_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      opts.productId,
      opts.batchId,
      opts.type,
      opts.qty,
      opts.unitCost,
      opts.referenceType,
      opts.referenceId,
      opts.notes,
      opts.userId,
      opts.fromLocationId ?? null,
      opts.toLocationId ?? null,
    )
    .run();
}

export async function maybeStockAlerts(db: AppDb, productId: number) {
  const p = await db
    .prepare("SELECT id, name_ar, name_en, current_stock, reserved_stock, min_stock FROM products WHERE id = ?")
    .bind(productId)
    .first<{ id: number; name_ar: string; name_en: string; current_stock: number; reserved_stock: number; min_stock: number }>();
  if (!p) return;
  const avail = p.current_stock - p.reserved_stock;
  const type = avail <= 0 ? "out_of_stock" : avail <= p.min_stock ? "low_stock" : "";
  if (!type) return;
  await safeNotify(async () => {
    if (await recentlyNotified(db, type, p.id)) return;
    await notifyAdmins(db, {
      type,
      titleAr: type === "out_of_stock" ? "صنف نافد" : "تحذير نقص مخزون",
      titleEn: type === "out_of_stock" ? "Out of stock" : "Low stock",
      bodyAr: type === "out_of_stock" ? `${p.name_ar} نافد من المخزن` : `الصنف ${p.name_ar} وصل للحد الأدنى في المخزن`,
      bodyEn: type === "out_of_stock" ? `${p.name_en} is out of stock` : `${p.name_en} reached minimum stock`,
      entityType: "product",
      entityId: p.id,
      actionUrl: `/products/${p.id}`,
    });
  });
}
