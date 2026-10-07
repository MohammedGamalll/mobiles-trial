import assert from "node:assert/strict";
import test from "node:test";
import { invoicePayStatus, posExchangePath } from "../src/lib/format.ts";

test("returned invoices keep return status instead of unpaid", () => {
  assert.equal(invoicePayStatus({ status: "fully_returned", paid: 0, remaining: 0, total: 0 }), "fully_returned");
  assert.equal(invoicePayStatus({ status: "partially_returned", paid: 0, remaining: 120, total: 120 }), "partially_returned");
});

test("unreturned sales still show payment status", () => {
  assert.equal(invoicePayStatus({ status: "completed", paid: 0, remaining: 50, total: 50 }), "unpaid_sale");
  assert.equal(invoicePayStatus({ status: "partial", paid: 20, remaining: 30, total: 50 }), "partial");
});

test("exchange path sends the same customer to POS", () => {
  assert.equal(posExchangePath({ customer_id: 9, customer_name: "Ali" }), "/pos?exchange=1&customer=9");
});
