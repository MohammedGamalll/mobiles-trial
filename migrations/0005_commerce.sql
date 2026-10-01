ALTER TABLE sales_invoices ADD COLUMN tax_rate REAL DEFAULT 0;
ALTER TABLE sales_invoices ADD COLUMN tax_amount REAL DEFAULT 0;
ALTER TABLE sales_invoices ADD COLUMN price_list_id INTEGER;
ALTER TABLE sales_invoices ADD COLUMN held_at TEXT;

ALTER TABLE customers ADD COLUMN email TEXT;
ALTER TABLE customers ADD COLUMN national_id TEXT;
ALTER TABLE customers ADD COLUMN company TEXT;
ALTER TABLE customers ADD COLUMN tax_id TEXT;
ALTER TABLE customers ADD COLUMN city TEXT;
ALTER TABLE customers ADD COLUMN price_list_id INTEGER;

ALTER TABLE suppliers ADD COLUMN email TEXT;
ALTER TABLE suppliers ADD COLUMN tax_id TEXT;
ALTER TABLE suppliers ADD COLUMN city TEXT;
ALTER TABLE suppliers ADD COLUMN contact_name TEXT;
ALTER TABLE suppliers ADD COLUMN phone2 TEXT;
ALTER TABLE suppliers ADD COLUMN payment_terms TEXT;

ALTER TABLE purchase_invoices ADD COLUMN submitted_at TEXT;
ALTER TABLE purchase_invoices ADD COLUMN rejected_at TEXT;
ALTER TABLE purchase_invoices ADD COLUMN reject_reason TEXT;

CREATE TABLE IF NOT EXISTS price_lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_en TEXT,
  customer_type TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS price_list_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  price_list_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  price REAL NOT NULL,
  UNIQUE (price_list_id, product_id),
  FOREIGN KEY (price_list_id) REFERENCES price_lists(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS supplier_product_prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  unit_cost REAL NOT NULL,
  last_purchase_id INTEGER,
  last_date TEXT,
  notes TEXT,
  UNIQUE (supplier_id, product_id),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

INSERT INTO price_lists (id, name, name_en, customer_type, active) VALUES
  (1, 'تجزئة', 'Retail', 'retail', 1),
  (2, 'جملة', 'Wholesale', 'wholesale', 1);

INSERT INTO price_list_items (price_list_id, product_id, price)
SELECT 1, id, selling_price FROM products WHERE deleted_at IS NULL AND COALESCE(kind,'product') != 'service';

INSERT INTO price_list_items (price_list_id, product_id, price)
SELECT 2, id, CASE WHEN wholesale_price > 0 THEN wholesale_price ELSE selling_price END
FROM products WHERE deleted_at IS NULL AND COALESCE(kind,'product') != 'service';

INSERT INTO supplier_product_prices (supplier_id, product_id, unit_cost, last_purchase_id, last_date)
SELECT ib.supplier_id, ib.product_id, MIN(ib.unit_cost), MAX(ib.purchase_id), MAX(ib.purchase_date)
FROM inventory_batches ib
WHERE ib.supplier_id IS NOT NULL
GROUP BY ib.supplier_id, ib.product_id;

INSERT OR IGNORE INTO settings (key, value) VALUES ('tax_rate', '14');

UPDATE customers SET price_list_id = 1 WHERE customer_type = 'retail' AND price_list_id IS NULL;
UPDATE customers SET price_list_id = 2 WHERE customer_type = 'wholesale' AND price_list_id IS NULL;

INSERT INTO permissions (code, module, name_ar, name_en) VALUES
  ('prices.view', 'sales', 'عرض قوائم الأسعار', 'View price lists'),
  ('prices.manage', 'sales', 'إدارة قوائم الأسعار', 'Manage price lists');

INSERT INTO role_permissions (role_id, permission_id)
SELECT 1, id FROM permissions WHERE code IN ('prices.view','prices.manage');

INSERT INTO role_permissions (role_id, permission_id)
SELECT 2, id FROM permissions WHERE code = 'prices.view';

INSERT INTO role_permissions (role_id, permission_id)
SELECT 3, id FROM permissions WHERE code IN ('prices.view','prices.manage');

INSERT INTO role_permissions (role_id, permission_id)
SELECT 5, id FROM permissions WHERE code = 'prices.view';
