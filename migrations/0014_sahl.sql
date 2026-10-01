ALTER TABLE products ADD COLUMN track_serial INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS product_serials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  serial TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_stock',
  purchase_id INTEGER,
  invoice_id INTEGER,
  invoice_item_id INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(product_id, serial)
);

CREATE TABLE IF NOT EXISTS cheques (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'in',
  party_type TEXT NOT NULL DEFAULT 'customer',
  party_id INTEGER,
  party_name TEXT,
  bank TEXT,
  amount REAL NOT NULL,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  invoice_id INTEGER,
  cash_account_id INTEGER,
  notes TEXT,
  created_by INTEGER,
  collected_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS installment_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  customer_id INTEGER,
  customer_name TEXT,
  total REAL NOT NULL,
  down_payment REAL NOT NULL DEFAULT 0,
  count INTEGER NOT NULL,
  start_date TEXT NOT NULL,
  interval_days INTEGER NOT NULL DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'open',
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS installment_dues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL,
  due_date TEXT NOT NULL,
  amount REAL NOT NULL,
  paid_amount REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'due',
  paid_at TEXT,
  payment_id INTEGER
);

INSERT OR IGNORE INTO payment_methods (code, name_ar, name_en, active, sort_order) VALUES
  ('network', 'شبكة', 'Network / Mada', 1, 9),
  ('cheque', 'شيك', 'Cheque', 1, 10),
  ('installment', 'تقسيط', 'Installment', 1, 11);

INSERT INTO permissions (code, module, name_ar, name_en) VALUES
  ('serials.manage', 'inventory', 'متابعة أرقام السيريال', 'Manage serial numbers'),
  ('cheques.manage', 'finance', 'تسجيل ومتابعة الشيكات', 'Manage cheques'),
  ('installments.manage', 'finance', 'تقسيط الفواتير ومتابعة الأقساط', 'Manage installments'),
  ('costs.view', 'reports', 'عرض التكلفة والربح', 'View cost and profit');

INSERT INTO role_permissions (role_id, permission_id)
SELECT 1, id FROM permissions WHERE code IN ('serials.manage','cheques.manage','installments.manage','costs.view');

INSERT INTO role_permissions (role_id, permission_id)
SELECT 3, id FROM permissions WHERE code IN ('serials.manage');

INSERT INTO role_permissions (role_id, permission_id)
SELECT 5, id FROM permissions WHERE code IN ('cheques.manage','installments.manage','costs.view');
