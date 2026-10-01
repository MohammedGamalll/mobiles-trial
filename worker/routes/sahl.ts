import { Hono } from "hono";
import { like, paginate, todayIso, round2, audit, type AppBindings, type AppVars } from "../lib/helpers";
import { requirePerm } from "../lib/auth";
import { postCollectionJournal, tryLedger } from "../lib/ledger";
import { applyDate, applyEq, applyRange, applySearch, listParams } from "../lib/filters";

export const sahlRoutes = new Hono<{ Bindings: AppBindings; Variables: AppVars }>();

sahlRoutes.get("/serials", requirePerm("serials.manage", "inventory.view", "products.view"), async (c) => {
  const url = new URL(c.req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const productId = url.searchParams.get("product_id");
  const status = url.searchParams.get("status");
  const { page, pageSize, offset } = paginate(url);
  const where = ["1=1"];
  const params: (string | number)[] = [];
  if (q) {
    where.push("(s.serial LIKE ? OR p.sku LIKE ? OR p.name_ar LIKE ?)");
    const l = like(q);
    params.push(l, l, l);
  }
  if (productId) {
    where.push("s.product_id = ?");
    params.push(Number(productId));
  }
  if (status) {
    where.push("s.status = ?");
    params.push(status);
  }
  const { results } = await c.env.DB
    .prepare(
      `SELECT s.*, p.sku, p.name_ar, p.name_en FROM product_serials s
       JOIN products p ON p.id = s.product_id
       WHERE ${where.join(" AND ")} ORDER BY s.id DESC LIMIT ? OFFSET ?`,
    )
    .bind(...params, pageSize, offset)
    .all();
  return c.json({ data: results });
});

sahlRoutes.post("/serials", requirePerm("serials.manage", "purchases.create"), async (c) => {
  const b = await c.req.json<{ product_id: number; serials: string[]; purchase_id?: number; notes?: string }>();
  if (!b.product_id || !b.serials?.length) return c.json({ error: "missing_fields" }, 400);
  const added: string[] = [];
  for (const raw of b.serials) {
    const serial = String(raw || "").trim();
    if (!serial) continue;
    try {
      await c.env.DB
        .prepare("INSERT INTO product_serials (product_id, serial, status, purchase_id, notes) VALUES (?, ?, 'in_stock', ?, ?)")
        .bind(b.product_id, serial, b.purchase_id || null, b.notes || null)
        .run();
      added.push(serial);
    } catch {
      /* duplicate */
    }
  }
  if (!added.length) return c.json({ error: "duplicate_serial" }, 400);
  await c.env.DB.prepare("UPDATE products SET track_serial = 1 WHERE id = ?").bind(b.product_id).run();
  await audit(c.env.DB, c.get("user"), "serials", "product", b.product_id, `Add ${added.length} serials`);
  return c.json({ ok: true, added: added.length }, 201);
});

sahlRoutes.delete("/serials/:id", requirePerm("serials.manage"), async (c) => {
  const id = Number(c.req.param("id"));
  await c.env.DB.prepare("DELETE FROM product_serials WHERE id = ?").bind(id).run();
  await audit(c.env.DB, c.get("user"), "delete_serial", "serial", id, "Delete serial");
  return c.json({ ok: true });
});

sahlRoutes.get("/cheques", requirePerm("cheques.manage", "payments.view"), async (c) => {
  const p = listParams(new URL(c.req.url));
  const where = ["1=1"];
  const params: (string | number)[] = [];
  applyEq(where, params, "status", p.status);
  applyEq(where, params, "direction", p.direction);
  applySearch(where, params, p.q, ["number", "IFNULL(party_name,'')", "IFNULL(bank,'')"]);
  applyDate(where, params, "due_date", p);
  applyRange(where, params, "amount", p.amount_min, p.amount_max);
  const { results } = await c.env.DB.prepare(`SELECT * FROM cheques WHERE ${where.join(" AND ")} ORDER BY due_date, id DESC`).bind(...params).all();
  return c.json({ data: results });
});

sahlRoutes.post("/cheques", requirePerm("cheques.manage"), async (c) => {
  const b = await c.req.json<{
    number: string;
    direction?: string;
    party_type?: string;
    party_id?: number;
    party_name?: string;
    bank?: string;
    amount: number;
    due_date?: string;
    invoice_id?: number;
    notes?: string;
  }>();
  if (!b.number || !b.amount) return c.json({ error: "missing_fields" }, 400);
  const r = await c.env.DB
    .prepare(
      `INSERT INTO cheques (number, direction, party_type, party_id, party_name, bank, amount, due_date, invoice_id, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      b.number,
      b.direction === "out" ? "out" : "in",
      b.party_type === "supplier" ? "supplier" : "customer",
      b.party_id || null,
      b.party_name || null,
      b.bank || null,
      Number(b.amount),
      b.due_date || null,
      b.invoice_id || null,
      b.notes || null,
      c.get("user").id,
    )
    .run();
  await audit(c.env.DB, c.get("user"), "cheque", "cheque", r.meta.last_row_id, `${b.number} ${b.amount}`);
  return c.json({ id: r.meta.last_row_id }, 201);
});

sahlRoutes.delete("/cheques/:id", requirePerm("cheques.manage"), async (c) => {
  const id = Number(c.req.param("id"));
  await c.env.DB.prepare("DELETE FROM cheques WHERE id = ?").bind(id).run();
  await audit(c.env.DB, c.get("user"), "delete_cheque", "cheque", id, "Delete cheque");
  return c.json({ ok: true });
});

sahlRoutes.post("/cheques/:id/collect", requirePerm("cheques.manage", "payments.create"), async (c) => {
  const id = Number(c.req.param("id"));
  const ch = await c.env.DB.prepare("SELECT * FROM cheques WHERE id = ?").bind(id).first<{
    id: number;
    status: string;
    direction: string;
    amount: number;
    invoice_id: number | null;
    party_id: number | null;
    party_type: string;
    number: string;
  }>();
  if (!ch) return c.json({ error: "not_found" }, 404);
  if (ch.status !== "pending") return c.json({ error: "not_pending" }, 400);
  await c.env.DB.prepare("UPDATE cheques SET status='collected', collected_at=datetime('now') WHERE id=?").bind(id).run();
  if (ch.direction === "in" && ch.invoice_id) {
    const inv = await c.env.DB.prepare("SELECT remaining, paid, customer_id, number FROM sales_invoices WHERE id = ?").bind(ch.invoice_id).first<{
      remaining: number;
      paid: number;
      customer_id: number | null;
      number: string;
    }>();
    if (inv) {
      const amount = round2(Math.min(ch.amount, inv.remaining || ch.amount));
      await c.env.DB.batch([
        c.env.DB.prepare("INSERT INTO payments (invoice_id, customer_id, method, amount, date, notes, created_by) VALUES (?, ?, 'cheque', ?, ?, ?, ?)").bind(
          ch.invoice_id,
          inv.customer_id,
          amount,
          todayIso(),
          `Cheque ${ch.number}`,
          c.get("user").id,
        ),
        c.env.DB.prepare("UPDATE sales_invoices SET paid = ?, remaining = ? WHERE id = ?").bind(round2(inv.paid + amount), round2(Math.max(0, inv.remaining - amount)), ch.invoice_id),
      ]);
      if (inv.customer_id) {
        await c.env.DB.prepare("UPDATE customers SET current_balance = MAX(current_balance - ?, 0) WHERE id = ?").bind(amount, inv.customer_id).run();
      }
      const payRow = await c.env.DB.prepare("SELECT id FROM payments WHERE invoice_id = ? ORDER BY id DESC LIMIT 1").bind(ch.invoice_id).first<{ id: number }>();
      if (payRow) {
        await tryLedger(() =>
          postCollectionJournal(c.env.DB, { paymentId: payRow.id, invoiceNumber: inv.number, amount, method: "cheque", date: todayIso(), userId: c.get("user").id }),
        );
      }
    }
  }
  await audit(c.env.DB, c.get("user"), "cheque_collect", "cheque", id, ch.number);
  return c.json({ ok: true });
});

sahlRoutes.post("/cheques/:id/bounce", requirePerm("cheques.manage"), async (c) => {
  const id = Number(c.req.param("id"));
  await c.env.DB.prepare("UPDATE cheques SET status='bounced' WHERE id=? AND status='pending'").bind(id).run();
  await audit(c.env.DB, c.get("user"), "cheque_bounce", "cheque", id, "bounce");
  return c.json({ ok: true });
});

sahlRoutes.get("/installments", requirePerm("installments.manage", "sales.view"), async (c) => {
  const p = listParams(new URL(c.req.url));
  const where = ["1=1"];
  const params: (string | number)[] = [];
  applySearch(where, params, p.q, ["p.customer_name", "CAST(p.invoice_id AS TEXT)"]);
  applyEq(where, params, "p.customer_id", p.customer_id, true);
  applyEq(where, params, "p.status", p.status);
  applyDate(where, params, "p.start_date", p);
  const { results } = await c.env.DB
    .prepare(
      `SELECT p.*, (SELECT COUNT(*) FROM installment_dues d WHERE d.plan_id=p.id AND d.status!='paid') as open_dues
       FROM installment_plans p WHERE ${where.join(" AND ")} ORDER BY p.id DESC`,
    )
    .bind(...params)
    .all();
  return c.json({ data: results });
});

sahlRoutes.get("/installments/:id", requirePerm("installments.manage", "sales.view"), async (c) => {
  const id = Number(c.req.param("id"));
  const plan = await c.env.DB.prepare("SELECT * FROM installment_plans WHERE id = ?").bind(id).first();
  if (!plan) return c.json({ error: "not_found" }, 404);
  const dues = await c.env.DB.prepare("SELECT * FROM installment_dues WHERE plan_id = ? ORDER BY due_date, id").bind(id).all();
  return c.json({ data: { ...plan, dues: dues.results } });
});

sahlRoutes.post("/installments", requirePerm("installments.manage"), async (c) => {
  const b = await c.req.json<{ invoice_id: number; down_payment?: number; count: number; start_date?: string; interval_days?: number }>();
  const inv = await c.env.DB.prepare("SELECT id, number, customer_id, customer_name, total, remaining, paid FROM sales_invoices WHERE id = ? AND deleted_at IS NULL").bind(b.invoice_id).first<{
    id: number;
    number: string;
    customer_id: number | null;
    customer_name: string;
    total: number;
    remaining: number;
    paid: number;
  }>();
  if (!inv) return c.json({ error: "not_found" }, 404);
  const count = Math.max(1, Number(b.count || 1));
  const down = round2(Math.min(Number(b.down_payment || 0), inv.remaining));
  const rest = round2(inv.remaining - down);
  if (rest <= 0) return c.json({ error: "no_remaining" }, 400);
  const start = b.start_date || todayIso();
  const days = Number(b.interval_days || 30);
  const r = await c.env.DB
    .prepare(
      `INSERT INTO installment_plans (invoice_id, customer_id, customer_name, total, down_payment, count, start_date, interval_days, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(inv.id, inv.customer_id, inv.customer_name, rest, down, count, start, days, c.get("user").id)
    .run();
  const planId = r.meta.last_row_id;
  const each = round2(rest / count);
  let allocated = 0;
  for (let i = 0; i < count; i++) {
    const d = new Date(`${start}T12:00:00`);
    d.setDate(d.getDate() + days * i);
    const amount = i === count - 1 ? round2(rest - allocated) : each;
    allocated = round2(allocated + amount);
    await c.env.DB
      .prepare("INSERT INTO installment_dues (plan_id, due_date, amount) VALUES (?, ?, ?)")
      .bind(planId, d.toISOString().slice(0, 10), amount)
      .run();
  }
  if (down > 0) {
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO payments (invoice_id, customer_id, method, amount, date, notes, created_by) VALUES (?, ?, 'installment', ?, ?, 'down payment', ?)").bind(
        inv.id,
        inv.customer_id,
        down,
        todayIso(),
        c.get("user").id,
      ),
      c.env.DB.prepare("UPDATE sales_invoices SET paid = ?, remaining = ?, payment_method='installment' WHERE id = ?").bind(round2(inv.paid + down), rest, inv.id),
    ]);
    if (inv.customer_id) {
      await c.env.DB.prepare("UPDATE customers SET current_balance = MAX(current_balance - ?, 0) WHERE id = ?").bind(down, inv.customer_id).run();
    }
  } else {
    await c.env.DB.prepare("UPDATE sales_invoices SET payment_method='installment' WHERE id = ?").bind(inv.id).run();
  }
  await audit(c.env.DB, c.get("user"), "installment", "invoice", inv.id, `${count} dues`);
  return c.json({ id: planId }, 201);
});

sahlRoutes.delete("/installments/:id", requirePerm("installments.manage"), async (c) => {
  const id = Number(c.req.param("id"));
  await c.env.DB.prepare("DELETE FROM installment_dues WHERE plan_id = ?").bind(id).run();
  await c.env.DB.prepare("DELETE FROM installment_plans WHERE id = ?").bind(id).run();
  await audit(c.env.DB, c.get("user"), "delete_installment", "installment", id, "Delete installment plan");
  return c.json({ ok: true });
});

sahlRoutes.post("/installments/dues/:id/pay", requirePerm("installments.manage", "payments.create"), async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ amount?: number }>().catch(() => ({ amount: 0 }));
  const due = await c.env.DB
    .prepare(
      `SELECT d.*, p.invoice_id, p.id as plan_id FROM installment_dues d JOIN installment_plans p ON p.id = d.plan_id WHERE d.id = ?`,
    )
    .bind(id)
    .first<{ id: number; amount: number; paid_amount: number; status: string; invoice_id: number; plan_id: number }>();
  if (!due) return c.json({ error: "not_found" }, 404);
  const left = round2(due.amount - due.paid_amount);
  const amount = round2(Math.min(Number(body.amount || left), left));
  if (amount <= 0) return c.json({ error: "invalid_amount" }, 400);
  const inv = await c.env.DB.prepare("SELECT remaining, paid, customer_id, number FROM sales_invoices WHERE id = ?").bind(due.invoice_id).first<{
    remaining: number;
    paid: number;
    customer_id: number | null;
    number: string;
  }>();
  if (!inv) return c.json({ error: "invoice_missing" }, 400);
  const payAmt = round2(Math.min(amount, inv.remaining || amount));
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO payments (invoice_id, customer_id, method, amount, date, notes, created_by) VALUES (?, ?, 'installment', ?, ?, ?, ?)").bind(
      due.invoice_id,
      inv.customer_id,
      payAmt,
      todayIso(),
      `Installment ${id}`,
      c.get("user").id,
    ),
    c.env.DB.prepare("UPDATE sales_invoices SET paid = ?, remaining = ? WHERE id = ?").bind(round2(inv.paid + payAmt), round2(Math.max(0, inv.remaining - payAmt)), due.invoice_id),
  ]);
  if (inv.customer_id) {
    await c.env.DB.prepare("UPDATE customers SET current_balance = MAX(current_balance - ?, 0) WHERE id = ?").bind(payAmt, inv.customer_id).run();
  }
  const payRow = await c.env.DB.prepare("SELECT id FROM payments WHERE invoice_id = ? ORDER BY id DESC LIMIT 1").bind(due.invoice_id).first<{ id: number }>();
  const paidAmount = round2(due.paid_amount + payAmt);
  const status = paidAmount >= due.amount - 0.01 ? "paid" : "partial";
  await c.env.DB
    .prepare("UPDATE installment_dues SET paid_amount=?, status=?, paid_at=?, payment_id=? WHERE id=?")
    .bind(paidAmount, status, status === "paid" ? todayIso() : null, payRow?.id || null, id)
    .run();
  const open = await c.env.DB.prepare("SELECT COUNT(*) as n FROM installment_dues WHERE plan_id=? AND status!='paid'").bind(due.plan_id).first<{ n: number }>();
  if (!open?.n) await c.env.DB.prepare("UPDATE installment_plans SET status='completed' WHERE id=?").bind(due.plan_id).run();
  if (payRow) {
    await tryLedger(() =>
      postCollectionJournal(c.env.DB, { paymentId: payRow.id, invoiceNumber: inv.number, amount: payAmt, method: "installment", date: todayIso(), userId: c.get("user").id }),
    );
  }
  return c.json({ ok: true, paid: paidAmount, status });
});

sahlRoutes.post("/price-updates", requirePerm("prices.manage", "products.edit"), async (c) => {
  const b = await c.req.json<{ items: { id: number; selling_price?: number; wholesale_price?: number; min_selling_price?: number }[] }>();
  if (!b.items?.length) return c.json({ error: "no_items" }, 400);
  for (const it of b.items) {
    const sets: string[] = [];
    const params: (string | number)[] = [];
    if (it.selling_price != null) {
      sets.push("selling_price=?");
      params.push(Number(it.selling_price));
    }
    if (it.wholesale_price != null) {
      sets.push("wholesale_price=?");
      params.push(Number(it.wholesale_price));
    }
    if (it.min_selling_price != null) {
      sets.push("min_selling_price=?");
      params.push(Number(it.min_selling_price));
    }
    if (!sets.length) continue;
    sets.push("updated_at=datetime('now')");
    params.push(it.id);
    await c.env.DB.prepare(`UPDATE products SET ${sets.join(",")} WHERE id=?`).bind(...params).run();
  }
  await audit(c.env.DB, c.get("user"), "bulk_price", "product", null, `${b.items.length} products`);
  return c.json({ ok: true, count: b.items.length });
});
