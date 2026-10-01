CREATE TABLE IF NOT EXISTS product_offers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  min_qty INTEGER NOT NULL DEFAULT 2,
  discount_type TEXT NOT NULL DEFAULT 'percent',
  discount_value REAL NOT NULL DEFAULT 0,
  name TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

ALTER TABLE expenses ADD COLUMN cost_center TEXT;
ALTER TABLE expenses ADD COLUMN recurring INTEGER NOT NULL DEFAULT 0;
ALTER TABLE expenses ADD COLUMN recur_every_days INTEGER;
ALTER TABLE expenses ADD COLUMN next_due TEXT;
