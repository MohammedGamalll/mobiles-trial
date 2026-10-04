import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppBindings, AppVars } from "./lib/helpers";
import { like, todayIso } from "./lib/helpers";
import { addDays, applyProductScope, applySearch, listParams, numVal, resolveDates } from "./lib/filters";
import { numAgg, parkedInvoiceSql } from "./lib/pos-today";
import { requireAuth, requirePerm } from "./lib/auth";
import { authRoutes } from "./routes/auth";
import { catalogRoutes } from "./routes/catalog";
import { inventoryRoutes } from "./routes/inventory";
import { salesRoutes } from "./routes/sales";
import { deliveryRoutes } from "./routes/delivery";
import { peopleRoutes } from "./routes/people";
import { financeRoutes } from "./routes/finance";
import { reportRoutes } from "./routes/reports";
import { settingsRoutes } from "./routes/settings";
import { hrRoutes } from "./routes/hr";
import { stockOpsRoutes } from "./routes/stock-ops";
import { commerceRoutes } from "./routes/commerce";
import { repsRoutes } from "./routes/reps";
import { ledgerRoutes } from "./routes/ledger";
import { backupRoutes } from "./routes/backup";
import { approvalRoutes } from "./routes/approvals";
import { importRoutes } from "./routes/import";
import { sahlRoutes } from "./routes/sahl";
import { uploadRoutes, publicUploadRoutes } from "./routes/uploads";
import { withLocationLabels } from "./lib/location-label";

const app = new Hono<{ Bindings: AppBindings; Variables: AppVars }>();

app.use(async (c, next) => {
  const host = (c.req.header("x-forwarded-host") || c.req.header("host") || "").split(",")[0].trim();
  if (host.toLowerCase().startsWith("www.")) {
    const proto = (c.req.header("x-forwarded-proto") || "https").split(",")[0].trim() || "https";
    return c.redirect(`${proto}://${host.slice(4)}${c.req.path}${new URL(c.req.url).search}`, 301);
  }
  await next();
});

app.use(
  "/api/*",
  cors({
    origin: (origin) => origin || undefined,
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  }),
);

app.get("/api/health", (c) => c.json({ ok: true, name: "المتميز" }));
app.route("/uploads", publicUploadRoutes);

app.route("/api/auth", authRoutes);

app.use("/api/*", async (c, next) => {
  if (c.req.method === "OPTIONS") return next();
  if (c.req.path === "/api/auth/login" || c.req.path === "/api/auth/logout" || c.req.path === "/api/health") return next();
  return requireAuth(c, next);
});

app.get("/api/dashboard", requirePerm("dashboard.view"), async (c) => {
  const today = todayIso();
  const p = listParams(new URL(c.req.url));
  if (!p.period && !p.from && !p.to && !p.day && !p.month && !p.year && !p.week) p.period = "this_month";
  const range = resolveDates(p);
  const from = range.from || `${today.slice(0, 7)}-01`;
  const to = range.to || today;
  const prevLen = Math.max(1, Math.round((Date.parse(`${to}T12:00:00`) - Date.parse(`${from}T12:00:00`)) / 86400000) + 1);
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(prevLen - 1));
  const agentId = numVal(p.sales_agent_id || p.agent_id);
  const branchId = numVal(p.branch_id);
  const salesExtra: string[] = [];
  const salesBinds: (string | number)[] = [];
  if (agentId != null) {
    salesExtra.push("(sales_agent_id = ? OR delivery_agent_id = ?)");
    salesBinds.push(agentId, agentId);
  }
  if (branchId != null) {
    salesExtra.push("branch_id = ?");
    salesBinds.push(branchId);
  }
  await applyProductScope(c.env.DB, salesExtra, salesBinds, p, "id");
  const sx = salesExtra.length ? ` AND ${salesExtra.join(" AND ")}` : "";
  const db = c.env.DB;
  const live = parkedInvoiceSql();
  const q = {
    salesToday: db.prepare(`SELECT COALESCE(SUM(total),0) as n, COUNT(*) as c FROM sales_invoices WHERE deleted_at IS NULL AND ${live} AND DATE(date) = ?${sx}`).bind(today, ...salesBinds),
    creditToday: db.prepare(`SELECT COALESCE(SUM(remaining),0) as n FROM sales_invoices WHERE deleted_at IS NULL AND ${live} AND DATE(date) = ?${sx}`).bind(today, ...salesBinds),
    salesMonth: db.prepare(`SELECT COALESCE(SUM(total),0) as n, COUNT(*) as c FROM sales_invoices WHERE deleted_at IS NULL AND ${live} AND DATE(date) BETWEEN ? AND ?${sx}`).bind(from, to, ...salesBinds),
    salesPrev: db.prepare(`SELECT COALESCE(SUM(total),0) as n, COUNT(*) as c FROM sales_invoices WHERE deleted_at IS NULL AND ${live} AND DATE(date) BETWEEN ? AND ?${sx}`).bind(prevFrom, prevTo, ...salesBinds),
    profit: db.prepare(`SELECT COALESCE(SUM(profit),0) as n FROM sales_invoices WHERE deleted_at IS NULL AND ${live}${sx}`).bind(...salesBinds),
    profitMonth: db.prepare(`SELECT COALESCE(SUM(profit),0) as n FROM sales_invoices WHERE deleted_at IS NULL AND ${live} AND DATE(date) BETWEEN ? AND ?${sx}`).bind(from, to, ...salesBinds),
    profitPrev: db.prepare(`SELECT COALESCE(SUM(profit),0) as n FROM sales_invoices WHERE deleted_at IS NULL AND ${live} AND DATE(date) BETWEEN ? AND ?${sx}`).bind(prevFrom, prevTo, ...salesBinds),
    purchases: db.prepare(`SELECT COALESCE(SUM(total),0) as n FROM purchase_invoices WHERE deleted_at IS NULL AND status = 'approved' AND DATE(date) BETWEEN ? AND ?`).bind(from, to),
    purchasesPrev: db.prepare(`SELECT COALESCE(SUM(total),0) as n FROM purchase_invoices WHERE deleted_at IS NULL AND status = 'approved' AND DATE(date) BETWEEN ? AND ?`).bind(prevFrom, prevTo),
    stockValue: db.prepare(`SELECT COALESCE(SUM(remaining_qty * unit_cost),0) as n FROM inventory_batches`),
    debtors: db.prepare(`SELECT COALESCE(SUM(current_balance),0) as n FROM customers WHERE current_balance > 0`),
    pending: db.prepare(`SELECT COUNT(*) as n FROM sales_invoices WHERE type='delivery' AND delivery_status IN ('pending_delivery','out_for_delivery','rescheduled','customer_unavailable') AND deleted_at IS NULL`),
    completed: db.prepare(`SELECT COUNT(*) as n FROM sales_invoices WHERE type='delivery' AND delivery_status IN ('delivered','completed') AND deleted_at IS NULL`),
    returned: db.prepare(`SELECT COUNT(*) as n FROM sales_invoices WHERE delivery_status IN ('fully_returned','partially_returned','customer_refused','returned_to_warehouse') AND deleted_at IS NULL`),
    low: db.prepare(`SELECT id, sku, name_ar, name_en, current_stock, reserved_stock, min_stock FROM products WHERE deleted_at IS NULL AND COALESCE(kind,'product') != 'service' AND (current_stock - reserved_stock) > 0 AND (current_stock - reserved_stock) <= CASE WHEN COALESCE(reorder_point,0) > COALESCE(min_stock,0) THEN reorder_point ELSE min_stock END LIMIT 10`),
    out: db.prepare(`SELECT id, sku, name_ar, name_en, current_stock FROM products WHERE deleted_at IS NULL AND COALESCE(kind,'product') != 'service' AND (current_stock - reserved_stock) <= 0 LIMIT 10`),
    top: db.prepare(`SELECT sii.product_name, sii.sku, SUM(sii.quantity) as qty, SUM(sii.total) as total FROM sales_invoice_items sii JOIN sales_invoices si ON si.id = sii.invoice_id WHERE si.deleted_at IS NULL AND ${parkedInvoiceSql("si.status")} AND DATE(si.date) BETWEEN ? AND ?${sx.replaceAll("sales_agent_id", "si.sales_agent_id").replaceAll("delivery_agent_id", "si.delivery_agent_id").replaceAll("branch_id", "si.branch_id")} GROUP BY sii.product_id, sii.product_name, sii.sku ORDER BY qty DESC LIMIT 8`).bind(from, to, ...salesBinds),
    chart: db.prepare(`SELECT DATE(date) as d, COALESCE(SUM(total),0) as total, COALESCE(SUM(profit),0) as profit FROM sales_invoices WHERE deleted_at IS NULL AND ${live} AND DATE(date) BETWEEN ? AND ?${sx} GROUP BY DATE(date) ORDER BY DATE(date)`).bind(from, to, ...salesBinds),
    cash: db.prepare(`SELECT COALESCE(SUM(current_balance),0) as n FROM cash_accounts`),
    collectToday: db.prepare(`SELECT COALESCE(SUM(amount),0) as n FROM payments WHERE voided_at IS NULL AND DATE(date) = ?`).bind(today),
    expMonth: db.prepare(`SELECT COALESCE(SUM(amount),0) as n FROM expenses WHERE voided_at IS NULL AND DATE(date) BETWEEN ? AND ?`).bind(from, to),
    present: db.prepare(`SELECT COUNT(*) as n FROM attendance_sessions WHERE DATE(work_date) = ? AND status = 'open'`).bind(today),
    staff: db.prepare(`SELECT COUNT(*) as n FROM employees WHERE deleted_at IS NULL AND status = 'active'`),
    approvals: db.prepare(`SELECT (
      (SELECT COUNT(*) FROM purchase_invoices WHERE deleted_at IS NULL AND status IN ('submitted','draft')) +
      (SELECT COUNT(*) FROM stocktakes WHERE status = 'submitted') +
      (SELECT COUNT(*) FROM leave_requests WHERE status = 'pending')
    ) as n`),
    dead: db.prepare(`SELECT COUNT(*) as n FROM products p WHERE p.deleted_at IS NULL AND COALESCE(p.kind,'product') != 'service' AND (p.current_stock - p.reserved_stock) > 0 AND p.id NOT IN (SELECT sii.product_id FROM sales_invoice_items sii JOIN sales_invoices si ON si.id = sii.invoice_id WHERE si.deleted_at IS NULL AND ${parkedInvoiceSql("si.status")} AND si.date >= date('now','-90 days'))`),
    dueExp: db.prepare(`SELECT COUNT(*) as n FROM expenses WHERE voided_at IS NULL AND recurring = 1 AND next_due IS NOT NULL AND DATE(next_due) <= ?`).bind(today),
    creditors: db.prepare(`SELECT COALESCE(SUM(balance),0) as n FROM suppliers WHERE deleted_at IS NULL AND COALESCE(balance,0) > 0`),
    lowCount: db.prepare(`SELECT COUNT(*) as n FROM products WHERE deleted_at IS NULL AND COALESCE(kind,'product') != 'service' AND (current_stock - reserved_stock) > 0 AND (current_stock - reserved_stock) <= CASE WHEN COALESCE(reorder_point,0) > COALESCE(min_stock,0) THEN reorder_point ELSE min_stock END`),
    reps: db.prepare(`SELECT COUNT(*) as n FROM delivery_agents WHERE deleted_at IS NULL AND status = 'active'`),
  };
  const keys = Object.keys(q) as (keyof typeof q)[];
  const map: Record<string, unknown> = {};
  await Promise.all(
    keys.map(async (k) => {
      try {
        map[k] = (await q[k].all()).results;
      } catch {
        map[k] = [];
      }
    }),
  );
  const first = (k: string) => ((map[k] as { n?: unknown; c?: unknown }[]) || [])[0];
  return c.json({
    sales_today: numAgg(first("salesToday")?.n),
    invoices_today: numAgg(first("salesToday")?.c),
    credit_today: numAgg(first("creditToday")?.n),
    sales_month: numAgg(first("salesMonth")?.n),
    invoices_month: numAgg(first("salesMonth")?.c),
    prev_sales_month: numAgg(first("salesPrev")?.n),
    prev_invoices_month: numAgg(first("salesPrev")?.c),
    profit: numAgg(first("profit")?.n),
    profit_month: numAgg(first("profitMonth")?.n),
    prev_profit_month: numAgg(first("profitPrev")?.n),
    purchases: numAgg(first("purchases")?.n),
    prev_purchases: numAgg(first("purchasesPrev")?.n),
    stock_value: numAgg(first("stockValue")?.n),
    debtors: numAgg(first("debtors")?.n),
    pending_delivery: numAgg(first("pending")?.n),
    completed_delivery: numAgg(first("completed")?.n),
    returned_orders: numAgg(first("returned")?.n),
    low_stock: map.low,
    out_of_stock: map.out,
    top_products: map.top,
    chart: map.chart,
    cash_balance: numAgg(first("cash")?.n),
    collections_today: numAgg(first("collectToday")?.n),
    expenses_month: numAgg(first("expMonth")?.n),
    present_now: numAgg(first("present")?.n),
    staff_active: numAgg(first("staff")?.n),
    pending_approvals: numAgg(first("approvals")?.n),
    dead_stock: numAgg(first("dead")?.n),
    due_expenses: numAgg(first("dueExp")?.n),
    creditors: numAgg(first("creditors")?.n),
    low_count: numAgg(first("lowCount")?.n),
    reps_count: numAgg(first("reps")?.n),
    period: p.period || "this_month",
    period_from: from,
    period_to: to,
  });
});

app.get("/api/search", async (c) => {
  const q = (new URL(c.req.url).searchParams.get("q") || "").trim();
  if (!q) return c.json({ invoices: [], customers: [], products: [], purchases: [], agents: [], employees: [], suppliers: [], vouchers: [] });
  const l = like(q);
  const [invoices, customers, products, purchases, agents, employees, suppliers, vouchers] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT id, number, customer_name, total, status FROM sales_invoices WHERE deleted_at IS NULL AND (number LIKE ? OR customer_name LIKE ? OR IFNULL(customer_phone,'') LIKE ?) LIMIT 8").bind(l, l, l),
    c.env.DB.prepare("SELECT id, name, phone, area FROM customers WHERE deleted_at IS NULL AND (name LIKE ? OR IFNULL(phone,'') LIKE ? OR IFNULL(whatsapp,'') LIKE ?) LIMIT 8").bind(l, l, l),
    c.env.DB.prepare("SELECT id, sku, barcode, name_ar, name_en, selling_price FROM products WHERE deleted_at IS NULL AND (name_ar LIKE ? OR name_en LIKE ? OR sku LIKE ? OR barcode = ? OR IFNULL(part_number,'') LIKE ?) LIMIT 8").bind(l, l, l, q, l),
    c.env.DB.prepare("SELECT id, number, total, status FROM purchase_invoices WHERE deleted_at IS NULL AND number LIKE ? LIMIT 5").bind(l),
    c.env.DB.prepare("SELECT id, name, code, phone FROM delivery_agents WHERE deleted_at IS NULL AND (name LIKE ? OR code LIKE ? OR IFNULL(phone,'') LIKE ?) LIMIT 5").bind(l, l, l),
    c.env.DB.prepare("SELECT id, name, code, phone FROM employees WHERE name LIKE ? OR code LIKE ? OR IFNULL(phone,'') LIKE ? LIMIT 5").bind(l, l, l),
    c.env.DB.prepare("SELECT id, name, phone FROM suppliers WHERE deleted_at IS NULL AND (name LIKE ? OR IFNULL(phone,'') LIKE ?) LIMIT 5").bind(l, l),
    c.env.DB.prepare("SELECT id, number, type, amount FROM vouchers WHERE number LIKE ? LIMIT 5").bind(l),
  ]);
  return c.json({
    invoices: invoices.results,
    customers: customers.results,
    products: products.results,
    purchases: purchases.results,
    agents: agents.results,
    employees: employees.results,
    suppliers: suppliers.results,
    vouchers: vouchers.results,
  });
});

app.get("/api/notifications", async (c) => {
  const p = listParams(new URL(c.req.url));
  const where = ["1=1"];
  const params: (string | number)[] = [];
  if (p.type) {
    where.push("type = ?");
    params.push(p.type);
  }
  if (p.read === "1") where.push("read_at IS NOT NULL");
  if (p.read === "0" || p.unread === "1") where.push("read_at IS NULL");
  if (p.module || p.entity_type) {
    where.push("IFNULL(entity_type,'') = ?");
    params.push(p.module || p.entity_type);
  }
  applySearch(where, params, p.q, ["title_ar", "title_en", "body_ar", "body_en"]);
  const { from, to } = resolveDates(p);
  if (from) {
    where.push("date(created_at) >= date(?)");
    params.push(from);
  }
  if (to) {
    where.push("date(created_at) <= date(?)");
    params.push(to);
  }
  const { results } = await c.env.DB.prepare(`SELECT * FROM notifications WHERE ${where.join(" AND ")} ORDER BY id DESC LIMIT 80`).bind(...params).all();
  return c.json({ data: results });
});

app.post("/api/notifications/read", async (c) => {
  const b = await c.req.json<{ id?: number }>();
  if (b.id) await c.env.DB.prepare("UPDATE notifications SET read_at = datetime('now') WHERE id = ?").bind(b.id).run();
  else await c.env.DB.prepare("UPDATE notifications SET read_at = datetime('now') WHERE read_at IS NULL").run();
  return c.json({ ok: true });
});

app.get("/api/audit", requirePerm("audit.view"), async (c) => {
  const url = new URL(c.req.url);
  const p = listParams(url);
  const where = ["1=1"];
  const params: (string | number)[] = [];
  if (p.q) {
    where.push("(user_name LIKE ? OR action LIKE ? OR details LIKE ? OR IFNULL(entity_type,'') LIKE ?)");
    const l = like(p.q);
    params.push(l, l, l, l);
  }
  if (p.action) {
    where.push("action = ?");
    params.push(p.action);
  }
  if (p.entity || p.entity_type) {
    where.push("entity_type = ?");
    params.push(p.entity || p.entity_type);
  }
  if (p.entity_id) {
    where.push("entity_id = ?");
    params.push(Number(p.entity_id));
  }
  if (p.user_id) {
    where.push("user_id = ?");
    params.push(Number(p.user_id));
  }
  const { from, to } = resolveDates(p);
  if (from) {
    where.push("date(created_at) >= date(?)");
    params.push(from);
  }
  if (to) {
    where.push("date(created_at) <= date(?)");
    params.push(to);
  }
  const { results } = await c.env.DB
    .prepare(`SELECT * FROM audit_logs WHERE ${where.join(" AND ")} ORDER BY id DESC LIMIT 300`)
    .bind(...params)
    .all();
  return c.json({ data: results });
});

app.get("/api/lookups", async (c) => {
  const [brands, types, cats, models, locations, suppliers, methods, agents, lists, branches, cash] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT * FROM brands WHERE deleted_at IS NULL AND active = 1 ORDER BY name_en"),
    c.env.DB.prepare("SELECT * FROM part_types WHERE deleted_at IS NULL AND active = 1 ORDER BY name_en"),
    c.env.DB.prepare("SELECT * FROM categories WHERE deleted_at IS NULL AND active = 1 ORDER BY name_en"),
    c.env.DB.prepare("SELECT dm.*, b.name_en as brand_en FROM device_models dm JOIN brands b ON b.id = dm.brand_id WHERE dm.deleted_at IS NULL AND dm.active = 1 ORDER BY b.name_en, dm.name"),
    c.env.DB.prepare("SELECT * FROM storage_locations WHERE deleted_at IS NULL ORDER BY CASE WHEN kind = 'warehouse' THEN 0 ELSE 1 END, name ASC"),
    c.env.DB.prepare("SELECT * FROM suppliers WHERE deleted_at IS NULL AND active = 1 ORDER BY name"),
    c.env.DB.prepare("SELECT * FROM payment_methods WHERE active = 1 ORDER BY sort_order"),
    c.env.DB.prepare("SELECT * FROM delivery_agents WHERE deleted_at IS NULL AND status = 'active' ORDER BY code"),
    c.env.DB.prepare("SELECT * FROM price_lists WHERE active = 1 ORDER BY id"),
    c.env.DB.prepare("SELECT * FROM branches WHERE active = 1 ORDER BY id"),
    c.env.DB.prepare("SELECT id, kind, name, name_en, account_id, current_balance FROM cash_accounts WHERE active = 1 ORDER BY kind, id"),
  ]);
  return c.json({
    brands: brands.results,
    part_types: types.results,
    categories: cats.results,
    models: models.results,
    locations: withLocationLabels(locations.results || []).filter((l) => Number((l as { active?: number }).active) !== 0),
    suppliers: suppliers.results,
    payment_methods: methods.results,
    delivery_agents: agents.results,
    price_lists: lists.results,
    branches: branches.results,
    cash_accounts: cash.results,
  });
});

app.route("/api", catalogRoutes);
app.route("/api/inventory", inventoryRoutes);
app.route("/api/inventory", stockOpsRoutes);
app.route("/api", salesRoutes);
app.route("/api", commerceRoutes);
app.route("/api", repsRoutes);
app.route("/api/delivery", deliveryRoutes);
app.route("/api", peopleRoutes);
app.route("/api", financeRoutes);
app.route("/api/ledger", ledgerRoutes);
app.route("/api/reports", reportRoutes);
app.route("/api/settings", settingsRoutes);
app.route("/api/hr", hrRoutes);
app.route("/api/backup", backupRoutes);
app.route("/api/uploads", uploadRoutes);
app.route("/api/approvals", approvalRoutes);
app.route("/api/import", importRoutes);
app.route("/api", sahlRoutes);
app.get("/api/branches", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM branches WHERE active = 1 ORDER BY id").all();
  return c.json({ data: results });
});

app.notFound((c) => c.json({ error: "not_found" }, 404));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message || "server_error" }, 500);
});

export function createApiApp() {
  return app;
}
