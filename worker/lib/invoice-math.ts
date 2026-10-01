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
  const daily = opts.daily ?? (opts.basic || 0) / 30;
  const deductions = round2(
    (opts.absentDays || 0) * daily + (opts.unpaidDays || 0) * daily + (opts.advances || 0) + (opts.manualDeduction || 0),
  );
  const net = round2((opts.basic || 0) + (opts.allowances || 0) + (opts.bonus || 0) + (opts.overtime || 0) - deductions);
  return { deductions, net };
}

export function availableQty(onHand: number, reserved: number) {
  return round2(onHand - reserved);
}
