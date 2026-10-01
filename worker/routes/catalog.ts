import { Hono } from "hono";
import { audit, like, nextNumber, paginate, todayIso, type AppBindings, type AppVars, type AppDb } from "../lib/helpers";
import { requirePerm } from "../lib/auth";
import { availableBatches, logMovement } from "../lib/stock";
import { applyEq, applyLocationCol, applyRange, applySearch, listParams, PRODUCT_SORT, sortSql } from "../lib/filters";

export const catalogRoutes = new Hono<{ Bindings: AppBindings; Variables: AppVars }>();

const productSelect = `
  SELECT p.*, b.name_ar as brand_ar, b.name_en as brand_en,
    pt.name_ar as part_type_ar, pt.name_en as part_type_en,
    c.name_ar as category_ar, c.name_en as category_en,
    sl.name as location_name, sl.warehouse, sl.rack, sl.shelf, sl.drawer, sl.box,
    s.name as supplier_name,
    CASE WHEN p.kind = 'service' THEN 9999 ELSE (p.current_stock - p.reserved_stock) END as available,
    CASE
      WHEN p.kind = 'service' THEN 'in'
      WHEN (p.current_stock - p.reserved_stock) <= 0 THEN 'out'
      WHEN (p.current_stock - p.reserved_stock) <= CASE WHEN COALESCE(p.reorder_point,0) > COALESCE(p.min_stock,0) THEN p.reorder_point ELSE p.min_stock END THEN 'low'
      ELSE 'in'
    END as stock_status
  FROM products p
  LEFT JOIN brands b ON b.id = p.brand_id
  LEFT JOIN part_types pt ON pt.id = p.part_type_id
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN storage_locations sl ON sl.id = p.location_id
  LEFT JOIN suppliers s ON s.id = p.supplier_id
`;

async function attachModels(db: AppDb, products: { id: number }[]) {
  if (!products.length) return products;
  const ids = products.map((p) => p.id);
  const placeholders = ids.map(() => "?").join(",");
  const { results } = await db
    .prepare(
      `SELECT pm.product_id, dm.id, dm.name, dm.code, dm.brand_id
       FROM product_models pm JOIN device_models dm ON dm.id = pm.model_id
       WHERE pm.product_id IN (${placeholders})`,
    )
    .bind(...ids)
    .all<{ product_id: number; id: number; name: string; code: string; brand_id: number }>();
  const map = new Map<number, typeof results>();
  for (const r of results) {
    const arr = map.get(r.product_id) || [];
    arr.push(r);
    map.set(r.product_id, arr);
  }
  return products.map((p) => ({ ...p, models: map.get(p.id) || [] }));
}

function withoutCost<T extends Record<string, unknown>>(user: { role_slug: string; permissions: string[] }, rows: T[]): T[] {
  if (user.role_slug === "admin" || user.permissions.includes("costs.view") || user.permissions.includes("products.edit")) return rows;
  return rows.map((row) => {
    const next = { ...row };
    delete next.purchase_price;
    return next;
  });
}

async function attachUnits(db: AppDb, products: { id: number }[]) {
  if (!products.length) return products;
  try {
    const ids = products.map((p) => p.id);
    const { results } = await db
      .prepare(`SELECT * FROM product_units WHERE product_id IN (${ids.map(() => "?").join(",")}) ORDER BY is_base DESC, id`)
      .bind(...ids)
      .all<{ product_id: number }>();
    const map = new Map<number, typeof results>();
    for (const r of results || []) {
      const arr = map.get(r.product_id) || [];
      arr.push(r);
      map.set(r.product_id, arr);
    }
    return products.map((p) => ({ ...p, units: map.get(p.id) || [] }));
  } catch {
    return products.map((p) => ({ ...p, units: [] }));
  }
}

async function saveProductExtras(db: AppDb, id: number, b: Record<string, unknown>) {
  await db
    .prepare(
      `UPDATE products SET extra_code1=?, extra_code2=?, extra_codes=?, discount_pct=?, price_2=?, price_3=?, price_4=?,
       no_qty=?, quick_list=?, non_stock=?, specs=?, scale=?, expiry_days=? WHERE id=?`,
    )
    .bind(
      b.extra_code1 || null,
      b.extra_code2 || null,
      b.extra_codes || null,
      Number(b.discount_pct || 0),
      Number(b.price_2 || 0),
      Number(b.price_3 || 0),
      Number(b.price_4 || 0),
      b.no_qty ? 1 : 0,
      b.quick_list ? 1 : 0,
      b.non_stock ? 1 : 0,
      b.specs || null,
      b.scale || null,
      b.expiry_days ? Number(b.expiry_days) : null,
      id,
    )
    .run();
  if (Array.isArray(b.units)) {
    await db.prepare("DELETE FROM product_units WHERE product_id = ?").bind(id).run();
    for (const raw of b.units as { name?: string; factor?: number; barcode?: string; selling_price?: number; is_base?: number }[]) {
      if (!raw.name) continue;
      await db
        .prepare("INSERT INTO product_units (product_id, name, factor, barcode, selling_price, is_base) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(id, raw.name, Number(raw.factor || 1) || 1, raw.barcode || null, Number(raw.selling_price || 0), raw.is_base ? 1 : 0)
        .run();
    }
  }
}

catalogRoutes.get("/products", requirePerm("products.view", "inventory.view", "sales.create"), async (c) => {
  const url = new URL(c.req.url);
  const p = listParams(url);
  const q = (p.q || "").trim();
  const brandId = p.brand_id;
  const typeId = p.part_type_id;
  const catId = p.category_id;
  const modelId = p.model_id;
  const status = p.status;
  const kind = p.kind;
  const { page, pageSize, offset } = paginate(url);
  const where: string[] = ["p.deleted_at IS NULL"];
  const params: (string | number)[] = [];
  if (brandId) {
    where.push("p.brand_id = ?");
    params.push(Number(brandId));
  }
  if (typeId) {
    where.push("p.part_type_id = ?");
    params.push(Number(typeId));
  }
  if (catId) {
    where.push("p.category_id = ?");
    params.push(Number(catId));
  }
  if (modelId) {
    where.push("EXISTS (SELECT 1 FROM product_models pm WHERE pm.product_id = p.id AND pm.model_id = ?)");
    params.push(Number(modelId));
  }
  if (p.compatible_model_id) {
    where.push("EXISTS (SELECT 1 FROM product_models pm WHERE pm.product_id = p.id AND pm.model_id = ?)");
    params.push(Number(p.compatible_model_id));
  }
  if (kind === "product" || kind === "service") {
    where.push("COALESCE(p.kind,'product') = ?");
    params.push(kind);
  }
  if (p.quick_list === "1") where.push("p.quick_list = 1");
  applyEq(where, params, "p.quality", p.quality);
  applyEq(where, params, "p.color", p.color);
  applyEq(where, params, "p.supplier_id", p.supplier_id, true);
  applyEq(where, params, "p.active", p.active, true);
  await applyLocationCol(c.env.DB, where, params, "p.location_id", p);
  applyRange(where, params, "p.selling_price", p.price_min, p.price_max);
  applyRange(where, params, "(p.current_stock - p.reserved_stock)", p.qty_min, p.qty_max);
  if (status === "low") where.push("p.kind != 'service' AND (p.current_stock - p.reserved_stock) > 0 AND (p.current_stock - p.reserved_stock) <= CASE WHEN COALESCE(p.reorder_point,0) > COALESCE(p.min_stock,0) THEN p.reorder_point ELSE p.min_stock END");
  if (status === "out") where.push("p.kind != 'service' AND (p.current_stock - p.reserved_stock) <= 0");
  if (status === "in") where.push("p.kind = 'service' OR (p.current_stock - p.reserved_stock) > CASE WHEN COALESCE(p.reorder_point,0) > COALESCE(p.min_stock,0) THEN p.reorder_point ELSE p.min_stock END");
  if (status === "dead") {
    where.push(`p.kind != 'service' AND (p.current_stock - p.reserved_stock) > 0 AND p.id NOT IN (
      SELECT sii.product_id FROM sales_invoice_items sii JOIN sales_invoices si ON si.id = sii.invoice_id
      WHERE si.deleted_at IS NULL AND si.status NOT IN ('cancelled','draft','held','quote','order') AND si.date >= date('now','-90 days'))`);
  }
  if (q) {
    where.push(`(
      p.name_ar LIKE ? OR p.name_en LIKE ? OR p.sku LIKE ? OR p.barcode = ? OR p.barcode LIKE ? OR p.part_number LIKE ?
      OR b.name_ar LIKE ? OR b.name_en LIKE ? OR pt.name_ar LIKE ? OR pt.name_en LIKE ?
      OR c.name_ar LIKE ? OR c.name_en LIKE ? OR sl.name LIKE ? OR sl.drawer LIKE ? OR sl.rack LIKE ?
      OR IFNULL(p.extra_code1,'') = ? OR IFNULL(p.extra_code2,'') = ? OR IFNULL(p.extra_codes,'') LIKE ?
      OR EXISTS (SELECT 1 FROM product_units pu WHERE pu.product_id = p.id AND (pu.barcode = ? OR pu.barcode LIKE ?))
      OR EXISTS (SELECT 1 FROM product_models pm JOIN device_models dm ON dm.id = pm.model_id
                 WHERE pm.product_id = p.id AND (dm.name LIKE ? OR dm.code LIKE ?))
    )`);
    const l = like(q);
    params.push(l, l, l, q, l, l, l, l, l, l, l, l, l, l, l, q, q, l, q, l, l, l);
  }
  const whereSql = `WHERE ${where.join(" AND ")}`;
  const joinSql = `FROM products p
    LEFT JOIN brands b ON b.id = p.brand_id
    LEFT JOIN part_types pt ON pt.id = p.part_type_id
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN storage_locations sl ON sl.id = p.location_id`;
  const count = await c.env.DB.prepare(`SELECT COUNT(*) as n ${joinSql} ${whereSql}`).bind(...params).first<{ n: number }>();
  const totals = await c.env.DB
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN p.kind='service' THEN 0 ELSE (p.current_stock - p.reserved_stock) END),0) as qty,
              COALESCE(SUM(CASE WHEN p.kind='service' THEN 0 ELSE (p.current_stock - p.reserved_stock) * p.selling_price END),0) as value
       ${joinSql} ${whereSql}`,
    )
    .bind(...params)
    .first<{ qty: number; value: number }>();
  const order = sortSql(p.sort === "moved" ? "" : p.sort, PRODUCT_SORT, p.sort === "moved"
    ? `(SELECT COALESCE(SUM(ABS(sm.qty)),0) FROM stock_movements sm WHERE sm.product_id = p.id) DESC, p.id DESC`
    : "p.id DESC");
  const { results } = await c.env.DB
    .prepare(`${productSelect} ${whereSql} ${order} LIMIT ? OFFSET ?`)
    .bind(...params, pageSize, offset)
    .all();
  const withModels = await attachModels(c.env.DB, results as { id: number }[]);
  const data = withoutCost(c.get("user"), await attachUnits(c.env.DB, withModels) as Record<string, unknown>[]);
  const listId = Number(url.searchParams.get("price_list_id") || 0);
  if (listId && data.length) {
    const ids = data.map((p) => Number(p.id));
    const { results: prices } = await c.env.DB
      .prepare(`SELECT product_id, price FROM price_list_items WHERE price_list_id = ? AND product_id IN (${ids.map(() => "?").join(",")})`)
      .bind(listId, ...ids)
      .all<{ product_id: number; price: number }>();
    const map = new Map(prices.map((r) => [r.product_id, r.price]));
    for (const p of data as { id: number; selling_price: number; list_price?: number }[]) {
      const price = map.get(p.id);
      if (price != null) {
        p.list_price = p.selling_price;
        p.selling_price = price;
      }
    }
  }
  return c.json({
    data,
    total: count?.n || 0,
    page,
    pageSize,
    totals: { count: count?.n || 0, qty: totals?.qty || 0, value: totals?.value || 0 },
  });
});

catalogRoutes.get("/products/search", requirePerm("products.view", "sales.create", "inventory.view"), async (c) => {
  const q = (new URL(c.req.url).searchParams.get("q") || "").trim();
  if (!q) return c.json({ data: [] });
  const l = like(q);
  const { results } = await c.env.DB
    .prepare(
      `${productSelect}
       WHERE p.deleted_at IS NULL AND p.active = 1 AND (
         p.barcode = ? OR p.sku = ? OR p.part_number = ? OR p.extra_code1 = ? OR p.extra_code2 = ?
         OR p.name_ar LIKE ? OR p.name_en LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ? OR p.part_number LIKE ?
         OR b.name_en LIKE ? OR b.name_ar LIKE ? OR pt.name_en LIKE ? OR pt.name_ar LIKE ?
         OR EXISTS (SELECT 1 FROM product_units pu WHERE pu.product_id = p.id AND pu.barcode = ?)
         OR EXISTS (SELECT 1 FROM product_models pm JOIN device_models dm ON dm.id = pm.model_id
                    WHERE pm.product_id = p.id AND (dm.name LIKE ? OR dm.code LIKE ?))
       )
       ORDER BY CASE WHEN p.barcode = ? OR p.sku = ? OR p.extra_code1 = ? THEN 0 ELSE 1 END, p.name_en
       LIMIT 30`,
    )
    .bind(q, q, q, q, q, l, l, l, l, l, l, l, l, l, q, l, l, q, q, q)
    .all();
  const withModels = await attachModels(c.env.DB, results as { id: number }[]);
  const data = withoutCost(c.get("user"), await attachUnits(c.env.DB, withModels) as Record<string, unknown>[]);
  return c.json({ data });
});

catalogRoutes.get("/products/:id", requirePerm("products.view", "sales.create"), async (c) => {
  const id = Number(c.req.param("id"));
  const row = await c.env.DB.prepare(`${productSelect} WHERE p.id = ? AND p.deleted_at IS NULL`).bind(id).first();
  if (!row) return c.json({ error: "not_found" }, 404);
  const withModels = await attachModels(c.env.DB, [row as { id: number }]);
  const withUnits = await attachUnits(c.env.DB, withModels);
  const batches = await availableBatches(c.env.DB, id);
  const allBatches = await c.env.DB
    .prepare("SELECT * FROM inventory_batches WHERE product_id = ? ORDER BY purchase_date DESC")
    .bind(id)
    .all();
  return c.json({ data: { ...withUnits[0], batches: allBatches.results, available_batches: batches } });
});

catalogRoutes.post("/products", requirePerm("products.create"), async (c) => {
  const b = await c.req.json<Record<string, unknown>>();
  const sku = String(b.sku || "").trim();
  if (!sku || !b.name_ar) return c.json({ error: "missing_fields" }, 400);
  const result = await c.env.DB
    .prepare(
      `INSERT INTO products (sku, barcode, part_number, name_ar, name_en, brand_id, part_type_id, category_id, location_id, supplier_id,
        purchase_price, selling_price, wholesale_price, min_selling_price, min_stock, image_url, description, notes, active, kind)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      sku,
      b.barcode || null,
      b.part_number || null,
      b.name_ar,
      b.name_en || b.name_ar,
      b.brand_id || null,
      b.part_type_id || null,
      b.category_id || null,
      b.location_id || null,
      b.supplier_id || null,
      Number(b.purchase_price || 0),
      Number(b.selling_price || 0),
      Number(b.wholesale_price || 0),
      Number(b.min_selling_price || 0),
      Number(b.min_stock || 0),
      b.image_url || null,
      b.description || null,
      b.notes || null,
      b.active === 0 ? 0 : 1,
      b.kind === "service" ? "service" : "product",
    )
    .run();
  const id = result.meta.last_row_id;
  const models = Array.isArray(b.model_ids) ? (b.model_ids as number[]) : [];
  if (models.length) {
    await c.env.DB.batch(models.map((mid) => c.env.DB.prepare("INSERT INTO product_models (product_id, model_id) VALUES (?, ?)").bind(id, mid)));
  }
  await c.env.DB.prepare("UPDATE products SET color=?, quality=?, parent_id=?, unit=?, reorder_point=?, track_serial=? WHERE id=?").bind(b.color || null, b.quality || null, b.parent_id || null, b.unit || "قطعة", Number(b.reorder_point || 0), b.track_serial ? 1 : 0, id).run();
  await saveProductExtras(c.env.DB, id, b);
  const openQty = Number(b.opening_qty || 0);
  if (openQty > 0 && b.kind !== "service") {
    const cost = Number(b.purchase_price || 0);
    const code = await nextNumber(c.env.DB, "batch");
    const ins = await c.env.DB
      .prepare(
        `INSERT INTO inventory_batches (batch_code, product_id, purchase_date, original_qty, remaining_qty, reserved_qty, unit_cost, expiry_date, notes)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?, 'opening')`,
      )
      .bind(code, id, todayIso(), openQty, openQty, cost, b.expiry_date || null)
      .run();
    await c.env.DB.prepare("UPDATE products SET current_stock = current_stock + ?, updated_at = datetime('now') WHERE id = ?").bind(openQty, id).run();
    await logMovement(c.env.DB, {
      productId: id,
      batchId: ins.meta.last_row_id,
      type: "in",
      qty: openQty,
      unitCost: cost,
      referenceType: "opening",
      referenceId: id,
      notes: "كمية افتتاحية",
      userId: c.get("user").id,
    });
  }
  await audit(c.env.DB, c.get("user"), "create_product", "product", id, `Create ${sku}`);
  return c.json({ id }, 201);
});

catalogRoutes.put("/products/:id", requirePerm("products.edit"), async (c) => {
  const id = Number(c.req.param("id"));
  const prev = await c.env.DB.prepare("SELECT sku, name_ar, selling_price, min_selling_price, purchase_price, active, kind FROM products WHERE id = ?").bind(id).first();
  const b = await c.req.json<Record<string, unknown>>();
  await c.env.DB
    .prepare(
      `UPDATE products SET sku=?, barcode=?, part_number=?, name_ar=?, name_en=?, brand_id=?, part_type_id=?, category_id=?, location_id=?, supplier_id=?,
       purchase_price=?, selling_price=?, wholesale_price=?, min_selling_price=?, min_stock=?, image_url=?, description=?, notes=?, active=?, kind=?, updated_at=datetime('now')
       WHERE id=?`,
    )
    .bind(
      b.sku,
      b.barcode || null,
      b.part_number || null,
      b.name_ar,
      b.name_en || b.name_ar,
      b.brand_id || null,
      b.part_type_id || null,
      b.category_id || null,
      b.location_id || null,
      b.supplier_id || null,
      Number(b.purchase_price || 0),
      Number(b.selling_price || 0),
      Number(b.wholesale_price || 0),
      Number(b.min_selling_price || 0),
      Number(b.min_stock || 0),
      b.image_url || null,
      b.description || null,
      b.notes || null,
      b.active === 0 ? 0 : 1,
      b.kind === "service" ? "service" : "product",
      id,
    )
    .run();
  if (Array.isArray(b.model_ids)) {
    await c.env.DB.prepare("DELETE FROM product_models WHERE product_id = ?").bind(id).run();
    const models = b.model_ids as number[];
    if (models.length) {
      await c.env.DB.batch(models.map((mid) => c.env.DB.prepare("INSERT INTO product_models (product_id, model_id) VALUES (?, ?)").bind(id, mid)));
    }
  }
  await c.env.DB.prepare("UPDATE products SET color=?, quality=?, parent_id=?, unit=?, reorder_point=?, track_serial=? WHERE id=?").bind(b.color || null, b.quality || null, b.parent_id || null, b.unit || "قطعة", Number(b.reorder_point || 0), b.track_serial ? 1 : 0, id).run();
  await saveProductExtras(c.env.DB, id, b);
  await audit(c.env.DB, c.get("user"), "edit_product", "product", id, `Edit product ${id}`, {
    old_value: prev,
    new_value: { sku: b.sku, name_ar: b.name_ar, selling_price: b.selling_price, min_selling_price: b.min_selling_price, purchase_price: b.purchase_price, active: b.active === 0 ? 0 : 1, kind: b.kind },
  });
  if (b.selling_price != null) await audit(c.env.DB, c.get("user"), "change_price", "product", id, `Selling price ${b.selling_price}`, { old_value: { selling_price: prev?.selling_price }, new_value: { selling_price: b.selling_price } });
  return c.json({ ok: true });
});

catalogRoutes.delete("/products/:id", requirePerm("products.delete"), async (c) => {
  const id = Number(c.req.param("id"));
  await c.env.DB.prepare("UPDATE products SET deleted_at = datetime('now'), active = 0 WHERE id = ?").bind(id).run();
  await audit(c.env.DB, c.get("user"), "delete_product", "product", id, "Soft delete product");
  return c.json({ ok: true });
});

function crud(table: string, perm: string, fields: string[]) {
  catalogRoutes.get(`/${table}`, requirePerm(perm, "products.view", "sales.create"), async (c) => {
    const p = listParams(new URL(c.req.url));
    const where = ["(deleted_at IS NULL OR deleted_at = '')"];
    const params: (string | number)[] = [];
    const searchCols = fields.filter((f) => ["name_ar", "name_en", "name", "code", "path", "warehouse"].includes(f));
    applySearch(where, params, p.q, searchCols.length ? searchCols : ["CAST(id AS TEXT)"]);
    applyEq(where, params, "brand_id", p.brand_id, true);
    applyEq(where, params, "kind", p.kind);
    applyEq(where, params, "parent_id", p.parent_id, true);
    let rows: unknown[] = [];
    try {
      const r = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE ${where.join(" AND ")} ORDER BY id`).bind(...params).all();
      rows = r.results || [];
    } catch {
      const r = await c.env.DB.prepare(`SELECT * FROM ${table}`).all();
      rows = r.results || [];
    }
    return c.json({ data: rows });
  });
  catalogRoutes.post(`/${table}`, requirePerm(perm), async (c) => {
    const b = await c.req.json<Record<string, unknown>>();
    const cols = fields.filter((f) => f in b);
    const placeholders = cols.map(() => "?").join(",");
    const result = await c.env.DB
      .prepare(`INSERT INTO ${table} (${cols.join(",")}) VALUES (${placeholders})`)
      .bind(...cols.map((f) => (b[f] as string | number | null) ?? null))
      .run();
    await audit(c.env.DB, c.get("user"), `create_${table}`, table, result.meta.last_row_id, `Create ${table}`);
    return c.json({ id: result.meta.last_row_id }, 201);
  });
  catalogRoutes.put(`/${table}/:id`, requirePerm(perm), async (c) => {
    const id = Number(c.req.param("id"));
    const b = await c.req.json<Record<string, unknown>>();
    const cols = fields.filter((f) => f in b);
    await c.env.DB
      .prepare(`UPDATE ${table} SET ${cols.map((f) => `${f}=?`).join(",")} WHERE id=?`)
      .bind(...cols.map((f) => (b[f] as string | number | null) ?? null), id)
      .run();
    await audit(c.env.DB, c.get("user"), `edit_${table}`, table, id, `Edit ${table}`);
    return c.json({ ok: true });
  });
  catalogRoutes.delete(`/${table}/:id`, requirePerm(perm), async (c) => {
    const id = Number(c.req.param("id"));
    try {
      await c.env.DB.prepare(`UPDATE ${table} SET deleted_at = datetime('now') WHERE id = ?`).bind(id).run();
    } catch {
      await c.env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();
    }
    await audit(c.env.DB, c.get("user"), `delete_${table}`, table, id, `Delete ${table}`);
    return c.json({ ok: true });
  });
}

crud("brands", "brands.manage", ["name_ar", "name_en", "code", "active"]);
crud("part_types", "categories.manage", ["name_ar", "name_en", "code", "active"]);
crud("categories", "categories.manage", ["name_ar", "name_en", "parent_id", "active"]);
crud("device_models", "models.manage", ["brand_id", "name", "code", "year", "notes", "active"]);
crud("storage_locations", "locations.manage", ["name", "warehouse", "section", "rack", "shelf", "drawer", "box", "notes", "active", "parent_id", "kind", "code", "path", "sort_order"]);

catalogRoutes.get("/models", requirePerm("models.manage", "products.view", "sales.create"), async (c) => {
  const p = listParams(new URL(c.req.url));
  const where = ["dm.deleted_at IS NULL"];
  const params: (string | number)[] = [];
  applyEq(where, params, "dm.brand_id", p.brand_id, true);
  applySearch(where, params, p.q, ["dm.name", "IFNULL(dm.code,'')", "b.name_ar", "b.name_en"]);
  const { results } = await c.env.DB
    .prepare(
      `SELECT dm.*, b.name_en as brand_en, b.name_ar as brand_ar FROM device_models dm JOIN brands b ON b.id = dm.brand_id WHERE ${where.join(" AND ")} ORDER BY b.name_en, dm.name`,
    )
    .bind(...params)
    .all();
  return c.json({ data: results });
});
