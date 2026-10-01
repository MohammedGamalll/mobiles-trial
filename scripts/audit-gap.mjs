import Database from "better-sqlite3";
const db = new Database("data/motamayez.sqlite");
const pays = db.prepare("SELECT id, amount, date, created_at, notes FROM payments WHERE invoice_id=9").all();
const journals = db.prepare("SELECT id, source, source_id, status, description FROM journal_entries WHERE source IN ('payment','sale') AND source_id IN (4,5,6,9)").all();
console.log(JSON.stringify({ pays, journals }, null, 2));
db.close();
