UPDATE users
SET username = 'pixel@gmail.com',
    password_hash = '503535236f695edcf3dd9046b127adc5d56f6c4f161a29e25859ddf7c059bd3d',
    password_salt = 'pxadm1',
    updated_at = datetime('now')
WHERE username = 'admin' AND deleted_at IS NULL;
