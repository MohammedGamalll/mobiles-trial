import assert from "node:assert/strict";
import test from "node:test";
import {
  accountSignedBalance,
  assertEquityCap,
  companyValuation,
  partnerDepositLines,
  partnerDrawLines,
  partnerLiveShares,
} from "../worker/lib/partners.ts";

test("equity cap accepts 60 then 40 and rejects 41", () => {
  assert.deepEqual(assertEquityCap([60], 40), { used: 60, next: 40, remaining: 40 });
  assert.throws(() => assertEquityCap([60], 41), { message: "equity_cap" });
  assert.throws(() => assertEquityCap([100], 0.01), { message: "equity_cap" });
});

test("edit cap excludes the partner being updated", () => {
  assert.deepEqual(assertEquityCap([40], 60), { used: 40, next: 60, remaining: 60 });
  assert.doesNotThrow(() => assertEquityCap([40], 59.99));
  assert.throws(() => assertEquityCap([40], 60.01), { message: "equity_cap" });
});

test("equity percent must be above zero and at most 100", () => {
  assert.throws(() => assertEquityCap([], 0), { message: "invalid_percent" });
  assert.throws(() => assertEquityCap([], -10), { message: "invalid_percent" });
  assert.throws(() => assertEquityCap([], 100.01), { message: "invalid_percent" });
  assert.doesNotThrow(() => assertEquityCap([], 100));
});

test("account signed balance flips credit-normal accounts", () => {
  assert.equal(accountSignedBalance("asset", 15000), 15000);
  assert.equal(accountSignedBalance("expense", 5400), 5400);
  assert.equal(accountSignedBalance("liability", -2100), 2100);
  assert.equal(accountSignedBalance("revenue", -4100), 4100);
});

test("company valuation deducts wastage from profit and equity is assets minus AP", () => {
  const v = companyValuation({
    "1100": 10000,
    "1110": 40000,
    "1200": 5000,
    "1300": 20000,
    "2100": -8000,
    "4100": -50000,
    "4200": -1000,
    "5100": 20000,
    "5200": 4000,
    "5300": 3000,
    "5400": 2000,
  });
  assert.equal(v.total_assets, 75000);
  assert.equal(v.total_liabilities, 8000);
  assert.equal(v.net_equity, 67000);
  assert.equal(v.revenues, 51000);
  assert.equal(v.total_wastage, 2000);
  assert.equal(v.net_profit, 22000);
  assert.equal(v.net_profit, v.revenues - v.cogs - v.expenses - v.total_wastage);
});

test("partner live shares allocate profit and equity then subtract withdrawals", () => {
  const s = partnerLiveShares({ percent: 40, netProfit: 22000, netEquity: 67000, withdrawals: 1500 });
  assert.equal(s.profit_share, 8800);
  assert.equal(s.asset_share, 26800);
  assert.equal(s.net_due, 7300);
});

test("draw journal is Dr 3100 and Cr the selected treasury", () => {
  const lines = partnerDrawLines(6, 1, 500);
  assert.deepEqual(lines, [
    { account_id: 6, debit: 500 },
    { account_id: 1, credit: 500 },
  ]);
});

test("opening deposit is Dr treasury and Cr 3100", () => {
  const lines = partnerDepositLines(6, 1, 1200);
  assert.deepEqual(lines, [
    { account_id: 1, debit: 1200 },
    { account_id: 6, credit: 1200 },
  ]);
});
