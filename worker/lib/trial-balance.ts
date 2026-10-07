import type { AppDb } from "./db";
import { applyEq, applySearch, resolveDates, type ListQ } from "./filters";
import { round2, todayIso } from "./helpers";

export type TrialAccountRow = {
  id: number;
  code: string;
  name_ar: string;
  name_en: string;
  type: string;
  opening_balance: number;
  total_debit: number;
  total_credit: number;
  net_balance: number;
  closing_balance: number;
};

export function trialDateAliases(p: ListQ): ListQ {
  const next = { ...p };
  if (p.date_from && !p.from) next.from = p.date_from;
  if (p.date_to && !p.to) next.to = p.date_to;
  if (p.account_type && !p.type) next.type = p.account_type;
  return next;
}

export function trialDateRange(p: ListQ): { from: string; to: string } {
  const mapped = trialDateAliases(p);
  const range = resolveDates(mapped);
  return { from: range.from || "2000-01-01", to: range.to || todayIso() };
}

/** Split a signed closing (opening + debit - credit) into debit/credit columns with no minus. */
export function splitClosingSides(net: number): { debit: number; credit: number } {
  if (net > 0.005) return { debit: round2(net), credit: 0 };
  if (net < -0.005) return { debit: 0, credit: round2(Math.abs(net)) };
  return { debit: 0, credit: 0 };
}

export function finalizeTrialRow(
  row: Omit<TrialAccountRow, "net_balance" | "closing_balance"> & Partial<Pick<TrialAccountRow, "net_balance" | "closing_balance">>,
): TrialAccountRow {
  const opening_balance = round2(row.opening_balance);
  const total_debit = round2(row.total_debit);
  const total_credit = round2(row.total_credit);
  return {
    id: row.id,
    code: row.code,
    name_ar: row.name_ar,
    name_en: row.name_en,
    type: row.type,
    opening_balance,
    total_debit,
    total_credit,
    net_balance: round2(total_debit - total_credit),
    closing_balance: round2(opening_balance + total_debit - total_credit),
  };
}

export function isZeroTrialRow(row: Pick<TrialAccountRow, "opening_balance" | "total_debit" | "total_credit">) {
  return Math.abs(row.opening_balance) < 0.005 && Math.abs(row.total_debit) < 0.005 && Math.abs(row.total_credit) < 0.005;
}

export function trialBalanceTotals(ledgerPeriod: { debit: number; credit: number }, rows: TrialAccountRow[]) {
  const debit = round2(ledgerPeriod.debit);
  const credit = round2(ledgerPeriod.credit);
  return {
    opening: round2(rows.reduce((s, r) => s + r.opening_balance, 0)),
    debit,
    credit,
    net: round2(debit - credit),
    closing: round2(rows.reduce((s, r) => s + r.closing_balance, 0)),
    balanced: Math.abs(debit - credit) < 0.02,
  };
}

export async function loadTrialBalance(db: AppDb, p: ListQ) {
  const mapped = trialDateAliases(p);
  const { from, to } = trialDateRange(mapped);
  const search = ["a.active = 1"];
  const params: (string | number)[] = [];
  applySearch(search, params, mapped.q, ["a.code", "a.name_ar", "a.name_en"]);
  applyEq(search, params, "a.type", mapped.type);
  if (mapped.level === "1") search.push("a.parent_id IS NULL");
  if (mapped.level === "2") search.push("a.parent_id IS NOT NULL");
  const { results } = await db
    .prepare(
      `SELECT a.id, a.code, a.name_ar, a.name_en, a.type,
        COALESCE(SUM(CASE WHEN j.id IS NOT NULL AND date(j.date) < date(?) THEN l.debit - l.credit ELSE 0 END), 0) as opening_balance,
        COALESCE(SUM(CASE WHEN j.id IS NOT NULL AND date(j.date) >= date(?) AND date(j.date) <= date(?) THEN l.debit ELSE 0 END), 0) as total_debit,
        COALESCE(SUM(CASE WHEN j.id IS NOT NULL AND date(j.date) >= date(?) AND date(j.date) <= date(?) THEN l.credit ELSE 0 END), 0) as total_credit
       FROM ledger_accounts a
       LEFT JOIN journal_lines l ON l.account_id = a.id
       LEFT JOIN journal_entries j ON j.id = l.entry_id AND j.status = 'posted'
       WHERE ${search.join(" AND ")}
       GROUP BY a.id, a.code, a.name_ar, a.name_en, a.type
       ORDER BY a.code`,
    )
    .bind(from, from, to, from, to, ...params)
    .all<{
      id: number;
      code: string;
      name_ar: string;
      name_en: string;
      type: string;
      opening_balance: number;
      total_debit: number;
      total_credit: number;
    }>();
  const ledger = await db
    .prepare(
      `SELECT COALESCE(SUM(l.debit),0) as debit, COALESCE(SUM(l.credit),0) as credit
       FROM journal_lines l
       JOIN journal_entries j ON j.id = l.entry_id AND j.status = 'posted'
       WHERE date(j.date) >= date(?) AND date(j.date) <= date(?)`,
    )
    .bind(from, to)
    .first<{ debit: number; credit: number }>();
  let rows = (results || []).map((r) => finalizeTrialRow(r));
  if (mapped.include_zeros !== "1") rows = rows.filter((r) => !isZeroTrialRow(r));
  return {
    from,
    to,
    data: rows,
    totals: trialBalanceTotals({ debit: Number(ledger?.debit || 0), credit: Number(ledger?.credit || 0) }, rows),
  };
}
