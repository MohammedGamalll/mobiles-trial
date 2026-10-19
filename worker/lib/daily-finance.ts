import type { AppDb } from "./db";
import type { ListQ } from "./filters";
import { reportShiftMeta, reportStamp, resolveMovementScope, shiftTaggedJournalBinds, shiftTaggedJournalSql } from "./daily-movement";
import { SHIFT_CLOSE_SOURCE } from "./pos-shifts";
import { round2 } from "./helpers";

function n(v: unknown) {
  return round2(Number(v || 0));
}

export async function loadDailyFinance(db: AppDb, p: ListQ) {
  const { range, shift, shiftId } = await resolveMovementScope(db, p);
  const { fromDt, toDt } = range;
  const treasuryId = p.treasury_id ? Number(p.treasury_id) : 0;
  const cashAccountId = treasuryId || (shift ? Number(shift.cash_account_id) : 0);
  const cashFilter = cashAccountId ? " AND c.id = ?" : "";
  const cashBinds = cashAccountId ? [cashAccountId] : [];
  const jStamp = shiftId ? reportStamp("j") : "CONCAT(LEFT(j.date, 10), ' 00:00:00')";
  const eStamp = shiftId ? reportStamp("e") : "CONCAT(LEFT(e.date, 10), ' 00:00:00')";
  const rStamp = shiftId ? reportStamp("r") : "CONCAT(LEFT(r.date, 10), ' 00:00:00')";
  const siStamp = shiftId ? reportStamp("si") : "CONCAT(LEFT(si.date, 10), ' 00:00:00')";
  const shiftExp = shiftId ? " AND e.shift_id = ?" : "";
  const shiftRev = shiftId ? " AND r.shift_id = ?" : "";
  const shiftSale = shiftId ? " AND si.shift_id = ?" : "";
  const shiftBinds = shiftId ? [shiftId] : [];
  const periodJoin = shiftId
    ? `j.status = 'posted' AND j.source <> ? AND (${shiftTaggedJournalSql("j")} OR (${jStamp} >= ? AND ${jStamp} <= ?))`
    : `j.status = 'posted' AND ${jStamp} >= ? AND ${jStamp} <= ?`;
  const periodBinds = shiftId
    ? [SHIFT_CLOSE_SOURCE, ...shiftTaggedJournalBinds(shiftId), fromDt, toDt, ...cashBinds]
    : [fromDt, toDt, ...cashBinds];

  const [accounts, opening, period, expenses, otherRev, extras, overage] = await db.batch([
    db.prepare(
      `SELECT id, name, name_en, kind, current_balance FROM cash_accounts WHERE active = 1 ${cashAccountId ? "AND id = ?" : ""} ORDER BY kind, id`,
    ).bind(...cashBinds),
    db.prepare(
      `SELECT c.id, c.name, c.name_en, c.kind,
              COALESCE(SUM(l.debit - l.credit),0) as opening
       FROM cash_accounts c
       LEFT JOIN journal_lines l ON l.account_id = c.account_id
       LEFT JOIN journal_entries j ON j.id = l.entry_id AND j.status = 'posted'
         AND ${jStamp} < ?
       WHERE c.active = 1${cashFilter}
       GROUP BY c.id, c.name, c.name_en, c.kind`,
    ).bind(fromDt, ...cashBinds),
    db.prepare(
      `SELECT c.id, c.name, c.name_en, c.kind, j.source,
              COALESCE(SUM(CASE WHEN (l.debit - l.credit) > 0 THEN l.debit - l.credit ELSE 0 END), 0) as inflow,
              COALESCE(SUM(CASE WHEN (l.debit - l.credit) < 0 THEN l.credit - l.debit ELSE 0 END), 0) as outflow
       FROM journal_lines l
       JOIN journal_entries j ON j.id = l.entry_id AND ${periodJoin}
       JOIN cash_accounts c ON c.account_id = l.account_id
       WHERE c.active = 1${cashFilter}
       GROUP BY c.id, c.name, c.name_en, c.kind, j.source`,
    ).bind(...periodBinds),
    db.prepare(
      `SELECT COALESCE(ec.name_ar, 'أخرى') as name_ar, COALESCE(ec.name_en, 'Other') as name_en,
              COALESCE(SUM(e.amount),0) as total, COUNT(*) as c
       FROM expenses e
       LEFT JOIN expense_categories ec ON ec.id = e.category_id
       WHERE e.voided_at IS NULL ${shiftId ? shiftExp : `AND ${eStamp} >= ? AND ${eStamp} <= ?`}
       ${treasuryId ? "AND e.cash_account_id = ?" : ""}
       GROUP BY ec.id, ec.name_ar, ec.name_en
       ORDER BY total DESC`,
    ).bind(...(shiftId ? shiftBinds : [fromDt, toDt]), ...(treasuryId ? [treasuryId] : [])),
    db.prepare(
      `SELECT COALESCE(r.category, rc.name_ar, 'أخرى') as name_ar,
              COALESCE(rc.name_en, r.category, 'Other') as name_en,
              COALESCE(SUM(r.amount),0) as total, COUNT(*) as c
       FROM other_revenues r
       LEFT JOIN revenue_categories rc ON rc.id = r.category_id
       WHERE r.voided_at IS NULL ${shiftId ? shiftRev : `AND ${rStamp} >= ? AND ${rStamp} <= ?`}
       ${treasuryId ? "AND r.cash_account_id = ?" : ""}
       GROUP BY r.category, rc.name_ar, rc.name_en
       ORDER BY total DESC`,
    ).bind(...(shiftId ? shiftBinds : [fromDt, toDt]), ...(treasuryId ? [treasuryId] : [])),
    db.prepare(
      `SELECT COALESCE(SUM(si.extra_amount),0) as n
       FROM sales_invoices si
       WHERE si.deleted_at IS NULL AND si.status NOT IN ('cancelled','void','draft','held','quote','order')
         ${shiftId ? shiftSale : `AND ${siStamp} >= ? AND ${siStamp} <= ?`}`,
    ).bind(...(shiftId ? shiftBinds : [fromDt, toDt])),
    db.prepare(
      `SELECT
          COALESCE(SUM(CASE WHEN a.code = '4210' THEN l.credit ELSE 0 END),0) as overage,
          COALESCE(SUM(CASE WHEN a.code = '5215' THEN l.debit ELSE 0 END),0) as shortage
       FROM journal_lines l
       JOIN journal_entries j ON j.id = l.entry_id AND j.status = 'posted'
       JOIN ledger_accounts a ON a.id = l.account_id AND a.code IN ('4210','5215')
       WHERE j.source = 'shift_variance' AND ${shiftId ? "j.source_id = ?" : `${jStamp} >= ? AND ${jStamp} <= ?`}`,
    ).bind(...(shiftId ? [shiftId] : [fromDt, toDt])),
  ]);

  const byId = new Map<number, {
    id: number;
    name: string;
    name_en: string;
    kind: string;
    opening: number;
    inflow: number;
    outflow: number;
    closing: number;
    sources: { source: string; inflow: number; outflow: number }[];
  }>();
  for (const row of (accounts.results || []) as Array<{ id: number; name: string; name_en: string; kind: string }>) {
    byId.set(row.id, { id: row.id, name: row.name, name_en: row.name_en, kind: row.kind, opening: 0, inflow: 0, outflow: 0, closing: 0, sources: [] });
  }
  const shiftDrawerId = shift ? Number(shift.cash_account_id) : 0;
  const useShiftOpening = Boolean(shift && (!treasuryId || treasuryId === shiftDrawerId));
  for (const row of (opening.results || []) as Array<{ id: number; name: string; name_en: string; kind: string; opening: number }>) {
    const cur = byId.get(row.id) || { id: row.id, name: row.name, name_en: row.name_en, kind: row.kind, opening: 0, inflow: 0, outflow: 0, closing: 0, sources: [] };
    cur.opening = useShiftOpening && row.id === shiftDrawerId ? n(shift?.opening_cash_balance) : n(row.opening);
    byId.set(row.id, cur);
  }
  if (useShiftOpening && shiftDrawerId) {
    const cur = byId.get(shiftDrawerId);
    if (cur) cur.opening = n(shift?.opening_cash_balance);
  }
  const inflowBySource: Record<string, number> = {};
  const outflowBySource: Record<string, number> = {};
  for (const row of (period.results || []) as Array<{ id: number; name: string; name_en: string; kind: string; source?: string | null; inflow: number; outflow: number }>) {
    const cur = byId.get(row.id) || { id: row.id, name: row.name, name_en: row.name_en, kind: row.kind, opening: 0, inflow: 0, outflow: 0, closing: 0, sources: [] };
    const inflow = n(row.inflow);
    const outflow = n(row.outflow);
    cur.inflow = round2(cur.inflow + inflow);
    cur.outflow = round2(cur.outflow + outflow);
    if (row.source) {
      cur.sources.push({ source: row.source, inflow, outflow });
      inflowBySource[row.source] = round2((inflowBySource[row.source] || 0) + inflow);
      outflowBySource[row.source] = round2((outflowBySource[row.source] || 0) + outflow);
    }
    byId.set(row.id, cur);
  }
  const treasuries = [...byId.values()].map((t) => ({
    ...t,
    closing: round2(t.opening + t.inflow - t.outflow),
  }));
  const totalIn = round2(treasuries.reduce((s, t) => s + t.inflow, 0));
  const totalOut = round2(treasuries.reduce((s, t) => s + t.outflow, 0));
  const sourceIn = (key: string) => n(inflowBySource[key]);
  const sourceOut = (key: string) => n(outflowBySource[key]);
  const otherRevenueTotal = ((otherRev.results || []) as Array<{ total: number }>).reduce((s, r) => s + n(r.total), 0);
  const expenseTotal = ((expenses.results || []) as Array<{ total: number }>).reduce((s, r) => s + n(r.total), 0);

  return {
    from: range.fromDt,
    to: range.toDt,
    shift_id: shiftId || null,
    shift: reportShiftMeta(shift),
    treasuries,
    totals: {
      opening: round2(treasuries.reduce((s, t) => s + t.opening, 0)),
      inflow: totalIn,
      outflow: totalOut,
      closing: round2(treasuries.reduce((s, t) => s + t.closing, 0)),
    },
    inflow: {
      cash_sales: sourceIn("sale"),
      collections: sourceIn("payment"),
      vouchers: sourceIn("voucher"),
      purchase_returns: sourceIn("purchase_return"),
      other_revenues: otherRevenueTotal,
      partner_deposits: sourceIn("partner_deposit"),
      cash_overage: n((overage.results?.[0] as { overage?: number } | undefined)?.overage),
      shift_overage: n((overage.results?.[0] as { overage?: number } | undefined)?.overage),
    },
    outflow: {
      purchases: sourceOut("purchase"),
      expenses: sourceOut("expense") || expenseTotal,
      payroll: sourceOut("advance"),
      vouchers: sourceOut("voucher"),
      sales_returns: sourceOut("return"),
      commissions: sourceOut("commission"),
      partner_draws: sourceOut("partner_draw"),
      shift_shortage: n((overage.results?.[0] as { shortage?: number } | undefined)?.shortage),
    },
    expense_breakdown: ((expenses.results || []) as Array<{ name_ar: string; name_en: string; total: number; c: number }>).map((r) => ({
      name_ar: r.name_ar,
      name_en: r.name_en,
      total: n(r.total),
      count: Number(r.c || 0),
    })),
    revenue_breakdown: [
      { key: "additions", name_ar: "إضافات الفواتير", name_en: "Invoice additions", total: n((extras.results?.[0] as { n?: number } | undefined)?.n) },
      { key: "other_revenues", name_ar: "إيرادات متنوعة", name_en: "Other revenues", total: otherRevenueTotal },
      { key: "cash_overage", name_ar: "زيادة صندوق", name_en: "Cash overage", total: n((overage.results?.[0] as { overage?: number } | undefined)?.overage) },
      { key: "shift_shortage", name_ar: "عجز صندوق", name_en: "Cash shortage", total: n((overage.results?.[0] as { shortage?: number } | undefined)?.shortage) },
      ...((otherRev.results || []) as Array<{ name_ar: string; name_en: string; total: number }>).map((r) => ({
        key: "other",
        name_ar: r.name_ar,
        name_en: r.name_en,
        total: n(r.total),
      })),
    ].filter((r) => r.total > 0),
  };
}
