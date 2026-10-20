CREATE TABLE IF NOT EXISTS employee_bonuses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  reason TEXT,
  date TEXT NOT NULL,
  month TEXT NOT NULL,
  cash_account_id INTEGER,
  paid_immediately INTEGER NOT NULL DEFAULT 0,
  journal_id INTEGER,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);

CREATE INDEX IF NOT EXISTS idx_employee_bonuses_month ON employee_bonuses(employee_id, month);

ALTER TABLE payslips ADD COLUMN bonus REAL NOT NULL DEFAULT 0;
