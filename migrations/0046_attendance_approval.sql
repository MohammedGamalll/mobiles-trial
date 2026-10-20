ALTER TABLE attendance_sessions ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE attendance_sessions ADD COLUMN late_minutes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE attendance_sessions ADD COLUMN admin_notes TEXT;
