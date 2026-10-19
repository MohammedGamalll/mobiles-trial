CREATE TABLE IF NOT EXISTS user_permissions (
  user_id INTEGER NOT NULL,
  permission_id INTEGER NOT NULL,
  UNIQUE KEY uq_user_perm (user_id, permission_id)
);

INSERT IGNORE INTO user_permissions (user_id, permission_id)
SELECT u.id, rp.permission_id
FROM users u
JOIN role_permissions rp ON rp.role_id = u.role_id;

INSERT IGNORE INTO permissions (code, module, name_ar, name_en) VALUES
  ('advances.own', 'hr', 'طلب سلفة', 'Request own advance');

INSERT IGNORE INTO user_permissions (user_id, permission_id)
SELECT DISTINCT up.user_id, pnew.id
FROM user_permissions up
JOIN permissions pold ON pold.id = up.permission_id AND pold.code IN ('attendance.own', 'leaves.own')
JOIN permissions pnew ON pnew.code = 'advances.own';

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, pnew.id
FROM role_permissions rp
JOIN permissions pold ON pold.id = rp.permission_id AND pold.code IN ('attendance.own', 'leaves.own')
JOIN permissions pnew ON pnew.code = 'advances.own';

INSERT IGNORE INTO ledger_accounts (code, name_ar, name_en, type)
VALUES ('1410', 'سلف الموظفين', 'Employee advances', 'asset');
