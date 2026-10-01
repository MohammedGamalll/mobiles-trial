ALTER TABLE products ADD COLUMN unit TEXT DEFAULT 'قطعة';
ALTER TABLE products ADD COLUMN reorder_point INTEGER DEFAULT 0;
ALTER TABLE product_offers ADD COLUMN valid_from TEXT;
ALTER TABLE product_offers ADD COLUMN valid_to TEXT;
