import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDotEnv } from "../worker/lib/env-file";
import { openMysql } from "../worker/lib/db";
import { importProductRows, parseProductWorkbook } from "../worker/lib/product-import";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadDotEnv(root);

const file = process.argv[2] || path.join(process.env.USERPROFILE || "", "Downloads", "products.xlsx");
if (!fs.existsSync(file)) {
  console.error("missing file", file);
  process.exit(1);
}

const rows = parseProductWorkbook(fs.readFileSync(file), path.basename(file));
console.log("parsed", rows.length, "rows from", file);
const db = await openMysql();
const result = await importProductRows(db, rows, { replace: true, userId: 1 });
console.log(JSON.stringify(result, null, 2));
await db.pool.end();
