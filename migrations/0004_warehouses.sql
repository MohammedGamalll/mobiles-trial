-- Multi-warehouse hierarchy on storage_locations (no duplicate location table)

ALTER TABLE storage_locations ADD COLUMN parent_id INTEGER;
ALTER TABLE storage_locations ADD COLUMN kind TEXT DEFAULT 'bin';
ALTER TABLE storage_locations ADD COLUMN code TEXT;
ALTER TABLE storage_locations ADD COLUMN path TEXT;
ALTER TABLE storage_locations ADD COLUMN sort_order INTEGER DEFAULT 0;

ALTER TABLE inventory_batches ADD COLUMN location_id INTEGER;
ALTER TABLE stock_movements ADD COLUMN from_location_id INTEGER;
ALTER TABLE stock_movements ADD COLUMN to_location_id INTEGER;

CREATE TABLE IF NOT EXISTS stock_transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  from_location_id INTEGER NOT NULL,
  to_location_id INTEGER NOT NULL,
  notes TEXT,
  created_by INTEGER,
  completed_by INTEGER,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (from_location_id) REFERENCES storage_locations(id),
  FOREIGN KEY (to_location_id) REFERENCES storage_locations(id)
);

CREATE TABLE IF NOT EXISTS stock_transfer_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transfer_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  batch_id INTEGER NOT NULL,
  qty INTEGER NOT NULL,
  unit_cost REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (transfer_id) REFERENCES stock_transfers(id),
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (batch_id) REFERENCES inventory_batches(id)
);

CREATE TABLE IF NOT EXISTS stocktakes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  date TEXT NOT NULL,
  location_id INTEGER,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_by INTEGER,
  submitted_at TEXT,
  approved_by INTEGER,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (location_id) REFERENCES storage_locations(id)
);

CREATE TABLE IF NOT EXISTS stocktake_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stocktake_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  batch_id INTEGER,
  location_id INTEGER,
  system_qty INTEGER NOT NULL DEFAULT 0,
  counted_qty INTEGER,
  variance INTEGER,
  unit_cost REAL NOT NULL DEFAULT 0,
  notes TEXT,
  FOREIGN KEY (stocktake_id) REFERENCES stocktakes(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE INDEX IF NOT EXISTS idx_locations_parent ON storage_locations(parent_id);
CREATE INDEX IF NOT EXISTS idx_batches_location ON inventory_batches(location_id);
CREATE INDEX IF NOT EXISTS idx_transfers_status ON stock_transfers(status);
CREATE INDEX IF NOT EXISTS idx_stocktakes_status ON stocktakes(status);

INSERT INTO storage_locations (name, warehouse, kind, code, path, notes, active, sort_order) VALUES
  ('المخزن الرئيسي', 'Main Warehouse', 'warehouse', 'MAIN', 'MAIN', 'المخزن الأساسي', 1, 1),
  ('مخزن المعرض', 'Showroom', 'warehouse', 'SHOW', 'SHOW', 'مخزن المعرض الأمامي', 1, 2);

UPDATE storage_locations SET
  parent_id = (SELECT id FROM (SELECT id FROM storage_locations WHERE code = 'MAIN' AND kind = 'warehouse' LIMIT 1) AS main_wh),
  kind = 'bin',
  code = CASE id
    WHEN 1 THEN 'A-A-4-15'
    WHEN 2 THEN 'A-A-4-16'
    WHEN 3 THEN 'B-B-2'
    WHEN 4 THEN 'ACC-B15'
    WHEN 5 THEN 'IC-C-1-3'
    ELSE code
  END,
  path = CASE id
    WHEN 1 THEN 'MAIN/A/A/4/15'
    WHEN 2 THEN 'MAIN/A/A/4/16'
    WHEN 3 THEN 'MAIN/B/B/2'
    WHEN 4 THEN 'MAIN/ACC/B-15'
    WHEN 5 THEN 'MAIN/IC/C/1/3'
    ELSE path
  END
WHERE id IN (1, 2, 3, 4, 5);

INSERT INTO storage_locations (name, warehouse, section, kind, code, path, parent_id, active, sort_order)
SELECT 'المعرض - رف 1', 'Showroom', 'R1', 'bin', 'SHOW-R1', 'SHOW/R1', id, 1, 1
FROM (SELECT id FROM storage_locations WHERE code = 'SHOW' AND kind = 'warehouse' LIMIT 1) AS show_wh;

UPDATE inventory_batches SET location_id = (
  SELECT p.location_id FROM products p WHERE p.id = inventory_batches.product_id
)
WHERE location_id IS NULL;

INSERT INTO sequences (name, prefix, next_number) VALUES
  ('transfer', 'TRN', 1001),
  ('stocktake', 'STK', 1001);

INSERT INTO permissions (code, module, name_ar, name_en) VALUES
  ('transfers.view', 'inventory', 'عرض تحويلات المخزون', 'View stock transfers'),
  ('transfers.create', 'inventory', 'إنشاء تحويل مخزون', 'Create stock transfer'),
  ('transfers.complete', 'inventory', 'تنفيذ تحويل مخزون', 'Complete stock transfer'),
  ('stocktake.view', 'inventory', 'عرض الجرد', 'View stocktake'),
  ('stocktake.create', 'inventory', 'إنشاء جرد', 'Create stocktake'),
  ('stocktake.approve', 'inventory', 'اعتماد الجرد', 'Approve stocktake');

INSERT INTO role_permissions (role_id, permission_id)
SELECT 1, id FROM permissions WHERE code IN (
  'transfers.view','transfers.create','transfers.complete','stocktake.view','stocktake.create','stocktake.approve'
);

INSERT INTO role_permissions (role_id, permission_id)
SELECT 3, id FROM permissions WHERE code IN (
  'transfers.view','transfers.create','transfers.complete','stocktake.view','stocktake.create','stocktake.approve'
);
