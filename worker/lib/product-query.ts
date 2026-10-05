import type { AppDb } from "./db";
import { like } from "./helpers";
import { applyEq, applyRange, listParams, PRODUCT_SORT, sortSql, stockScopeIds } from "./filters";

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

function productSelectSql(availSql: string, stockJoin = "") {
  return `
  SELECT p.*, b.name_ar as brand_ar, b.name_en as brand_en,
    pt.name_ar as part_type_ar, pt.name_en as part_type_en,
    c.name_ar as category_ar, c.name_en as category_en,
    sl.name as location_name, sl.warehouse, sl.rack, sl.shelf, sl.drawer, sl.box,
    s.name as supplier_name,
    CASE WHEN p.kind = 'service' THEN 9999 ELSE ${availSql} END as available
  FROM products p
  LEFT JOIN brands b ON b.id = p.brand_id
  LEFT JOIN part_types pt ON pt.id = p.part_type_id
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN storage_locations sl ON sl.id = p.location_id
  LEFT JOIN suppliers s ON s.id = p.supplier_id
  ${stockJoin}
`;
}

export async function listFilteredProducts(db: AppDb, url: URL, limit = 8000) {
  const p = listParams(url);
  const q = (p.q || "").trim();
  const where: string[] = ["p.deleted_at IS NULL"];
  const params: (string | number)[] = [];
  if (p.brand_id) {
    where.push("p.brand_id = ?");
    params.push(Number(p.brand_id));
  }
  if (p.part_type_id) {
    where.push("p.part_type_id = ?");
    params.push(Number(p.part_type_id));
  }
  if (p.category_id) {
    where.push("p.category_id = ?");
    params.push(Number(p.category_id));
  }
  if (p.model_id) {
    where.push("EXISTS (SELECT 1 FROM product_models pm WHERE pm.product_id = p.id AND pm.model_id = ?)");
    params.push(Number(p.model_id));
  }
  if (p.compatible_model_id) {
    where.push("EXISTS (SELECT 1 FROM product_models pm WHERE pm.product_id = p.id AND pm.model_id = ?)");
    params.push(Number(p.compatible_model_id));
  }
  if (p.kind === "product" || p.kind === "service") {
    where.push("COALESCE(p.kind,'product') = ?");
    params.push(p.kind);
  }
  if (p.quick_list === "1") where.push("p.quick_list = 1");
  applyEq(where, params, "p.quality", p.quality);
  applyEq(where, params, "p.color", p.color);
  applyEq(where, params, "p.supplier_id", p.supplier_id, true);
  applyEq(where, params, "p.active", p.active, true);
  const stockIds = await stockScopeIds(db, p);
  const stockExpr = scopedStockJoin(stockIds);
  if (stockIds) {
    if (!stockIds.length) where.push("1=0");
    else {
      const ph = stockIds.map(() => "?").join(",");
      where.push(`(COALESCE(p.kind,'product') = 'service' OR p.location_id IN (${ph}) OR EXISTS (
        SELECT 1 FROM inventory_batches ib WHERE ib.product_id = p.id AND ib.location_id IN (${ph})
      ))`);
      params.push(...stockIds, ...stockIds);
    }
  }
  applyRange(where, params, "p.selling_price", p.price_min, p.price_max);
  applyRange(where, params, stockExpr.availSql, p.qty_min, p.qty_max);
  const status = p.status;
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
  const qtySort =
    p.sort === "qty_high" ? `ORDER BY ${stockExpr.availSql} DESC`
    : p.sort === "qty_low" ? `ORDER BY ${stockExpr.availSql} ASC`
    : "";
  const order = qtySort || sortSql(p.sort === "moved" ? "" : p.sort, PRODUCT_SORT, p.sort === "moved"
    ? `(SELECT COALESCE(SUM(ABS(sm.qty)),0) FROM stock_movements sm WHERE sm.product_id = p.id) DESC, p.id DESC`
    : "p.id DESC");
  const binds = [...stockExpr.binds, ...params];
  const { results } = await db
    .prepare(`${productSelectSql(stockExpr.availSql, stockExpr.join)} ${whereSql} ${order} LIMIT ?`)
    .bind(...binds, Math.min(Math.max(Number(limit) || 8000, 1), 20000))
    .all<Record<string, unknown>>();
  const rows = results || [];
  if (!rows.length) return rows;
  const ids = rows.map((r) => Number(r.id));
  const { results: models } = await db
    .prepare(
      `SELECT pm.product_id, dm.name
       FROM product_models pm JOIN device_models dm ON dm.id = pm.model_id
       WHERE pm.product_id IN (${ids.map(() => "?").join(",")})`,
    )
    .bind(...ids)
    .all<{ product_id: number; name: string }>();
  const map = new Map<number, string[]>();
  for (const m of models || []) {
    const arr = map.get(m.product_id) || [];
    arr.push(m.name);
    map.set(m.product_id, arr);
  }
  return rows.map((r) => ({ ...r, models: map.get(Number(r.id)) || [] }));
}

