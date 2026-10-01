-- Services, live courier tracking, HR / payroll / geofenced attendance

ALTER TABLE products ADD COLUMN kind TEXT NOT NULL DEFAULT 'product';
ALTER TABLE delivery_agents ADD COLUMN lat REAL;
ALTER TABLE delivery_agents ADD COLUMN lng REAL;
ALTER TABLE delivery_agents ADD COLUMN last_seen_at TEXT;
ALTER TABLE sales_invoice_items ADD COLUMN item_kind TEXT NOT NULL DEFAULT 'product';

CREATE TABLE IF NOT EXISTS agent_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  accuracy REAL,
  heading REAL,
  speed REAL,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (agent_id) REFERENCES delivery_agents(id)
);
CREATE INDEX IF NOT EXISTS idx_agent_locations_agent ON agent_locations(agent_id, recorded_at);

CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  job_title TEXT,
  department TEXT,
  hire_date TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  work_type TEXT NOT NULL DEFAULT 'office',
  user_id INTEGER,
  delivery_agent_id INTEGER,
  basic_salary REAL NOT NULL DEFAULT 0,
  allowances REAL NOT NULL DEFAULT 0,
  national_id TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (delivery_agent_id) REFERENCES delivery_agents(id)
);

CREATE TABLE IF NOT EXISTS attendance_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  work_date TEXT NOT NULL,
  clock_in_at TEXT NOT NULL,
  clock_out_at TEXT,
  clock_in_lat REAL,
  clock_in_lng REAL,
  clock_out_lat REAL,
  clock_out_lng REAL,
  distance_in REAL,
  outside_seconds INTEGER NOT NULL DEFAULT 0,
  currently_outside INTEGER NOT NULL DEFAULT 0,
  outside_started_at TEXT,
  work_seconds INTEGER NOT NULL DEFAULT 0,
  late INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);
CREATE INDEX IF NOT EXISTS idx_att_emp_date ON attendance_sessions(employee_id, work_date);

CREATE TABLE IF NOT EXISTS attendance_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  lat REAL,
  lng REAL,
  distance_m REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES attendance_sessions(id),
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);

CREATE TABLE IF NOT EXISTS payroll_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_by INTEGER,
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payslips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,
  basic REAL NOT NULL DEFAULT 0,
  allowances REAL NOT NULL DEFAULT 0,
  present_days INTEGER NOT NULL DEFAULT 0,
  absent_days INTEGER NOT NULL DEFAULT 0,
  late_days INTEGER NOT NULL DEFAULT 0,
  outside_minutes INTEGER NOT NULL DEFAULT 0,
  deductions REAL NOT NULL DEFAULT 0,
  net REAL NOT NULL DEFAULT 0,
  expense_id INTEGER,
  notes TEXT,
  FOREIGN KEY (run_id) REFERENCES payroll_runs(id),
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);

INSERT INTO part_types (id, name_ar, name_en, code) VALUES (15, 'خدمات', 'Services', 'SRV');
INSERT INTO categories (id, name_ar, name_en) VALUES (13, 'خدمات', 'Services');

INSERT INTO products (id, sku, barcode, part_number, name_ar, name_en, brand_id, part_type_id, category_id, purchase_price, selling_price, wholesale_price, min_selling_price, current_stock, reserved_stock, min_stock, description, notes, active, kind) VALUES
  (33, 'SRV-LCD', '6223000000332', 'SRV-INSTALL-LCD', 'تركيب شاشة', 'Screen installation', NULL, 15, 13, 40, 150, 120, 100, 0, 0, 0, 'خدمة تركيب شاشة في المحل أو عند العميل', NULL, 1, 'service'),
  (34, 'SRV-SW', '6223000000349', 'SRV-SOFTWARE', 'صيانة سوفتوير', 'Software repair', NULL, 15, 13, 20, 200, 150, 120, 0, 0, 0, 'فلاشة وإصلاح نظام', NULL, 1, 'service'),
  (35, 'SRV-CLN', '6223000000356', 'SRV-CLEAN', 'تنظيف الجهاز', 'Device cleaning', NULL, 15, 13, 15, 80, 60, 50, 0, 0, 0, 'تنظيف داخلي ومنفذ شحن', NULL, 1, 'service');

INSERT INTO permissions (code, module, name_ar, name_en) VALUES
  ('hr.view', 'hr', 'عرض الموارد البشرية', 'View HR'),
  ('hr.manage', 'hr', 'إدارة الموظفين', 'Manage employees'),
  ('hr.payroll', 'hr', 'إدارة الرواتب', 'Manage payroll'),
  ('attendance.own', 'hr', 'تسجيل الحضور', 'Own attendance');

INSERT INTO role_permissions (role_id, permission_id)
SELECT 1, id FROM permissions WHERE code IN ('hr.view','hr.manage','hr.payroll','attendance.own');

INSERT INTO role_permissions (role_id, permission_id)
SELECT 2, id FROM permissions WHERE code = 'attendance.own';

INSERT INTO role_permissions (role_id, permission_id)
SELECT 3, id FROM permissions WHERE code = 'attendance.own';

INSERT INTO role_permissions (role_id, permission_id)
SELECT 4, id FROM permissions WHERE code = 'attendance.own';

INSERT INTO role_permissions (role_id, permission_id)
SELECT 5, id FROM permissions WHERE code IN ('hr.view','hr.payroll','attendance.own');

INSERT INTO settings (key, value) VALUES
  ('workplace_lat', '30.0566'),
  ('workplace_lng', '31.3300'),
  ('geofence_meters', '100'),
  ('shift_start', '09:00');

INSERT INTO employees (id, code, name, phone, job_title, department, hire_date, status, work_type, user_id, delivery_agent_id, basic_salary, allowances, notes) VALUES
  (1, 'EMP-001', 'مدير النظام', '01000000001', 'مدير', 'الإدارة', '2024-01-01', 'active', 'office', 1, NULL, 12000, 2000, NULL),
  (2, 'EMP-002', 'سارة أحمد', '01000000002', 'مبيعات', 'المبيعات', '2024-03-01', 'active', 'office', 2, NULL, 7000, 500, NULL),
  (3, 'EMP-003', 'خالد منصور', '01000000003', 'أمين مخزن', 'المخزن', '2024-02-15', 'active', 'office', 3, NULL, 6500, 400, NULL),
  (4, 'EMP-004', 'محمد علي', '01098765432', 'مندوب توصيل', 'التوصيل', '2024-04-01', 'active', 'delivery', 4, 1, 5500, 800, NULL),
  (5, 'EMP-005', 'منى حسن', '01000000005', 'محاسبة', 'الحسابات', '2024-01-10', 'active', 'office', 5, NULL, 8000, 600, NULL),
  (6, 'EMP-006', 'أحمد السيد', '01087654321', 'مندوب توصيل', 'التوصيل', '2024-05-01', 'active', 'delivery', NULL, 2, 5000, 700, NULL),
  (7, 'EMP-007', 'محمود فتحي', '01076543210', 'مندوب توصيل', 'التوصيل', '2024-06-01', 'active', 'delivery', NULL, 3, 5000, 700, NULL);

UPDATE delivery_agents SET lat = 30.0581, lng = 31.3284, last_seen_at = datetime('now') WHERE id = 1;
UPDATE delivery_agents SET lat = 29.9602, lng = 31.2569, last_seen_at = datetime('now') WHERE id = 2;
UPDATE delivery_agents SET lat = 29.9741, lng = 30.9436, last_seen_at = datetime('now') WHERE id = 3;

INSERT INTO agent_locations (agent_id, lat, lng, accuracy, recorded_at) VALUES
  (1, 30.0566, 31.3300, 12, datetime('now','-12 minutes')),
  (1, 30.0574, 31.3291, 10, datetime('now','-8 minutes')),
  (1, 30.0581, 31.3284, 8, datetime('now')),
  (2, 29.9620, 31.2590, 15, datetime('now','-9 minutes')),
  (2, 29.9602, 31.2569, 11, datetime('now')),
  (3, 29.9760, 30.9470, 18, datetime('now','-7 minutes')),
  (3, 29.9741, 30.9436, 14, datetime('now'));

INSERT INTO attendance_sessions (employee_id, work_date, clock_in_at, clock_out_at, clock_in_lat, clock_in_lng, clock_out_lat, clock_out_lng, distance_in, outside_seconds, currently_outside, work_seconds, late, status) VALUES
  (2, date('now','-1 day'), datetime('now','-1 day','start of day','+9 hours'), datetime('now','-1 day','start of day','+17 hours'), 30.0566, 31.3300, 30.0566, 31.3300, 12, 0, 0, 28800, 0, 'closed'),
  (3, date('now','-1 day'), datetime('now','-1 day','start of day','+9 hours','+20 minutes'), datetime('now','-1 day','start of day','+17 hours'), 30.0567, 31.3301, 30.0566, 31.3300, 18, 420, 0, 27480, 1, 'closed'),
  (5, date('now','-1 day'), datetime('now','-1 day','start of day','+9 hours'), datetime('now','-1 day','start of day','+17 hours'), 30.0566, 31.3300, 30.0566, 31.3300, 9, 0, 0, 28800, 0, 'closed');

INSERT INTO attendance_events (session_id, employee_id, type, lat, lng, distance_m, created_at) VALUES
  (2, 3, 'in', 30.0567, 31.3301, 18, datetime('now','-1 day','start of day','+9 hours','+20 minutes')),
  (2, 3, 'left_zone', 30.0578, 31.3318, 175, datetime('now','-1 day','start of day','+13 hours')),
  (2, 3, 'return_zone', 30.0566, 31.3300, 8, datetime('now','-1 day','start of day','+13 hours','+7 minutes')),
  (2, 3, 'out', 30.0566, 31.3300, 10, datetime('now','-1 day','start of day','+17 hours'));
