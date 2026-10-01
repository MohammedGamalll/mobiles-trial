import mysql from "mysql2/promise";
const db = await mysql.createConnection({
  host: "127.0.0.1",
  user: "root",
  password: "motamayez",
  database: "motamayez",
  dateStrings: true,
});
await db.execute("UPDATE storage_locations SET deleted_at = NULL, active = 1 WHERE id = 6");
const [r] = await db.execute("SELECT id, name, deleted_at, active FROM storage_locations WHERE id IN (6,9)");
console.log(r);
await db.end();
