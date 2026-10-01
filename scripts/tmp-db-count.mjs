import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const files = [
  "D:/PIXEL01/mobiles trial/data/motamayez.sqlite",
  "D:/PIXEL01/mobiles trial/data/audit-test.sqlite",
  "D:/PIXEL01/mobiles trial/data/backups/motamayez-20260923-202801.sqlite",
  "D:/PIXEL01/mobiles trial/data/backups/motamayez-20260923-205344.sqlite",
];

for (const f of files) {
  if (!fs.existsSync(f)) {
    console.log("missing", f);
    continue;
  }
  try {
    const db = new DatabaseSync(f);
    const p = db.prepare("SELECT COUNT(*) n FROM products").get();
    const a = db.prepare("SELECT COUNT(*) n FROM products WHERE deleted_at IS NULL").get();
    const d = db.prepare("SELECT COUNT(*) n FROM products WHERE deleted_at IS NOT NULL").get();
    const k = db.prepare("SELECT COALESCE(kind,'null') kind, COUNT(*) n FROM products GROUP BY kind").all();
    const last = db.prepare("SELECT id, sku, name_ar FROM products ORDER BY id DESC LIMIT 5").all();
    console.log(path.basename(f), "total", p.n, "alive", a.n, "deleted", d.n, "kinds", JSON.stringify(k));
    console.log("  last", JSON.stringify(last));
    db.close();
  } catch (e) {
    console.log(path.basename(f), "ERR", e.message);
  }
}
