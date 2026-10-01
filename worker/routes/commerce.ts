import { Hono } from "hono";
import { audit, type AppBindings, type AppVars } from "../lib/helpers";
import { requirePerm } from "../lib/auth";

export const commerceRoutes = new Hono<{ Bindings: AppBindings; Variables: AppVars }>();

commerceRoutes.get("/price-lists", requirePerm("prices.view", "sales.create"), async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM price_lists WHERE active = 1 OR active = 0 ORDER BY id").all();
  return c.json({ data: results });
});

commerceRoutes.post("/price-lists", requirePerm("prices.manage"), async (c) => {
  const b = await c.req.json<{ name: string; name_en?: string; customer_type?: string }>();
  if (!b.name?.trim()) return c.json({ error: "missing" }, 400);
  const ins = await c.env.DB
    .prepare("INSERT INTO price_lists (name, name_en, customer_type) VALUES (?, ?, ?)")
    .bind(b.name.trim(), b.name_en || null, b.customer_type || null)
    .run();
  await audit(c.env.DB, c.get("user"), "create_price_list", "price_list", ins.meta.last_row_id, b.name);
  return c.json({ id: ins.meta.last_row_id }, 201);
});

commerceRoutes.put("/price-lists/:id", requirePerm("prices.manage"), async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json<{ name?: string; name_en?: string; active?: number }>();
  await c.env.DB.prepare("UPDATE price_lists SET name=COALESCE(?, name), name_en=COALESCE(?, name_en), active=? WHERE id=?").bind(b.name || null, b.name_en || null, b.active === 0 ? 0 : 1, id).run();
  return c.json({ ok: true });
});

commerceRoutes.delete("/price-lists/:id", requirePerm("prices.manage"), async (c) => {
  const id = Number(c.req.param("id"));
  await c.env.DB.prepare("UPDATE price_lists SET active = 0 WHERE id = ?").bind(id).run();
  await audit(c.env.DB, c.get("user"), "delete_price_list", "price_list", id, "Deactivate price list");
  return c.json({ ok: true });
});

commerceRoutes.get("/price-lists/:id", requirePerm("prices.view", "sales.create"), async (c) => {
  const id = Number(c.req.param("id"));
  const list = await c.env.DB.prepare("SELECT * FROM price_lists WHERE id = ?").bind(id).first();
  if (!list) return c.json({ error: "not_found" }, 404);
  const items = await c.env.DB
    .prepare(
      `SELECT pli.*, p.sku, p.name_ar, p.name_en, p.selling_price, p.wholesale_price
       FROM price_list_items pli JOIN products p ON p.id = pli.product_id
       WHERE pli.price_list_id = ? ORDER BY p.name_ar`,
    )
    .bind(id)
    .all();
  return c.json({ data: { ...list, items: items.results } });
});

commerceRoutes.put("/price-lists/:id/items", requirePerm("prices.manage"), async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json<{ items: { product_id: number; price: number }[] }>();
  for (const item of b.items || []) {
    await c.env.DB
      .prepare(
        `INSERT INTO price_list_items (price_list_id, product_id, price) VALUES (?, ?, ?)
         ON CONFLICT(price_list_id, product_id) DO UPDATE SET price = excluded.price`,
      )
      .bind(id, item.product_id, item.price)
      .run();
  }
  await audit(c.env.DB, c.get("user"), "edit_price_list", "price_list", id, `Update ${b.items?.length || 0} prices`);
  return c.json({ ok: true });
});

commerceRoutes.get("/supplier-prices", requirePerm("purchases.view", "products.view"), async (c) => {
  const productId = Number(new URL(c.req.url).searchParams.get("product_id") || 0);
  const supplierId = Number(new URL(c.req.url).searchParams.get("supplier_id") || 0);
  const where = ["1=1"];
  const params: number[] = [];
  if (productId) {
    where.push("spp.product_id = ?");
    params.push(productId);
  }
  if (supplierId) {
    where.push("spp.supplier_id = ?");
    params.push(supplierId);
  }
  const { results } = await c.env.DB
    .prepare(
      `SELECT spp.*, s.name as supplier_name, p.sku, p.name_ar, p.name_en, p.purchase_price
       FROM supplier_product_prices spp
       JOIN suppliers s ON s.id = spp.supplier_id
       JOIN products p ON p.id = spp.product_id
       WHERE ${where.join(" AND ")}
       ORDER BY spp.product_id, spp.unit_cost`,
    )
    .bind(...params)
    .all();
  return c.json({ data: results });
});

commerceRoutes.put("/supplier-prices", requirePerm("purchases.create", "suppliers.manage"), async (c) => {
  const b = await c.req.json<{ supplier_id: number; product_id: number; unit_cost: number; notes?: string }>();
  if (!b.supplier_id || !b.product_id) return c.json({ error: "missing" }, 400);
  await c.env.DB
    .prepare(
      `INSERT INTO supplier_product_prices (supplier_id, product_id, unit_cost, last_date, notes)
       VALUES (?, ?, ?, date('now'), ?)
       ON CONFLICT(supplier_id, product_id) DO UPDATE SET unit_cost = excluded.unit_cost, last_date = excluded.last_date, notes = excluded.notes`,
    )
    .bind(b.supplier_id, b.product_id, b.unit_cost, b.notes || null)
    .run();
  return c.json({ ok: true });
});

commerceRoutes.get("/offers", requirePerm("sales.create", "prices.view", "products.view"), async (c) => {
  const { results } = await c.env.DB
    .prepare(
      `SELECT o.*, p.sku, p.name_ar, p.name_en FROM product_offers o
       JOIN products p ON p.id = o.product_id
       WHERE o.active = 1 AND (o.valid_from IS NULL OR o.valid_from <= date('now')) AND (o.valid_to IS NULL OR o.valid_to >= date('now'))
       ORDER BY o.min_qty DESC, o.id DESC`,
    )
    .all();
  return c.json({ data: results });
});

commerceRoutes.post("/offers", requirePerm("prices.manage", "products.edit"), async (c) => {
  const b = await c.req.json<{ product_id: number; min_qty?: number; discount_type?: string; discount_value?: number; name?: string; valid_from?: string; valid_to?: string }>();
  if (!b.product_id || !b.discount_value) return c.json({ error: "missing" }, 400);
  const ins = await c.env.DB
    .prepare("INSERT INTO product_offers (product_id, min_qty, discount_type, discount_value, name, valid_from, valid_to) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(b.product_id, Number(b.min_qty || 2), b.discount_type === "fixed" ? "fixed" : "percent", Number(b.discount_value), b.name || null, b.valid_from || null, b.valid_to || null)
    .run();
  await audit(c.env.DB, c.get("user"), "create_offer", "product_offer", ins.meta.last_row_id, `${b.product_id} x${b.min_qty}`);
  return c.json({ id: ins.meta.last_row_id }, 201);
});
