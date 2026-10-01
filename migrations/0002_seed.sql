-- PIXEL demo seed (Egyptian)

INSERT INTO roles (id, slug, name_ar, name_en) VALUES
  (1, 'admin', 'مدير النظام', 'Admin'),
  (2, 'sales', 'مبيعات', 'Sales'),
  (3, 'warehouse', 'مخزن', 'Warehouse'),
  (4, 'delivery', 'توصيل', 'Delivery'),
  (5, 'accountant', 'محاسب', 'Accountant');

INSERT INTO permissions (code, module, name_ar, name_en) VALUES
  ('dashboard.view', 'dashboard', 'عرض لوحة التحكم', 'View dashboard'),
  ('products.view', 'products', 'عرض المنتجات', 'View products'),
  ('products.create', 'products', 'إضافة منتج', 'Create product'),
  ('products.edit', 'products', 'تعديل منتج', 'Edit product'),
  ('products.delete', 'products', 'حذف منتج', 'Delete product'),
  ('brands.manage', 'catalog', 'إدارة العلامات', 'Manage brands'),
  ('categories.manage', 'catalog', 'إدارة التصنيفات', 'Manage categories'),
  ('models.manage', 'catalog', 'إدارة الموديلات', 'Manage models'),
  ('locations.manage', 'catalog', 'إدارة أماكن التخزين', 'Manage locations'),
  ('inventory.view', 'inventory', 'عرض المخزون', 'View inventory'),
  ('inventory.adjust', 'inventory', 'تسوية المخزون', 'Adjust inventory'),
  ('purchases.view', 'purchases', 'عرض المشتريات', 'View purchases'),
  ('purchases.create', 'purchases', 'إنشاء فاتورة شراء', 'Create purchase'),
  ('purchases.approve', 'purchases', 'اعتماد فاتورة شراء', 'Approve purchase'),
  ('sales.view', 'sales', 'عرض المبيعات', 'View sales'),
  ('sales.create', 'sales', 'إنشاء فاتورة بيع', 'Create sale'),
  ('sales.edit', 'sales', 'تعديل فاتورة', 'Edit sale'),
  ('sales.cancel', 'sales', 'إلغاء فاتورة', 'Cancel sale'),
  ('customers.view', 'customers', 'عرض العملاء', 'View customers'),
  ('customers.create', 'customers', 'إضافة عميل', 'Create customer'),
  ('customers.edit', 'customers', 'تعديل عميل', 'Edit customer'),
  ('suppliers.view', 'suppliers', 'عرض الموردين', 'View suppliers'),
  ('suppliers.manage', 'suppliers', 'إدارة الموردين', 'Manage suppliers'),
  ('delivery.view', 'delivery', 'عرض التوصيل', 'View delivery'),
  ('delivery.update', 'delivery', 'تحديث التوصيل', 'Update delivery'),
  ('delivery.all', 'delivery', 'كل طلبات التوصيل', 'All delivery orders'),
  ('returns.view', 'returns', 'عرض المرتجعات', 'View returns'),
  ('returns.create', 'returns', 'إنشاء مرتجع', 'Create return'),
  ('payments.view', 'payments', 'عرض المدفوعات', 'View payments'),
  ('payments.create', 'payments', 'تسجيل دفعة', 'Create payment'),
  ('expenses.view', 'expenses', 'عرض المصروفات', 'View expenses'),
  ('expenses.create', 'expenses', 'إضافة مصروف', 'Create expense'),
  ('reports.view', 'reports', 'عرض التقارير', 'View reports'),
  ('settings.view', 'settings', 'عرض الإعدادات', 'View settings'),
  ('settings.edit', 'settings', 'تعديل الإعدادات', 'Edit settings'),
  ('users.view', 'users', 'عرض المستخدمين', 'View users'),
  ('users.manage', 'users', 'إدارة المستخدمين', 'Manage users'),
  ('audit.view', 'audit', 'عرض سجل العمليات', 'View audit log'),
  ('whatsapp.send', 'whatsapp', 'إرسال واتساب', 'Send WhatsApp');

INSERT INTO role_permissions (role_id, permission_id) SELECT 1, id FROM permissions;

INSERT INTO role_permissions (role_id, permission_id)
SELECT 2, id FROM permissions WHERE code IN (
  'dashboard.view','products.view','sales.view','sales.create','sales.edit',
  'customers.view','customers.create','customers.edit','delivery.view','delivery.update',
  'returns.view','returns.create','payments.view','payments.create','whatsapp.send'
);

INSERT INTO role_permissions (role_id, permission_id)
SELECT 3, id FROM permissions WHERE code IN (
  'dashboard.view','products.view','products.create','products.edit','brands.manage',
  'categories.manage','models.manage','locations.manage','inventory.view','inventory.adjust',
  'purchases.view','purchases.create','purchases.approve','suppliers.view','suppliers.manage',
  'returns.view','customers.view'
);

INSERT INTO role_permissions (role_id, permission_id)
SELECT 4, id FROM permissions WHERE code IN (
  'dashboard.view','delivery.view','delivery.update','returns.create','customers.view','sales.view'
);

INSERT INTO role_permissions (role_id, permission_id)
SELECT 5, id FROM permissions WHERE code IN (
  'dashboard.view','sales.view','customers.view','payments.view','payments.create',
  'expenses.view','expenses.create','reports.view','purchases.view'
);

INSERT INTO users (id, username, password_hash, password_salt, full_name, phone, role_id, delivery_agent_id, active) VALUES
  (1, 'pixel@gmail.com', '503535236f695edcf3dd9046b127adc5d56f6c4f161a29e25859ddf7c059bd3d', 'pxadm1', 'مدير النظام', '01000000001', 1, NULL, 1),
  (2, 'sales', 'd0ceecb9ac72884bfb81cc12e1b243e5ee574bc1cfbd88c3781cef2066485e62', 'pxl1', 'سارة أحمد', '01000000002', 2, NULL, 1),
  (3, 'warehouse', 'd0ceecb9ac72884bfb81cc12e1b243e5ee574bc1cfbd88c3781cef2066485e62', 'pxl1', 'خالد منصور', '01000000003', 3, NULL, 1),
  (4, 'delivery', 'd0ceecb9ac72884bfb81cc12e1b243e5ee574bc1cfbd88c3781cef2066485e62', 'pxl1', 'محمد علي', '01098765432', 4, 1, 1),
  (5, 'accountant', 'd0ceecb9ac72884bfb81cc12e1b243e5ee574bc1cfbd88c3781cef2066485e62', 'pxl1', 'منى حسن', '01000000005', 5, NULL, 1);

INSERT INTO brands (id, name_ar, name_en, code) VALUES
  (1, 'أبل', 'Apple', 'APPLE'),
  (2, 'سامسونج', 'Samsung', 'SAMSUNG'),
  (3, 'شاومي', 'Xiaomi', 'XIAOMI'),
  (4, 'أوبو', 'Oppo', 'OPPO'),
  (5, 'هواوي', 'Huawei', 'HUAWEI'),
  (6, 'ريلمي', 'Realme', 'REALME'),
  (7, 'نوكيا', 'Nokia', 'NOKIA'),
  (8, 'فيفو', 'Vivo', 'VIVO');

INSERT INTO part_types (id, name_ar, name_en, code) VALUES
  (1, 'شاشات', 'Screens', 'SCR'),
  (2, 'بطاريات', 'Batteries', 'BAT'),
  (3, 'منافذ شحن', 'Charging Ports', 'CHG'),
  (4, 'فلكس', 'Flex Cables', 'FLX'),
  (5, 'كاميرات', 'Cameras', 'CAM'),
  (6, 'سماعات', 'Speakers', 'SPK'),
  (7, 'مايكروفونات', 'Microphones', 'MIC'),
  (8, 'آي سي', 'IC', 'IC'),
  (9, 'هيكل', 'Housing', 'HSG'),
  (10, 'ظهر زجاج', 'Back Glass', 'BKG'),
  (11, 'أزرار', 'Buttons', 'BTN'),
  (12, 'وصلات', 'Connectors', 'CON'),
  (13, 'إكسسوارات', 'Accessories', 'ACC'),
  (14, 'أخرى', 'Other', 'OTH');

INSERT INTO categories (id, name_ar, name_en) VALUES
  (1, 'شاشات', 'Screens'),
  (2, 'بطاريات', 'Batteries'),
  (3, 'منافذ شحن', 'Charging Ports'),
  (4, 'فلكس', 'Flex Cables'),
  (5, 'كاميرات', 'Cameras'),
  (6, 'سماعات', 'Speakers'),
  (7, 'مايكروفونات', 'Microphones'),
  (8, 'آي سي', 'IC'),
  (9, 'هيكل', 'Housing'),
  (10, 'ظهر زجاج', 'Back Glass'),
  (11, 'أزرار', 'Buttons'),
  (12, 'إكسسوارات', 'Accessories');

INSERT INTO device_models (id, brand_id, name, code, year) VALUES
  (1, 1, 'iPhone 12', 'IP12', 2020),
  (2, 1, 'iPhone 12 Pro', 'IP12P', 2020),
  (3, 1, 'iPhone 13', 'IP13', 2021),
  (4, 1, 'iPhone 13 Pro', 'IP13P', 2021),
  (5, 1, 'iPhone 14', 'IP14', 2022),
  (6, 1, 'iPhone 14 Pro', 'IP14P', 2022),
  (7, 1, 'iPhone 11', 'IP11', 2019),
  (8, 2, 'Samsung A54', 'A54', 2023),
  (9, 2, 'Samsung A34', 'A34', 2023),
  (10, 2, 'Samsung S23', 'S23', 2023),
  (11, 2, 'Samsung A24', 'A24', 2023),
  (12, 3, 'Redmi Note 12', 'RN12', 2023),
  (13, 3, 'Redmi Note 13', 'RN13', 2024),
  (14, 3, 'Xiaomi 13', 'MI13', 2023),
  (15, 4, 'Oppo Reno 8', 'RN8', 2022),
  (16, 4, 'Oppo A78', 'A78', 2023),
  (17, 5, 'Huawei Y9', 'Y9', 2019),
  (18, 6, 'Realme 10', 'RM10', 2022),
  (19, 7, 'Nokia G21', 'G21', 2022),
  (20, 8, 'Vivo Y22', 'Y22', 2022);

INSERT INTO storage_locations (id, name, warehouse, section, rack, shelf, drawer, box) VALUES
  (1, 'المخزن الرئيسي - رف A - درج 15', 'Main Warehouse', 'A', 'A', '4', '15', NULL),
  (2, 'المخزن الرئيسي - رف A - درج 16', 'Main Warehouse', 'A', 'A', '4', '16', NULL),
  (3, 'المخزن الرئيسي - رف B - رف 2', 'Main Warehouse', 'B', 'B', '2', NULL, NULL),
  (4, 'صندوق الإكسسوارات B-15', 'Main Warehouse', 'ACC', NULL, NULL, NULL, 'B-15'),
  (5, 'خزانة IC - درج 3', 'Main Warehouse', 'IC', 'C', '1', '3', NULL);

INSERT INTO suppliers (id, name, phone, address, notes, balance) VALUES
  (1, 'شركة الشاشات المتحدة', '01011112222', 'العباسية - القاهرة', 'مورد شاشات OLED/LCD', 0),
  (2, 'جملة البطاريات المصرية', '01033334444', 'المنطقة الصناعية - 6 أكتوبر', 'بطاريات أصلية وتقليد', 0),
  (3, 'Shenzhen Mobile Parts', '0020-15-5555', 'استيراد - بورسعيد', 'شحن أسبوعي', 0),
  (4, 'مورد الإكسسوارات - القاهرة', '01077778888', 'الموسكي - القاهرة', 'جرابات وكابلات', 0);

INSERT INTO customers (id, name, phone, whatsapp, address, area, notes, customer_type, payment_terms, credit_limit, current_balance) VALUES
  (1, 'أحمد محمد', '01012345678', '01012345678', 'شارع عباس العقاد - عمارة 12', 'مدينة نصر', 'عميل دائم', 'retail', 'cash', 0, 0),
  (2, 'محمود علي', '01023456789', '01023456789', 'شارع 9 - المعادي', 'المعادي', NULL, 'retail', 'cash', 0, 0),
  (3, 'فاطمة حسن', '01134567890', '01134567890', 'شارع الحجاز', 'مصر الجديدة', NULL, 'retail', 'cash', 0, 0),
  (4, 'كريم سعد', '01245678901', '01245678901', 'شارع الهرم بجوار مترو', 'الهرم', NULL, 'retail', 'credit', 5000, 1850),
  (5, 'ياسر عبدالله', '01056789012', '01056789012', 'الحي المتميز', '6 أكتوبر', NULL, 'retail', 'cash', 0, 0),
  (6, 'شركة تك موبايل', '01067890123', '01067890123', 'شارع شبرا', 'شبرا', 'عميل جملة', 'wholesale', 'credit', 20000, 4200),
  (7, 'ورشة الموبايل الذهبي', '01078901234', '01078901234', 'شارع الجلاء', 'الزقازيق', 'ورشة صيانة', 'wholesale', 'credit', 10000, 0),
  (8, 'إسلام فتحي', '01089012345', '01089012345', 'طنطا - شارع البحر', 'طنطا', NULL, 'retail', 'cash', 0, 0);

INSERT INTO delivery_agents (id, name, code, phone, status, notes) VALUES
  (1, 'محمد علي', '125', '01098765432', 'active', 'تيار منطقة شرق القاهرة'),
  (2, 'أحمد السيد', '126', '01087654321', 'active', 'المعادي والهرم'),
  (3, 'محمود فتحي', '127', '01076543210', 'active', '6 أكتوبر والجيزة');

INSERT INTO payment_methods (code, name_ar, name_en, active, sort_order) VALUES
  ('cash', 'كاش', 'Cash', 1, 1),
  ('visa', 'فيزا', 'Visa', 1, 2),
  ('mastercard', 'ماستركارد', 'Mastercard', 1, 3),
  ('vodafone_cash', 'فودافون كاش', 'Vodafone Cash', 1, 4),
  ('instapay', 'إنستاباي', 'InstaPay', 1, 5),
  ('bank_transfer', 'تحويل بنكي', 'Bank Transfer', 1, 6),
  ('credit', 'آجل', 'Credit', 1, 7),
  ('other', 'أخرى', 'Other', 1, 8);

INSERT INTO expense_categories (id, name_ar, name_en) VALUES
  (1, 'إيجار', 'Rent'),
  (2, 'كهرباء', 'Electricity'),
  (3, 'انتقالات', 'Transportation'),
  (4, 'توصيل', 'Delivery'),
  (5, 'مرتبات', 'Salaries'),
  (6, 'صيانة', 'Maintenance'),
  (7, 'أخرى', 'Other');

INSERT INTO products (id, sku, barcode, part_number, name_ar, name_en, brand_id, part_type_id, category_id, location_id, supplier_id, purchase_price, selling_price, wholesale_price, min_selling_price, current_stock, reserved_stock, min_stock, description, notes, active) VALUES
  (1, 'LCD-IP13', '6223000000011', 'PN-IP13-LCD', 'شاشة iPhone 13', 'LCD iPhone 13', 1, 1, 1, 1, 1, 1200, 1500, 1350, 1300, 18, 1, 4, 'شاشة LCD عالية الجودة', 'متوافقة مع 13 و 13 Pro', 1),
  (2, 'LCD-IP12', '6223000000028', 'PN-IP12-LCD', 'شاشة iPhone 12', 'LCD iPhone 12', 1, 1, 1, 1, 1, 950, 1250, 1100, 1050, 8, 0, 3, 'شاشة iPhone 12', NULL, 1),
  (3, 'LCD-IP14', '6223000000035', 'PN-IP14-LCD', 'شاشة iPhone 14', 'LCD iPhone 14', 1, 1, 1, 1, 1, 1600, 2100, 1850, 1750, 6, 0, 2, NULL, NULL, 1),
  (4, 'LCD-A54', '6223000000042', 'PN-A54-LCD', 'شاشة Samsung A54', 'LCD Samsung A54', 2, 1, 1, 2, 1, 700, 980, 850, 800, 12, 0, 4, NULL, NULL, 1),
  (5, 'BAT-IP13', '6223000000059', 'PN-IP13-BAT', 'بطارية iPhone 13', 'Battery iPhone 13', 1, 2, 2, 2, 2, 280, 450, 380, 350, 15, 0, 5, NULL, NULL, 1),
  (6, 'BAT-A54', '6223000000066', 'PN-A54-BAT', 'بطارية Samsung A54', 'Battery Samsung A54', 2, 2, 2, 2, 2, 180, 320, 260, 240, 20, 1, 6, NULL, NULL, 1),
  (7, 'BAT-RN12', '6223000000073', 'PN-RN12-BAT', 'بطارية Redmi Note 12', 'Battery Redmi Note 12', 3, 2, 2, 2, 2, 150, 280, 220, 200, 10, 0, 4, NULL, NULL, 1),
  (8, 'BAT-IP14', '6223000000080', 'PN-IP14-BAT', 'بطارية iPhone 14', 'Battery iPhone 14', 1, 2, 2, 2, 2, 320, 520, 440, 400, 7, 0, 3, NULL, NULL, 1),
  (9, 'CHG-RN12', '6223000000097', 'PN-RN12-CHG', 'منفذ شحن Redmi Note 12', 'Charging Port Redmi Note 12', 3, 3, 3, 3, 3, 45, 90, 70, 60, 25, 0, 8, NULL, NULL, 1),
  (10, 'CHG-IP13', '6223000000103', 'PN-IP13-CHG', 'منفذ شحن iPhone 13', 'Charging Port iPhone 13', 1, 3, 3, 3, 3, 80, 160, 130, 120, 9, 0, 3, NULL, NULL, 1),
  (11, 'FLX-Y9', '6223000000110', 'PN-Y9-FLX', 'فلكس Huawei Y9', 'Flex Cable Huawei Y9', 5, 4, 4, 3, 3, 35, 75, 55, 50, 14, 0, 5, NULL, NULL, 1),
  (12, 'FLX-A54', '6223000000127', 'PN-A54-FLX', 'فلكس Samsung A54', 'Flex Cable Samsung A54', 2, 4, 4, 3, 3, 40, 85, 65, 55, 11, 0, 4, NULL, NULL, 1),
  (13, 'CAM-IP14', '6223000000134', 'PN-IP14-CAM', 'كاميرا خلفية iPhone 14', 'Rear Camera iPhone 14', 1, 5, 5, 3, 3, 900, 1350, 1150, 1100, 4, 0, 2, NULL, NULL, 1),
  (14, 'CAM-A54', '6223000000141', 'PN-A54-CAM', 'كاميرا Samsung A54', 'Camera Samsung A54', 2, 5, 5, 3, 3, 220, 380, 310, 280, 8, 0, 3, NULL, NULL, 1),
  (15, 'SPK-RN8', '6223000000158', 'PN-RN8-SPK', 'سماعة Oppo Reno 8', 'Speaker Oppo Reno 8', 4, 6, 6, 3, 3, 55, 110, 85, 75, 13, 0, 4, NULL, NULL, 1),
  (16, 'SPK-IP13', '6223000000165', 'PN-IP13-SPK', 'سماعة iPhone 13', 'Speaker iPhone 13', 1, 6, 6, 3, 3, 70, 140, 110, 100, 6, 0, 2, NULL, NULL, 1),
  (17, 'MIC-RM10', '6223000000172', 'PN-RM10-MIC', 'مايك Realme 10', 'Microphone Realme 10', 6, 7, 7, 5, 3, 25, 60, 45, 40, 18, 0, 6, NULL, NULL, 1),
  (18, 'IC-A54', '6223000000189', 'PN-A54-IC', 'آي سي شحن Samsung A54', 'Charging IC Samsung A54', 2, 8, 8, 5, 3, 120, 220, 180, 160, 9, 0, 3, NULL, NULL, 1),
  (19, 'HSG-IP11', '6223000000196', 'PN-IP11-HSG', 'هيكل iPhone 11', 'Housing iPhone 11', 1, 9, 9, 3, 3, 350, 580, 480, 450, 5, 0, 2, NULL, NULL, 1),
  (20, 'BKG-S23', '6223000000202', 'PN-S23-BKG', 'ظهر زجاج Samsung S23', 'Back Glass Samsung S23', 2, 10, 10, 3, 3, 90, 180, 140, 130, 7, 0, 3, NULL, NULL, 1),
  (21, 'BKG-IP13', '6223000000219', 'PN-IP13-BKG', 'ظهر زجاج iPhone 13', 'Back Glass iPhone 13', 1, 10, 10, 3, 3, 110, 210, 170, 150, 4, 0, 2, NULL, NULL, 1),
  (22, 'BTN-IP13', '6223000000226', 'PN-IP13-BTN', 'أزرار جانبية iPhone 13', 'Side Buttons iPhone 13', 1, 11, 11, 5, 3, 30, 70, 50, 45, 16, 0, 5, NULL, NULL, 1),
  (23, 'CON-TC', '6223000000233', 'PN-USB-C', 'وصلة USB-C عامة', 'USB-C Connector', NULL, 12, 12, 5, 3, 15, 40, 28, 25, 30, 0, 10, 'وصلة عامة', NULL, 1),
  (24, 'CASE-IP13', '6223000000240', 'PN-CASE-IP13', 'جراب iPhone 13', 'Case iPhone 13', 1, 13, 12, 4, 4, 25, 75, 50, 45, 40, 2, 10, NULL, NULL, 1),
  (25, 'CASE-A54', '6223000000257', 'PN-CASE-A54', 'جراب Samsung A54', 'Case Samsung A54', 2, 13, 12, 4, 4, 20, 65, 45, 40, 28, 0, 8, NULL, NULL, 1),
  (26, 'GLS-IP13', '6223000000264', 'PN-GLS-IP13', 'استكر حماية iPhone 13', 'Screen Protector iPhone 13', 1, 13, 12, 4, 4, 8, 35, 22, 18, 50, 0, 15, NULL, NULL, 1),
  (27, 'CBL-LTN', '6223000000271', 'PN-CBL-LTN', 'كابل Lightning', 'Lightning Cable', 1, 13, 12, 4, 4, 18, 55, 40, 35, 22, 0, 8, NULL, NULL, 1),
  (28, 'PB-10K', '6223000000288', 'PN-PB-10K', 'باور بانك 10000', 'Power Bank 10000mAh', NULL, 13, 12, 4, 4, 140, 250, 200, 180, 9, 0, 3, NULL, NULL, 1),
  (29, 'LCD-G21', '6223000000295', 'PN-G21-LCD', 'شاشة Nokia G21', 'LCD Nokia G21', 7, 1, 1, 2, 1, 420, 650, 540, 500, 3, 0, 2, NULL, NULL, 1),
  (30, 'BAT-Y22', '6223000000301', 'PN-Y22-BAT', 'بطارية Vivo Y22', 'Battery Vivo Y22', 8, 2, 2, 2, 2, 160, 290, 230, 210, 2, 0, 4, NULL, 'مخزون منخفض', 1),
  (31, 'LCD-RN13', '6223000000318', 'PN-RN13-LCD', 'شاشة Redmi Note 13', 'LCD Redmi Note 13', 3, 1, 1, 1, 1, 550, 820, 700, 650, 0, 0, 3, NULL, 'نافد', 1),
  (32, 'HSG-A54', '6223000000325', 'PN-A54-HSG', 'هيكل Samsung A54', 'Housing Samsung A54', 2, 9, 9, 3, 3, 260, 420, 350, 320, 1, 0, 3, NULL, 'مخزون منخفض', 1);

INSERT INTO product_models (product_id, model_id) VALUES
  (1, 3), (1, 4),
  (2, 1), (2, 2),
  (3, 5), (3, 6),
  (4, 8),
  (5, 3),
  (6, 8),
  (7, 12),
  (8, 5),
  (9, 12),
  (10, 3),
  (11, 17),
  (12, 8),
  (13, 5),
  (14, 8),
  (15, 15),
  (16, 3),
  (17, 18),
  (18, 8),
  (19, 7),
  (20, 10),
  (21, 3),
  (22, 3),
  (24, 3), (24, 4),
  (25, 8),
  (26, 3),
  (29, 19),
  (30, 20),
  (31, 13),
  (32, 8);

INSERT INTO purchase_invoices (id, number, supplier_id, date, status, subtotal, discount, extra_expenses, total, notes, created_by, approved_at, approved_by) VALUES
  (1, 'PUR-1001', 1, '2026-06-12', 'approved', 5000, 0, 150, 5150, 'شحنة شاشات أولى', 3, '2026-06-12T10:00:00', 1),
  (2, 'PUR-1050', 1, '2026-07-08', 'approved', 12000, 200, 200, 12000, 'شحنة ثانية بسعر أعلى', 3, '2026-07-08T11:00:00', 1),
  (3, 'PUR-1100', 3, '2026-08-02', 'approved', 7000, 0, 300, 7300, 'استيراد أغسطس', 3, '2026-08-02T09:30:00', 1),
  (4, 'PUR-1120', 2, '2026-08-10', 'approved', 8900, 0, 80, 8980, 'بطاريات', 3, '2026-08-10T14:00:00', 1),
  (5, 'PUR-1140', 4, '2026-08-15', 'approved', 2460, 0, 40, 2500, 'إكسسوارات', 3, '2026-08-15T16:00:00', 1);

INSERT INTO purchase_invoice_items (id, purchase_id, product_id, quantity, unit_cost, discount, total) VALUES
  (1, 1, 1, 5, 1000, 0, 5000),
  (2, 2, 1, 10, 1200, 0, 12000),
  (3, 3, 1, 5, 1400, 0, 7000),
  (4, 4, 6, 22, 180, 0, 3960),
  (5, 4, 5, 16, 280, 0, 4480),
  (6, 5, 24, 44, 25, 0, 1100),
  (7, 5, 25, 28, 20, 0, 560),
  (8, 1, 2, 8, 950, 0, 7600),
  (9, 3, 4, 12, 700, 0, 8400),
  (10, 2, 3, 6, 1600, 0, 9600);

INSERT INTO inventory_batches (id, batch_code, product_id, purchase_id, purchase_item_id, supplier_id, purchase_date, original_qty, remaining_qty, reserved_qty, unit_cost) VALUES
  (1, 'B001', 1, 1, 1, 1, '2026-06-12', 5, 3, 1, 1000),
  (2, 'B002', 1, 2, 2, 1, '2026-07-08', 10, 10, 0, 1200),
  (3, 'B003', 1, 3, 3, 3, '2026-08-02', 5, 5, 0, 1400),
  (4, 'B004', 2, 1, 8, 1, '2026-06-12', 8, 8, 0, 950),
  (5, 'B005', 3, 2, 10, 1, '2026-07-08', 6, 6, 0, 1600),
  (6, 'B006', 4, 3, 9, 3, '2026-08-02', 12, 12, 0, 700),
  (7, 'B007', 6, 4, 4, 2, '2026-08-10', 22, 20, 1, 180),
  (8, 'B008', 5, 4, 5, 2, '2026-08-10', 16, 15, 0, 280),
  (9, 'B009', 24, 5, 6, 4, '2026-08-15', 44, 40, 2, 25),
  (10, 'B010', 25, 5, 7, 4, '2026-08-15', 28, 28, 0, 20),
  (11, 'B011', 7, NULL, NULL, 2, '2026-07-20', 10, 10, 0, 150),
  (12, 'B012', 8, NULL, NULL, 2, '2026-07-20', 7, 7, 0, 320),
  (13, 'B013', 9, NULL, NULL, 3, '2026-06-01', 25, 25, 0, 45),
  (14, 'B014', 10, NULL, NULL, 3, '2026-06-01', 9, 9, 0, 80),
  (15, 'B015', 11, NULL, NULL, 3, '2026-06-01', 14, 14, 0, 35),
  (16, 'B016', 12, NULL, NULL, 3, '2026-06-01', 11, 11, 0, 40),
  (17, 'B017', 13, NULL, NULL, 3, '2026-08-02', 4, 4, 0, 900),
  (18, 'B018', 14, NULL, NULL, 3, '2026-08-02', 8, 8, 0, 220),
  (19, 'B019', 15, NULL, NULL, 3, '2026-06-01', 13, 13, 0, 55),
  (20, 'B020', 16, NULL, NULL, 3, '2026-06-01', 6, 6, 0, 70),
  (21, 'B021', 17, NULL, NULL, 3, '2026-06-01', 18, 18, 0, 25),
  (22, 'B022', 18, NULL, NULL, 3, '2026-07-08', 9, 9, 0, 120),
  (23, 'B023', 19, NULL, NULL, 3, '2026-06-12', 5, 5, 0, 350),
  (24, 'B024', 20, NULL, NULL, 3, '2026-07-08', 7, 7, 0, 90),
  (25, 'B025', 21, NULL, NULL, 3, '2026-07-08', 4, 4, 0, 110),
  (26, 'B026', 22, NULL, NULL, 3, '2026-06-01', 16, 16, 0, 30),
  (27, 'B027', 23, NULL, NULL, 3, '2026-06-01', 30, 30, 0, 15),
  (28, 'B028', 26, NULL, NULL, 4, '2026-08-15', 50, 50, 0, 8),
  (29, 'B029', 27, NULL, NULL, 4, '2026-08-15', 22, 22, 0, 18),
  (30, 'B030', 28, NULL, NULL, 4, '2026-08-15', 9, 9, 0, 140),
  (31, 'B031', 29, NULL, NULL, 1, '2026-07-08', 3, 3, 0, 420),
  (32, 'B032', 30, NULL, NULL, 2, '2026-07-20', 2, 2, 0, 160),
  (33, 'B033', 32, NULL, NULL, 3, '2026-08-02', 1, 1, 0, 260);

INSERT INTO sales_invoices (id, number, date, type, status, delivery_status, customer_id, customer_name, customer_phone, customer_whatsapp, address, area, delivery_agent_id, delivery_agent_name, delivery_agent_code, delivery_agent_phone, expected_delivery_time, payment_method, subtotal, discount, total, paid, remaining, cost_total, profit, created_by, completed_at) VALUES
  (1, 'INV-1020', '2026-08-18', 'normal', 'completed', NULL, 2, 'محمود علي', '01023456789', '01023456789', NULL, 'المعادي', NULL, NULL, NULL, NULL, NULL, 'cash', 1500, 0, 1500, 1500, 0, 1000, 500, 2, '2026-08-18T11:20:00'),
  (2, 'INV-1021', '2026-08-19', 'normal', 'completed', NULL, 3, 'فاطمة حسن', '01134567890', '01134567890', NULL, 'مصر الجديدة', NULL, NULL, NULL, NULL, NULL, 'vodafone_cash', 450, 0, 450, 450, 0, 280, 170, 2, '2026-08-19T15:10:00'),
  (3, 'INV-1022', '2026-08-20', 'delivery', 'delivered', 'delivered', 5, 'ياسر عبدالله', '01056789012', '01056789012', 'الحي المتميز - 6 أكتوبر', '6 أكتوبر', 3, 'محمود فتحي', '127', '01076543210', '5:00 PM - 7:00 PM', 'cash', 980, 0, 980, 980, 0, 700, 280, 2, '2026-08-20T19:40:00'),
  (4, 'INV-1024', '2026-08-20', 'normal', 'completed', NULL, 4, 'كريم سعد', '01245678901', '01245678901', NULL, 'الهرم', NULL, NULL, NULL, NULL, NULL, 'credit', 1850, 0, 1850, 0, 1850, 1225, 625, 2, '2026-08-20T13:00:00'),
  (5, 'INV-1025', '2026-08-21', 'delivery', 'pending_delivery', 'pending_delivery', 1, 'أحمد محمد', '01012345678', '01012345678', 'مدينة نصر - القاهرة - شارع عباس العقاد', 'مدينة نصر', 1, 'محمد علي', '125', '01098765432', '6:00 PM - 8:00 PM', 'cash', 2450, 0, 2450, 0, 2450, 1230, 1220, 2, NULL),
  (6, 'INV-1026', '2026-08-21', 'delivery', 'out_for_delivery', 'out_for_delivery', 8, 'إسلام فتحي', '01089012345', '01089012345', 'طنطا - شارع البحر', 'طنطا', 1, 'محمد علي', '125', '01098765432', '4:00 PM - 6:00 PM', 'instapay', 980, 0, 980, 0, 980, 700, 280, 2, NULL),
  (7, 'INV-1015', '2026-08-05', 'delivery', 'fully_returned', 'fully_returned', 3, 'فاطمة حسن', '01134567890', '01134567890', 'مصر الجديدة - شارع الحجاز', 'مصر الجديدة', 2, 'أحمد السيد', '126', '01087654321', NULL, 'cash', 1250, 0, 0, 0, 0, 0, 0, 2, '2026-08-05T21:00:00'),
  (8, 'INV-1018', '2026-08-12', 'normal', 'completed', NULL, 6, 'شركة تك موبايل', '01067890123', '01067890123', 'شبرا', 'شبرا', NULL, NULL, NULL, NULL, NULL, 'credit', 4200, 0, 4200, 0, 4200, 3200, 1000, 2, '2026-08-12T12:00:00');

INSERT INTO sales_invoice_items (id, invoice_id, product_id, product_name, sku, quantity, delivered_qty, returned_qty, unit_price, discount, total, unit_cost, profit) VALUES
  (1, 1, 1, 'شاشة iPhone 13', 'LCD-IP13', 1, 1, 0, 1500, 0, 1500, 1000, 500),
  (2, 2, 5, 'بطارية iPhone 13', 'BAT-IP13', 1, 1, 0, 450, 0, 450, 280, 170),
  (3, 3, 4, 'شاشة Samsung A54', 'LCD-A54', 1, 1, 0, 980, 0, 980, 700, 280),
  (4, 4, 2, 'شاشة iPhone 12', 'LCD-IP12', 1, 1, 0, 1250, 0, 1250, 950, 300),
  (5, 4, 24, 'جراب iPhone 13', 'CASE-IP13', 2, 2, 0, 75, 0, 150, 25, 100),
  (6, 4, 26, 'استكر حماية iPhone 13', 'GLS-IP13', 2, 2, 0, 35, 0, 70, 8, 54),
  (7, 5, 1, 'شاشة iPhone 13', 'LCD-IP13', 1, 0, 0, 1500, 0, 1500, 1000, 500),
  (8, 5, 6, 'بطارية Samsung A54', 'BAT-A54', 1, 0, 0, 320, 0, 320, 180, 140),
  (9, 5, 24, 'جراب iPhone 13', 'CASE-IP13', 2, 0, 0, 75, 0, 150, 25, 100),
  (10, 6, 4, 'شاشة Samsung A54', 'LCD-A54', 1, 0, 0, 980, 0, 980, 700, 280),
  (11, 7, 2, 'شاشة iPhone 12', 'LCD-IP12', 1, 0, 1, 1250, 0, 0, 950, 0),
  (12, 8, 1, 'شاشة iPhone 13', 'LCD-IP13', 2, 2, 0, 1350, 0, 2700, 1000, 700),
  (13, 8, 3, 'شاشة iPhone 14', 'LCD-IP14', 1, 1, 0, 1850, 0, 1500, 1600, 250);

INSERT INTO sales_item_batches (invoice_item_id, batch_id, qty, unit_cost) VALUES
  (1, 1, 1, 1000),
  (2, 8, 1, 280),
  (3, 6, 1, 700),
  (4, 4, 1, 950),
  (5, 9, 2, 25),
  (7, 1, 1, 1000),
  (8, 7, 1, 180),
  (9, 9, 2, 25),
  (10, 6, 1, 700),
  (12, 1, 2, 1000);

INSERT INTO payments (invoice_id, customer_id, method, amount, date, created_by) VALUES
  (1, 2, 'cash', 1500, '2026-08-18', 2),
  (2, 3, 'vodafone_cash', 450, '2026-08-19', 2),
  (3, 5, 'cash', 980, '2026-08-20', 2);

INSERT INTO expenses (category_id, amount, date, description, user_id) VALUES
  (1, 8000, '2026-08-01', 'إيجار المحل - أغسطس', 5),
  (2, 950, '2026-08-08', 'فاتورة الكهرباء', 5),
  (4, 600, '2026-08-18', 'عمولة توصيل أسبوعية', 5),
  (5, 12000, '2026-08-01', 'مرتبات أغسطس', 1),
  (3, 250, '2026-08-21', 'انتقالات استلام بضاعة', 3);

INSERT INTO whatsapp_templates (code, name_ar, name_en, body_ar, body_en) VALUES
  ('invoice_created', 'إنشاء فاتورة', 'Invoice Created',
   'أهلاً بك يا {{customer_name}} 👋

تم تسجيل طلبك من {{store_name}}.

رقم الفاتورة:
{{invoice_number}}

المنتجات:
{{products}}

إجمالي الفاتورة:
{{total}} جنيه

نوع الطلب:
{{order_type}}
{{agent_block}}{{time_block}}{{address_block}}
شكرًا لتعاملك مع {{store_name}} ❤️',
   'Hello {{customer_name}} 👋

Your order has been registered at {{store_name}}.

Invoice:
{{invoice_number}}

Products:
{{products}}

Total:
{{total}} EGP

Order type:
{{order_type}}
{{agent_block}}{{time_block}}{{address_block}}
Thank you for choosing {{store_name}} ❤️'),
  ('out_for_delivery', 'خرج للتوصيل', 'Out for Delivery',
   'أهلاً {{customer_name}} 👋

طلبك رقم {{invoice_number}} خرج الآن مع التيار {{agent_name}} ({{agent_code}}).
{{time_block}}
{{address_block}}
للمتابعة: {{agent_phone}}

{{store_name}}',
   'Hello {{customer_name}} 👋

Order {{invoice_number}} is now out for delivery with {{agent_name}} ({{agent_code}}).
{{time_block}}
{{address_block}}
Contact: {{agent_phone}}

{{store_name}}'),
  ('delivered', 'تم التسليم', 'Delivered',
   'تم تسليم طلبك رقم {{invoice_number}} بنجاح ✅

شكرًا لتعاملك مع {{store_name}} ❤️',
   'Your order {{invoice_number}} was delivered successfully ✅

Thank you for choosing {{store_name}} ❤️'),
  ('partial_delivery', 'تسليم جزئي', 'Partial Delivery',
   'أهلاً {{customer_name}}

تم تسليم جزء من طلبك رقم {{invoice_number}}.

المنتجات:
{{products}}

الإجمالي النهائي:
{{total}} جنيه

{{store_name}}',
   'Hello {{customer_name}}

Part of order {{invoice_number}} was delivered.

Items:
{{products}}

Final total:
{{total}} EGP

{{store_name}}'),
  ('returned', 'مرتجع', 'Returned',
   'تم تحديث طلبك رقم {{invoice_number}}.

الحالة: مرتجع
{{products}}

{{store_name}}',
   'Your order {{invoice_number}} was updated.

Status: Returned
{{products}}

{{store_name}}');

INSERT INTO settings (key, value) VALUES
  ('store_name', 'المتميز'),
  ('store_name_ar', 'المتميز - قطع غيار الموبايلات'),
  ('store_address', 'شارع عباس العقاد - مدينة نصر - القاهرة'),
  ('store_phone', '01000001111'),
  ('currency', 'EGP'),
  ('language', 'ar'),
  ('invoice_prefix', 'INV'),
  ('invoice_footer', 'شكراً لتعاملكم مع المتميز - ضمان القطع حسب سياسة المحل'),
  ('tax_enabled', '0'),
  ('whatsapp_enabled', '1'),
  ('default_delivery_time', '6:00 PM - 8:00 PM'),
  ('logo_url', '');

INSERT INTO sequences (name, prefix, next_number) VALUES
  ('sales', 'INV', 1027),
  ('purchase', 'PUR', 1141),
  ('return', 'RET', 1003),
  ('batch', 'B', 34);

INSERT INTO notifications (user_id, type, title_ar, title_en, body_ar, body_en, entity_type, entity_id) VALUES
  (NULL, 'new_delivery', 'طلب توصيل جديد', 'New delivery order', 'فاتورة INV-1025 بانتظار التوصيل مع محمد علي', 'Invoice INV-1025 pending delivery with Mohamed Ali', 'invoice', 5),
  (NULL, 'low_stock', 'مخزون منخفض', 'Low stock', 'بطارية Vivo Y22 وصلت للحد الأدنى', 'Vivo Y22 battery is at minimum stock', 'product', 30),
  (NULL, 'out_of_stock', 'صنف نافد', 'Out of stock', 'شاشة Redmi Note 13 نافدة من المخزن', 'Redmi Note 13 LCD is out of stock', 'product', 31),
  (NULL, 'credit_due', 'فاتورة آجلة', 'Credit invoice', 'كريم سعد - متبقي 1,850 جنيه على INV-1024', 'Karim Saad still owes 1,850 EGP on INV-1024', 'invoice', 4);

INSERT INTO audit_logs (user_id, user_name, action, entity_type, entity_id, details, created_at) VALUES
  (3, 'خالد منصور', 'purchase', 'purchase', 3, 'اعتماد فاتورة شراء PUR-1100', '2026-08-02T09:30:00'),
  (2, 'سارة أحمد', 'create_invoice', 'invoice', 5, 'إنشاء فاتورة توصيل INV-1025', '2026-08-21T10:15:00'),
  (2, 'سارة أحمد', 'create_invoice', 'invoice', 1, 'بيع نقدي INV-1020', '2026-08-18T11:20:00');

INSERT INTO stock_movements (product_id, batch_id, type, qty, unit_cost, reference_type, reference_id, notes, created_by, created_at) VALUES
  (1, 1, 'in', 5, 1000, 'purchase', 1, 'استلام PUR-1001', 3, '2026-06-12T10:00:00'),
  (1, 2, 'in', 10, 1200, 'purchase', 2, 'استلام PUR-1050', 3, '2026-07-08T11:00:00'),
  (1, 3, 'in', 5, 1400, 'purchase', 3, 'استلام PUR-1100', 3, '2026-08-02T09:30:00'),
  (1, 1, 'out', 1, 1000, 'sale', 1, 'صرف INV-1020', 2, '2026-08-18T11:20:00'),
  (1, 1, 'reserve', 1, 1000, 'sale', 5, 'حجز INV-1025', 2, '2026-08-21T10:15:00');
