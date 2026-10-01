UPDATE customers SET phone = NULL WHERE phone = '';
CREATE UNIQUE INDEX idx_customers_phone_uq ON customers(phone);
