import type { AppDb } from "./db";
import type { ListQ } from "./filters";
import { round2, todayIso } from "./helpers";

const DT_RE = /^(\d{4}-\d{2}-\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/;
const LIVE_SALES = "si.status NOT IN ('cancelled','draft','held','quote','order')";

export type DailyRange = {
  from: string;
  to: string;
  fromDt: string;
  toDt: string;
  fromDate: string;
  toDate: string;
};

export type DailyShare = { headerShare: number; addition: number };

export type DailySalesLine = {
  invoice_id?: number;
  date: string;
  time: string;
  sku: string;
  name: string;
  unit: string;
  qty: number;
  price: number;
  total: number;
  discount: number;
  addition: number;
  net: number;
  cost: number;
  profit: number;
  customer: string;
};

export type DailyReturnLine = Omit<DailySalesLine, "cost" | "profit" | "invoice_id"> & { return_id?: number };

export type DailyLineTotals = { qty: number; total: number; discount: number; net: number; cost: number; profit: number };
export type DailyReturnTotals = { qty: number; total: number; discount: number; net: number };

export type DailySummary = {
  cash_sales: number;
  credit_sales: number;
  sales_returns: number;
  purchases: number;
  credit_purchases: number;
  purchase_returns: number;
  collections: number;
  expenses: number;
  vouchers_in: number;
  vouchers_out: number;
  opening_balance: number;
  net_movement: number;
  other_movement: number;
  final_balance: number;
};

export type DailyMatrixCell = { count: number; total: number; cash: number; credit: number };

export type DailyMatrix = {
  sales: DailyMatrixCell;
  sales_returns: DailyMatrixCell;
  purchases: DailyMatrixCell;
  purchase_returns: DailyMatrixCell;
  receipts: DailyMatrixCell;
  payments: DailyMatrixCell;
  stocktake: DailyMatrixCell;
  transfer: DailyMatrixCell;
  settle: DailyMatrixCell;
};

export function emptyMatrixCell(): DailyMatrixCell {
  return { count: 0, total: 0, cash: 0, credit: 0 };
}

export function activityCell(count: number, cash: number, credit: number): DailyMatrixCell {
  const cashN = round2(cash);
  const creditN = round2(credit);
  return { count: Number(count) || 0, total: round2(cashN + creditN), cash: cashN, credit: creditN };
}

/** Returns/purchase-returns show as negatives in the Sahl activity matrix. */
export function signedActivityCell(count: number, cash: number, credit: number): DailyMatrixCell {
  const cell = activityCell(count, cash, credit);
  return { count: cell.count, total: round2(-cell.total), cash: round2(-cell.cash), credit: round2(-cell.credit) };
}

export function receiptCell(count: number, amount: number): DailyMatrixCell {
  const a = round2(amount);
  return { count: Number(count) || 0, total: a, cash: a, credit: 0 };
}

export function emptyDailyMatrix(): DailyMatrix {
  return {
    sales: emptyMatrixCell(),
    sales_returns: emptyMatrixCell(),
    purchases: emptyMatrixCell(),
    purchase_returns: emptyMatrixCell(),
    receipts: emptyMatrixCell(),
    payments: emptyMatrixCell(),
    stocktake: emptyMatrixCell(),
    transfer: emptyMatrixCell(),
    settle: emptyMatrixCell(),
  };
}

export type CashFlowSlice = {
  cash_sales: number;
  collections: number;
  purchase_returns: number;
  vouchers_in: number;
  purchases: number;
  sales_returns: number;
  expenses: number;
  vouchers_out: number;
  other_movement: number;
};

export function emptyCashFlow(): CashFlowSlice {
  return {
    cash_sales: 0,
    collections: 0,
    purchase_returns: 0,
    vouchers_in: 0,
    purchases: 0,
    sales_returns: 0,
    expenses: 0,
    vouchers_out: 0,
    other_movement: 0,
  };
}

/** Fold cash-account journal nets (debit - credit) into the daily breakdown. */
export function foldCashJournals(rows: Array<{ source?: string | null; n?: number | null }>): CashFlowSlice {
  const acc = emptyCashFlow();
  for (const row of rows) {
    const source = String(row.source || "");
    const n = round2(Number(row.n) || 0);
    if (!n) continue;
    switch (source) {
      case "sale":
        if (n >= 0) acc.cash_sales = round2(acc.cash_sales + n);
        else acc.other_movement = round2(acc.other_movement + n);
        break;
      case "payment":
        acc.collections = round2(acc.collections + n);
        break;
      case "purchase":
      case "supplier_payment":
        acc.purchases = round2(acc.purchases + Math.max(-n, 0));
        if (n > 0) acc.other_movement = round2(acc.other_movement + n);
        break;
      case "purchase_return":
        acc.purchase_returns = round2(acc.purchase_returns + Math.max(n, 0));
        if (n < 0) acc.other_movement = round2(acc.other_movement + n);
        break;
      case "return":
        acc.sales_returns = round2(acc.sales_returns + Math.max(-n, 0));
        if (n > 0) acc.other_movement = round2(acc.other_movement + n);
        break;
      case "expense":
      case "commission":
      case "payroll":
        acc.expenses = round2(acc.expenses + Math.max(-n, 0));
        if (n > 0) acc.other_movement = round2(acc.other_movement + n);
        break;
      case "voucher":
        if (n >= 0) acc.vouchers_in = round2(acc.vouchers_in + n);
        else acc.vouchers_out = round2(acc.vouchers_out - n);
        break;
      default:
        acc.other_movement = round2(acc.other_movement + n);
    }
  }
  return acc;
}

export function normalizeDateTime(raw: string | undefined, fallbackDate: string, endOfDay: boolean): string {
  const s = String(raw || "").trim();
  const m = DT_RE.exec(s);
  if (!m) {
    const day = /^\d{4}-\d{2}-\d{2}$/.test(fallbackDate) ? fallbackDate : todayIso();
    return endOfDay ? `${day} 23:59:59` : `${day} 00:00:00`;
  }
  const day = m[1];
  if (!m[2]) return endOfDay ? `${day} 23:59:59` : `${day} 00:00:00`;
  return `${day} ${m[2]}:${m[3]}:${m[4] || "00"}`;
}

export function dailyMovementRange(p: Record<string, string | undefined>): DailyRange {
  const today = todayIso();
  const fromRaw = p.date_from || p.from;
  const toRaw = p.date_to || p.to;
  const fromDt = normalizeDateTime(fromRaw, today, false);
  const toDt = normalizeDateTime(toRaw, today, true);
  return {
    from: fromRaw || fromDt,
    to: toRaw || toDt,
    fromDt,
    toDt,
    fromDate: fromDt.slice(0, 10),
    toDate: toDt.slice(0, 10),
  };
}

export function splitDateTime(value: string | null | undefined, fallbackDate = ""): { date: string; time: string } {
  const s = String(value || fallbackDate || "").trim().replace("T", " ");
  return { date: s.slice(0, 10), time: s.length >= 16 ? s.slice(11, 16) : "" };
}

export function allocateInvoiceShares(lines: { total: number }[], headerDiscount: number, extraAmount: number): DailyShare[] {
  const goods = round2(lines.reduce((s, l) => s + (Number(l.total) || 0), 0));
  const header = round2(headerDiscount);
  const extra = round2(extraAmount);
  if (!lines.length) return [];
  let usedH = 0;
  let usedE = 0;
  return lines.map((l, i) => {
    const last = i === lines.length - 1;
    if (goods <= 0) {
      const headerShare = last ? round2(header - usedH) : 0;
      const addition = last ? round2(extra - usedE) : 0;
      usedH = round2(usedH + headerShare);
      usedE = round2(usedE + addition);
      return { headerShare, addition };
    }
    const share = (Number(l.total) || 0) / goods;
    const headerShare = last ? round2(header - usedH) : round2(header * share);
    const addition = last ? round2(extra - usedE) : round2(extra * share);
    usedH = round2(usedH + headerShare);
    usedE = round2(usedE + addition);
    return { headerShare, addition };
  });
}

export function mapSalesLine(
  row: {
    invoice_id?: number;
    date?: string | null;
    created_at?: string | null;
    sku?: string | null;
    product_name?: string | null;
    unit_name?: string | null;
    product_unit?: string | null;
    quantity?: number | null;
    unit_price?: number | null;
    discount?: number | null;
    total?: number | null;
    unit_cost?: number | null;
    profit?: number | null;
    customer_name?: string | null;
  },
  alloc: DailyShare,
): DailySalesLine {
  const { date, time } = splitDateTime(row.created_at, row.date || "");
  const qty = Number(row.quantity) || 0;
  const total = round2(Number(row.total) || 0);
  const discount = round2((Number(row.discount) || 0) + alloc.headerShare);
  const addition = round2(alloc.addition);
  const net = round2(total - alloc.headerShare + addition);
  const cost = round2((Number(row.unit_cost) || 0) * qty);
  const profit = row.profit == null ? round2(net - cost) : round2(Number(row.profit) || 0);
  return {
    invoice_id: row.invoice_id,
    date,
    time,
    sku: row.sku || "",
    name: row.product_name || "",
    unit: row.unit_name || row.product_unit || "",
    qty,
    price: round2(Number(row.unit_price) || 0),
    total,
    discount,
    addition,
    net,
    cost,
    profit,
    customer: row.customer_name || "",
  };
}

export function mapReturnLine(row: {
  return_id?: number;
  date?: string | null;
  created_at?: string | null;
  sku?: string | null;
  product_name?: string | null;
  unit_name?: string | null;
  product_unit?: string | null;
  qty?: number | null;
  unit_price?: number | null;
  total?: number | null;
  orig_qty?: number | null;
  orig_total?: number | null;
  line_discount?: number | null;
  header_discount?: number | null;
  extra_amount?: number | null;
  goods_base?: number | null;
  customer_name?: string | null;
}): DailyReturnLine {
  const { date, time } = splitDateTime(row.created_at, row.date || "");
  const qty = Number(row.qty) || 0;
  const origQty = Number(row.orig_qty) || qty || 1;
  const ratio = origQty > 0 ? qty / origQty : 1;
  const goods = round2(Number(row.goods_base) || 0);
  const origTotal = round2(Number(row.orig_total || row.total) || 0);
  const headerFull = goods > 0 ? round2((Number(row.header_discount) || 0) * (origTotal / goods)) : 0;
  const extraFull = goods > 0 ? round2((Number(row.extra_amount) || 0) * (origTotal / goods)) : 0;
  const headerShare = round2(headerFull * ratio);
  const addition = round2(extraFull * ratio);
  const lineDisc = round2((Number(row.line_discount) || 0) * ratio);
  const total = round2(Number(row.total) || 0);
  return {
    return_id: row.return_id,
    date,
    time,
    sku: row.sku || "",
    name: row.product_name || "",
    unit: row.unit_name || row.product_unit || "",
    qty,
    price: round2(Number(row.unit_price) || 0),
    total,
    discount: round2(lineDisc + headerShare),
    addition,
    net: round2(total - headerShare + addition),
    customer: row.customer_name || "",
  };
}

export function omitCostProfit<T extends { cost?: unknown; profit?: unknown }>(line: T): Omit<T, "cost" | "profit"> {
  const { cost: _c, profit: _p, ...rest } = line;
  return rest;
}

export function treasuryClosing(opening: number, periodNet: number) {
  const opening_balance = round2(opening);
  const net_movement = round2(periodNet);
  return {
    opening_balance,
    net_movement,
    final_balance: round2(opening_balance + net_movement),
  };
}

/** Cash-box identity from the visible daily lines. Credit sales/purchases stay off this total. */
export function explainedTreasuryNet(s: CashFlowSlice) {
  return round2(
    (Number(s.cash_sales) || 0)
    + (Number(s.collections) || 0)
    + (Number(s.purchase_returns) || 0)
    + (Number(s.vouchers_in) || 0)
    + (Number(s.other_movement) || 0)
    - (Number(s.sales_returns) || 0)
    - (Number(s.purchases) || 0)
    - (Number(s.expenses) || 0)
    - (Number(s.vouchers_out) || 0),
  );
}

export function sumSalesTotals(lines: Array<Pick<DailySalesLine, "qty" | "total" | "discount" | "net" | "cost" | "profit">>): DailyLineTotals {
  return {
    qty: round2(lines.reduce((s, r) => s + (Number(r.qty) || 0), 0)),
    total: round2(lines.reduce((s, r) => s + (Number(r.total) || 0), 0)),
    discount: round2(lines.reduce((s, r) => s + (Number(r.discount) || 0), 0)),
    net: round2(lines.reduce((s, r) => s + (Number(r.net) || 0), 0)),
    cost: round2(lines.reduce((s, r) => s + (Number(r.cost) || 0), 0)),
    profit: round2(lines.reduce((s, r) => s + (Number(r.profit) || 0), 0)),
  };
}

export function sumReturnTotals(lines: Array<Pick<DailyReturnLine, "qty" | "total" | "discount" | "net">>): DailyReturnTotals {
  return {
    qty: round2(lines.reduce((s, r) => s + (Number(r.qty) || 0), 0)),
    total: round2(lines.reduce((s, r) => s + (Number(r.total) || 0), 0)),
    discount: round2(lines.reduce((s, r) => s + (Number(r.discount) || 0), 0)),
    net: round2(lines.reduce((s, r) => s + (Number(r.net) || 0), 0)),
  };
}

function dtExpr(alias: string, dateCol = "date", createdCol = "created_at") {
  return `COALESCE(${alias}.${createdCol}, CONCAT(LEFT(${alias}.${dateCol}, 10), ' 00:00:00'))`;
}

function dateMidnight(alias: string, dateCol = "date") {
  return `CONCAT(LEFT(${alias}.${dateCol}, 10), ' 00:00:00')`;
}

function n(v: number | null | undefined) {
  return Number(v || 0);
}

export async function loadDailyMovement(db: AppDb, p: ListQ, opts?: { hideCost?: boolean }) {
  const range = dailyMovementRange(p);
  const userId = p.user_id ? Number(p.user_id) : 0;
  const treasuryId = p.treasury_id ? Number(p.treasury_id) : 0;
  const locationId = p.location_id ? Number(p.location_id) : 0;
  const { fromDt, toDt } = range;

  const salesWhere = ["si.deleted_at IS NULL", LIVE_SALES, `${dtExpr("si")} >= ?`, `${dtExpr("si")} <= ?`];
  const salesBinds: (string | number)[] = [fromDt, toDt];
  if (userId) {
    salesWhere.push("si.created_by = ?");
    salesBinds.push(userId);
  }
  if (treasuryId) {
    salesWhere.push("si.cash_account_id = ?");
    salesBinds.push(treasuryId);
  }
  if (locationId) {
    salesWhere.push("si.location_id = ?");
    salesBinds.push(locationId);
  }

  const retWhere = [`${dtExpr("sr")} >= ?`, `${dtExpr("sr")} <= ?`];
  const retBinds: (string | number)[] = [fromDt, toDt];
  if (userId) {
    retWhere.push("sr.created_by = ?");
    retBinds.push(userId);
  }
  if (treasuryId) {
    retWhere.push("si.cash_account_id = ?");
    retBinds.push(treasuryId);
  }
  if (locationId) {
    retWhere.push("si.location_id = ?");
    retBinds.push(locationId);
  }

  const purWhere = ["pi.deleted_at IS NULL", "pi.status IN ('approved','partially_returned')", `${dateMidnight("pi")} >= ?`, `${dateMidnight("pi")} <= ?`];
  const purBinds: (string | number)[] = [fromDt, toDt];
  if (userId) {
    purWhere.push("pi.created_by = ?");
    purBinds.push(userId);
  }

  const prWhere = [`${dateMidnight("pr")} >= ?`, `${dateMidnight("pr")} <= ?`];
  const prBinds: (string | number)[] = [fromDt, toDt];
  if (userId) {
    prWhere.push("pr.created_by = ?");
    prBinds.push(userId);
  }

  const vWhere = ["v.voided_at IS NULL", `${dateMidnight("v")} >= ?`, `${dateMidnight("v")} <= ?`];
  const vBinds: (string | number)[] = [fromDt, toDt];
  if (userId) {
    vWhere.push("v.created_by = ?");
    vBinds.push(userId);
  }
  if (treasuryId) {
    vWhere.push("v.cash_account_id = ?");
    vBinds.push(treasuryId);
  }

  const payWhere = ["p.voided_at IS NULL", `${dateMidnight("p")} >= ?`, `${dateMidnight("p")} <= ?`];
  const payBinds: (string | number)[] = [fromDt, toDt];
  if (userId) {
    payWhere.push("p.created_by = ?");
    payBinds.push(userId);
  }

  const cashWhere = ["c.active = 1", `${dateMidnight("j")} < ?`];
  const cashOpenBinds: (string | number)[] = [fromDt];
  const cashPeriodWhere = ["c.active = 1", `${dateMidnight("j")} >= ?`, `${dateMidnight("j")} <= ?`];
  const cashPeriodBinds: (string | number)[] = [fromDt, toDt];
  if (treasuryId) {
    cashWhere.push("c.id = ?");
    cashOpenBinds.push(treasuryId);
    cashPeriodWhere.push("c.id = ?");
    cashPeriodBinds.push(treasuryId);
  }

  const [
    users,
    creditAgg,
    purchaseCreditAgg,
    cashBySource,
    openingAgg,
    periodAgg,
    saleRows,
    returnRows,
    salesSplit,
    returnSplit,
    purchaseSplit,
    purchaseReturnSplit,
    voucherAgg,
    paymentAgg,
  ] = await db.batch([
    db.prepare("SELECT id, full_name FROM users WHERE deleted_at IS NULL AND active = 1 ORDER BY full_name, id"),
    db.prepare(`SELECT COALESCE(SUM(si.total),0) as n FROM sales_invoices si WHERE ${salesWhere.join(" AND ")} AND si.payment_method = 'credit'`).bind(...salesBinds),
    db.prepare(`SELECT COALESCE(SUM(pi.remaining),0) as n FROM purchase_invoices pi WHERE ${purWhere.join(" AND ")}`).bind(...purBinds),
    db.prepare(
      `SELECT j.source,
              COALESCE(SUM(CASE WHEN (l.debit - l.credit) > 0 THEN l.debit - l.credit ELSE 0 END), 0) as inflow,
              COALESCE(SUM(CASE WHEN (l.debit - l.credit) < 0 THEN l.debit - l.credit ELSE 0 END), 0) as outflow
       FROM journal_lines l
       JOIN journal_entries j ON j.id = l.entry_id AND j.status = 'posted'
       JOIN cash_accounts c ON c.account_id = l.account_id
       WHERE ${cashPeriodWhere.join(" AND ")}
       GROUP BY j.source`,
    ).bind(...cashPeriodBinds),
    db.prepare(
      `SELECT COALESCE(SUM(l.debit - l.credit),0) as n
       FROM journal_lines l
       JOIN journal_entries j ON j.id = l.entry_id AND j.status = 'posted'
       JOIN cash_accounts c ON c.account_id = l.account_id
       WHERE ${cashWhere.join(" AND ")}`,
    ).bind(...cashOpenBinds),
    db.prepare(
      `SELECT COALESCE(SUM(l.debit - l.credit),0) as n
       FROM journal_lines l
       JOIN journal_entries j ON j.id = l.entry_id AND j.status = 'posted'
       JOIN cash_accounts c ON c.account_id = l.account_id
       WHERE ${cashPeriodWhere.join(" AND ")}`,
    ).bind(...cashPeriodBinds),
    db.prepare(
      `SELECT si.id as invoice_id, si.date, si.created_at, si.customer_name, si.discount as header_discount, si.extra_amount,
              sii.sku, sii.product_name, sii.unit_name, p.unit as product_unit, sii.quantity, sii.unit_price, sii.discount, sii.total, sii.unit_cost, sii.profit
       FROM sales_invoice_items sii
       JOIN sales_invoices si ON si.id = sii.invoice_id
       LEFT JOIN products p ON p.id = sii.product_id
       WHERE ${salesWhere.join(" AND ")}
       ORDER BY ${dtExpr("si")}, si.id, sii.id`,
    ).bind(...salesBinds),
    db.prepare(
      `SELECT sr.id as return_id, sr.date, sr.created_at, si.customer_name, si.discount as header_discount, si.extra_amount,
              COALESCE(si.subtotal, si.total) as goods_base, sri.qty, sri.unit_price, sri.total,
              sii.quantity as orig_qty, sii.total as orig_total, sii.discount as line_discount,
              COALESCE(sii.sku, p.sku) as sku, COALESCE(sii.product_name, p.name_ar) as product_name,
              COALESCE(sii.unit_name, p.unit) as unit_name, p.unit as product_unit
       FROM sales_return_items sri
       JOIN sales_returns sr ON sr.id = sri.return_id
       JOIN sales_invoices si ON si.id = sr.invoice_id
       LEFT JOIN sales_invoice_items sii ON sii.id = sri.invoice_item_id
       LEFT JOIN products p ON p.id = sri.product_id
       WHERE ${retWhere.join(" AND ")}
       ORDER BY ${dtExpr("sr")}, sr.id, sri.id`,
    ).bind(...retBinds),
    db.prepare(
      `SELECT COUNT(*) as invoice_count,
              COALESCE(SUM(CASE WHEN COALESCE(si.payment_method,'cash') = 'credit' THEN si.total ELSE 0 END),0) as credit,
              COALESCE(SUM(CASE WHEN COALESCE(si.payment_method,'cash') <> 'credit' THEN si.total ELSE 0 END),0) as cash
       FROM sales_invoices si WHERE ${salesWhere.join(" AND ")}`,
    ).bind(...salesBinds),
    db.prepare(
      `SELECT COUNT(*) as invoice_count,
              COALESCE(SUM(CASE WHEN COALESCE(si.payment_method,'cash') = 'credit' THEN sr.total ELSE 0 END),0) as credit,
              COALESCE(SUM(CASE WHEN COALESCE(si.payment_method,'cash') <> 'credit' THEN sr.total ELSE 0 END),0) as cash
       FROM sales_returns sr JOIN sales_invoices si ON si.id = sr.invoice_id
       WHERE ${retWhere.join(" AND ")}`,
    ).bind(...retBinds),
    db.prepare(
      `SELECT COUNT(*) as invoice_count,
              COALESCE(SUM(CASE WHEN COALESCE(pi.payment_method,'cash') = 'credit' THEN pi.total ELSE 0 END),0) as credit,
              COALESCE(SUM(CASE WHEN COALESCE(pi.payment_method,'cash') <> 'credit' THEN pi.total ELSE 0 END),0) as cash
       FROM purchase_invoices pi WHERE ${purWhere.join(" AND ")}`,
    ).bind(...purBinds),
    db.prepare(
      `SELECT COUNT(*) as invoice_count,
              COALESCE(SUM(CASE WHEN COALESCE(pi.payment_method,'cash') = 'credit' THEN pr.total ELSE 0 END),0) as credit,
              COALESCE(SUM(CASE WHEN COALESCE(pi.payment_method,'cash') <> 'credit' THEN pr.total ELSE 0 END),0) as cash
       FROM purchase_returns pr
       LEFT JOIN purchase_invoices pi ON pi.id = pr.purchase_id
       WHERE ${prWhere.join(" AND ")}`,
    ).bind(...prBinds),
    db.prepare(
      `SELECT v.type, COUNT(*) as invoice_count, COALESCE(SUM(v.amount),0) as n
       FROM vouchers v WHERE ${vWhere.join(" AND ")}
       GROUP BY v.type`,
    ).bind(...vBinds),
    db.prepare(
      `SELECT COUNT(*) as invoice_count FROM payments p WHERE ${payWhere.join(" AND ")}`,
    ).bind(...payBinds),
  ]);

  const firstN = (r: { results?: unknown[] }) => n((r.results?.[0] as { n?: number } | undefined)?.n);
  const rowCount = (row: { invoice_count?: number; c?: number; count?: number } | undefined) =>
    n(row?.invoice_count ?? row?.c ?? row?.count);
  const splitCell = (r: { results?: unknown[] }, signed = false) => {
    const row = (r.results?.[0] as { invoice_count?: number; c?: number; count?: number; cash?: number; credit?: number } | undefined) || {};
    return signed ? signedActivityCell(rowCount(row), n(row.cash), n(row.credit)) : activityCell(rowCount(row), n(row.cash), n(row.credit));
  };
  const treasury = treasuryClosing(firstN(openingAgg), firstN(periodAgg));
  const cashLines = foldCashJournals(
    ((cashBySource.results || []) as Array<{ source?: string | null; inflow?: number | null; outflow?: number | null }>).flatMap((row) => [
      { source: row.source, n: row.inflow },
      { source: row.source, n: row.outflow },
    ]),
  );
  const unexplained = round2(treasury.net_movement - explainedTreasuryNet(cashLines));
  const summary: DailySummary = {
    ...cashLines,
    other_movement: round2(cashLines.other_movement + unexplained),
    credit_sales: round2(firstN(creditAgg)),
    credit_purchases: round2(firstN(purchaseCreditAgg)),
    ...treasury,
  };

  type SaleRow = {
    invoice_id: number;
    date: string;
    created_at: string | null;
    customer_name: string | null;
    header_discount: number;
    extra_amount: number;
    sku: string | null;
    product_name: string | null;
    unit_name: string | null;
    product_unit: string | null;
    quantity: number;
    unit_price: number;
    discount: number;
    total: number;
    unit_cost: number;
    profit: number;
  };

  const rawSales = (saleRows.results || []) as SaleRow[];
  const byInvoice = new Map<number, SaleRow[]>();
  for (const row of rawSales) {
    const list = byInvoice.get(row.invoice_id) || [];
    list.push(row);
    byInvoice.set(row.invoice_id, list);
  }
  let sales_lines: DailySalesLine[] = [];
  for (const group of byInvoice.values()) {
    const shares = allocateInvoiceShares(group, group[0]?.header_discount || 0, group[0]?.extra_amount || 0);
    sales_lines = sales_lines.concat(group.map((row, i) => mapSalesLine(row, shares[i] || { headerShare: 0, addition: 0 })));
  }

  const return_lines = ((returnRows.results || []) as Parameters<typeof mapReturnLine>[0][]).map(mapReturnLine);
  const hideCost = Boolean(opts?.hideCost);
  if (hideCost) sales_lines = sales_lines.map((l) => ({ ...l, cost: 0, profit: 0 }));

  let voucherReceiptCount = 0;
  let voucherPaymentCount = 0;
  for (const row of (voucherAgg.results || []) as Array<{ type?: string | null; invoice_count?: number | null; c?: number | null }>) {
    const c = rowCount(row);
    if (String(row.type || "") === "receipt") voucherReceiptCount += c;
    else voucherPaymentCount += c;
  }
  const paymentCount = rowCount(paymentAgg.results?.[0] as { invoice_count?: number; c?: number } | undefined);
  const matrix: DailyMatrix = {
    ...emptyDailyMatrix(),
    sales: splitCell(salesSplit),
    sales_returns: splitCell(returnSplit, true),
    purchases: splitCell(purchaseSplit),
    purchase_returns: splitCell(purchaseReturnSplit, true),
    receipts: receiptCell(voucherReceiptCount + paymentCount, round2(summary.collections + summary.vouchers_in)),
    payments: receiptCell(voucherPaymentCount, summary.vouchers_out),
  };

  return {
    from: range.fromDt,
    to: range.toDt,
    user_id: userId || null,
    treasury_id: treasuryId || null,
    location_id: locationId || null,
    users: (users.results || []) as { id: number; full_name: string }[],
    summary,
    matrix,
    sales_lines: hideCost ? sales_lines.map(omitCostProfit) : sales_lines,
    return_lines,
    sales_totals: hideCost ? { ...sumSalesTotals(sales_lines), cost: 0, profit: 0 } : sumSalesTotals(sales_lines),
    return_totals: sumReturnTotals(return_lines),
  };
}
