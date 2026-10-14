INSERT OR IGNORE INTO ledger_accounts (code, name_ar, name_en, type, active) VALUES
  ('1101', 'الخزنة', 'Safe cash', 'asset', 1);

INSERT INTO cash_accounts (kind, name, name_en, account_id, opening_balance, current_balance, active)
SELECT 'cash', 'الصندوق الرئيسي', 'Main cash', la.id, 0, 0, 1
FROM ledger_accounts la
WHERE la.code = '1100'
  AND NOT EXISTS (
    SELECT 1 FROM cash_accounts c
    WHERE c.name IN ('الصندوق الرئيسي') OR c.name_en IN ('Main cash', 'Main Fund')
  )
LIMIT 1;

INSERT INTO cash_accounts (kind, name, name_en, account_id, opening_balance, current_balance, active)
SELECT 'cash', 'الخزنه', 'Safe', la.id, 0, 0, 1
FROM ledger_accounts la
WHERE la.code = '1101'
  AND NOT EXISTS (
    SELECT 1 FROM cash_accounts c
    WHERE c.name IN ('الخزنه', 'الخزنة') OR c.name_en IN ('Safe', 'The Safe')
  )
LIMIT 1;

ALTER TABLE vouchers ADD COLUMN invoice_id INTEGER;
ALTER TABLE salary_advances ADD COLUMN cash_account_id INTEGER;
ALTER TABLE salary_advances ADD COLUMN journal_id INTEGER;

CREATE TABLE IF NOT EXISTS revenue_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS other_revenues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  amount REAL NOT NULL,
  cash_account_id INTEGER NOT NULL,
  category_id INTEGER,
  category TEXT,
  notes TEXT,
  journal_id INTEGER,
  shift_id INTEGER,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  voided_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_other_revenues_date ON other_revenues(date);
CREATE INDEX IF NOT EXISTS idx_vouchers_invoice ON vouchers(invoice_id);

INSERT OR IGNORE INTO revenue_categories (id, name_ar, name_en, active) VALUES
  (1, 'إيجار معرّض', 'Display rent', 1),
  (2, 'رسوم خدمات', 'Service fees', 1),
  (3, 'تسوية', 'Settlement', 1),
  (4, 'أخرى', 'Other', 1);
