import type { AppDb } from "./db";
import { nextNumber, todayIso, type AuthUser } from "./helpers";
import { applyIssue, availableBatches, logMovement, planAllocation } from "./stock";

export const DEMO_TAG = "__DEMO__";

export async function ensureDemoLog(db: AppDb) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS demo_seed_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL,
        row_id INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    )
    .run();
}

async function logRow(db: AppDb, table: string, id: number) {
  await db.prepare("INSERT INTO demo_seed_log (table_name, row_id) VALUES (?, ?)").bind(table, id).run();
}

async function idsOf(db: AppDb, table: string) {
  const { results } = await db.prepare("SELECT row_id FROM demo_seed_log WHERE table_name = ?").bind(table).all<{ row_id: number }>();
  return results.map((r) => r.row_id);
}

export async function demoStatus(db: AppDb) {
  await ensureDemoLog(db);
  const n = await db.prepare("SELECT COUNT(*) as n FROM demo_seed_log").first<{ n: number }>();
  const products = (await idsOf(db, "products")).length;
  const customers = (await idsOf(db, "customers")).length;
  const invoices = (await idsOf(db, "sales_invoices")).length;
  return { active: Number(n?.n || 0) > 0, products, customers, invoices };
}

async function lookupId(db: AppDb, sql: string) {
  const row = await db.prepare(sql).first<{ id: number }>();
  return row?.id || null;
}

export async function seedDemo(db: AppDb, user: AuthUser) {
  await ensureDemoLog(db);
  const status = await demoStatus(db);
  if (status.active) return { ...status, already: true as const };

  const brandId = await lookupId(db, "SELECT id FROM brands WHERE deleted_at IS NULL ORDER BY id LIMIT 1");
  const typeId = await lookupId(db, "SELECT id FROM part_types ORDER BY id LIMIT 1");
  const catId = await lookupId(db, "SELECT id FROM categories WHERE deleted_at IS NULL ORDER BY id LIMIT 1");
  const locId = await lookupId(db, "SELECT id FROM storage_locations WHERE deleted_at IS NULL ORDER BY id LIMIT 1");
  const modelId = await lookupId(db, "SELECT id FROM device_models WHERE deleted_at IS NULL ORDER BY id LIMIT 1");
  const expCat = await lookupId(db, "SELECT id FROM expense_categories ORDER BY id LIMIT 1");

  const sup = await db
    .prepare("INSERT INTO suppliers (name, phone, address, notes) VALUES (?, ?, ?, ?)")
    .bind("مورد تجريبي", "01000001000", "العاشر من رمضان", DEMO_TAG)
    .run();
  const supplierId = sup.meta.last_row_id;
  await logRow(db, "suppliers", supplierId);

  const customers = [
    ["أحمد فتحي", "01011112222", "التجمع الخامس", "retail"],
    ["منى عادل", "01033334444", "مدينة نصر", "retail"],
    ["كريم حسن", "01055556666", "فيصل", "wholesale"],
  ] as const;
  const customerIds: number[] = [];
  for (const [name, phone, area, type] of customers) {
    const r = await db
      .prepare("INSERT INTO customers (name, phone, whatsapp, area, notes, customer_type, credit_limit) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(name, phone, phone, area, DEMO_TAG, type, type === "wholesale" ? 20000 : 0)
      .run();
    await logRow(db, "customers", r.meta.last_row_id);
    customerIds.push(r.meta.last_row_id);
  }

  const catalog: { sku: string; name: string; nameEn: string; buy: number; sell: number; qty: number; kind?: string }[] = [
    { sku: "DEMO-SCR-IP13", name: "شاشة آيفون 13 تجريبية", nameEn: "Demo iPhone 13 screen", buy: 850, sell: 1250, qty: 12 },
    { sku: "DEMO-BAT-IP13", name: "بطارية آيفون 13 تجريبية", nameEn: "Demo iPhone 13 battery", buy: 220, sell: 380, qty: 20 },
    { sku: "DEMO-CHG-A54", name: "منفذ شحن A54 تجريبي", nameEn: "Demo A54 charging port", buy: 45, sell: 90, qty: 30 },
    { sku: "DEMO-ACC-CABLE", name: "كابل شحن تجريبي", nameEn: "Demo charging cable", buy: 15, sell: 45, qty: 40 },
    { sku: "DEMO-SCR-S23", name: "شاشة S23 تجريبية", nameEn: "Demo S23 screen", buy: 920, sell: 1400, qty: 8 },
    { sku: "DEMO-SVC-REP", name: "خدمة صيانة تجريبية", nameEn: "Demo repair service", buy: 0, sell: 150, qty: 0, kind: "service" },
  ];
  const productIds: number[] = [];
  for (const p of catalog) {
    const exist = await db.prepare("SELECT id FROM products WHERE sku = ?").bind(p.sku).first<{ id: number }>();
    if (exist) {
      await logRow(db, "products", exist.id);
      productIds.push(exist.id);
      continue;
    }
    const r = await db
      .prepare(
        `INSERT INTO products (sku, barcode, name_ar, name_en, brand_id, part_type_id, category_id, location_id, supplier_id,
          purchase_price, selling_price, wholesale_price, min_selling_price, min_stock, notes, kind, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      )
      .bind(
        p.sku,
        p.sku,
        p.name,
        p.nameEn,
        brandId,
        typeId,
        catId,
        locId,
        supplierId,
        p.buy,
        p.sell,
        Math.round(p.sell * 0.85),
        Math.round(p.sell * 0.7),
        3,
        DEMO_TAG,
        p.kind === "service" ? "service" : "product",
      )
      .run();
    const id = r.meta.last_row_id;
    await db.prepare("UPDATE products SET quick_list = 1, unit = 'قطعة' WHERE id = ?").bind(id).run();
    if (modelId) {
      try {
        await db.prepare("INSERT INTO product_models (product_id, model_id) VALUES (?, ?)").bind(id, modelId).run();
      } catch {
        /* ignore */
      }
    }
    if (p.qty > 0 && p.kind !== "service") {
      const code = await nextNumber(db, "batch");
      const batch = await db
        .prepare(
          `INSERT INTO inventory_batches (batch_code, product_id, purchase_date, original_qty, remaining_qty, reserved_qty, unit_cost, notes)
           VALUES (?, ?, ?, ?, ?, 0, ?, 'opening')`,
        )
        .bind(code, id, todayIso(), p.qty, p.qty, p.buy)
        .run();
      await db.prepare("UPDATE products SET current_stock = ? WHERE id = ?").bind(p.qty, id).run();
      await logMovement(db, {
        productId: id,
        batchId: batch.meta.last_row_id,
        type: "in",
        qty: p.qty,
        unitCost: p.buy,
        referenceType: "opening",
        referenceId: id,
        notes: DEMO_TAG,
        userId: user.id,
      });
      await logRow(db, "inventory_batches", batch.meta.last_row_id);
    }
    await logRow(db, "products", id);
    productIds.push(id);
  }

  if (expCat) {
    const exp = await db
      .prepare("INSERT INTO expenses (category_id, amount, date, description, user_id) VALUES (?, ?, ?, ?, ?)")
      .bind(expCat, 250, todayIso(), "انتقالات تجريبية — " + DEMO_TAG, user.id)
      .run();
    await logRow(db, "expenses", exp.meta.last_row_id);
  }

  async function makeSale(customerId: number, lines: { productId: number; qty: number; price: number }[], method: string, paidRatio: number) {
    const planned: { productId: number; qty: number; price: number; name: string; sku: string; cost: number; alloc: { batch_id: number; qty: number; unit_cost: number }[] }[] = [];
    for (const line of lines) {
      const prod = await db.prepare("SELECT name_ar, sku, kind FROM products WHERE id = ?").bind(line.productId).first<{ name_ar: string; sku: string; kind: string }>();
      if (!prod) continue;
      let alloc: { batch_id: number; qty: number; unit_cost: number }[] = [];
      let cost = 0;
      if (prod.kind !== "service") {
        const batches = await availableBatches(db, line.productId);
        alloc = planAllocation(batches, line.qty);
        cost = alloc.reduce((s, a) => s + a.qty * a.unit_cost, 0) / line.qty;
      }
      planned.push({ ...line, name: prod.name_ar, sku: prod.sku, cost, alloc });
    }
    const subtotal = planned.reduce((s, p) => s + p.qty * p.price, 0);
    const costTotal = planned.reduce((s, p) => s + p.cost * p.qty, 0);
    const paid = Math.round(subtotal * paidRatio * 100) / 100;
    const remaining = Math.round((subtotal - paid) * 100) / 100;
    const cust = await db.prepare("SELECT name, phone FROM customers WHERE id = ?").bind(customerId).first<{ name: string; phone: string }>();
    const number = await nextNumber(db, "sales");
    const status = remaining <= 0 ? "completed" : "partial";
    const inv = await db
      .prepare(
        `INSERT INTO sales_invoices (
          number, date, type, status, customer_id, customer_name, customer_phone, customer_whatsapp,
          payment_method, subtotal, discount, total, paid, remaining, cost_total, profit, notes, created_by, completed_at
        ) VALUES (?, ?, 'normal', ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        number,
        todayIso(),
        status,
        customerId,
        cust?.name || "",
        cust?.phone || "",
        cust?.phone || "",
        method,
        subtotal,
        subtotal,
        paid,
        remaining,
        costTotal,
        Math.round((subtotal - costTotal) * 100) / 100,
        DEMO_TAG,
        user.id,
        todayIso(),
      )
      .run();
    const invoiceId = inv.meta.last_row_id;
    for (const p of planned) {
      const item = await db
        .prepare(
          `INSERT INTO sales_invoice_items (invoice_id, product_id, product_name, sku, quantity, delivered_qty, returned_qty, unit_price, discount, total, unit_cost, profit, notes)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?, 0, ?, ?, ?, ?)`,
        )
        .bind(invoiceId, p.productId, p.name, p.sku, p.qty, p.qty, p.price, p.qty * p.price, p.cost, p.qty * (p.price - p.cost), DEMO_TAG)
        .run();
      if (p.alloc.length) {
        await applyIssue(db, p.alloc, p.productId, false);
        for (const a of p.alloc) {
          try {
            await db
              .prepare("INSERT INTO sales_item_batches (invoice_item_id, batch_id, qty, unit_cost) VALUES (?, ?, ?, ?)")
              .bind(item.meta.last_row_id, a.batch_id, a.qty, a.unit_cost)
              .run();
          } catch {
            /* ignore */
          }
          await logMovement(db, {
            productId: p.productId,
            batchId: a.batch_id,
            type: "out",
            qty: a.qty,
            unitCost: a.unit_cost,
            referenceType: "sale",
            referenceId: invoiceId,
            notes: DEMO_TAG,
            userId: user.id,
          });
        }
      }
    }
    if (paid > 0) {
      const pay = await db
        .prepare("INSERT INTO payments (invoice_id, customer_id, method, amount, date, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(invoiceId, customerId, method, paid, todayIso(), DEMO_TAG, user.id)
        .run();
      await logRow(db, "payments", pay.meta.last_row_id);
    }
    if (remaining > 0) {
      await db.prepare("UPDATE customers SET current_balance = current_balance + ? WHERE id = ?").bind(remaining, customerId).run();
    }
    await logRow(db, "sales_invoices", invoiceId);
    return invoiceId;
  }

  await makeSale(customerIds[0], [{ productId: productIds[0], qty: 1, price: 1250 }, { productId: productIds[3], qty: 2, price: 45 }], "cash", 1);
  await makeSale(customerIds[2], [{ productId: productIds[1], qty: 2, price: 380 }], "credit", 0);

  return { ...(await demoStatus(db)), already: false as const };
}

async function delIn(db: AppDb, sql: string, ids: number[]) {
  if (!ids.length) return;
  const ph = ids.map(() => "?").join(",");
  try {
    await db.prepare(`${sql} IN (${ph})`).bind(...ids).run();
  } catch {
    /* ignore missing table/col */
  }
}

export async function clearDemo(db: AppDb) {
  await ensureDemoLog(db);
  const invoices = await idsOf(db, "sales_invoices");
  const products = await idsOf(db, "products");
  const customers = await idsOf(db, "customers");
  const suppliers = await idsOf(db, "suppliers");
  const expenses = await idsOf(db, "expenses");
  const payments = await idsOf(db, "payments");
  const batches = await idsOf(db, "inventory_batches");

  if (invoices.length) {
    const { results: items } = await db
      .prepare(`SELECT id FROM sales_invoice_items WHERE invoice_id IN (${invoices.map(() => "?").join(",")})`)
      .bind(...invoices)
      .all<{ id: number }>();
    const itemIds = items.map((i) => i.id);
    await delIn(db, "DELETE FROM sales_item_batches WHERE invoice_item_id", itemIds);
    await delIn(db, "DELETE FROM sales_invoice_items WHERE invoice_id", invoices);
    await delIn(db, "DELETE FROM whatsapp_logs WHERE invoice_id", invoices);
    await delIn(db, "DELETE FROM payments WHERE invoice_id", invoices);
    await delIn(db, "DELETE FROM sales_invoices WHERE id", invoices);
  }
  await delIn(db, "DELETE FROM payments WHERE id", payments);
  if (products.length) {
    await delIn(db, "DELETE FROM stock_movements WHERE product_id", products);
    await delIn(db, "DELETE FROM inventory_batches WHERE product_id", products);
    await delIn(db, "DELETE FROM product_models WHERE product_id", products);
    await delIn(db, "DELETE FROM product_units WHERE product_id", products);
    await delIn(db, "DELETE FROM products WHERE id", products);
  }
  await delIn(db, "DELETE FROM inventory_batches WHERE id", batches);
  await delIn(db, "DELETE FROM expenses WHERE id", expenses);
  await delIn(db, "DELETE FROM customers WHERE id", customers);
  await delIn(db, "DELETE FROM suppliers WHERE id", suppliers);
  try {
    const { results: extraInv } = await db.prepare("SELECT id FROM sales_invoices WHERE notes = ?").bind(DEMO_TAG).all<{ id: number }>();
    await delIn(db, "DELETE FROM sales_invoice_items WHERE invoice_id", extraInv.map((x) => x.id));
    await delIn(db, "DELETE FROM sales_invoices WHERE id", extraInv.map((x) => x.id));
    const { results: extraProd } = await db.prepare("SELECT id FROM products WHERE sku LIKE 'DEMO-%' OR notes = ?").bind(DEMO_TAG).all<{ id: number }>();
    const extraIds = extraProd.map((x) => x.id);
    await delIn(db, "DELETE FROM stock_movements WHERE product_id", extraIds);
    await delIn(db, "DELETE FROM inventory_batches WHERE product_id", extraIds);
    await delIn(db, "DELETE FROM product_models WHERE product_id", extraIds);
    await delIn(db, "DELETE FROM products WHERE id", extraIds);
    await db.prepare("DELETE FROM customers WHERE notes = ?").bind(DEMO_TAG).run();
    await db.prepare("DELETE FROM suppliers WHERE notes = ?").bind(DEMO_TAG).run();
    await db.prepare("DELETE FROM expenses WHERE description LIKE ?").bind("%" + DEMO_TAG + "%").run();
  } catch {
    /* ignore */
  }
  await db.prepare("DELETE FROM demo_seed_log").run();
  return { ok: true as const, ...(await demoStatus(db)) };
}
