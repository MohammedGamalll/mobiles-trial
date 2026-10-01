import { Hono } from "hono";
import { audit, hashPassword, like, paginate, randomToken, type AppBindings, type AppVars } from "../lib/helpers";
import { requirePerm } from "../lib/auth";
import { applyEq, applyRange, applySearch, CUSTOMER_SORT, listParams, resolveDates, sortSql } from "../lib/filters";

export const peopleRoutes = new Hono<{ Bindings: AppBindings; Variables: AppVars }>();

peopleRoutes.get("/customers", requirePerm("customers.view", "sales.create"), async (c) => {
  const url = new URL(c.req.url);
  const p = listParams(url);
  const { page, pageSize, offset } = paginate(url);
  const where = ["deleted_at IS NULL"];
  const params: (string | number)[] = [];
  applySearch(where, params, p.q, ["name", "IFNULL(phone,'')", "IFNULL(whatsapp,'')", "IFNULL(area,'')", "IFNULL(city,'')", "CAST(id AS TEXT)"]);
  applyEq(where, params, "customer_type", p.customer_type || p.type);
  applyEq(where, params, "area", p.area);
  applyEq(where, params, "city", p.city);
  applyEq(where, params, "price_list_id", p.price_list_id, true);
  if (p.status === "active" || p.active === "1") applyEq(where, params, "active", "1", true);
  if (p.status === "inactive" || p.active === "0") applyEq(where, params, "active", "0", true);
  if (p.debt === "yes" || p.has_debt === "1") where.push("current_balance > 0");
  if (p.debt === "no" || p.no_debt === "1") where.push("current_balance <= 0");
  if (p.over_limit === "1") where.push("credit_limit > 0 AND current_balance > credit_limit");
  if (p.hide_zero === "1") where.push("current_balance != 0");
  if (p.account_kind) applyEq(where, params, "account_kind", p.account_kind);
  applyRange(where, params, "current_balance", p.balance_min, p.balance_max);
  if (p.has_activity === "1") {
    const { from, to } = resolveDates(p);
    const f = from || "2000-01-01";
    const t = to || "2099-12-31";
    where.push("id IN (SELECT customer_id FROM sales_invoices WHERE deleted_at IS NULL AND date BETWEEN ? AND ?)");
    params.push(f, t);
  }
  if (p.inactive_days) {
    const days = Number(p.inactive_days) || 30;
    where.push(`id NOT IN (SELECT customer_id FROM sales_invoices WHERE deleted_at IS NULL AND date >= DATE_SUB(CURDATE(), INTERVAL ? DAY))`);
    params.push(days);
  }
  const whereSql = where.join(" AND ");
  const count = await c.env.DB.prepare(`SELECT COUNT(*) as n FROM customers WHERE ${whereSql}`).bind(...params).first<{ n: number }>();
  const sums = await c.env.DB.prepare(`SELECT COALESCE(SUM(current_balance),0) as balance FROM customers WHERE ${whereSql}`).bind(...params).first<{ balance: number }>();
  const { results } = await c.env.DB
    .prepare(`SELECT * FROM customers WHERE ${whereSql} ${sortSql(p.sort, CUSTOMER_SORT, "id DESC")} LIMIT ? OFFSET ?`)
    .bind(...params, pageSize, offset)
    .all();
  return c.json({ data: results, total: count?.n || 0, page, pageSize, totals: { count: count?.n || 0, balance: sums?.balance || 0 } });
});

peopleRoutes.get("/customers/:id", requirePerm("customers.view", "sales.create"), async (c) => {
  const id = Number(c.req.param("id"));
  const row = await c.env.DB.prepare("SELECT * FROM customers WHERE id = ?").bind(id).first();
  if (!row) return c.json({ error: "not_found" }, 404);
  const invoices = await c.env.DB.prepare("SELECT * FROM sales_invoices WHERE customer_id = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 100").bind(id).all();
  const payments = await c.env.DB.prepare("SELECT * FROM payments WHERE customer_id = ? AND voided_at IS NULL ORDER BY id DESC LIMIT 100").bind(id).all();
  const returns = await c.env.DB.prepare("SELECT * FROM sales_returns WHERE customer_id = ? ORDER BY id DESC LIMIT 50").bind(id).all();
  const itemRows = await c.env.DB
    .prepare(
      `SELECT si.date, si.number, sii.product_name, sii.quantity, sii.unit_price, sii.total
       FROM sales_invoice_items sii JOIN sales_invoices si ON si.id = sii.invoice_id
       WHERE si.customer_id = ? AND si.deleted_at IS NULL AND si.status NOT IN ('cancelled','held','quote','order')
       ORDER BY si.id DESC LIMIT 200`,
    )
    .bind(id)
    .all();
  const overdue = await c.env.DB
    .prepare(
      `SELECT * FROM sales_invoices WHERE customer_id = ? AND deleted_at IS NULL AND remaining > 0
       AND status NOT IN ('cancelled','draft','held','quote','order') ORDER BY date`,
    )
    .bind(id)
    .all();
  return c.json({ data: { ...row, invoices: invoices.results, payments: payments.results, returns: returns.results, statement_items: itemRows.results, overdue: overdue.results } });
});

peopleRoutes.post("/customers", requirePerm("customers.create"), async (c) => {
  const b = await c.req.json<Record<string, unknown>>();
  if (!b.name) return c.json({ error: "missing_name" }, 400);
  const r = await c.env.DB
    .prepare(
      `INSERT INTO customers (name, phone, whatsapp, address, area, notes, customer_type, payment_terms, credit_limit, current_balance, email, national_id, company, tax_id, city, price_list_id, account_kind, discount_pct, sell_price)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(b.name, b.phone || null, b.whatsapp || b.phone || null, b.address || null, b.area || null, b.notes || null, b.customer_type || "retail", b.payment_terms || "cash", Number(b.credit_limit || 0), Number(b.current_balance || 0), b.email || null, b.national_id || null, b.company || null, b.tax_id || null, b.city || null, b.price_list_id || null, b.account_kind === "credit" ? "credit" : "debit", Number(b.discount_pct || 0), Number(b.sell_price || 0))
    .run();
  await audit(c.env.DB, c.get("user"), "create_customer", "customer", r.meta.last_row_id, String(b.name));
  return c.json({ id: r.meta.last_row_id }, 201);
});

peopleRoutes.put("/customers/:id", requirePerm("customers.edit"), async (c) => {
  const id = Number(c.req.param("id"));
  const prev = await c.env.DB.prepare("SELECT name, phone, credit_limit, customer_type, payment_terms, city FROM customers WHERE id = ?").bind(id).first<Record<string, unknown>>();
  const b = await c.req.json<Record<string, unknown>>();
  const user = c.get("user");
  const canCredit = user.role_slug === "admin" || user.permissions.includes("customers.credit");
  const credit = canCredit ? Number(b.credit_limit || 0) : Number(prev?.credit_limit || 0);
  await c.env.DB
    .prepare(
      `UPDATE customers SET name=?, phone=?, whatsapp=?, address=?, area=?, notes=?, customer_type=?, payment_terms=?, credit_limit=?, email=?, national_id=?, company=?, tax_id=?, city=?, price_list_id=?, account_kind=?, discount_pct=?, sell_price=?, updated_at=datetime('now') WHERE id=?`,
    )
    .bind(b.name, b.phone || null, b.whatsapp || null, b.address || null, b.area || null, b.notes || null, b.customer_type || "retail", b.payment_terms || "cash", credit, b.email || null, b.national_id || null, b.company || null, b.tax_id || null, b.city || null, b.price_list_id || null, b.account_kind === "credit" ? "credit" : "debit", Number(b.discount_pct || 0), Number(b.sell_price || 0), id)
    .run();
  await audit(c.env.DB, user, "edit_customer", "customer", id, String(b.name || id), {
    old_value: prev,
    new_value: { name: b.name, phone: b.phone, credit_limit: credit, customer_type: b.customer_type, payment_terms: b.payment_terms, city: b.city },
  });
  return c.json({ ok: true });
});

peopleRoutes.delete("/customers/:id", requirePerm("customers.edit"), async (c) => {
  const id = Number(c.req.param("id"));
  await c.env.DB.prepare("UPDATE customers SET deleted_at = datetime('now'), active = 0 WHERE id = ?").bind(id).run();
  await audit(c.env.DB, c.get("user"), "delete_customer", "customer", id, "Soft delete customer");
  return c.json({ ok: true });
});

peopleRoutes.get("/suppliers", requirePerm("suppliers.view", "purchases.view"), async (c) => {
  const url = new URL(c.req.url);
  const p = listParams(url);
  const { page, pageSize, offset } = paginate(url);
  const where = ["deleted_at IS NULL"];
  const params: (string | number)[] = [];
  applySearch(where, params, p.q, ["name", "IFNULL(phone,'')", "IFNULL(address,'')", "CAST(id AS TEXT)"]);
  applyEq(where, params, "id", p.supplier_id, true);
  applyEq(where, params, "active", p.status === "inactive" ? "0" : p.status === "active" ? "1" : p.active, true);
  if (p.dues === "yes") where.push("balance > 0");
  if (p.dues === "no") where.push("balance <= 0");
  applyRange(where, params, "balance", p.balance_min, p.balance_max);
  if (p.brand_id) {
    where.push("id IN (SELECT supplier_id FROM products WHERE deleted_at IS NULL AND brand_id = ?)");
    params.push(Number(p.brand_id));
  }
  if (p.product_id) {
    where.push("id IN (SELECT supplier_id FROM products WHERE deleted_at IS NULL AND id = ?)");
    params.push(Number(p.product_id));
  }
  const whereSql = where.join(" AND ");
  const count = await c.env.DB.prepare(`SELECT COUNT(*) as n FROM suppliers WHERE ${whereSql}`).bind(...params).first<{ n: number }>();
  const sums = await c.env.DB.prepare(`SELECT COALESCE(SUM(balance),0) as balance FROM suppliers WHERE ${whereSql}`).bind(...params).first<{ balance: number }>();
  const { results } = await c.env.DB
    .prepare(`SELECT * FROM suppliers WHERE ${whereSql} ORDER BY name LIMIT ? OFFSET ?`)
    .bind(...params, pageSize, offset)
    .all();
  return c.json({ data: results, total: count?.n || 0, page, pageSize, totals: { count: count?.n || 0, balance: sums?.balance || 0 } });
});

peopleRoutes.get("/suppliers/:id", requirePerm("suppliers.view", "purchases.view"), async (c) => {
  const id = Number(c.req.param("id"));
  const row = await c.env.DB.prepare("SELECT * FROM suppliers WHERE id = ?").bind(id).first();
  if (!row) return c.json({ error: "not_found" }, 404);
  const purchases = await c.env.DB
    .prepare("SELECT * FROM purchase_invoices WHERE supplier_id = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 50")
    .bind(id)
    .all();
  const prices = await c.env.DB
    .prepare(
      `SELECT spp.*, p.sku, p.name_ar, p.name_en FROM supplier_product_prices spp JOIN products p ON p.id = spp.product_id WHERE spp.supplier_id = ? ORDER BY p.name_ar`,
    )
    .bind(id)
    .all();
  return c.json({ data: { ...row, purchases: purchases.results, prices: prices.results } });
});

peopleRoutes.post("/suppliers", requirePerm("suppliers.manage"), async (c) => {
  const b = await c.req.json<Record<string, unknown>>();
  const r = await c.env.DB
    .prepare("INSERT INTO suppliers (name, phone, address, notes, email, tax_id, city, contact_name, phone2, payment_terms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(b.name, b.phone || null, b.address || null, b.notes || null, b.email || null, b.tax_id || null, b.city || null, b.contact_name || null, b.phone2 || null, b.payment_terms || null)
    .run();
  return c.json({ id: r.meta.last_row_id }, 201);
});

peopleRoutes.put("/suppliers/:id", requirePerm("suppliers.manage"), async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json<Record<string, unknown>>();
  await c.env.DB
    .prepare("UPDATE suppliers SET name=?, phone=?, address=?, notes=?, email=?, tax_id=?, city=?, contact_name=?, phone2=?, payment_terms=? WHERE id=?")
    .bind(b.name, b.phone || null, b.address || null, b.notes || null, b.email || null, b.tax_id || null, b.city || null, b.contact_name || null, b.phone2 || null, b.payment_terms || null, id)
    .run();
  return c.json({ ok: true });
});

peopleRoutes.delete("/suppliers/:id", requirePerm("suppliers.manage"), async (c) => {
  const id = Number(c.req.param("id"));
  await c.env.DB.prepare("UPDATE suppliers SET deleted_at = datetime('now'), active = 0 WHERE id = ?").bind(id).run();
  await audit(c.env.DB, c.get("user"), "delete_supplier", "supplier", id, "Soft delete supplier");
  return c.json({ ok: true });
});

peopleRoutes.get("/users", requirePerm("users.view"), async (c) => {
  const p = listParams(new URL(c.req.url));
  const where = ["u.deleted_at IS NULL"];
  const params: (string | number)[] = [];
  applySearch(where, params, p.q, ["u.username", "u.full_name", "IFNULL(u.phone,'')", "r.name_ar", "r.name_en"]);
  if (p.status === "active" || p.active === "1") applyEq(where, params, "u.active", "1", true);
  if (p.status === "inactive" || p.active === "0") applyEq(where, params, "u.active", "0", true);
  applyEq(where, params, "u.role_id", p.role_id, true);
  const { results } = await c.env.DB
    .prepare(
      `SELECT u.id, u.username, u.full_name, u.phone, u.active, u.role_id, u.delivery_agent_id, u.last_login_at, r.slug as role_slug, r.name_ar as role_name_ar, r.name_en as role_name_en
       FROM users u JOIN roles r ON r.id = u.role_id WHERE ${where.join(" AND ")} ORDER BY u.id`,
    )
    .bind(...params)
    .all();
  return c.json({ data: results });
});

peopleRoutes.post("/users", requirePerm("users.manage"), async (c) => {
  const b = await c.req.json<{ username: string; password: string; full_name: string; phone?: string; role_id: number; delivery_agent_id?: number }>();
  const salt = randomToken().slice(0, 8);
  const hash = await hashPassword(b.password || "1234", salt);
  const r = await c.env.DB
    .prepare("INSERT INTO users (username, password_hash, password_salt, full_name, phone, role_id, delivery_agent_id) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(b.username, hash, salt, b.full_name, b.phone || null, b.role_id, b.delivery_agent_id || null)
    .run();
  await audit(c.env.DB, c.get("user"), "create_user", "user", r.meta.last_row_id, b.username);
  return c.json({ id: r.meta.last_row_id }, 201);
});

peopleRoutes.put("/users/:id", requirePerm("users.manage"), async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json<Record<string, unknown>>();
  const prev = await c.env.DB.prepare("SELECT username, delivery_agent_id FROM users WHERE id = ? AND deleted_at IS NULL").bind(id).first<{ username: string; delivery_agent_id: number | null }>();
  if (!prev) return c.json({ error: "not_found" }, 404);
  const username = String(b.username || prev.username).trim();
  if (!username) return c.json({ error: "missing_username" }, 400);
  const taken = await c.env.DB.prepare("SELECT id FROM users WHERE username = ? AND id != ? AND deleted_at IS NULL").bind(username, id).first();
  if (taken) return c.json({ error: "username_taken" }, 409);
  const actor = c.get("user");
  const active = actor.id === id ? 1 : b.active === 0 ? 0 : 1;
  const agent = b.delivery_agent_id === undefined ? prev.delivery_agent_id : b.delivery_agent_id || null;
  await c.env.DB
    .prepare("UPDATE users SET username=?, full_name=?, phone=?, role_id=?, delivery_agent_id=?, active=?, updated_at=datetime('now') WHERE id=?")
    .bind(username, b.full_name, b.phone || null, b.role_id, agent, active, id)
    .run();
  if (b.password) {
    const salt = randomToken().slice(0, 8);
    const hash = await hashPassword(String(b.password), salt);
    await c.env.DB.prepare("UPDATE users SET password_hash=?, password_salt=? WHERE id=?").bind(hash, salt, id).run();
  }
  return c.json({ ok: true });
});

peopleRoutes.delete("/users/:id", requirePerm("users.manage"), async (c) => {
  const id = Number(c.req.param("id"));
  if (id === c.get("user").id) return c.json({ error: "cannot_delete_self" }, 400);
  await c.env.DB.prepare("UPDATE users SET deleted_at = datetime('now'), active = 0 WHERE id = ?").bind(id).run();
  await audit(c.env.DB, c.get("user"), "delete_user", "user", id, "Soft delete user");
  return c.json({ ok: true });
});

peopleRoutes.get("/roles", requirePerm("users.view", "settings.view"), async (c) => {
  const roles = await c.env.DB.prepare("SELECT * FROM roles").all();
  const perms = await c.env.DB.prepare("SELECT * FROM permissions ORDER BY module, code").all();
  const rp = await c.env.DB.prepare("SELECT * FROM role_permissions").all();
  return c.json({ roles: roles.results, permissions: perms.results, role_permissions: rp.results });
});

peopleRoutes.put("/roles/:id/permissions", requirePerm("users.manage"), async (c) => {
  const id = Number(c.req.param("id"));
  const prev = await c.env.DB.prepare("SELECT permission_id FROM role_permissions WHERE role_id = ?").bind(id).all<{ permission_id: number }>();
  const b = await c.req.json<{ permission_ids: number[] }>();
  await c.env.DB.prepare("DELETE FROM role_permissions WHERE role_id = ?").bind(id).run();
  if (b.permission_ids?.length) {
    await c.env.DB.batch(b.permission_ids.map((pid) => c.env.DB.prepare("INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)").bind(id, pid)));
  }
  await audit(c.env.DB, c.get("user"), "edit_permissions", "role", id, "Update role permissions", {
    old_value: (prev.results || []).map((r) => r.permission_id),
    new_value: b.permission_ids || [],
  });
  return c.json({ ok: true });
});
