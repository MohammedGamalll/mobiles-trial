import { round2 } from "./helpers";

export function invoiceTotals(subtotal: number, lineDiscount: number, invoiceDiscount: number, taxRate: number) {
  const discount = round2((lineDiscount || 0) + (invoiceDiscount || 0));
  const tax = round2(Math.max(0, subtotal - discount) * ((taxRate || 0) / 100));
  const total = round2(subtotal - discount + tax);
  return { discount, tax, total };
}

export function grossProfit(netSales: number, cogs: number) {
  return round2(netSales - cogs);
}

/** FIFO unit cost of a quantity taken from oldest batches first. */
export function fifoUnitCost(batches: { qty: number; unit_cost: number }[], qty: number) {
  let left = qty;
  let cost = 0;
  let taken = 0;
  for (const b of batches) {
    if (left <= 0) break;
    const take = Math.min(b.qty, left);
    cost += take * b.unit_cost;
    taken += take;
    left -= take;
  }
  if (left > 0) throw new Error("INSUFFICIENT_STOCK");
  return taken ? cost / taken : 0;
}

/**
 * Net value of returning `qty` from a line. Header discount (and tax) are
 * allocated once by the line's share of goods — never re-applied in full on
 * leftover units, and never ignored so a return credits list price.
 */
export function returnLineNet(opts: {
  lineQty: number;
  qty: number;
  lineNetAfterLineDisc: number;
  goodsBase: number;
  headerDiscount: number;
  taxAmount?: number;
  extraAmount?: number;
  includeExtra?: boolean;
}) {
  const lineQty = Number(opts.lineQty) || 0;
  const qty = Math.max(0, Math.min(Number(opts.qty) || 0, lineQty));
  if (lineQty <= 0 || qty <= 0) return 0;
  const lineNet = round2(opts.lineNetAfterLineDisc);
  const goodsBase = round2(opts.goodsBase);
  if (goodsBase <= 0) return 0;
  const headerShare = round2((opts.headerDiscount || 0) * (lineNet / goodsBase));
  const afterHeader = round2(lineNet - headerShare);
  const taxBase = round2(Math.max(0, goodsBase - (opts.headerDiscount || 0)));
  const taxShare = taxBase > 0 ? round2((opts.taxAmount || 0) * (afterHeader / taxBase)) : 0;
  const extraShare = opts.includeExtra ? round2((opts.extraAmount || 0) * (lineNet / goodsBase)) : 0;
  const full = round2(afterHeader + taxShare + extraShare);
  return round2((qty / lineQty) * full);
}

export function settleReturn(opts: { total: number; paid: number; remaining: number; retTotal: number; cogs: number }) {
  const newTotal = round2(opts.total - opts.retTotal);
  let newPaid = round2(opts.paid);
  let newRemaining = round2(newTotal - newPaid);
  let refund = 0;
  if (newRemaining < 0) {
    refund = round2(-newRemaining);
    newRemaining = 0;
    newPaid = round2(newPaid - refund);
  }
  const arDrop = round2(opts.remaining - newRemaining);
  const profitDrop = round2(opts.retTotal - opts.cogs);
  return { newTotal, newPaid, newRemaining, refund, arDrop, profitDrop };
}

export function netPay(opts: {
  basic: number;
  allowances: number;
  overtime: number;
  bonus?: number;
  absentDays?: number;
  unpaidDays?: number;
  daily?: number;
  advances?: number;
  manualDeduction?: number;
}) {
  const basic = Number(opts.basic || 0);
  const allowances = Number(opts.allowances || 0);
  const overtime = Number(opts.overtime || 0);
  const bonus = Number(opts.bonus || 0);
  const gross = round2(basic + allowances + bonus + overtime);
  const requested = round2(Math.max(0, Number(opts.advances || 0)));
  const advances = round2(Math.min(requested, Math.max(0, gross)));
  const afterAdvances = round2(Math.max(0, gross - advances));
  const requestedManual = round2(Math.max(0, Number(opts.manualDeduction || 0)));
  const manual = round2(Math.min(requestedManual, afterAdvances));
  const net = round2(Math.max(0, afterAdvances - manual));
  const deductions = round2(advances + manual);
  return { deductions, net, advances, manual };
}

/** FIFO: take `amount` from open advances in order; leftover remaining stays open. */
export function applyAdvanceDeduction(advances: { id: number; remaining: number }[], amount: number) {
  let left = round2(Math.max(0, amount));
  return advances.map((a) => {
    const rem = round2(Math.max(0, Number(a.remaining) || 0));
    const take = round2(Math.min(rem, left));
    left = round2(left - take);
    const remaining = round2(rem - take);
    return { id: a.id, remaining, take, settled: remaining <= 0.005 };
  });
}

export function availableQty(onHand: number, reserved: number) {
  return round2(onHand - reserved);
}

/** Zero/empty credit_limit means unlimited; remaining is posted to the wallet. */
export function creditLimitBlocked(
  customer: { credit_limit?: number | null; current_balance?: number | null } | null,
  remaining: number,
) {
  if (remaining <= 0.005) return false;
  if (!customer) return true;
  const limit = Number(customer.credit_limit || 0);
  if (!(limit > 0)) return false;
  return Number(customer.current_balance || 0) + remaining > limit + 0.005;
}
