import assert from "node:assert/strict";
import test from "node:test";
import { collectDue, money, num, numberLocale } from "../src/lib/format.ts";

test("Arabic locale forces Western digits", () => {
  assert.equal(numberLocale("ar"), "ar-EG-u-nu-latn");
  assert.match(num(2, "ar"), /2/);
  assert.match(money(150, "ar"), /150/);
  assert.match(money(150, "ar"), /ج\.م/);
  assert.doesNotMatch(num(2, "ar"), /[٠-٩]/);
});

test("collectDue uses invoice total when held delivery remaining is zero", () => {
  assert.equal(collectDue({ total: 50, paid: 0, remaining: 0 }), 50);
  assert.equal(collectDue({ total: 200, paid: 50, remaining: 150 }), 150);
  assert.equal(collectDue({ total: 80, paid: 80, remaining: 0 }), 0);
});
