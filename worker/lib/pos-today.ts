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
] as const;

export function parkedInvoiceSql(col = "status") {
  return `${col} NOT IN ('cancelled','draft','held','quote','order','pending_delivery','out_for_delivery','rescheduled','customer_unavailable')`;
}

export function numAgg(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function loadPosToday(db: AppDb, day = todayIso(), limit = 40) {
  const live = parkedInvoiceSql("si.status");
  const sums = await db
    .prepare(
      `SELECT COALESCE(SUM(si.total),0) as sales,
              COALESCE(SUM(si.remaining),0) as credit,
              COUNT(*) as c
       FROM sales_invoices si
       WHERE si.deleted_at IS NULL AND ${live} AND DATE(si.date) = ?`,
    )
    .bind(day)
    .first<{ sales: unknown; credit: unknown; c: unknown }>();
  const collected = await db
    .prepare(
      `SELECT COALESCE(SUM(p.amount),0) as n
       FROM payments p
       WHERE p.voided_at IS NULL AND DATE(p.date) = ?`,
    )
    .bind(day)
    .first<{ n: unknown }>();
  const invoices = await db
    .prepare(
      `SELECT si.id, si.number, si.customer_name, si.total, si.paid, si.remaining, si.status, si.date, si.payment_method
       FROM sales_invoices si
       WHERE si.deleted_at IS NULL AND ${live} AND DATE(si.date) = ?
       ORDER BY si.id DESC
       LIMIT ?`,
    )
    .bind(day, limit)
    .all();
  return {
    date: day,
    sales_today: numAgg(sums?.sales),
    invoices_today: numAgg(sums?.c),
    collected_today: numAgg(collected?.n),
    credit_today: numAgg(sums?.credit),
    invoices: invoices.results,
  };
}
