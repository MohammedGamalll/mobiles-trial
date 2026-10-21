import { Hono } from "hono";
import { audit, paginate, todayIso, type AppBindings, type AppVars } from "../lib/helpers";
import { requirePerm } from "../lib/auth";
import { postExpenseJournal, postOtherRevenueJournal, reverseJournal, tryLedger } from "../lib/ledger";
import { attachOpenShift } from "../lib/pos-shifts";
import { applyDate, applyEq, applyRange, applySearch, listParams, resolveDates, sqlText } from "../lib/filters";
import { loadProfitBreakdown } from "../lib/profit-breakdown";
import { ensureExpenseCategories } from "../lib/db";

export const financeRoutes = new Hono<{ Bindings: AppBindings; Variables: AppVars }>();

financeRoutes.get("/expenses", requirePerm("expenses.view"), async (c) => {
  const url = new URL(c.req.url);
  const p = listParams(url);
  const { page, pageSize, offset } = paginate(url);
  const where = ["e.voided_at IS NULL"];
  const params: (string | number)[] = [];
  applyDate(where, params, "e.date", p);
  applyEq(where, params, "e.category_id", p.category_id, true);
  applyEq(where, params, "e.user_id", p.created_by || p.user_id, true);
  applyEq(where, params, "e.cost_center", p.cost_center);
  applyEq(where, params, "e.recurring", p.recurring, true);
  applySearch(where, params, p.q, ["e.description", "ec.name_ar", "ec.name_en", "IFNULL(e.cost_center,'')"]);
  applyRange(where, params, "e.amount", p.amount_min, p.amount_max);
  const whereSql = where.join(" AND ");
  const count = await c.env.DB
    .prepare(`SELECT COUNT(*) as n FROM expenses e JOIN expense_categories ec ON ec.id = e.category_id LEFT JOIN users u ON u.id = e.user_id WHERE ${whereSql}`)
    .bind(...params)
    .first<{ n: number }>();
  const sums = await c.env.DB
    .prepare(`SELECT COALESCE(SUM(e.amount),0) as total FROM expenses e JOIN expense_categories ec ON ec.id = e.category_id WHERE ${whereSql}`)
    .bind(...params)
    .first<{ total: number }>();
  const { results } = await c.env.DB
    .prepare(
      `SELECT e.*, ec.name_ar as category_ar, ec.name_en as category_en, u.full_name as user_name
       FROM expenses e JOIN expense_categories ec ON ec.id = e.category_id
       LEFT JOIN users u ON u.id = e.user_id
       WHERE ${whereSql} ORDER BY e.date DESC, e.id DESC LIMIT ? OFFSET ?`,
    )
    .bind(...params, pageSize, offset)
    .all();
  return c.json({ data: results, total: count?.n || 0, page, pageSize, totals: { count: count?.n || 0, total: sums?.total || 0 } });
});

financeRoutes.get("/expense-categories", requirePerm("expenses.view", "settings.view"), async (c) => {
  await ensureExpenseCategories(c.env.DB);
  const { results } = await c.env.DB.prepare("SELECT * FROM expense_categories WHERE active = 1 ORDER BY id").all();
  return c.json({ data: results });
});

financeRoutes.post("/expenses", requirePerm("expenses.create"), async (c) => {
  const b = await c.req.json<{ category_id: number; amount: number; date?: string; description?: string; cost_center?: string; recurring?: number; recur_every_days?: number; cash_account_id?: number }>();
  const date = b.date || todayIso();
  const days = Number(b.recur_every_days || 0);
  const nextDue = b.recurring && days > 0 ? new Date(`${date}T12:00:00`) : null;
  if (nextDue) nextDue.setDate(nextDue.getDate() + days);
  const amount = Number(b.amount || 0);
  if (!(amount > 0) || !b.category_id) return c.json({ error: "missing_fields" }, 400);
  const category = await c.env.DB.prepare("SELECT id FROM expense_categories WHERE id = ? AND active = 1").bind(b.category_id).first<{ id: number }>();
  if (!category) return c.json({ error: "bad_category" }, 400);
  const shift = await attachOpenShift(c.env.DB, c.get("user").id);
  try {
    const id = await c.env.DB.transaction(async (tx) => {
      const r = await tx
        .prepare("INSERT INTO expenses (category_id, amount, date, description, user_id, cost_center, recurring, recur_every_days, next_due, cash_account_id, shift_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(b.category_id, amount, date, b.description || null, c.get("user").id, b.cost_center || null, b.recurring ? 1 : 0, days || null, nextDue ? nextDue.toISOString().slice(0, 10) : null, b.cash_account_id || null, shift?.id || null)
        .run();
      await postExpenseJournal(tx, {
        id: r.meta.last_row_id,
        amount,
        date,
        description: b.description,
        userId: c.get("user").id,
        cashAccountId: b.cash_account_id || null,
      });
      return r.meta.last_row_id;
    });
    await audit(c.env.DB, c.get("user"), "expense", "expense", id, `${amount}`);
    return c.json({ id }, 201);
  } catch (e) {
    const msg = (e as Error).message || "";
    if (msg === "ledger") return c.json({ error: "ledger" }, 400);
    if (/category_id|foreign key/i.test(msg)) return c.json({ error: "bad_category" }, 400);
    throw e;
  }
});

financeRoutes.post("/expenses/:id/void", requirePerm("expenses.void", "expenses.create"), async (c) => {
  const id = Number(c.req.param("id"));
  await c.env.DB.prepare("UPDATE expenses SET voided_at = datetime('now') WHERE id = ?").bind(id).run();
  await tryLedger(() => reverseJournal(c.env.DB, "expense", id, c.get("user").id));
  await audit(c.env.DB, c.get("user"), "expense", "expense", id, "void", { old_value: { voided: false }, new_value: { voided: true } });
  return c.json({ ok: true });
});

financeRoutes.get("/accounts", requirePerm("reports.view", "payments.view"), async (c) => {
  const url = new URL(c.req.url);
  const p = listParams(url);
  const range = resolveDates(p);
  const from = range.from || "2000-01-01";
  const to = range.to || "2099-12-31";
  const [sales, purchases, payments, credit, expenses, invoiceProfit, breakdown] = await Promise.all([
    c.env.DB.prepare(`SELECT COALESCE(SUM(total),0) as n FROM sales_invoices WHERE deleted_at IS NULL AND status NOT IN ('cancelled','draft') AND date BETWEEN ? AND ?`).bind(from, to).first<{ n: number }>(),
    c.env.DB.prepare(`SELECT COALESCE(SUM(total),0) as n FROM purchase_invoices WHERE deleted_at IS NULL AND status = 'approved' AND date BETWEEN ? AND ?`).bind(from, to).first<{ n: number }>(),
    c.env.DB.prepare(`SELECT COALESCE(SUM(amount),0) as n FROM payments WHERE voided_at IS NULL AND date BETWEEN ? AND ?`).bind(from, to).first<{ n: number }>(),
    c.env.DB.prepare(`SELECT COALESCE(SUM(remaining),0) as n FROM sales_invoices WHERE deleted_at IS NULL AND remaining > 0 AND status NOT IN ('cancelled')`).first<{ n: number }>(),
    c.env.DB.prepare(`SELECT COALESCE(SUM(amount),0) as n FROM expenses WHERE voided_at IS NULL AND date BETWEEN ? AND ?`).bind(from, to).first<{ n: number }>(),
    c.env.DB.prepare(`SELECT COALESCE(SUM(profit),0) as n FROM sales_invoices WHERE deleted_at IS NULL AND status NOT IN ('cancelled','draft','held','quote','order','pending_delivery','out_for_delivery','pending_settlement') AND date BETWEEN ? AND ?`).bind(from, to).first<{ n: number }>(),
    loadProfitBreakdown(c.env.DB, p),
  ]);
  const n = (row: { n: number } | null) => Number(row?.n || 0);
  return c.json({
    sales: n(sales),
    purchases: n(purchases),
    payments: n(payments),
    credit: n(credit),
    expenses: n(expenses),
    profit: breakdown.net_profit,
    invoice_profit: n(invoiceProfit),
    profit_breakdown: breakdown,
    from: breakdown.from,
    to: breakdown.to,
  });
});

financeRoutes.get("/payments", requirePerm("payments.view"), async (c) => {
  const url = new URL(c.req.url);
  const p = listParams(url);
  const { page, pageSize, offset } = paginate(url);
  const where = ["p.voided_at IS NULL"];
  const params: (string | number)[] = [];
  applySearch(where, params, p.q, ["IFNULL(si.number,'')", "IFNULL(c.name,'')", "IFNULL(c.phone,'')", sqlText("p.id")]);
  applyEq(where, params, "p.customer_id", p.customer_id, true);
  applyEq(where, params, "p.method", p.payment_method || p.method);
  applyEq(where, params, "p.created_by", p.created_by, true);
  applyEq(where, params, "p.invoice_id", p.invoice_id, true);
  applyDate(where, params, "p.date", p);
  applyRange(where, params, "p.amount", p.amount_min, p.amount_max);
  if (p.sales_agent_id) {
    where.push("si.sales_agent_id = ?");
    params.push(Number(p.sales_agent_id));
  }
  const whereSql = where.join(" AND ");
  const count = await c.env.DB
    .prepare(`SELECT COUNT(*) as n FROM payments p LEFT JOIN sales_invoices si ON si.id = p.invoice_id LEFT JOIN customers c ON c.id = p.customer_id WHERE ${whereSql}`)
    .bind(...params)
    .first<{ n: number }>();
  const sums = await c.env.DB
    .prepare(`SELECT COALESCE(SUM(p.amount),0) as total FROM payments p LEFT JOIN sales_invoices si ON si.id = p.invoice_id LEFT JOIN customers c ON c.id = p.customer_id WHERE ${whereSql}`)
    .bind(...params)
    .first<{ total: number }>();
  const { results } = await c.env.DB
    .prepare(
      `SELECT p.*, si.number as invoice_number, c.name as customer_name
       FROM payments p
       LEFT JOIN sales_invoices si ON si.id = p.invoice_id
       LEFT JOIN customers c ON c.id = p.customer_id
       WHERE ${whereSql}
       ORDER BY p.id DESC LIMIT ? OFFSET ?`,
    )
    .bind(...params, pageSize, offset)
    .all();
  return c.json({ data: results, total: count?.n || 0, page, pageSize, totals: { count: count?.n || 0, total: sums?.total || 0 } });
});

financeRoutes.delete("/payments/:id", requirePerm("payments.void", "payments.create"), async (c) => {
  const id = Number(c.req.param("id"));
  await c.env.DB.prepare("UPDATE payments SET voided_at = datetime('now') WHERE id = ?").bind(id).run();
  await audit(c.env.DB, c.get("user"), "void_payment", "payment", id, "void");
  return c.json({ ok: true });
});

financeRoutes.get("/revenue-categories", requirePerm("payments.create", "reports.view", "expenses.view"), async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM revenue_categories WHERE active = 1 ORDER BY id").all();
  return c.json({ data: results });
});

financeRoutes.get("/revenues", requirePerm("payments.create", "reports.view", "expenses.view"), async (c) => {
  const url = new URL(c.req.url);
  const p = listParams(url);
  const { page, pageSize, offset } = paginate(url);
  const where = ["r.voided_at IS NULL"];
  const params: (string | number)[] = [];
  applyDate(where, params, "r.date", p);
  applyEq(where, params, "r.cash_account_id", p.cash_account_id, true);
  applySearch(where, params, p.q, ["r.notes", "r.category", "IFNULL(rc.name_ar,'')", "IFNULL(rc.name_en,'')"]);
  const whereSql = where.join(" AND ");
  const count = await c.env.DB
    .prepare(`SELECT COUNT(*) as n FROM other_revenues r LEFT JOIN revenue_categories rc ON rc.id = r.category_id WHERE ${whereSql}`)
    .bind(...params)
    .first<{ n: number }>();
  const sums = await c.env.DB
    .prepare(`SELECT COALESCE(SUM(r.amount),0) as total FROM other_revenues r LEFT JOIN revenue_categories rc ON rc.id = r.category_id WHERE ${whereSql}`)
    .bind(...params)
    .first<{ total: number }>();
  const { results } = await c.env.DB
    .prepare(
      `SELECT r.*, rc.name_ar as category_ar, rc.name_en as category_en, c.name as cash_name
       FROM other_revenues r
       LEFT JOIN revenue_categories rc ON rc.id = r.category_id
       LEFT JOIN cash_accounts c ON c.id = r.cash_account_id
       WHERE ${whereSql}
       ORDER BY r.date DESC, r.id DESC LIMIT ? OFFSET ?`,
    )
    .bind(...params, pageSize, offset)
    .all();
  return c.json({ data: results, total: count?.n || 0, page, pageSize, totals: { count: count?.n || 0, total: sums?.total || 0 } });
});

financeRoutes.post("/revenues", requirePerm("payments.create"), async (c) => {
  const b = await c.req.json<{
    amount: number;
    cash_account_id: number;
    category_id?: number;
    category?: string;
    notes?: string;
    date?: string;
  }>();
  const amount = Number(b.amount || 0);
  const cashAccountId = Number(b.cash_account_id || 0);
  if (!(amount > 0) || !cashAccountId) return c.json({ error: "missing_fields" }, 400);
  const date = b.date || todayIso();
  const shift = await attachOpenShift(c.env.DB, c.get("user").id);
  let category = (b.category || "").trim();
  if (b.category_id) {
    const cat = await c.env.DB.prepare("SELECT name_ar FROM revenue_categories WHERE id = ?").bind(b.category_id).first<{ name_ar: string }>();
    category = category || cat?.name_ar || "";
  }
  try {
    const id = await c.env.DB.transaction(async (tx) => {
      const r = await tx
        .prepare(
          `INSERT INTO other_revenues (date, amount, cash_account_id, category_id, category, notes, shift_id, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(date, amount, cashAccountId, b.category_id || null, category || null, b.notes || null, shift?.id || null, c.get("user").id)
        .run();
      const journalId = await postOtherRevenueJournal(tx, {
        id: r.meta.last_row_id,
        amount,
        date,
        description: category ? `إيراد متنوع — ${category}` : b.notes || `إيراد متنوع #${r.meta.last_row_id}`,
        cashAccountId,
        userId: c.get("user").id,
      });
      if (journalId) {
        await tx.prepare("UPDATE other_revenues SET journal_id = ? WHERE id = ?").bind(journalId, r.meta.last_row_id).run();
      }
      return r.meta.last_row_id;
    });
    await audit(c.env.DB, c.get("user"), "other_revenue", "other_revenue", id, `${amount}`);
    return c.json({ id }, 201);
  } catch (e) {
    const msg = (e as Error).message || "";
    if (msg === "ledger" || msg === "unbalanced_journal") return c.json({ error: "ledger" }, 400);
    throw e;
  }
});

financeRoutes.post("/revenues/:id/void", requirePerm("payments.create"), async (c) => {
  const id = Number(c.req.param("id"));
  const row = await c.env.DB.prepare("SELECT id, voided_at FROM other_revenues WHERE id = ?").bind(id).first<{ id: number; voided_at: string | null }>();
  if (!row) return c.json({ error: "not_found" }, 404);
  if (row.voided_at) return c.json({ error: "already_cancelled" }, 400);
  await reverseJournal(c.env.DB, "other_revenue", id, c.get("user").id);
  await c.env.DB.prepare("UPDATE other_revenues SET voided_at = datetime('now') WHERE id = ?").bind(id).run();
  await audit(c.env.DB, c.get("user"), "void_other_revenue", "other_revenue", id, "void");
  return c.json({ ok: true });
});
