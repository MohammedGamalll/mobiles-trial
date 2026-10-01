-- Phase 8: finer permissions, audit old/new, backup log

ALTER TABLE audit_logs ADD COLUMN old_value TEXT;
ALTER TABLE audit_logs ADD COLUMN new_value TEXT;

CREATE TABLE IF NOT EXISTS backups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO permissions (code, module, name_ar, name_en) VALUES
  ('sales.override_min', 'sales', 'البيع أقل من الحد الأدنى', 'Override minimum selling price'),
  ('customers.credit', 'customers', 'تعديل حد الائتمان', 'Edit customer credit limit'),
  ('expenses.void', 'finance', 'إلغاء مصروف', 'Void expense'),
  ('payments.void', 'finance', 'إلغاء دفعة', 'Void payment'),
  ('reports.export', 'reports', 'تصدير التقارير', 'Export reports'),
  ('approvals.view', 'admin', 'عرض الاعتمادات المعلقة', 'View pending approvals'),
  ('backup.manage', 'admin', 'النسخ الاحتياطي', 'Manage backups');

INSERT INTO role_permissions (role_id, permission_id)
SELECT 1, id FROM permissions WHERE code IN (
  'sales.override_min','customers.credit','expenses.void','payments.void','reports.export','approvals.view','backup.manage'
);

INSERT INTO role_permissions (role_id, permission_id)
SELECT 3, id FROM permissions WHERE code IN ('approvals.view');

INSERT INTO role_permissions (role_id, permission_id)
SELECT 5, id FROM permissions WHERE code IN (
  'customers.credit','expenses.void','payments.void','reports.export','approvals.view'
);
