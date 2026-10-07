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

type Queryable = Pool | PoolConnection;

async function execStmt(client: Queryable, s: AppStatement): Promise<AppResult> {
  const adapted = adaptSql(s.sql);
  const isSelect = /^\s*SELECT/i.test(s.sql);
  const [res] = s.params.length ? await client.execute(adapted, s.params as never[]) : await client.query(adapted);
  if (isSelect) {
    return { results: res as RowDataPacket[], success: true, meta: { changes: 0, last_row_id: 0 } };
  }
  const header = res as ResultSetHeader;
  return {
    results: [],
    success: true,
    meta: { changes: Number(header.affectedRows || 0), last_row_id: Number(header.insertId || 0) },
  };
}

export class AppStatement {
  constructor(
    private client: Queryable,
    public sql: string,
    public params: unknown[] = [],
  ) {}

  bind(...params: unknown[]) {
    return new AppStatement(this.client, this.sql, params);
  }

  private adapted() {
    return adaptSql(this.sql);
  }

  async all<T = Record<string, unknown>>(): Promise<AppResult<T>> {
    const [rows] = this.params.length
      ? await this.client.execute(this.adapted(), this.params as never[])
      : await this.client.query(this.adapted());
    return { results: rows as T[], success: true, meta: { changes: 0, last_row_id: 0 } };
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const { results } = await this.all<T>();
    return results[0] ?? null;
  }

  async run(): Promise<AppResult> {
    return execStmt(this.client, this);
  }
}

export class AppDb {
  constructor(
    public pool: Pool,
    private conn?: PoolConnection,
  ) {}

  private client(): Queryable {
    return this.conn ?? this.pool;
  }

  prepare(sql: string) {
    return new AppStatement(this.client(), sql);
  }

  async exec(sql: string) {
    await this.client().query(adaptSql(sql));
  }

  async batch(stmts: AppStatement[]): Promise<AppResult[]> {
    if (this.conn) {
      const out: AppResult[] = [];
      for (const s of stmts) out.push(await execStmt(this.conn, s));
      return out;
    }
    const conn: PoolConnection = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const out: AppResult[] = [];
      for (const s of stmts) out.push(await execStmt(conn, s));
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

  async transaction<T>(fn: (tx: AppDb) => Promise<T>): Promise<T> {
    if (this.conn) return fn(this);
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const result = await fn(new AppDb(this.pool, conn));
      await conn.commit();
      return result;
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
    ["customers", "lat REAL"],
    ["customers", "lng REAL"],
    ["customers", "supplier_id INTEGER"],
    ["suppliers", "currency TEXT NOT NULL DEFAULT 'EGP'"],
    ["suppliers", "customer_id INTEGER"],
    ["sales_invoices", "extra_amount REAL NOT NULL DEFAULT 0"],
    ["sales_invoices", "cash_account_id INTEGER"],
    ["sales_invoices", "location_id INTEGER"],
    ["sales_invoices", "stock_committed_at TEXT"],
    ["sales_invoices", "finance_committed_at TEXT"],
    ["sales_invoices", "assigned_at TEXT"],
    ["sales_invoices", "settled_at TEXT"],
    ["sales_invoices", "settlement_id INTEGER"],
    ["delivery_results", "settlement_id INTEGER"],
    ["delivery_results", "charge_to TEXT"],
    ["delivery_results", "collected REAL NOT NULL DEFAULT 0"],
    ["sales_invoice_items", "unit_name TEXT"],
    ["sales_invoice_items", "unit_factor REAL NOT NULL DEFAULT 1"],
    ["work_shifts", "weekdays TEXT"],
    ["expenses", "cash_account_id INTEGER"],
    ["products", "last_purchase_price REAL NOT NULL DEFAULT 0"],
    ["purchase_invoice_items", "returned_qty INTEGER NOT NULL DEFAULT 0"],
    ["purchase_invoices", "wallet_surplus REAL NOT NULL DEFAULT 0"],
    ["purchase_invoices", "returned_total REAL NOT NULL DEFAULT 0"],
    ["sales_invoices", "returned_total REAL NOT NULL DEFAULT 0"],
    ["payments", "supplier_id INTEGER"],
    ["payments", "purchase_id INTEGER"],
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
    ('auto_backup_on_login', '1'),
    ('usd_egp_rate', '50')`);
  await run(`CREATE TABLE IF NOT EXISTS demo_seed_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL,
    row_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  await run(`CREATE TABLE IF NOT EXISTS delivery_settlements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    delivery_agent_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'posted',
    notes TEXT,
    collected_total REAL NOT NULL DEFAULT 0,
    delivered_count INTEGER NOT NULL DEFAULT 0,
    rejected_count INTEGER NOT NULL DEFAULT 0,
    damaged_count INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  await run(`CREATE TABLE IF NOT EXISTS delivery_settlement_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    settlement_id INTEGER NOT NULL,
    invoice_id INTEGER NOT NULL,
    outcome TEXT NOT NULL,
    collected REAL NOT NULL DEFAULT 0,
    charge_to TEXT,
    notes TEXT
  )`);
  await run("CREATE UNIQUE INDEX idx_settlement_invoice ON delivery_settlement_lines(invoice_id)");
  await run(`INSERT INTO storage_locations (name, warehouse, kind, code, path, notes, active, sort_order)
    SELECT name, warehouse, kind, code, path, notes, active, sort_order FROM (
      SELECT 'تالف / مفقود' AS name, 'تالف' AS warehouse, 'warehouse' AS kind, 'DAMAGED' AS code, 'DAMAGED' AS path, 'مخزن افتراضي للتالف والمفقود' AS notes, 1 AS active, 99 AS sort_order
    ) AS seed
    WHERE NOT EXISTS (SELECT 1 FROM storage_locations WHERE code = 'DAMAGED')`);
  await run(`INSERT OR IGNORE INTO ledger_accounts (code, name_ar, name_en, type)
    VALUES ('5300', 'تالف ومفقود', 'Damaged / lost inventory', 'expense')`);
  await run(`CREATE TABLE IF NOT EXISTS purchase_returns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT NOT NULL UNIQUE,
    purchase_id INTEGER NOT NULL,
    supplier_id INTEGER,
    date TEXT NOT NULL,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'completed',
    total REAL NOT NULL DEFAULT 0,
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  await run(`CREATE TABLE IF NOT EXISTS purchase_return_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    return_id INTEGER NOT NULL,
    purchase_item_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    qty INTEGER NOT NULL,
    unit_cost REAL NOT NULL,
    total REAL NOT NULL,
    batch_id INTEGER
  )`);
  await run(`INSERT OR IGNORE INTO permissions (code, module, name_ar, name_en) VALUES
    ('purchases.return', 'purchases', 'مرتجع مشتريات', 'Purchase return')`);
  await run(`INSERT INTO role_permissions (role_id, permission_id)
    SELECT 1, id FROM permissions WHERE code = 'purchases.return'
    AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = 1 AND rp.permission_id = permissions.id)`);
  await run(`INSERT INTO role_permissions (role_id, permission_id)
    SELECT 3, id FROM permissions WHERE code = 'purchases.return'
    AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = 3 AND rp.permission_id = permissions.id)`);
  await run(`CREATE TABLE IF NOT EXISTS partners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    equity_percentage REAL NOT NULL,
    starting_balance REAL NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  await run(`CREATE TABLE IF NOT EXISTS partner_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partner_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    cash_account_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    note TEXT,
    journal_id INTEGER,
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  await run("CREATE INDEX idx_partner_tx_partner ON partner_transactions(partner_id, type)");
  await run("CREATE INDEX idx_partners_active ON partners(active, id)");
  await run(`INSERT OR IGNORE INTO permissions (code, module, name_ar, name_en) VALUES
    ('partners.view', 'finance', 'عرض الشركاء وحقوق الملكية', 'View partners and equity'),
    ('partners.manage', 'finance', 'إدارة الشركاء والمسحوبات', 'Manage partners and drawings')`);
  await run(`INSERT INTO role_permissions (role_id, permission_id)
    SELECT 1, id FROM permissions WHERE code IN ('partners.view', 'partners.manage')
    AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = 1 AND rp.permission_id = permissions.id)`);
  await run(`INSERT INTO role_permissions (role_id, permission_id)
    SELECT 5, id FROM permissions WHERE code IN ('partners.view', 'partners.manage')
    AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = 5 AND rp.permission_id = permissions.id)`);
  await run("CREATE INDEX idx_batches_product_loc ON inventory_batches(product_id, location_id)");
  await run("CREATE INDEX idx_batches_loc_product ON inventory_batches(location_id, product_id)");
  await run("CREATE INDEX idx_products_alive ON products(deleted_at, active, id)");
  await run("CREATE INDEX idx_invoices_location ON sales_invoices(location_id)");
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
