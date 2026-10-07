ALTER TABLE purchase_invoice_items ADD COLUMN returned_qty INTEGER NOT NULL DEFAULT 0;
ALTER TABLE purchase_invoices ADD COLUMN wallet_surplus REAL NOT NULL DEFAULT 0;
ALTER TABLE purchase_invoices ADD COLUMN returned_total REAL NOT NULL DEFAULT 0;
ALTER TABLE sales_invoices ADD COLUMN returned_total REAL NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN supplier_id INTEGER;
ALTER TABLE payments ADD COLUMN purchase_id INTEGER;

CREATE TABLE IF NOT EXISTS purchase_returns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  purchase_id INTEGER NOT NULL,
  supplier_id INTEGER,
  date TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  total REAL NOT NULL DEFAULT 0,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (purchase_id) REFERENCES purchase_invoices(id)
);

CREATE TABLE IF NOT EXISTS purchase_return_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  return_id INTEGER NOT NULL,
  purchase_item_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  qty INTEGER NOT NULL,
  unit_cost REAL NOT NULL,
  total REAL NOT NULL,
  batch_id INTEGER,
  FOREIGN KEY (return_id) REFERENCES purchase_returns(id)
);

INSERT INTO permissions (code, module, name_ar, name_en) VALUES
  ('purchases.return', 'purchases', 'مرتجع مشتريات', 'Purchase return');

INSERT INTO role_permissions (role_id, permission_id)
SELECT 1, id FROM permissions WHERE code = 'purchases.return';

INSERT INTO role_permissions (role_id, permission_id)
SELECT 3, id FROM permissions WHERE code = 'purchases.return';
