-- Remaining spec leftovers: branches, quotes, product variants

CREATE TABLE IF NOT EXISTS branches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_en TEXT,
  city TEXT,
  address TEXT,
  phone TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

INSERT INTO branches (id, name, name_en, city, address, phone) VALUES
  (1, 'عباس العقاد', 'Abbas El Akkad', 'القاهرة', 'شارع عباس العقاد، مدينة نصر', '01000000000'),
  (2, 'المعادي', 'Maadi', 'القاهرة', 'المعادي', '01000000002');

ALTER TABLE sales_invoices ADD COLUMN branch_id INTEGER;
UPDATE sales_invoices SET branch_id = 1 WHERE branch_id IS NULL;

ALTER TABLE products ADD COLUMN parent_id INTEGER;
ALTER TABLE products ADD COLUMN color TEXT;
ALTER TABLE products ADD COLUMN quality TEXT;

INSERT INTO permissions (code, module, name_ar, name_en) VALUES
  ('import.manage', 'admin', 'استيراد البيانات', 'Import data'),
  ('branches.manage', 'admin', 'إدارة الفروع', 'Manage branches');

INSERT INTO role_permissions (role_id, permission_id)
SELECT 1, id FROM permissions WHERE code IN ('import.manage','branches.manage');

INSERT INTO role_permissions (role_id, permission_id)
SELECT 3, id FROM permissions WHERE code IN ('import.manage');
