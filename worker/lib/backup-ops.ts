import fs from "node:fs";
import path from "node:path";
import type { AppDb } from "./db";
import { nowIso } from "./helpers";

export const BACKUP_NAME = /^motamayez-\d{8}-\d{6}\.sql$/;

export function backupStamp(d = new Date()) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}${String(d.getSeconds()).padStart(2, "0")}`;
}

export function isBackupBuffer(buf: Buffer) {
  const head = buf.subarray(0, 80).toString("utf8");
  return head.includes("motamayez-mysql") || /^\s*SET FOREIGN_KEY_CHECKS/i.test(head);
}

function sqlLiteral(value: unknown) {
  if (value == null) return "NULL";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "bigint") return String(value);
  if (Buffer.isBuffer(value)) return `X'${value.toString("hex")}'`;
  return `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}

export async function dumpMysql(db: AppDb) {
  const tables = await db
    .prepare(
      "SELECT TABLE_NAME as name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME",
    )
    .all<{ name: string }>();
  const chunks = ["-- motamayez-mysql", "SET FOREIGN_KEY_CHECKS=0;", "SET NAMES utf8mb4;"];
  for (const t of tables.results) {
    const name = t.name;
    if (!/^[a-zA-Z0-9_]+$/.test(name)) continue;
    chunks.push(`DELETE FROM \`${name}\`;`);
    const { results } = await db.prepare(`SELECT * FROM \`${name}\``).all<Record<string, unknown>>();
    for (const row of results) {
      const cols = Object.keys(row);
      if (!cols.length) continue;
      const values = cols.map((c) => sqlLiteral(row[c])).join(", ");
      chunks.push(`INSERT INTO \`${name}\` (${cols.map((c) => `\`${c}\``).join(", ")}) VALUES (${values});`);
    }
  }
  chunks.push("SET FOREIGN_KEY_CHECKS=1;");
  return chunks.join("\n");
}

export async function writeBackupFile(db: AppDb, backupDir: string, keep = 20) {
  fs.mkdirSync(backupDir, { recursive: true });
  const filename = `motamayez-${backupStamp()}.sql`;
  const dest = path.join(backupDir, filename);
  const sql = await dumpMysql(db);
  fs.writeFileSync(dest, sql, "utf8");
  const size = fs.statSync(dest).size;
  const extras = fs
    .readdirSync(backupDir)
    .filter((n) => BACKUP_NAME.test(n))
    .sort()
    .reverse()
    .slice(keep);
  for (const old of extras) {
    try {
      fs.unlinkSync(path.join(backupDir, old));
    } catch {
      /* ignore */
    }
  }
  return { filename, dest, size, removed: extras };
}

export async function recordBackup(db: AppDb, filename: string, size: number, userId: number | null, removed: string[]) {
  try {
    await db.prepare("INSERT INTO backups (filename, size_bytes, created_by) VALUES (?, ?, ?)").bind(filename, size, userId).run();
    for (const old of removed) {
      await db.prepare("DELETE FROM backups WHERE filename = ?").bind(old).run();
    }
  } catch {
    /* backups table missing */
  }
}

export async function restoreSqlDump(db: AppDb, backupFile: string) {
  const sql = fs.readFileSync(backupFile, "utf8");
  await db.exec("SET FOREIGN_KEY_CHECKS=0");
  try {
    await db.exec(sql);
  } finally {
    await db.exec("SET FOREIGN_KEY_CHECKS=1");
  }
}

export function lastBackupMtime(backupDir: string) {
  if (!fs.existsSync(backupDir)) return 0;
  let latest = 0;
  for (const name of fs.readdirSync(backupDir)) {
    if (!BACKUP_NAME.test(name)) continue;
    const st = fs.statSync(path.join(backupDir, name));
    if (st.mtimeMs > latest) latest = st.mtimeMs;
  }
  return latest;
}

export async function maybeAutoBackup(db: AppDb, backupDir: string | undefined, userId: number, mode: "login" | "enter") {
  if (!backupDir) return { skipped: true as const, reason: "unavailable" };
  let auto = "1";
  try {
    const row = await db.prepare("SELECT value FROM settings WHERE key = 'auto_backup_on_login'").first<{ value: string }>();
    if (row?.value === "0") return { skipped: true as const, reason: "disabled" };
    auto = row?.value || "1";
  } catch {
    /* default on */
  }
  if (auto === "0") return { skipped: true as const, reason: "disabled" };
  const age = Date.now() - lastBackupMtime(backupDir);
  if (mode === "login" && age < 2 * 60 * 1000) return { skipped: true as const, reason: "debounce" };
  if (mode === "enter" && age < 12 * 60 * 60 * 1000) return { skipped: true as const, reason: "recent" };
  const made = await writeBackupFile(db, backupDir, 20);
  await recordBackup(db, made.filename, made.size, userId, made.removed);
  try {
    await db
      .prepare("INSERT INTO settings (key, value) VALUES ('last_auto_backup_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .bind(nowIso())
      .run();
  } catch {
    /* ignore */
  }
  return { skipped: false as const, filename: made.filename };
}
