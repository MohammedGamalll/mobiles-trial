INSERT INTO role_permissions (role_id, permission_id)
SELECT 3, p.id FROM permissions p
WHERE p.code = 'products.delete'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = 3 AND rp.permission_id = p.id
  );
