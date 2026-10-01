/** Translate SQLite-flavored SQL used in this app into MySQL/MariaDB. */

function sqliteNowToMysql(fn, inner) {
  const args = inner.split(",").map((p) => p.trim().replace(/^['"]|['"]$/g, ""));
  if (!args.length || args[0].toLowerCase() !== "now") return null;
  let expr = fn.toLowerCase() === "date" ? "CURDATE()" : "NOW()";
  for (const mod of args.slice(1)) {
    if (/^start of day$/i.test(mod)) {
      expr = `TIMESTAMP(DATE(${expr}))`;
      continue;
    }
    const m = /^([+-])(\d+)\s*(minutes?|hours?|days?)$/i.exec(mod);
    if (!m) return null;
    const unit = m[3].toUpperCase().replace(/S$/i, "");
    expr = `${m[1] === "-" ? "DATE_SUB" : "DATE_ADD"}(${expr}, INTERVAL ${m[2]} ${unit})`;
  }
  return expr;
}

export function adaptSql(sql) {
  let s = sql.trim();
  s = s.replace(/ON CONFLICT\s*\([^)]+\)\s*DO UPDATE SET\s+([^;]+)/gi, (_m, sets) => {
    const converted = String(sets).replace(/\bexcluded\.(\w+)/gi, "VALUES($1)");
    return `ON DUPLICATE KEY UPDATE ${converted}`;
  });
  s = s.replace(/\bCREATE\s+(UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS\b/gi, "CREATE $1INDEX");
  s = s.replace(/\bINSERT OR IGNORE\b/gi, "INSERT IGNORE");
  s = s.replace(/\bINSERT OR REPLACE\b/gi, "REPLACE");
  if (/ON CONFLICT\s*\([^)]*\)\s*DO NOTHING/i.test(s)) {
    s = s.replace(/\s*ON CONFLICT\s*\([^)]*\)\s*DO NOTHING/gi, "");
    s = s.replace(/^\s*INSERT\s+INTO\b/i, "INSERT IGNORE INTO");
  }
  s = s.replace(/\bBEGIN IMMEDIATE\b/gi, "START TRANSACTION");
  s = s.replace(/julianday\('now'\)\s*-\s*julianday\(([^)]+)\)/gi, "DATEDIFF(CURDATE(), $1)");
  s = s.replace(/julianday\(([^)]+)\)\s*-\s*julianday\(([^)]+)\)/gi, "DATEDIFF($1, $2)");
  s = s.replace(/\bCAST\(([^)]+)\s+AS\s+INT\)/gi, "CAST($1 AS SIGNED)");
  s = s.replace(/\b(datetime|date)\(([^)]*)\)/gi, (full, fn, inner) => {
    const converted = sqliteNowToMysql(fn, inner);
    if (converted) return converted;
    if (String(fn).toLowerCase() === "datetime" && /^[a-z_][a-z0-9_.]*$/i.test(String(inner).trim())) {
      return String(inner).trim();
    }
    return full;
  });
  s = s.replace(/\bINTEGER PRIMARY KEY AUTOINCREMENT\b/gi, "INT NOT NULL AUTO_INCREMENT PRIMARY KEY");
  s = s.replace(/\bAUTOINCREMENT\b/gi, "AUTO_INCREMENT");
  s = s.replace(/\bREAL\b/gi, "DOUBLE");
  s = s.replace(/TEXT NOT NULL UNIQUE/gi, "VARCHAR(191) NOT NULL UNIQUE");
  s = s.replace(/TEXT\s+UNIQUE/gi, "VARCHAR(191) UNIQUE");
  s = s.replace(/\bTEXT PRIMARY KEY\b/gi, "VARCHAR(191) PRIMARY KEY");
  s = s.replace(/CREATE TABLE IF NOT EXISTS settings\s*\(\s*`?key`?/gi, "CREATE TABLE IF NOT EXISTS settings (`key`");
  s = s.replace(/INSERT\s+(IGNORE\s+)?INTO settings\s*\(\s*key\s*,/gi, "INSERT $1INTO settings (`key`,");
  s = s.replace(/FROM settings WHERE key =/gi, "FROM settings WHERE `key` =");
  s = s.replace(/SELECT key, value FROM settings/gi, "SELECT `key`, value FROM settings");
  s = s.replace(/DEFAULT\s*\(\s*NOW\(\)\s*\)/gi, "DEFAULT CURRENT_TIMESTAMP");
  s = s.replace(/DEFAULT\s+NOW\(\)/gi, "DEFAULT CURRENT_TIMESTAMP");
  s = s.replace(/\bTEXT(\s+NOT NULL)?\s+DEFAULT CURRENT_TIMESTAMP/gi, "DATETIME$1 DEFAULT CURRENT_TIMESTAMP");
  s = s.replace(/\bTEXT(\s+NOT NULL)?\s+DEFAULT\s+/gi, "VARCHAR(191)$1 DEFAULT ");
  if (/^\s*(CREATE TABLE|ALTER TABLE)\b/i.test(s)) {
    s = s.replace(/\b(notes|description|body_ar|body_en|body|address|extra_codes|specs|reject_reason)\s+TEXT\b/gi, "$1 LONGTEXT");
    s = s.replace(/\bTEXT\b/gi, "VARCHAR(191)");
  }
  if (/^\s*CREATE\s+(UNIQUE\s+)?INDEX\b/i.test(s)) {
    s = s.replace(/\s+WHERE\s+[\s\S]+$/i, "");
    if (!/;\s*$/.test(s)) s += ";";
  }
  if (/^\s*CREATE TABLE/i.test(s) && !/\bENGINE\s*=/i.test(s)) {
    s = s.replace(/\s*;\s*$/, "") + " ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;";
  }
  return s;
}
