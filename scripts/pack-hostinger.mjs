import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dest = path.join(root, "hostinger-dist");

function copyDir(from, to, skip = new Set()) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    if (/^tmp-/i.test(entry.name) || /^tmp-login/i.test(entry.name) || /^tmp-cookies/i.test(entry.name)) continue;
    const src = path.join(from, entry.name);
    const out = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, out, skip);
    else if (/\.sqlite($|-)/i.test(entry.name)) continue;
    else fs.copyFileSync(src, out);
  }
}

if (!fs.existsSync(path.join(root, "dist", "server.mjs")) || !fs.existsSync(path.join(root, "dist", "index.html"))) {
  console.error("Run npm run build before packing.");
  process.exit(1);
}

if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });

for (const dir of ["worker", "server", "scripts", "public", "migrations", "dist"]) {
  const from = path.join(root, dir);
  if (fs.existsSync(from)) copyDir(from, path.join(dest, dir), new Set(["tmp-hist.mjs", "tmp-login-check.mjs", "tmp-zip.mjs"]));
}

fs.mkdirSync(path.join(dest, "data"), { recursive: true });
fs.writeFileSync(path.join(dest, "data", ".keep"), "");


const rootPkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const pkg = {
  name: "motamayez-erp",
  private: true,
  version: rootPkg.version,
  type: "module",
  main: "app.cjs",
  engines: { node: ">=22" },
  scripts: {
    build: "node scripts/verify-dist.mjs && node scripts/migrate.mjs",
    start: "node app.cjs",
    "db:migrate": "node scripts/migrate.mjs",
  },
  dependencies: {
    "@hono/node-server": rootPkg.dependencies["@hono/node-server"],
    hono: rootPkg.dependencies.hono,
    mysql2: rootPkg.dependencies.mysql2,
  },
};
fs.writeFileSync(path.join(dest, "package.json"), JSON.stringify(pkg, null, 2) + "\n");

fs.copyFileSync(path.join(root, "app.cjs"), path.join(dest, "app.cjs"));
fs.writeFileSync(path.join(dest, "index.js"), `import "./app.cjs";\n`);
fs.writeFileSync(path.join(dest, "app.js"), `import "./app.cjs";\n`);
fs.writeFileSync(path.join(dest, "server.js"), `import "./app.cjs";\n`);
fs.writeFileSync(
  path.join(dest, "اقرأني-هوستنجر.txt"),
  `ارفع المجلد ده كتطبيق Node.js (Web App) مش ملفات ثابتة في public_html.

لو شاشة الدخول بتقول «تعذر الاتصال بالخادم» أو /api/health بيرجع 404:
الواجهة اترفعت لوحدها، وتطبيق Node مش شغال. الدخول مش هيشتغل غير لما التطبيق يتقلع.

في إعدادات النشر على Hostinger:
- نوع التطبيق / Framework: hono (مش React/Vite)
- ملف التشغيل / Entry file: app.cjs
- مجلد الإخراج / Output directory: فاضي
- أمر البناء / Build: npm run build:live
- أمر التشغيل / Start: npm start
- Node: 22
- تثبيت الحزم: npm install (من غير --omit=dev عشان Vite)
- PORT: سيب هوستنجر تحطه لوحدها. متقفلش على 8787.

متغيرات البيئة (hPanel، مش ملف جوه Git):
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_DATABASE=اسم_القاعدة_من_لوحة_هوستنجر
MYSQL_USER=يوزر_القاعدة
MYSQL_PASSWORD=باسورد_القاعدة
UPLOAD_DIR=/home/u493965445/domains/elmotmyz.shop/.motamayez/uploads
BACKUP_DIR=/home/u493965445/domains/elmotmyz.shop/.motamayez/backups

اعمل القاعدة فاضية من hPanel → Databases (MySQL) وبعدين npm run db:migrate بيملأ الجداول.
`,
);

const lock = spawnSync("npm", ["install", "--package-lock-only", "--ignore-scripts"], {
  cwd: dest,
  stdio: "inherit",
  shell: true,
});
if (lock.status !== 0) process.exit(lock.status || 1);

fs.writeFileSync(
  path.join(dest, ".gitignore"),
  `node_modules
.wrangler
.vite
*.local
`,
);
console.log("hostinger-dist ready");
