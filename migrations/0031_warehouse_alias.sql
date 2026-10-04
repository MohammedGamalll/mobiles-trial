-- Same store was stored as both "Main Warehouse" and "المخزن الرئيسي".
UPDATE storage_locations
SET warehouse = 'المخزن الرئيسي'
WHERE warehouse IN ('Main Warehouse', 'MAIN', 'main warehouse', 'Main');
