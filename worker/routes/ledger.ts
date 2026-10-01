import { Hono } from "hono";
import { audit, nextNumber, paginate, round2, todayIso, type AppBindings, type AppVars } from "../lib/helpers";
import { requirePerm } from "../lib/auth";
import { cashByKind, postJournal, reverseJournal } from "../lib/ledger";
import { applyDate, applyEq, applyRange, applySearch, listParams, resolveDates } from "../lib/filters";

export const ledgerRoutes = new Hono<{ Bindings: AppBindings; Variables: AppVars }>();

ledgerRoutes.get("/accounts", requirePerm("ledger.view", "reports.view"), async (c) => {
  const p = listParams(new URL(c.req.url));
  const where = ["1=1"];
  const params: (string | number)[] = [];
  applyEq(where, params, "type", p.type);
  applySearch(where, params, p.q, ["code", "name_ar", "name_en"]);
  const { results } = await c.env.DB.prepare(`SELECT * FROM ledger_accounts WHERE ${where.join(" AND ")} ORDER BY code`).bind(...params).all();
  return c.json({ data: results });
});

ledgerRoutes.post("/accounts", requirePerm("ledger.manage"), async (c) => {
  const b = await c.req.json<{ code: string; name_ar: string; name_en?: string; type: string }>();
  if (!b.code || !b.name_ar || !b.type) return c.json({ error: "missing" }, 400);
  const r = await c.env.DB
    .prepare("INSERT INTO ledger_accounts (code, name_ar, name_en, type) VALUES (?, ?, ?, ?)")
    .bind(b.code, b.name_ar, b.name_en || b.name_ar, b.type)
    .run();
  return c.json({ id: r.meta.last_row_id }, 201);
});

ledgerRoutes.get("/cash", requirePerm("ledger.view", "payments.view"), async (c) => {
  const p = listParams(new URL(c.req.url));
  const where = ["1=1"];
  const params: (string | number)[] = [];
  applyEq(where, params, "c.kind", p.kind);
  applySearch(where, params, p.q, ["c.name", "IFNULL(c.name_en,'')", "IFNULL(c.account_number,'')", "a.code"]);
  const { results } = await c.env.DB
    .prepare(
      `SELECT c.*, a.code as account_code, a.name_ar as account_ar
       FROM cash_accounts c JOIN ledger_accounts a ON a.id = c.account_id
       WHERE ${where.join(" AND ")}
       ORDER BY c.kind, c.id`,
    )
    .bind(...params)
    .all();
  return c.json({ data: results });
});

ledgerRoutes.post("/cash", requirePerm("ledger.manage"), async (c) => {
  const b = await c.req.json<{ kind: string; name: string; name_en?: string; account_id: number; account_number?: string; opening_balance?: number }>();
  if (!b.name || !b.account_id) return c.json({ error: "missing" }, 400);
  const open = Number(b.opening_balance || 0);
  const r = await c.env.DB
    .prepare("INSERT INTO cash_accounts (kind, name, name_en, account_id, account_number, opening_balance, current_balance) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(b.kind || "cash", b.name, b.name_en || b.name, b.account_id, b.account_number || null, open, open)
    .run();
  return c.json({ id: r.meta.last_row_id }, 201);
});

ledgerRoutes.put("/cash/:id", requirePerm("ledger.manage"), async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json<{ name?: string; name_en?: string; account_number?: string; active?: number; notes?: string }>();
  const cur = await c.env.DB.prepare("SELECT * FROM cash_accounts WHERE id = ?").bind(id).first<Record<string, unknown>>();
  if (!cur) return c.json({ error: "not_found" }, 404);
  await c.env.DB
    .prepare("UPDATE cash_accounts SET name=?, name_en=?, account_number=?, active=?, notes=? WHERE id=?")
    .bind(b.name ?? cur.name, b.name_en ?? cur.name_en, b.account_number ?? cur.account_number, b.active === 0 ? 0 : 1, b.notes ?? cur.notes, id)
    .run();
  return c.json({ ok: true });
});

ledgerRoutes.delete("/cash/:id", requirePerm("ledger.manage"), async (c) => {
  const id = Number(c.req.param("id"));
  await c.env.DB.prepare("UPDATE cash_accounts SET active = 0 WHERE id = ?").bind(id).run();
  await audit(c.env.DB, c.get("user"), "delete_cash", "cash_account", id, "Deactivate cash account");
  return c.json({ ok: true });
});

ledgerRoutes.get("/journal", requirePerm("ledger.view"), async (c) => {
  const url = new URL(c.req.url);
  const p = listParams(url);
  const { page, pageSize, offset } = paginate(url);
  const where = ["1=1"];
  const params: (string | number)[] = [];
  applyEq(where, params, "j.source", p.source || p.reference_type);
  applyEq(where, params, "j.source_id", p.reference_number || p.source_id, true);
  applyEq(where, params, "j.created_by", p.created_by, true);
  applyEq(where, params, "j.status", p.status);
  applySearch(where, params, p.q, ["j.number", "IFNULL(j.description,'')", "j.source"]);
  applyDate(where, params, "j.date", p);
  applyRange(where, params, "(SELECT COALESCE(SUM(debit),0) FROM journal_lines l WHERE l.entry_id = j.id)", p.amount_min, p.amount_max);
  if (p.account_id) {
    where.push("EXISTS (SELECT 1 FROM journal_lines l WHERE l.entry_id = j.id AND l.account_id = ?)");
    params.push(Number(p.account_id));
  }
  if (p.dc === "debit") where.push("EXISTS (SELECT 1 FROM journal_lines l WHERE l.entry_id = j.id AND l.debit > 0)");
  if (p.dc === "credit") where.push("EXISTS (SELECT 1 FROM journal_lines l WHERE l.entry_id = j.id AND l.credit > 0)");
  const { results } = await c.env.DB
    .prepare(
      `SELECT j.*,
        (SELECT COALESCE(SUM(debit),0) FROM journal_lines l WHERE l.entry_id = j.id) as total
       FROM journal_entries j
       WHERE ${where.join(" AND ")}
       ORDER BY j.id DESC LIMIT ? OFFSET ?`,
    )
    .bind(...params, pageSize, offset)
    .all();
  return c.json({ data: results, page, pageSize });
});

ledgerRoutes.get("/journal/:id", requirePerm("ledger.view"), async (c) => {
  const id = Number(c.req.param("id"));
  const row = await c.env.DB.prepare("SELECT * FROM journal_entries WHERE id = ?").bind(id).first();
  if (!row) return c.json({ error: "not_found" }, 404);
  const { results } = await c.env.DB
    .prepare(
      `SELECT l.*, a.code, a.name_ar, a.name_en
       FROM journal_lines l JOIN ledger_accounts a ON a.id = l.account_id
       WHERE l.entry_id = ? ORDER BY l.id`,
    )
    .bind(id)
    .all();
  return c.json({ data: { ...row, lines: results } });
});

ledgerRoutes.post("/journal", requirePerm("ledger.manage"), async (c) => {
  const b = await c.req.json<{ date?: string; description?: string; lines: { account_id: number; debit?: number; credit?: number }[] }>();
  if (!b.lines?.length) return c.json({ error: "missing" }, 400);
  const id = await postJournal(c.env.DB, {
    date: b.date || todayIso(),
    description: b.description || "قيد يدوي",
    source: "manual",
    userId: c.get("user").id,
    lines: b.lines,
  });
  await audit(c.env.DB, c.get("user"), "journal", "journal", id, b.description || "");
  return c.json({ id }, 201);
});

ledgerRoutes.get("/trial", requirePerm("ledger.view", "reports.view"), async (c) => {
  const p = listParams(new URL(c.req.url));
  const { from, to } = resolveDates(p);
  const extra: string[] = [];
  const params: (string | number)[] = [];
  if (from) {
    extra.push("AND date(j.date) >= date(?)");
    params.push(from);
  }
  if (to) {
    extra.push("AND date(j.date) <= date(?)");
    params.push(to);
  }
  const search = ["1=1"];
  applySearch(search, params, p.q, ["a.code", "a.name_ar", "a.name_en"]);
  applyEq(search, params, "a.type", p.type);
  const { results } = await c.env.DB
    .prepare(
      `SELECT a.id, a.code, a.name_ar, a.name_en, a.type,
        COALESCE(SUM(l.debit),0) as debit, COALESCE(SUM(l.credit),0) as credit
       FROM ledger_accounts a
       LEFT JOIN journal_lines l ON l.account_id = a.id
       LEFT JOIN journal_entries j ON j.id = l.entry_id AND j.status = 'posted' ${extra.join(" ")}
       WHERE ${search.join(" AND ")}
       GROUP BY a.id ORDER BY a.code`,
    )
    .bind(...params)
    .all();
  return c.json({ data: results });
});

ledgerRoutes.get("/vouchers", requirePerm("ledger.view", "vouchers.create"), async (c) => {
  const url = new URL(c.req.url);
  const p = listParams(url);
  const { page, pageSize, offset } = paginate(url);
  const where = ["v.voided_at IS NULL"];
  const params: (string | number)[] = [];
  applyEq(where, params, "v.type", p.type);
  applyEq(where, params, "v.cash_account_id", p.cash_account_id, true);
  applyEq(where, params, "v.party_type", p.party_type);
  applyEq(where, params, "v.created_by", p.created_by, true);
  applyEq(where, params, "v.method", p.payment_method || p.method);
  applySearch(where, params, p.q, ["v.number", "IFNULL(v.party_name,'')", "IFNULL(v.description,'')"]);
  applyDate(where, params, "v.date", p);
  applyRange(where, params, "v.amount", p.amount_min, p.amount_max);
  const { results } = await c.env.DB
    .prepare(
      `SELECT v.*, c.name as cash_name, c.kind as cash_kind
       FROM vouchers v JOIN cash_accounts c ON c.id = v.cash_account_id
       WHERE ${where.join(" AND ")}
       ORDER BY v.id DESC LIMIT ? OFFSET ?`,
    )
    .bind(...params, pageSize, offset)
    .all();
  const sums = await c.env.DB
    .prepare(`SELECT COALESCE(SUM(v.amount),0) as total FROM vouchers v WHERE ${where.join(" AND ")}`)
    .bind(...params)
    .first<{ total: number }>();
  return c.json({ data: results, page, pageSize, totals: { total: sums?.total || 0 } });
});

ledgerRoutes.post("/vouchers", requirePerm("vouchers.create", "ledger.manage", "payments.create"), async (c) => {
  const b = await c.req.json<{
    type: "receipt" | "payment";
    date?: string;
    cash_account_id?: number;
    party_type?: string;
    party_id?: number;
    party_name?: string;
    amount: number;
    description?: string;
  }>();
  if (!b.type || !b.amount) return c.json({ error: "missing" }, 400);
  const cash = b.cash_account_id
    ? await c.env.DB.prepare("SELECT * FROM cash_accounts WHERE id = ?").bind(b.cash_account_id).first<{ id: number; account_id: number }>()
    : await cashByKind(c.env.DB, "cash");
  if (!cash) return c.json({ error: "cash_missing" }, 400);
  let partyName = b.party_name || null;
  if (b.party_type === "customer" && b.party_id) {
    const p = await c.env.DB.prepare("SELECT name FROM customers WHERE id = ?").bind(b.party_id).first<{ name: string }>();
    partyName = partyName || p?.name || null;
  }
  if (b.party_type === "supplier" && b.party_id) {
    const p = await c.env.DB.prepare("SELECT name FROM suppliers WHERE id = ?").bind(b.party_id).first<{ name: string }>();
    partyName = partyName || p?.name || null;
  }
  const ar = await c.env.DB.prepare("SELECT id FROM ledger_accounts WHERE code = '1200'").first<{ id: number }>();
  const ap = await c.env.DB.prepare("SELECT id FROM ledger_accounts WHERE code = '2100'").first<{ id: number }>();
  const other = await c.env.DB.prepare("SELECT id FROM ledger_accounts WHERE code = '4200'").first<{ id: number }>();
  const exp = await c.env.DB.prepare("SELECT id FROM ledger_accounts WHERE code = '5200'").first<{ id: number }>();
  const counterpart =
    b.type === "receipt"
      ? b.party_type === "customer"
        ? ar?.id
        : other?.id
      : b.party_type === "supplier"
        ? ap?.id
        : exp?.id;
  if (!counterpart) return c.json({ error: "account_missing" }, 400);
  const number = await nextNumber(c.env.DB, "voucher");
  const date = b.date || todayIso();
  const journalId = await postJournal(c.env.DB, {
    date,
    description: b.description || `${b.type === "receipt" ? "سند قبض" : "سند صرف"} ${partyName || ""}`,
    source: "voucher",
    userId: c.get("user").id,
    lines:
      b.type === "receipt"
        ? [
            { account_id: cash.account_id, debit: b.amount },
            { account_id: counterpart, credit: b.amount },
          ]
        : [
            { account_id: counterpart, debit: b.amount },
            { account_id: cash.account_id, credit: b.amount },
          ],
  });
  const r = await c.env.DB
    .prepare(
      `INSERT INTO vouchers (number, type, date, cash_account_id, party_type, party_id, party_name, amount, method, description, journal_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(number, b.type, date, cash.id, b.party_type || null, b.party_id || null, partyName, b.amount, b.type === "receipt" ? "in" : "out", b.description || null, journalId, c.get("user").id)
    .run();
  await c.env.DB.prepare("UPDATE journal_entries SET source_id = ? WHERE id = ?").bind(r.meta.last_row_id, journalId).run();
  if (b.party_type === "supplier" && b.party_id && b.type !== "receipt") {
    await c.env.DB.prepare("UPDATE suppliers SET balance = COALESCE(balance,0) - ? WHERE id = ?").bind(round2(b.amount), b.party_id).run();
  }
  if (b.party_type === "customer" && b.party_id && b.type === "receipt") {
    await c.env.DB.prepare("UPDATE customers SET current_balance = current_balance - ? WHERE id = ?").bind(round2(b.amount), b.party_id).run();
    await c.env.DB
      .prepare("INSERT INTO payments (invoice_id, customer_id, method, amount, date, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(null, b.party_id, "cash", round2(b.amount), date, b.description || number, c.get("user").id)
      .run();
  }
  await audit(c.env.DB, c.get("user"), "voucher", "voucher", r.meta.last_row_id, number);
  const custBal = b.party_type === "customer" && b.party_id
    ? await c.env.DB.prepare("SELECT current_balance FROM customers WHERE id = ?").bind(b.party_id).first<{ current_balance: number }>()
    : null;
  return c.json({ id: r.meta.last_row_id, number, journal_id: journalId, current_balance: custBal?.current_balance }, 201);
});

ledgerRoutes.post("/cash-transfer", requirePerm("ledger.manage", "vouchers.create"), async (c) => {
  const b = await c.req.json<{ from_id: number; to_id: number; amount: number; notes?: string; date?: string }>();
  const amount = round2(Number(b.amount || 0));
  if (!b.from_id || !b.to_id || amount <= 0 || b.from_id === b.to_id) return c.json({ error: "invalid_transfer" }, 400);
  const from = await c.env.DB.prepare("SELECT * FROM cash_accounts WHERE id = ? AND active = 1").bind(b.from_id).first<{ id: number; account_id: number; name: string }>();
  const to = await c.env.DB.prepare("SELECT * FROM cash_accounts WHERE id = ? AND active = 1").bind(b.to_id).first<{ id: number; account_id: number; name: string }>();
  if (!from || !to) return c.json({ error: "cash_missing" }, 400);
  const date = b.date || todayIso();
  const journalId = await postJournal(c.env.DB, {
    date,
    description: b.notes || `تحويل من ${from.name} إلى ${to.name}`,
    source: "cash_transfer",
    userId: c.get("user").id,
    lines: [
      { account_id: to.account_id, debit: amount },
      { account_id: from.account_id, credit: amount },
    ],
  });
  await audit(c.env.DB, c.get("user"), "cash_transfer", "cash", journalId, `${from.name} → ${to.name}`);
  return c.json({ id: journalId }, 201);
});

ledgerRoutes.post("/vouchers/:id/void", requirePerm("ledger.manage"), async (c) => {
  const id = Number(c.req.param("id"));
  const row = await c.env.DB.prepare("SELECT * FROM vouchers WHERE id = ?").bind(id).first<{
    voided_at: string | null;
    party_type: string | null;
    party_id: number | null;
    type: string;
    amount: number;
  }>();
  if (!row) return c.json({ error: "not_found" }, 404);
  if (row.voided_at) return c.json({ error: "already_void" }, 400);
  await reverseJournal(c.env.DB, "voucher", id, c.get("user").id);
  await c.env.DB.prepare("UPDATE vouchers SET voided_at = datetime('now') WHERE id = ?").bind(id).run();
  if (row.party_type === "customer" && row.party_id && row.type === "receipt") {
    await c.env.DB.prepare("UPDATE customers SET current_balance = current_balance + ? WHERE id = ?").bind(round2(row.amount), row.party_id).run();
  }
  if (row.party_type === "supplier" && row.party_id && row.type !== "receipt") {
    await c.env.DB.prepare("UPDATE suppliers SET balance = COALESCE(balance,0) + ? WHERE id = ?").bind(round2(row.amount), row.party_id).run();
  }
  return c.json({ ok: true });
});
