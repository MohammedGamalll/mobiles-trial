import assert from "node:assert/strict";
import test from "node:test";
import {
  drawerCashForSale,
  drawerFlowSinceSql,
  isDrawerPayMethod,
  isShiftCollectionPayment,
  saleDrawerForInvoice,
  planShiftClose,
  shiftExpected,
  shiftVariance,
  shouldSkipVaultTransfer,
  vaultTransferAmount,
} from "../worker/lib/pos-shifts.ts";

test("delivery COD is a collection, same-shift cash sale is not", () => {
  assert.equal(isShiftCollectionPayment({ shift_id: 13, notes: "delivery settlement" }, { type: "delivery", shift_id: 13, payment_method: "cash" }), true);
  assert.equal(isShiftCollectionPayment({ shift_id: null, notes: "" }, { type: "delivery", shift_id: 13, payment_method: "cash" }), true);
  assert.equal(isShiftCollectionPayment({ shift_id: 13, notes: "" }, { type: "normal", shift_id: 13, payment_method: "cash" }), false);
  assert.equal(isShiftCollectionPayment({ shift_id: 13, notes: "" }, { type: "normal", shift_id: 8, payment_method: "cash" }), true);
  assert.equal(isShiftCollectionPayment({ shift_id: 13, notes: "" }, { type: "normal", shift_id: 13, payment_method: "credit" }), true);
});

test("expected cash is opening plus in minus out", () => {
  assert.equal(shiftExpected(1000, 400, 150), 1250);
  assert.equal(shiftExpected(0, 0, 0), 0);
  assert.equal(shiftExpected(100, 250, 0), 350);
});

test("shift-tagged drawer flow includes same-day journals and shift documents", () => {
  const sql = drawerFlowSinceSql(12);
  assert.match(sql, /CONCAT\(LEFT\(j\.date, 10\), ' 23:59:59'\)/);
  assert.match(sql, /sales_invoices WHERE shift_id/);
  assert.match(sql, /payments WHERE shift_id/);
  assert.match(sql, /sales_returns WHERE shift_id/);
});

test("variance is actual minus expected", () => {
  assert.equal(shiftVariance(900, 1000), -100);
  assert.equal(shiftVariance(1100, 1000), 100);
  assert.equal(shiftVariance(1000, 1000), 0);
});

test("same drawer and main safe skips vault transfer", () => {
  assert.equal(shouldSkipVaultTransfer(1, 1), true);
  assert.equal(shouldSkipVaultTransfer(2, 1), false);
  assert.equal(vaultTransferAmount(800, 0), 800);
  assert.equal(vaultTransferAmount(800, 100), 700);
});

test("close plan zeros a separate drawer after transfer and shortage", () => {
  const plan = planShiftClose({
    opening: 1000,
    cashIn: 200,
    cashOut: 50,
    actual: 1100,
    drawerId: 2,
    mainSafeId: 1,
  });
  assert.equal(plan.expected, 1150);
  assert.equal(plan.variance, -50);
  assert.deepEqual(plan.transfer, { amount: 1100 });
  assert.deepEqual(plan.varianceEntry, { kind: "shortage", amount: 50 });
  assert.equal(plan.drawerEnd, 0);
  assert.equal(plan.skippedTransfer, false);
});

test("close plan zeros a separate drawer after transfer and overage", () => {
  const plan = planShiftClose({
    opening: 500,
    cashIn: 300,
    cashOut: 0,
    actual: 850,
    drawerId: 2,
    mainSafeId: 1,
  });
  assert.equal(plan.expected, 800);
  assert.equal(plan.variance, 50);
  assert.deepEqual(plan.transfer, { amount: 850 });
  assert.deepEqual(plan.varianceEntry, { kind: "overage", amount: 50 });
  assert.equal(plan.drawerEnd, 0);
});

test("close plan skips transfer when drawer equals main safe", () => {
  const plan = planShiftClose({
    opening: 200,
    cashIn: 100,
    cashOut: 20,
    actual: 250,
    drawerId: 1,
    mainSafeId: 1,
  });
  assert.equal(plan.expected, 280);
  assert.equal(plan.variance, -30);
  assert.equal(plan.transfer, null);
  assert.deepEqual(plan.varianceEntry, { kind: "shortage", amount: 30 });
  assert.equal(plan.skippedTransfer, true);
  assert.equal(plan.drawerEnd, 250);
});

test("leave float stays in a separate drawer", () => {
  const plan = planShiftClose({
    opening: 0,
    cashIn: 800,
    cashOut: 0,
    actual: 800,
    leaveFloat: 100,
    drawerId: 2,
    mainSafeId: 1,
  });
  assert.deepEqual(plan.transfer, { amount: 700 });
  assert.equal(plan.varianceEntry, null);
  assert.equal(plan.drawerEnd, 100);
});

test("close transfers counted cash from drawer 1 to safe 3 and zeros the drawer", () => {
  const plan = planShiftClose({
    opening: 100,
    cashIn: 250,
    cashOut: 0,
    actual: 350,
    drawerId: 1,
    mainSafeId: 3,
  });
  assert.equal(plan.expected, 350);
  assert.equal(plan.variance, 0);
  assert.deepEqual(plan.transfer, { amount: 350 });
  assert.equal(plan.skippedTransfer, false);
  assert.equal(plan.drawerEnd, 0);
});

test("cash methods bind the shift drawer", () => {
  assert.equal(isDrawerPayMethod("cash"), true);
  assert.equal(isDrawerPayMethod("treasury"), true);
  assert.equal(isDrawerPayMethod("visa"), false);
  assert.equal(isDrawerPayMethod("credit"), false);
  assert.equal(drawerCashForSale({ cash_account_id: 4 }, "cash", 9), 4);
  assert.equal(drawerCashForSale({ cash_account_id: 4 }, "visa", 9), 9);
});

test("credit down payment still binds the shift drawer", () => {
  assert.equal(saleDrawerForInvoice({ cash_account_id: 4 }, "credit", 9, 200), 4);
  assert.equal(saleDrawerForInvoice({ cash_account_id: 4 }, "credit", 9, 0), 9);
  assert.equal(saleDrawerForInvoice({ cash_account_id: 4 }, "cash", 9, 200), 4);
});
