import type { AppDb } from "./db";

export const KEEP_TABLES = new Set([
  "roles",
  "permissions",
  "role_permissions",
  "users",
  "sessions",
  "d1_migrations",
  "schema_migrations",
]);

const SKIP_PREFIXES = ["sqlite_", "mysql"];

const FACTORY_SEQUENCES: [string, string, number][] = [
  ["sales", "INV", 1],
  ["purchase", "PUR", 1],
  ["return", "RET", 1],
  ["batch", "B", 1],
  ["journal", "JRN", 1],
  ["voucher", "VCH", 1],
  ["transfer", "TRN", 1],
  ["stocktake", "STK", 1],
];

const FACTORY_LEDGER: [number, string, string, string, string][] = [
  [1, "1100", "الصندوق", "Cash", "asset"],
  [2, "1110", "البنك", "Bank", "asset"],
  [3, "1200", "العملاء", "Accounts receivable", "asset"],
  [4, "1300", "المخزون", "Inventory", "asset"],
  [5, "2100", "الموردون", "Accounts payable", "liability"],
  [6, "3100", "رأس المال", "Capital", "equity"],
  [7, "4100", "المبيعات", "Sales", "revenue"],
  [8, "4200", "إيرادات أخرى", "Other income", "revenue"],
  [9, "5100", "تكلفة البضاعة", "Cost of goods", "expense"],
  [10, "5200", "المصروفات", "Expenses", "expense"],
  [11, "5300", "المرتبات", "Salaries", "expense"],
];

export function shouldWipeTable(name: string) {
  const table = String(name || "").trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]*$/.test(table)) return false;
  if (SKIP_PREFIXES.some((p) => table.startsWith(p))) return false;
  return !KEEP_TABLES.has(table);
}

async function listTables(db: AppDb) {
  const { results } = await db
    .prepare(
      `SELECT TABLE_NAME as name FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'`,
    )
    .all<{ name: string }>();
  return results.map((r) => String(r.name));
}

async function tryExec(db: AppDb, sql: string, ...binds: unknown[]) {
  try {
    if (binds.length) await db.prepare(sql).bind(...binds).run();
    else await db.exec(sql);
  } catch {
    /* optional table/column */
  }
}

async function restoreFactorySkeleton(db: AppDb) {
  for (const [name, prefix, next] of FACTORY_SEQUENCES) {
    await tryExec(db, "INSERT INTO sequences (name, prefix, next_number) VALUES (?, ?, ?)", name, prefix, next);
  }
  for (const [id, code, nameAr, nameEn, type] of FACTORY_LEDGER) {
    await tryExec(
      db,
      "INSERT INTO ledger_accounts (id, code, name_ar, name_en, type, active) VALUES (?, ?, ?, ?, ?, 1)",
      id,
      code,
      nameAr,
      nameEn,
      type,
    );
  }
  await tryExec(
    db,
    "INSERT INTO cash_accounts (id, kind, name, name_en, account_id, opening_balance, current_balance, active) VALUES (1, 'cash', 'الصندوق الرئيسي', 'Main cash', 1, 0, 0, 1)",
  );
  await tryExec(
    db,
    "INSERT INTO payment_methods (code, name_ar, name_en, active, sort_order) VALUES ('cash', 'كاش', 'Cash', 1, 1)",
  );
  await tryExec(
    db,
    "INSERT INTO payment_methods (code, name_ar, name_en, active, sort_order) VALUES ('credit', 'آجل', 'Credit', 1, 2)",
  );
  const settings: [string, string][] = [
    ["store_name", "المتميز"],
    ["store_name_ar", "المتميز"],
    ["currency", "EGP"],
    ["language", "ar"],
    ["tax_enabled", "0"],
    ["whatsapp_enabled", "0"],
    ["allow_negative_stock", "0"],
  ];
  for (const [key, value] of settings) {
    await tryExec(db, "INSERT INTO settings (`key`, value) VALUES (?, ?)", key, value);
  }
}

export async function wipeAllBusinessData(db: AppDb, keepUserId: number) {
  const tables = (await listTables(db)).filter(shouldWipeTable);
  await db.exec("SET FOREIGN_KEY_CHECKS=0");
  try {
    for (const table of tables) {
      await db.exec(`DELETE FROM \`${table}\``);
    }
    await tryExec(db, "UPDATE users SET delivery_agent_id = NULL");
    await db
      .prepare(
        `DELETE FROM users WHERE id NOT IN (
           SELECT id FROM (
             SELECT u.id FROM users u
             JOIN roles r ON r.id = u.role_id
             WHERE r.slug = 'admin' OR u.id = ?
           ) keep_users
         )`,
      )
      .bind(keepUserId)
      .run();
    await db.prepare("DELETE FROM sessions WHERE user_id NOT IN (SELECT id FROM users)").run();
    await restoreFactorySkeleton(db);
  } finally {
    await db.exec("SET FOREIGN_KEY_CHECKS=1");
  }
  return { wiped: tables.sort() };
}
