ALTER TABLE customers ADD COLUMN lat REAL;
ALTER TABLE customers ADD COLUMN lng REAL;
ALTER TABLE customers ADD COLUMN supplier_id INTEGER;

ALTER TABLE suppliers ADD COLUMN currency TEXT NOT NULL DEFAULT 'EGP';
ALTER TABLE suppliers ADD COLUMN customer_id INTEGER;

INSERT OR IGNORE INTO settings (key, value) VALUES ('usd_egp_rate', '50');
