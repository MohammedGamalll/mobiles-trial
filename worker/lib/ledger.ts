import type { AppDb } from "./db";
import { nextNumber, round2, todayIso } from "./helpers";

export type JournalLine = { account_id: number; debit?: number; credit?: number; notes?: string | null };

export async function accountByCode(db: AppDb, code: string) {
  return db.prepare("SELECT id, code FROM ledger_accounts WHERE code = ? AND active = 1").bind(code).first<{ id: number; code: string }>();
}

export async function cashByKind(db: AppDb, kind: "cash" | "bank") {
  return db
    .prepare("SELECT * FROM cash_accounts WHERE kind = ? AND active = 1 ORDER BY id LIMIT 1")
    .bind(kind)
    .first<{ id: number; account_id: number; current_balance: number }>();
}

export async function cashAccountFor(db: AppDb, method?: string | null, cashAccountId?: number | null) {
  const id = Number(cashAccountId || 0);
  if (id) {
    const row = await db
      .prepare("SELECT * FROM cash_accounts WHERE id = ? AND active = 1")
      .bind(id)
      .first<{ id: number; account_id: number; current_balance: number }>();
    if (row) return row;
  }
  return cashByKind(db, methodKind(method));
}

export function methodKind(method?: string | null): "cash" | "bank" {
  const m = String(method || "cash").toLowerCase();
  if (["card", "visa", "bank", "transfer", "instapay", "wallet"].includes(m)) return "bank";
  if (m === "treasury") return "cash";
  return "cash";
}

export async function existingJournal(db: AppDb, source: string, sourceId: number) {
  return db
    .prepare("SELECT id FROM journal_entries WHERE source = ? AND source_id = ? AND status = 'posted'")
    .bind(source, sourceId)
    .first<{ id: number }>();
}

export async function postJournal(
  db: AppDb,
  opts: {
    date: string;
    description: string;
    source: string;
    sourceId?: number | null;
    lines: JournalLine[];
    userId?: number | null;
  },
) {
  const lines = opts.lines
    .map((l) => ({ account_id: l.account_id, debit: round2(l.debit || 0), credit: round2(l.credit || 0), notes: l.notes || null }))
    .filter((l) => l.debit > 0 || l.credit > 0);
  const debit = round2(lines.reduce((s, l) => s + l.debit, 0));
  const credit = round2(lines.reduce((s, l) => s + l.credit, 0));
  if (!lines.length || debit !== credit) throw new Error("unbalanced_journal");
  const number = await nextNumber(db, "journal");
  const ins = await db
    .prepare("INSERT INTO journal_entries (number, date, description, source, source_id, status, created_by) VALUES (?, ?, ?, ?, ?, 'posted', ?)")
    .bind(number, opts.date, opts.description, opts.source, opts.sourceId ?? null, opts.userId ?? null)
    .run();
  const entryId = ins.meta.last_row_id;
  for (const l of lines) {
    await db
      .prepare("INSERT INTO journal_lines (entry_id, account_id, debit, credit, notes) VALUES (?, ?, ?, ?, ?)")
      .bind(entryId, l.account_id, l.debit, l.credit, l.notes)
      .run();
    const cash = await db.prepare("SELECT id FROM cash_accounts WHERE account_id = ? AND active = 1").bind(l.account_id).first<{ id: number }>();
    if (cash) {
      const delta = round2(l.debit - l.credit);
      await db.prepare("UPDATE cash_accounts SET current_balance = current_balance + ? WHERE id = ?").bind(delta, cash.id).run();
    }
  }
  return entryId;
}

export async function reverseJournal(db: AppDb, source: string, sourceId: number, userId?: number | null) {
  const entry = await db
    .prepare("SELECT id, date, description FROM journal_entries WHERE source = ? AND source_id = ? AND status = 'posted'")
    .bind(source, sourceId)
    .first<{ id: number; date: string; description: string }>();
  if (!entry) return null;
  const { results } = await db.prepare("SELECT account_id, debit, credit, notes FROM journal_lines WHERE entry_id = ?").bind(entry.id).all<JournalLine & { debit: number; credit: number }>();
  await db.prepare("UPDATE journal_entries SET status = 'void' WHERE id = ?").bind(entry.id).run();
  return postJournal(db, {
    date: entry.date,
    description: `عكس: ${entry.description}`,
    source: `${source}_void`,
    sourceId,
    userId,
    lines: results.map((l) => ({ account_id: l.account_id, debit: l.credit, credit: l.debit, notes: l.notes })),
  });
}

export async function tryLedger(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err) {
    console.error("ledger", err);
  }
}

export async function postSaleJournal(
  db: AppDb,
  invoice: { id: number; number: string; date: string; total: number; paid: number; remaining: number; payment_method?: string | null; cost_total?: number | null; cash_account_id?: number | null },
  userId?: number | null,
) {
  if (await existingJournal(db, "sale", invoice.id)) return;
  const sales = await accountByCode(db, "4100");
  const ar = await accountByCode(db, "1200");
  const cogs = await accountByCode(db, "5100");
  const inv = await accountByCode(db, "1300");
  if (!sales || !ar) throw new Error("ledger");
  const lines: JournalLine[] = [];
  const { results: pays } = await db.prepare("SELECT method, amount FROM payments WHERE invoice_id = ? AND voided_at IS NULL").bind(invoice.id).all<{ method: string; amount: number }>();
  if (pays.length) {
    for (const p of pays) {
      const cash = await cashAccountFor(db, p.method, invoice.cash_account_id);
      if (!cash) throw new Error("ledger");
      lines.push({ account_id: cash.account_id, debit: p.amount, notes: p.method });
    }
  } else if (invoice.paid > 0) {
    const cash = await cashAccountFor(db, invoice.payment_method, invoice.cash_account_id);
    if (!cash) throw new Error("ledger");
    lines.push({ account_id: cash.account_id, debit: invoice.paid });
  }
  if (invoice.remaining > 0) lines.push({ account_id: ar.id, debit: invoice.remaining });
  lines.push({ account_id: sales.id, credit: invoice.total });
  const cost = Number(invoice.cost_total || 0);
  if (cost > 0) {
    if (!cogs || !inv) throw new Error("ledger");
    lines.push({ account_id: cogs.id, debit: cost });
    lines.push({ account_id: inv.id, credit: cost });
  }
  await postJournal(db, { date: invoice.date, description: `بيع ${invoice.number}`, source: "sale", sourceId: invoice.id, lines, userId });
}

export async function postDamageJournal(
  db: AppDb,
  opts: {
    invoiceId: number;
    number: string;
    cost: number;
    chargeTo: "courier" | "customer" | "company";
    userId?: number | null;
  },
) {
  const cost = round2(opts.cost);
  if (cost <= 0) return;
  if (await existingJournal(db, "damage", opts.invoiceId)) return;
  const inv = await accountByCode(db, "1300");
  const shrink = await accountByCode(db, "5300");
  const ar = await accountByCode(db, "1200");
  if (!inv) throw new Error("ledger");
  const debitAcc = opts.chargeTo === "customer" ? ar : shrink;
  if (!debitAcc) throw new Error("ledger");
  await postJournal(db, {
    date: todayIso(),
    description: `تالف/مفقود ${opts.number}`,
    source: "damage",
    sourceId: opts.invoiceId,
    userId: opts.userId,
    lines: [
      { account_id: debitAcc.id, debit: cost, notes: opts.chargeTo },
      { account_id: inv.id, credit: cost },
    ],
  });
}

export async function postPurchaseJournal(
  db: AppDb,
  purchase: { id: number; number: string; date: string; total: number; paid: number; remaining: number; payment_method?: string | null },
  userId?: number | null,
) {
  if (await existingJournal(db, "purchase", purchase.id)) return;
  const inventory = await accountByCode(db, "1300");
  const ap = await accountByCode(db, "2100");
  if (!inventory) return;
  const lines: JournalLine[] = [{ account_id: inventory.id, debit: purchase.total }];
  if (purchase.paid > 0) {
    const cash = await cashByKind(db, methodKind(purchase.payment_method));
    if (cash) lines.push({ account_id: cash.account_id, credit: purchase.paid });
  }
  if (purchase.remaining > 0 && ap) lines.push({ account_id: ap.id, credit: purchase.remaining });
  if (lines.length < 2) return;
  await postJournal(db, { date: purchase.date, description: `شراء ${purchase.number}`, source: "purchase", sourceId: purchase.id, lines, userId });
}

export async function postReturnJournal(
  db: AppDb,
  opts: { returnId: number; number: string; date: string; retTotal: number; cogs: number; arDrop: number; refund: number; method?: string | null; cashAccountId?: number | null; userId?: number | null },
) {
  if (await existingJournal(db, "return", opts.returnId)) return;
  const sales = await accountByCode(db, "4100");
  const ar = await accountByCode(db, "1200");
  const cogs = await accountByCode(db, "5100");
  const inv = await accountByCode(db, "1300");
  if (!sales) throw new Error("ledger");
  const lines: JournalLine[] = [{ account_id: sales.id, debit: opts.retTotal }];
  if (opts.arDrop > 0) {
    if (!ar) throw new Error("ledger");
    lines.push({ account_id: ar.id, credit: opts.arDrop });
  }
  if (opts.refund > 0) {
    const cash = await cashAccountFor(db, opts.method, opts.cashAccountId);
    if (!cash) throw new Error("ledger");
    lines.push({ account_id: cash.account_id, credit: opts.refund });
  }
  if (opts.cogs > 0) {
    if (!cogs || !inv) throw new Error("ledger");
    lines.push({ account_id: inv.id, debit: opts.cogs });
    lines.push({ account_id: cogs.id, credit: opts.cogs });
  }
  await postJournal(db, { date: opts.date, description: `مرتجع ${opts.number}`, source: "return", sourceId: opts.returnId, lines, userId: opts.userId });
}

export async function postOpeningPartyJournal(
  db: AppDb,
  opts: { kind: "customer" | "supplier"; partyId: number; amount: number; name: string; userId?: number | null },
) {
  const amount = round2(opts.amount);
  if (amount <= 0) return;
  const equity = await accountByCode(db, "3100");
  const counter = await accountByCode(db, opts.kind === "customer" ? "1200" : "2100");
  if (!equity || !counter) throw new Error("ledger");
  await postJournal(db, {
    date: todayIso(),
    description: `رصيد افتتاحي ${opts.name}`,
    source: opts.kind === "customer" ? "customer_opening" : "supplier_opening",
    sourceId: opts.partyId,
    userId: opts.userId,
    lines: [
      { account_id: equity.id, debit: amount },
      { account_id: counter.id, credit: amount },
    ],
  });
}

export async function postCollectionJournal(
  db: AppDb,
  opts: { paymentId: number; invoiceNumber: string; amount: number; method?: string; date: string; cashAccountId?: number | null; userId?: number | null },
) {
  if (await existingJournal(db, "payment", opts.paymentId)) return;
  const ar = await accountByCode(db, "1200");
  const cash = await cashAccountFor(db, opts.method, opts.cashAccountId);
  if (!ar || !cash) throw new Error("ledger");
  await postJournal(db, {
    date: opts.date,
    description: `تحصيل ${opts.invoiceNumber}`,
    source: "payment",
    sourceId: opts.paymentId,
    userId: opts.userId,
    lines: [
      { account_id: cash.account_id, debit: opts.amount },
      { account_id: ar.id, credit: opts.amount },
    ],
  });
}

export async function postExpenseJournal(db: AppDb, opts: { id: number; amount: number; date: string; description?: string | null; userId?: number | null; cashAccountId?: number | null }) {
  if (await existingJournal(db, "expense", opts.id)) return;
  const exp = await accountByCode(db, "5200");
  const cash = await cashAccountFor(db, "cash", opts.cashAccountId);
  if (!exp || !cash) throw new Error("ledger");
  await postJournal(db, {
    date: opts.date,
    description: opts.description || `مصروف #${opts.id}`,
    source: "expense",
    sourceId: opts.id,
    userId: opts.userId,
    lines: [
      { account_id: exp.id, debit: opts.amount },
      { account_id: cash.account_id, credit: opts.amount },
    ],
  });
}

export async function postCommissionJournal(db: AppDb, opts: { id: number; amount: number; date: string; description?: string | null; userId?: number | null; cashAccountId?: number | null }) {
  if (await existingJournal(db, "commission", opts.id)) return;
  const sal = await accountByCode(db, "5300");
  const cash = await cashAccountFor(db, "cash", opts.cashAccountId);
  if (!sal || !cash || opts.amount <= 0) throw new Error("ledger");
  await postJournal(db, {
    date: opts.date,
    description: opts.description || `عمولة #${opts.id}`,
    source: "commission",
    sourceId: opts.id,
    userId: opts.userId,
    lines: [
      { account_id: sal.id, debit: opts.amount },
      { account_id: cash.account_id, credit: opts.amount },
    ],
  });
}

export async function postPayrollJournal(db: AppDb, opts: { runId: number; month: string; total: number; userId?: number | null }) {
  if (await existingJournal(db, "payroll", opts.runId)) return;
  const sal = await accountByCode(db, "5300");
  const cash = await cashByKind(db, "cash");
  if (!sal || !cash || opts.total <= 0) return;
  await postJournal(db, {
    date: `${opts.month}-28`,
    description: `رواتب ${opts.month}`,
    source: "payroll",
    sourceId: opts.runId,
    userId: opts.userId,
    lines: [
      { account_id: sal.id, debit: opts.total },
      { account_id: cash.account_id, credit: opts.total },
    ],
  });
}
