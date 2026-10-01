INSERT INTO settings (key, value) VALUES ('allow_negative_stock', '0')
ON CONFLICT(key) DO NOTHING;
