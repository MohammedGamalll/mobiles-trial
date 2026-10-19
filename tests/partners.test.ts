import assert from "node:assert/strict";
import test from "node:test";
import {
  accountSignedBalance,
  assertEquityCap,
  companyValuation,
  companyValuationFromTrial,
  partnerDepositLines,
  partnerDrawLines,
  partnerLiveShares,
  availableToWithdraw,
  assertCanWithdraw,
  remainingShare,
  ownerProfitShare,
  withdrawCap,
} from "../worker/lib/partners.ts";
import { profitBreakdownFromTrial } from "../worker/lib/profit-breakdown.ts";

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

test("valuation includes safe, cash overage, and cash shortage", () => {
  const v = companyValuation({
    "1100": 1000,
    "1101": 800,
    "2100": 0,
    "4100": -2000,
    "4210": -400,
    "5100": 0,
    "5215": 100,
  });
  assert.equal(v.total_assets, 1800);
  assert.equal(v.net_equity, 1800);
  assert.equal(v.revenues, 2400);
  assert.equal(v.expenses, 100);
  assert.equal(v.net_profit, 2300);
  assert.equal(v.shift_overage, 400);
  assert.equal(v.shift_shortage, 100);
});

test("available profit is period net minus same-period draws", () => {
  assert.equal(availableToWithdraw(2300, 800), 1500);
  assert.equal(availableToWithdraw(500, 500), 0);
  assert.equal(availableToWithdraw(100, 250), -150);
  assert.doesNotThrow(() => assertCanWithdraw(1500, 1500));
  assert.throws(() => assertCanWithdraw(1500, 1499.99), { message: "exceeds_available" });
  assert.throws(() => assertCanWithdraw(10, 0), { message: "exceeds_available" });
});

test("trial rows match equity A-L and profit Rev-Exp residuals", () => {
  const v = companyValuationFromTrial([
    { type: "asset", code: "1100", closing_balance: 1500, net_balance: 1500 },
    { type: "asset", code: "1101", closing_balance: 800, net_balance: 800 },
    { type: "liability", code: "2100", closing_balance: 0, net_balance: 0 },
    { type: "revenue", code: "4100", closing_balance: -1900, net_balance: -1900 },
    { type: "revenue", code: "4210", closing_balance: -400, net_balance: -400 },
    { type: "expense", code: "5215", closing_balance: 0, net_balance: 0 },
  ]);
  assert.equal(v.net_equity, 2300);
  assert.equal(v.net_profit, 2300);
  assert.equal(v.net_equity, v.total_assets - v.total_liabilities);
  assert.equal(v.net_profit, v.revenues - v.cogs - v.expenses - v.total_wastage);
});

test("partner live shares allocate profit and equity then subtract withdrawals", () => {
  const s = partnerLiveShares({ percent: 40, netProfit: 22000, netEquity: 67000, withdrawals: 1500 });
  assert.equal(s.profit_share, 8800);
  assert.equal(s.asset_share, 26800);
  assert.equal(s.net_due, 7300);
});

test("partner remaining floors at zero and owner keeps the unallocated share", () => {
  const over = partnerLiveShares({ percent: 50, netProfit: 2035, netEquity: 2025, withdrawals: 1025 });
  assert.equal(over.profit_share, 1017.5);
  assert.equal(over.net_due, 0);
  assert.equal(remainingShare(1017.5, 1025), 0);
  assert.equal(ownerProfitShare(2035, 50), 1017.5);
  assert.equal(withdrawCap(7.5, 0), 0);
  assert.equal(withdrawCap(1017.5, 500), 500);
  assert.throws(() => assertCanWithdraw(1, 0), { message: "exceeds_available" });
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

function trialFromBalances(balancesByCode: Record<string, number>) {
  return Object.entries(balancesByCode).map(([code, raw]) => ({
    code,
    type: code.startsWith("1")
      ? "asset"
      : code.startsWith("2")
        ? "liability"
        : code.startsWith("3")
          ? "equity"
          : code.startsWith("4")
            ? "revenue"
            : "expense",
    closing_balance: raw,
    net_balance: raw,
  }));
}

test("profit breakdown net equals valuation net and hides zeros", () => {
  const rows = trialFromBalances({
    "1100": 10000,
    "2100": -8000,
    "3100": 500,
    "4100": -50000,
    "4200": -1000,
    "5100": 20000,
    "5200": 4000,
    "5300": 3000,
    "5400": 2000,
    "5215": 0,
  });
  const v = companyValuationFromTrial(rows);
  const b = profitBreakdownFromTrial(rows);
  assert.equal(b.net_profit, v.net_profit);
  assert.equal(b.net_profit, 22000);
  assert.equal(b.lines.reduce((s, l) => s + l.amount, 0), 22000);
  assert.deepEqual(
    b.lines.map((l) => [l.code, l.amount]),
    [
      ["4100", 50000],
      ["4200", 1000],
      ["5100", -20000],
      ["5200", -4000],
      ["5300", -3000],
      ["5400", -2000],
    ],
  );
  assert.ok(!b.lines.some((l) => l.code === "3100"));
  assert.ok(!b.lines.some((l) => l.code === "5215"));
});

test("profit breakdown signs overage positive and shortage negative", () => {
  const rows = trialFromBalances({
    "4100": -1350,
    "4210": -600,
    "5215": 365,
    "5400": 450,
    "4250": -900,
  });
  const b = profitBreakdownFromTrial(rows);
  assert.equal(b.net_profit, companyValuationFromTrial(rows).net_profit);
  assert.equal(b.net_profit, 2035);
  assert.equal(b.lines.find((l) => l.code === "4210")?.amount, 600);
  assert.equal(b.lines.find((l) => l.code === "5215")?.amount, -365);
  assert.equal(b.lines.find((l) => l.code === "5400")?.amount, -450);
  assert.equal(b.lines.find((l) => l.code === "4250")?.amount, 900);
  assert.equal(b.lines.find((l) => l.code === "4250")?.key, "acct_4250");
});
