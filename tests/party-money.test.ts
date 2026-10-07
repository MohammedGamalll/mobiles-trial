import assert from "node:assert/strict";
import test from "node:test";
import {
  applyStandaloneReceipt,
  applySupplierPayment,
  customerOpeningSigned,
  fromEgp,
  splitInvoiceCash,
  supplierPayableEgp,
  toEgp,
} from "../worker/lib/party-money.ts";

test("opening balance is credit in the party favor (negative AR)", () => {
  assert.equal(customerOpeningSigned(1000), -1000);
  assert.equal(customerOpeningSigned(-250), -250);
  assert.equal(customerOpeningSigned(0), 0);
});

test("supplier opening is positive AP in EGP", () => {
  assert.equal(supplierPayableEgp(100, "EGP", 50), 100);
  assert.equal(supplierPayableEgp(10, "USD", 50), 500);
  assert.equal(supplierPayableEgp(-80, "EGP", 50), 80);
});

test("currency convert does not mix USD and EGP", () => {
  assert.equal(toEgp(2, "USD", 48), 96);
  assert.equal(fromEgp(96, "USD", 48), 2);
  assert.equal(fromEgp(96, "EGP", 48), 96);
});

test("standalone ignore surplus only collects the debt", () => {
  const r = applyStandaloneReceipt({
    requested: 700,
    arBalance: 500,
    invoiceRemainings: [{ id: 1, remaining: 500 }],
    surplusMode: "ignore",
  });
  assert.equal(r.take, 500);
  assert.equal(r.surplus, 0);
  assert.equal(r.nextBalance, 0);
  assert.equal(r.applied[0].amount, 500);
});

test("standalone wallet surplus becomes negative credit", () => {
  const r = applyStandaloneReceipt({
    requested: 700,
    arBalance: 500,
    invoiceRemainings: [{ id: 1, remaining: 500 }],
    surplusMode: "wallet",
  });
  assert.equal(r.take, 700);
  assert.equal(r.surplus, 200);
  assert.equal(r.nextBalance, -200);
});

test("quote overpay ignore keeps invoice exact", () => {
  const s = splitInvoiceCash(1200, 1000, "ignore");
  assert.equal(s.invoicePaid, 1000);
  assert.equal(s.remaining, 0);
  assert.equal(s.surplus, 0);
});

test("quote overpay wallet records surplus", () => {
  const s = splitInvoiceCash(1200, 1000, "wallet");
  assert.equal(s.invoicePaid, 1000);
  assert.equal(s.remaining, 0);
  assert.equal(s.surplus, 200);
});

test("supplier overpay becomes negative wallet (prepaid)", () => {
  const r = applySupplierPayment({
    requested: 700,
    apBalance: 500,
    invoiceRemainings: [{ id: 1, remaining: 500 }],
    surplusMode: "wallet",
  });
  assert.equal(r.take, 700);
  assert.equal(r.surplus, 200);
  assert.equal(r.nextBalance, -200);
});

test("underpay leaves supplier debt", () => {
  const s = splitInvoiceCash(600, 1000, "wallet");
  assert.equal(s.invoicePaid, 600);
  assert.equal(s.remaining, 400);
  assert.equal(s.surplus, 0);
});
