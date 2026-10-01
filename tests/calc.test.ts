import assert from "node:assert/strict";
import test from "node:test";
import { availableQty, fifoUnitCost, grossProfit, invoiceTotals, netPay, settleReturn } from "../worker/lib/invoice-math.ts";
import { planAllocation } from "../worker/lib/stock.ts";

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

test("payroll net is basic + allowances + overtime - absence - advances", () => {
  const { net } = netPay({ basic: 10000, allowances: 1000, overtime: 500, manualDeduction: 300, advances: 2000, daily: 0, absentDays: 0 });
  assert.equal(net, 9200);
});
