import { Hono } from "hono";
import { audit, paginate, todayIso, type AppBindings, type AppVars } from "../lib/helpers";
import { requirePerm } from "../lib/auth";
import { postExpenseJournal, reverseJournal, tryLedger } from "../lib/ledger";
import { applyDate, applyEq, applyRange, applySearch, listParams, sqlText } from "../lib/filters";

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
  const { results } = await c.env.DB.prepare("SELECT * FROM expense_categories WHERE active = 1").all();
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
  try {
    const id = await c.env.DB.transaction(async (tx) => {
      const r = await tx
        .prepare("INSERT INTO expenses (category_id, amount, date, description, user_id, cost_center, recurring, recur_every_days, next_due, cash_account_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(b.category_id, amount, date, b.description || null, c.get("user").id, b.cost_center || null, b.recurring ? 1 : 0, days || null, nextDue ? nextDue.toISOString().slice(0, 10) : null, b.cash_account_id || null)
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
  const from = new URL(c.req.url).searchParams.get("from") || "2000-01-01";
  const to = new URL(c.req.url).searchParams.get("to") || "2099-12-31";
  const [sales, purchases, payments, credit, expenses, profit] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT COALESCE(SUM(total),0) as n FROM sales_invoices WHERE deleted_at IS NULL AND status NOT IN ('cancelled','draft') AND date BETWEEN ? AND ?`).bind(from, to),
    c.env.DB.prepare(`SELECT COALESCE(SUM(total),0) as n FROM purchase_invoices WHERE deleted_at IS NULL AND status = 'approved' AND date BETWEEN ? AND ?`).bind(from, to),
    c.env.DB.prepare(`SELECT COALESCE(SUM(amount),0) as n FROM payments WHERE voided_at IS NULL AND date BETWEEN ? AND ?`).bind(from, to),
    c.env.DB.prepare(`SELECT COALESCE(SUM(remaining),0) as n FROM sales_invoices WHERE deleted_at IS NULL AND remaining > 0 AND status NOT IN ('cancelled')`),
    c.env.DB.prepare(`SELECT COALESCE(SUM(amount),0) as n FROM expenses WHERE voided_at IS NULL AND date BETWEEN ? AND ?`).bind(from, to),
    c.env.DB.prepare(`SELECT COALESCE(SUM(profit),0) as n FROM sales_invoices WHERE deleted_at IS NULL AND status NOT IN ('cancelled','draft','pending_delivery','out_for_delivery') AND date BETWEEN ? AND ?`).bind(from, to),
  ]);
  const n = (r: { results: unknown[] }) => Number((r.results[0] as { n: number })?.n || 0);
  return c.json({
    sales: n(sales),
    purchases: n(purchases),
    payments: n(payments),
    credit: n(credit),
    expenses: n(expenses),
    profit: n(profit),
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
