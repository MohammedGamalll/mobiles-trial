import { accountByCode, cashByKind, postJournal } from "./ledger";
import type { AppDb } from "./db";
import { getSettings, nowIso, round2, setSetting, type AuthUser } from "./helpers";

export const SHIFT_CLOSE_SOURCE = "shift_close";
export const SHIFT_VARIANCE_SOURCE = "shift_variance";

export type PosShiftRow = {
  id: number;
  user_id: number;
  cash_account_id: number;
  opened_at: string;
  closed_at: string | null;
  opening_cash_balance: number;
  expected_cash_balance: number | null;
  actual_cash_balance: number | null;
  variance: number | null;
  leave_float: number;
  status: "open" | "closed";
  close_journal_id: number | null;
  variance_journal_id: number | null;
  drawer_name?: string;
  drawer_name_en?: string;
  user_name?: string;
  account_id?: number;
};

export class ShiftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShiftError";
  }
}

export function isShiftErr(err: unknown) {
  return err instanceof ShiftError || (err instanceof Error && (err.message === "shift_required" || err.message === "shift_open" || err.message === "drawer_busy" || err.message === "shift_closed"));
}

export function isDrawerPayMethod(method?: string | null) {
  const m = String(method || "cash").toLowerCase();
  return !["card", "visa", "bank", "transfer", "instapay", "wallet", "credit"].includes(m);
}

export function drawerCashForSale(
  shift: { cash_account_id: number } | null | undefined,
  method?: string | null,
  requested?: number | null,
) {
  if (shift && isDrawerPayMethod(method)) return shift.cash_account_id;
  return Number(requested || 0) || shift?.cash_account_id || null;
}

/** Credit invoices still put any upfront cash into the open shift drawer. */
export function saleDrawerForInvoice(
  shift: { cash_account_id: number } | null | undefined,
  method?: string | null,
  requested?: number | null,
  paidAmount?: number | null,
) {
  const creditCash = String(method || "").toLowerCase() === "credit" && Number(paidAmount || 0) > 0;
  return drawerCashForSale(shift, creditCash ? "cash" : method, requested);
}

export function shiftExpected(opening: number, cashIn: number, cashOut: number) {
  return round2(Number(opening || 0) + Number(cashIn || 0) - Number(cashOut || 0));
}

export function shiftVariance(actual: number, expected: number) {
  return round2(Number(actual || 0) - Number(expected || 0));
}

export function vaultTransferAmount(actual: number, leaveFloat = 0) {
  return round2(Math.max(0, Number(actual || 0) - Math.max(0, Number(leaveFloat || 0))));
}

export function shouldSkipVaultTransfer(drawerId: number, mainSafeId: number) {
  return Number(drawerId) === Number(mainSafeId);
}

export type CloseJournalPlan = {
  expected: number;
  actual: number;
  variance: number;
  transfer: { amount: number } | null;
  varianceEntry: { kind: "shortage" | "overage"; amount: number } | null;
  drawerEnd: number;
  skippedTransfer: boolean;
};

export function planShiftClose(opts: {
  opening: number;
  cashIn: number;
  cashOut: number;
  actual: number;
  leaveFloat?: number;
  drawerId: number;
  mainSafeId: number;
}): CloseJournalPlan {
  const expected = shiftExpected(opts.opening, opts.cashIn, opts.cashOut);
  const actual = round2(Number(opts.actual || 0));
  const float = round2(Math.max(0, Number(opts.leaveFloat || 0)));
  const variance = shiftVariance(actual, expected);
  const skipped = shouldSkipVaultTransfer(opts.drawerId, opts.mainSafeId);
  const xfer = skipped ? 0 : vaultTransferAmount(actual, float);
  return {
    expected,
    actual,
    variance,
    transfer: xfer > 0 ? { amount: xfer } : null,
    varianceEntry: Math.abs(variance) < 0.005 ? null : { kind: variance < 0 ? "shortage" : "overage", amount: round2(Math.abs(variance)) },
    drawerEnd: skipped ? actual : float,
    skippedTransfer: skipped,
  };
}

export async function drawerJournalBalance(db: AppDb, cashAccountId: number) {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(l.debit - l.credit), 0) as n
       FROM journal_lines l
       JOIN journal_entries j ON j.id = l.entry_id AND j.status = 'posted'
       JOIN cash_accounts c ON c.account_id = l.account_id
       WHERE c.id = ?`,
    )
    .bind(cashAccountId)
    .first<{ n: number }>();
  return round2(Number(row?.n || 0));
}

export function drawerFlowSinceSql(shiftId?: number) {
  const tagged = shiftId
    ? ` OR (
        (j.source = 'sale' AND j.source_id IN (SELECT id FROM sales_invoices WHERE shift_id = ? AND deleted_at IS NULL))
        OR (j.source IN ('payment','collection') AND j.source_id IN (SELECT id FROM payments WHERE shift_id = ? AND IFNULL(voided_at,'') = ''))
        OR (j.source = 'return' AND j.source_id IN (SELECT id FROM sales_returns WHERE shift_id = ?))
        OR (j.source = 'expense' AND j.source_id IN (SELECT id FROM expenses WHERE shift_id = ? AND IFNULL(voided_at,'') = ''))
        OR (j.source = 'voucher' AND j.source_id IN (SELECT id FROM vouchers WHERE shift_id = ? AND IFNULL(voided_at,'') = ''))
      )`
    : "";
  return `SELECT
         COALESCE(SUM(CASE WHEN l.debit > 0 THEN l.debit ELSE 0 END), 0) as cash_in,
         COALESCE(SUM(CASE WHEN l.credit > 0 THEN l.credit ELSE 0 END), 0) as cash_out
       FROM journal_lines l
       JOIN journal_entries j ON j.id = l.entry_id AND j.status = 'posted'
       JOIN cash_accounts c ON c.account_id = l.account_id
       WHERE c.id = ?
         AND j.source NOT IN (?, ?)
         AND (
           COALESCE(j.created_at, CONCAT(LEFT(j.date, 10), ' 23:59:59')) >= ?
           ${tagged}
         )`;
}

export async function drawerPeriodFlow(db: AppDb, cashAccountId: number, openedAt: string, shiftId?: number) {
  const id = Number(shiftId || 0) || undefined;
  const binds: (string | number)[] = [cashAccountId, SHIFT_CLOSE_SOURCE, SHIFT_VARIANCE_SOURCE, openedAt];
  if (id) binds.push(id, id, id, id, id);
  const row = await db
    .prepare(drawerFlowSinceSql(id))
    .bind(...binds)
    .first<{ cash_in: number; cash_out: number }>();
  return { cashIn: round2(Number(row?.cash_in || 0)), cashOut: round2(Number(row?.cash_out || 0)) };
}

export async function findOpenShiftByUser(db: AppDb, userId: number) {
  return db
    .prepare(
      `SELECT s.*, c.name as drawer_name, c.name_en as drawer_name_en, c.account_id, u.full_name as user_name
       FROM pos_shifts s
       JOIN cash_accounts c ON c.id = s.cash_account_id
       JOIN users u ON u.id = s.user_id
       WHERE s.user_id = ? AND s.status = 'open'
       ORDER BY s.id DESC LIMIT 1`,
    )
    .bind(userId)
    .first<PosShiftRow>();
}

export async function findOpenShiftByDrawer(db: AppDb, cashAccountId: number) {
  return db
    .prepare("SELECT * FROM pos_shifts WHERE cash_account_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1")
    .bind(cashAccountId)
    .first<PosShiftRow>();
}

export async function loadShift(db: AppDb, id: number) {
  return db
    .prepare(
      `SELECT s.*, c.name as drawer_name, c.name_en as drawer_name_en, c.account_id, u.full_name as user_name
       FROM pos_shifts s
       JOIN cash_accounts c ON c.id = s.cash_account_id
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ?`,
    )
    .bind(id)
    .first<PosShiftRow>();
}

export async function attachOpenShift(db: AppDb, userId: number) {
  return findOpenShiftByUser(db, userId);
}

export async function requirePosShift(db: AppDb, user: AuthUser) {
  const open = await findOpenShiftByUser(db, user.id);
  if (open) return open;
  const settings = await getSettings(db);
  if (settings.pos_require_shift === "0") return null;
  throw new ShiftError("shift_required");
}

export async function findSafeCashAccountId(db: AppDb) {
  const row = await db
    .prepare(
      `SELECT c.id
       FROM cash_accounts c
       JOIN ledger_accounts la ON la.id = c.account_id
       WHERE c.active = 1 AND (
         la.code = '1101'
         OR c.name IN ('الخزنه', 'الخزنة')
         OR c.name_en IN ('Safe', 'The Safe')
       )
       ORDER BY CASE WHEN la.code = '1101' THEN 0 ELSE 1 END, c.id
       LIMIT 1`,
    )
    .first<{ id: number }>();
  return row?.id || 0;
}

async function cashAccountCode(db: AppDb, id: number) {
  const row = await db
    .prepare(
      `SELECT la.code
       FROM cash_accounts c
       JOIN ledger_accounts la ON la.id = c.account_id
       WHERE c.id = ? AND c.active = 1`,
    )
    .bind(id)
    .first<{ code: string }>();
  return row?.code || "";
}

export async function resolveMainSafeId(db: AppDb, requested?: number | null) {
  const id = Number(requested || 0);
  if (id) {
    const code = await cashAccountCode(db, id);
    if (code && code !== "1100") return id;
  }
  const safe = await findSafeCashAccountId(db);
  if (safe) {
    try { await setSetting(db, "main_safe_id", String(safe)); } catch { /* remap is best-effort */ }
    return safe;
  }
  const settings = await getSettings(db);
  const fromSettings = Number(settings.main_safe_id || 0);
  if (fromSettings) {
    const code = await cashAccountCode(db, fromSettings);
    if (code && code !== "1100") return fromSettings;
  }
  const fallback = await cashByKind(db, "cash");
  return fallback?.id || 0;
}

export async function liveShiftTotals(
  db: AppDb,
  shift: Pick<PosShiftRow, "opening_cash_balance" | "cash_account_id" | "opened_at"> & { id?: number },
) {
  const flow = await drawerPeriodFlow(db, shift.cash_account_id, shift.opened_at, shift.id);
  const expected = shiftExpected(shift.opening_cash_balance, flow.cashIn, flow.cashOut);
  return { ...flow, expected };
}

export async function openPosShift(db: AppDb, user: AuthUser, cashAccountId: number) {
  const drawer = await db
    .prepare("SELECT id, name, name_en, account_id FROM cash_accounts WHERE id = ? AND active = 1")
    .bind(cashAccountId)
    .first<{ id: number; name: string; name_en: string | null; account_id: number }>();
  if (!drawer) throw new ShiftError("cash_missing");
  const mine = await findOpenShiftByUser(db, user.id);
  if (mine) throw new ShiftError("shift_open");
  const busy = await findOpenShiftByDrawer(db, drawer.id);
  if (busy) throw new ShiftError("drawer_busy");
  const opening = await drawerJournalBalance(db, drawer.id);
  const openedAt = nowIso();
  const ins = await db
    .prepare(
      "INSERT INTO pos_shifts (user_id, cash_account_id, opened_at, opening_cash_balance, status, leave_float) VALUES (?, ?, ?, ?, 'open', 0)",
    )
    .bind(user.id, drawer.id, openedAt, opening)
    .run();
  return loadShift(db, ins.meta.last_row_id);
}

export async function closePosShift(
  db: AppDb,
  shiftId: number,
  actor: AuthUser,
  opts: { actual_cash_balance: number; main_safe_id?: number | null; leave_float?: number },
) {
  return db.transaction(async (tx) => {
    const shift = await loadShift(tx, shiftId);
    if (!shift) throw new ShiftError("not_found");
    if (shift.status !== "open") throw new ShiftError("shift_closed");
    if (actor.role_slug !== "admin" && shift.user_id !== actor.id) throw new ShiftError("forbidden");
    const actual = round2(Number(opts.actual_cash_balance));
    if (!(actual >= 0)) throw new ShiftError("invalid_amount");
    const leaveFloat = round2(Math.max(0, Number(opts.leave_float || 0)));
    const mainSafeId = await resolveMainSafeId(tx, opts.main_safe_id);
    if (!mainSafeId) throw new ShiftError("cash_missing");
    const flow = await drawerPeriodFlow(tx, shift.cash_account_id, shift.opened_at, shift.id);
    const plan = planShiftClose({
      opening: shift.opening_cash_balance,
      cashIn: flow.cashIn,
      cashOut: flow.cashOut,
      actual,
      leaveFloat,
      drawerId: shift.cash_account_id,
      mainSafeId,
    });
    const drawer = await tx
      .prepare("SELECT id, account_id, name FROM cash_accounts WHERE id = ?")
      .bind(shift.cash_account_id)
      .first<{ id: number; account_id: number; name: string }>();
    const safe = await tx
      .prepare("SELECT id, account_id, name FROM cash_accounts WHERE id = ?")
      .bind(mainSafeId)
      .first<{ id: number; account_id: number; name: string }>();
    if (!drawer || !safe) throw new ShiftError("cash_missing");
    const date = nowIso().slice(0, 10);
    let closeJournalId: number | null = null;
    let varianceJournalId: number | null = null;
    if (plan.transfer) {
      closeJournalId = await postJournal(tx, {
        date,
        description: `إقفال وردية #${shift.id} — تحويل للخزنة`,
        source: SHIFT_CLOSE_SOURCE,
        sourceId: shift.id,
        userId: actor.id,
        lines: [
          { account_id: safe.account_id, debit: plan.transfer.amount, notes: safe.name },
          { account_id: drawer.account_id, credit: plan.transfer.amount, notes: drawer.name },
        ],
      });
    }
    if (plan.varianceEntry) {
      const shortage = await accountByCode(tx, "5215");
      const overage = await accountByCode(tx, "4210");
      if (plan.varianceEntry.kind === "shortage") {
        if (!shortage) throw new Error("account_missing");
        varianceJournalId = await postJournal(tx, {
          date,
          description: `عجز صندوق وردية #${shift.id}`,
          source: SHIFT_VARIANCE_SOURCE,
          sourceId: shift.id,
          userId: actor.id,
          lines: [
            { account_id: shortage.id, debit: plan.varianceEntry.amount },
            { account_id: drawer.account_id, credit: plan.varianceEntry.amount },
          ],
        });
      } else {
        if (!overage) throw new Error("account_missing");
        varianceJournalId = await postJournal(tx, {
          date,
          description: `زيادة صندوق وردية #${shift.id}`,
          source: SHIFT_VARIANCE_SOURCE,
          sourceId: shift.id,
          userId: actor.id,
          lines: [
            { account_id: drawer.account_id, debit: plan.varianceEntry.amount },
            { account_id: overage.id, credit: plan.varianceEntry.amount },
          ],
        });
      }
    }
    await tx
      .prepare(
        `UPDATE pos_shifts SET closed_at=?, expected_cash_balance=?, actual_cash_balance=?, variance=?, leave_float=?, status='closed',
         close_journal_id=?, variance_journal_id=? WHERE id=?`,
      )
      .bind(nowIso(), plan.expected, plan.actual, plan.variance, leaveFloat, closeJournalId, varianceJournalId, shift.id)
      .run();
    return { ...(await loadShift(tx, shift.id)), plan };
  });
}

export async function shiftReport(db: AppDb, id: number) {
  const shift = await loadShift(db, id);
  if (!shift) return null;
  const live = shift.status === "open" ? await liveShiftTotals(db, shift) : {
    cashIn: 0,
    cashOut: 0,
    expected: Number(shift.expected_cash_balance || 0),
  };
  const sales = await db
    .prepare(
      `SELECT id, number, date, customer_name, payment_method, total, paid, remaining, status
       FROM sales_invoices WHERE shift_id = ? AND deleted_at IS NULL ORDER BY id`,
    )
    .bind(id)
    .all();
  const returns = await db
    .prepare(
      `SELECT sr.id, sr.number, sr.date, sr.total, sr.reason, si.id as invoice_id, si.number as invoice_number
       FROM sales_returns sr LEFT JOIN sales_invoices si ON si.id = sr.invoice_id
       WHERE sr.shift_id = ? ORDER BY sr.id`,
    )
    .bind(id)
    .all();
  const vouchers = await db
    .prepare("SELECT id, number, type, date, amount, party_name, description FROM vouchers WHERE shift_id = ? AND voided_at IS NULL ORDER BY id")
    .bind(id)
    .all();
  const expenses = await db
    .prepare(
      `SELECT e.id, e.date, e.amount, e.description, ec.name_ar as category_ar, ec.name_en as category_en
       FROM expenses e LEFT JOIN expense_categories ec ON ec.id = e.category_id
       WHERE e.shift_id = ? AND e.voided_at IS NULL ORDER BY e.id`,
    )
    .bind(id)
    .all();
  const collections = await db
    .prepare(
      `SELECT p.id, p.date, p.method, p.amount, p.notes, si.id as invoice_id, si.number as invoice_number
       FROM payments p LEFT JOIN sales_invoices si ON si.id = p.invoice_id
       WHERE p.shift_id = ? AND p.voided_at IS NULL ORDER BY p.id`,
    )
    .bind(id)
    .all();
  const sum = (rows: { results: Record<string, unknown>[] }, key: string) =>
    round2(rows.results.reduce((s, r) => s + Number(r[key] || 0), 0));
  return {
    shift: {
      ...shift,
      cash_in: live.cashIn,
      cash_out: live.cashOut,
      expected_cash_balance: shift.status === "open" ? live.expected : shift.expected_cash_balance,
    },
    sales: sales.results,
    returns: returns.results,
    vouchers: vouchers.results,
    expenses: expenses.results,
    collections: collections.results,
    totals: {
      sales: sum(sales, "total"),
      sales_paid: sum(sales, "paid"),
      returns: sum(returns, "total"),
      vouchers_in: round2(vouchers.results.filter((v) => v.type === "receipt").reduce((s, v) => s + Number(v.amount || 0), 0)),
      vouchers_out: round2(vouchers.results.filter((v) => v.type !== "receipt").reduce((s, v) => s + Number(v.amount || 0), 0)),
      expenses: sum(expenses, "amount"),
      collections: sum(collections, "amount"),
      opening: Number(shift.opening_cash_balance || 0),
      expected: shift.status === "open" ? live.expected : Number(shift.expected_cash_balance || 0),
      actual: shift.actual_cash_balance,
      variance: shift.status === "open" ? null : shift.variance,
    },
  };
}
