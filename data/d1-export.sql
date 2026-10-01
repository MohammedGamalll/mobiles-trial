PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE IF NOT EXISTS "d1_migrations"(
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT UNIQUE,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(1,'0001_init.sql','2026-08-20 22:28:36');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(2,'0002_seed.sql','2026-08-20 22:28:36');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(3,'0003_delivery_hr.sql','2026-09-15 17:39:55');
CREATE TABLE roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  is_system INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO "roles" ("id","slug","name_ar","name_en","is_system","created_at") VALUES(1,'admin','مدير النظام','Admin',1,'2026-08-20 22:28:36');
INSERT INTO "roles" ("id","slug","name_ar","name_en","is_system","created_at") VALUES(2,'sales','مبيعات','Sales',1,'2026-08-20 22:28:36');
INSERT INTO "roles" ("id","slug","name_ar","name_en","is_system","created_at") VALUES(3,'warehouse','مخزن','Warehouse',1,'2026-08-20 22:28:36');
INSERT INTO "roles" ("id","slug","name_ar","name_en","is_system","created_at") VALUES(4,'delivery','توصيل','Delivery',1,'2026-08-20 22:28:36');
INSERT INTO "roles" ("id","slug","name_ar","name_en","is_system","created_at") VALUES(5,'accountant','محاسب','Accountant',1,'2026-08-20 22:28:36');
CREATE TABLE permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  module TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL
);
INSERT INTO "permissions" ("id","code","module","name_ar","name_en") VALUES(1,'dashboard.view','dashboard','عرض لوحة التحكم','View dashboard');
INSERT INTO "permissions" ("id","code","module","name_ar","name_en") VALUES(2,'products.view','products','عرض المنتجات','View products');
INSERT INTO "permissions" ("id","code","module","name_ar","name_en") VALUES(3,'products.create','products','إضافة منتج','Create product');
INSERT INTO "permissions" ("id","code","module","name_ar","name_en") VALUES(4,'products.edit','products','تعديل منتج','Edit product');
INSERT INTO "permissions" ("id","code","module","name_ar","name_en") VALUES(5,'products.delete','products','حذف منتج','Delete product');
INSERT INTO "permissions" ("id","code","module","name_ar","name_en") VALUES(6,'brands.manage','catalog','إدارة العلامات','Manage brands');
INSERT INTO "permissions" ("id","code","module","name_ar","name_en") VALUES(7,'categories.manage','catalog','إدارة التصنيفات','Manage categories');
INSERT INTO "permissions" ("id","code","module","name_ar","name_en") VALUES(8,'models.manage','catalog','إدارة الموديلات','Manage models');
INSERT INTO "permissions" ("id","code","module","name_ar","name_en") VALUES(9,'locations.manage','catalog','إدارة أماكن التخزين','Manage locations');
INSERT INTO "permissions" ("id","code","module","name_ar","name_en") VALUES(10,'inventory.view','inventory','عرض المخزون','View inventory');
INSERT INTO "permissions" ("id","code","module","name_ar","name_en") VALUES(11,'inventory.adjust','inventory','تسوية المخزون','Adjust inventory');
INSERT INTO "permissions" ("id","code","module","name_ar","name_en") VALUES(12,'purchases.view','purchases','عرض المشتريات','View purchases');
INSERT INTO "permissions" ("id","code","module","name_ar","name_en") VALUES(13,'purchases.create','purchases','إنشاء فاتورة شراء','Create purchase');
INSERT INTO "permissions" ("id","code","module","name_ar","name_en") VALUES(14,'purchases.approve','purchases','اعتماد فاتورة شراء','Approve purchase');
INSERT INTO "permissions" ("id","code","module","name_ar","name_en") VALUES(15,'sales.view','sales','عرض المبيعات','View sales');
INSERT INTO "permissions" ("id","code","module","name_ar","name_en") VALUES(16,'sales.create','sales','إنشاء فاتورة بيع','Create sale');
INSERT INTO "permissions" ("id","code","module","name_ar","name_en") VALUES(17,'sales.edit','sales','تعديل فاتورة','Edit sale');
INSERT INTO "permissions" ("id","code","module","name_ar","name_en") VALUES(18,'sales.cancel','sales','إلغاء فاتورة','Cancel sale');
INSERT INTO "permissions" ("id","code","module","name_ar","name_en") VALUES(19,'customers.view','customers','عرض العملاء','View customers');
INSERT INTO "permissions" ("id","code","module","name_ar","name_en") VALUES(20,'customers.create','customers','إضافة عميل','Create customer');
INSERT INTO "permissions" ("id","code","module","name_ar","name_en") VALUES(21,'customers.edit','customers','تعديل عميل','Edit customer');
INSERT INTO "permissions" ("id","code","module","name_ar","name_en") VALUES(22,'suppliers.view','suppliers','عرض الموردين','View suppliers');
INSERT INTO "permissions" ("id","code","module","name_ar","name_en") VALUES(23,'suppliers.manage','suppliers','إدارة الموردين','Manage suppliers');
INSERT INTO "permissions" ("id","code","module","name_ar","name_en") VALUES(24,'delivery.view','delivery','عرض التوصيل','View delivery');
INSERT INTO "permissions" ("id","code","module","name_ar","name_en") VALUES(25,'delivery.update','delivery','تحديث التوصيل','Update delivery');
INSERT INTO "permissions" ("id","code","module","name_ar","name_en") VALUES(26,'delivery.all','delivery','كل طلبات التوصيل','All delivery orders');
INSERT INTO "permissions" ("id","code","module","name_ar","name_en") VALUES(27,'returns.view','returns','عرض المرتجعات','View returns');
INSERT INTO "permissions" ("id","code","module","name_ar","name_en") VALUES(28,'returns.create','returns','إنشاء مرتجع','Create return');
INSERT INTO "permissions" ("id","code","module","name_ar","name_en") VALUES(29,'payments.view','payments','عرض المدفوعات','View payments');
INSERT INTO "permissions" ("id","code","module","name_ar","name_en") VALUES(30,'payments.create','payments','تسجيل دفعة','Create payment');
INSERT INTO "permissions" ("id","code","module","name_ar","name_en") VALUES(31,'expenses.view','expenses','عرض المصروفات','View expenses');
INSERT INTO "permissions" ("id","code","module","name_ar","name_en") VALUES(32,'expenses.create','expenses','إضافة مصروف','Create expense');
INSERT INTO "permissions" ("id","code","module","name_ar","name_en") VALUES(33,'reports.view','reports','عرض التقارير','View reports');
INSERT INTO "permissions" ("id","code","module","name_ar","name_en") VALUES(34,'settings.view','settings','عرض الإعدادات','View settings');
INSERT INTO "permissions" ("id","code","module","name_ar","name_en") VALUES(35,'settings.edit','settings','تعديل الإعدادات','Edit settings');
INSERT INTO "permissions" ("id","code","module","name_ar","name_en") VALUES(36,'users.view','users','عرض المستخدمين','View users');
INSERT INTO "permissions" ("id","code","module","name_ar","name_en") VALUES(37,'users.manage','users','إدارة المستخدمين','Manage users');
INSERT INTO "permissions" ("id","code","module","name_ar","name_en") VALUES(38,'audit.view','audit','عرض سجل العمليات','View audit log');
INSERT INTO "permissions" ("id","code","module","name_ar","name_en") VALUES(39,'whatsapp.send','whatsapp','إرسال واتساب','Send WhatsApp');
INSERT INTO "permissions" ("id","code","module","name_ar","name_en") VALUES(40,'hr.view','hr','عرض الموارد البشرية','View HR');
INSERT INTO "permissions" ("id","code","module","name_ar","name_en") VALUES(41,'hr.manage','hr','إدارة الموظفين','Manage employees');
INSERT INTO "permissions" ("id","code","module","name_ar","name_en") VALUES(42,'hr.payroll','hr','إدارة الرواتب','Manage payroll');
INSERT INTO "permissions" ("id","code","module","name_ar","name_en") VALUES(43,'attendance.own','hr','تسجيل الحضور','Own attendance');
CREATE TABLE role_permissions (
  role_id INTEGER NOT NULL,
  permission_id INTEGER NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  FOREIGN KEY (role_id) REFERENCES roles(id),
  FOREIGN KEY (permission_id) REFERENCES permissions(id)
);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(1,38);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(1,6);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(1,7);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(1,20);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(1,21);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(1,19);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(1,1);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(1,26);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(1,25);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(1,24);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(1,32);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(1,31);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(1,11);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(1,10);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(1,9);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(1,8);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(1,30);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(1,29);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(1,3);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(1,5);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(1,4);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(1,2);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(1,14);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(1,13);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(1,12);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(1,33);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(1,28);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(1,27);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(1,18);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(1,16);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(1,17);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(1,15);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(1,35);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(1,34);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(1,23);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(1,22);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(1,37);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(1,36);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(1,39);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(2,20);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(2,21);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(2,19);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(2,1);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(2,25);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(2,24);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(2,30);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(2,29);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(2,2);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(2,28);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(2,27);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(2,16);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(2,17);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(2,15);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(2,39);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(3,6);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(3,7);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(3,19);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(3,1);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(3,11);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(3,10);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(3,9);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(3,8);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(3,3);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(3,4);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(3,2);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(3,14);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(3,13);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(3,12);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(3,27);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(3,23);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(3,22);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(4,19);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(4,1);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(4,25);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(4,24);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(4,28);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(4,15);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(5,19);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(5,1);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(5,32);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(5,31);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(5,30);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(5,29);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(5,12);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(5,33);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(5,15);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(1,43);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(1,41);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(1,42);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(1,40);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(2,43);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(3,43);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(4,43);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(5,43);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(5,42);
INSERT INTO "role_permissions" ("role_id","permission_id") VALUES(5,40);
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  role_id INTEGER NOT NULL,
  delivery_agent_id INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (role_id) REFERENCES roles(id)
);
INSERT INTO "users" ("id","username","password_hash","password_salt","full_name","phone","role_id","delivery_agent_id","active","last_login_at","created_at","updated_at","deleted_at") VALUES(1,'admin','d0ceecb9ac72884bfb81cc12e1b243e5ee574bc1cfbd88c3781cef2066485e62','pxl1','مدير النظام','01000000001',1,NULL,1,'2026-09-22 18:58:29','2026-08-20 22:28:36','2026-08-20 22:28:36',NULL);
INSERT INTO "users" ("id","username","password_hash","password_salt","full_name","phone","role_id","delivery_agent_id","active","last_login_at","created_at","updated_at","deleted_at") VALUES(2,'sales','d0ceecb9ac72884bfb81cc12e1b243e5ee574bc1cfbd88c3781cef2066485e62','pxl1','سارة أحمد','01000000002',2,NULL,1,NULL,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL);
INSERT INTO "users" ("id","username","password_hash","password_salt","full_name","phone","role_id","delivery_agent_id","active","last_login_at","created_at","updated_at","deleted_at") VALUES(3,'warehouse','d0ceecb9ac72884bfb81cc12e1b243e5ee574bc1cfbd88c3781cef2066485e62','pxl1','خالد منصور','01000000003',3,NULL,1,NULL,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL);
INSERT INTO "users" ("id","username","password_hash","password_salt","full_name","phone","role_id","delivery_agent_id","active","last_login_at","created_at","updated_at","deleted_at") VALUES(4,'delivery','d0ceecb9ac72884bfb81cc12e1b243e5ee574bc1cfbd88c3781cef2066485e62','pxl1','محمد علي','01098765432',4,1,1,NULL,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL);
INSERT INTO "users" ("id","username","password_hash","password_salt","full_name","phone","role_id","delivery_agent_id","active","last_login_at","created_at","updated_at","deleted_at") VALUES(5,'accountant','d0ceecb9ac72884bfb81cc12e1b243e5ee574bc1cfbd88c3781cef2066485e62','pxl1','منى حسن','01000000005',5,NULL,1,NULL,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL);
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
INSERT INTO "sessions" ("id","user_id","token","expires_at","created_at") VALUES(1,1,'9d870f5b917557b9eb8cca8c4bccb80f1b7755521dba8e38551d3d0941890775','2026-08-27T22:29:24.747Z','2026-08-20 22:29:24');
INSERT INTO "sessions" ("id","user_id","token","expires_at","created_at") VALUES(2,1,'3c243f1d32d23b217364499acd399aaf25fea3b6a2c81aed8a712587544e6bb6','2026-08-27T22:30:00.380Z','2026-08-20 22:30:00');
INSERT INTO "sessions" ("id","user_id","token","expires_at","created_at") VALUES(3,1,'3373523113e6fc1f62d80c7e2e85cc9ef8236807e959e58702a9e74c03949157','2026-08-27T23:20:12.652Z','2026-08-20 23:20:12');
INSERT INTO "sessions" ("id","user_id","token","expires_at","created_at") VALUES(4,1,'5b3274f9cf628471f9721a9da400bcd3c350a7646cfef62e64b8063aafecccff','2026-08-31T23:48:52.888Z','2026-08-24 23:48:52');
INSERT INTO "sessions" ("id","user_id","token","expires_at","created_at") VALUES(5,1,'e254b6844141c97b65a7865d511a597eaa9cf1d124a7376c91b70f1a79d3e32d','2026-09-22T08:16:47.675Z','2026-09-15 08:16:47');
INSERT INTO "sessions" ("id","user_id","token","expires_at","created_at") VALUES(6,1,'921bc7c236160d34e980a0133952ef139b483ad07ef3c3af8bed72cdfbdf92dd','2026-09-22T08:17:19.489Z','2026-09-15 08:17:19');
INSERT INTO "sessions" ("id","user_id","token","expires_at","created_at") VALUES(7,1,'d142a0713203cdb0e880f76e135c2bbebbdaa3abaa5c087643c35a9ea3482aba','2026-09-22T08:24:14.059Z','2026-09-15 08:24:14');
INSERT INTO "sessions" ("id","user_id","token","expires_at","created_at") VALUES(8,1,'7b16839b195ece9c699f906ce953b3fa3d750b1c8e47311b8f639b7a02b5a6f5','2026-09-22T09:56:33.166Z','2026-09-15 09:56:33');
INSERT INTO "sessions" ("id","user_id","token","expires_at","created_at") VALUES(9,1,'a9c6ada234f08f34e398bca9c92c56b3a6260966e92751354d4b84041c7555da','2026-09-22T17:41:22.126Z','2026-09-15 17:41:22');
INSERT INTO "sessions" ("id","user_id","token","expires_at","created_at") VALUES(10,1,'a596528e3ab2c63b3792e53e83e288c3c55198d4101187476fbab170e161595b','2026-09-29T18:58:29.285Z','2026-09-22 18:58:29');
CREATE TABLE brands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  code TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
INSERT INTO "brands" ("id","name_ar","name_en","code","active","created_at","deleted_at") VALUES(1,'أبل','Apple','APPLE',1,'2026-08-20 22:28:36',NULL);
INSERT INTO "brands" ("id","name_ar","name_en","code","active","created_at","deleted_at") VALUES(2,'سامسونج','Samsung','SAMSUNG',1,'2026-08-20 22:28:36',NULL);
INSERT INTO "brands" ("id","name_ar","name_en","code","active","created_at","deleted_at") VALUES(3,'شاومي','Xiaomi','XIAOMI',1,'2026-08-20 22:28:36',NULL);
INSERT INTO "brands" ("id","name_ar","name_en","code","active","created_at","deleted_at") VALUES(4,'أوبو','Oppo','OPPO',1,'2026-08-20 22:28:36',NULL);
INSERT INTO "brands" ("id","name_ar","name_en","code","active","created_at","deleted_at") VALUES(5,'هواوي','Huawei','HUAWEI',1,'2026-08-20 22:28:36',NULL);
INSERT INTO "brands" ("id","name_ar","name_en","code","active","created_at","deleted_at") VALUES(6,'ريلمي','Realme','REALME',1,'2026-08-20 22:28:36',NULL);
INSERT INTO "brands" ("id","name_ar","name_en","code","active","created_at","deleted_at") VALUES(7,'نوكيا','Nokia','NOKIA',1,'2026-08-20 22:28:36',NULL);
INSERT INTO "brands" ("id","name_ar","name_en","code","active","created_at","deleted_at") VALUES(8,'فيفو','Vivo','VIVO',1,'2026-08-20 22:28:36',NULL);
CREATE TABLE part_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  code TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
INSERT INTO "part_types" ("id","name_ar","name_en","code","active","created_at","deleted_at") VALUES(1,'شاشات','Screens','SCR',1,'2026-08-20 22:28:36',NULL);
INSERT INTO "part_types" ("id","name_ar","name_en","code","active","created_at","deleted_at") VALUES(2,'بطاريات','Batteries','BAT',1,'2026-08-20 22:28:36',NULL);
INSERT INTO "part_types" ("id","name_ar","name_en","code","active","created_at","deleted_at") VALUES(3,'منافذ شحن','Charging Ports','CHG',1,'2026-08-20 22:28:36',NULL);
INSERT INTO "part_types" ("id","name_ar","name_en","code","active","created_at","deleted_at") VALUES(4,'فلكس','Flex Cables','FLX',1,'2026-08-20 22:28:36',NULL);
INSERT INTO "part_types" ("id","name_ar","name_en","code","active","created_at","deleted_at") VALUES(5,'كاميرات','Cameras','CAM',1,'2026-08-20 22:28:36',NULL);
INSERT INTO "part_types" ("id","name_ar","name_en","code","active","created_at","deleted_at") VALUES(6,'سماعات','Speakers','SPK',1,'2026-08-20 22:28:36',NULL);
INSERT INTO "part_types" ("id","name_ar","name_en","code","active","created_at","deleted_at") VALUES(7,'مايكروفونات','Microphones','MIC',1,'2026-08-20 22:28:36',NULL);
INSERT INTO "part_types" ("id","name_ar","name_en","code","active","created_at","deleted_at") VALUES(8,'آي سي','IC','IC',1,'2026-08-20 22:28:36',NULL);
INSERT INTO "part_types" ("id","name_ar","name_en","code","active","created_at","deleted_at") VALUES(9,'هيكل','Housing','HSG',1,'2026-08-20 22:28:36',NULL);
INSERT INTO "part_types" ("id","name_ar","name_en","code","active","created_at","deleted_at") VALUES(10,'ظهر زجاج','Back Glass','BKG',1,'2026-08-20 22:28:36',NULL);
INSERT INTO "part_types" ("id","name_ar","name_en","code","active","created_at","deleted_at") VALUES(11,'أزرار','Buttons','BTN',1,'2026-08-20 22:28:36',NULL);
INSERT INTO "part_types" ("id","name_ar","name_en","code","active","created_at","deleted_at") VALUES(12,'وصلات','Connectors','CON',1,'2026-08-20 22:28:36',NULL);
INSERT INTO "part_types" ("id","name_ar","name_en","code","active","created_at","deleted_at") VALUES(13,'إكسسوارات','Accessories','ACC',1,'2026-08-20 22:28:36',NULL);
INSERT INTO "part_types" ("id","name_ar","name_en","code","active","created_at","deleted_at") VALUES(14,'أخرى','Other','OTH',1,'2026-08-20 22:28:36',NULL);
INSERT INTO "part_types" ("id","name_ar","name_en","code","active","created_at","deleted_at") VALUES(15,'خدمات','Services','SRV',1,'2026-09-15 17:39:55',NULL);
CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  parent_id INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
INSERT INTO "categories" ("id","name_ar","name_en","parent_id","active","created_at","deleted_at") VALUES(1,'شاشات','Screens',NULL,1,'2026-08-20 22:28:36',NULL);
INSERT INTO "categories" ("id","name_ar","name_en","parent_id","active","created_at","deleted_at") VALUES(2,'بطاريات','Batteries',NULL,1,'2026-08-20 22:28:36',NULL);
INSERT INTO "categories" ("id","name_ar","name_en","parent_id","active","created_at","deleted_at") VALUES(3,'منافذ شحن','Charging Ports',NULL,1,'2026-08-20 22:28:36',NULL);
INSERT INTO "categories" ("id","name_ar","name_en","parent_id","active","created_at","deleted_at") VALUES(4,'فلكس','Flex Cables',NULL,1,'2026-08-20 22:28:36',NULL);
INSERT INTO "categories" ("id","name_ar","name_en","parent_id","active","created_at","deleted_at") VALUES(5,'كاميرات','Cameras',NULL,1,'2026-08-20 22:28:36',NULL);
INSERT INTO "categories" ("id","name_ar","name_en","parent_id","active","created_at","deleted_at") VALUES(6,'سماعات','Speakers',NULL,1,'2026-08-20 22:28:36',NULL);
INSERT INTO "categories" ("id","name_ar","name_en","parent_id","active","created_at","deleted_at") VALUES(7,'مايكروفونات','Microphones',NULL,1,'2026-08-20 22:28:36',NULL);
INSERT INTO "categories" ("id","name_ar","name_en","parent_id","active","created_at","deleted_at") VALUES(8,'آي سي','IC',NULL,1,'2026-08-20 22:28:36',NULL);
INSERT INTO "categories" ("id","name_ar","name_en","parent_id","active","created_at","deleted_at") VALUES(9,'هيكل','Housing',NULL,1,'2026-08-20 22:28:36',NULL);
INSERT INTO "categories" ("id","name_ar","name_en","parent_id","active","created_at","deleted_at") VALUES(10,'ظهر زجاج','Back Glass',NULL,1,'2026-08-20 22:28:36',NULL);
INSERT INTO "categories" ("id","name_ar","name_en","parent_id","active","created_at","deleted_at") VALUES(11,'أزرار','Buttons',NULL,1,'2026-08-20 22:28:36',NULL);
INSERT INTO "categories" ("id","name_ar","name_en","parent_id","active","created_at","deleted_at") VALUES(12,'إكسسوارات','Accessories',NULL,1,'2026-08-20 22:28:36',NULL);
INSERT INTO "categories" ("id","name_ar","name_en","parent_id","active","created_at","deleted_at") VALUES(13,'خدمات','Services',NULL,1,'2026-09-15 17:39:55',NULL);
CREATE TABLE device_models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  code TEXT,
  year INTEGER,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (brand_id) REFERENCES brands(id)
);
INSERT INTO "device_models" ("id","brand_id","name","code","year","notes","active","created_at","deleted_at") VALUES(1,1,'iPhone 12','IP12',2020,NULL,1,'2026-08-20 22:28:36',NULL);
INSERT INTO "device_models" ("id","brand_id","name","code","year","notes","active","created_at","deleted_at") VALUES(2,1,'iPhone 12 Pro','IP12P',2020,NULL,1,'2026-08-20 22:28:36',NULL);
INSERT INTO "device_models" ("id","brand_id","name","code","year","notes","active","created_at","deleted_at") VALUES(3,1,'iPhone 13','IP13',2021,NULL,1,'2026-08-20 22:28:36',NULL);
INSERT INTO "device_models" ("id","brand_id","name","code","year","notes","active","created_at","deleted_at") VALUES(4,1,'iPhone 13 Pro','IP13P',2021,NULL,1,'2026-08-20 22:28:36',NULL);
INSERT INTO "device_models" ("id","brand_id","name","code","year","notes","active","created_at","deleted_at") VALUES(5,1,'iPhone 14','IP14',2022,NULL,1,'2026-08-20 22:28:36',NULL);
INSERT INTO "device_models" ("id","brand_id","name","code","year","notes","active","created_at","deleted_at") VALUES(6,1,'iPhone 14 Pro','IP14P',2022,NULL,1,'2026-08-20 22:28:36',NULL);
INSERT INTO "device_models" ("id","brand_id","name","code","year","notes","active","created_at","deleted_at") VALUES(7,1,'iPhone 11','IP11',2019,NULL,1,'2026-08-20 22:28:36',NULL);
INSERT INTO "device_models" ("id","brand_id","name","code","year","notes","active","created_at","deleted_at") VALUES(8,2,'Samsung A54','A54',2023,NULL,1,'2026-08-20 22:28:36',NULL);
INSERT INTO "device_models" ("id","brand_id","name","code","year","notes","active","created_at","deleted_at") VALUES(9,2,'Samsung A34','A34',2023,NULL,1,'2026-08-20 22:28:36',NULL);
INSERT INTO "device_models" ("id","brand_id","name","code","year","notes","active","created_at","deleted_at") VALUES(10,2,'Samsung S23','S23',2023,NULL,1,'2026-08-20 22:28:36',NULL);
INSERT INTO "device_models" ("id","brand_id","name","code","year","notes","active","created_at","deleted_at") VALUES(11,2,'Samsung A24','A24',2023,NULL,1,'2026-08-20 22:28:36',NULL);
INSERT INTO "device_models" ("id","brand_id","name","code","year","notes","active","created_at","deleted_at") VALUES(12,3,'Redmi Note 12','RN12',2023,NULL,1,'2026-08-20 22:28:36',NULL);
INSERT INTO "device_models" ("id","brand_id","name","code","year","notes","active","created_at","deleted_at") VALUES(13,3,'Redmi Note 13','RN13',2024,NULL,1,'2026-08-20 22:28:36',NULL);
INSERT INTO "device_models" ("id","brand_id","name","code","year","notes","active","created_at","deleted_at") VALUES(14,3,'Xiaomi 13','MI13',2023,NULL,1,'2026-08-20 22:28:36',NULL);
INSERT INTO "device_models" ("id","brand_id","name","code","year","notes","active","created_at","deleted_at") VALUES(15,4,'Oppo Reno 8','RN8',2022,NULL,1,'2026-08-20 22:28:36',NULL);
INSERT INTO "device_models" ("id","brand_id","name","code","year","notes","active","created_at","deleted_at") VALUES(16,4,'Oppo A78','A78',2023,NULL,1,'2026-08-20 22:28:36',NULL);
INSERT INTO "device_models" ("id","brand_id","name","code","year","notes","active","created_at","deleted_at") VALUES(17,5,'Huawei Y9','Y9',2019,NULL,1,'2026-08-20 22:28:36',NULL);
INSERT INTO "device_models" ("id","brand_id","name","code","year","notes","active","created_at","deleted_at") VALUES(18,6,'Realme 10','RM10',2022,NULL,1,'2026-08-20 22:28:36',NULL);
INSERT INTO "device_models" ("id","brand_id","name","code","year","notes","active","created_at","deleted_at") VALUES(19,7,'Nokia G21','G21',2022,NULL,1,'2026-08-20 22:28:36',NULL);
INSERT INTO "device_models" ("id","brand_id","name","code","year","notes","active","created_at","deleted_at") VALUES(20,8,'Vivo Y22','Y22',2022,NULL,1,'2026-08-20 22:28:36',NULL);
CREATE TABLE storage_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  warehouse TEXT,
  section TEXT,
  rack TEXT,
  shelf TEXT,
  drawer TEXT,
  box TEXT,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
INSERT INTO "storage_locations" ("id","name","warehouse","section","rack","shelf","drawer","box","notes","active","created_at","deleted_at") VALUES(1,'المخزن الرئيسي - رف A - درج 15','Main Warehouse','A','A','4','15',NULL,NULL,1,'2026-08-20 22:28:36',NULL);
INSERT INTO "storage_locations" ("id","name","warehouse","section","rack","shelf","drawer","box","notes","active","created_at","deleted_at") VALUES(2,'المخزن الرئيسي - رف A - درج 16','Main Warehouse','A','A','4','16',NULL,NULL,1,'2026-08-20 22:28:36',NULL);
INSERT INTO "storage_locations" ("id","name","warehouse","section","rack","shelf","drawer","box","notes","active","created_at","deleted_at") VALUES(3,'المخزن الرئيسي - رف B - رف 2','Main Warehouse','B','B','2',NULL,NULL,NULL,1,'2026-08-20 22:28:36',NULL);
INSERT INTO "storage_locations" ("id","name","warehouse","section","rack","shelf","drawer","box","notes","active","created_at","deleted_at") VALUES(4,'صندوق الإكسسوارات B-15','Main Warehouse','ACC',NULL,NULL,NULL,'B-15',NULL,1,'2026-08-20 22:28:36',NULL);
INSERT INTO "storage_locations" ("id","name","warehouse","section","rack","shelf","drawer","box","notes","active","created_at","deleted_at") VALUES(5,'خزانة IC - درج 3','Main Warehouse','IC','C','1','3',NULL,NULL,1,'2026-08-20 22:28:36',NULL);
CREATE TABLE suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  notes TEXT,
  balance REAL NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
INSERT INTO "suppliers" ("id","name","phone","address","notes","balance","active","created_at","deleted_at") VALUES(1,'شركة الشاشات المتحدة','01011112222','العباسية - القاهرة','مورد شاشات OLED/LCD',0,1,'2026-08-20 22:28:36',NULL);
INSERT INTO "suppliers" ("id","name","phone","address","notes","balance","active","created_at","deleted_at") VALUES(2,'جملة البطاريات المصرية','01033334444','المنطقة الصناعية - 6 أكتوبر','بطاريات أصلية وتقليد',0,1,'2026-08-20 22:28:36',NULL);
INSERT INTO "suppliers" ("id","name","phone","address","notes","balance","active","created_at","deleted_at") VALUES(3,'Shenzhen Mobile Parts','0020-15-5555','استيراد - بورسعيد','شحن أسبوعي',0,1,'2026-08-20 22:28:36',NULL);
INSERT INTO "suppliers" ("id","name","phone","address","notes","balance","active","created_at","deleted_at") VALUES(4,'مورد الإكسسوارات - القاهرة','01077778888','الموسكي - القاهرة','جرابات وكابلات',0,1,'2026-08-20 22:28:36',NULL);
INSERT INTO "suppliers" ("id","name","phone","address","notes","balance","active","created_at","deleted_at") VALUES(5,'الحشاش',NULL,NULL,NULL,0,1,'2026-08-20 23:23:52',NULL);
CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT NOT NULL UNIQUE,
  barcode TEXT,
  part_number TEXT,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  brand_id INTEGER,
  part_type_id INTEGER,
  category_id INTEGER,
  location_id INTEGER,
  supplier_id INTEGER,
  purchase_price REAL NOT NULL DEFAULT 0,
  selling_price REAL NOT NULL DEFAULT 0,
  wholesale_price REAL NOT NULL DEFAULT 0,
  min_selling_price REAL NOT NULL DEFAULT 0,
  current_stock INTEGER NOT NULL DEFAULT 0,
  reserved_stock INTEGER NOT NULL DEFAULT 0,
  min_stock INTEGER NOT NULL DEFAULT 0,
  image_url TEXT,
  description TEXT,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT, kind TEXT NOT NULL DEFAULT 'product',
  FOREIGN KEY (brand_id) REFERENCES brands(id),
  FOREIGN KEY (part_type_id) REFERENCES part_types(id),
  FOREIGN KEY (category_id) REFERENCES categories(id),
  FOREIGN KEY (location_id) REFERENCES storage_locations(id),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);
INSERT INTO "products" ("id","sku","barcode","part_number","name_ar","name_en","brand_id","part_type_id","category_id","location_id","supplier_id","purchase_price","selling_price","wholesale_price","min_selling_price","current_stock","reserved_stock","min_stock","image_url","description","notes","active","created_at","updated_at","deleted_at","kind") VALUES(1,'LCD-IP13','6223000000011','PN-IP13-LCD','شاشة iPhone 13','LCD iPhone 13',1,1,1,1,1,1200,1500,1350,1300,18,1,4,NULL,'شاشة LCD عالية الجودة','متوافقة مع 13 و 13 Pro',1,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL,'product');
INSERT INTO "products" ("id","sku","barcode","part_number","name_ar","name_en","brand_id","part_type_id","category_id","location_id","supplier_id","purchase_price","selling_price","wholesale_price","min_selling_price","current_stock","reserved_stock","min_stock","image_url","description","notes","active","created_at","updated_at","deleted_at","kind") VALUES(2,'LCD-IP12','6223000000028','PN-IP12-LCD','شاشة iPhone 12','LCD iPhone 12',1,1,1,1,1,950,1250,1100,1050,8,0,3,NULL,'شاشة iPhone 12',NULL,1,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL,'product');
INSERT INTO "products" ("id","sku","barcode","part_number","name_ar","name_en","brand_id","part_type_id","category_id","location_id","supplier_id","purchase_price","selling_price","wholesale_price","min_selling_price","current_stock","reserved_stock","min_stock","image_url","description","notes","active","created_at","updated_at","deleted_at","kind") VALUES(3,'LCD-IP14','6223000000035','PN-IP14-LCD','شاشة iPhone 14','LCD iPhone 14',1,1,1,1,1,1600,2100,1850,1750,6,0,2,NULL,NULL,NULL,1,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL,'product');
INSERT INTO "products" ("id","sku","barcode","part_number","name_ar","name_en","brand_id","part_type_id","category_id","location_id","supplier_id","purchase_price","selling_price","wholesale_price","min_selling_price","current_stock","reserved_stock","min_stock","image_url","description","notes","active","created_at","updated_at","deleted_at","kind") VALUES(4,'LCD-A54','6223000000042','PN-A54-LCD','شاشة Samsung A54','LCD Samsung A54',2,1,1,2,1,700,980,850,800,12,0,4,NULL,NULL,NULL,1,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL,'product');
INSERT INTO "products" ("id","sku","barcode","part_number","name_ar","name_en","brand_id","part_type_id","category_id","location_id","supplier_id","purchase_price","selling_price","wholesale_price","min_selling_price","current_stock","reserved_stock","min_stock","image_url","description","notes","active","created_at","updated_at","deleted_at","kind") VALUES(5,'BAT-IP13','6223000000059','PN-IP13-BAT','بطارية iPhone 13','Battery iPhone 13',1,2,2,2,2,280,450,380,350,15,0,5,NULL,NULL,NULL,1,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL,'product');
INSERT INTO "products" ("id","sku","barcode","part_number","name_ar","name_en","brand_id","part_type_id","category_id","location_id","supplier_id","purchase_price","selling_price","wholesale_price","min_selling_price","current_stock","reserved_stock","min_stock","image_url","description","notes","active","created_at","updated_at","deleted_at","kind") VALUES(6,'BAT-A54','6223000000066','PN-A54-BAT','بطارية Samsung A54','Battery Samsung A54',2,2,2,2,2,180,320,260,240,20,1,6,NULL,NULL,NULL,1,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL,'product');
INSERT INTO "products" ("id","sku","barcode","part_number","name_ar","name_en","brand_id","part_type_id","category_id","location_id","supplier_id","purchase_price","selling_price","wholesale_price","min_selling_price","current_stock","reserved_stock","min_stock","image_url","description","notes","active","created_at","updated_at","deleted_at","kind") VALUES(7,'BAT-RN12','6223000000073','PN-RN12-BAT','بطارية Redmi Note 12','Battery Redmi Note 12',3,2,2,2,2,150,280,220,200,10,0,4,NULL,NULL,NULL,1,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL,'product');
INSERT INTO "products" ("id","sku","barcode","part_number","name_ar","name_en","brand_id","part_type_id","category_id","location_id","supplier_id","purchase_price","selling_price","wholesale_price","min_selling_price","current_stock","reserved_stock","min_stock","image_url","description","notes","active","created_at","updated_at","deleted_at","kind") VALUES(8,'BAT-IP14','6223000000080','PN-IP14-BAT','بطارية iPhone 14','Battery iPhone 14',1,2,2,2,2,320,520,440,400,7,0,3,NULL,NULL,NULL,1,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL,'product');
INSERT INTO "products" ("id","sku","barcode","part_number","name_ar","name_en","brand_id","part_type_id","category_id","location_id","supplier_id","purchase_price","selling_price","wholesale_price","min_selling_price","current_stock","reserved_stock","min_stock","image_url","description","notes","active","created_at","updated_at","deleted_at","kind") VALUES(9,'CHG-RN12','6223000000097','PN-RN12-CHG','منفذ شحن Redmi Note 12','Charging Port Redmi Note 12',3,3,3,3,3,45,90,70,60,25,0,8,NULL,NULL,NULL,1,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL,'product');
INSERT INTO "products" ("id","sku","barcode","part_number","name_ar","name_en","brand_id","part_type_id","category_id","location_id","supplier_id","purchase_price","selling_price","wholesale_price","min_selling_price","current_stock","reserved_stock","min_stock","image_url","description","notes","active","created_at","updated_at","deleted_at","kind") VALUES(10,'CHG-IP13','6223000000103','PN-IP13-CHG','منفذ شحن iPhone 13','Charging Port iPhone 13',1,3,3,3,3,80,160,130,120,9,0,3,NULL,NULL,NULL,1,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL,'product');
INSERT INTO "products" ("id","sku","barcode","part_number","name_ar","name_en","brand_id","part_type_id","category_id","location_id","supplier_id","purchase_price","selling_price","wholesale_price","min_selling_price","current_stock","reserved_stock","min_stock","image_url","description","notes","active","created_at","updated_at","deleted_at","kind") VALUES(11,'FLX-Y9','6223000000110','PN-Y9-FLX','فلكس Huawei Y9','Flex Cable Huawei Y9',5,4,4,3,3,35,75,55,50,14,0,5,NULL,NULL,NULL,1,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL,'product');
INSERT INTO "products" ("id","sku","barcode","part_number","name_ar","name_en","brand_id","part_type_id","category_id","location_id","supplier_id","purchase_price","selling_price","wholesale_price","min_selling_price","current_stock","reserved_stock","min_stock","image_url","description","notes","active","created_at","updated_at","deleted_at","kind") VALUES(12,'FLX-A54','6223000000127','PN-A54-FLX','فلكس Samsung A54','Flex Cable Samsung A54',2,4,4,3,3,40,85,65,55,11,0,4,NULL,NULL,NULL,1,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL,'product');
INSERT INTO "products" ("id","sku","barcode","part_number","name_ar","name_en","brand_id","part_type_id","category_id","location_id","supplier_id","purchase_price","selling_price","wholesale_price","min_selling_price","current_stock","reserved_stock","min_stock","image_url","description","notes","active","created_at","updated_at","deleted_at","kind") VALUES(13,'CAM-IP14','6223000000134','PN-IP14-CAM','كاميرا خلفية iPhone 14','Rear Camera iPhone 14',1,5,5,3,3,900,1350,1150,1100,4,0,2,NULL,NULL,NULL,1,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL,'product');
INSERT INTO "products" ("id","sku","barcode","part_number","name_ar","name_en","brand_id","part_type_id","category_id","location_id","supplier_id","purchase_price","selling_price","wholesale_price","min_selling_price","current_stock","reserved_stock","min_stock","image_url","description","notes","active","created_at","updated_at","deleted_at","kind") VALUES(14,'CAM-A54','6223000000141','PN-A54-CAM','كاميرا Samsung A54','Camera Samsung A54',2,5,5,3,3,220,380,310,280,8,0,3,NULL,NULL,NULL,1,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL,'product');
INSERT INTO "products" ("id","sku","barcode","part_number","name_ar","name_en","brand_id","part_type_id","category_id","location_id","supplier_id","purchase_price","selling_price","wholesale_price","min_selling_price","current_stock","reserved_stock","min_stock","image_url","description","notes","active","created_at","updated_at","deleted_at","kind") VALUES(15,'SPK-RN8','6223000000158','PN-RN8-SPK','سماعة Oppo Reno 8','Speaker Oppo Reno 8',4,6,6,3,3,55,110,85,75,13,0,4,NULL,NULL,NULL,1,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL,'product');
INSERT INTO "products" ("id","sku","barcode","part_number","name_ar","name_en","brand_id","part_type_id","category_id","location_id","supplier_id","purchase_price","selling_price","wholesale_price","min_selling_price","current_stock","reserved_stock","min_stock","image_url","description","notes","active","created_at","updated_at","deleted_at","kind") VALUES(16,'SPK-IP13','6223000000165','PN-IP13-SPK','سماعة iPhone 13','Speaker iPhone 13',1,6,6,3,3,70,140,110,100,6,0,2,NULL,NULL,NULL,1,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL,'product');
INSERT INTO "products" ("id","sku","barcode","part_number","name_ar","name_en","brand_id","part_type_id","category_id","location_id","supplier_id","purchase_price","selling_price","wholesale_price","min_selling_price","current_stock","reserved_stock","min_stock","image_url","description","notes","active","created_at","updated_at","deleted_at","kind") VALUES(17,'MIC-RM10','6223000000172','PN-RM10-MIC','مايك Realme 10','Microphone Realme 10',6,7,7,5,3,25,60,45,40,18,0,6,NULL,NULL,NULL,1,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL,'product');
INSERT INTO "products" ("id","sku","barcode","part_number","name_ar","name_en","brand_id","part_type_id","category_id","location_id","supplier_id","purchase_price","selling_price","wholesale_price","min_selling_price","current_stock","reserved_stock","min_stock","image_url","description","notes","active","created_at","updated_at","deleted_at","kind") VALUES(18,'IC-A54','6223000000189','PN-A54-IC','آي سي شحن Samsung A54','Charging IC Samsung A54',2,8,8,5,3,120,220,180,160,9,0,3,NULL,NULL,NULL,1,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL,'product');
INSERT INTO "products" ("id","sku","barcode","part_number","name_ar","name_en","brand_id","part_type_id","category_id","location_id","supplier_id","purchase_price","selling_price","wholesale_price","min_selling_price","current_stock","reserved_stock","min_stock","image_url","description","notes","active","created_at","updated_at","deleted_at","kind") VALUES(19,'HSG-IP11','6223000000196','PN-IP11-HSG','هيكل iPhone 11','Housing iPhone 11',1,9,9,3,3,350,580,480,450,5,0,2,NULL,NULL,NULL,1,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL,'product');
INSERT INTO "products" ("id","sku","barcode","part_number","name_ar","name_en","brand_id","part_type_id","category_id","location_id","supplier_id","purchase_price","selling_price","wholesale_price","min_selling_price","current_stock","reserved_stock","min_stock","image_url","description","notes","active","created_at","updated_at","deleted_at","kind") VALUES(20,'BKG-S23','6223000000202','PN-S23-BKG','ظهر زجاج Samsung S23','Back Glass Samsung S23',2,10,10,3,3,90,180,140,130,7,0,3,NULL,NULL,NULL,1,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL,'product');
INSERT INTO "products" ("id","sku","barcode","part_number","name_ar","name_en","brand_id","part_type_id","category_id","location_id","supplier_id","purchase_price","selling_price","wholesale_price","min_selling_price","current_stock","reserved_stock","min_stock","image_url","description","notes","active","created_at","updated_at","deleted_at","kind") VALUES(21,'BKG-IP13','6223000000219','PN-IP13-BKG','ظهر زجاج iPhone 13','Back Glass iPhone 13',1,10,10,3,3,110,210,170,150,4,0,2,NULL,NULL,NULL,1,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL,'product');
INSERT INTO "products" ("id","sku","barcode","part_number","name_ar","name_en","brand_id","part_type_id","category_id","location_id","supplier_id","purchase_price","selling_price","wholesale_price","min_selling_price","current_stock","reserved_stock","min_stock","image_url","description","notes","active","created_at","updated_at","deleted_at","kind") VALUES(22,'BTN-IP13','6223000000226','PN-IP13-BTN','أزرار جانبية iPhone 13','Side Buttons iPhone 13',1,11,11,5,3,30,70,50,45,16,0,5,NULL,NULL,NULL,1,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL,'product');
INSERT INTO "products" ("id","sku","barcode","part_number","name_ar","name_en","brand_id","part_type_id","category_id","location_id","supplier_id","purchase_price","selling_price","wholesale_price","min_selling_price","current_stock","reserved_stock","min_stock","image_url","description","notes","active","created_at","updated_at","deleted_at","kind") VALUES(23,'CON-TC','6223000000233','PN-USB-C','وصلة USB-C عامة','USB-C Connector',NULL,12,12,5,3,15,40,28,25,30,0,10,NULL,'وصلة عامة',NULL,1,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL,'product');
INSERT INTO "products" ("id","sku","barcode","part_number","name_ar","name_en","brand_id","part_type_id","category_id","location_id","supplier_id","purchase_price","selling_price","wholesale_price","min_selling_price","current_stock","reserved_stock","min_stock","image_url","description","notes","active","created_at","updated_at","deleted_at","kind") VALUES(24,'CASE-IP13','6223000000240','PN-CASE-IP13','جراب iPhone 13','Case iPhone 13',1,13,12,4,4,25,75,50,45,40,2,10,NULL,NULL,NULL,1,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL,'product');
INSERT INTO "products" ("id","sku","barcode","part_number","name_ar","name_en","brand_id","part_type_id","category_id","location_id","supplier_id","purchase_price","selling_price","wholesale_price","min_selling_price","current_stock","reserved_stock","min_stock","image_url","description","notes","active","created_at","updated_at","deleted_at","kind") VALUES(25,'CASE-A54','6223000000257','PN-CASE-A54','جراب Samsung A54','Case Samsung A54',2,13,12,4,4,20,65,45,40,28,0,8,NULL,NULL,NULL,1,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL,'product');
INSERT INTO "products" ("id","sku","barcode","part_number","name_ar","name_en","brand_id","part_type_id","category_id","location_id","supplier_id","purchase_price","selling_price","wholesale_price","min_selling_price","current_stock","reserved_stock","min_stock","image_url","description","notes","active","created_at","updated_at","deleted_at","kind") VALUES(26,'GLS-IP13','6223000000264','PN-GLS-IP13','استكر حماية iPhone 13','Screen Protector iPhone 13',1,13,12,4,4,8,35,22,18,50,0,15,NULL,NULL,NULL,1,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL,'product');
INSERT INTO "products" ("id","sku","barcode","part_number","name_ar","name_en","brand_id","part_type_id","category_id","location_id","supplier_id","purchase_price","selling_price","wholesale_price","min_selling_price","current_stock","reserved_stock","min_stock","image_url","description","notes","active","created_at","updated_at","deleted_at","kind") VALUES(27,'CBL-LTN','6223000000271','PN-CBL-LTN','كابل Lightning','Lightning Cable',1,13,12,4,4,18,55,40,35,22,0,8,NULL,NULL,NULL,1,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL,'product');
INSERT INTO "products" ("id","sku","barcode","part_number","name_ar","name_en","brand_id","part_type_id","category_id","location_id","supplier_id","purchase_price","selling_price","wholesale_price","min_selling_price","current_stock","reserved_stock","min_stock","image_url","description","notes","active","created_at","updated_at","deleted_at","kind") VALUES(28,'PB-10K','6223000000288','PN-PB-10K','باور بانك 10000','Power Bank 10000mAh',NULL,13,12,4,4,140,250,200,180,9,0,3,NULL,NULL,NULL,1,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL,'product');
INSERT INTO "products" ("id","sku","barcode","part_number","name_ar","name_en","brand_id","part_type_id","category_id","location_id","supplier_id","purchase_price","selling_price","wholesale_price","min_selling_price","current_stock","reserved_stock","min_stock","image_url","description","notes","active","created_at","updated_at","deleted_at","kind") VALUES(29,'LCD-G21','6223000000295','PN-G21-LCD','شاشة Nokia G21','LCD Nokia G21',7,1,1,2,1,420,650,540,500,0,-2,2,NULL,NULL,NULL,1,'2026-08-20 22:28:36','2026-09-15 08:31:38',NULL,'product');
INSERT INTO "products" ("id","sku","barcode","part_number","name_ar","name_en","brand_id","part_type_id","category_id","location_id","supplier_id","purchase_price","selling_price","wholesale_price","min_selling_price","current_stock","reserved_stock","min_stock","image_url","description","notes","active","created_at","updated_at","deleted_at","kind") VALUES(30,'BAT-Y22','6223000000301','PN-Y22-BAT','بطارية Vivo Y22','Battery Vivo Y22',8,2,2,2,2,160,290,230,210,2,0,4,NULL,NULL,'مخزون منخفض',1,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL,'product');
INSERT INTO "products" ("id","sku","barcode","part_number","name_ar","name_en","brand_id","part_type_id","category_id","location_id","supplier_id","purchase_price","selling_price","wholesale_price","min_selling_price","current_stock","reserved_stock","min_stock","image_url","description","notes","active","created_at","updated_at","deleted_at","kind") VALUES(31,'LCD-RN13','6223000000318','PN-RN13-LCD','شاشة Redmi Note 13','LCD Redmi Note 13',3,1,1,1,1,550,820,700,650,0,0,3,NULL,NULL,'نافد',1,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL,'product');
INSERT INTO "products" ("id","sku","barcode","part_number","name_ar","name_en","brand_id","part_type_id","category_id","location_id","supplier_id","purchase_price","selling_price","wholesale_price","min_selling_price","current_stock","reserved_stock","min_stock","image_url","description","notes","active","created_at","updated_at","deleted_at","kind") VALUES(32,'HSG-A54','6223000000325','PN-A54-HSG','هيكل Samsung A54','Housing Samsung A54',2,9,9,3,3,260,420,350,320,1,0,3,NULL,NULL,'مخزون منخفض',1,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL,'product');
INSERT INTO "products" ("id","sku","barcode","part_number","name_ar","name_en","brand_id","part_type_id","category_id","location_id","supplier_id","purchase_price","selling_price","wholesale_price","min_selling_price","current_stock","reserved_stock","min_stock","image_url","description","notes","active","created_at","updated_at","deleted_at","kind") VALUES(33,'SRV-LCD','6223000000332','SRV-INSTALL-LCD','تركيب شاشة','Screen installation',NULL,15,13,NULL,NULL,40,150,120,100,0,0,0,NULL,'خدمة تركيب شاشة في المحل أو عند العميل',NULL,1,'2026-09-15 17:39:55','2026-09-15 17:39:55',NULL,'service');
INSERT INTO "products" ("id","sku","barcode","part_number","name_ar","name_en","brand_id","part_type_id","category_id","location_id","supplier_id","purchase_price","selling_price","wholesale_price","min_selling_price","current_stock","reserved_stock","min_stock","image_url","description","notes","active","created_at","updated_at","deleted_at","kind") VALUES(34,'SRV-SW','6223000000349','SRV-SOFTWARE','صيانة سوفتوير','Software repair',NULL,15,13,NULL,NULL,20,200,150,120,0,0,0,NULL,'فلاشة وإصلاح نظام',NULL,1,'2026-09-15 17:39:55','2026-09-15 17:39:55',NULL,'service');
INSERT INTO "products" ("id","sku","barcode","part_number","name_ar","name_en","brand_id","part_type_id","category_id","location_id","supplier_id","purchase_price","selling_price","wholesale_price","min_selling_price","current_stock","reserved_stock","min_stock","image_url","description","notes","active","created_at","updated_at","deleted_at","kind") VALUES(35,'SRV-CLN','6223000000356','SRV-CLEAN','تنظيف الجهاز','Device cleaning',NULL,15,13,NULL,NULL,15,80,60,50,0,0,0,NULL,'تنظيف داخلي ومنفذ شحن',NULL,1,'2026-09-15 17:39:55','2026-09-15 17:39:55',NULL,'service');
CREATE TABLE product_models (
  product_id INTEGER NOT NULL,
  model_id INTEGER NOT NULL,
  PRIMARY KEY (product_id, model_id),
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (model_id) REFERENCES device_models(id)
);
INSERT INTO "product_models" ("product_id","model_id") VALUES(1,3);
INSERT INTO "product_models" ("product_id","model_id") VALUES(1,4);
INSERT INTO "product_models" ("product_id","model_id") VALUES(2,1);
INSERT INTO "product_models" ("product_id","model_id") VALUES(2,2);
INSERT INTO "product_models" ("product_id","model_id") VALUES(3,5);
INSERT INTO "product_models" ("product_id","model_id") VALUES(3,6);
INSERT INTO "product_models" ("product_id","model_id") VALUES(4,8);
INSERT INTO "product_models" ("product_id","model_id") VALUES(5,3);
INSERT INTO "product_models" ("product_id","model_id") VALUES(6,8);
INSERT INTO "product_models" ("product_id","model_id") VALUES(7,12);
INSERT INTO "product_models" ("product_id","model_id") VALUES(8,5);
INSERT INTO "product_models" ("product_id","model_id") VALUES(9,12);
INSERT INTO "product_models" ("product_id","model_id") VALUES(10,3);
INSERT INTO "product_models" ("product_id","model_id") VALUES(11,17);
INSERT INTO "product_models" ("product_id","model_id") VALUES(12,8);
INSERT INTO "product_models" ("product_id","model_id") VALUES(13,5);
INSERT INTO "product_models" ("product_id","model_id") VALUES(14,8);
INSERT INTO "product_models" ("product_id","model_id") VALUES(15,15);
INSERT INTO "product_models" ("product_id","model_id") VALUES(16,3);
INSERT INTO "product_models" ("product_id","model_id") VALUES(17,18);
INSERT INTO "product_models" ("product_id","model_id") VALUES(18,8);
INSERT INTO "product_models" ("product_id","model_id") VALUES(19,7);
INSERT INTO "product_models" ("product_id","model_id") VALUES(20,10);
INSERT INTO "product_models" ("product_id","model_id") VALUES(21,3);
INSERT INTO "product_models" ("product_id","model_id") VALUES(22,3);
INSERT INTO "product_models" ("product_id","model_id") VALUES(24,3);
INSERT INTO "product_models" ("product_id","model_id") VALUES(24,4);
INSERT INTO "product_models" ("product_id","model_id") VALUES(25,8);
INSERT INTO "product_models" ("product_id","model_id") VALUES(26,3);
INSERT INTO "product_models" ("product_id","model_id") VALUES(29,19);
INSERT INTO "product_models" ("product_id","model_id") VALUES(30,20);
INSERT INTO "product_models" ("product_id","model_id") VALUES(31,13);
INSERT INTO "product_models" ("product_id","model_id") VALUES(32,8);
CREATE TABLE customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  whatsapp TEXT,
  address TEXT,
  area TEXT,
  notes TEXT,
  customer_type TEXT NOT NULL DEFAULT 'retail',
  payment_terms TEXT NOT NULL DEFAULT 'cash',
  credit_limit REAL NOT NULL DEFAULT 0,
  current_balance REAL NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
INSERT INTO "customers" ("id","name","phone","whatsapp","address","area","notes","customer_type","payment_terms","credit_limit","current_balance","active","created_at","updated_at","deleted_at") VALUES(1,'أحمد محمد','01012345678','01012345678','شارع عباس العقاد - عمارة 12','مدينة نصر','عميل دائم','retail','cash',0,0,1,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL);
INSERT INTO "customers" ("id","name","phone","whatsapp","address","area","notes","customer_type","payment_terms","credit_limit","current_balance","active","created_at","updated_at","deleted_at") VALUES(2,'محمود علي','01023456789','01023456789','شارع 9 - المعادي','المعادي',NULL,'retail','cash',0,0,1,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL);
INSERT INTO "customers" ("id","name","phone","whatsapp","address","area","notes","customer_type","payment_terms","credit_limit","current_balance","active","created_at","updated_at","deleted_at") VALUES(3,'فاطمة حسن','01134567890','01134567890','شارع الحجاز','مصر الجديدة',NULL,'retail','cash',0,0,1,'2026-08-20 22:28:36','2026-09-15 08:29:27',NULL);
INSERT INTO "customers" ("id","name","phone","whatsapp","address","area","notes","customer_type","payment_terms","credit_limit","current_balance","active","created_at","updated_at","deleted_at") VALUES(4,'كريم سعد','01245678901','01245678901','شارع الهرم بجوار مترو','الهرم',NULL,'retail','credit',5000,1850,1,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL);
INSERT INTO "customers" ("id","name","phone","whatsapp","address","area","notes","customer_type","payment_terms","credit_limit","current_balance","active","created_at","updated_at","deleted_at") VALUES(5,'ياسر عبدالله','01056789012','01056789012','الحي المتميز','6 أكتوبر',NULL,'retail','cash',0,0,1,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL);
INSERT INTO "customers" ("id","name","phone","whatsapp","address","area","notes","customer_type","payment_terms","credit_limit","current_balance","active","created_at","updated_at","deleted_at") VALUES(6,'شركة تك موبايل','01067890123','01067890123','شارع شبرا','شبرا','عميل جملة','wholesale','credit',20000,4200,1,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL);
INSERT INTO "customers" ("id","name","phone","whatsapp","address","area","notes","customer_type","payment_terms","credit_limit","current_balance","active","created_at","updated_at","deleted_at") VALUES(7,'ورشة الموبايل الذهبي','01078901234','01078901234','شارع الجلاء','الزقازيق','ورشة صيانة','wholesale','credit',10000,0,1,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL);
INSERT INTO "customers" ("id","name","phone","whatsapp","address","area","notes","customer_type","payment_terms","credit_limit","current_balance","active","created_at","updated_at","deleted_at") VALUES(8,'إسلام فتحي','01089012345','01089012345','طنطا - شارع البحر','طنطا',NULL,'retail','cash',0,0,1,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL);
CREATE TABLE delivery_agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
, lat REAL, lng REAL, last_seen_at TEXT);
INSERT INTO "delivery_agents" ("id","name","code","phone","status","notes","created_at","deleted_at","lat","lng","last_seen_at") VALUES(1,'محمد علي','125','01098765432','active','تيار منطقة شرق القاهرة','2026-08-20 22:28:36',NULL,30.0581,31.3284,'2026-09-15 17:39:55');
INSERT INTO "delivery_agents" ("id","name","code","phone","status","notes","created_at","deleted_at","lat","lng","last_seen_at") VALUES(2,'أحمد السيد','126','01087654321','active','المعادي والهرم','2026-08-20 22:28:36',NULL,29.9602,31.2569,'2026-09-15 17:39:55');
INSERT INTO "delivery_agents" ("id","name","code","phone","status","notes","created_at","deleted_at","lat","lng","last_seen_at") VALUES(3,'محمود فتحي','127','01076543210','active','6 أكتوبر والجيزة','2026-08-20 22:28:36',NULL,29.9741,30.9436,'2026-09-15 17:39:55');
CREATE TABLE payment_methods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "payment_methods" ("id","code","name_ar","name_en","active","sort_order") VALUES(1,'cash','كاش','Cash',1,1);
INSERT INTO "payment_methods" ("id","code","name_ar","name_en","active","sort_order") VALUES(2,'visa','فيزا','Visa',1,2);
INSERT INTO "payment_methods" ("id","code","name_ar","name_en","active","sort_order") VALUES(3,'mastercard','ماستركارد','Mastercard',1,3);
INSERT INTO "payment_methods" ("id","code","name_ar","name_en","active","sort_order") VALUES(4,'vodafone_cash','فودافون كاش','Vodafone Cash',1,4);
INSERT INTO "payment_methods" ("id","code","name_ar","name_en","active","sort_order") VALUES(5,'instapay','إنستاباي','InstaPay',1,5);
INSERT INTO "payment_methods" ("id","code","name_ar","name_en","active","sort_order") VALUES(6,'bank_transfer','تحويل بنكي','Bank Transfer',1,6);
INSERT INTO "payment_methods" ("id","code","name_ar","name_en","active","sort_order") VALUES(7,'credit','آجل','Credit',1,7);
INSERT INTO "payment_methods" ("id","code","name_ar","name_en","active","sort_order") VALUES(8,'other','أخرى','Other',1,8);
CREATE TABLE purchase_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  supplier_id INTEGER,
  date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  subtotal REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  extra_expenses REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_by INTEGER,
  approved_at TEXT,
  approved_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);
INSERT INTO "purchase_invoices" ("id","number","supplier_id","date","status","subtotal","discount","extra_expenses","total","notes","created_by","approved_at","approved_by","created_at","updated_at","deleted_at") VALUES(1,'PUR-1001',1,'2026-06-12','approved',5000,0,150,5150,'شحنة شاشات أولى',3,'2026-06-12T10:00:00',1,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL);
INSERT INTO "purchase_invoices" ("id","number","supplier_id","date","status","subtotal","discount","extra_expenses","total","notes","created_by","approved_at","approved_by","created_at","updated_at","deleted_at") VALUES(2,'PUR-1050',1,'2026-07-08','approved',12000,200,200,12000,'شحنة ثانية بسعر أعلى',3,'2026-07-08T11:00:00',1,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL);
INSERT INTO "purchase_invoices" ("id","number","supplier_id","date","status","subtotal","discount","extra_expenses","total","notes","created_by","approved_at","approved_by","created_at","updated_at","deleted_at") VALUES(3,'PUR-1100',3,'2026-08-02','approved',7000,0,300,7300,'استيراد أغسطس',3,'2026-08-02T09:30:00',1,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL);
INSERT INTO "purchase_invoices" ("id","number","supplier_id","date","status","subtotal","discount","extra_expenses","total","notes","created_by","approved_at","approved_by","created_at","updated_at","deleted_at") VALUES(4,'PUR-1120',2,'2026-08-10','approved',8900,0,80,8980,'بطاريات',3,'2026-08-10T14:00:00',1,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL);
INSERT INTO "purchase_invoices" ("id","number","supplier_id","date","status","subtotal","discount","extra_expenses","total","notes","created_by","approved_at","approved_by","created_at","updated_at","deleted_at") VALUES(5,'PUR-1140',4,'2026-08-15','approved',2460,0,40,2500,'إكسسوارات',3,'2026-08-15T16:00:00',1,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL);
CREATE TABLE purchase_invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  unit_cost REAL NOT NULL,
  discount REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  expiry_date TEXT,
  production_date TEXT,
  FOREIGN KEY (purchase_id) REFERENCES purchase_invoices(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);
INSERT INTO "purchase_invoice_items" ("id","purchase_id","product_id","quantity","unit_cost","discount","total","expiry_date","production_date") VALUES(1,1,1,5,1000,0,5000,NULL,NULL);
INSERT INTO "purchase_invoice_items" ("id","purchase_id","product_id","quantity","unit_cost","discount","total","expiry_date","production_date") VALUES(2,2,1,10,1200,0,12000,NULL,NULL);
INSERT INTO "purchase_invoice_items" ("id","purchase_id","product_id","quantity","unit_cost","discount","total","expiry_date","production_date") VALUES(3,3,1,5,1400,0,7000,NULL,NULL);
INSERT INTO "purchase_invoice_items" ("id","purchase_id","product_id","quantity","unit_cost","discount","total","expiry_date","production_date") VALUES(4,4,6,22,180,0,3960,NULL,NULL);
INSERT INTO "purchase_invoice_items" ("id","purchase_id","product_id","quantity","unit_cost","discount","total","expiry_date","production_date") VALUES(5,4,5,16,280,0,4480,NULL,NULL);
INSERT INTO "purchase_invoice_items" ("id","purchase_id","product_id","quantity","unit_cost","discount","total","expiry_date","production_date") VALUES(6,5,24,44,25,0,1100,NULL,NULL);
INSERT INTO "purchase_invoice_items" ("id","purchase_id","product_id","quantity","unit_cost","discount","total","expiry_date","production_date") VALUES(7,5,25,28,20,0,560,NULL,NULL);
INSERT INTO "purchase_invoice_items" ("id","purchase_id","product_id","quantity","unit_cost","discount","total","expiry_date","production_date") VALUES(8,1,2,8,950,0,7600,NULL,NULL);
INSERT INTO "purchase_invoice_items" ("id","purchase_id","product_id","quantity","unit_cost","discount","total","expiry_date","production_date") VALUES(9,3,4,12,700,0,8400,NULL,NULL);
INSERT INTO "purchase_invoice_items" ("id","purchase_id","product_id","quantity","unit_cost","discount","total","expiry_date","production_date") VALUES(10,2,3,6,1600,0,9600,NULL,NULL);
CREATE TABLE inventory_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_code TEXT NOT NULL UNIQUE,
  product_id INTEGER NOT NULL,
  purchase_id INTEGER,
  purchase_item_id INTEGER,
  supplier_id INTEGER,
  purchase_date TEXT,
  original_qty INTEGER NOT NULL,
  remaining_qty INTEGER NOT NULL,
  reserved_qty INTEGER NOT NULL DEFAULT 0,
  unit_cost REAL NOT NULL,
  expiry_date TEXT,
  production_date TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (purchase_id) REFERENCES purchase_invoices(id)
);
INSERT INTO "inventory_batches" ("id","batch_code","product_id","purchase_id","purchase_item_id","supplier_id","purchase_date","original_qty","remaining_qty","reserved_qty","unit_cost","expiry_date","production_date","notes","created_at") VALUES(1,'B001',1,1,1,1,'2026-06-12',5,3,1,1000,NULL,NULL,NULL,'2026-08-20 22:28:36');
INSERT INTO "inventory_batches" ("id","batch_code","product_id","purchase_id","purchase_item_id","supplier_id","purchase_date","original_qty","remaining_qty","reserved_qty","unit_cost","expiry_date","production_date","notes","created_at") VALUES(2,'B002',1,2,2,1,'2026-07-08',10,10,0,1200,NULL,NULL,NULL,'2026-08-20 22:28:36');
INSERT INTO "inventory_batches" ("id","batch_code","product_id","purchase_id","purchase_item_id","supplier_id","purchase_date","original_qty","remaining_qty","reserved_qty","unit_cost","expiry_date","production_date","notes","created_at") VALUES(3,'B003',1,3,3,3,'2026-08-02',5,5,0,1400,NULL,NULL,NULL,'2026-08-20 22:28:36');
INSERT INTO "inventory_batches" ("id","batch_code","product_id","purchase_id","purchase_item_id","supplier_id","purchase_date","original_qty","remaining_qty","reserved_qty","unit_cost","expiry_date","production_date","notes","created_at") VALUES(4,'B004',2,1,8,1,'2026-06-12',8,8,0,950,NULL,NULL,NULL,'2026-08-20 22:28:36');
INSERT INTO "inventory_batches" ("id","batch_code","product_id","purchase_id","purchase_item_id","supplier_id","purchase_date","original_qty","remaining_qty","reserved_qty","unit_cost","expiry_date","production_date","notes","created_at") VALUES(5,'B005',3,2,10,1,'2026-07-08',6,6,0,1600,NULL,NULL,NULL,'2026-08-20 22:28:36');
INSERT INTO "inventory_batches" ("id","batch_code","product_id","purchase_id","purchase_item_id","supplier_id","purchase_date","original_qty","remaining_qty","reserved_qty","unit_cost","expiry_date","production_date","notes","created_at") VALUES(6,'B006',4,3,9,3,'2026-08-02',12,12,0,700,NULL,NULL,NULL,'2026-08-20 22:28:36');
INSERT INTO "inventory_batches" ("id","batch_code","product_id","purchase_id","purchase_item_id","supplier_id","purchase_date","original_qty","remaining_qty","reserved_qty","unit_cost","expiry_date","production_date","notes","created_at") VALUES(7,'B007',6,4,4,2,'2026-08-10',22,20,1,180,NULL,NULL,NULL,'2026-08-20 22:28:36');
INSERT INTO "inventory_batches" ("id","batch_code","product_id","purchase_id","purchase_item_id","supplier_id","purchase_date","original_qty","remaining_qty","reserved_qty","unit_cost","expiry_date","production_date","notes","created_at") VALUES(8,'B008',5,4,5,2,'2026-08-10',16,15,0,280,NULL,NULL,NULL,'2026-08-20 22:28:36');
INSERT INTO "inventory_batches" ("id","batch_code","product_id","purchase_id","purchase_item_id","supplier_id","purchase_date","original_qty","remaining_qty","reserved_qty","unit_cost","expiry_date","production_date","notes","created_at") VALUES(9,'B009',24,5,6,4,'2026-08-15',44,40,2,25,NULL,NULL,NULL,'2026-08-20 22:28:36');
INSERT INTO "inventory_batches" ("id","batch_code","product_id","purchase_id","purchase_item_id","supplier_id","purchase_date","original_qty","remaining_qty","reserved_qty","unit_cost","expiry_date","production_date","notes","created_at") VALUES(10,'B010',25,5,7,4,'2026-08-15',28,28,0,20,NULL,NULL,NULL,'2026-08-20 22:28:36');
INSERT INTO "inventory_batches" ("id","batch_code","product_id","purchase_id","purchase_item_id","supplier_id","purchase_date","original_qty","remaining_qty","reserved_qty","unit_cost","expiry_date","production_date","notes","created_at") VALUES(11,'B011',7,NULL,NULL,2,'2026-07-20',10,10,0,150,NULL,NULL,NULL,'2026-08-20 22:28:36');
INSERT INTO "inventory_batches" ("id","batch_code","product_id","purchase_id","purchase_item_id","supplier_id","purchase_date","original_qty","remaining_qty","reserved_qty","unit_cost","expiry_date","production_date","notes","created_at") VALUES(12,'B012',8,NULL,NULL,2,'2026-07-20',7,7,0,320,NULL,NULL,NULL,'2026-08-20 22:28:36');
INSERT INTO "inventory_batches" ("id","batch_code","product_id","purchase_id","purchase_item_id","supplier_id","purchase_date","original_qty","remaining_qty","reserved_qty","unit_cost","expiry_date","production_date","notes","created_at") VALUES(13,'B013',9,NULL,NULL,3,'2026-06-01',25,25,0,45,NULL,NULL,NULL,'2026-08-20 22:28:36');
INSERT INTO "inventory_batches" ("id","batch_code","product_id","purchase_id","purchase_item_id","supplier_id","purchase_date","original_qty","remaining_qty","reserved_qty","unit_cost","expiry_date","production_date","notes","created_at") VALUES(14,'B014',10,NULL,NULL,3,'2026-06-01',9,9,0,80,NULL,NULL,NULL,'2026-08-20 22:28:36');
INSERT INTO "inventory_batches" ("id","batch_code","product_id","purchase_id","purchase_item_id","supplier_id","purchase_date","original_qty","remaining_qty","reserved_qty","unit_cost","expiry_date","production_date","notes","created_at") VALUES(15,'B015',11,NULL,NULL,3,'2026-06-01',14,14,0,35,NULL,NULL,NULL,'2026-08-20 22:28:36');
INSERT INTO "inventory_batches" ("id","batch_code","product_id","purchase_id","purchase_item_id","supplier_id","purchase_date","original_qty","remaining_qty","reserved_qty","unit_cost","expiry_date","production_date","notes","created_at") VALUES(16,'B016',12,NULL,NULL,3,'2026-06-01',11,11,0,40,NULL,NULL,NULL,'2026-08-20 22:28:36');
INSERT INTO "inventory_batches" ("id","batch_code","product_id","purchase_id","purchase_item_id","supplier_id","purchase_date","original_qty","remaining_qty","reserved_qty","unit_cost","expiry_date","production_date","notes","created_at") VALUES(17,'B017',13,NULL,NULL,3,'2026-08-02',4,4,0,900,NULL,NULL,NULL,'2026-08-20 22:28:36');
INSERT INTO "inventory_batches" ("id","batch_code","product_id","purchase_id","purchase_item_id","supplier_id","purchase_date","original_qty","remaining_qty","reserved_qty","unit_cost","expiry_date","production_date","notes","created_at") VALUES(18,'B018',14,NULL,NULL,3,'2026-08-02',8,8,0,220,NULL,NULL,NULL,'2026-08-20 22:28:36');
INSERT INTO "inventory_batches" ("id","batch_code","product_id","purchase_id","purchase_item_id","supplier_id","purchase_date","original_qty","remaining_qty","reserved_qty","unit_cost","expiry_date","production_date","notes","created_at") VALUES(19,'B019',15,NULL,NULL,3,'2026-06-01',13,13,0,55,NULL,NULL,NULL,'2026-08-20 22:28:36');
INSERT INTO "inventory_batches" ("id","batch_code","product_id","purchase_id","purchase_item_id","supplier_id","purchase_date","original_qty","remaining_qty","reserved_qty","unit_cost","expiry_date","production_date","notes","created_at") VALUES(20,'B020',16,NULL,NULL,3,'2026-06-01',6,6,0,70,NULL,NULL,NULL,'2026-08-20 22:28:36');
INSERT INTO "inventory_batches" ("id","batch_code","product_id","purchase_id","purchase_item_id","supplier_id","purchase_date","original_qty","remaining_qty","reserved_qty","unit_cost","expiry_date","production_date","notes","created_at") VALUES(21,'B021',17,NULL,NULL,3,'2026-06-01',18,18,0,25,NULL,NULL,NULL,'2026-08-20 22:28:36');
INSERT INTO "inventory_batches" ("id","batch_code","product_id","purchase_id","purchase_item_id","supplier_id","purchase_date","original_qty","remaining_qty","reserved_qty","unit_cost","expiry_date","production_date","notes","created_at") VALUES(22,'B022',18,NULL,NULL,3,'2026-07-08',9,9,0,120,NULL,NULL,NULL,'2026-08-20 22:28:36');
INSERT INTO "inventory_batches" ("id","batch_code","product_id","purchase_id","purchase_item_id","supplier_id","purchase_date","original_qty","remaining_qty","reserved_qty","unit_cost","expiry_date","production_date","notes","created_at") VALUES(23,'B023',19,NULL,NULL,3,'2026-06-12',5,5,0,350,NULL,NULL,NULL,'2026-08-20 22:28:36');
INSERT INTO "inventory_batches" ("id","batch_code","product_id","purchase_id","purchase_item_id","supplier_id","purchase_date","original_qty","remaining_qty","reserved_qty","unit_cost","expiry_date","production_date","notes","created_at") VALUES(24,'B024',20,NULL,NULL,3,'2026-07-08',7,7,0,90,NULL,NULL,NULL,'2026-08-20 22:28:36');
INSERT INTO "inventory_batches" ("id","batch_code","product_id","purchase_id","purchase_item_id","supplier_id","purchase_date","original_qty","remaining_qty","reserved_qty","unit_cost","expiry_date","production_date","notes","created_at") VALUES(25,'B025',21,NULL,NULL,3,'2026-07-08',4,4,0,110,NULL,NULL,NULL,'2026-08-20 22:28:36');
INSERT INTO "inventory_batches" ("id","batch_code","product_id","purchase_id","purchase_item_id","supplier_id","purchase_date","original_qty","remaining_qty","reserved_qty","unit_cost","expiry_date","production_date","notes","created_at") VALUES(26,'B026',22,NULL,NULL,3,'2026-06-01',16,16,0,30,NULL,NULL,NULL,'2026-08-20 22:28:36');
INSERT INTO "inventory_batches" ("id","batch_code","product_id","purchase_id","purchase_item_id","supplier_id","purchase_date","original_qty","remaining_qty","reserved_qty","unit_cost","expiry_date","production_date","notes","created_at") VALUES(27,'B027',23,NULL,NULL,3,'2026-06-01',30,30,0,15,NULL,NULL,NULL,'2026-08-20 22:28:36');
INSERT INTO "inventory_batches" ("id","batch_code","product_id","purchase_id","purchase_item_id","supplier_id","purchase_date","original_qty","remaining_qty","reserved_qty","unit_cost","expiry_date","production_date","notes","created_at") VALUES(28,'B028',26,NULL,NULL,4,'2026-08-15',50,50,0,8,NULL,NULL,NULL,'2026-08-20 22:28:36');
INSERT INTO "inventory_batches" ("id","batch_code","product_id","purchase_id","purchase_item_id","supplier_id","purchase_date","original_qty","remaining_qty","reserved_qty","unit_cost","expiry_date","production_date","notes","created_at") VALUES(29,'B029',27,NULL,NULL,4,'2026-08-15',22,22,0,18,NULL,NULL,NULL,'2026-08-20 22:28:36');
INSERT INTO "inventory_batches" ("id","batch_code","product_id","purchase_id","purchase_item_id","supplier_id","purchase_date","original_qty","remaining_qty","reserved_qty","unit_cost","expiry_date","production_date","notes","created_at") VALUES(30,'B030',28,NULL,NULL,4,'2026-08-15',9,9,0,140,NULL,NULL,NULL,'2026-08-20 22:28:36');
INSERT INTO "inventory_batches" ("id","batch_code","product_id","purchase_id","purchase_item_id","supplier_id","purchase_date","original_qty","remaining_qty","reserved_qty","unit_cost","expiry_date","production_date","notes","created_at") VALUES(31,'B031',29,NULL,NULL,1,'2026-07-08',3,0,-2,420,NULL,NULL,NULL,'2026-08-20 22:28:36');
INSERT INTO "inventory_batches" ("id","batch_code","product_id","purchase_id","purchase_item_id","supplier_id","purchase_date","original_qty","remaining_qty","reserved_qty","unit_cost","expiry_date","production_date","notes","created_at") VALUES(32,'B032',30,NULL,NULL,2,'2026-07-20',2,2,0,160,NULL,NULL,NULL,'2026-08-20 22:28:36');
INSERT INTO "inventory_batches" ("id","batch_code","product_id","purchase_id","purchase_item_id","supplier_id","purchase_date","original_qty","remaining_qty","reserved_qty","unit_cost","expiry_date","production_date","notes","created_at") VALUES(33,'B033',32,NULL,NULL,3,'2026-08-02',1,1,0,260,NULL,NULL,NULL,'2026-08-20 22:28:36');
CREATE TABLE stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  batch_id INTEGER,
  type TEXT NOT NULL,
  qty INTEGER NOT NULL,
  unit_cost REAL,
  reference_type TEXT,
  reference_id INTEGER,
  notes TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO "stock_movements" ("id","product_id","batch_id","type","qty","unit_cost","reference_type","reference_id","notes","created_by","created_at") VALUES(1,1,1,'in',5,1000,'purchase',1,'استلام PUR-1001',3,'2026-06-12T10:00:00');
INSERT INTO "stock_movements" ("id","product_id","batch_id","type","qty","unit_cost","reference_type","reference_id","notes","created_by","created_at") VALUES(2,1,2,'in',10,1200,'purchase',2,'استلام PUR-1050',3,'2026-07-08T11:00:00');
INSERT INTO "stock_movements" ("id","product_id","batch_id","type","qty","unit_cost","reference_type","reference_id","notes","created_by","created_at") VALUES(3,1,3,'in',5,1400,'purchase',3,'استلام PUR-1100',3,'2026-08-02T09:30:00');
INSERT INTO "stock_movements" ("id","product_id","batch_id","type","qty","unit_cost","reference_type","reference_id","notes","created_by","created_at") VALUES(4,1,1,'out',1,1000,'sale',1,'صرف INV-1020',2,'2026-08-18T11:20:00');
INSERT INTO "stock_movements" ("id","product_id","batch_id","type","qty","unit_cost","reference_type","reference_id","notes","created_by","created_at") VALUES(5,1,1,'reserve',1,1000,'sale',5,'حجز INV-1025',2,'2026-08-21T10:15:00');
INSERT INTO "stock_movements" ("id","product_id","batch_id","type","qty","unit_cost","reference_type","reference_id","notes","created_by","created_at") VALUES(6,29,31,'reserve',1,420,'sale',9,'Reserve INV-1027',1,'2026-09-15 08:29:27');
INSERT INTO "stock_movements" ("id","product_id","batch_id","type","qty","unit_cost","reference_type","reference_id","notes","created_by","created_at") VALUES(7,29,31,'out',1,420,'delivery',9,'Deliver INV-1027',1,'2026-09-15 08:30:50');
INSERT INTO "stock_movements" ("id","product_id","batch_id","type","qty","unit_cost","reference_type","reference_id","notes","created_by","created_at") VALUES(8,29,31,'out',1,420,'delivery',9,'Deliver INV-1027',1,'2026-09-15 08:31:30');
INSERT INTO "stock_movements" ("id","product_id","batch_id","type","qty","unit_cost","reference_type","reference_id","notes","created_by","created_at") VALUES(9,29,31,'out',1,420,'delivery',9,'Deliver INV-1027',1,'2026-09-15 08:31:38');
CREATE TABLE sales_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  date TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'draft',
  delivery_status TEXT,
  customer_id INTEGER,
  customer_name TEXT,
  customer_phone TEXT,
  customer_whatsapp TEXT,
  address TEXT,
  area TEXT,
  delivery_agent_id INTEGER,
  delivery_agent_name TEXT,
  delivery_agent_code TEXT,
  delivery_agent_phone TEXT,
  expected_delivery_time TEXT,
  payment_method TEXT,
  subtotal REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  paid REAL NOT NULL DEFAULT 0,
  remaining REAL NOT NULL DEFAULT 0,
  cost_total REAL NOT NULL DEFAULT 0,
  profit REAL NOT NULL DEFAULT 0,
  due_date TEXT,
  notes TEXT,
  created_by INTEGER,
  completed_at TEXT,
  voided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (delivery_agent_id) REFERENCES delivery_agents(id)
);
INSERT INTO "sales_invoices" ("id","number","date","type","status","delivery_status","customer_id","customer_name","customer_phone","customer_whatsapp","address","area","delivery_agent_id","delivery_agent_name","delivery_agent_code","delivery_agent_phone","expected_delivery_time","payment_method","subtotal","discount","total","paid","remaining","cost_total","profit","due_date","notes","created_by","completed_at","voided_at","created_at","updated_at","deleted_at") VALUES(1,'INV-1020','2026-08-18','normal','completed',NULL,2,'محمود علي','01023456789','01023456789',NULL,'المعادي',NULL,NULL,NULL,NULL,NULL,'cash',1500,0,1500,1500,0,1000,500,NULL,NULL,2,'2026-08-18T11:20:00',NULL,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL);
INSERT INTO "sales_invoices" ("id","number","date","type","status","delivery_status","customer_id","customer_name","customer_phone","customer_whatsapp","address","area","delivery_agent_id","delivery_agent_name","delivery_agent_code","delivery_agent_phone","expected_delivery_time","payment_method","subtotal","discount","total","paid","remaining","cost_total","profit","due_date","notes","created_by","completed_at","voided_at","created_at","updated_at","deleted_at") VALUES(2,'INV-1021','2026-08-19','normal','completed',NULL,3,'فاطمة حسن','01134567890','01134567890',NULL,'مصر الجديدة',NULL,NULL,NULL,NULL,NULL,'vodafone_cash',450,0,450,450,0,280,170,NULL,NULL,2,'2026-08-19T15:10:00',NULL,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL);
INSERT INTO "sales_invoices" ("id","number","date","type","status","delivery_status","customer_id","customer_name","customer_phone","customer_whatsapp","address","area","delivery_agent_id","delivery_agent_name","delivery_agent_code","delivery_agent_phone","expected_delivery_time","payment_method","subtotal","discount","total","paid","remaining","cost_total","profit","due_date","notes","created_by","completed_at","voided_at","created_at","updated_at","deleted_at") VALUES(3,'INV-1022','2026-08-20','delivery','delivered','delivered',5,'ياسر عبدالله','01056789012','01056789012','الحي المتميز - 6 أكتوبر','6 أكتوبر',3,'محمود فتحي','127','01076543210','5:00 PM - 7:00 PM','cash',980,0,980,980,0,700,280,NULL,NULL,2,'2026-08-20T19:40:00',NULL,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL);
INSERT INTO "sales_invoices" ("id","number","date","type","status","delivery_status","customer_id","customer_name","customer_phone","customer_whatsapp","address","area","delivery_agent_id","delivery_agent_name","delivery_agent_code","delivery_agent_phone","expected_delivery_time","payment_method","subtotal","discount","total","paid","remaining","cost_total","profit","due_date","notes","created_by","completed_at","voided_at","created_at","updated_at","deleted_at") VALUES(4,'INV-1024','2026-08-20','normal','completed',NULL,4,'كريم سعد','01245678901','01245678901',NULL,'الهرم',NULL,NULL,NULL,NULL,NULL,'credit',1850,0,1850,0,1850,1225,625,NULL,NULL,2,'2026-08-20T13:00:00',NULL,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL);
INSERT INTO "sales_invoices" ("id","number","date","type","status","delivery_status","customer_id","customer_name","customer_phone","customer_whatsapp","address","area","delivery_agent_id","delivery_agent_name","delivery_agent_code","delivery_agent_phone","expected_delivery_time","payment_method","subtotal","discount","total","paid","remaining","cost_total","profit","due_date","notes","created_by","completed_at","voided_at","created_at","updated_at","deleted_at") VALUES(5,'INV-1025','2026-08-21','delivery','pending_delivery','pending_delivery',1,'أحمد محمد','01012345678','01012345678','مدينة نصر - القاهرة - شارع عباس العقاد','مدينة نصر',1,'محمد علي','125','01098765432','6:00 PM - 8:00 PM','cash',2450,0,2450,0,2450,1230,1220,NULL,NULL,2,NULL,NULL,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL);
INSERT INTO "sales_invoices" ("id","number","date","type","status","delivery_status","customer_id","customer_name","customer_phone","customer_whatsapp","address","area","delivery_agent_id","delivery_agent_name","delivery_agent_code","delivery_agent_phone","expected_delivery_time","payment_method","subtotal","discount","total","paid","remaining","cost_total","profit","due_date","notes","created_by","completed_at","voided_at","created_at","updated_at","deleted_at") VALUES(6,'INV-1026','2026-08-21','delivery','out_for_delivery','out_for_delivery',8,'إسلام فتحي','01089012345','01089012345','طنطا - شارع البحر','طنطا',1,'محمد علي','125','01098765432','4:00 PM - 6:00 PM','instapay',980,0,980,0,980,700,280,NULL,NULL,2,NULL,NULL,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL);
INSERT INTO "sales_invoices" ("id","number","date","type","status","delivery_status","customer_id","customer_name","customer_phone","customer_whatsapp","address","area","delivery_agent_id","delivery_agent_name","delivery_agent_code","delivery_agent_phone","expected_delivery_time","payment_method","subtotal","discount","total","paid","remaining","cost_total","profit","due_date","notes","created_by","completed_at","voided_at","created_at","updated_at","deleted_at") VALUES(7,'INV-1015','2026-08-05','delivery','fully_returned','fully_returned',3,'فاطمة حسن','01134567890','01134567890','مصر الجديدة - شارع الحجاز','مصر الجديدة',2,'أحمد السيد','126','01087654321',NULL,'cash',1250,0,0,0,0,0,0,NULL,NULL,2,'2026-08-05T21:00:00',NULL,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL);
INSERT INTO "sales_invoices" ("id","number","date","type","status","delivery_status","customer_id","customer_name","customer_phone","customer_whatsapp","address","area","delivery_agent_id","delivery_agent_name","delivery_agent_code","delivery_agent_phone","expected_delivery_time","payment_method","subtotal","discount","total","paid","remaining","cost_total","profit","due_date","notes","created_by","completed_at","voided_at","created_at","updated_at","deleted_at") VALUES(8,'INV-1018','2026-08-12','normal','completed',NULL,6,'شركة تك موبايل','01067890123','01067890123','شبرا','شبرا',NULL,NULL,NULL,NULL,NULL,'credit',4200,0,4200,0,4200,3200,1000,NULL,NULL,2,'2026-08-12T12:00:00',NULL,'2026-08-20 22:28:36','2026-08-20 22:28:36',NULL);
INSERT INTO "sales_invoices" ("id","number","date","type","status","delivery_status","customer_id","customer_name","customer_phone","customer_whatsapp","address","area","delivery_agent_id","delivery_agent_name","delivery_agent_code","delivery_agent_phone","expected_delivery_time","payment_method","subtotal","discount","total","paid","remaining","cost_total","profit","due_date","notes","created_by","completed_at","voided_at","created_at","updated_at","deleted_at") VALUES(9,'INV-1027','2026-09-15','delivery','completed','delivered',3,'فاطمة حسن','01134567890','01134567890','شارع الحجاز','مصر الجديدة',1,'محمد علي','125','01098765432',NULL,'cash',650,0,650,1950,0,420,230,NULL,NULL,1,'2026-09-15 08:31:42',NULL,'2026-09-15 08:29:26','2026-09-15 08:29:26',NULL);
CREATE TABLE sales_invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  product_name TEXT,
  sku TEXT,
  quantity INTEGER NOT NULL,
  delivered_qty INTEGER NOT NULL DEFAULT 0,
  returned_qty INTEGER NOT NULL DEFAULT 0,
  unit_price REAL NOT NULL,
  discount REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  unit_cost REAL NOT NULL DEFAULT 0,
  profit REAL NOT NULL DEFAULT 0,
  notes TEXT, item_kind TEXT NOT NULL DEFAULT 'product',
  FOREIGN KEY (invoice_id) REFERENCES sales_invoices(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);
INSERT INTO "sales_invoice_items" ("id","invoice_id","product_id","product_name","sku","quantity","delivered_qty","returned_qty","unit_price","discount","total","unit_cost","profit","notes","item_kind") VALUES(1,1,1,'شاشة iPhone 13','LCD-IP13',1,1,0,1500,0,1500,1000,500,NULL,'product');
INSERT INTO "sales_invoice_items" ("id","invoice_id","product_id","product_name","sku","quantity","delivered_qty","returned_qty","unit_price","discount","total","unit_cost","profit","notes","item_kind") VALUES(2,2,5,'بطارية iPhone 13','BAT-IP13',1,1,0,450,0,450,280,170,NULL,'product');
INSERT INTO "sales_invoice_items" ("id","invoice_id","product_id","product_name","sku","quantity","delivered_qty","returned_qty","unit_price","discount","total","unit_cost","profit","notes","item_kind") VALUES(3,3,4,'شاشة Samsung A54','LCD-A54',1,1,0,980,0,980,700,280,NULL,'product');
INSERT INTO "sales_invoice_items" ("id","invoice_id","product_id","product_name","sku","quantity","delivered_qty","returned_qty","unit_price","discount","total","unit_cost","profit","notes","item_kind") VALUES(4,4,2,'شاشة iPhone 12','LCD-IP12',1,1,0,1250,0,1250,950,300,NULL,'product');
INSERT INTO "sales_invoice_items" ("id","invoice_id","product_id","product_name","sku","quantity","delivered_qty","returned_qty","unit_price","discount","total","unit_cost","profit","notes","item_kind") VALUES(5,4,24,'جراب iPhone 13','CASE-IP13',2,2,0,75,0,150,25,100,NULL,'product');
INSERT INTO "sales_invoice_items" ("id","invoice_id","product_id","product_name","sku","quantity","delivered_qty","returned_qty","unit_price","discount","total","unit_cost","profit","notes","item_kind") VALUES(6,4,26,'استكر حماية iPhone 13','GLS-IP13',2,2,0,35,0,70,8,54,NULL,'product');
INSERT INTO "sales_invoice_items" ("id","invoice_id","product_id","product_name","sku","quantity","delivered_qty","returned_qty","unit_price","discount","total","unit_cost","profit","notes","item_kind") VALUES(7,5,1,'شاشة iPhone 13','LCD-IP13',1,0,0,1500,0,1500,1000,500,NULL,'product');
INSERT INTO "sales_invoice_items" ("id","invoice_id","product_id","product_name","sku","quantity","delivered_qty","returned_qty","unit_price","discount","total","unit_cost","profit","notes","item_kind") VALUES(8,5,6,'بطارية Samsung A54','BAT-A54',1,0,0,320,0,320,180,140,NULL,'product');
INSERT INTO "sales_invoice_items" ("id","invoice_id","product_id","product_name","sku","quantity","delivered_qty","returned_qty","unit_price","discount","total","unit_cost","profit","notes","item_kind") VALUES(9,5,24,'جراب iPhone 13','CASE-IP13',2,0,0,75,0,150,25,100,NULL,'product');
INSERT INTO "sales_invoice_items" ("id","invoice_id","product_id","product_name","sku","quantity","delivered_qty","returned_qty","unit_price","discount","total","unit_cost","profit","notes","item_kind") VALUES(10,6,4,'شاشة Samsung A54','LCD-A54',1,0,0,980,0,980,700,280,NULL,'product');
INSERT INTO "sales_invoice_items" ("id","invoice_id","product_id","product_name","sku","quantity","delivered_qty","returned_qty","unit_price","discount","total","unit_cost","profit","notes","item_kind") VALUES(11,7,2,'شاشة iPhone 12','LCD-IP12',1,0,1,1250,0,0,950,0,NULL,'product');
INSERT INTO "sales_invoice_items" ("id","invoice_id","product_id","product_name","sku","quantity","delivered_qty","returned_qty","unit_price","discount","total","unit_cost","profit","notes","item_kind") VALUES(12,8,1,'شاشة iPhone 13','LCD-IP13',2,2,0,1350,0,2700,1000,700,NULL,'product');
INSERT INTO "sales_invoice_items" ("id","invoice_id","product_id","product_name","sku","quantity","delivered_qty","returned_qty","unit_price","discount","total","unit_cost","profit","notes","item_kind") VALUES(13,8,3,'شاشة iPhone 14','LCD-IP14',1,1,0,1850,0,1500,1600,250,NULL,'product');
INSERT INTO "sales_invoice_items" ("id","invoice_id","product_id","product_name","sku","quantity","delivered_qty","returned_qty","unit_price","discount","total","unit_cost","profit","notes","item_kind") VALUES(14,9,29,'شاشة Nokia G21','LCD-G21',1,1,0,650,0,650,420,230,NULL,'product');
CREATE TABLE sales_item_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_item_id INTEGER NOT NULL,
  batch_id INTEGER NOT NULL,
  qty INTEGER NOT NULL,
  unit_cost REAL NOT NULL,
  FOREIGN KEY (invoice_item_id) REFERENCES sales_invoice_items(id),
  FOREIGN KEY (batch_id) REFERENCES inventory_batches(id)
);
INSERT INTO "sales_item_batches" ("id","invoice_item_id","batch_id","qty","unit_cost") VALUES(1,1,1,1,1000);
INSERT INTO "sales_item_batches" ("id","invoice_item_id","batch_id","qty","unit_cost") VALUES(2,2,8,1,280);
INSERT INTO "sales_item_batches" ("id","invoice_item_id","batch_id","qty","unit_cost") VALUES(3,3,6,1,700);
INSERT INTO "sales_item_batches" ("id","invoice_item_id","batch_id","qty","unit_cost") VALUES(4,4,4,1,950);
INSERT INTO "sales_item_batches" ("id","invoice_item_id","batch_id","qty","unit_cost") VALUES(5,5,9,2,25);
INSERT INTO "sales_item_batches" ("id","invoice_item_id","batch_id","qty","unit_cost") VALUES(6,7,1,1,1000);
INSERT INTO "sales_item_batches" ("id","invoice_item_id","batch_id","qty","unit_cost") VALUES(7,8,7,1,180);
INSERT INTO "sales_item_batches" ("id","invoice_item_id","batch_id","qty","unit_cost") VALUES(8,9,9,2,25);
INSERT INTO "sales_item_batches" ("id","invoice_item_id","batch_id","qty","unit_cost") VALUES(9,10,6,1,700);
INSERT INTO "sales_item_batches" ("id","invoice_item_id","batch_id","qty","unit_cost") VALUES(10,12,1,2,1000);
INSERT INTO "sales_item_batches" ("id","invoice_item_id","batch_id","qty","unit_cost") VALUES(11,14,31,1,420);
CREATE TABLE payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER,
  customer_id INTEGER,
  method TEXT NOT NULL,
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  notes TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  voided_at TEXT
);
INSERT INTO "payments" ("id","invoice_id","customer_id","method","amount","date","notes","created_by","created_at","voided_at") VALUES(1,1,2,'cash',1500,'2026-08-18',NULL,2,'2026-08-20 22:28:36',NULL);
INSERT INTO "payments" ("id","invoice_id","customer_id","method","amount","date","notes","created_by","created_at","voided_at") VALUES(2,2,3,'vodafone_cash',450,'2026-08-19',NULL,2,'2026-08-20 22:28:36',NULL);
INSERT INTO "payments" ("id","invoice_id","customer_id","method","amount","date","notes","created_by","created_at","voided_at") VALUES(3,3,5,'cash',980,'2026-08-20',NULL,2,'2026-08-20 22:28:36',NULL);
INSERT INTO "payments" ("id","invoice_id","customer_id","method","amount","date","notes","created_by","created_at","voided_at") VALUES(4,9,3,'cash',650,'2026-09-15','delivery collection',1,'2026-09-15 08:30:50',NULL);
INSERT INTO "payments" ("id","invoice_id","customer_id","method","amount","date","notes","created_by","created_at","voided_at") VALUES(5,9,3,'cash',650,'2026-09-15','delivery collection',1,'2026-09-15 08:31:30',NULL);
INSERT INTO "payments" ("id","invoice_id","customer_id","method","amount","date","notes","created_by","created_at","voided_at") VALUES(6,9,3,'cash',650,'2026-09-15','delivery collection',1,'2026-09-15 08:31:38',NULL);
CREATE TABLE sales_returns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  invoice_id INTEGER NOT NULL,
  customer_id INTEGER,
  date TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  total REAL NOT NULL DEFAULT 0,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (invoice_id) REFERENCES sales_invoices(id)
);
CREATE TABLE sales_return_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  return_id INTEGER NOT NULL,
  invoice_item_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  qty INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  total REAL NOT NULL,
  batch_id INTEGER,
  FOREIGN KEY (return_id) REFERENCES sales_returns(id)
);
CREATE TABLE delivery_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  result_type TEXT NOT NULL,
  notes TEXT,
  customer_notes TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (invoice_id) REFERENCES sales_invoices(id)
);
INSERT INTO "delivery_results" ("id","invoice_id","result_type","notes","customer_notes","created_by","created_at") VALUES(1,9,'full_delivery',NULL,NULL,1,'2026-09-15 08:30:50');
INSERT INTO "delivery_results" ("id","invoice_id","result_type","notes","customer_notes","created_by","created_at") VALUES(2,9,'full_delivery',NULL,NULL,1,'2026-09-15 08:31:30');
INSERT INTO "delivery_results" ("id","invoice_id","result_type","notes","customer_notes","created_by","created_at") VALUES(3,9,'full_delivery',NULL,NULL,1,'2026-09-15 08:31:38');
CREATE TABLE expense_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);
INSERT INTO "expense_categories" ("id","name_ar","name_en","active") VALUES(1,'إيجار','Rent',1);
INSERT INTO "expense_categories" ("id","name_ar","name_en","active") VALUES(2,'كهرباء','Electricity',1);
INSERT INTO "expense_categories" ("id","name_ar","name_en","active") VALUES(3,'انتقالات','Transportation',1);
INSERT INTO "expense_categories" ("id","name_ar","name_en","active") VALUES(4,'توصيل','Delivery',1);
INSERT INTO "expense_categories" ("id","name_ar","name_en","active") VALUES(5,'مرتبات','Salaries',1);
INSERT INTO "expense_categories" ("id","name_ar","name_en","active") VALUES(6,'صيانة','Maintenance',1);
INSERT INTO "expense_categories" ("id","name_ar","name_en","active") VALUES(7,'أخرى','Other',1);
CREATE TABLE expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  description TEXT,
  user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  voided_at TEXT,
  FOREIGN KEY (category_id) REFERENCES expense_categories(id)
);
INSERT INTO "expenses" ("id","category_id","amount","date","description","user_id","created_at","voided_at") VALUES(1,1,8000,'2026-08-01','إيجار المحل - أغسطس',5,'2026-08-20 22:28:36',NULL);
INSERT INTO "expenses" ("id","category_id","amount","date","description","user_id","created_at","voided_at") VALUES(2,2,950,'2026-08-08','فاتورة الكهرباء',5,'2026-08-20 22:28:36',NULL);
INSERT INTO "expenses" ("id","category_id","amount","date","description","user_id","created_at","voided_at") VALUES(3,4,600,'2026-08-18','عمولة توصيل أسبوعية',5,'2026-08-20 22:28:36',NULL);
INSERT INTO "expenses" ("id","category_id","amount","date","description","user_id","created_at","voided_at") VALUES(4,5,12000,'2026-08-01','مرتبات أغسطس',1,'2026-08-20 22:28:36',NULL);
INSERT INTO "expenses" ("id","category_id","amount","date","description","user_id","created_at","voided_at") VALUES(5,3,250,'2026-08-21','انتقالات استلام بضاعة',3,'2026-08-20 22:28:36',NULL);
CREATE TABLE whatsapp_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  body_ar TEXT NOT NULL,
  body_en TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO "whatsapp_templates" ("id","code","name_ar","name_en","body_ar","body_en","active","updated_at") VALUES(1,'invoice_created','إنشاء فاتورة','Invoice Created',replace(replace('أهلاً بك يا {{customer_name}} 👋\r\n\r\nتم تسجيل طلبك من {{store_name}}.\r\n\r\nرقم الفاتورة:\r\n{{invoice_number}}\r\n\r\nالمنتجات:\r\n{{products}}\r\n\r\nإجمالي الفاتورة:\r\n{{total}} جنيه\r\n\r\nنوع الطلب:\r\n{{order_type}}\r\n{{agent_block}}{{time_block}}{{address_block}}\r\nشكرًا لتعاملك مع {{store_name}} ❤️','\r',char(13)),'\n',char(10)),replace(replace('Hello {{customer_name}} 👋\r\n\r\nYour order has been registered at {{store_name}}.\r\n\r\nInvoice:\r\n{{invoice_number}}\r\n\r\nProducts:\r\n{{products}}\r\n\r\nTotal:\r\n{{total}} EGP\r\n\r\nOrder type:\r\n{{order_type}}\r\n{{agent_block}}{{time_block}}{{address_block}}\r\nThank you for choosing {{store_name}} ❤️','\r',char(13)),'\n',char(10)),1,'2026-08-20 22:28:36');
INSERT INTO "whatsapp_templates" ("id","code","name_ar","name_en","body_ar","body_en","active","updated_at") VALUES(2,'out_for_delivery','خرج للتوصيل','Out for Delivery',replace(replace('أهلاً {{customer_name}} 👋\r\n\r\nطلبك رقم {{invoice_number}} خرج الآن مع التيار {{agent_name}} ({{agent_code}}).\r\n{{time_block}}\r\n{{address_block}}\r\nللمتابعة: {{agent_phone}}\r\n\r\n{{store_name}}','\r',char(13)),'\n',char(10)),replace(replace('Hello {{customer_name}} 👋\r\n\r\nOrder {{invoice_number}} is now out for delivery with {{agent_name}} ({{agent_code}}).\r\n{{time_block}}\r\n{{address_block}}\r\nContact: {{agent_phone}}\r\n\r\n{{store_name}}','\r',char(13)),'\n',char(10)),1,'2026-08-20 22:28:36');
INSERT INTO "whatsapp_templates" ("id","code","name_ar","name_en","body_ar","body_en","active","updated_at") VALUES(3,'delivered','تم التسليم','Delivered',replace(replace('تم تسليم طلبك رقم {{invoice_number}} بنجاح ✅\r\n\r\nشكرًا لتعاملك مع {{store_name}} ❤️','\r',char(13)),'\n',char(10)),replace(replace('Your order {{invoice_number}} was delivered successfully ✅\r\n\r\nThank you for choosing {{store_name}} ❤️','\r',char(13)),'\n',char(10)),1,'2026-08-20 22:28:36');
INSERT INTO "whatsapp_templates" ("id","code","name_ar","name_en","body_ar","body_en","active","updated_at") VALUES(4,'partial_delivery','تسليم جزئي','Partial Delivery',replace(replace('أهلاً {{customer_name}}\r\n\r\nتم تسليم جزء من طلبك رقم {{invoice_number}}.\r\n\r\nالمنتجات:\r\n{{products}}\r\n\r\nالإجمالي النهائي:\r\n{{total}} جنيه\r\n\r\n{{store_name}}','\r',char(13)),'\n',char(10)),replace(replace('Hello {{customer_name}}\r\n\r\nPart of order {{invoice_number}} was delivered.\r\n\r\nItems:\r\n{{products}}\r\n\r\nFinal total:\r\n{{total}} EGP\r\n\r\n{{store_name}}','\r',char(13)),'\n',char(10)),1,'2026-08-20 22:28:36');
INSERT INTO "whatsapp_templates" ("id","code","name_ar","name_en","body_ar","body_en","active","updated_at") VALUES(5,'returned','مرتجع','Returned',replace(replace('تم تحديث طلبك رقم {{invoice_number}}.\r\n\r\nالحالة: مرتجع\r\n{{products}}\r\n\r\n{{store_name}}','\r',char(13)),'\n',char(10)),replace(replace('Your order {{invoice_number}} was updated.\r\n\r\nStatus: Returned\r\n{{products}}\r\n\r\n{{store_name}}','\r',char(13)),'\n',char(10)),1,'2026-08-20 22:28:36');
CREATE TABLE whatsapp_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER,
  customer_id INTEGER,
  user_id INTEGER,
  message_type TEXT NOT NULL,
  phone TEXT,
  message TEXT,
  marked_sent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  user_name TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO "audit_logs" ("id","user_id","user_name","action","entity_type","entity_id","details","created_at") VALUES(1,3,'خالد منصور','purchase','purchase',3,'اعتماد فاتورة شراء PUR-1100','2026-08-02T09:30:00');
INSERT INTO "audit_logs" ("id","user_id","user_name","action","entity_type","entity_id","details","created_at") VALUES(2,2,'سارة أحمد','create_invoice','invoice',5,'إنشاء فاتورة توصيل INV-1025','2026-08-21T10:15:00');
INSERT INTO "audit_logs" ("id","user_id","user_name","action","entity_type","entity_id","details","created_at") VALUES(3,2,'سارة أحمد','create_invoice','invoice',1,'بيع نقدي INV-1020','2026-08-18T11:20:00');
INSERT INTO "audit_logs" ("id","user_id","user_name","action","entity_type","entity_id","details","created_at") VALUES(4,1,'مدير النظام','create_invoice','invoice',9,'Create INV-1027','2026-09-15 08:29:27');
INSERT INTO "audit_logs" ("id","user_id","user_name","action","entity_type","entity_id","details","created_at") VALUES(5,1,'مدير النظام','delivery_status','invoice',9,'out_for_delivery','2026-09-15 08:30:23');
INSERT INTO "audit_logs" ("id","user_id","user_name","action","entity_type","entity_id","details","created_at") VALUES(6,1,'مدير النظام','delivery_status','invoice',9,'full_delivery INV-1027','2026-09-15 08:30:51');
INSERT INTO "audit_logs" ("id","user_id","user_name","action","entity_type","entity_id","details","created_at") VALUES(7,1,'مدير النظام','delivery_status','invoice',9,'full_delivery INV-1027','2026-09-15 08:31:30');
INSERT INTO "audit_logs" ("id","user_id","user_name","action","entity_type","entity_id","details","created_at") VALUES(8,1,'مدير النظام','delivery_status','invoice',9,'full_delivery INV-1027','2026-09-15 08:31:38');
INSERT INTO "audit_logs" ("id","user_id","user_name","action","entity_type","entity_id","details","created_at") VALUES(9,1,'مدير النظام','complete_delivery','invoice',9,'Complete INV-1027','2026-09-15 08:31:42');
INSERT INTO "audit_logs" ("id","user_id","user_name","action","entity_type","entity_id","details","created_at") VALUES(10,1,'مدير النظام','payroll_run','payroll',1,'2026-09','2026-09-15 17:44:42');
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  type TEXT NOT NULL,
  title_ar TEXT NOT NULL,
  title_en TEXT NOT NULL,
  body_ar TEXT,
  body_en TEXT,
  entity_type TEXT,
  entity_id INTEGER,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO "notifications" ("id","user_id","type","title_ar","title_en","body_ar","body_en","entity_type","entity_id","read_at","created_at") VALUES(1,NULL,'new_delivery','طلب توصيل جديد','New delivery order','فاتورة INV-1025 بانتظار التوصيل مع محمد علي','Invoice INV-1025 pending delivery with Mohamed Ali','invoice',5,NULL,'2026-08-20 22:28:36');
INSERT INTO "notifications" ("id","user_id","type","title_ar","title_en","body_ar","body_en","entity_type","entity_id","read_at","created_at") VALUES(2,NULL,'low_stock','مخزون منخفض','Low stock','بطارية Vivo Y22 وصلت للحد الأدنى','Vivo Y22 battery is at minimum stock','product',30,NULL,'2026-08-20 22:28:36');
INSERT INTO "notifications" ("id","user_id","type","title_ar","title_en","body_ar","body_en","entity_type","entity_id","read_at","created_at") VALUES(3,NULL,'out_of_stock','صنف نافد','Out of stock','شاشة Redmi Note 13 نافدة من المخزن','Redmi Note 13 LCD is out of stock','product',31,NULL,'2026-08-20 22:28:36');
INSERT INTO "notifications" ("id","user_id","type","title_ar","title_en","body_ar","body_en","entity_type","entity_id","read_at","created_at") VALUES(4,NULL,'credit_due','فاتورة آجلة','Credit invoice','كريم سعد - متبقي 1,850 جنيه على INV-1024','Karim Saad still owes 1,850 EGP on INV-1024','invoice',4,NULL,'2026-08-20 22:28:36');
INSERT INTO "notifications" ("id","user_id","type","title_ar","title_en","body_ar","body_en","entity_type","entity_id","read_at","created_at") VALUES(5,NULL,'new_delivery','طلب توصيل جديد','New delivery order','INV-1027 — 650 EGP','INV-1027 — 650 EGP','invoice',9,NULL,'2026-09-15 08:29:27');
INSERT INTO "notifications" ("id","user_id","type","title_ar","title_en","body_ar","body_en","entity_type","entity_id","read_at","created_at") VALUES(6,NULL,'low_stock','مخزون منخفض','Low stock','شاشة Nokia G21 وصل للحد الأدنى','LCD Nokia G21 reached minimum stock','product',29,NULL,'2026-09-15 08:30:50');
INSERT INTO "notifications" ("id","user_id","type","title_ar","title_en","body_ar","body_en","entity_type","entity_id","read_at","created_at") VALUES(7,NULL,'delivery_completed','اكتمل التوصيل','Delivery updated','INV-1027 — delivered','INV-1027 — delivered','invoice',9,NULL,'2026-09-15 08:30:51');
INSERT INTO "notifications" ("id","user_id","type","title_ar","title_en","body_ar","body_en","entity_type","entity_id","read_at","created_at") VALUES(8,NULL,'low_stock','مخزون منخفض','Low stock','شاشة Nokia G21 وصل للحد الأدنى','LCD Nokia G21 reached minimum stock','product',29,NULL,'2026-09-15 08:31:30');
INSERT INTO "notifications" ("id","user_id","type","title_ar","title_en","body_ar","body_en","entity_type","entity_id","read_at","created_at") VALUES(9,NULL,'delivery_completed','اكتمل التوصيل','Delivery updated','INV-1027 — delivered','INV-1027 — delivered','invoice',9,NULL,'2026-09-15 08:31:30');
INSERT INTO "notifications" ("id","user_id","type","title_ar","title_en","body_ar","body_en","entity_type","entity_id","read_at","created_at") VALUES(10,NULL,'low_stock','مخزون منخفض','Low stock','شاشة Nokia G21 وصل للحد الأدنى','LCD Nokia G21 reached minimum stock','product',29,NULL,'2026-09-15 08:31:38');
INSERT INTO "notifications" ("id","user_id","type","title_ar","title_en","body_ar","body_en","entity_type","entity_id","read_at","created_at") VALUES(11,NULL,'delivery_completed','اكتمل التوصيل','Delivery updated','INV-1027 — delivered','INV-1027 — delivered','invoice',9,NULL,'2026-09-15 08:31:38');
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
INSERT INTO "settings" ("key","value") VALUES('store_name','PIXEL');
INSERT INTO "settings" ("key","value") VALUES('store_name_ar','بiksel - قطع غيار الموبايلات');
INSERT INTO "settings" ("key","value") VALUES('store_address','شارع عباس العقاد - مدينة نصر - القاهرة');
INSERT INTO "settings" ("key","value") VALUES('store_phone','01000001111');
INSERT INTO "settings" ("key","value") VALUES('currency','EGP');
INSERT INTO "settings" ("key","value") VALUES('language','ar');
INSERT INTO "settings" ("key","value") VALUES('invoice_prefix','INV');
INSERT INTO "settings" ("key","value") VALUES('invoice_footer','شكراً لتعاملكم مع PIXEL - ضمان القطع حسب سياسة المحل');
INSERT INTO "settings" ("key","value") VALUES('tax_enabled','0');
INSERT INTO "settings" ("key","value") VALUES('whatsapp_enabled','1');
INSERT INTO "settings" ("key","value") VALUES('default_delivery_time','6:00 PM - 8:00 PM');
INSERT INTO "settings" ("key","value") VALUES('logo_url','');
INSERT INTO "settings" ("key","value") VALUES('workplace_lat','30.0566');
INSERT INTO "settings" ("key","value") VALUES('workplace_lng','31.3300');
INSERT INTO "settings" ("key","value") VALUES('geofence_meters','100');
INSERT INTO "settings" ("key","value") VALUES('shift_start','09:00');
CREATE TABLE sequences (
  name TEXT PRIMARY KEY,
  prefix TEXT NOT NULL,
  next_number INTEGER NOT NULL DEFAULT 1
);
INSERT INTO "sequences" ("name","prefix","next_number") VALUES('sales','INV',1028);
INSERT INTO "sequences" ("name","prefix","next_number") VALUES('purchase','PUR',1141);
INSERT INTO "sequences" ("name","prefix","next_number") VALUES('return','RET',1003);
INSERT INTO "sequences" ("name","prefix","next_number") VALUES('batch','B',34);
CREATE TABLE agent_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  accuracy REAL,
  heading REAL,
  speed REAL,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (agent_id) REFERENCES delivery_agents(id)
);
INSERT INTO "agent_locations" ("id","agent_id","lat","lng","accuracy","heading","speed","recorded_at") VALUES(1,1,30.0566,31.33,12,NULL,NULL,'2026-09-15 17:27:55');
INSERT INTO "agent_locations" ("id","agent_id","lat","lng","accuracy","heading","speed","recorded_at") VALUES(2,1,30.0574,31.3291,10,NULL,NULL,'2026-09-15 17:31:55');
INSERT INTO "agent_locations" ("id","agent_id","lat","lng","accuracy","heading","speed","recorded_at") VALUES(3,1,30.0581,31.3284,8,NULL,NULL,'2026-09-15 17:39:55');
INSERT INTO "agent_locations" ("id","agent_id","lat","lng","accuracy","heading","speed","recorded_at") VALUES(4,2,29.962,31.259,15,NULL,NULL,'2026-09-15 17:30:55');
INSERT INTO "agent_locations" ("id","agent_id","lat","lng","accuracy","heading","speed","recorded_at") VALUES(5,2,29.9602,31.2569,11,NULL,NULL,'2026-09-15 17:39:55');
INSERT INTO "agent_locations" ("id","agent_id","lat","lng","accuracy","heading","speed","recorded_at") VALUES(6,3,29.976,30.947,18,NULL,NULL,'2026-09-15 17:32:55');
INSERT INTO "agent_locations" ("id","agent_id","lat","lng","accuracy","heading","speed","recorded_at") VALUES(7,3,29.9741,30.9436,14,NULL,NULL,'2026-09-15 17:39:55');
CREATE TABLE employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  job_title TEXT,
  department TEXT,
  hire_date TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  work_type TEXT NOT NULL DEFAULT 'office',
  user_id INTEGER,
  delivery_agent_id INTEGER,
  basic_salary REAL NOT NULL DEFAULT 0,
  allowances REAL NOT NULL DEFAULT 0,
  national_id TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (delivery_agent_id) REFERENCES delivery_agents(id)
);
INSERT INTO "employees" ("id","code","name","phone","job_title","department","hire_date","status","work_type","user_id","delivery_agent_id","basic_salary","allowances","national_id","notes","created_at","updated_at","deleted_at") VALUES(1,'EMP-001','مدير النظام','01000000001','مدير','الإدارة','2024-01-01','active','office',1,NULL,12000,2000,NULL,NULL,'2026-09-15 17:39:55','2026-09-15 17:39:55',NULL);
INSERT INTO "employees" ("id","code","name","phone","job_title","department","hire_date","status","work_type","user_id","delivery_agent_id","basic_salary","allowances","national_id","notes","created_at","updated_at","deleted_at") VALUES(2,'EMP-002','سارة أحمد','01000000002','مبيعات','المبيعات','2024-03-01','active','office',2,NULL,7000,500,NULL,NULL,'2026-09-15 17:39:55','2026-09-15 17:39:55',NULL);
INSERT INTO "employees" ("id","code","name","phone","job_title","department","hire_date","status","work_type","user_id","delivery_agent_id","basic_salary","allowances","national_id","notes","created_at","updated_at","deleted_at") VALUES(3,'EMP-003','خالد منصور','01000000003','أمين مخزن','المخزن','2024-02-15','active','office',3,NULL,6500,400,NULL,NULL,'2026-09-15 17:39:55','2026-09-15 17:39:55',NULL);
INSERT INTO "employees" ("id","code","name","phone","job_title","department","hire_date","status","work_type","user_id","delivery_agent_id","basic_salary","allowances","national_id","notes","created_at","updated_at","deleted_at") VALUES(4,'EMP-004','محمد علي','01098765432','مندوب توصيل','التوصيل','2024-04-01','active','delivery',4,1,5500,800,NULL,NULL,'2026-09-15 17:39:55','2026-09-15 17:39:55',NULL);
INSERT INTO "employees" ("id","code","name","phone","job_title","department","hire_date","status","work_type","user_id","delivery_agent_id","basic_salary","allowances","national_id","notes","created_at","updated_at","deleted_at") VALUES(5,'EMP-005','منى حسن','01000000005','محاسبة','الحسابات','2024-01-10','active','office',5,NULL,8000,600,NULL,NULL,'2026-09-15 17:39:55','2026-09-15 17:39:55',NULL);
INSERT INTO "employees" ("id","code","name","phone","job_title","department","hire_date","status","work_type","user_id","delivery_agent_id","basic_salary","allowances","national_id","notes","created_at","updated_at","deleted_at") VALUES(6,'EMP-006','أحمد السيد','01087654321','مندوب توصيل','التوصيل','2024-05-01','active','delivery',NULL,2,5000,700,NULL,NULL,'2026-09-15 17:39:55','2026-09-15 17:39:55',NULL);
INSERT INTO "employees" ("id","code","name","phone","job_title","department","hire_date","status","work_type","user_id","delivery_agent_id","basic_salary","allowances","national_id","notes","created_at","updated_at","deleted_at") VALUES(7,'EMP-007','محمود فتحي','01076543210','مندوب توصيل','التوصيل','2024-06-01','active','delivery',NULL,3,5000,700,NULL,NULL,'2026-09-15 17:39:55','2026-09-15 17:39:55',NULL);
CREATE TABLE attendance_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  work_date TEXT NOT NULL,
  clock_in_at TEXT NOT NULL,
  clock_out_at TEXT,
  clock_in_lat REAL,
  clock_in_lng REAL,
  clock_out_lat REAL,
  clock_out_lng REAL,
  distance_in REAL,
  outside_seconds INTEGER NOT NULL DEFAULT 0,
  currently_outside INTEGER NOT NULL DEFAULT 0,
  outside_started_at TEXT,
  work_seconds INTEGER NOT NULL DEFAULT 0,
  late INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);
INSERT INTO "attendance_sessions" ("id","employee_id","work_date","clock_in_at","clock_out_at","clock_in_lat","clock_in_lng","clock_out_lat","clock_out_lng","distance_in","outside_seconds","currently_outside","outside_started_at","work_seconds","late","status","created_at") VALUES(1,2,'2026-09-14','2026-09-14 09:00:00','2026-09-14 17:00:00',30.0566,31.33,30.0566,31.33,12,0,0,NULL,28800,0,'closed','2026-09-15 17:39:55');
INSERT INTO "attendance_sessions" ("id","employee_id","work_date","clock_in_at","clock_out_at","clock_in_lat","clock_in_lng","clock_out_lat","clock_out_lng","distance_in","outside_seconds","currently_outside","outside_started_at","work_seconds","late","status","created_at") VALUES(2,3,'2026-09-14','2026-09-14 09:20:00','2026-09-14 17:00:00',30.0567,31.3301,30.0566,31.33,18,420,0,NULL,27480,1,'closed','2026-09-15 17:39:55');
INSERT INTO "attendance_sessions" ("id","employee_id","work_date","clock_in_at","clock_out_at","clock_in_lat","clock_in_lng","clock_out_lat","clock_out_lng","distance_in","outside_seconds","currently_outside","outside_started_at","work_seconds","late","status","created_at") VALUES(3,5,'2026-09-14','2026-09-14 09:00:00','2026-09-14 17:00:00',30.0566,31.33,30.0566,31.33,9,0,0,NULL,28800,0,'closed','2026-09-15 17:39:55');
CREATE TABLE attendance_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  lat REAL,
  lng REAL,
  distance_m REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES attendance_sessions(id),
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);
INSERT INTO "attendance_events" ("id","session_id","employee_id","type","lat","lng","distance_m","created_at") VALUES(1,2,3,'in',30.0567,31.3301,18,'2026-09-14 09:20:00');
INSERT INTO "attendance_events" ("id","session_id","employee_id","type","lat","lng","distance_m","created_at") VALUES(2,2,3,'left_zone',30.0578,31.3318,175,'2026-09-14 13:00:00');
INSERT INTO "attendance_events" ("id","session_id","employee_id","type","lat","lng","distance_m","created_at") VALUES(3,2,3,'return_zone',30.0566,31.33,8,'2026-09-14 13:07:00');
INSERT INTO "attendance_events" ("id","session_id","employee_id","type","lat","lng","distance_m","created_at") VALUES(4,2,3,'out',30.0566,31.33,10,'2026-09-14 17:00:00');
CREATE TABLE payroll_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_by INTEGER,
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO "payroll_runs" ("id","month","status","notes","created_by","paid_at","created_at") VALUES(1,'2026-09','draft',NULL,1,NULL,'2026-09-15 17:44:42');
CREATE TABLE payslips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,
  basic REAL NOT NULL DEFAULT 0,
  allowances REAL NOT NULL DEFAULT 0,
  present_days INTEGER NOT NULL DEFAULT 0,
  absent_days INTEGER NOT NULL DEFAULT 0,
  late_days INTEGER NOT NULL DEFAULT 0,
  outside_minutes INTEGER NOT NULL DEFAULT 0,
  deductions REAL NOT NULL DEFAULT 0,
  net REAL NOT NULL DEFAULT 0,
  expense_id INTEGER,
  notes TEXT,
  FOREIGN KEY (run_id) REFERENCES payroll_runs(id),
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);
INSERT INTO "payslips" ("id","run_id","employee_id","basic","allowances","present_days","absent_days","late_days","outside_minutes","deductions","net","expense_id","notes") VALUES(1,1,1,12000,2000,0,26,0,0,10400,3600,NULL,NULL);
INSERT INTO "payslips" ("id","run_id","employee_id","basic","allowances","present_days","absent_days","late_days","outside_minutes","deductions","net","expense_id","notes") VALUES(2,1,2,7000,500,1,25,0,0,5833.33,1666.67,NULL,NULL);
INSERT INTO "payslips" ("id","run_id","employee_id","basic","allowances","present_days","absent_days","late_days","outside_minutes","deductions","net","expense_id","notes") VALUES(3,1,3,6500,400,1,25,1,7,5416.67,1483.33,NULL,NULL);
INSERT INTO "payslips" ("id","run_id","employee_id","basic","allowances","present_days","absent_days","late_days","outside_minutes","deductions","net","expense_id","notes") VALUES(4,1,4,5500,800,0,26,0,0,4766.67,1533.33,NULL,NULL);
INSERT INTO "payslips" ("id","run_id","employee_id","basic","allowances","present_days","absent_days","late_days","outside_minutes","deductions","net","expense_id","notes") VALUES(5,1,5,8000,600,1,25,0,0,6666.67,1933.33,NULL,NULL);
INSERT INTO "payslips" ("id","run_id","employee_id","basic","allowances","present_days","absent_days","late_days","outside_minutes","deductions","net","expense_id","notes") VALUES(6,1,6,5000,700,0,26,0,0,4333.33,1366.67,NULL,NULL);
INSERT INTO "payslips" ("id","run_id","employee_id","basic","allowances","present_days","absent_days","late_days","outside_minutes","deductions","net","expense_id","notes") VALUES(7,1,7,5000,700,0,26,0,0,4333.33,1366.67,NULL,NULL);
DELETE FROM sqlite_sequence;
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('d1_migrations',3);
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('roles',5);
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('permissions',43);
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('users',5);
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('brands',8);
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('part_types',15);
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('categories',13);
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('device_models',20);
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('storage_locations',5);
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('suppliers',5);
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('customers',8);
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('delivery_agents',3);
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('payment_methods',8);
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('expense_categories',7);
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('products',35);
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('purchase_invoices',5);
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('purchase_invoice_items',10);
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('inventory_batches',33);
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('sales_invoices',9);
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('sales_invoice_items',14);
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('sales_item_batches',11);
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('payments',6);
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('expenses',5);
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('whatsapp_templates',5);
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('notifications',11);
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('audit_logs',10);
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('stock_movements',9);
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('sessions',10);
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('delivery_results',3);
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('employees',7);
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('agent_locations',7);
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('attendance_sessions',3);
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('attendance_events',4);
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('payroll_runs',1);
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('payslips',7);
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_barcode ON products(barcode);
CREATE INDEX idx_products_part ON products(part_number);
CREATE INDEX idx_products_brand ON products(brand_id);
CREATE INDEX idx_products_type ON products(part_type_id);
CREATE INDEX idx_products_name_ar ON products(name_ar);
CREATE INDEX idx_products_name_en ON products(name_en);
CREATE INDEX idx_products_active ON products(active);
CREATE INDEX idx_models_brand ON device_models(brand_id);
CREATE INDEX idx_models_name ON device_models(name);
CREATE INDEX idx_pm_model ON product_models(model_id);
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_name ON customers(name);
CREATE INDEX idx_invoices_number ON sales_invoices(number);
CREATE INDEX idx_invoices_status ON sales_invoices(status);
CREATE INDEX idx_invoices_delivery ON sales_invoices(delivery_status);
CREATE INDEX idx_invoices_customer ON sales_invoices(customer_id);
CREATE INDEX idx_invoices_agent ON sales_invoices(delivery_agent_id);
CREATE INDEX idx_invoices_date ON sales_invoices(date);
CREATE INDEX idx_batches_product ON inventory_batches(product_id);
CREATE INDEX idx_batches_remaining ON inventory_batches(remaining_qty);
CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_audit_created ON audit_logs(created_at);
CREATE INDEX idx_notif_user ON notifications(user_id, read_at);
CREATE INDEX idx_stock_product ON stock_movements(product_id, created_at);
CREATE INDEX idx_agent_locations_agent ON agent_locations(agent_id, recorded_at);
CREATE INDEX idx_att_emp_date ON attendance_sessions(employee_id, work_date);
