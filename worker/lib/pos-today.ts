import type { AppDb } from "./db";
import { todayIso } from "./helpers";

export const PARKED_INVOICE_STATUSES = [
  "cancelled",
  "draft",
  "held",
  "quote",
  "order",
  "pending_delivery",
  "out_for_delivery",
  "rescheduled",
  "customer_unavailable",
  "pending_settlement",
] as const;

export function parkedInvoiceSql(col = "status") {
  return `${col} NOT IN ('cancelled','void','draft','held','quote','order','pending_delivery','out_for_delivery','rescheduled','customer_unavailable','pending_settlement')`;
}

export function numAgg(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function loadPosToday(db: AppDb, day = todayIso(), limit = 40, shiftId?: number) {
  const live = parkedInvoiceSql("si.status");
  const shiftInv = shiftId ? " AND si.shift_id = ?" : "";
  const shiftPay = shiftId ? " AND p.shift_id = ?" : "";
  const shiftExp = shiftId ? " AND e.shift_id = ?" : "";
  const invBinds: (string | number)[] = shiftId ? [day, shiftId] : [day];
  const sums = await db
    .prepare(
      `SELECT COALESCE(SUM(si.total),0) as sales,
              COALESCE(SUM(si.remaining),0) as credit,
              COUNT(*) as c
       FROM sales_invoices si
       WHERE si.deleted_at IS NULL AND ${live} AND DATE(si.date) = ?${shiftInv}`,
    )
    .bind(...invBinds)
    .first<{ sales: unknown; credit: unknown; c: unknown }>();
  const collected = await db
    .prepare(
      `SELECT COALESCE(SUM(p.amount),0) as n
       FROM payments p
       WHERE p.voided_at IS NULL AND DATE(p.date) = ?${shiftPay}`,
    )
    .bind(...invBinds)
    .first<{ n: unknown }>();
  const invoices = await db
    .prepare(
      `SELECT si.id, si.number, si.customer_name, si.delivery_agent_name, si.total, si.paid, si.remaining, si.status, si.date, si.payment_method
       FROM sales_invoices si
       WHERE si.deleted_at IS NULL AND ${live} AND DATE(si.date) = ?${shiftInv}
       ORDER BY si.id DESC
       LIMIT ?`,
    )
    .bind(...invBinds, limit)
    .all();
  const expenses = await db
    .prepare(`SELECT COALESCE(SUM(e.amount),0) as n FROM expenses e WHERE e.voided_at IS NULL AND DATE(e.date) = ?${shiftExp}`)
    .bind(...invBinds)
    .first<{ n: unknown }>();
  const collectedToday = numAgg(collected?.n);
  const expensesToday = numAgg(expenses?.n);
  return {
    date: day,
    sales_today: numAgg(sums?.sales),
    invoices_today: numAgg(sums?.c),
    collected_today: collectedToday,
    credit_today: numAgg(sums?.credit),
    expenses_today: expensesToday,
    expected_cash: Math.round((collectedToday - expensesToday) * 100) / 100,
    invoices: invoices.results,
  };
}
