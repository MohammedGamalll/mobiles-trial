ALTER TABLE salary_advances ADD COLUMN remaining REAL NOT NULL DEFAULT 0;
ALTER TABLE payslips ADD COLUMN paid_amount REAL NOT NULL DEFAULT 0;
ALTER TABLE payslips ADD COLUMN advances_settled INTEGER NOT NULL DEFAULT 0;

UPDATE salary_advances SET remaining = amount WHERE status = 'open';
UPDATE salary_advances SET remaining = 0, status = 'settled' WHERE status = 'deducted';
UPDATE payslips SET paid_amount = net, advances_settled = 1
WHERE run_id IN (SELECT id FROM payroll_runs WHERE status = 'paid');
