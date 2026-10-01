ALTER TABLE delivery_agents ADD COLUMN role_type TEXT DEFAULT 'delivery';
ALTER TABLE delivery_agents ADD COLUMN commission_rate REAL DEFAULT 0;
ALTER TABLE delivery_agents ADD COLUMN area TEXT;

ALTER TABLE sales_invoices ADD COLUMN sales_agent_id INTEGER;

CREATE TABLE IF NOT EXISTS sales_targets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  month TEXT NOT NULL,
  target_amount REAL NOT NULL DEFAULT 0,
  target_visits INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (agent_id, month),
  FOREIGN KEY (agent_id) REFERENCES delivery_agents(id)
);

CREATE TABLE IF NOT EXISTS sales_visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  customer_id INTEGER,
  customer_name TEXT,
  date TEXT NOT NULL,
  visit_time TEXT,
  purpose TEXT,
  result TEXT NOT NULL DEFAULT 'planned',
  notes TEXT,
  lat REAL,
  lng REAL,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (agent_id) REFERENCES delivery_agents(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS sales_commissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  invoice_id INTEGER NOT NULL,
  month TEXT NOT NULL,
  sale_amount REAL NOT NULL,
  rate REAL NOT NULL,
  amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'accrued',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (invoice_id, agent_id),
  FOREIGN KEY (agent_id) REFERENCES delivery_agents(id),
  FOREIGN KEY (invoice_id) REFERENCES sales_invoices(id)
);

CREATE INDEX IF NOT EXISTS idx_visits_agent ON sales_visits(agent_id, date);
CREATE INDEX IF NOT EXISTS idx_targets_month ON sales_targets(month);
CREATE INDEX IF NOT EXISTS idx_commissions_month ON sales_commissions(month, agent_id);

UPDATE delivery_agents SET role_type = 'both', commission_rate = 3, area = CASE id
  WHEN 1 THEN 'شرق القاهرة'
  WHEN 2 THEN 'المعادي والهرم'
  WHEN 3 THEN '6 أكتوبر والجيزة'
  ELSE area
END
WHERE id IN (1, 2, 3);

INSERT INTO delivery_agents (name, code, phone, status, notes, role_type, commission_rate, area) VALUES
  ('كريم صالح', '201', '01055556666', 'active', 'مندوب مبيعات مدينة نصر', 'sales', 4, 'مدينة نصر');

UPDATE sales_invoices SET sales_agent_id = delivery_agent_id WHERE delivery_agent_id IS NOT NULL AND sales_agent_id IS NULL;

INSERT INTO sales_targets (agent_id, month, target_amount, target_visits, notes) VALUES
  (1, '2026-09', 25000, 20, 'تارجت سبتمبر'),
  (2, '2026-09', 18000, 16, 'تارجت سبتمبر'),
  (3, '2026-09', 15000, 12, 'تارجت سبتمبر'),
  ((SELECT id FROM delivery_agents WHERE code = '201'), '2026-09', 30000, 25, 'تارجت مبيعات');

INSERT INTO sales_visits (agent_id, customer_id, customer_name, date, visit_time, purpose, result, notes) VALUES
  (1, 1, 'أحمد محمد', '2026-09-20', '11:00', 'متابعة طلب', 'done', 'تم الاتفاق على توصيل'),
  (1, 6, 'شركة تك موبايل', '2026-09-22', '16:00', 'عرض جملة', 'planned', NULL),
  (2, 2, 'محمود علي', '2026-09-21', '13:00', 'تحصيل', 'done', NULL),
  ((SELECT id FROM delivery_agents WHERE code = '201'), 4, 'كريم سعد', '2026-09-23', '10:00', 'زيارة عميل آجل', 'planned', 'متابعة الرصيد');

INSERT INTO permissions (code, module, name_ar, name_en) VALUES
  ('reps.view', 'sales', 'عرض المناديب والمبيعات', 'View sales reps'),
  ('reps.manage', 'sales', 'إدارة المناديب', 'Manage sales reps'),
  ('visits.own', 'sales', 'زيارات المندوب', 'Own visits'),
  ('visits.manage', 'sales', 'إدارة الزيارات', 'Manage visits'),
  ('targets.manage', 'sales', 'إدارة التارجت', 'Manage targets');

INSERT INTO role_permissions (role_id, permission_id)
SELECT 1, id FROM permissions WHERE code IN ('reps.view','reps.manage','visits.own','visits.manage','targets.manage');

INSERT INTO role_permissions (role_id, permission_id)
SELECT 2, id FROM permissions WHERE code IN ('reps.view','visits.own','visits.manage');

INSERT INTO role_permissions (role_id, permission_id)
SELECT 4, id FROM permissions WHERE code IN ('reps.view','visits.own');

INSERT INTO role_permissions (role_id, permission_id)
SELECT 5, id FROM permissions WHERE code IN ('reps.view');

INSERT INTO sales_commissions (agent_id, invoice_id, month, sale_amount, rate, amount, status)
SELECT COALESCE(si.sales_agent_id, si.delivery_agent_id), si.id, substr(si.date, 1, 7), si.total,
  a.commission_rate, ROUND(si.total * a.commission_rate / 100.0, 2), 'accrued'
FROM sales_invoices si
JOIN delivery_agents a ON a.id = COALESCE(si.sales_agent_id, si.delivery_agent_id)
WHERE si.deleted_at IS NULL
  AND si.status NOT IN ('cancelled', 'held', 'draft', 'pending_delivery')
  AND COALESCE(a.commission_rate, 0) > 0;
