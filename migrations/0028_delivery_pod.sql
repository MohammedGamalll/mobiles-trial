ALTER TABLE sales_invoices ADD COLUMN stock_committed_at TEXT;
ALTER TABLE sales_invoices ADD COLUMN finance_committed_at TEXT;
ALTER TABLE sales_invoices ADD COLUMN assigned_at TEXT;
ALTER TABLE sales_invoices ADD COLUMN settled_at TEXT;
ALTER TABLE sales_invoices ADD COLUMN settlement_id INTEGER;

ALTER TABLE delivery_results ADD COLUMN settlement_id INTEGER;
ALTER TABLE delivery_results ADD COLUMN charge_to TEXT;
ALTER TABLE delivery_results ADD COLUMN collected REAL NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS delivery_settlements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  delivery_agent_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'posted',
  notes TEXT,
  collected_total REAL NOT NULL DEFAULT 0,
  delivered_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  damaged_count INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (delivery_agent_id) REFERENCES delivery_agents(id)
);

CREATE TABLE IF NOT EXISTS delivery_settlement_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  settlement_id INTEGER NOT NULL,
  invoice_id INTEGER NOT NULL,
  outcome TEXT NOT NULL,
  collected REAL NOT NULL DEFAULT 0,
  charge_to TEXT,
  notes TEXT,
  FOREIGN KEY (settlement_id) REFERENCES delivery_settlements(id),
  FOREIGN KEY (invoice_id) REFERENCES sales_invoices(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_settlement_invoice ON delivery_settlement_lines(invoice_id);
CREATE INDEX IF NOT EXISTS idx_settlements_agent ON delivery_settlements(delivery_agent_id, date);

INSERT INTO storage_locations (name, warehouse, kind, code, path, notes, active, sort_order)
SELECT name, warehouse, kind, code, path, notes, active, sort_order FROM (
  SELECT 'تالف / مفقود' AS name, 'تالف' AS warehouse, 'warehouse' AS kind, 'DAMAGED' AS code, 'DAMAGED' AS path, 'مخزن افتراضي للتالف والمفقود' AS notes, 1 AS active, 99 AS sort_order
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM storage_locations WHERE code = 'DAMAGED');

INSERT OR IGNORE INTO ledger_accounts (code, name_ar, name_en, type)
VALUES ('5300', 'تالف ومفقود', 'Damaged / lost inventory', 'expense');
