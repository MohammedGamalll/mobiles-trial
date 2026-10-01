import { Hono } from "hono";
import { audit, type AppBindings, type AppVars } from "../lib/helpers";
import { requirePerm } from "../lib/auth";

export const importRoutes = new Hono<{ Bindings: AppBindings; Variables: AppVars }>();

function splitCsvLine(line: string) {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else q = !q;
    } else if (ch === "," && !q) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function parseCsv(text: string) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { headers: [] as string[], rows: [] as Record<string, string>[] };
  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, "_"));
  const rows = lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    const o: Record<string, string> = {};
    headers.forEach((h, i) => {
      o[h] = cols[i] || "";
    });
    return o;
  });
  return { headers, rows };
}

function validate(kind: string, row: Record<string, string>, i: number) {
  const errors: string[] = [];
  if (kind === "products") {
    if (!row.sku) errors.push("sku");
    if (!row.name_ar && !row.name_en) errors.push("name");
  } else if (kind === "customers" || kind === "suppliers") {
    if (!row.name) errors.push("name");
  } else errors.push("kind");
  return { line: i + 2, ok: errors.length === 0, errors, row };
}

importRoutes.post("/preview", requirePerm("import.manage", "products.create", "customers.create"), async (c) => {
  const b = await c.req.json<{ kind: string; csv: string }>();
  const kind = b.kind || "products";
  const { headers, rows } = parseCsv(b.csv || "");
  const preview = rows.slice(0, 80).map((row, i) => validate(kind, row, i));
  return c.json({ kind, headers, total: rows.length, preview, valid: preview.filter((p) => p.ok).length, invalid: preview.filter((p) => !p.ok).length });
});

importRoutes.post("/commit", requirePerm("import.manage", "products.create"), async (c) => {
  const b = await c.req.json<{ kind: string; csv: string }>();
  const kind = b.kind || "products";
  const { rows } = parseCsv(b.csv || "");
  let inserted = 0;
  let skipped = 0;
  const user = c.get("user");
  for (let i = 0; i < rows.length; i++) {
    const v = validate(kind, rows[i], i);
    if (!v.ok) {
      skipped += 1;
      continue;
    }
    const r = rows[i];
    try {
      if (kind === "products") {
        const exists = await c.env.DB.prepare("SELECT id FROM products WHERE sku = ? AND deleted_at IS NULL").bind(r.sku).first();
        if (exists) {
          skipped += 1;
          continue;
        }
        await c.env.DB
          .prepare(
            `INSERT INTO products (sku, barcode, name_ar, name_en, purchase_price, selling_price, min_selling_price, kind, color, quality, active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          )
          .bind(
            r.sku,
            r.barcode || null,
            r.name_ar || r.name_en,
            r.name_en || r.name_ar,
            Number(r.purchase_price || 0),
            Number(r.selling_price || 0),
            Number(r.min_selling_price || 0),
            r.kind === "service" ? "service" : "product",
            r.color || null,
            r.quality || null,
          )
          .run();
        inserted += 1;
      } else if (kind === "customers") {
        await c.env.DB
          .prepare("INSERT INTO customers (name, phone, city, area, customer_type, payment_terms) VALUES (?, ?, ?, ?, 'retail', 'cash')")
          .bind(r.name, r.phone || null, r.city || null, r.area || null)
          .run();
        inserted += 1;
      } else if (kind === "suppliers") {
        await c.env.DB.prepare("INSERT INTO suppliers (name, phone, city) VALUES (?, ?, ?)").bind(r.name, r.phone || null, r.city || null).run();
        inserted += 1;
      }
    } catch {
      skipped += 1;
    }
  }
  await audit(c.env.DB, user, "import", kind, null, `Import ${kind} +${inserted} skip ${skipped}`);
  return c.json({ ok: true, inserted, skipped });
});
