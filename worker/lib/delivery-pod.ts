import type { AppDb } from "./db";
import { nextNumber, nowIso, round2, todayIso } from "./helpers";
import { postDamageJournal, postSaleJournal } from "./ledger";
import { applyIssue, logMovement, maybeStockAlerts, releaseReserve, type Allocation } from "./stock";

export const ESCROW_STATUSES = ["pending_delivery", "out_for_delivery", "rescheduled", "customer_unavailable"] as const;
export const CUSTODY_STATUSES = ["out_for_delivery", "rescheduled", "customer_unavailable"] as const;

export type SettlementOutcome = "delivered" | "rejected" | "damaged" | "returned";
export type ChargeTo = "courier" | "customer" | "company";

export function normalizeOutcome(raw: string): SettlementOutcome | null {
  const s = String(raw || "").toLowerCase();
  if (["delivered", "full_delivery"].includes(s)) return "delivered";
  if (["rejected", "refused", "full_return", "fully_returned", "customer_refused"].includes(s)) return "rejected";
  if (["returned", "return_to_stock", "returned_to_warehouse", "back_to_stock"].includes(s)) return "returned";
  if (["damaged", "lost", "damage"].includes(s)) return "damaged";
  return null;
}

export function isEscrowStatus(status: string) {
  return (ESCROW_STATUSES as readonly string[]).includes(status);
}

export function isCustodyStatus(status: string) {
  return (CUSTODY_STATUSES as readonly string[]).includes(status);
}

export function settlementStatuses(outcome: SettlementOutcome) {
  if (outcome === "delivered") return { status: "completed", delivery_status: "delivered" };
  if (outcome === "rejected") return { status: "cancelled", delivery_status: "customer_refused" };
  if (outcome === "returned") return { status: "cancelled", delivery_status: "returned_to_warehouse" };
  return { status: "completed", delivery_status: "damaged" };
}

export function splitCollected(total: number, collected?: number) {
  const cap = round2(Math.max(0, Number(total) || 0));
  const take = round2(Math.min(cap, Math.max(0, Number(collected) || 0)));
  return { collected: take, remaining: round2(cap - take) };
}

type InvoiceRow = {
  id: number;
  number: string;
  type: string;
  status: string;
  delivery_status: string | null;
  delivery_agent_id: number | null;
  customer_id: number | null;
  payment_method: string | null;
  cash_account_id: number | null;
  total: number;
  paid: number;
  remaining: number;
  cost_total: number;
  profit: number;
  stock_committed_at: string | null;
  finance_committed_at: string | null;
  settled_at: string | null;
};

type ItemRow = {
  id: number;
  product_id: number;
  quantity: number;
  unit_price: number;
  discount: number;
  unit_cost: number;
  item_kind?: string | null;
};

type BatchRow = {
  invoice_item_id: number;
  batch_id: number;
  qty: number;
  unit_cost: number;
  product_id: number;
  location_id?: number | null;
};

export async function damagedLocationId(db: AppDb) {
  const row = await db
    .prepare("SELECT id FROM storage_locations WHERE code = 'DAMAGED' AND deleted_at IS NULL")
    .first<{ id: number }>();
  if (row) return row.id;
  const ins = await db
    .prepare(
      `INSERT INTO storage_locations (name, warehouse, kind, code, path, notes, active, sort_order)
       VALUES ('تالف / مفقود', 'تالف', 'warehouse', 'DAMAGED', 'DAMAGED', 'مخزن افتراضي للتالف والمفقود', 1, 99)`,
    )
    .run();
  return ins.meta.last_row_id;
}

async function loadSettleInvoice(db: AppDb, id: number) {
  const inv = await db.prepare("SELECT * FROM sales_invoices WHERE id = ? AND deleted_at IS NULL").bind(id).first<InvoiceRow>();
  if (!inv) return null;
  const items = await db.prepare("SELECT * FROM sales_invoice_items WHERE invoice_id = ?").bind(id).all<ItemRow>();
  const batches = await db
    .prepare(
      `SELECT sib.*, sii.product_id, ib.location_id
       FROM sales_item_batches sib
       JOIN sales_invoice_items sii ON sii.id = sib.invoice_item_id
       LEFT JOIN inventory_batches ib ON ib.id = sib.batch_id
       WHERE sii.invoice_id = ?`,
    )
    .bind(id)
    .all<BatchRow>();
  return { inv, items: items.results, batches: batches.results };
}

function allocFor(itemId: number, batches: BatchRow[]): Allocation[] {
  return batches
    .filter((b) => b.invoice_item_id === itemId && b.qty > 0)
    .map((b) => ({ batch_id: b.batch_id, batch_code: "", qty: b.qty, unit_cost: b.unit_cost, location_id: b.location_id ?? null }));
}

export async function settleInvoice(
  db: AppDb,
  opts: {
    invoiceId: number;
    outcome: SettlementOutcome;
    collected?: number;
    cashAccountId?: number | null;
    chargeTo?: ChargeTo;
    notes?: string | null;
    userId: number;
    settlementId: number;
    agentId: number;
  },
) {
  const loaded = await loadSettleInvoice(db, opts.invoiceId);
  if (!loaded) throw new Error("not_found");
  const { inv, items, batches } = loaded;
  if (inv.type !== "delivery") throw new Error("not_delivery");
  if (inv.settled_at || inv.stock_committed_at || inv.finance_committed_at) throw new Error("already_settled");
  const pendingWithAgent =
    !!inv.delivery_agent_id &&
    (inv.status === "pending_delivery" || inv.delivery_status === "pending_delivery");
  if (!isCustodyStatus(inv.status) && !isCustodyStatus(inv.delivery_status || "") && !pendingWithAgent) {
    throw new Error("not_in_custody");
  }
  if (Number(inv.delivery_agent_id || 0) !== Number(opts.agentId)) throw new Error("wrong_agent");

  const now = nowIso();
  const stamps = settlementStatuses(opts.outcome);
  let collected = 0;
  let remaining = round2(Number(inv.total) || 0);
  let costTotal = round2(Number(inv.cost_total) || 0);
  const chargeTo: ChargeTo = opts.chargeTo || "company";

  if (opts.outcome === "rejected" || opts.outcome === "returned") {
    for (const item of items) {
      if (item.item_kind === "service") continue;
      const alloc = allocFor(item.id, batches);
      if (alloc.length) {
        await releaseReserve(db, alloc, item.product_id);
        if (opts.outcome === "returned") {
          for (const a of alloc) {
            await logMovement(db, {
              productId: item.product_id,
              batchId: a.batch_id,
              type: "return_in",
              qty: a.qty,
              unitCost: a.unit_cost,
              referenceType: "delivery",
              referenceId: inv.id,
              notes: `Return ${inv.number}`,
              userId: opts.userId,
              toLocationId: a.location_id ?? null,
            });
          }
        }
      }
      await db.prepare("UPDATE sales_invoice_items SET delivered_qty = 0, returned_qty = ? WHERE id = ?").bind(item.quantity, item.id).run();
    }
    await db.prepare("UPDATE product_serials SET status='in_stock', invoice_id=NULL, invoice_item_id=NULL WHERE invoice_id=? AND status='reserved'").bind(inv.id).run();
    collected = 0;
    remaining = 0;
    await db
      .prepare(
        `UPDATE sales_invoices SET status=?, delivery_status=?, paid=0, remaining=0, settled_at=?, settlement_id=?, notes=COALESCE(?, notes)
         WHERE id=?`,
      )
      .bind(stamps.status, stamps.delivery_status, now, opts.settlementId, opts.notes || null, inv.id)
      .run();
  }

  if (opts.outcome === "delivered") {
    const split = splitCollected(inv.total, opts.collected ?? inv.paid);
    collected = split.collected;
    remaining = split.remaining;
    let costDelivered = 0;
    for (const item of items) {
      if (item.item_kind === "service") {
        await db.prepare("UPDATE sales_invoice_items SET delivered_qty = ?, returned_qty = 0 WHERE id = ?").bind(item.quantity, item.id).run();
        continue;
      }
      const alloc = allocFor(item.id, batches);
      if (alloc.length) {
        await applyIssue(db, alloc, item.product_id, true);
        costDelivered = round2(costDelivered + alloc.reduce((s, a) => s + a.qty * a.unit_cost, 0));
        for (const a of alloc) {
          await logMovement(db, {
            productId: item.product_id,
            batchId: a.batch_id,
            type: "sale_out",
            qty: a.qty,
            unitCost: a.unit_cost,
            referenceType: "delivery",
            referenceId: inv.id,
            notes: `Deliver ${inv.number}`,
            userId: opts.userId,
            fromLocationId: a.location_id ?? null,
          });
        }
        await maybeStockAlerts(db, item.product_id);
      }
      await db.prepare("UPDATE sales_invoice_items SET delivered_qty = ?, returned_qty = 0 WHERE id = ?").bind(item.quantity, item.id).run();
    }
    costTotal = costDelivered || costTotal;
    await db.prepare("UPDATE product_serials SET status='sold' WHERE invoice_id=? AND status='reserved'").bind(inv.id).run();
    if (collected > 0) {
      await db
        .prepare("INSERT INTO payments (invoice_id, customer_id, method, amount, date, notes, created_by) VALUES (?, ?, ?, ?, ?, 'delivery settlement', ?)")
        .bind(inv.id, inv.customer_id, inv.payment_method || "cash", collected, todayIso(), opts.userId)
        .run();
    }
    if (inv.customer_id && remaining > 0) {
      await db.prepare("UPDATE customers SET current_balance = current_balance + ?, updated_at = datetime('now') WHERE id = ?").bind(remaining, inv.customer_id).run();
    }
    await postSaleJournal(
      db,
      {
        id: inv.id,
        number: inv.number,
        date: todayIso(),
        total: inv.total,
        paid: collected,
        remaining,
        payment_method: inv.payment_method,
        cost_total: costTotal,
        cash_account_id: opts.cashAccountId || inv.cash_account_id,
      },
      opts.userId,
    );
    await db
      .prepare(
        `UPDATE sales_invoices SET status=?, delivery_status=?, paid=?, remaining=?, cost_total=?, profit=?,
            stock_committed_at=?, finance_committed_at=?, settled_at=?, settlement_id=?, completed_at=?, notes=COALESCE(?, notes)
         WHERE id=?`,
      )
      .bind(
        stamps.status,
        stamps.delivery_status,
        collected,
        remaining,
        costTotal,
        round2(inv.total - costTotal),
        now,
        now,
        now,
        opts.settlementId,
        now,
        opts.notes || null,
        inv.id,
      )
      .run();
  }

  if (opts.outcome === "damaged") {
    const dmgLoc = await damagedLocationId(db);
    let cost = 0;
    for (const item of items) {
      if (item.item_kind === "service") continue;
      const alloc = allocFor(item.id, batches);
      if (alloc.length) {
        await applyIssue(db, alloc, item.product_id, true);
        for (const a of alloc) {
          cost = round2(cost + a.qty * a.unit_cost);
          const code = await nextNumber(db, "batch");
          const dest = await db
            .prepare(
              `INSERT INTO inventory_batches (batch_code, product_id, purchase_date, original_qty, remaining_qty, reserved_qty, unit_cost, notes, location_id)
               VALUES (?, ?, ?, ?, ?, 0, ?, 'damaged', ?)`,
            )
            .bind(code, item.product_id, todayIso(), a.qty, a.qty, a.unit_cost, dmgLoc)
            .run();
          await logMovement(db, {
            productId: item.product_id,
            batchId: a.batch_id,
            type: "damage_out",
            qty: a.qty,
            unitCost: a.unit_cost,
            referenceType: "delivery",
            referenceId: inv.id,
            notes: `Damage ${inv.number}`,
            userId: opts.userId,
            fromLocationId: a.location_id ?? null,
            toLocationId: dmgLoc,
          });
          await logMovement(db, {
            productId: item.product_id,
            batchId: dest.meta.last_row_id,
            type: "damage_in",
            qty: a.qty,
            unitCost: a.unit_cost,
            referenceType: "delivery",
            referenceId: inv.id,
            notes: `Damage ${inv.number}`,
            userId: opts.userId,
            fromLocationId: a.location_id ?? null,
            toLocationId: dmgLoc,
          });
        }
        await maybeStockAlerts(db, item.product_id);
      }
      await db.prepare("UPDATE sales_invoice_items SET delivered_qty = 0, returned_qty = ? WHERE id = ?").bind(item.quantity, item.id).run();
    }
    await db.prepare("UPDATE product_serials SET status='damaged' WHERE invoice_id=? AND status='reserved'").bind(inv.id).run();
    if (chargeTo === "courier") {
      const emp = await db
        .prepare("SELECT id FROM employees WHERE delivery_agent_id = ? AND deleted_at IS NULL ORDER BY id LIMIT 1")
        .bind(opts.agentId)
        .first<{ id: number }>();
      if (!emp) throw new Error("no_courier_employee");
      await db
        .prepare("INSERT INTO salary_advances (employee_id, amount, date, month, status, notes, created_by) VALUES (?, ?, ?, ?, 'open', ?, ?)")
        .bind(emp.id, cost, todayIso(), todayIso().slice(0, 7), `تالف ${inv.number}`, opts.userId)
        .run();
    }
    if (chargeTo === "customer" && inv.customer_id) {
      await db.prepare("UPDATE customers SET current_balance = current_balance + ?, updated_at = datetime('now') WHERE id = ?").bind(cost, inv.customer_id).run();
    }
    await postDamageJournal(db, { invoiceId: inv.id, number: inv.number, cost, chargeTo, userId: opts.userId });
    collected = 0;
    remaining = chargeTo === "customer" ? cost : 0;
    await db
      .prepare(
        `UPDATE sales_invoices SET status=?, delivery_status=?, paid=0, remaining=?, cost_total=?, profit=0,
            stock_committed_at=?, finance_committed_at=?, settled_at=?, settlement_id=?, completed_at=?, notes=COALESCE(?, notes)
         WHERE id=?`,
      )
      .bind(stamps.status, stamps.delivery_status, remaining, cost, now, now, now, opts.settlementId, now, opts.notes || null, inv.id)
      .run();
  }

  await db
    .prepare(
      `INSERT INTO delivery_settlement_lines (settlement_id, invoice_id, outcome, collected, charge_to, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(opts.settlementId, inv.id, opts.outcome, collected, opts.outcome === "damaged" ? chargeTo : null, opts.notes || null)
    .run();
  await db
    .prepare("INSERT INTO delivery_results (invoice_id, result_type, notes, created_by, settlement_id, charge_to, collected) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(inv.id, opts.outcome, opts.notes || null, opts.userId, opts.settlementId, opts.outcome === "damaged" ? chargeTo : null, collected)
    .run();

  return { invoice_id: inv.id, outcome: opts.outcome, status: stamps.status, collected, remaining };
}
