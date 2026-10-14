import assert from "node:assert/strict";
import test from "node:test";
import { splitInvoiceCash } from "../worker/lib/party-money.ts";
import { reusedClientTokenId } from "../worker/routes/sales.ts";

test("credit invoice accepts multiple partial collections without overpaying remaining", () => {
  const first = splitInvoiceCash(400, 1000, "wallet");
  assert.equal(first.invoicePaid, 400);
  assert.equal(first.remaining, 600);
  const second = splitInvoiceCash(600, first.remaining, "wallet");
  assert.equal(second.invoicePaid, 600);
  assert.equal(second.remaining, 0);
  assert.equal(first.invoicePaid + second.invoicePaid, 1000);
});

test("same client_token reuses the first held invoice id", () => {
  assert.equal(reusedClientTokenId({ id: 41 }), 41);
  assert.equal(reusedClientTokenId({ id: 41 }), 41);
  assert.equal(reusedClientTokenId(null), null);
  assert.equal(reusedClientTokenId({ id: 0 }), null);
});
