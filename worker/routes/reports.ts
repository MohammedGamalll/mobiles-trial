import { Hono } from "hono";
import { like, type AppBindings, type AppVars } from "../lib/helpers";
import { requirePerm } from "../lib/auth";
import { csvBody } from "../lib/csv";
import { reconcile } from "../lib/reconcile";
import { loadTrialBalance, splitClosingSides } from "../lib/trial-balance";
import { loadDailyMovement } from "../lib/daily-movement";
import { applyDate, applyEq, applyInvoiceListFilters, applyRange, applySearch, listParams, resolveDates, sqlText } from "../lib/filters";
import { listFilteredProducts } from "../lib/product-query";
import { productToImportCells, productsImportWorkbook } from "../lib/product-import";

function salesGroupSql(group: string) {
  if (group === "customer") {
    return `SELECT COALESCE(customer_name,'-') as label, COUNT(*) as invoices, SUM(total) as total, SUM(profit) as profit
           FROM sales_invoices WHERE deleted_at IS NULL AND status NOT IN ('cancelled','draft','held','quote','order') AND date BETWEEN ? AND ?
           GROUP BY customer_id, customer_name ORDER BY total DESC`;
  }
  if (group === "product") {
    return `SELECT sii.product_name as label, SUM(sii.quantity) as qty, SUM(sii.total) as total, SUM(sii.profit) as profit
           FROM sales_invoice_items sii JOIN sales_invoices si ON si.id = sii.invoice_id
           WHERE si.deleted_at IS NULL AND si.status NOT IN ('cancelled','draft','held','quote','order') AND si.date BETWEEN ? AND ?
           GROUP BY sii.product_id, sii.product_name ORDER BY total DESC`;
  }
  if (group === "brand") {
    return `SELECT b.name_ar as label, SUM(sii.quantity) as qty, SUM(sii.total) as total, SUM(sii.profit) as profit
           FROM sales_invoice_items sii
           JOIN sales_invoices si ON si.id = sii.invoice_id
           JOIN products p ON p.id = sii.product_id
           JOIN brands b ON b.id = p.brand_id
           WHERE si.deleted_at IS NULL AND si.status NOT IN ('cancelled','draft','held','quote','order') AND si.date BETWEEN ? AND ?
           GROUP BY b.id ORDER BY total DESC`;
  }
  if (group === "category") {
    return `SELECT c.name_ar as label, SUM(sii.quantity) as qty, SUM(sii.total) as total, SUM(sii.profit) as profit
           FROM sales_invoice_items sii
           JOIN sales_invoices si ON si.id = sii.invoice_id
           JOIN products p ON p.id = sii.product_id
           JOIN categories c ON c.id = p.category_id
           WHERE si.deleted_at IS NULL AND si.status NOT IN ('cancelled','draft','held','quote','order') AND si.date BETWEEN ? AND ?
           GROUP BY c.id ORDER BY total DESC`;
  }
  if (group === "method") {
    return `SELECT COALESCE(payment_method,'-') as label, COUNT(*) as invoices, SUM(total) as total, SUM(profit) as profit
           FROM sales_invoices WHERE deleted_at IS NULL AND status NOT IN ('cancelled','draft','held','quote','order') AND date BETWEEN ? AND ?
           GROUP BY payment_method ORDER BY total DESC`;
  }
  if (group === "warehouse") {
    return `SELECT COALESCE(sl.warehouse, sl.name, '-') as label, COUNT(DISTINCT si.id) as invoices, SUM(sii.total) as total, SUM(sii.profit) as profit
           FROM sales_invoice_items sii
           JOIN sales_invoices si ON si.id = sii.invoice_id
           JOIN products p ON p.id = sii.product_id
           LEFT JOIN storage_locations sl ON sl.id = p.location_id
           WHERE si.deleted_at IS NULL AND si.status NOT IN ('cancelled','draft','held','quote','order') AND si.date BETWEEN ? AND ?
           GROUP BY COALESCE(sl.warehouse, sl.name) ORDER BY total DESC`;
  }
  if (group === "agent") {
    return `SELECT COALESCE(da.name,'-') as label, COUNT(*) as invoices, SUM(si.total) as total, SUM(si.profit) as profit
           FROM sales_invoices si
           LEFT JOIN delivery_agents da ON da.id = COALESCE(si.sales_agent_id, si.delivery_agent_id)
           WHERE si.deleted_at IS NULL AND si.status NOT IN ('cancelled','draft','held','quote','order') AND si.date BETWEEN ? AND ?
           GROUP BY COALESCE(si.sales_agent_id, si.delivery_agent_id) ORDER BY total DESC`;
  }
  if (group === "hour") {
    return `SELECT strftime('%H', created_at) as label, COUNT(*) as invoices, SUM(total) as total, SUM(profit) as profit
           FROM sales_invoices WHERE deleted_at IS NULL AND status NOT IN ('cancelled','draft','held','quote','order') AND date BETWEEN ? AND ?
           GROUP BY strftime('%H', created_at) ORDER BY label`;
  }
  if (group === "week") {
    return `SELECT strftime('%w', date) as label, COUNT(*) as invoices, SUM(total) as total, SUM(profit) as profit
           FROM sales_invoices WHERE deleted_at IS NULL AND status NOT IN ('cancelled','draft','held','quote','order') AND date BETWEEN ? AND ?
           GROUP BY strftime('%w', date) ORDER BY label`;
  }
  return `SELECT date as label, COUNT(*) as invoices, SUM(total) as total, SUM(profit) as profit
           FROM sales_invoices WHERE deleted_at IS NULL AND status NOT IN ('cancelled','draft','held','quote','order') AND date BETWEEN ? AND ?
           GROUP BY date ORDER BY date`;
}

export const reportRoutes = new Hono<{ Bindings: AppBindings; Variables: AppVars }>();

reportRoutes.get("/sales", requirePerm("reports.view"), async (c) => {
  const url = new URL(c.req.url);
  const p = listParams(url);
  const range = resolveDates(p);
  const from = range.from || p.from || "2000-01-01";
  const to = range.to || p.to || "2099-12-31";
  const group = p.group || "date";
  const extra: string[] = [];
  const binds: (string | number)[] = [from, to];
  if (p.customer_id) {
    extra.push(" AND customer_id = ?");
    binds.push(Number(p.customer_id));
  }
  if (p.sales_agent_id || p.agent_id) {
    extra.push(" AND (sales_agent_id = ? OR delivery_agent_id = ?)");
    binds.push(Number(p.sales_agent_id || p.agent_id), Number(p.sales_agent_id || p.agent_id));
  }
  if (p.branch_id) {
    extra.push(" AND branch_id = ?");
    binds.push(Number(p.branch_id));
  }
  let sql = salesGroupSql(group);
  if (extra.length && !["product", "brand", "category", "warehouse"].includes(group)) {
    sql = sql.replace("AND date BETWEEN ? AND ?", `AND date BETWEEN ? AND ?${extra.join("")}`);
  }
  const { results } = await c.env.DB.prepare(sql).bind(...binds).all();
  const cash = await c.env.DB
    .prepare(`SELECT COALESCE(SUM(total),0) as n FROM sales_invoices WHERE deleted_at IS NULL AND payment_method != 'credit' AND status NOT IN ('cancelled','draft','held','quote','order') AND date BETWEEN ? AND ?${extra.join("")}`)
    .bind(...binds)
    .first<{ n: number }>();
  const credit = await c.env.DB
    .prepare(`SELECT COALESCE(SUM(total),0) as n FROM sales_invoices WHERE deleted_at IS NULL AND payment_method = 'credit' AND status NOT IN ('cancelled','draft','held','quote','order') AND date BETWEEN ? AND ?${extra.join("")}`)
    .bind(...binds)
    .first<{ n: number }>();
  const returned = await c.env.DB
    .prepare(`SELECT COALESCE(SUM(total),0) as n FROM sales_returns WHERE date BETWEEN ? AND ?`)
    .bind(from, to)
    .first<{ n: number }>();
  return c.json({ data: results, cash: cash?.n || 0, credit: credit?.n || 0, returned: returned?.n || 0, from, to });
});

reportRoutes.get("/profit", requirePerm("reports.view"), async (c) => {
  const p = listParams(new URL(c.req.url));
  const range = resolveDates(p);
  const from = range.from || p.from || "2000-01-01";
  const to = range.to || p.to || "2099-12-31";
  const { results } = await c.env.DB
    .prepare(
      `SELECT sii.product_name, sii.sku, si.number, si.date, sib.qty, sib.unit_cost as cost, sii.unit_price,
              (sii.unit_price - sib.unit_cost) as profit,
              CASE WHEN sii.unit_price > 0 THEN ROUND(((sii.unit_price - sib.unit_cost)/sii.unit_price)*100, 1) ELSE 0 END as margin
       FROM sales_item_batches sib
       JOIN sales_invoice_items sii ON sii.id = sib.invoice_item_id
       JOIN sales_invoices si ON si.id = sii.invoice_id
       WHERE si.deleted_at IS NULL AND si.status NOT IN ('cancelled','draft','held','quote','order') AND si.date BETWEEN ? AND ?
       ORDER BY si.date DESC, si.id DESC`,
    )
    .bind(from, to)
    .all();
  const total = await c.env.DB
    .prepare(
      `SELECT COALESCE(SUM(sib.qty * sib.unit_cost),0) as cost, COALESCE(SUM(sib.qty * sii.unit_price),0) as sales
       FROM sales_item_batches sib
       JOIN sales_invoice_items sii ON sii.id = sib.invoice_item_id
       JOIN sales_invoices si ON si.id = sii.invoice_id
       WHERE si.deleted_at IS NULL AND si.status NOT IN ('cancelled','draft','held','quote','order') AND si.date BETWEEN ? AND ?`,
    )
    .bind(from, to)
    .first<{ cost: number; sales: number }>();
  return c.json({ data: results, cost: total?.cost || 0, sales: total?.sales || 0, profit: (total?.sales || 0) - (total?.cost || 0) });
});

reportRoutes.get("/inventory", requirePerm("reports.view", "inventory.view"), async (c) => {
  const kind = new URL(c.req.url).searchParams.get("kind") || "current";
  if (kind === "low") {
    const { results } = await c.env.DB
      .prepare(`SELECT * FROM products WHERE deleted_at IS NULL AND COALESCE(kind,'product') != 'service' AND (current_stock - reserved_stock) > 0 AND (current_stock - reserved_stock) <= min_stock`)
      .all();
    return c.json({ data: results });
  }
  if (kind === "out") {
    const { results } = await c.env.DB
      .prepare(`SELECT * FROM products WHERE deleted_at IS NULL AND COALESCE(kind,'product') != 'service' AND (current_stock - reserved_stock) <= 0`)
      .all();
    return c.json({ data: results });
  }
  if (kind === "location") {
    const { results } = await c.env.DB
      .prepare(
        `SELECT p.id, p.sku, p.name_ar, p.name_en, p.current_stock, sl.name as location, sl.warehouse, sl.rack, sl.shelf, sl.drawer, sl.box
         FROM products p LEFT JOIN storage_locations sl ON sl.id = p.location_id WHERE p.deleted_at IS NULL AND COALESCE(p.kind,'product') != 'service' ORDER BY sl.name, p.name_ar`,
      )
      .all();
    return c.json({ data: results });
  }
  const { results } = await c.env.DB
    .prepare(
      `SELECT p.id, p.sku, p.name_ar, p.name_en, p.current_stock, p.reserved_stock, (p.current_stock - p.reserved_stock) as available,
              p.min_stock, p.selling_price, sl.name as location
       FROM products p LEFT JOIN storage_locations sl ON sl.id = p.location_id WHERE p.deleted_at IS NULL ORDER BY p.name_ar`,
    )
    .all();
  return c.json({ data: results });
});

reportRoutes.get("/aging", requirePerm("reports.view", "customers.view"), async (c) => {
  const { results } = await c.env.DB
    .prepare(
      `SELECT c.id, c.name, c.phone, c.current_balance as balance,
              CAST(COALESCE((
                SELECT MIN(DATEDIFF(CURDATE(), si.date))
                FROM sales_invoices si
                WHERE si.customer_id = c.id AND si.deleted_at IS NULL
                  AND si.remaining > 0 AND si.status NOT IN ('cancelled','draft','held','quote','order')
              ), 0) AS SIGNED) as days
       FROM customers c
       WHERE c.deleted_at IS NULL AND c.current_balance > 0
       ORDER BY c.current_balance DESC`,
    )
    .all<{ id: number; name: string; phone: string; balance: number; days: number }>();
  const buckets = { d0_30: 0, d31_60: 0, d61_90: 0, d90: 0 };
  const data = (results || []).map((r) => {
    const days = Number(r.days) || 0;
    const balance = Number(r.balance) || 0;
    const bucket = days <= 30 ? "d0_30" : days <= 60 ? "d31_60" : days <= 90 ? "d61_90" : "d90";
    buckets[bucket] += balance;
    return { ...r, days, balance, bucket };
  });
  return c.json({ data, buckets, total: data.reduce((s, r) => s + r.balance, 0) });
});

reportRoutes.get("/compare", requirePerm("reports.view"), async (c) => {
  const url = new URL(c.req.url);
  const from = url.searchParams.get("from") || "2000-01-01";
  const to = url.searchParams.get("to") || "2099-12-31";
  const span = await c.env.DB.prepare(`SELECT DATEDIFF(?, ?) + 1 as days`).bind(to, from).first<{ days: number }>();
  const days = Math.max(1, Number(span?.days) || 1);
  const prev = await c.env.DB
    .prepare(`SELECT DATE_SUB(?, INTERVAL ? DAY) as prev_from, DATE_SUB(?, INTERVAL 1 DAY) as prev_to`)
    .bind(from, days, from)
    .first<{ prev_from: string; prev_to: string }>();
  const prevFrom = prev?.prev_from || from;
  const prevTo = prev?.prev_to || from;
  const metric = async (a: string, b: string) => {
    const [sales, profit, invoices, purchases, expenses] = await c.env.DB.batch([
      c.env.DB.prepare(`SELECT COALESCE(SUM(total),0) as n FROM sales_invoices WHERE deleted_at IS NULL AND status NOT IN ('cancelled','draft','held','quote','order') AND date BETWEEN ? AND ?`).bind(a, b),
      c.env.DB.prepare(`SELECT COALESCE(SUM(profit),0) as n FROM sales_invoices WHERE deleted_at IS NULL AND status NOT IN ('cancelled','draft','held','quote','order') AND date BETWEEN ? AND ?`).bind(a, b),
      c.env.DB.prepare(`SELECT COUNT(*) as n FROM sales_invoices WHERE deleted_at IS NULL AND status NOT IN ('cancelled','draft','held','quote','order') AND date BETWEEN ? AND ?`).bind(a, b),
      c.env.DB.prepare(`SELECT COALESCE(SUM(total),0) as n FROM purchase_invoices WHERE deleted_at IS NULL AND status = 'approved' AND date BETWEEN ? AND ?`).bind(a, b),
      c.env.DB.prepare(`SELECT COALESCE(SUM(amount),0) as n FROM expenses WHERE voided_at IS NULL AND date BETWEEN ? AND ?`).bind(a, b),
    ]);
    const n = (r: { results: unknown[] }) => Number((r.results[0] as { n: number })?.n || 0);
    return { sales: n(sales), profit: n(profit), invoices: n(invoices), purchases: n(purchases), expenses: n(expenses) };
  };
  const current = await metric(from, to);
  const previous = await metric(prevFrom, prevTo);
  return c.json({ from, to, prev_from: prevFrom, prev_to: prevTo, days, current, previous });
});

reportRoutes.get("/daily", requirePerm("reports.view"), async (c) => {
  const p = listParams(new URL(c.req.url));
  const range = resolveDates(p);
  const date = p.date || range.to || range.from || new Date().toISOString().slice(0, 10);
  const [sales, purchases, payments, expenses, returns] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT COALESCE(SUM(total),0) as n, COUNT(*) as c FROM sales_invoices WHERE deleted_at IS NULL AND status NOT IN ('cancelled','draft','held','quote','order') AND date=?`).bind(date),
    c.env.DB.prepare(`SELECT COALESCE(SUM(total),0) as n, COUNT(*) as c FROM purchase_invoices WHERE deleted_at IS NULL AND status='approved' AND date=?`).bind(date),
    c.env.DB.prepare(`SELECT COALESCE(SUM(amount),0) as n, COUNT(*) as c FROM payments WHERE voided_at IS NULL AND date=?`).bind(date),
    c.env.DB.prepare(`SELECT COALESCE(SUM(amount),0) as n, COUNT(*) as c FROM expenses WHERE voided_at IS NULL AND date=?`).bind(date),
    c.env.DB.prepare(`SELECT COALESCE(SUM(total),0) as n, COUNT(*) as c FROM sales_returns WHERE date=?`).bind(date),
  ]);
  const first = (r: { results: unknown[] }) => (r.results[0] as { n: number; c: number }) || { n: 0, c: 0 };
  return c.json({
    date,
    sales: first(sales),
    purchases: first(purchases),
    payments: first(payments),
    expenses: first(expenses),
    returns: first(returns),
  });
});

reportRoutes.get("/expenses", requirePerm("reports.view", "expenses.view"), async (c) => {
  const url = new URL(c.req.url);
  const from = url.searchParams.get("from") || "2000-01-01";
  const to = url.searchParams.get("to") || "2099-12-31";
  const { results } = await c.env.DB
    .prepare(
      `SELECT ec.name_ar as label, COUNT(*) as invoices, SUM(e.amount) as total
       FROM expenses e JOIN expense_categories ec ON ec.id = e.category_id
       WHERE e.voided_at IS NULL AND e.date BETWEEN ? AND ?
       GROUP BY e.category_id ORDER BY total DESC`,
    )
    .bind(from, to)
    .all();
  return c.json({ data: results });
});

reportRoutes.get("/purchases", requirePerm("reports.view", "purchases.view"), async (c) => {
  const url = new URL(c.req.url);
  const from = url.searchParams.get("from") || "2000-01-01";
  const to = url.searchParams.get("to") || "2099-12-31";
  const group = url.searchParams.get("group") || "supplier";
  const sql =
    group === "product"
      ? `SELECT pii.product_id as id, pr.name_ar as label, SUM(pii.quantity) as qty, SUM(pii.total) as total
         FROM purchase_invoice_items pii JOIN purchase_invoices pi ON pi.id = pii.purchase_id
         JOIN products pr ON pr.id = pii.product_id
         WHERE pi.deleted_at IS NULL AND pi.status='approved' AND pi.date BETWEEN ? AND ?
         GROUP BY pii.product_id ORDER BY total DESC`
      : `SELECT COALESCE(s.name,'-') as label, COUNT(*) as invoices, SUM(pi.total) as total
         FROM purchase_invoices pi LEFT JOIN suppliers s ON s.id = pi.supplier_id
         WHERE pi.deleted_at IS NULL AND pi.status='approved' AND pi.date BETWEEN ? AND ?
         GROUP BY pi.supplier_id ORDER BY total DESC`;
  const { results } = await c.env.DB.prepare(sql).bind(from, to).all();
  return c.json({ data: results });
});

reportRoutes.get("/stock-asof", requirePerm("reports.view", "inventory.view"), async (c) => {
  const p = listParams(new URL(c.req.url));
  const range = resolveDates(p);
  const asOf = p.as_of || range.to || new Date().toISOString().slice(0, 10);
  const { results } = await c.env.DB
    .prepare(
      `SELECT p.id, p.sku, p.name_ar, p.name_en,
              COALESCE(SUM(CASE
                WHEN sm.type IN ('purchase_in','in','return','return_in','transfer_in') THEN sm.qty
                WHEN sm.type IN ('out','sale_out','reserve','transfer_out') THEN -sm.qty
                ELSE sm.qty END), 0) as qty,
              COALESCE(SUM(CASE
                WHEN sm.type IN ('purchase_in','in','return','return_in','transfer_in') THEN sm.qty * COALESCE(sm.unit_cost,0)
                WHEN sm.type IN ('out','sale_out','reserve','transfer_out') THEN -sm.qty * COALESCE(sm.unit_cost,0)
                ELSE sm.qty * COALESCE(sm.unit_cost,0) END), 0) as value
       FROM products p
       LEFT JOIN stock_movements sm ON sm.product_id = p.id AND date(sm.created_at) <= ?
       WHERE p.deleted_at IS NULL AND COALESCE(p.kind,'product') != 'service'
       GROUP BY p.id
       HAVING qty != 0
       ORDER BY p.name_ar`,
    )
    .bind(asOf)
    .all();
  const value = (results || []).reduce((s, r: any) => s + Number(r.value || 0), 0);
  return c.json({ data: results, as_of: asOf, value });
});

reportRoutes.get("/expiry", requirePerm("reports.view", "inventory.view"), async (c) => {
  const days = Number(new URL(c.req.url).searchParams.get("days") || 30);
  const { results } = await c.env.DB
    .prepare(
      `SELECT p.id, p.sku, p.name_ar, p.name_en, ib.batch_code, ib.expiry_date, ib.remaining_qty, ib.unit_cost, sl.name as location_name
       FROM inventory_batches ib
       JOIN products p ON p.id = ib.product_id
       LEFT JOIN storage_locations sl ON sl.id = p.location_id
       WHERE p.deleted_at IS NULL AND ib.remaining_qty > 0 AND ib.expiry_date IS NOT NULL
         AND DATE(ib.expiry_date) <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
       ORDER BY ib.expiry_date, p.name_ar`,
    )
    .bind(Math.max(1, days))
    .all();
  return c.json({ data: results || [], days });
});

reportRoutes.get("/trial-balance", requirePerm("reports.view", "ledger.view"), async (c) => {
  const data = await loadTrialBalance(c.env.DB, listParams(new URL(c.req.url)));
  return c.json(data);
});

reportRoutes.get("/daily-movement", requirePerm("reports.view"), async (c) => {
  const user = c.get("user");
  const hideCost = user.role_slug !== "admin" && !user.permissions.includes("costs.view");
  const data = await loadDailyMovement(c.env.DB, listParams(new URL(c.req.url)), { hideCost });
  return c.json(data);
});

reportRoutes.get("/export", requirePerm("reports.view", "sales.view", "products.view", "customers.view", "inventory.view", "expenses.view", "ledger.view"), async (c) => {
  const url = new URL(c.req.url);
  const kind = url.searchParams.get("kind") || "invoices";
  const p = listParams(url);
  const range = resolveDates(p);
  const from = range.from || p.from || "2000-01-01";
  const to = range.to || p.to || "2099-12-31";
  const q = (p.q || "").trim();
  const status = p.status || "";
  const group = url.searchParams.get("group") || "date";
  const like = q ? `%${q.replace(/[%_]/g, "")}%` : "%";
  const user = c.get("user");
  const allow = (...codes: string[]) => user.role_slug === "admin" || codes.some((code) => user.permissions.includes(code));
  const need: Record<string, string[]> = {
    invoices: ["sales.view", "reports.view"],
    products: ["products.view", "inventory.view"],
    customers: ["customers.view", "reports.view"],
    inventory: ["inventory.view", "reports.view"],
    expenses: ["expenses.view", "reports.view"],
    payments: ["payments.view", "reports.view"],
    purchases: ["purchases.view", "reports.view"],
    sales: ["reports.view"],
    aging: ["reports.view", "customers.view"],
    profit: ["reports.view"],
    "trial-balance": ["reports.view", "ledger.view"],
    "daily-movement": ["reports.view"],
  };
  if (need[kind] && !allow(...need[kind])) return c.json({ error: "forbidden" }, 403);
  let headers: string[] = [];
  let rows: unknown[][] = [];
  let filename = kind;
  if (kind === "invoices") {
    const where = ["si.deleted_at IS NULL"];
    const params: (string | number)[] = [];
    await applyInvoiceListFilters(c.env.DB, where, params, p, user);
    const { results } = await c.env.DB
      .prepare(
        `SELECT si.number, si.date, si.customer_name, si.type, si.status, si.payment_method, si.total, si.paid, si.remaining, si.profit
         FROM sales_invoices si WHERE ${where.join(" AND ")} ORDER BY si.id DESC LIMIT 3000`,
      )
      .bind(...params)
      .all<Record<string, unknown>>();
    headers = ["number", "date", "customer", "type", "status", "method", "total", "paid", "remaining", "profit"];
    rows = (results || []).map((r) => [r.number, r.date, r.customer_name, r.type, r.status, r.payment_method, r.total, r.paid, r.remaining, r.profit]);
  } else if (kind === "products") {
    const products = await listFilteredProducts(c.env.DB, url, 8000);
    const hideCost = user.role_slug !== "admin" && !user.permissions.includes("costs.view") && !user.permissions.includes("products.edit");
    const xlsx = productsImportWorkbook(products.map((r) => productToImportCells(r, hideCost)));
    return c.body(new Uint8Array(xlsx), 200, {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="products.xlsx"`,
    });
  } else if (kind === "customers") {
    const { results } = await c.env.DB
      .prepare(
        `SELECT name, phone, city, area, customer_type, current_balance, credit_limit
         FROM customers WHERE deleted_at IS NULL AND (name LIKE ? OR IFNULL(phone,'') LIKE ?)
         ORDER BY name LIMIT 3000`,
      )
      .bind(like, like)
      .all<Record<string, unknown>>();
    headers = ["name", "phone", "city", "area", "type", "balance", "credit_limit"];
    rows = (results || []).map((r) => [r.name, r.phone, r.city, r.area, r.customer_type, r.current_balance, r.credit_limit]);
  } else if (kind === "inventory") {
    const exportUrl = new URL(url);
    exportUrl.searchParams.set("kind", "product");
    const products = await listFilteredProducts(c.env.DB, exportUrl, 8000);
    const hideCost = user.role_slug !== "admin" && !user.permissions.includes("costs.view") && !user.permissions.includes("products.edit");
    const xlsx = productsImportWorkbook(products.map((r) => productToImportCells(r, hideCost)));
    return c.body(new Uint8Array(xlsx), 200, {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="inventory.xlsx"`,
    });
  } else if (kind === "expenses") {
    const where = ["e.voided_at IS NULL"];
    const params: (string | number)[] = [];
    applyDate(where, params, "e.date", p);
    applyEq(where, params, "e.category_id", p.category_id, true);
    applyEq(where, params, "e.user_id", p.user_id, true);
    applyRange(where, params, "e.amount", p.amount_min, p.amount_max);
    applySearch(where, params, p.q, ["e.description", "IFNULL(c.name_ar,'')"]);
    const { results } = await c.env.DB
      .prepare(
        `SELECT e.date, COALESCE(c.name_ar, '') as category, e.amount, e.description
         FROM expenses e LEFT JOIN expense_categories c ON c.id = e.category_id
         WHERE ${where.join(" AND ")} ORDER BY e.id DESC LIMIT 3000`,
      )
      .bind(...params)
      .all<Record<string, unknown>>();
    headers = ["date", "category", "amount", "description"];
    rows = (results || []).map((r) => [r.date, r.category, r.amount, r.description]);
  } else if (kind === "payments") {
    const where = ["pmt.voided_at IS NULL"];
    const params: (string | number)[] = [];
    applyDate(where, params, "pmt.date", p);
    applyEq(where, params, "pmt.customer_id", p.customer_id, true);
    applyEq(where, params, "pmt.method", p.payment_method || p.method);
    applyRange(where, params, "pmt.amount", p.amount_min, p.amount_max);
    applySearch(where, params, p.q, ["IFNULL(c.name,'')", sqlText("pmt.id"), "IFNULL(si.number,'')"]);
    const { results } = await c.env.DB
      .prepare(
        `SELECT pmt.date, si.number as invoice_number, c.name as customer, pmt.method, pmt.amount, pmt.notes
         FROM payments pmt LEFT JOIN customers c ON c.id = pmt.customer_id LEFT JOIN sales_invoices si ON si.id = pmt.invoice_id
         WHERE ${where.join(" AND ")} ORDER BY pmt.id DESC LIMIT 3000`,
      )
      .bind(...params)
      .all<Record<string, unknown>>();
    headers = ["date", "invoice", "customer", "method", "amount", "notes"];
    rows = (results || []).map((r) => [r.date, r.invoice_number, r.customer, r.method, r.amount, r.notes]);
  } else if (kind === "purchases") {
    const where = ["pi.deleted_at IS NULL"];
    const params: (string | number)[] = [];
    applyDate(where, params, "pi.date", p);
    applyEq(where, params, "pi.supplier_id", p.supplier_id, true);
    applyEq(where, params, "pi.status", p.status);
    applyRange(where, params, "pi.total", p.amount_min, p.amount_max);
    applySearch(where, params, p.q, ["pi.number", "IFNULL(s.name,'')"]);
    const { results } = await c.env.DB
      .prepare(
        `SELECT pi.number, pi.date, s.name as supplier, pi.status, pi.total
         FROM purchase_invoices pi LEFT JOIN suppliers s ON s.id = pi.supplier_id
         WHERE ${where.join(" AND ")} ORDER BY pi.id DESC LIMIT 3000`,
      )
      .bind(...params)
      .all<Record<string, unknown>>();
    headers = ["number", "date", "supplier", "status", "total"];
    rows = (results || []).map((r) => [r.number, r.date, r.supplier, r.status, r.total]);
  } else if (kind === "sales") {
    const { results } = await c.env.DB.prepare(salesGroupSql(group)).bind(from, to).all<Record<string, unknown>>();
    headers = ["label", "invoices", "qty", "total", "profit"];
    rows = (results || []).map((r) => [r.label, r.invoices, r.qty, r.total, r.profit]);
    filename = `sales-${group}`;
  } else if (kind === "aging") {
    const { results } = await c.env.DB
      .prepare(
        `SELECT c.name, c.phone, c.current_balance as balance,
                CAST(COALESCE((
                  SELECT MIN(DATEDIFF(CURDATE(), si.date))
                  FROM sales_invoices si
                  WHERE si.customer_id = c.id AND si.deleted_at IS NULL
                    AND si.remaining > 0 AND si.status NOT IN ('cancelled','draft','held','quote','order')
                ), 0) AS SIGNED) as days
         FROM customers c WHERE c.deleted_at IS NULL AND c.current_balance > 0 ORDER BY c.current_balance DESC`,
      )
      .all<Record<string, unknown>>();
    headers = ["name", "phone", "balance", "days"];
    rows = (results || []).map((r) => [r.name, r.phone, r.balance, r.days]);
  } else if (kind === "profit") {
    const { results } = await c.env.DB
      .prepare(
        `SELECT si.number, si.date, sii.product_name, sib.qty, sib.unit_cost, sii.unit_price,
                (sii.unit_price - sib.unit_cost) as profit
         FROM sales_item_batches sib
         JOIN sales_invoice_items sii ON sii.id = sib.invoice_item_id
         JOIN sales_invoices si ON si.id = sii.invoice_id
         WHERE si.deleted_at IS NULL AND si.status NOT IN ('cancelled','draft','held','quote','order') AND si.date BETWEEN ? AND ?
         ORDER BY si.date DESC LIMIT 3000`,
      )
      .bind(from, to)
      .all<Record<string, unknown>>();
    headers = ["number", "date", "product", "qty", "cost", "price", "profit"];
    rows = (results || []).map((r) => [r.number, r.date, r.product_name, r.qty, r.unit_cost, r.unit_price, r.profit]);
  } else if (kind === "trial-balance") {
    const tb = await loadTrialBalance(c.env.DB, p);
    headers = ["code", "name_ar", "name_en", "type", "opening", "debit", "credit", "closing_debit", "closing_credit"];
    rows = tb.data.map((r) => {
      const sides = splitClosingSides(r.closing_balance);
      const absOrEmpty = (n: number) => (Math.abs(n) < 0.005 ? "" : Math.abs(n));
      return [
        r.code,
        r.name_ar,
        r.name_en,
        r.type,
        absOrEmpty(r.opening_balance),
        absOrEmpty(r.total_debit),
        absOrEmpty(r.total_credit),
        sides.debit || "",
        sides.credit || "",
      ];
    });
    filename = `trial-balance-${tb.from}-${tb.to}`;
  } else if (kind === "daily-movement") {
    const hideCost = user.role_slug !== "admin" && !user.permissions.includes("costs.view");
    const dm = await loadDailyMovement(c.env.DB, p, { hideCost });
    headers = ["section", "date", "time", "sku", "name", "unit", "qty", "price", "total", "discount", "addition", "net", ...(hideCost ? [] : ["cost", "profit"]), "customer"];
    rows = [
      ...Object.entries(dm.summary).map(([k, v]) => ["summary", k, "", "", "", "", "", "", v, "", "", "", ...(hideCost ? [] : ["", ""]), ""]),
      ...dm.sales_lines.map((r) => [
        "sale",
        r.date,
        r.time,
        r.sku,
        r.name,
        r.unit,
        r.qty,
        r.price,
        r.total,
        r.discount,
        r.addition,
        r.net,
        ...(hideCost ? [] : [(r as { cost?: number }).cost ?? "", (r as { profit?: number }).profit ?? ""]),
        r.customer,
      ]),
      ...dm.return_lines.map((r) => [
        "return",
        r.date,
        r.time,
        r.sku,
        r.name,
        r.unit,
        r.qty,
        r.price,
        r.total,
        r.discount,
        r.addition,
        r.net,
        ...(hideCost ? [] : ["", ""]),
        r.customer,
      ]),
    ];
    filename = `daily-movement-${dm.from.slice(0, 10)}-${dm.to.slice(0, 10)}`;
  } else {
    return c.json({ error: "unknown_export" }, 400);
  }
  return c.body(csvBody(headers, rows), 200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}.csv"`,
  });
});

reportRoutes.get("/reconcile", requirePerm("reports.view", "ledger.view"), async (c) => {
  const data = await reconcile(c.env.DB);
  return c.json(data);
});
