# المتميز

نظام ERP / POS لإدارة محل قطع غيار الموبايلات — **Node.js + MySQL**.

انسخ [`.env.example`](.env.example) إلى `.env` محليًا. على هوستنجر نفس المفاتيح من **hPanel → Node.js → Environment variables**.

## التشغيل المحلي

يلزم MySQL/MariaDB فاضي (أو قاعدة موجودة).

```bash
npm install
# عدّل .env: MYSQL_HOST / MYSQL_DATABASE / MYSQL_USER / MYSQL_PASSWORD
npm run db:migrate
npm run dev
```

- الواجهة: http://localhost:5173
- الـ API: http://localhost:8787

`npm run db:import` = نفس `db:migrate` (ينشئ الجداول والديمو على MySQL الفاضي).

## حسابات التجربة بعد أول migrate

| المستخدم     | كلمة المرور | الدور    |
|-------------|-------------|----------|
| `pixel@gmail.com` | `1234` | مدير |
| `sales` / `warehouse` / `delivery` / `accountant` | `1234` | حسب الدور |

## الداتابيز على Hostinger (MySQL منفصلة)

1. hPanel → **Databases** → أنشئ قاعدة MySQL + يوزر + باسورد. اربط اليوزر بالقاعدة بصلاحية All.
2. من داخل Node على نفس السيرفر استخدم **`127.0.0.1`** مش `localhost`.
3. انسخ اسم القاعدة/اليوزر/الباسورد إلى Environment variables:

```
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_DATABASE=...
MYSQL_USER=...
MYSQL_PASSWORD=...
UPLOAD_DIR=/home/u493965445/domains/elmotmyz.shop/.motamayez/uploads
BACKUP_DIR=/home/u493965445/domains/elmotmyz.shop/.motamayez/backups
```

4. GitHub: `muabushama/mobiles-trial` → Node.js **hono** / Node 22 / `npm install` كامل / Build: `npm run build:live` / Start: `npm start`.
5. أول بناء يشغّل `db:migrate` ويملأ الجداول. متكرر آمن (يسجّل المايجريشن في `d1_migrations`).
6. الصور والنسخ `.sql` في File Manager تحت `.motamayez` — مش جوه مجلد Git.

phpMyAdmin تعرض نفس القاعدة. متستخدمش SQLite.

لو عندك بيانات قديمة في ملف sqlite، التحويل اليدوي (export/import) مش تلقائي؛ القاعدة الجديدة تبدأ من المايجريشن والديمو.

## ملاحظات

- التكلفة FIFO Actual Batch Cost.
- واتساب عبر `wa.me`.
- اللغة عربية RTL. العملة EGP.
