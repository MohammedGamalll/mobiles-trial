import type { AppDb } from "./db";
import { ensureWhatsappTemplates } from "./whatsapp";

export const KEEP_TABLES = new Set([
  "roles",
  "permissions",
  "role_permissions",
  "user_permissions",
  "users",
  "sessions",
  "customers",
  "suppliers",
  "delivery_agents",
  "employees",
  "work_shifts",
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
  [12, "4210", "زيادة صندوق", "Cash overage", "revenue"],
  [13, "5215", "عجز صندوق", "Cash shortage", "expense"],
  [14, "1101", "الخزنة", "Safe cash", "asset"],
  [15, "1410", "سلف الموظفين", "Employee advances", "asset"],
];

export const FACTORY_CASH_ACCOUNTS: [string, string, string, string][] = [
  ["cash", "الصندوق الرئيسي", "Main cash", "1100"],
  ["cash", "الخزنه", "Safe", "1101"],
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
  for (const [kind, name, nameEn, code] of FACTORY_CASH_ACCOUNTS) {
    await tryExec(
      db,
      `INSERT INTO cash_accounts (kind, name, name_en, account_id, opening_balance, current_balance, active)
       SELECT ?, ?, ?, id, 0, 0, 1 FROM ledger_accounts WHERE code = ? LIMIT 1`,
      kind,
      name,
      nameEn,
      code,
    );
  }
  await tryExec(
    db,
    `INSERT OR IGNORE INTO revenue_categories (id, name_ar, name_en, active) VALUES
      (1, 'إيجار معرّض', 'Display rent', 1),
      (2, 'رسوم خدمات', 'Service fees', 1),
      (3, 'تسوية', 'Settlement', 1),
      (4, 'أخرى', 'Other', 1)`,
  );
  await tryExec(
    db,
    "INSERT INTO payment_methods (code, name_ar, name_en, active, sort_order) VALUES ('cash', 'كاش', 'Cash', 1, 1)",
  );
  await tryExec(
    db,
    "INSERT INTO payment_methods (code, name_ar, name_en, active, sort_order) VALUES ('credit', 'آجل', 'Credit', 1, 2)",
  );
  await ensureWhatsappTemplates(db);
  const settings: [string, string][] = [
    ["store_name", "المتميز"],
    ["store_name_ar", "المتميز"],
    ["currency", "EGP"],
    ["language", "ar"],
    ["tax_enabled", "0"],
    ["whatsapp_enabled", "0"],
    ["allow_negative_stock", "0"],
    ["main_safe_id", ""],
    ["pos_require_shift", "1"],
  ];
  for (const [key, value] of settings) {
    await tryExec(db, "INSERT INTO settings (`key`, value) VALUES (?, ?)", key, value);
  }
  await tryExec(
    db,
    `UPDATE settings SET value = (
       SELECT CAST(c.id AS CHAR)
       FROM cash_accounts c
       JOIN ledger_accounts la ON la.id = c.account_id
       WHERE la.code = '1101'
       LIMIT 1
     )
     WHERE \`key\` = 'main_safe_id'
       AND EXISTS (
         SELECT 1 FROM cash_accounts c
         JOIN ledger_accounts la ON la.id = c.account_id
         WHERE la.code = '1101'
       )`,
  );
}

async function zeroKeptBalances(db: AppDb) {
  await tryExec(db, "UPDATE customers SET current_balance = 0");
  await tryExec(db, "UPDATE customers SET opening_balance = 0");
  await tryExec(db, "UPDATE suppliers SET balance = 0");
  await tryExec(db, "UPDATE suppliers SET opening_balance = 0");
  await tryExec(db, "UPDATE delivery_agents SET current_balance = 0");
  await tryExec(db, "UPDATE delivery_agents SET balance = 0");
  await tryExec(db, "UPDATE cash_accounts SET current_balance = 0, opening_balance = 0");
}

export async function wipeAllBusinessData(db: AppDb, keepUserId: number) {
  const tables = (await listTables(db)).filter(shouldWipeTable);
  await db.exec("SET FOREIGN_KEY_CHECKS=0");
  try {
    for (const table of tables) {
      await db.exec(`DELETE FROM \`${table}\``);
    }
    await restoreFactorySkeleton(db);
    await zeroKeptBalances(db);
  } finally {
    await db.exec("SET FOREIGN_KEY_CHECKS=1");
  }
  return { wiped: tables.sort(), kept_user_id: keepUserId };
}
