CREATE TABLE IF NOT EXISTS pos_shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  cash_account_id INTEGER NOT NULL,
  opened_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT,
  opening_cash_balance REAL NOT NULL DEFAULT 0,
  expected_cash_balance REAL,
  actual_cash_balance REAL,
  variance REAL,
  leave_float REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  close_journal_id INTEGER,
  variance_journal_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (cash_account_id) REFERENCES cash_accounts(id)
);

CREATE INDEX IF NOT EXISTS idx_pos_shifts_user_open ON pos_shifts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_pos_shifts_drawer_open ON pos_shifts(cash_account_id, status);
CREATE INDEX IF NOT EXISTS idx_pos_shifts_opened ON pos_shifts(opened_at);

ALTER TABLE sales_invoices ADD COLUMN shift_id INTEGER;
ALTER TABLE sales_returns ADD COLUMN shift_id INTEGER;
ALTER TABLE vouchers ADD COLUMN shift_id INTEGER;
ALTER TABLE expenses ADD COLUMN shift_id INTEGER;
ALTER TABLE payments ADD COLUMN shift_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_sales_shift ON sales_invoices(shift_id);
CREATE INDEX IF NOT EXISTS idx_returns_shift ON sales_returns(shift_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_shift ON vouchers(shift_id);
CREATE INDEX IF NOT EXISTS idx_expenses_shift ON expenses(shift_id);
CREATE INDEX IF NOT EXISTS idx_payments_shift ON payments(shift_id);

INSERT OR IGNORE INTO ledger_accounts (code, name_ar, name_en, type, active) VALUES
  ('4210', 'زيادة صندوق', 'Cash overage', 'revenue', 1),
  ('5215', 'عجز صندوق', 'Cash shortage', 'expense', 1);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('main_safe_id', '1'),
  ('pos_require_shift', '1');
