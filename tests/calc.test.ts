import assert from "node:assert/strict";
import test from "node:test";
import { availableQty, applyAdvanceDeduction, creditLimitBlocked, fifoUnitCost, grossProfit, invoiceTotals, netPay, returnLineNet, settleReturn } from "../worker/lib/invoice-math.ts";
import { planAllocation } from "../worker/lib/stock.ts";
import { applyTransferQtys, applyTransferQtysAtomic, stocktakeAbsVarianceValue, stocktakeLineValue, stocktakeUnitCost, wastageFromVariance } from "../worker/lib/stock-transfer.ts";
import { finalizeTrialRow, splitClosingSides, trialBalanceTotals } from "../worker/lib/trial-balance.ts";

test("invoice total applies percent-style fixed discount once", () => {
  const subtotal = 1000;
  const { discount, total } = invoiceTotals(subtotal, 0, 100, 0);
  assert.equal(discount, 100);
  assert.equal(total, 900);
});

test("line discount and invoice discount both reduce the total", () => {
  const { discount, total } = invoiceTotals(1000, 50, 100, 0);
  assert.equal(discount, 150);
  assert.equal(total, 850);
});

test("gross profit uses net sales minus FIFO cost", () => {
  assert.equal(grossProfit(2000, 1500), 500);
  assert.equal(grossProfit(1500, 1000), 500);
});

test("FIFO consumes oldest cost, not a blended average", () => {
  const batches = [
    { qty: 10, unit_cost: 100 },
    { qty: 10, unit_cost: 200 },
  ];
  assert.equal(fifoUnitCost(batches, 10), 100);
  assert.equal(Math.round(fifoUnitCost(batches, 20) * 100) / 100, 150);
  const blendedFifteen = fifoUnitCost(batches, 15);
  assert.equal(Math.round(blendedFifteen * 100) / 100, 133.33);
});

test("planAllocation refuses reserved quantity", () => {
  const batches = [{ id: 1, batch_code: "B", product_id: 1, remaining_qty: 5, reserved_qty: 5, unit_cost: 10, purchase_date: "2026-01-01" }];
  assert.throws(() => planAllocation(batches, 1), /INSUFFICIENT_STOCK/);
});

test("available equals on hand minus reserved", () => {
  assert.equal(availableQty(100, 10), 90);
});

test("cash return refunds the overpaid portion and drops profit by margin", () => {
  const s = settleReturn({ total: 1500, paid: 1500, remaining: 0, retTotal: 450, cogs: 300 });
  assert.equal(s.newTotal, 1050);
  assert.equal(s.refund, 450);
  assert.equal(s.newPaid, 1050);
  assert.equal(s.newRemaining, 0);
  assert.equal(s.arDrop, 0);
  assert.equal(s.profitDrop, 150);
});

test("credit return reduces receivable and does not refund cash", () => {
  const s = settleReturn({ total: 10000, paid: 4000, remaining: 6000, retTotal: 3000, cogs: 1000 });
  assert.equal(s.newTotal, 7000);
  assert.equal(s.newRemaining, 3000);
  assert.equal(s.refund, 0);
  assert.equal(s.arDrop, 3000);
  assert.equal(s.profitDrop, 2000);
});

test("partial return on discounted invoice uses allocated net not list price", () => {
  const returned = returnLineNet({
    lineQty: 10,
    qty: 5,
    lineNetAfterLineDisc: 1000,
    goodsBase: 1250,
    headerDiscount: 125,
  });
  assert.equal(returned, 450);
  assert.equal(Math.round((1250 - 500 - 125 * (750 / 1250)) * 100) / 100, 675);
  assert.equal(Math.round((1125 - returned) * 100) / 100, 675);
});

test("line and header discounts both reduce the returned net once", () => {
  const returned = returnLineNet({
    lineQty: 10,
    qty: 10,
    lineNetAfterLineDisc: 950,
    goodsBase: 950,
    headerDiscount: 95,
  });
  assert.equal(returned, 855);
});

test("tax share follows the discounted line net", () => {
  const totals = invoiceTotals(1250, 0, 125, 14);
  assert.equal(totals.tax, 157.5);
  const returned = returnLineNet({
    lineQty: 10,
    qty: 5,
    lineNetAfterLineDisc: 1000,
    goodsBase: 1250,
    headerDiscount: 125,
    taxAmount: totals.tax,
  });
  assert.equal(returned, 513);
});

test("second partial return does not double-count the header discount", () => {
  const args = {
    lineQty: 10,
    lineNetAfterLineDisc: 1000,
    goodsBase: 1250,
    headerDiscount: 125,
  };
  const first = returnLineNet({ ...args, qty: 5 });
  const second = returnLineNet({ ...args, qty: 5 });
  assert.equal(first, 450);
  assert.equal(second, 450);
  assert.equal(Math.round((first + second) * 100) / 100, 900);
});

test("purchase extra expenses travel with the returned carrying cost", () => {
  const returned = returnLineNet({
    lineQty: 10,
    qty: 5,
    lineNetAfterLineDisc: 1000,
    goodsBase: 1250,
    headerDiscount: 125,
    extraAmount: 50,
    includeExtra: true,
  });
  assert.equal(returned, 470);
});

test("payroll net is basic + allowances + overtime - advances - manual deduction", () => {
  const { net } = netPay({ basic: 10000, allowances: 1000, overtime: 500, manualDeduction: 300, advances: 2000, daily: 0, absentDays: 0 });
  assert.equal(net, 9200);
});

test("absence days stay informational and do not reduce net", () => {
  const { net, deductions, manual } = netPay({
    basic: 7000,
    allowances: 500,
    overtime: 0,
    advances: 150,
    daily: 7000 / 30,
    absentDays: 6,
    unpaidDays: 2,
  });
  assert.equal(net, 7350);
  assert.equal(deductions, 150);
  assert.equal(manual, 0);
});

test("manual deduction is applied after advances", () => {
  const { net, deductions, manual } = netPay({
    basic: 7000,
    allowances: 500,
    overtime: 0,
    advances: 150,
    manualDeduction: 400,
    absentDays: 6,
  });
  assert.equal(manual, 400);
  assert.equal(net, 6950);
  assert.equal(deductions, 550);
});

test("open advances reduce net even when passed as mysql decimal strings", () => {
  const { net, advances, deductions } = netPay({
    basic: "7000" as unknown as number,
    allowances: "500" as unknown as number,
    overtime: 0,
    advances: "150" as unknown as number,
    daily: 7000 / 30,
    absentDays: 0,
  });
  assert.equal(advances, 150);
  assert.equal(net, 7350);
  assert.equal(deductions, 150);
});

test("payroll caps advances so net is never negative", () => {
  const { net, advances } = netPay({ basic: 1000, allowances: 0, overtime: 0, advances: 5000, daily: 0 });
  assert.equal(net, 0);
  assert.equal(advances, 1000);
});

test("FIFO advance deduction settles the first rows then leaves leftover", () => {
  const rows = applyAdvanceDeduction(
    [
      { id: 1, remaining: 1000 },
      { id: 2, remaining: 500 },
      { id: 3, remaining: 800 },
    ],
    1200,
  );
  assert.deepEqual(rows, [
    { id: 1, remaining: 0, take: 1000, settled: true },
    { id: 2, remaining: 300, take: 200, settled: false },
    { id: 3, remaining: 800, take: 0, settled: false },
  ]);
});

test("FIFO advance deduction settles every row when amount covers them", () => {
  const rows = applyAdvanceDeduction(
    [
      { id: 1, remaining: 400 },
      { id: 2, remaining: 100 },
    ],
    500,
  );
  assert.equal(rows.every((r) => r.settled), true);
  assert.equal(rows.reduce((s, r) => s + r.take, 0), 500);
});

test("transfer qty of N leaves source available -N and dest +N", () => {
  const moved = applyTransferQtys([{ sourceAvail: 10, destAvail: 2, qty: 4 }]);
  assert.deepEqual(moved, [{ sourceAvail: 6, destAvail: 6 }]);
});

test("mid-loop transfer failure rolls back to the original qtys", () => {
  const lines = [
    { sourceAvail: 10, destAvail: 0, qty: 3 },
    { sourceAvail: 2, destAvail: 0, qty: 9 },
  ];
  const result = applyTransferQtysAtomic(lines);
  assert.equal(result.ok, false);
  assert.deepEqual(result.lines, [
    { sourceAvail: 10, destAvail: 0 },
    { sourceAvail: 2, destAvail: 0 },
  ]);
});

test("stocktake variance value is counted minus expected times unit cost", () => {
  assert.equal(stocktakeLineValue(-3, 25), -75);
  assert.equal(stocktakeLineValue(2, 10), 20);
});

test("stocktake abs variance value is qty gap times unit cost", () => {
  assert.equal(stocktakeAbsVarianceValue(20, 11, 25), 225);
  assert.equal(stocktakeAbsVarianceValue(10, 12, 25), 50);
  assert.equal(stocktakeAbsVarianceValue(10, null, 25), 0);
  assert.equal(stocktakeUnitCost(0, null, 12.5, 9), 12.5);
});

test("shortage variance becomes wastage qty and loss value", () => {
  const waste = wastageFromVariance(-4, 12.5);
  assert.deepEqual(waste, { qty: 4, unit_cost: 12.5, loss_value: 50 });
  assert.equal(wastageFromVariance(2, 12.5), null);
});

test("wastage loss uses fallback cost when line cost is zero", () => {
  const cost = stocktakeUnitCost(0, null, 100, 80);
  assert.equal(cost, 100);
  assert.deepEqual(wastageFromVariance(-9, cost), { qty: 9, unit_cost: 100, loss_value: 900 });
});

test("trial closing splits to debit or credit columns without a minus", () => {
  assert.deepEqual(splitClosingSides(250), { debit: 250, credit: 0 });
  assert.deepEqual(splitClosingSides(-80), { debit: 0, credit: 80 });
  assert.deepEqual(splitClosingSides(0), { debit: 0, credit: 0 });
});

test("trial balance period movement is balanced when debits equal credits", () => {
  const rows = [
    finalizeTrialRow({ id: 1, code: "1100", name_ar: "صندوق", name_en: "Cash", type: "asset", opening_balance: 0, total_debit: 100, total_credit: 0 }),
    finalizeTrialRow({ id: 2, code: "4100", name_ar: "مبيعات", name_en: "Sales", type: "revenue", opening_balance: 0, total_debit: 0, total_credit: 100 }),
  ];
  const totals = trialBalanceTotals({ debit: 100, credit: 100 }, rows);
  assert.equal(totals.balanced, true);
  assert.equal(totals.debit, 100);
  assert.equal(totals.credit, 100);
  assert.equal(rows[0].net_balance, 100);
  assert.equal(rows[1].net_balance, -100);
});

test("activity before from is opening not period debit", () => {
  const row = finalizeTrialRow({
    id: 1,
    code: "1100",
    name_ar: "صندوق",
    name_en: "Cash",
    type: "asset",
    opening_balance: 50,
    total_debit: 0,
    total_credit: 0,
  });
  assert.equal(row.opening_balance, 50);
  assert.equal(row.total_debit, 0);
  assert.equal(row.closing_balance, 50);
});

test("type-filtered rows do not flip ledger balanced", () => {
  const assetsOnly = [
    finalizeTrialRow({ id: 1, code: "1100", name_ar: "صندوق", name_en: "Cash", type: "asset", opening_balance: 0, total_debit: 80, total_credit: 0 }),
  ];
  const totals = trialBalanceTotals({ debit: 80, credit: 80 }, assetsOnly);
  assert.equal(totals.balanced, true);
  assert.equal(totals.debit, 80);
  assert.equal(totals.credit, 80);
});

test("credit sale is allowed when no limit is set and posts to wallet", () => {
  assert.equal(creditLimitBlocked({ credit_limit: 0, current_balance: 0 }, 150), false);
  assert.equal(creditLimitBlocked({ credit_limit: 100, current_balance: 20 }, 90), true);
  assert.equal(creditLimitBlocked({ credit_limit: 100, current_balance: 20 }, 70), false);
  assert.equal(creditLimitBlocked(null, 10), true);
});
