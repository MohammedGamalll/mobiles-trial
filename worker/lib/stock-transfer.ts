import type { AppDb } from "./db";
import { nextNumber } from "./helpers";
import { logMovement } from "./stock";

export function planBatchMove(remaining: number, reserved: number, qty: number) {
  const rem = Number(remaining || 0);
  const res = Number(reserved || 0);
  const take = Number(qty || 0);
  const avail = rem - res;
  if (take <= 0 || take > avail + 0.0001) return { ok: false as const, reason: "insufficient_stock" as const };
  return { ok: true as const, moveAll: take === rem && res === 0, qty: take };
}

export async function executeTransfer(
  db: AppDb,
  transferId: number,
  userId: number,
) {
  const trn = await db.prepare("SELECT * FROM stock_transfers WHERE id = ?").bind(transferId).first<{
    id: number;
    number: string;
    status: string;
    from_location_id: number;
    to_location_id: number;
  }>();
  if (!trn) throw new Error("not_found");
  if (trn.status === "completed") return { id: trn.id, number: trn.number, already: true };
  if (trn.status === "cancelled") throw new Error("cancelled");
  const { results: items } = await db
    .prepare("SELECT * FROM stock_transfer_items WHERE transfer_id = ?")
    .bind(transferId)
    .all<{ id: number; product_id: number; batch_id: number; qty: number; unit_cost: number }>();
  for (const item of items) {
    const batch = await db
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
    if (!batch) throw new Error("batch_missing");
    const plan = planBatchMove(batch.remaining_qty, batch.reserved_qty, item.qty);
    if (!plan.ok) throw new Error("insufficient_stock");
    let destBatchId = batch.id;
    if (plan.moveAll) {
      await db.prepare("UPDATE inventory_batches SET location_id = ? WHERE id = ?").bind(trn.to_location_id, batch.id).run();
    } else {
      const code = await nextNumber(db, "batch");
      const dest = await db
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
      await db.prepare("UPDATE inventory_batches SET remaining_qty = remaining_qty - ? WHERE id = ?").bind(item.qty, batch.id).run();
    }
    await logMovement(db, {
      productId: item.product_id,
      batchId: batch.id,
      type: "transfer_out",
      qty: -item.qty,
      unitCost: item.unit_cost,
      referenceType: "transfer",
      referenceId: transferId,
      notes: trn.number,
      userId,
      fromLocationId: trn.from_location_id,
      toLocationId: trn.to_location_id,
    });
    await logMovement(db, {
      productId: item.product_id,
      batchId: destBatchId,
      type: "transfer_in",
      qty: item.qty,
      unitCost: item.unit_cost,
      referenceType: "transfer",
      referenceId: transferId,
      notes: trn.number,
      userId,
      fromLocationId: trn.from_location_id,
      toLocationId: trn.to_location_id,
    });
  }
  await db
    .prepare("UPDATE stock_transfers SET status = 'completed', completed_by = ?, completed_at = datetime('now') WHERE id = ?")
    .bind(userId, transferId)
    .run();
  return { id: trn.id, number: trn.number, already: false };
}

export function stocktakeLineValue(variance: number | null | undefined, unitCost: number | null | undefined) {
  return Math.round((Number(variance || 0) * Number(unitCost || 0)) * 100) / 100;
}

export function stocktakeUnitCost(...costs: Array<number | string | null | undefined>) {
  for (const cost of costs) {
    const n = Number(cost || 0);
    if (n > 0) return n;
  }
  return 0;
}

export function stocktakeAbsVarianceValue(
  expected: number | null | undefined,
  counted: number | null | undefined,
  unitCost: number | null | undefined,
) {
  if (counted == null) return 0;
  const qty = Math.abs(Number(expected || 0) - Number(counted));
  return Math.round(qty * Number(unitCost || 0) * 100) / 100;
}

export function wastageFromVariance(variance: number, unitCost: number) {
  const v = Number(variance || 0);
  if (v >= -0.0001) return null;
  const qty = Math.round((-v) * 100) / 100;
  const cost = Number(unitCost || 0);
  return { qty, unit_cost: cost, loss_value: Math.round(qty * cost * 100) / 100 };
}

export function applyTransferQtys(lines: { sourceAvail: number; destAvail: number; qty: number }[]) {
  return lines.map((line) => {
    const plan = planBatchMove(line.sourceAvail, 0, line.qty);
    if (!plan.ok) throw new Error(plan.reason);
    return { sourceAvail: line.sourceAvail - plan.qty, destAvail: line.destAvail + plan.qty };
  });
}

export function applyTransferQtysAtomic(lines: { sourceAvail: number; destAvail: number; qty: number }[]) {
  const snapshot = lines.map((line) => ({ sourceAvail: line.sourceAvail, destAvail: line.destAvail }));
  try {
    return { ok: true as const, lines: applyTransferQtys(lines) };
  } catch {
    return { ok: false as const, lines: snapshot };
  }
}
