import mysql from "mysql2/promise";
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { adaptSql } from "./sql-adapt";

export type AppResult<T = Record<string, unknown>> = {
  results: T[];
  success: boolean;
  meta: { changes: number; last_row_id: number };
};

function mysqlConfig() {
  const host = (process.env.MYSQL_HOST || "127.0.0.1").trim() || "127.0.0.1";
  return {
    host: host === "localhost" ? "127.0.0.1" : host,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "motamayez",
    waitForConnections: true,
    connectionLimit: 10,
    charset: "utf8mb4",
    dateStrings: true as const,
    multipleStatements: true,
  };
}

export class AppStatement {
  constructor(
    private pool: Pool,
    public sql: string,
    public params: unknown[] = [],
  ) {}

  bind(...params: unknown[]) {
    return new AppStatement(this.pool, this.sql, params);
  }

  private adapted() {
    return adaptSql(this.sql);
  }

  async all<T = Record<string, unknown>>(): Promise<AppResult<T>> {
    const [rows] = this.params.length
      ? await this.pool.execute(this.adapted(), this.params as never[])
      : await this.pool.query(this.adapted());
    return { results: rows as T[], success: true, meta: { changes: 0, last_row_id: 0 } };
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const { results } = await this.all<T>();
    return results[0] ?? null;
  }

  async run(): Promise<AppResult> {
    const [info] = this.params.length
      ? await this.pool.execute(this.adapted(), this.params as never[])
      : await this.pool.query(this.adapted());
    const header = info as ResultSetHeader;
    return {
      results: [],
      success: true,
      meta: { changes: Number(header.affectedRows || 0), last_row_id: Number(header.insertId || 0) },
    };
  }
}

export class AppDb {
  constructor(public pool: Pool) {}

  prepare(sql: string) {
    return new AppStatement(this.pool, sql);
  }

  async exec(sql: string) {
    await this.pool.query(adaptSql(sql));
  }

  async batch(stmts: AppStatement[]): Promise<AppResult[]> {
    const conn: PoolConnection = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const out: AppResult[] = [];
      for (const s of stmts) {
        const adapted = adaptSql(s.sql);
        const isSelect = /^\s*SELECT/i.test(s.sql);
        const [res] = s.params.length ? await conn.execute(adapted, s.params as never[]) : await conn.query(adapted);
        if (isSelect) {
          out.push({ results: res as RowDataPacket[], success: true, meta: { changes: 0, last_row_id: 0 } });
        } else {
          const header = res as ResultSetHeader;
          out.push({
            results: [],
            success: true,
            meta: { changes: Number(header.affectedRows || 0), last_row_id: Number(header.insertId || 0) },
          });
        }
      }
      await conn.commit();
      return out;
    } catch (err) {
      try {
        await conn.rollback();
      } catch {
        /* ignore */
      }
      throw err;
    } finally {
      conn.release();
    }
  }
}

export async function ensureAppSchema(db: AppDb) {
  const run = async (sql: string) => {
    try {
      await db.exec(sql);
    } catch {
      /* duplicate column/table */
    }
  };
  await run(`CREATE TABLE IF NOT EXISTS product_units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    factor REAL NOT NULL DEFAULT 1,
    barcode TEXT,
    selling_price REAL NOT NULL DEFAULT 0,
    is_base INTEGER NOT NULL DEFAULT 0
  )`);
  const alters: [string, string][] = [
    ["products", "extra_code1 TEXT"],
    ["products", "extra_code2 TEXT"],
    ["products", "extra_codes TEXT"],
    ["products", "discount_pct REAL NOT NULL DEFAULT 0"],
    ["products", "price_2 REAL NOT NULL DEFAULT 0"],
    ["products", "price_3 REAL NOT NULL DEFAULT 0"],
    ["products", "price_4 REAL NOT NULL DEFAULT 0"],
    ["products", "no_qty INTEGER NOT NULL DEFAULT 0"],
    ["products", "quick_list INTEGER NOT NULL DEFAULT 0"],
    ["products", "non_stock INTEGER NOT NULL DEFAULT 0"],
    ["products", "specs TEXT"],
    ["products", "scale TEXT"],
    ["products", "expiry_days INTEGER"],
    ["customers", "account_kind TEXT NOT NULL DEFAULT 'debit'"],
    ["customers", "discount_pct REAL NOT NULL DEFAULT 0"],
    ["customers", "sell_price REAL NOT NULL DEFAULT 0"],
    ["sales_invoices", "extra_amount REAL NOT NULL DEFAULT 0"],
    ["sales_invoices", "cash_account_id INTEGER"],
    ["sales_invoice_items", "unit_name TEXT"],
    ["sales_invoice_items", "unit_factor REAL NOT NULL DEFAULT 1"],
    ["work_shifts", "weekdays TEXT"],
  ];
  for (const [table, def] of alters) await run(`ALTER TABLE ${table} ADD COLUMN ${def}`);
  await run(`INSERT OR IGNORE INTO payment_methods (code, name_ar, name_en, active, sort_order) VALUES
    ('visa', 'بطاقة / فيزا', 'Card / Visa', 1, 3),
    ('treasury', 'خزينة', 'Treasury', 1, 4)`);
  await run(`INSERT OR IGNORE INTO settings (key, value) VALUES
    ('use_last_customer_price', '0'),
    ('invoice_header', ''),
    ('price_2_name', 'سعر الجملة'),
    ('price_3_name', 'سعر 3'),
    ('price_4_name', 'سعر 4'),
    ('auto_backup_on_login', '1')`);
  await run(`CREATE TABLE IF NOT EXISTS demo_seed_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL,
    row_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  try {
    const live = await db.prepare("SELECT COUNT(*) n FROM products WHERE deleted_at IS NULL").first<{ n: number }>();
    const dead = await db.prepare("SELECT COUNT(*) n FROM products WHERE deleted_at IS NOT NULL").first<{ n: number }>();
    if (Number(dead?.n || 0) > 0 && Number(live?.n || 0) === 0) {
      await db.exec("UPDATE products SET deleted_at = NULL, active = 1 WHERE deleted_at IS NOT NULL");
      console.log("undeleted products", dead?.n);
    }
  } catch {
    /* ignore */
  }
}

export async function openMysql() {
  const cfg = mysqlConfig();
  const pool = mysql.createPool(cfg);
  const db = new AppDb(pool);
  await db.exec("SET NAMES utf8mb4");
  await ensureAppSchema(db);
  console.log(`المتميز mysql ${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database}`);
  return db;
}

export function mysqlDsnLabel() {
  const cfg = mysqlConfig();
  return `${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database}`;
}
