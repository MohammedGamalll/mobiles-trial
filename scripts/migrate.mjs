import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { loadDotEnv } from "./load-env.mjs";
import { adaptSql } from "./sql-adapt.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadDotEnv(root);

function mysqlConfig() {
  const host = (process.env.MYSQL_HOST || "127.0.0.1").trim() || "127.0.0.1";
  return {
    host: host === "localhost" ? "127.0.0.1" : host,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "motamayez",
    multipleStatements: true,
    charset: "utf8mb4",
    dateStrings: true,
  };
}

const ignorable = new Set([
  "ER_DUP_FIELDNAME",
  "ER_TABLE_EXISTS_ERROR",
  "ER_DUP_KEYNAME",
  "ER_DUP_ENTRY",
  "ER_CANT_DROP_FIELD_OR_KEY",
]);

async function execIgnore(conn, sql) {
  const adapted = adaptSql(sql);
  try {
    await conn.query(adapted);
  } catch (err) {
    if (ignorable.has(err?.code)) return;
    console.error("migration statement failed:\n", adapted.slice(0, 400));
    throw err;
  }
}

const cfg = mysqlConfig();
if (!cfg.database) {
  console.error("Set MYSQL_DATABASE (and MYSQL_USER / MYSQL_PASSWORD) in .env or Hostinger env.");
  process.exit(1);
}

const conn = await mysql.createConnection(cfg);
await conn.query("SET NAMES utf8mb4");
await conn.query("SET FOREIGN_KEY_CHECKS = 0");
await conn.query(`CREATE TABLE IF NOT EXISTS d1_migrations (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(191) NOT NULL UNIQUE,
  applied_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

const [appliedRows] = await conn.query("SELECT name FROM d1_migrations");
const applied = new Set((appliedRows || []).map((r) => r.name));
const migrationsDir = path.join(root, "migrations");
const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
let count = 0;
for (const name of files) {
  if (applied.has(name)) continue;
  const sql = fs.readFileSync(path.join(migrationsDir, name), "utf8");
  for (const chunk of sql.split(";").map((s) => s.trim()).filter(Boolean)) {
    const withoutComments = chunk.replace(/^\s*--.*$/gm, "").trim();
    if (!withoutComments) continue;
    await execIgnore(conn, `${chunk};`);
  }
  await conn.execute("INSERT INTO d1_migrations (name, applied_at) VALUES (?, NOW())", [name]);
  console.log("applied", name);
  count += 1;
}
await conn.query("SET FOREIGN_KEY_CHECKS = 1");
await conn.end();
console.log(count ? `Applied ${count} migration(s) on ${cfg.database}` : `No pending migrations on ${cfg.database}`);
