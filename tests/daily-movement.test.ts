import assert from "node:assert/strict";
import test from "node:test";
import {
  activityCell,
  allocateInvoiceShares,
  dailyMovementRange,
  mapReturnLine,
  mapSalesLine,
  normalizeDateTime,
  explainedTreasuryNet,
  foldCashJournals,
  omitCostProfit,
  receiptCell,
  signedActivityCell,
  splitDateTime,
  sumReturnTotals,
  treasuryClosing,
} from "../worker/lib/daily-movement.ts";

test("date-only from starts at midnight and to ends at 23:59:59", () => {
  assert.equal(normalizeDateTime("2026-10-07", "2026-01-01", false), "2026-10-07 00:00:00");
  assert.equal(normalizeDateTime("2026-10-07", "2026-01-01", true), "2026-10-07 23:59:59");
});

test("datetime-local and space-separated times are normalized", () => {
  assert.equal(normalizeDateTime("2026-10-07T14:30", "2026-01-01", false), "2026-10-07 14:30:00");
  assert.equal(normalizeDateTime("2026-10-07 09:05:12", "2026-01-01", true), "2026-10-07 09:05:12");
});

test("dailyMovementRange accepts date_from / date_to aliases", () => {
  const r = dailyMovementRange({ date_from: "2026-10-01", date_to: "2026-10-07T18:00" });
  assert.equal(r.fromDt, "2026-10-01 00:00:00");
  assert.equal(r.toDt, "2026-10-07 18:00:00");
  assert.equal(r.fromDate, "2026-10-01");
  assert.equal(r.toDate, "2026-10-07");
});

test("splitDateTime pulls date and HH:mm from created_at", () => {
  assert.deepEqual(splitDateTime("2026-10-07 14:30:22"), { date: "2026-10-07", time: "14:30" });
  assert.deepEqual(splitDateTime("2026-10-07T08:05:00"), { date: "2026-10-07", time: "08:05" });
  assert.deepEqual(splitDateTime(null, "2026-10-07"), { date: "2026-10-07", time: "" });
});

test("header discount and extra allocate across two lines without leftover pennies", () => {
  const shares = allocateInvoiceShares([{ total: 100 }, { total: 300 }], 40, 20);
  assert.equal(shares[0].headerShare, 10);
  assert.equal(shares[1].headerShare, 30);
  assert.equal(shares[0].addition, 5);
  assert.equal(shares[1].addition, 15);
  assert.equal(shares[0].headerShare + shares[1].headerShare, 40);
  assert.equal(shares[0].addition + shares[1].addition, 20);
});

test("sales line net is total minus header share plus addition", () => {
  const line = mapSalesLine(
    {
      date: "2026-10-07",
      created_at: "2026-10-07 11:20:00",
      sku: "LCD-IP13",
      product_name: "شاشة",
      unit_name: "قطعة",
      quantity: 2,
      unit_price: 150,
      discount: 10,
      total: 290,
      unit_cost: 80,
      profit: 100,
      customer_name: "عميل",
    },
    { headerShare: 10, addition: 5 },
  );
  assert.equal(line.discount, 20);
  assert.equal(line.addition, 5);
  assert.equal(line.net, 285);
  assert.equal(line.cost, 160);
  assert.equal(line.profit, 100);
  assert.equal(line.time, "11:20");
});

test("return line never includes cost or profit keys", () => {
  const line = mapReturnLine({
    date: "2026-10-07",
    created_at: "2026-10-07 16:00:00",
    sku: "LCD-IP13",
    product_name: "شاشة",
    unit_name: "قطعة",
    qty: 1,
    unit_price: 150,
    total: 150,
    orig_qty: 2,
    orig_total: 300,
    line_discount: 20,
    header_discount: 40,
    extra_amount: 20,
    goods_base: 400,
    customer_name: "عميل",
  });
  assert.equal("cost" in line, false);
  assert.equal("profit" in line, false);
  assert.ok(line.net !== undefined);
  const stripped = omitCostProfit({ ...line, cost: 99, profit: 88 });
  assert.equal("cost" in stripped, false);
  assert.equal("profit" in stripped, false);
  const totals = sumReturnTotals([line]);
  assert.equal("cost" in totals, false);
  assert.equal("profit" in totals, false);
});

test("purchase return cash is counted once and does not shrink the original purchase outflow", () => {
  const flow = foldCashJournals([
    { source: "purchase", n: -1100 },
    { source: "purchase_return", n: 500 },
  ]);
  assert.equal(flow.purchases, 1100);
  assert.equal(flow.purchase_returns, 500);
  assert.equal(explainedTreasuryNet(flow), -600);
});

test("cash journals fold into the treasury identity including hidden inflows", () => {
  const flow = foldCashJournals([
    { source: "purchase", n: -1100 },
    { source: "purchase", n: -500 },
    { source: "purchase_return", n: 500 },
    { source: "payment", n: 100 },
    { source: "return", n: -100 },
    { source: "expense", n: -18466.67 },
  ]);
  assert.equal(flow.purchases, 1600);
  assert.equal(flow.purchase_returns, 500);
  assert.equal(flow.collections, 100);
  assert.equal(flow.sales_returns, 100);
  assert.equal(flow.expenses, 18466.67);
  assert.equal(explainedTreasuryNet(flow), -19566.67);
});

test("receipt and payment vouchers stay split instead of netting under one source", () => {
  const flow = foldCashJournals([
    { source: "voucher", n: 31.5 },
    { source: "voucher", n: -14.75 },
  ]);
  assert.equal(flow.vouchers_in, 31.5);
  assert.equal(flow.vouchers_out, 14.75);
  assert.equal(explainedTreasuryNet(flow), 16.75);
});

test("netted voucher row would hide the outflow — callers must split signs first", () => {
  const netted = foldCashJournals([{ source: "voucher", n: 16.75 }]);
  assert.equal(netted.vouchers_in, 16.75);
  assert.equal(netted.vouchers_out, 0);
});

test("return cash/credit split and signed totals match the Sahl matrix", () => {
  const raw = activityCell(2, 4000, 2310);
  assert.equal(raw.count, 2);
  assert.equal(raw.cash, 4000);
  assert.equal(raw.credit, 2310);
  assert.equal(raw.total, 6310);
  const signed = signedActivityCell(2, 4000, 2310);
  assert.equal(signed.count, 2);
  assert.equal(signed.total, -6310);
  assert.equal(signed.cash, -4000);
  assert.equal(signed.credit, -2310);
  const receipts = receiptCell(3, 150);
  assert.equal(receipts.total, 150);
  assert.equal(receipts.cash, 150);
  assert.equal(receipts.credit, 0);
});

test("opening plus period net equals final treasury balance", () => {
  const t = treasuryClosing(15000.55, -250.12);
  assert.equal(t.opening_balance, 15000.55);
  assert.equal(t.net_movement, -250.12);
  assert.equal(t.final_balance, 14750.43);
  assert.equal(t.final_balance, Math.round((t.opening_balance + t.net_movement) * 100) / 100);
});
