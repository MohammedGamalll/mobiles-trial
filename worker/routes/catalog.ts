import { Hono } from "hono";
import { audit, isDupEntry, like, nextNumber, paginate, todayIso, type AppBindings, type AppVars, type AppDb } from "../lib/helpers";
import { requirePerm } from "../lib/auth";
import { availableBatches, logMovement } from "../lib/stock";
import { applyEq, applyRange, applySearch, listParams, PRODUCT_SORT, sortSql, sqlText, stockScopeIds } from "../lib/filters";
import { placeLabel, resolveProductPlace } from "../lib/product-place";
import { withLocationLabels } from "../lib/location-label";

export const catalogRoutes = new Hono<{ Bindings: AppBindings; Variables: AppVars }>();

function productSelectSql(availSql: string, stockJoin = "") {
  return `
  SELECT p.*, b.name_ar as brand_ar, b.name_en as brand_en,
    pt.name_ar as part_type_ar, pt.name_en as part_type_en,
    c.name_ar as category_ar, c.name_en as category_en,
    sl.name as location_name, sl.warehouse, sl.rack, sl.shelf, sl.drawer, sl.box,
    s.name as supplier_name,
    CASE WHEN p.kind = 'service' THEN 9999 ELSE ${availSql} END as available,
    CASE
      WHEN p.kind = 'service' THEN 'in'
      WHEN ${availSql} <= 0 THEN 'out'
      WHEN ${availSql} <= CASE WHEN COALESCE(p.reorder_point,0) > COALESCE(p.min_stock,0) THEN p.reorder_point ELSE p.min_stock END THEN 'low'
      ELSE 'in'
    END as stock_status
  FROM products p
  LEFT JOIN brands b ON b.id = p.brand_id
  LEFT JOIN part_types pt ON pt.id = p.part_type_id
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN storage_locations sl ON sl.id = p.location_id
  LEFT JOIN suppliers s ON s.id = p.supplier_id
  ${stockJoin}
`;
}

const productSelect = productSelectSql("GREATEST(COALESCE(p.current_stock,0) - COALESCE(p.reserved_stock,0), 0)");

function scopedStockJoin(stockIds: number[] | null) {
  if (!stockIds) {
    return { join: "", availSql: "GREATEST(COALESCE(p.current_stock,0) - COALESCE(p.reserved_stock,0), 0)", binds: [] as number[] };
  }
  if (!stockIds.length) {
    return { join: "", availSql: "0", binds: [] as number[] };
  }
  return {
    join: `LEFT JOIN (
      SELECT product_id,
             COALESCE(SUM(GREATEST(COALESCE(remaining_qty,0) - COALESCE(reserved_qty,0), 0)),0) as scope_available
      FROM inventory_batches
      WHERE location_id IN (${stockIds.map(() => "?").join(",")})
      GROUP BY product_id
    ) sc ON sc.product_id = p.id`,
    availSql: "COALESCE(sc.scope_available,0)",
    binds: stockIds,
  };
}

async function applyStockScope<T extends Record<string, unknown>>(db: AppDb, products: T[], locIds: number[] | null) {
  if (!locIds || !products.length) return products;
  const ids = products.map((p) => Number(p.id));
  const { results } = locIds.length
    ? await db
        .prepare(
          `SELECT product_id,
                  COALESCE(SUM(GREATEST(COALESCE(remaining_qty,0) - COALESCE(reserved_qty,0), 0)),0) as available,
                  COALESCE(SUM(GREATEST(COALESCE(reserved_qty,0), 0)),0) as reserved_stock,
                  COALESCE(SUM(COALESCE(remaining_qty,0)),0) as current_stock
           FROM inventory_batches
           WHERE product_id IN (${ids.map(() => "?").join(",")}) AND location_id IN (${locIds.map(() => "?").join(",")})
           GROUP BY product_id`,
        )
        .bind(...ids, ...locIds)
        .all<{ product_id: number; current_stock: number; reserved_stock: number; available: number }>()
    : { results: [] as { product_id: number; current_stock: number; reserved_stock: number; available: number }[] };
  const map = new Map((results || []).map((r) => [r.product_id, r]));
  return products.map((p) => {
    if (String(p.kind || "product") === "service") return { ...p, available: 9999, stock_status: "in" };
    const s = map.get(Number(p.id)) || { current_stock: 0, reserved_stock: 0, available: 0 };
    const current_stock = Number(s.current_stock) || 0;
    const reserved_stock = Number(s.reserved_stock) || 0;
    const available = Math.max(Number(s.available) || 0, 0);
    const min = Math.max(Number(p.reorder_point || 0), Number(p.min_stock || 0));
    return {
      ...p,
      current_stock,
      reserved_stock,
      available,
      stock_status: available <= 0 ? "out" : available <= min ? "low" : "in",
    };
  });
}

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
  if (
    user.role_slug === "admin"
    || user.permissions.includes("costs.view")
    || user.permissions.includes("products.edit")
    || user.permissions.includes("purchases.create")
    || user.permissions.includes("purchases.view")
  ) return rows;
  return rows.map((row) => {
    const next = { ...row };
    delete next.purchase_price;
    delete next.last_purchase_price;
    delete next.last_buy_price;
    return next;
  });
}

async function attachLastBuy(db: AppDb, products: { id: number; supplier_name?: string; last_purchase_price?: number; purchase_price?: number }[]) {
  if (!products.length) return products;
  try {
    const ids = products.map((p) => p.id);
    const ph = ids.map(() => "?").join(",");
    const fromPurchases = await db
      .prepare(
        `SELECT pii.product_id, s.name as supplier_name, pii.unit_cost, pi.date
         FROM purchase_invoice_items pii
         JOIN purchase_invoices pi ON pi.id = pii.purchase_id
         LEFT JOIN suppliers s ON s.id = pi.supplier_id
         WHERE pii.product_id IN (${ph})
           AND IFNULL(pi.deleted_at,'') = ''
           AND IFNULL(pi.status,'') NOT IN ('void','rejected')
         ORDER BY pi.date DESC, pii.id DESC`,
      )
      .bind(...ids)
      .all<{ product_id: number; supplier_name: string | null; unit_cost: number; date: string }>();
    const fromSpp = await db
      .prepare(
        `SELECT spp.product_id, s.name as supplier_name, spp.unit_cost, spp.last_date as date
         FROM supplier_product_prices spp
         JOIN suppliers s ON s.id = spp.supplier_id
         WHERE spp.product_id IN (${ph})
         ORDER BY spp.last_date DESC, spp.id DESC`,
      )
      .bind(...ids)
      .all<{ product_id: number; supplier_name: string | null; unit_cost: number; date: string }>();
    const latest = new Map<number, { supplier_name: string; unit_cost: number }>();
    for (const row of [...(fromPurchases.results || []), ...(fromSpp.results || [])]) {
      if (latest.has(row.product_id)) continue;
      latest.set(row.product_id, { supplier_name: String(row.supplier_name || "").trim(), unit_cost: Number(row.unit_cost || 0) });
    }
    return products.map((p) => {
      const hit = latest.get(p.id);
      return {
        ...p,
        last_supplier_name: hit?.supplier_name || p.supplier_name || "",
        last_buy_price: hit?.unit_cost || Number(p.last_purchase_price || p.purchase_price || 0),
      };
    });
  } catch {
    return products.map((p) => ({
      ...p,
      last_supplier_name: p.supplier_name || "",
      last_buy_price: Number(p.last_purchase_price || p.purchase_price || 0),
    }));
  }
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

async function attachStockReport(db: AppDb, products: { id: number }[], locIds: number[] | null = null) {
  if (!products.length) return products as (typeof products[number] & Record<string, unknown>)[];
  try {
  const ids = products.map((p) => p.id);
  const ph = ids.map(() => "?").join(",");
  const locFilter = locIds?.length ? ` AND location_id IN (${locIds.map(() => "?").join(",")})` : "";
  const locBinds = locIds?.length ? locIds : [];
  const opening = await db
    .prepare(
      `SELECT product_id, COALESCE(SUM(original_qty),0) as opening_qty
       FROM inventory_batches
       WHERE product_id IN (${ph}) AND (notes = 'opening' OR notes LIKE 'كمية افتتاحية%')${locFilter}
       GROUP BY product_id`,
    )
    .bind(...ids, ...locBinds)
    .all<{ product_id: number; opening_qty: number }>();
  const openingMoves = await db
    .prepare(
      `SELECT product_id, COALESCE(SUM(ABS(qty)),0) as opening_qty
       FROM stock_movements
       WHERE product_id IN (${ph}) AND reference_type = 'opening'
       GROUP BY product_id`,
    )
    .bind(...ids)
    .all<{ product_id: number; opening_qty: number }>();
  const warehouses = await db
    .prepare(
      `SELECT ib.product_id, sl.warehouse, sl.box, sl.rack, sl.shelf, sl.drawer, sl.name as location_name,
              COALESCE(SUM(GREATEST(COALESCE(ib.remaining_qty,0) - COALESCE(ib.reserved_qty,0), 0)),0) as qty,
              COALESCE(SUM(GREATEST(COALESCE(ib.remaining_qty,0) - COALESCE(ib.reserved_qty,0), 0) * COALESCE(ib.unit_cost,0)),0) as value
       FROM inventory_batches ib
       LEFT JOIN storage_locations sl ON sl.id = ib.location_id
       WHERE ib.product_id IN (${ph})${locFilter.replace("location_id", "ib.location_id")}
       GROUP BY ib.product_id, sl.id, sl.warehouse, sl.box, sl.rack, sl.shelf, sl.drawer, sl.name`,
    )
    .bind(...ids, ...locBinds)
    .all<{ product_id: number; warehouse: string | null; box: string | null; rack: string | null; shelf: string | null; drawer: string | null; location_name: string | null; qty: number; value: number }>();
  const costs = await db
    .prepare(
      `SELECT product_id, COALESCE(SUM(GREATEST(COALESCE(remaining_qty,0) - COALESCE(reserved_qty,0), 0) * COALESCE(unit_cost,0)),0) as cost_value
       FROM inventory_batches
       WHERE product_id IN (${ph})${locFilter}
       GROUP BY product_id`,
    )
    .bind(...ids, ...locBinds)
    .all<{ product_id: number; cost_value: number }>();
  const openMap = new Map<number, number>();
  for (const r of opening.results) openMap.set(r.product_id, Number(r.opening_qty) || 0);
  for (const r of openingMoves.results) {
    const prev = openMap.get(r.product_id) || 0;
    openMap.set(r.product_id, Math.max(prev, Number(r.opening_qty) || 0));
  }
  const whMap = new Map<number, { warehouse: string; qty: number; value: number }[]>();
  for (const r of warehouses.results) {
    const arr = whMap.get(r.product_id) || [];
    arr.push({ warehouse: placeLabel(r), qty: Number(r.qty) || 0, value: Number(r.value) || 0 });
    whMap.set(r.product_id, arr);
  }
  const costMap = new Map(costs.results.map((r) => [r.product_id, Number(r.cost_value) || 0]));
  return products.map((p) => {
    const available = Number((p as { available?: number }).available) || 0;
    const price = Number((p as { selling_price?: number }).selling_price) || 0;
    const fromLoc = placeLabel(p as { warehouse?: string; box?: string; rack?: string; shelf?: string; drawer?: string; location_name?: string });
    return {
      ...p,
      opening_qty: openMap.get(p.id) || 0,
      warehouses: whMap.get(p.id) || (fromLoc ? [{ warehouse: fromLoc, qty: available, value: 0 }] : []),
      stock_value: Math.round(available * price * 100) / 100,
      cost_value: costMap.get(p.id) || 0,
    };
  });
  } catch {
    return products.map((p) => ({
      ...p,
      opening_qty: 0,
      warehouses: [],
      stock_value: Math.round((Number((p as { available?: number }).available) || 0) * (Number((p as { selling_price?: number }).selling_price) || 0) * 100) / 100,
      cost_value: 0,
    }));
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
  applyEq(where, params, "p.id", p.product_id, true);
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
  const stockIds = await stockScopeIds(c.env.DB, p);
  const stockExpr = scopedStockJoin(stockIds);
  if (stockIds) {
    if (!stockIds.length) {
      where.push("1=0");
    } else {
      const ph = stockIds.map(() => "?").join(",");
      where.push(`(COALESCE(p.kind,'product') = 'service' OR p.location_id IN (${ph}) OR EXISTS (
        SELECT 1 FROM inventory_batches ib WHERE ib.product_id = p.id AND ib.location_id IN (${ph})
      ))`);
      params.push(...stockIds, ...stockIds);
    }
  }
  applyRange(where, params, "p.selling_price", p.price_min, p.price_max);
  applyRange(where, params, stockExpr.availSql, p.qty_min, p.qty_max);
  if (status === "low") where.push(`p.kind != 'service' AND ${stockExpr.availSql} > 0 AND ${stockExpr.availSql} <= CASE WHEN COALESCE(p.reorder_point,0) > COALESCE(p.min_stock,0) THEN p.reorder_point ELSE p.min_stock END`);
  if (status === "out") where.push(`p.kind != 'service' AND ${stockExpr.availSql} <= 0`);
  if (status === "in") where.push(`p.kind = 'service' OR ${stockExpr.availSql} > CASE WHEN COALESCE(p.reorder_point,0) > COALESCE(p.min_stock,0) THEN p.reorder_point ELSE p.min_stock END`);
  if (status === "dead") {
    where.push(`p.kind != 'service' AND ${stockExpr.availSql} > 0 AND p.id NOT IN (
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
    LEFT JOIN storage_locations sl ON sl.id = p.location_id
    ${stockExpr.join}`;
  const queryBinds = [...stockExpr.binds, ...params];
  const qtySort =
    p.sort === "qty_high" ? `ORDER BY ${stockExpr.availSql} DESC`
    : p.sort === "qty_low" ? `ORDER BY ${stockExpr.availSql} ASC`
    : "";
  const posMode = url.searchParams.get("pos") === "1";
  const order = qtySort || sortSql(p.sort === "moved" ? "" : p.sort, PRODUCT_SORT, p.sort === "moved"
    ? `(SELECT COALESCE(SUM(ABS(sm.qty)),0) FROM stock_movements sm WHERE sm.product_id = p.id) DESC, p.id DESC`
    : "p.id ASC");
  const listQ = c.env.DB
    .prepare(`${productSelectSql(stockExpr.availSql, stockExpr.join)} ${whereSql} ${order} LIMIT ? OFFSET ?`)
    .bind(...queryBinds, pageSize, offset)
    .all();
  const countQ = c.env.DB.prepare(`SELECT COUNT(*) as n ${joinSql} ${whereSql}`).bind(...queryBinds).first<{ n: number }>();
  const totalsQ = posMode
    ? Promise.resolve({ qty: 0, value: 0 } as { qty: number; value: number })
    : c.env.DB
        .prepare(
          `SELECT COALESCE(SUM(CASE WHEN p.kind='service' THEN 0 ELSE ${stockExpr.availSql} END),0) as qty,
                  COALESCE(SUM(CASE WHEN p.kind='service' THEN 0 ELSE ${stockExpr.availSql} * p.selling_price END),0) as value
           ${joinSql} ${whereSql}`,
        )
        .bind(...queryBinds)
        .first<{ qty: number; value: number }>();
  const [{ results }, count, totals] = await Promise.all([listQ, countQ, totalsQ]);
  const light = url.searchParams.get("full") !== "1";
  const withModels = posMode ? (results as { id: number }[]) : await attachModels(c.env.DB, results as { id: number }[]);
  const withUnits = light || posMode ? withModels : await attachUnits(c.env.DB, withModels);
  const user = c.get("user");
  const showCost = user.role_slug === "admin" || user.permissions.includes("costs.view") || user.permissions.includes("products.edit");
  let priced = withUnits as Record<string, unknown>[];
  const listId = Number(url.searchParams.get("price_list_id") || 0);
  if (listId && priced.length) {
    const ids = priced.map((p) => Number(p.id));
    const { results: prices } = await c.env.DB
      .prepare(`SELECT product_id, price FROM price_list_items WHERE price_list_id = ? AND product_id IN (${ids.map(() => "?").join(",")})`)
      .bind(listId, ...ids)
      .all<{ product_id: number; price: number }>();
    const map = new Map(prices.map((r) => [r.product_id, r.price]));
    for (const p of priced as { id: number; selling_price: number; list_price?: number }[]) {
      const price = map.get(p.id);
      if (price != null) {
        p.list_price = p.selling_price;
        p.selling_price = price;
      }
    }
  }
  const scoped = await applyStockScope(c.env.DB, priced, stockIds);
  let scopeWarehouseName = "";
  if (stockIds?.length) {
    const rootId = Number(p.location_id || p.warehouse_id || p.locations || 0);
    if (rootId) {
      const root = await c.env.DB
        .prepare("SELECT name, warehouse, kind FROM storage_locations WHERE id = ? AND deleted_at IS NULL")
        .bind(rootId)
        .first<{ name: string; warehouse: string | null; kind: string | null }>();
      scopeWarehouseName = String(root?.kind === "warehouse" ? root.name || root.warehouse : root?.name || root?.warehouse || "").trim();
    }
  }
  const reported = light
    ? scoped.map((p) => {
      const available = Number((p as { available?: number }).available) || 0;
      const price = Number((p as { selling_price?: number }).selling_price) || 0;
      const row = p as { warehouse?: string; box?: string; rack?: string; shelf?: string; drawer?: string; location_name?: string };
      const labeled = { ...row, warehouse: scopeWarehouseName || row.warehouse };
      const label = placeLabel(labeled);
      return {
        ...p,
        warehouse: labeled.warehouse,
        opening_qty: Number((p as { current_stock?: number }).current_stock) || 0,
        warehouses: label ? [{ warehouse: label, qty: available, value: 0 }] : [],
        stock_value: Math.round(available * price * 100) / 100,
        cost_value: 0,
      };
    })
    : await attachStockReport(c.env.DB, scoped as { id: number }[], stockIds);
  const withBuy = await attachLastBuy(c.env.DB, reported as { id: number; supplier_name?: string; last_purchase_price?: number; purchase_price?: number }[]);
  const data = withoutCost(user, withBuy as Record<string, unknown>[]);
  if (!showCost) {
    for (const row of data) delete row.cost_value;
  }
  const scopedQty = Number(totals?.qty) || 0;
  const scopedValue = Number(totals?.value) || 0;
  return c.json({
    data,
    total: count?.n || 0,
    page,
    pageSize,
    stock_scope: stockIds,
    totals: {
      count: count?.n || 0,
      qty: scopedQty,
      value: scopedValue,
      cost_value: showCost ? data.reduce((s, p) => s + (Number(p.cost_value) || 0), 0) : undefined,
    },
  });
});

catalogRoutes.get("/products/search", requirePerm("products.view", "sales.create", "inventory.view", "purchases.create", "purchases.view"), async (c) => {
  const q = (new URL(c.req.url).searchParams.get("q") || "").trim();
  if (!q) return c.json({ data: [] });
  const l = like(q);
  const stockIds = await stockScopeIds(c.env.DB, listParams(new URL(c.req.url)));
  const stockExpr = scopedStockJoin(stockIds);
  const scopeWhere = stockIds?.length
    ? ` AND (COALESCE(p.kind,'product') = 'service' OR p.location_id IN (${stockIds.map(() => "?").join(",")}) OR EXISTS (
        SELECT 1 FROM inventory_batches ib WHERE ib.product_id = p.id AND ib.location_id IN (${stockIds.map(() => "?").join(",")})
      ))`
    : "";
  const { results } = await c.env.DB
    .prepare(
      `${productSelectSql(stockExpr.availSql, stockExpr.join)}
       WHERE p.deleted_at IS NULL AND p.active = 1 AND (
         p.barcode = ? OR p.sku = ? OR p.part_number = ? OR p.extra_code1 = ? OR p.extra_code2 = ?
         OR p.name_ar LIKE ? OR p.name_en LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ? OR p.part_number LIKE ?
         OR b.name_en LIKE ? OR b.name_ar LIKE ? OR pt.name_en LIKE ? OR pt.name_ar LIKE ?
         OR EXISTS (SELECT 1 FROM product_units pu WHERE pu.product_id = p.id AND pu.barcode = ?)
         OR EXISTS (SELECT 1 FROM product_models pm JOIN device_models dm ON dm.id = pm.model_id
                    WHERE pm.product_id = p.id AND (dm.name LIKE ? OR dm.code LIKE ?))
       )${scopeWhere}
       ORDER BY CASE
         WHEN p.barcode = ? OR p.sku = ? OR p.extra_code1 = ? THEN 0
         WHEN p.name_ar LIKE ? OR p.name_en LIKE ? THEN 1
         WHEN p.sku LIKE ? OR p.barcode LIKE ? THEN 2
         ELSE 3
       END, p.name_ar
       LIMIT 30`,
    )
    .bind(
      ...stockExpr.binds,
      q, q, q, q, q, l, l, l, l, l, l, l, l, l, q, l, l,
      ...(stockIds?.length ? [...stockIds, ...stockIds] : []),
      q, q, q, `${q}%`, `${q}%`, `${q}%`, `${q}%`,
    )
    .all();
  const withModels = await attachModels(c.env.DB, results as { id: number }[]);
  const withUnits = await attachUnits(c.env.DB, withModels);
  const withBuy = await attachLastBuy(c.env.DB, withUnits as { id: number; supplier_name?: string; last_purchase_price?: number; purchase_price?: number }[]);
  const data = withoutCost(
    c.get("user"),
    await applyStockScope(c.env.DB, withBuy as Record<string, unknown>[], stockIds),
  );
  return c.json({ data });
});

catalogRoutes.get("/products/:id", requirePerm("products.view", "sales.create"), async (c) => {
  const id = Number(c.req.param("id"));
  const row = await c.env.DB.prepare(`${productSelect} WHERE p.id = ? AND p.deleted_at IS NULL`).bind(id).first();
  if (!row) return c.json({ error: "not_found" }, 404);
  const stockIds = await stockScopeIds(c.env.DB, listParams(new URL(c.req.url)));
  const scoped = await applyStockScope(c.env.DB, [row as Record<string, unknown>], stockIds);
  const withModels = await attachModels(c.env.DB, scoped as { id: number }[]);
  const withUnits = await attachUnits(c.env.DB, withModels);
  const withBuy = await attachLastBuy(c.env.DB, withUnits as { id: number; supplier_name?: string; last_purchase_price?: number; purchase_price?: number }[]);
  const batches = await availableBatches(c.env.DB, id, stockIds || undefined);
  const allBatches = await c.env.DB
    .prepare("SELECT * FROM inventory_batches WHERE product_id = ? ORDER BY purchase_date DESC")
    .bind(id)
    .all();
  return c.json({ data: { ...withBuy[0], batches: allBatches.results, available_batches: batches } });
});

catalogRoutes.post("/products", requirePerm("products.create"), async (c) => {
  const b = await c.req.json<Record<string, unknown>>();
  const sku = String(b.sku || "").trim();
  if (!sku || !b.name_ar) return c.json({ error: "missing_fields" }, 400);
  b.location_id = await resolveProductPlace(c.env.DB, {
    warehouse: String(b.warehouse || ""),
    box: String(b.box || ""),
    rack: String(b.rack || ""),
    shelf: String(b.shelf || ""),
    drawer: String(b.drawer || ""),
    locationId: b.location_id ? Number(b.location_id) : null,
  });
  let result;
  try {
    result = await c.env.DB
      .prepare(
        `INSERT INTO products (sku, barcode, part_number, name_ar, name_en, brand_id, part_type_id, category_id, location_id, supplier_id,
          purchase_price, last_purchase_price, selling_price, wholesale_price, min_selling_price, min_stock, image_url, description, notes, active, kind)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        Number(b.last_purchase_price || b.purchase_price || 0),
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
  } catch (err) {
    if (isDupEntry(err)) return c.json({ error: "duplicate_sku" }, 400);
    throw err;
  }
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
    const locId = b.location_id ? Number(b.location_id) : null;
    const ins = await c.env.DB
      .prepare(
        `INSERT INTO inventory_batches (batch_code, product_id, purchase_date, original_qty, remaining_qty, reserved_qty, unit_cost, expiry_date, notes, location_id)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?, 'opening', ?)`,
      )
      .bind(code, id, todayIso(), openQty, openQty, cost, b.expiry_date || null, locId)
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
      toLocationId: locId,
    });
  }
  await audit(c.env.DB, c.get("user"), "create_product", "product", id, `Create ${sku}`);
  return c.json({ id }, 201);
});

catalogRoutes.put("/products/:id", requirePerm("products.edit"), async (c) => {
  const id = Number(c.req.param("id"));
  const prev = await c.env.DB.prepare("SELECT sku, name_ar, selling_price, min_selling_price, purchase_price, active, kind FROM products WHERE id = ?").bind(id).first();
  const b = await c.req.json<Record<string, unknown>>();
  b.location_id = await resolveProductPlace(c.env.DB, {
    warehouse: String(b.warehouse || ""),
    box: String(b.box || ""),
    rack: String(b.rack || ""),
    shelf: String(b.shelf || ""),
    drawer: String(b.drawer || ""),
    locationId: b.location_id ? Number(b.location_id) : null,
  });
  try {
    await c.env.DB
      .prepare(
        `UPDATE products SET sku=?, barcode=?, part_number=?, name_ar=?, name_en=?, brand_id=?, part_type_id=?, category_id=?, location_id=?, supplier_id=?,
         purchase_price=?, last_purchase_price=?, selling_price=?, wholesale_price=?, min_selling_price=?, min_stock=?, image_url=?, description=?, notes=?, active=?, kind=?, updated_at=datetime('now')
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
        Number(b.last_purchase_price || b.purchase_price || 0),
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
  } catch (err) {
    if (isDupEntry(err)) return c.json({ error: "duplicate_sku" }, 400);
    throw err;
  }
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

catalogRoutes.get("/qualities", requirePerm("categories.manage", "products.view", "sales.create"), async (c) => {
  const { results } = await c.env.DB
    .prepare("SELECT TRIM(quality) as name, COUNT(*) as products FROM products WHERE (deleted_at IS NULL OR deleted_at = '') AND TRIM(IFNULL(quality,'')) != '' GROUP BY TRIM(quality) ORDER BY name")
    .all<{ name: string; products: number }>();
  return c.json({ data: results || [] });
});

catalogRoutes.put("/qualities", requirePerm("categories.manage"), async (c) => {
  const b = await c.req.json<{ from?: string; to?: string }>();
  const from = String(b.from || "").trim();
  const to = String(b.to || "").trim();
  if (!from || !to) return c.json({ error: "missing_name" }, 400);
  await c.env.DB.prepare("UPDATE products SET quality = ? WHERE TRIM(quality) = ? AND (deleted_at IS NULL OR deleted_at = '')").bind(to, from).run();
  await audit(c.env.DB, c.get("user"), "rename_quality", "product", 0, `${from} -> ${to}`);
  return c.json({ ok: true });
});

catalogRoutes.delete("/qualities", requirePerm("categories.manage"), async (c) => {
  const b = await c.req.json<{ name?: string }>().catch(() => ({ name: "" }));
  const name = String(b.name || c.req.query("name") || "").trim();
  if (!name) return c.json({ error: "missing_name" }, 400);
  await c.env.DB.prepare("UPDATE products SET quality = NULL WHERE TRIM(quality) = ? AND (deleted_at IS NULL OR deleted_at = '')").bind(name).run();
  await audit(c.env.DB, c.get("user"), "clear_quality", "product", 0, name);
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
    applySearch(where, params, p.q, searchCols.length ? searchCols : [sqlText("id")]);
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
    return c.json({ data: table === "storage_locations" ? withLocationLabels(rows as { id: number; name: string }[]) : rows });
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
