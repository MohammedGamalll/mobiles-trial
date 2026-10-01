import assert from "node:assert/strict";
import test from "node:test";
import {
  isCustodyStatus,
  isEscrowStatus,
  normalizeOutcome,
  settlementStatuses,
  splitCollected,
} from "../worker/lib/delivery-pod.ts";
import { parkedInvoiceSql } from "../worker/lib/pos-today.ts";

test("normalizeOutcome maps POD aliases", () => {
  assert.equal(normalizeOutcome("delivered"), "delivered");
  assert.equal(normalizeOutcome("full_delivery"), "delivered");
  assert.equal(normalizeOutcome("rejected"), "rejected");
  assert.equal(normalizeOutcome("refused"), "rejected");
  assert.equal(normalizeOutcome("lost"), "damaged");
  assert.equal(normalizeOutcome("damaged"), "damaged");
  assert.equal(normalizeOutcome("partial"), null);
});

test("escrow vs custody statuses", () => {
  assert.equal(isEscrowStatus("pending_delivery"), true);
  assert.equal(isEscrowStatus("out_for_delivery"), true);
  assert.equal(isCustodyStatus("pending_delivery"), false);
  assert.equal(isCustodyStatus("out_for_delivery"), true);
  assert.equal(isEscrowStatus("completed"), false);
});

test("settlement statuses match POD outcomes", () => {
  assert.deepEqual(settlementStatuses("delivered"), { status: "completed", delivery_status: "delivered" });
  assert.deepEqual(settlementStatuses("rejected"), { status: "cancelled", delivery_status: "customer_refused" });
  assert.deepEqual(settlementStatuses("damaged"), { status: "completed", delivery_status: "damaged" });
});

test("splitCollected never over-collects", () => {
  assert.deepEqual(splitCollected(100, 40), { collected: 40, remaining: 60 });
  assert.deepEqual(splitCollected(100, 150), { collected: 100, remaining: 0 });
  assert.deepEqual(splitCollected(100, undefined), { collected: 0, remaining: 100 });
  assert.deepEqual(splitCollected(100, -5), { collected: 0, remaining: 100 });
});

test("parked invoice SQL excludes delivery escrow", () => {
  const sql = parkedInvoiceSql("si.status");
  assert.match(sql, /pending_delivery/);
  assert.match(sql, /out_for_delivery/);
  assert.match(sql, /held/);
});
