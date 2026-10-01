UPDATE branches
SET name = 'المنيل',
    name_en = 'El Manial',
    city = 'القاهرة',
    address = 'المنيل',
    active = 1
WHERE id = 1;

INSERT INTO branches (id, name, name_en, city, address, phone, active)
SELECT 1, 'المنيل', 'El Manial', 'القاهرة', 'المنيل', '01000000000', 1
WHERE NOT EXISTS (SELECT 1 FROM branches WHERE id = 1);

UPDATE sales_invoices SET branch_id = 1 WHERE branch_id IS NULL OR branch_id != 1;
DELETE FROM branches WHERE id != 1;
