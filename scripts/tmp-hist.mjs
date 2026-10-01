import Database from "better-sqlite3";
import os from "node:os";
import path from "node:path";
const db = new Database(path.join(os.tmpdir(), "chrome-hist-login.sqlite"), { readonly: true, fileMustExist: true });
const rows = db.prepare(`
  SELECT datetime(last_visit_time/1000000-11644473600,'unixepoch','localtime') t, url, title
  FROM urls
  WHERE last_visit_time > (strftime('%s','now')-86400+11644473600)*1000000
  ORDER BY last_visit_time DESC
  LIMIT 40
`).all();
console.log(JSON.stringify(rows, null, 2));
