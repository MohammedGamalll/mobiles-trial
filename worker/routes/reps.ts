import { Hono } from "hono";
import { audit, paginate, todayIso, type AppBindings, type AppVars } from "../lib/helpers";
import { requirePerm } from "../lib/auth";
import { applyDate, applyEq, applySearch, listParams } from "../lib/filters";
import { postCommissionJournal } from "../lib/ledger";

export const repsRoutes = new Hono<{ Bindings: AppBindings; Variables: AppVars }>();

function monthParam(url: URL) {
  return url.searchParams.get("month") || todayIso().slice(0, 7);
}

function agentScope(user: { role_slug: string; delivery_agent_id: number | null; permissions: string[] }) {
  if (user.role_slug === "admin" || user.permissions.includes("visits.manage") || user.permissions.includes("reps.manage")) return null;
  return user.delivery_agent_id;
}

repsRoutes.get("/reps", requirePerm("reps.view", "delivery.view"), async (c) => {
  const p = listParams(new URL(c.req.url));
  const month = p.month || todayIso().slice(0, 7);
  const where = ["a.deleted_at IS NULL"];
  const params: (string | number)[] = [];
  applySearch(where, params, p.q, ["a.code", "a.name", "IFNULL(a.phone,'')", "IFNULL(a.area,'')"]);
  applyEq(where, params, "a.status", p.status);
  applyEq(where, params, "a.area", p.area);
  applyEq(where, params, "a.role_type", p.role_type);
  const extra = where.length > 1 ? `AND ${where.slice(1).join(" AND ")}` : "";
  const { results } = await c.env.DB
    .prepare(
      `SELECT a.*,
        (SELECT target_amount FROM sales_targets t WHERE t.agent_id = a.id AND t.month = ? LIMIT 1) as target_amount,
        (SELECT target_visits FROM sales_targets t WHERE t.agent_id = a.id AND t.month = ? LIMIT 1) as target_visits,
        (SELECT COALESCE(SUM(si.total),0) FROM sales_invoices si
          WHERE si.deleted_at IS NULL AND si.status NOT IN ('cancelled','held','draft')
            AND si.date LIKE ? AND (si.sales_agent_id = a.id OR si.delivery_agent_id = a.id)) as sales_amount,
        (SELECT COUNT(*) FROM sales_visits v WHERE v.agent_id = a.id AND v.date LIKE ? AND v.result = 'done') as visits_done,
        (SELECT COUNT(*) FROM sales_visits v WHERE v.agent_id = a.id AND v.date LIKE ?) as visits_total,
        (SELECT COALESCE(SUM(amount),0) FROM sales_commissions c WHERE c.agent_id = a.id AND c.month = ?) as commission_amount,
        (SELECT COALESCE(SUM(pay.amount),0) FROM payments pay JOIN sales_invoices si ON si.id = pay.invoice_id
          WHERE pay.voided_at IS NULL AND si.date LIKE ? AND (si.sales_agent_id = a.id OR si.delivery_agent_id = a.id)) as collections_amount
       FROM delivery_agents a
       WHERE a.deleted_at IS NULL ${extra}
       ORDER BY a.code`,
    )
    .bind(month, month, `${month}%`, `${month}%`, `${month}%`, month, `${month}%`, ...params)
    .all();
  let rows = results || [];
  if (p.has_sales === "1") rows = rows.filter((r: any) => Number(r.sales_amount) > 0);
  if (p.has_collections === "1") rows = rows.filter((r: any) => Number(r.collections_amount) > 0);
  if (p.has_visits === "1") rows = rows.filter((r: any) => Number(r.visits_total) > 0);
  if (p.target_status === "hit") rows = rows.filter((r: any) => Number(r.target_amount) > 0 && Number(r.sales_amount) >= Number(r.target_amount));
  if (p.target_status === "miss") rows = rows.filter((r: any) => Number(r.target_amount) > 0 && Number(r.sales_amount) < Number(r.target_amount));
  return c.json({ data: rows, month });
});

repsRoutes.get("/reps/:id", requirePerm("reps.view", "delivery.view"), async (c) => {
  const id = Number(c.req.param("id"));
  const month = monthParam(new URL(c.req.url));
  const row = await c.env.DB.prepare("SELECT * FROM delivery_agents WHERE id = ? AND deleted_at IS NULL").bind(id).first();
  if (!row) return c.json({ error: "not_found" }, 404);
  const target = await c.env.DB.prepare("SELECT * FROM sales_targets WHERE agent_id = ? AND month = ?").bind(id, month).first();
  const visits = await c.env.DB.prepare("SELECT * FROM sales_visits WHERE agent_id = ? AND date LIKE ? ORDER BY date DESC, id DESC").bind(id, `${month}%`).all();
  const commissions = await c.env.DB
    .prepare(
      `SELECT c.*, si.number as invoice_number FROM sales_commissions c
       LEFT JOIN sales_invoices si ON si.id = c.invoice_id
       WHERE c.agent_id = ? AND c.month = ? ORDER BY c.id DESC`,
    )
    .bind(id, month)
    .all();
  const sales = await c.env.DB
    .prepare(
      `SELECT id, number, date, total, status, customer_name FROM sales_invoices
       WHERE deleted_at IS NULL AND (sales_agent_id = ? OR delivery_agent_id = ?) AND date LIKE ?
       ORDER BY id DESC LIMIT 50`,
    )
    .bind(id, id, `${month}%`)
    .all();
  return c.json({ data: { ...row, target, visits: visits.results, commissions: commissions.results, sales: sales.results }, month });
});

repsRoutes.put("/reps/:id", requirePerm("reps.manage", "settings.edit"), async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json<{
    name?: string;
    phone?: string;
    notes?: string;
    status?: string;
    role_type?: string;
    commission_rate?: number;
    area?: string;
  }>();
  const cur = await c.env.DB.prepare("SELECT * FROM delivery_agents WHERE id = ?").bind(id).first<Record<string, unknown>>();
  if (!cur) return c.json({ error: "not_found" }, 404);
  await c.env.DB
    .prepare("UPDATE delivery_agents SET name=?, phone=?, notes=?, status=?, role_type=?, commission_rate=?, area=? WHERE id=?")
    .bind(
      b.name ?? cur.name,
      b.phone ?? cur.phone,
      b.notes ?? cur.notes,
      b.status ?? cur.status,
      b.role_type ?? cur.role_type ?? "delivery",
      b.commission_rate ?? cur.commission_rate ?? 0,
      b.area ?? cur.area,
      id,
    )
    .run();
  await audit(c.env.DB, c.get("user"), "edit_rep", "delivery_agent", id, b.name || String(cur.name));
  return c.json({ ok: true });
});

repsRoutes.get("/targets", requirePerm("reps.view", "targets.manage"), async (c) => {
  const p = listParams(new URL(c.req.url));
  const month = p.month || todayIso().slice(0, 7);
  const where = ["t.month = ?"];
  const params: (string | number)[] = [month];
  applyEq(where, params, "t.agent_id", p.agent_id, true);
  applySearch(where, params, p.q, ["a.name", "a.code"]);
  const { results } = await c.env.DB
    .prepare(
      `SELECT t.*, a.name as agent_name, a.code as agent_code
       FROM sales_targets t JOIN delivery_agents a ON a.id = t.agent_id
       WHERE ${where.join(" AND ")} ORDER BY a.code`,
    )
    .bind(...params)
    .all();
  return c.json({ data: results, month });
});

repsRoutes.post("/targets", requirePerm("targets.manage"), async (c) => {
  const b = await c.req.json<{ agent_id: number; month?: string; target_amount: number; target_visits?: number; notes?: string }>();
  if (!b.agent_id) return c.json({ error: "missing" }, 400);
  const month = b.month || todayIso().slice(0, 7);
  await c.env.DB
    .prepare(
      `INSERT INTO sales_targets (agent_id, month, target_amount, target_visits, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(agent_id, month) DO UPDATE SET target_amount = excluded.target_amount, target_visits = excluded.target_visits, notes = excluded.notes`,
    )
    .bind(b.agent_id, month, b.target_amount || 0, b.target_visits || 0, b.notes || null, c.get("user").id)
    .run();
  return c.json({ ok: true }, 201);
});

repsRoutes.get("/visits", requirePerm("visits.own", "visits.manage", "reps.view"), async (c) => {
  const url = new URL(c.req.url);
  const p = listParams(url);
  const { page, pageSize, offset } = paginate(url);
  const user = c.get("user");
  const scoped = agentScope(user);
  const where = ["1=1"];
  const params: (string | number)[] = [];
  if (scoped) {
    where.push("v.agent_id = ?");
    params.push(scoped);
  } else {
    applyEq(where, params, "v.agent_id", p.agent_id || p.sales_agent_id, true);
  }
  applyEq(where, params, "v.result", p.result || p.status);
  applyEq(where, params, "v.customer_id", p.customer_id, true);
  applyEq(where, params, "a.area", p.area);
  applySearch(where, params, p.q, ["a.name", "a.code", "IFNULL(v.customer_name,'')", "IFNULL(c.phone,'')", "IFNULL(v.notes,'')"]);
  applyDate(where, params, "v.date", p);
  if (p.done === "1") where.push("v.result = 'done'");
  if (p.incomplete === "1") where.push("v.result != 'done'");
  if (p.with_order === "1") where.push("(v.purpose LIKE '%order%' OR v.result = 'order')");
  if (p.with_collection === "1") where.push("(v.purpose LIKE '%collect%' OR v.result = 'collected')");
  if (p.without_order === "1") where.push("(IFNULL(v.purpose,'') NOT LIKE '%order%' AND v.result != 'order')");
  if (p.without_collection === "1") where.push("(IFNULL(v.purpose,'') NOT LIKE '%collect%' AND v.result != 'collected')");
  const { results } = await c.env.DB
    .prepare(
      `SELECT v.*, a.name as agent_name, a.code as agent_code, c.phone as customer_phone
       FROM sales_visits v
       JOIN delivery_agents a ON a.id = v.agent_id
       LEFT JOIN customers c ON c.id = v.customer_id
       WHERE ${where.join(" AND ")}
       ORDER BY v.date DESC, v.id DESC LIMIT ? OFFSET ?`,
    )
    .bind(...params, pageSize, offset)
    .all();
  return c.json({ data: results, page, pageSize });
});

repsRoutes.post("/visits", requirePerm("visits.own", "visits.manage"), async (c) => {
  const user = c.get("user");
  const b = await c.req.json<{
    agent_id?: number;
    customer_id?: number;
    customer_name?: string;
    date?: string;
    visit_time?: string;
    purpose?: string;
    result?: string;
    notes?: string;
    lat?: number;
    lng?: number;
  }>();
  const agentId = user.delivery_agent_id && !user.permissions.includes("visits.manage") && user.role_slug !== "admin"
    ? user.delivery_agent_id
    : Number(b.agent_id || user.delivery_agent_id || 0);
  if (!agentId) return c.json({ error: "agent_required" }, 400);
  let customerName = b.customer_name || null;
  if (b.customer_id) {
    const cust = await c.env.DB.prepare("SELECT name FROM customers WHERE id = ?").bind(b.customer_id).first<{ name: string }>();
    customerName = customerName || cust?.name || null;
  }
  const ins = await c.env.DB
    .prepare(
      `INSERT INTO sales_visits (agent_id, customer_id, customer_name, date, visit_time, purpose, result, notes, lat, lng, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      agentId,
      b.customer_id || null,
      customerName,
      b.date || todayIso(),
      b.visit_time || null,
      b.purpose || null,
      b.result || "planned",
      b.notes || null,
      b.lat ?? null,
      b.lng ?? null,
      user.id,
    )
    .run();
  await audit(c.env.DB, user, "create_visit", "sales_visit", ins.meta.last_row_id, customerName || "");
  return c.json({ id: ins.meta.last_row_id }, 201);
});

repsRoutes.delete("/visits/:id", requirePerm("visits.own", "visits.manage"), async (c) => {
  const id = Number(c.req.param("id"));
  const row = await c.env.DB.prepare("SELECT agent_id FROM sales_visits WHERE id = ?").bind(id).first<{ agent_id: number }>();
  if (!row) return c.json({ error: "not_found" }, 404);
  const user = c.get("user");
  const scoped = agentScope(user);
  if (scoped && row.agent_id !== scoped) return c.json({ error: "forbidden" }, 403);
  await c.env.DB.prepare("DELETE FROM sales_visits WHERE id = ?").bind(id).run();
  await audit(c.env.DB, user, "delete_visit", "sales_visit", id, "");
  return c.json({ ok: true });
});

repsRoutes.delete("/targets/:id", requirePerm("targets.manage"), async (c) => {
  const id = Number(c.req.param("id"));
  await c.env.DB.prepare("DELETE FROM sales_targets WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

repsRoutes.put("/visits/:id", requirePerm("visits.own", "visits.manage"), async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json<{ result?: string; notes?: string; purpose?: string; visit_time?: string; lat?: number; lng?: number }>();
  const row = await c.env.DB.prepare("SELECT * FROM sales_visits WHERE id = ?").bind(id).first<{ agent_id: number }>();
  if (!row) return c.json({ error: "not_found" }, 404);
  const user = c.get("user");
  const scoped = agentScope(user);
  if (scoped && row.agent_id !== scoped) return c.json({ error: "forbidden" }, 403);
  await c.env.DB
    .prepare("UPDATE sales_visits SET result=COALESCE(?, result), notes=COALESCE(?, notes), purpose=COALESCE(?, purpose), visit_time=COALESCE(?, visit_time), lat=COALESCE(?, lat), lng=COALESCE(?, lng) WHERE id=?")
    .bind(b.result || null, b.notes || null, b.purpose || null, b.visit_time || null, b.lat ?? null, b.lng ?? null, id)
    .run();
  return c.json({ ok: true });
});

repsRoutes.get("/commissions/payout", requirePerm("reps.view", "hr.payroll"), async (c) => {
  const month = monthParam(new URL(c.req.url));
  const { results } = await c.env.DB
    .prepare(
      `SELECT a.id as agent_id, a.name as agent_name, a.code as agent_code,
        COALESCE((SELECT SUM(c.amount) FROM sales_commissions c WHERE c.agent_id = a.id AND c.month = ? AND c.status IN ('accrued','open')), 0) as accrued,
        COALESCE((SELECT SUM(c.amount) FROM sales_commissions c WHERE c.agent_id = a.id AND c.month = ? AND c.status = 'paid'), 0) as paid,
        COALESCE((SELECT SUM(COALESCE(sa.remaining, sa.amount)) FROM salary_advances sa
          JOIN employees e ON e.id = sa.employee_id
          WHERE e.delivery_agent_id = a.id AND e.deleted_at IS NULL AND sa.status = 'open'), 0) as open_advances
       FROM delivery_agents a
       WHERE a.deleted_at IS NULL
         AND (
           EXISTS (SELECT 1 FROM sales_commissions c WHERE c.agent_id = a.id AND c.month = ?)
           OR EXISTS (
             SELECT 1 FROM salary_advances sa JOIN employees e ON e.id = sa.employee_id
             WHERE e.delivery_agent_id = a.id AND e.deleted_at IS NULL AND sa.status = 'open'
           )
         )
       ORDER BY a.code`,
    )
    .bind(month, month, month)
    .all();
  const data = (results || []).map((r: any) => {
    const accrued = Number(r.accrued) || 0;
    const paid = Number(r.paid) || 0;
    const open_advances = Number(r.open_advances) || 0;
    return {
      ...r,
      accrued,
      paid,
      open_advances,
      net_due: Math.round((accrued - open_advances) * 100) / 100,
    };
  });
  return c.json({ data, month });
});

repsRoutes.post("/commissions/payout", requirePerm("targets.manage", "hr.payroll"), async (c) => {
  const b = await c.req.json<{ agent_id: number; month?: string; cash_account_id?: number }>();
  const month = b.month || todayIso().slice(0, 7);
  const agentId = Number(b.agent_id || 0);
  if (!agentId) return c.json({ error: "missing_fields" }, 400);
  const { results } = await c.env.DB
    .prepare("SELECT id, amount FROM sales_commissions WHERE agent_id = ? AND month = ? AND status IN ('accrued','open')")
    .bind(agentId, month)
    .all<{ id: number; amount: number }>();
  const rows = results || [];
  if (!rows.length) return c.json({ ok: true, paid: 0 });
  try {
    await c.env.DB.transaction(async (tx) => {
      for (const row of rows) {
        await tx.prepare("UPDATE sales_commissions SET status = 'paid' WHERE id = ? AND status != 'paid'").bind(row.id).run();
        await postCommissionJournal(tx, {
          id: row.id,
          amount: Number(row.amount),
          date: todayIso(),
          description: `صرف عمولة #${row.id}`,
          userId: c.get("user").id,
          cashAccountId: b.cash_account_id || null,
        });
      }
    });
    await audit(c.env.DB, c.get("user"), "pay_commission", "sales_commission", agentId, `Pay commissions ${month}`);
    return c.json({ ok: true, paid: rows.length });
  } catch (e) {
    const msg = (e as Error).message || "";
    if (msg === "ledger") return c.json({ error: "ledger" }, 400);
    throw e;
  }
});

repsRoutes.get("/commissions", requirePerm("reps.view", "hr.payroll"), async (c) => {
  const p = listParams(new URL(c.req.url));
  const month = p.month || todayIso().slice(0, 7);
  const where = ["c.month = ?"];
  const params: (string | number)[] = [month];
  applyEq(where, params, "c.agent_id", p.agent_id, true);
  applyEq(where, params, "c.status", p.status);
  applySearch(where, params, p.q, ["a.name", "a.code", "IFNULL(si.number,'')", "IFNULL(si.customer_name,'')"]);
  const { results } = await c.env.DB
    .prepare(
      `SELECT c.*, a.name as agent_name, a.code as agent_code, si.number as invoice_number, si.customer_name
       FROM sales_commissions c
       JOIN delivery_agents a ON a.id = c.agent_id
       LEFT JOIN sales_invoices si ON si.id = c.invoice_id
       WHERE ${where.join(" AND ")}
       ORDER BY c.id DESC`,
    )
    .bind(...params)
    .all();
  return c.json({ data: results, month });
});

repsRoutes.post("/commissions/:id/pay", requirePerm("targets.manage", "hr.payroll"), async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json<{ cash_account_id?: number }>().catch(() => ({}) as { cash_account_id?: number });
  const row = await c.env.DB
    .prepare("SELECT id, amount, status FROM sales_commissions WHERE id = ?")
    .bind(id)
    .first<{ id: number; amount: number; status: string }>();
  if (!row) return c.json({ error: "not_found" }, 404);
  if (row.status === "paid") return c.json({ ok: true });
  try {
    await c.env.DB.transaction(async (tx) => {
      await tx.prepare("UPDATE sales_commissions SET status = 'paid' WHERE id = ? AND status != 'paid'").bind(id).run();
      await postCommissionJournal(tx, {
        id,
        amount: Number(row.amount),
        date: todayIso(),
        description: `صرف عمولة #${id}`,
        userId: c.get("user").id,
        cashAccountId: b.cash_account_id || null,
      });
    });
    await audit(c.env.DB, c.get("user"), "pay_commission", "sales_commission", id, "Pay commission");
    return c.json({ ok: true });
  } catch (e) {
    const msg = (e as Error).message || "";
    if (msg === "ledger") return c.json({ error: "ledger" }, 400);
    throw e;
  }
});
