CREATE TABLE IF NOT EXISTS partners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  equity_percentage REAL NOT NULL,
  starting_balance REAL NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS partner_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  partner_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  amount REAL NOT NULL,
  cash_account_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  note TEXT,
  journal_id INTEGER,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (partner_id) REFERENCES partners(id),
  FOREIGN KEY (cash_account_id) REFERENCES cash_accounts(id)
);

CREATE INDEX IF NOT EXISTS idx_partner_tx_partner ON partner_transactions(partner_id, type);
CREATE INDEX IF NOT EXISTS idx_partners_active ON partners(active, id);

INSERT INTO permissions (code, module, name_ar, name_en) VALUES
  ('partners.view', 'finance', 'عرض الشركاء وحقوق الملكية', 'View partners and equity'),
  ('partners.manage', 'finance', 'إدارة الشركاء والمسحوبات', 'Manage partners and drawings');

INSERT INTO role_permissions (role_id, permission_id)
SELECT 1, id FROM permissions WHERE code IN ('partners.view', 'partners.manage');

INSERT INTO role_permissions (role_id, permission_id)
SELECT 5, id FROM permissions WHERE code IN ('partners.view', 'partners.manage');
