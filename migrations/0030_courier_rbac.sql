INSERT INTO permissions (code, module, name_ar, name_en) VALUES
  ('delivery.mark', 'delivery', 'تعليم التوصيل من المندوب', 'Courier mark delivered'),
  ('delivery.settle', 'delivery', 'اعتماد تسوية المندوب والنقدية', 'Confirm courier settlement'),
  ('sales.discount', 'sales', 'تطبيق خصم على الفاتورة', 'Apply invoice discount');

INSERT INTO role_permissions (role_id, permission_id)
SELECT 1, id FROM permissions WHERE code IN ('delivery.mark','delivery.settle','sales.discount');

INSERT INTO role_permissions (role_id, permission_id)
SELECT 5, id FROM permissions WHERE code IN ('delivery.settle');

DELETE FROM role_permissions
WHERE role_id = 4 AND permission_id IN (
  SELECT id FROM permissions WHERE code IN (
    'sales.view','customers.view','returns.create','delivery.update','dashboard.view'
  )
);

INSERT INTO role_permissions (role_id, permission_id)
SELECT 4, id FROM permissions WHERE code IN ('delivery.mark','delivery.view','attendance.own','leaves.own');
