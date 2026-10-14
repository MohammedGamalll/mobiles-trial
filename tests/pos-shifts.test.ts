import assert from "node:assert/strict";
import test from "node:test";
import {
  drawerCashForSale,
  isDrawerPayMethod,
  planShiftClose,
  shiftExpected,
  shiftVariance,
  shouldSkipVaultTransfer,
  vaultTransferAmount,
} from "../worker/lib/pos-shifts.ts";

test("expected cash is opening plus in minus out", () => {
  assert.equal(shiftExpected(1000, 400, 150), 1250);
  assert.equal(shiftExpected(0, 0, 0), 0);
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

test("cash methods bind the shift drawer", () => {
  assert.equal(isDrawerPayMethod("cash"), true);
  assert.equal(isDrawerPayMethod("treasury"), true);
  assert.equal(isDrawerPayMethod("visa"), false);
  assert.equal(isDrawerPayMethod("credit"), false);
  assert.equal(drawerCashForSale({ cash_account_id: 4 }, "cash", 9), 4);
  assert.equal(drawerCashForSale({ cash_account_id: 4 }, "visa", 9), 9);
});
