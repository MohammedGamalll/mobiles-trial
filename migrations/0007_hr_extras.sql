CREATE TABLE IF NOT EXISTS work_shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_en TEXT,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  break_minutes INTEGER NOT NULL DEFAULT 60,
  expected_hours REAL NOT NULL DEFAULT 8,
  overtime_rate REAL NOT NULL DEFAULT 1.5,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE employees ADD COLUMN shift_id INTEGER;

CREATE TABLE IF NOT EXISTS leave_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  type TEXT NOT NULL DEFAULT 'annual',
  date_from TEXT NOT NULL,
  date_to TEXT NOT NULL,
  days REAL NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending',
  reason TEXT,
  reviewed_by INTEGER,
  reviewed_at TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);

CREATE TABLE IF NOT EXISTS salary_advances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  month TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  notes TEXT,
  created_by INTEGER,
  payroll_run_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);

CREATE TABLE IF NOT EXISTS overtime_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  hours REAL NOT NULL,
  rate REAL NOT NULL DEFAULT 1.5,
  amount REAL NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual',
  notes TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);

ALTER TABLE payslips ADD COLUMN overtime REAL NOT NULL DEFAULT 0;
ALTER TABLE payslips ADD COLUMN advances REAL NOT NULL DEFAULT 0;
ALTER TABLE payslips ADD COLUMN leave_days REAL NOT NULL DEFAULT 0;
ALTER TABLE payslips ADD COLUMN unpaid_days REAL NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_leaves_emp ON leave_requests(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_advances_month ON salary_advances(month, status);
CREATE INDEX IF NOT EXISTS idx_ot_emp ON overtime_entries(employee_id, date);

INSERT INTO work_shifts (id, name, name_en, start_time, end_time, break_minutes, expected_hours, overtime_rate) VALUES
  (1, 'صباحي', 'Morning', '09:00', '17:00', 60, 8, 1.5),
  (2, 'مسائي', 'Evening', '14:00', '22:00', 60, 8, 1.5);

UPDATE employees SET shift_id = 1 WHERE id IN (1, 2, 3, 5);
UPDATE employees SET shift_id = 2 WHERE id IN (4, 6, 7);

INSERT INTO leave_requests (employee_id, type, date_from, date_to, days, status, reason, reviewed_by, reviewed_at) VALUES
  (2, 'annual', '2026-09-22', '2026-09-23', 2, 'approved', 'إجازة سنوية', 1, datetime('now')),
  (3, 'sick', '2026-09-24', '2026-09-24', 1, 'pending', 'وعكة صحية', NULL, NULL),
  (5, 'unpaid', '2026-09-21', '2026-09-21', 1, 'approved', 'ظرف شخصي', 1, datetime('now'));

INSERT INTO salary_advances (employee_id, amount, date, month, status, notes) VALUES
  (4, 500, '2026-09-10', '2026-09', 'open', 'سلفة منتصف الشهر'),
  (2, 300, '2026-09-05', '2026-09', 'open', 'سلفة');

INSERT INTO overtime_entries (employee_id, date, hours, rate, amount, source, notes) VALUES
  (5, '2026-09-20', 2, 1.5, 200, 'manual', 'جرد مسائي');

INSERT INTO permissions (code, module, name_ar, name_en) VALUES
  ('leaves.own', 'hr', 'طلب إجازة', 'Own leave'),
  ('leaves.manage', 'hr', 'اعتماد الإجازات', 'Manage leaves'),
  ('advances.manage', 'hr', 'إدارة السلف', 'Manage advances');

INSERT INTO role_permissions (role_id, permission_id)
SELECT 1, id FROM permissions WHERE code IN ('leaves.own','leaves.manage','advances.manage');

INSERT INTO role_permissions (role_id, permission_id)
SELECT 2, id FROM permissions WHERE code = 'leaves.own';

INSERT INTO role_permissions (role_id, permission_id)
SELECT 3, id FROM permissions WHERE code = 'leaves.own';

INSERT INTO role_permissions (role_id, permission_id)
SELECT 4, id FROM permissions WHERE code = 'leaves.own';

INSERT INTO role_permissions (role_id, permission_id)
SELECT 5, id FROM permissions WHERE code IN ('leaves.own','leaves.manage','advances.manage');
