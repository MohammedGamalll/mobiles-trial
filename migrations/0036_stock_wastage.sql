INSERT IGNORE INTO ledger_accounts (code, name_ar, name_en, type) VALUES
  ('5400', 'هوالك المخزون', 'Inventory wastage', 'expense');

CREATE TABLE IF NOT EXISTS stock_wastage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stocktake_id INTEGER NOT NULL,
  stocktake_item_id INTEGER NOT NULL UNIQUE,
  product_id INTEGER NOT NULL,
  batch_id INTEGER,
  location_id INTEGER,
  qty REAL NOT NULL,
  unit_cost REAL NOT NULL DEFAULT 0,
  loss_value REAL NOT NULL DEFAULT 0,
  month TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (stocktake_id) REFERENCES stocktakes(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE INDEX IF NOT EXISTS idx_wastage_month ON stock_wastage(month);
CREATE INDEX IF NOT EXISTS idx_wastage_stocktake ON stock_wastage(stocktake_id);

INSERT IGNORE INTO stock_wastage (stocktake_id, stocktake_item_id, product_id, batch_id, location_id, qty, unit_cost, loss_value, month)
SELECT i.stocktake_id, i.id, i.product_id, i.batch_id, i.location_id,
       -i.variance, i.unit_cost, (-i.variance) * COALESCE(i.unit_cost, 0),
       SUBSTR(s.date, 1, 7)
FROM stocktake_items i
JOIN stocktakes s ON s.id = i.stocktake_id
WHERE s.status = 'approved' AND IFNULL(i.variance, 0) < 0;
