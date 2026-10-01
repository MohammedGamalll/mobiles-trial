import assert from "node:assert/strict";
import test from "node:test";
import { numAgg, parkedInvoiceSql } from "../worker/lib/pos-today.ts";

test("parked invoice SQL excludes held quotes and orders", () => {
  const sql = parkedInvoiceSql("si.status");
  assert.match(sql, /held/);
  assert.match(sql, /quote/);
  assert.match(sql, /pending_delivery/);
});

test("numAgg coerces mysql decimal strings and junk to numbers", () => {
  assert.equal(numAgg("1500.50"), 1500.5);
  assert.equal(numAgg(0), 0);
  assert.equal(numAgg("0.00"), 0);
  assert.equal(numAgg(null), 0);
  assert.equal(numAgg(undefined), 0);
  assert.equal(numAgg(""), 0);
});
