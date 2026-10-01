ALTER TABLE products ADD COLUMN extra_code1 TEXT;
ALTER TABLE products ADD COLUMN extra_code2 TEXT;
ALTER TABLE products ADD COLUMN extra_codes TEXT;
ALTER TABLE products ADD COLUMN discount_pct REAL NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN price_2 REAL NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN price_3 REAL NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN price_4 REAL NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN no_qty INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN quick_list INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN non_stock INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN specs TEXT;
ALTER TABLE products ADD COLUMN scale TEXT;
ALTER TABLE products ADD COLUMN expiry_days INTEGER;

ALTER TABLE customers ADD COLUMN account_kind TEXT NOT NULL DEFAULT 'debit';
ALTER TABLE customers ADD COLUMN discount_pct REAL NOT NULL DEFAULT 0;
ALTER TABLE customers ADD COLUMN sell_price REAL NOT NULL DEFAULT 0;

ALTER TABLE sales_invoices ADD COLUMN extra_amount REAL NOT NULL DEFAULT 0;
ALTER TABLE sales_invoices ADD COLUMN cash_account_id INTEGER;

ALTER TABLE sales_invoice_items ADD COLUMN unit_name TEXT;
ALTER TABLE sales_invoice_items ADD COLUMN unit_factor REAL NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS product_units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  factor REAL NOT NULL DEFAULT 1,
  barcode TEXT,
  selling_price REAL NOT NULL DEFAULT 0,
  is_base INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

INSERT OR IGNORE INTO payment_methods (code, name_ar, name_en, active, sort_order) VALUES
  ('visa', 'بطاقة / فيزا', 'Card / Visa', 1, 3),
  ('treasury', 'خزينة', 'Treasury', 1, 4);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('use_last_customer_price', '0'),
  ('invoice_header', ''),
  ('price_2_name', 'سعر الجملة'),
  ('price_3_name', 'سعر 3'),
  ('price_4_name', 'سعر 4');
