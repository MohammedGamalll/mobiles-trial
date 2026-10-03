import * as XLSX from "xlsx";
import type { AppDb } from "./db";
import { nextNumber, todayIso } from "./helpers";
import { logMovement } from "./stock";

export type ProductImportRow = {
  sku: string;
  name_ar: string;
  name_en: string;
  qty: number;
  unit: string;
  selling_price: number;
  purchase_price: number;
  last_purchase_price: number;
  barcode: string;
  extra_code1: string;
  extra_code2: string;
  quality: string;
  part_type: string;
  brand: string;
  supplier: string;
  box: string;
  location: string;
  rack: string;
  shelf: string;
  drawer: string;
  model: string;
};

const HEADER_ALIASES: Record<string, keyof ProductImportRow> = {
  sku: "sku",
  barcode: "barcode",
  name: "name_ar",
  name_ar: "name_ar",
  name_en: "name_en",
  unit: "unit",
  qty: "qty",
  quantity: "qty",
  selling_price: "selling_price",
  purchase_price: "purchase_price",
  last_purchase_price: "last_purchase_price",
  extra_code1: "extra_code1",
  extra_code2: "extra_code2",
  quality: "quality",
  category: "quality",
  brand: "brand",
  supplier: "supplier",
  part_type: "part_type",
  location: "location",
  box: "box",
  رقم_الصنف: "sku",
  رقمالصنف: "sku",
  اسم_الصنف: "name_ar",
  اسمالصنف: "name_ar",
  اجمالي_الكمية: "qty",
  إجمالى_الكمية: "qty",
  إجمالي_الكمية: "qty",
  الوحدة: "unit",
  سعر_البيع: "selling_price",
  متوسط_سعر_الشراء: "purchase_price",
  اخر_سعر_شراء: "last_purchase_price",
  آخر_سعر_شراء: "last_purchase_price",
  باركود: "barcode",
  كود_الصنف_1: "extra_code1",
  كود_الصنف1: "extra_code1",
  التصنيف: "quality",
  النوع: "part_type",
  الماركه: "brand",
  الماركة: "brand",
  المورد: "supplier",
  بكيه: "box",
  "رف+شوكه+درج": "location",
  رف_شوكه_درج: "location",
  رف_شوكة_درج: "location",
  المكان: "location",
  الموقع: "location",
  الرف: "location",
  الموديل: "model",
  موديل: "model",
  model: "model",
  models: "model",
  الكميه: "qty",
  الكمية: "qty",
  سعرالبيع: "selling_price",
  سعر_الشراء: "purchase_price",
  متوسط_الشراء: "purchase_price",
  كود_الصنف: "extra_code1",
};

function cellStr(v: unknown) {
  if (v == null) return "";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return String(v).replace(/\u00a0/g, " ").trim();
}

function cellNum(v: unknown) {
  const s = cellStr(v)
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/,/g, "")
    .replace(/[^\d.-]/g, "");
  if (!s || s === "-" || s === ".") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function normHeader(raw: unknown) {
  return cellStr(raw)
    .replace(/[ًٌٍَُِّْ]/g, "")
    .replace(/ى/g, "ي")
    .replace(/أ|إ|آ/g, "ا")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function normName(raw: string) {
  const s = raw.replace(/\s+/g, " ").trim();
  if (!s) return "";
  const yeh = s.replace(/ى/g, "ي");
  if (yeh === "الوزيري" || yeh === "الوزيرى") return "الوزيري";
  if (s.toLowerCase() === "stop") return "STOP";
  return s;
}

function headerKey(raw: unknown): keyof ProductImportRow | null {
  const exact = HEADER_ALIASES[normHeader(raw)] || HEADER_ALIASES[cellStr(raw)];
  if (exact) return exact;
  const n = normHeader(raw);
  if (!n) return null;
  if (n.includes("رقم_الصنف") || n === "sku") return "sku";
  if (n.includes("اسم_الصنف") || n === "name") return "name_ar";
  if (n.includes("كمي")) return "qty";
  if (n.includes("وحد")) return "unit";
  if (n.includes("سعر_البيع") || n.includes("سعرالبيع")) return "selling_price";
  if (n.includes("متوسط") || n.includes("سعر_الشراء")) return "purchase_price";
  if (n.includes("اخر_سعر") || n.includes("آخر_سعر") || n.includes("last_purchase")) return "last_purchase_price";
  if (n.includes("باركود") || n.includes("barcode")) return "barcode";
  if (n.includes("كود_الصنف") || n.includes("extra_code")) return "extra_code1";
  if (n.includes("تصنيف") || n.includes("category")) return "quality";
  if (n.includes("نوع") || n.includes("part_type")) return "part_type";
  if (n.includes("مارك") || n.includes("brand")) return "brand";
  if (n.includes("مورد") || n.includes("supplier")) return "supplier";
  if (n.includes("بكيه") || n === "box") return "box";
  if (n.includes("رف") || n.includes("شوك") || n.includes("درج") || n.includes("مكان") || n.includes("موقع")) return "location";
  if (n.includes("موديل") || n.includes("model")) return "model";
  return null;
}

function headerIndex(row: unknown[]) {
  const map: Partial<Record<keyof ProductImportRow, number>> = {};
  row.forEach((cell, i) => {
    const key = headerKey(cell);
    if (key && map[key] == null) map[key] = i;
  });
  return map.sku != null && map.name_ar != null ? map : null;
}

function parseBin(raw: string) {
  const s = raw.replace(/رف|شوكة|شوكه|درج/g, " ").replace(/\s+/g, " ").trim();
  const parts = s.split(/[+\/|,،\-]+/).map((p) => p.trim()).filter(Boolean);
  return { rack: parts[0] || "", shelf: parts[1] || "", drawer: parts[2] || "" };
}

export function parseProductGrid(grid: unknown[][]): ProductImportRow[] {
  let map: Partial<Record<keyof ProductImportRow, number>> | null = null;
  let start = 0;
  for (let i = 0; i < Math.min(grid.length, 12); i++) {
    const hit = headerIndex(grid[i] || []);
    if (hit) {
      map = hit;
      start = i + 1;
      break;
    }
  }
  if (!map) throw new Error("missing_headers");
  const out: ProductImportRow[] = [];
  for (let i = start; i < grid.length; i++) {
    const row = grid[i] || [];
    const get = (k: keyof ProductImportRow) => (map![k] != null ? row[map![k] as number] : "");
    const sku = cellStr(get("sku"));
    const name = cellStr(get("name_ar"));
    if (!sku && !name) continue;
    if (!sku || !name) continue;
    const avgBuy = cellNum(get("purchase_price"));
    const lastBuy = cellNum(get("last_purchase_price"));
    const locRaw = cellStr(get("location"));
    const bin = parseBin(locRaw);
    out.push({
      sku,
      name_ar: name,
      name_en: cellStr(get("name_en")) || name,
      qty: cellNum(get("qty")),
      unit: cellStr(get("unit")) || "قطعة",
      selling_price: cellNum(get("selling_price")),
      purchase_price: avgBuy || lastBuy,
      last_purchase_price: lastBuy || avgBuy,
      barcode: cellStr(get("barcode")),
      extra_code1: cellStr(get("extra_code1")),
      extra_code2: cellStr(get("extra_code2")) || cellStr(get("box")),
      quality: normName(cellStr(get("quality"))),
      part_type: normName(cellStr(get("part_type"))),
      brand: normName(cellStr(get("brand"))),
      supplier: normName(cellStr(get("supplier"))),
      box: cellStr(get("box")),
      location: locRaw,
      rack: bin.rack,
      shelf: bin.shelf,
      drawer: bin.drawer,
      model: cellStr(get("model")) || name,
    });
  }
  return out;
}

export function parseProductWorkbook(buf: ArrayBuffer | Buffer, filename = "") {
  const name = filename.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    const text = typeof buf === "string" ? buf : Buffer.from(buf as ArrayBuffer).toString("utf8");
    const wb = XLSX.read(text.replace(/^\uFEFF/, ""), { type: "string" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return parseProductGrid(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][]);
  }
  const wb = XLSX.read(buf, { type: "buffer", cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return parseProductGrid(XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" }) as unknown[][]);
}

async function ensurePair(db: AppDb, table: "brands" | "part_types" | "categories", cache: Map<string, number>, name: string) {
  const n = name.trim();
  if (!n) return null;
  const key = `${table}:${n.toLowerCase()}`;
  if (cache.has(key)) return cache.get(key)!;
  const found = await db
    .prepare(`SELECT id FROM ${table} WHERE deleted_at IS NULL AND (name_ar = ? OR name_en = ?) LIMIT 1`)
    .bind(n, n)
    .first<{ id: number }>();
  if (found?.id) {
    cache.set(key, found.id);
    return found.id;
  }
  const ins = await db.prepare(`INSERT INTO ${table} (name_ar, name_en, active) VALUES (?, ?, 1)`).bind(n, n).run();
  cache.set(key, ins.meta.last_row_id);
  return ins.meta.last_row_id;
}

async function ensureSupplier(db: AppDb, cache: Map<string, number>, name: string) {
  const n = name.trim();
  if (!n) return null;
  const key = `sup:${n.toLowerCase()}`;
  if (cache.has(key)) return cache.get(key)!;
  const found = await db.prepare("SELECT id FROM suppliers WHERE deleted_at IS NULL AND name = ? LIMIT 1").bind(n).first<{ id: number }>();
  if (found?.id) {
    cache.set(key, found.id);
    return found.id;
  }
  const ins = await db.prepare("INSERT INTO suppliers (name, active) VALUES (?, 1)").bind(n).run();
  cache.set(key, ins.meta.last_row_id);
  return ins.meta.last_row_id;
}

async function ensureLocation(db: AppDb, cache: Map<string, number>, row: ProductImportRow) {
  const rack = row.rack || row.location.trim();
  if (!rack && !row.shelf && !row.drawer && !row.box) return null;
  const label = ["رف " + (row.rack || rack), row.shelf ? "شوكة " + row.shelf : "", row.drawer ? "درج " + row.drawer : ""].filter(Boolean).join(" ");
  const key = `loc:${label}:${row.box}`;
  if (cache.has(key)) return cache.get(key)!;
  const found = await db.prepare("SELECT id FROM storage_locations WHERE deleted_at IS NULL AND name = ? LIMIT 1").bind(label).first<{ id: number }>();
  if (found?.id) {
    cache.set(key, found.id);
    return found.id;
  }
  const ins = await db
    .prepare("INSERT INTO storage_locations (name, warehouse, rack, shelf, drawer, box, active) VALUES (?, ?, ?, ?, ?, ?, 1)")
    .bind(label, "المخزن الرئيسي", row.rack || rack || null, row.shelf || null, row.drawer || null, row.box || null)
    .run();
  cache.set(key, ins.meta.last_row_id);
  return ins.meta.last_row_id;
}

async function ensureModels(db: AppDb, cache: Map<string, number>, brandId: number | null, raw: string) {
  if (!brandId || !raw.trim()) return [] as number[];
  const parts = raw.split(/[\/|,،]+/).map((s) => s.replace(/\s+/g, " ").trim()).filter((s) => s.length >= 2);
  const names = (parts.length > 1 ? parts : [raw.replace(/\s+/g, " ").trim()]).slice(0, 6);
  const ids: number[] = [];
  for (const name of names) {
    const key = `model:${brandId}:${name.toLowerCase()}`;
    let id = cache.get(key);
    if (!id) {
      const found = await db
        .prepare("SELECT id FROM device_models WHERE deleted_at IS NULL AND brand_id = ? AND name = ? LIMIT 1")
        .bind(brandId, name)
        .first<{ id: number }>();
      if (found?.id) id = found.id;
      else {
        const ins = await db.prepare("INSERT INTO device_models (brand_id, name, code, active) VALUES (?, ?, ?, 1)").bind(brandId, name, name).run();
        id = ins.meta.last_row_id;
      }
      cache.set(key, id);
    }
    if (id) ids.push(id);
  }
  return ids;
}

export async function importProductRows(db: AppDb, rows: ProductImportRow[], opts: { replace?: boolean; userId?: number } = {}) {
  if (opts.replace) {
    await db
      .prepare("UPDATE products SET sku = CONCAT('old-', id, '-', sku), deleted_at = datetime('now'), active = 0 WHERE deleted_at IS NULL")
      .run();
  }
  const cache = new Map<string, number>();
  let inserted = 0;
  let skipped = 0;
  const errors: { sku: string; error: string }[] = [];
  for (const r of rows) {
    try {
      if (!opts.replace) {
        const exists = await db.prepare("SELECT id FROM products WHERE sku = ? AND deleted_at IS NULL").bind(r.sku).first();
        if (exists) {
          skipped += 1;
          continue;
        }
      }
      const brandId = await ensurePair(db, "brands", cache, r.brand);
      const typeId = await ensurePair(db, "part_types", cache, r.part_type);
      const catId = await ensurePair(db, "categories", cache, r.quality);
      const supplierId = await ensureSupplier(db, cache, r.supplier);
      const locationId = await ensureLocation(db, cache, r);
      const modelIds = await ensureModels(db, cache, brandId, r.model);
      const ins = await db
        .prepare(
          `INSERT INTO products (sku, barcode, part_number, name_ar, name_en, brand_id, part_type_id, category_id, location_id, supplier_id,
            purchase_price, selling_price, wholesale_price, min_selling_price, min_stock, description, notes, active, kind, quality, unit,
            extra_code1, extra_code2, price_2)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 1, 'product', ?, ?, ?, ?, ?)`,
        )
        .bind(
          r.sku,
          r.barcode || null,
          r.sku,
          r.name_ar,
          r.name_en,
          brandId,
          typeId,
          catId,
          locationId,
          supplierId,
          r.purchase_price,
          r.selling_price,
          0,
          0,
          null,
          null,
          r.quality || null,
          r.unit || "قطعة",
          r.extra_code1 || null,
          r.extra_code2 || null,
          r.last_purchase_price,
        )
        .run();
      const id = ins.meta.last_row_id;
      try {
        await db.prepare("UPDATE products SET last_purchase_price = ? WHERE id = ?").bind(r.last_purchase_price, id).run();
      } catch {
        /* column may be missing on older DBs */
      }
      for (const mid of modelIds) {
        try {
          await db.prepare("INSERT OR IGNORE INTO product_models (product_id, model_id) VALUES (?, ?)").bind(id, mid).run();
        } catch {
          /* ignore duplicate model link */
        }
      }
      if (r.qty > 0) {
        const code = await nextNumber(db, "batch");
        const batch = await db
          .prepare(
            `INSERT INTO inventory_batches (batch_code, product_id, purchase_date, original_qty, remaining_qty, reserved_qty, unit_cost, notes, location_id)
             VALUES (?, ?, ?, ?, ?, 0, ?, 'opening', ?)`,
          )
          .bind(code, id, todayIso(), r.qty, r.qty, r.purchase_price, locationId)
          .run();
        await db.prepare("UPDATE products SET current_stock = current_stock + ?, updated_at = datetime('now') WHERE id = ?").bind(r.qty, id).run();
        await logMovement(db, {
          productId: id,
          batchId: batch.meta.last_row_id,
          type: "in",
          qty: r.qty,
          unitCost: r.purchase_price,
          referenceType: "opening",
          referenceId: id,
          notes: "كمية افتتاحية",
          userId: opts.userId ?? null,
          toLocationId: locationId,
        });
      }
      inserted += 1;
    } catch (e) {
      skipped += 1;
      errors.push({ sku: r.sku, error: e instanceof Error ? e.message : "fail" });
    }
  }
  return { inserted, skipped, total: rows.length, errors: errors.slice(0, 20) };
}
