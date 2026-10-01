CREATE TABLE IF NOT EXISTS ledger_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  type TEXT NOT NULL,
  parent_id INTEGER,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS cash_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  name_en TEXT,
  account_id INTEGER NOT NULL,
  account_number TEXT,
  opening_balance REAL NOT NULL DEFAULT 0,
  current_balance REAL NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  FOREIGN KEY (account_id) REFERENCES ledger_accounts(id)
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  date TEXT NOT NULL,
  description TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  source_id INTEGER,
  status TEXT NOT NULL DEFAULT 'posted',
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS journal_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL,
  account_id INTEGER NOT NULL,
  debit REAL NOT NULL DEFAULT 0,
  credit REAL NOT NULL DEFAULT 0,
  notes TEXT,
  FOREIGN KEY (entry_id) REFERENCES journal_entries(id),
  FOREIGN KEY (account_id) REFERENCES ledger_accounts(id)
);

CREATE TABLE IF NOT EXISTS vouchers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  date TEXT NOT NULL,
  cash_account_id INTEGER NOT NULL,
  party_type TEXT,
  party_id INTEGER,
  party_name TEXT,
  amount REAL NOT NULL,
  method TEXT,
  description TEXT,
  journal_id INTEGER,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  voided_at TEXT,
  FOREIGN KEY (cash_account_id) REFERENCES cash_accounts(id)
);

CREATE INDEX IF NOT EXISTS idx_journal_source ON journal_entries(source, source_id);
CREATE INDEX IF NOT EXISTS idx_journal_date ON journal_entries(date);
CREATE INDEX IF NOT EXISTS idx_vouchers_date ON vouchers(date, type);

INSERT INTO ledger_accounts (id, code, name_ar, name_en, type) VALUES
  (1, '1100', 'الصندوق', 'Cash', 'asset'),
  (2, '1110', 'البنك', 'Bank', 'asset'),
  (3, '1200', 'العملاء', 'Accounts receivable', 'asset'),
  (4, '1300', 'المخزون', 'Inventory', 'asset'),
  (5, '2100', 'الموردون', 'Accounts payable', 'liability'),
  (6, '3100', 'رأس المال', 'Capital', 'equity'),
  (7, '4100', 'المبيعات', 'Sales', 'revenue'),
  (8, '4200', 'إيرادات أخرى', 'Other income', 'revenue'),
  (9, '5100', 'تكلفة البضاعة', 'Cost of goods', 'expense'),
  (10, '5200', 'المصروفات', 'Expenses', 'expense'),
  (11, '5300', 'المرتبات', 'Salaries', 'expense');

INSERT INTO cash_accounts (id, kind, name, name_en, account_id, account_number, opening_balance, current_balance) VALUES
  (1, 'cash', 'الصندوق الرئيسي', 'Main cash', 1, NULL, 15000, 15000),
  (2, 'bank', 'بنك مصر', 'Banque Misr', 2, '1234567890123', 40000, 40000);

INSERT INTO sequences (name, prefix, next_number) VALUES
  ('journal', 'JRN', 1003),
  ('voucher', 'VCH', 1002);

INSERT INTO journal_entries (id, number, date, description, source, source_id, status) VALUES
  (1, 'JRN-1001', '2026-09-01', 'رصيد افتتاحي', 'opening', NULL, 'posted');

INSERT INTO journal_lines (entry_id, account_id, debit, credit, notes) VALUES
  (1, 1, 15000, 0, 'صندوق'),
  (1, 2, 40000, 0, 'بنك'),
  (1, 6, 0, 55000, 'رأس مال');

INSERT INTO vouchers (id, number, type, date, cash_account_id, party_type, party_name, amount, method, description) VALUES
  (1, 'VCH-1001', 'receipt', '2026-09-15', 1, 'other', 'إيداع رأس مال إضافي', 0, 'cash', 'سند تجريبي — المبلغ صفر حتى لا يحرّك الرصيد مرتين');

INSERT INTO permissions (code, module, name_ar, name_en) VALUES
  ('ledger.view', 'finance', 'عرض الحسابات والقيود', 'View ledger'),
  ('ledger.manage', 'finance', 'إدارة الحسابات', 'Manage ledger'),
  ('vouchers.create', 'finance', 'إنشاء سندات', 'Create vouchers');

INSERT INTO role_permissions (role_id, permission_id)
SELECT 1, id FROM permissions WHERE code IN ('ledger.view','ledger.manage','vouchers.create');

INSERT INTO role_permissions (role_id, permission_id)
SELECT 5, id FROM permissions WHERE code IN ('ledger.view','ledger.manage','vouchers.create');
