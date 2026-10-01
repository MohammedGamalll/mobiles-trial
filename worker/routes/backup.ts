import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { audit, type AppBindings, type AppVars } from "../lib/helpers";
import { requirePerm } from "../lib/auth";
import { mysqlDsnLabel } from "../lib/db";
import { BACKUP_NAME, backupStamp, isBackupBuffer, maybeAutoBackup, recordBackup, restoreSqlDump, writeBackupFile } from "../lib/backup-ops";
import { clearDemo, demoStatus, seedDemo } from "../lib/demo-seed";

export const backupRoutes = new Hono<{ Bindings: AppBindings; Variables: AppVars }>();

backupRoutes.get("/db-info", requirePerm("backup.manage"), async (c) => {
  const products = await c.env.DB.prepare("SELECT COUNT(*) as n FROM products WHERE deleted_at IS NULL").first<{ n: number }>();
  const deleted = await c.env.DB.prepare("SELECT COUNT(*) as n FROM products WHERE deleted_at IS NOT NULL").first<{ n: number }>();
  const invoices = await c.env.DB.prepare("SELECT COUNT(*) as n FROM sales_invoices WHERE deleted_at IS NULL").first<{ n: number }>();
  return c.json({
    mysql: mysqlDsnLabel(),
    home: os.homedir(),
    products: products?.n || 0,
    deleted_products: deleted?.n || 0,
    invoices: invoices?.n || 0,
  });
});

function dirs(c: { env: AppBindings }) {
  const dest = c.env.BACKUP_DIR;
  if (!dest) return null;
  fs.mkdirSync(dest, { recursive: true });
  return { dest };
}

backupRoutes.get("/", requirePerm("backup.manage", "settings.edit"), async (c) => {
  const d = dirs(c);
  if (!d) return c.json({ error: "backup_unavailable" }, 503);
  const { results } = await c.env.DB.prepare("SELECT * FROM backups ORDER BY id DESC LIMIT 40").all();
  const files = fs
    .readdirSync(d.dest)
    .filter((n) => BACKUP_NAME.test(n))
    .map((name) => {
      const st = fs.statSync(path.join(d.dest, name));
      return { filename: name, size_bytes: st.size, mtime: st.mtime.toISOString() };
    })
    .sort((a, b) => b.mtime.localeCompare(a.mtime));
  return c.json({ data: results, files });
});

backupRoutes.post("/", requirePerm("backup.manage", "settings.edit"), async (c) => {
  const d = dirs(c);
  if (!d) return c.json({ error: "backup_unavailable" }, 503);
  const user = c.get("user");
  const made = await writeBackupFile(c.env.DB, d.dest, 20);
  await recordBackup(c.env.DB, made.filename, made.size, user.id, made.removed);
  await audit(c.env.DB, user, "backup", "backup", null, made.filename);
  return c.json({ ok: true, filename: made.filename, size_bytes: made.size }, 201);
});

backupRoutes.get("/demo", requirePerm("backup.manage", "settings.edit"), async (c) => {
  return c.json(await demoStatus(c.env.DB));
});

backupRoutes.post("/demo", requirePerm("backup.manage", "settings.edit"), async (c) => {
  const user = c.get("user");
  try {
    const result = await seedDemo(c.env.DB, user);
    await audit(c.env.DB, user, "seed_demo", "demo", null, result.already ? "already" : "seeded");
    return c.json(result, result.already ? 200 : 201);
  } catch (err) {
    return c.json({ error: "seed_failed", detail: err instanceof Error ? err.message : "error" }, 500);
  }
});

backupRoutes.post("/demo/clear", requirePerm("backup.manage", "settings.edit"), async (c) => {
  const body = await c.req.json<{ confirm?: boolean }>().catch(() => ({ confirm: false }));
  if (!body.confirm) return c.json({ error: "confirm_required" }, 400);
  const user = c.get("user");
  const d = dirs(c);
  if (d) {
    const made = await writeBackupFile(c.env.DB, d.dest, 20);
    await recordBackup(c.env.DB, made.filename, made.size, user.id, made.removed);
  }
  const result = await clearDemo(c.env.DB);
  await audit(c.env.DB, user, "clear_demo", "demo", null, "cleared");
  return c.json(result);
});

backupRoutes.post("/import", requirePerm("backup.manage", "settings.edit"), async (c) => {
  const d = dirs(c);
  if (!d) return c.json({ error: "backup_unavailable" }, 503);
  const body = await c.req.parseBody();
  const file = body.file;
  if (!file || typeof file === "string") return c.json({ error: "missing_file" }, 400);
  const buf = Buffer.from(await (file as File).arrayBuffer());
  if (buf.length < 20 || buf.length > 80 * 1024 * 1024) return c.json({ error: "invalid_size" }, 400);
  if (!isBackupBuffer(buf)) return c.json({ error: "not_sqlite" }, 400);
  const restore = String(body.restore || "") === "1" || String(body.restore || "") === "true";
  const confirm = String(body.confirm || "") === "1" || String(body.confirm || "") === "true";
  if (restore && !confirm) return c.json({ error: "confirm_required" }, 400);
  const user = c.get("user");
  if (restore) {
    const safety = await writeBackupFile(c.env.DB, d.dest, 20);
    await recordBackup(c.env.DB, safety.filename, safety.size, user.id, safety.removed);
  }
  const filename = `motamayez-${backupStamp()}.sql`;
  const dest = path.join(d.dest, filename);
  fs.writeFileSync(dest, buf);
  const size = fs.statSync(dest).size;
  await recordBackup(c.env.DB, filename, size, user.id, []);
  if (restore) await restoreSqlDump(c.env.DB, dest);
  await audit(c.env.DB, user, restore ? "import_restore" : "import_backup", "backup", null, filename);
  return c.json({ ok: true, filename, size_bytes: size, restored: restore }, restore ? 200 : 201);
});

backupRoutes.post("/auto", requirePerm("backup.manage", "settings.edit", "dashboard.view"), async (c) => {
  const user = c.get("user");
  const result = await maybeAutoBackup(c.env.DB, c.env.BACKUP_DIR, user.id, "enter");
  return c.json(result);
});

backupRoutes.post("/:name/restore", requirePerm("backup.manage", "settings.edit"), async (c) => {
  const d = dirs(c);
  if (!d) return c.json({ error: "backup_unavailable" }, 503);
  const name = String(c.req.param("name") || "");
  const body = await c.req.json<{ confirm?: boolean }>().catch(() => ({ confirm: false }));
  if (!body.confirm) return c.json({ error: "confirm_required" }, 400);
  if (!BACKUP_NAME.test(name)) return c.json({ error: "invalid_name" }, 400);
  const file = path.join(d.dest, name);
  if (!fs.existsSync(file)) return c.json({ error: "not_found" }, 404);
  const safety = await writeBackupFile(c.env.DB, d.dest, 20);
  await recordBackup(c.env.DB, safety.filename, safety.size, c.get("user").id, safety.removed);
  await restoreSqlDump(c.env.DB, file);
  await audit(c.env.DB, c.get("user"), "restore_backup", "backup", null, name);
  return c.json({ ok: true, filename: name });
});

backupRoutes.get("/:name", requirePerm("backup.manage", "settings.edit"), async (c) => {
  const d = dirs(c);
  if (!d) return c.json({ error: "backup_unavailable" }, 503);
  const name = String(c.req.param("name") || "");
  if (!BACKUP_NAME.test(name)) return c.json({ error: "invalid_name" }, 400);
  const file = path.join(d.dest, name);
  if (!fs.existsSync(file)) return c.json({ error: "not_found" }, 404);
  const buf = fs.readFileSync(file);
  return c.body(buf, 200, {
    "Content-Type": "application/sql",
    "Content-Disposition": `attachment; filename="${name}"`,
  });
});
