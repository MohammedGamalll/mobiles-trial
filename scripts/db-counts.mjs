import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("data/motamayez.sqlite");
const c = (sql) => db.prepare(sql).get().c;
const out = {
  users: c("SELECT COUNT(*) AS c FROM users"),
  products: c("SELECT COUNT(*) AS c FROM products"),
  invoices: c("SELECT COUNT(*) AS c FROM invoices"),
  customers: c("SELECT COUNT(*) AS c FROM customers"),
};
try {
  out.sessions = c("SELECT COUNT(*) AS c FROM sessions");
} catch {
  out.sessions = null;
}
console.log(JSON.stringify(out, null, 2));
db.close();
