import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDb = path.join(root, "data", "motamayez.sqlite");
const dbPath = path.join(root, "data", "audit-test.sqlite");
const port = 8791;
const base = `http://127.0.0.1:${port}`;

function backup() {
  for (const ext of ["", "-wal", "-shm"]) {
    const f = dbPath + ext;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  const src = new Database(srcDb, { readonly: true });
  awaitBackup(src);
  src.close();
}

function awaitBackup(src) {
  const dest = new Database(dbPath);
  src.backup(dest.name).then?.(() => {});
  // better-sqlite3 backup is async; use serialize copy via backup callback
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name} ${detail || ""}`);
}
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.05;

async function main() {
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const src = new Database(srcDb, { readonly: true });
  await src.backup(dbPath);
  src.close();
  await new Promise((resolve, reject) => {
    const m = spawn(process.execPath, ["scripts/migrate.mjs"], { cwd: root, env: { ...process.env, SQLITE_PATH: dbPath }, stdio: "inherit" });
    m.on("exit", (code) => (code ? reject(new Error("migrate " + code)) : resolve()));
  });

  const child = spawn(process.execPath, [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), "server/index.ts"], {
    cwd: root,
    env: { ...process.env, SQLITE_PATH: dbPath, PORT: String(port), SERVE_STATIC: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (d) => { log += d; });
  child.stderr.on("data", (d) => { log += d; });
  const ready = await waitReady(child, () => log.includes("listening") || log.includes("EADDRINUSE") || log.includes("Error"));
  if (!ready || log.includes("EADDRINUSE") || log.includes("Error:")) {
    console.log(log);
    child.kill();
    process.exit(1);
  }

  const db = new Database(dbPath);
  try {
    await run(db);
  } finally {
    db.close();
    child.kill();
  }
  const failed = results.filter((r) => !r.ok);
  fs.writeFileSync(path.join(root, "data", "audit-results.json"), JSON.stringify({ results, failed: failed.length }, null, 2));
  console.log(`AUDIT ${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

function waitReady(child, pred) {
  return new Promise((resolve) => {
    const t = setInterval(() => {
      if (pred()) {
        clearInterval(t);
        resolve(true);
      }
    }, 200);
    child.on("exit", () => {
      clearInterval(t);
      resolve(false);
    });
    setTimeout(() => {
      clearInterval(t);
      resolve(pred());
    }, 15000);
  });
}

async function run(db) {
  const login = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "pixel@gmail.com", password: "P@ss9930" }),
  });
  const setCookie = login.headers.get("set-cookie") || "";
  const cookie = setCookie.split(";")[0];
  check("login", login.ok, String(login.status));
  const api = async (method, url, body) => {
    const res = await fetch(base + url, {
      method,
      headers: { "content-type": "application/json", cookie },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
    return { status: res.status, json };
  };
  const one = (sql, ...p) => db.prepare(sql).get(...p);

  const sku = "AUDIT-" + Date.now();
  const prod = await api("POST", "/api/products", {
    sku, name_ar: "صنف اختبار", name_en: "Audit item", selling_price: 150, purchase_price: 100, min_selling_price: 0, min_stock: 0,
  });
  const productId = prod.json?.id;
  check("create product", !!productId, JSON.stringify(prod.json));

  const supplier = one("SELECT id FROM suppliers WHERE deleted_at IS NULL ORDER BY id LIMIT 1");
  const beforeCash = one("SELECT current_balance as n FROM cash_accounts WHERE kind='cash' ORDER BY id LIMIT 1").n;
  const beforeSup = one("SELECT balance as n FROM suppliers WHERE id=?", supplier.id).n;

  const purchase = await api("POST", "/api/inventory/purchases", {
    supplier_id: supplier.id,
    paid: 10000,
    payment_method: "cash",
    items: [{ product_id: productId, quantity: 100, unit_cost: 100 }],
  });
  check("create cash purchase", purchase.status === 201, JSON.stringify(purchase.json));
  const approved = await api("POST", `/api/inventory/purchases/${purchase.json.id}/approve`, {});
  check("approve purchase", approved.status === 200, JSON.stringify(approved.json));
  const stock = one("SELECT current_stock as n FROM products WHERE id=?", productId).n;
  const batches = one("SELECT COALESCE(SUM(remaining_qty),0) as n FROM inventory_batches WHERE product_id=?", productId).n;
  const cashAfterBuy = one("SELECT current_balance as n FROM cash_accounts WHERE kind='cash' ORDER BY id LIMIT 1").n;
  const supAfter = one("SELECT balance as n FROM suppliers WHERE id=?", supplier.id).n;
  check("stock +100", stock === 100 && batches === 100, `stock=${stock} batches=${batches}`);
  check("cash purchase treasury -10000", near(cashAfterBuy, beforeCash - 10000), `${beforeCash} -> ${cashAfterBuy}`);
  check("cash purchase supplier unchanged", near(supAfter, beforeSup), `${beforeSup} -> ${supAfter}`);
  const pj = one("SELECT id FROM journal_entries WHERE source='purchase' AND source_id=? AND status='posted'", purchase.json.id);
  check("purchase journal", !!pj, "");

  const cust = await api("POST", "/api/customers", { name: "عميل اختبار " + sku, phone: "01000000000", credit_limit: 50000 });
  const customerId = cust.json?.id;
  check("create customer", !!customerId, JSON.stringify(cust.json));

  const sale = await api("POST", "/api/invoices", {
    type: "normal",
    payment_method: "cash",
    customer_id: customerId,
    client_token: "audit-cash-" + sku,
    items: [{ product_id: productId, quantity: 10, unit_price: 150, discount: 0 }],
  });
  const inv = sale.json?.data;
  check("cash sale 1500", sale.status === 201 && near(inv?.total, 1500) && near(inv?.profit, 500), JSON.stringify({ status: sale.status, total: inv?.total, profit: inv?.profit, cost: inv?.cost_total }));
  const stock2 = one("SELECT current_stock as n FROM products WHERE id=?", productId).n;
  check("stock 90", stock2 === 90, String(stock2));
  const move = one("SELECT qty, type FROM stock_movements WHERE product_id=? AND reference_type='sale' ORDER BY id DESC LIMIT 1", productId);
  check("sale movement -10", move && move.qty === 10 && move.type === "out", JSON.stringify(move));
  const cashAfterSale = one("SELECT current_balance as n FROM cash_accounts WHERE kind='cash' ORDER BY id LIMIT 1").n;
  check("treasury +1500", near(cashAfterSale, cashAfterBuy + 1500), `${cashAfterBuy} -> ${cashAfterSale}`);
  const bal0 = one("SELECT current_balance as n FROM customers WHERE id=?", customerId).n;
  check("cash sale no new debt", near(bal0, 0), String(bal0));
  const dup = await api("POST", "/api/invoices", {
    type: "normal", payment_method: "cash", customer_id: customerId, client_token: "audit-cash-" + sku,
    items: [{ product_id: productId, quantity: 10, unit_price: 150, discount: 0 }],
  });
  check("idempotent resend", dup.json?.duplicate === true && dup.json?.data?.id === inv.id, JSON.stringify({ duplicate: dup.json?.duplicate, id: dup.json?.data?.id }));
  const stockDup = one("SELECT current_stock as n FROM products WHERE id=?", productId).n;
  check("resend did not sell twice", stockDup === 90, String(stockDup));

  const credit = await api("POST", "/api/invoices", {
    type: "normal", payment_method: "credit", paid: 0, customer_id: customerId,
    items: [{ product_id: productId, quantity: 10, unit_price: 1000, discount: 0 }],
  });
  const cinv = credit.json?.data;
  check("credit sale 10000", near(cinv?.total, 10000) && near(cinv?.remaining, 10000) && near(cinv?.paid, 0), JSON.stringify({ total: cinv?.total, remaining: cinv?.remaining }));
  const bal1 = one("SELECT current_balance as n FROM customers WHERE id=?", customerId).n;
  const cashCredit = one("SELECT current_balance as n FROM cash_accounts WHERE kind='cash' ORDER BY id LIMIT 1").n;
  check("receivable +10000", near(bal1, 10000), String(bal1));
  check("credit sale treasury unchanged", near(cashCredit, cashAfterSale), `${cashAfterSale} -> ${cashCredit}`);

  const pay1 = await api("POST", `/api/invoices/${cinv.id}/pay`, { amount: 4000, method: "cash" });
  check("partial pay", pay1.status === 200 && near(pay1.json?.paid, 4000) && near(pay1.json?.remaining, 6000), JSON.stringify(pay1.json));
  const st = one("SELECT status, paid, remaining, total FROM sales_invoices WHERE id=?", cinv.id);
  check("status partial", st.status === "partial" && near(st.paid + st.remaining, st.total), JSON.stringify(st));
  const bal2 = one("SELECT current_balance as n FROM customers WHERE id=?", customerId).n;
  const cashP = one("SELECT current_balance as n FROM cash_accounts WHERE kind='cash' ORDER BY id LIMIT 1").n;
  check("receivable 6000", near(bal2, 6000), String(bal2));
  check("treasury +4000", near(cashP, cashCredit + 4000), `${cashCredit} -> ${cashP}`);

  const pay2 = await api("POST", `/api/invoices/${cinv.id}/pay`, { amount: 2000, method: "cash" });
  check("later collection 2000", near(pay2.json?.paid, 6000) && near(pay2.json?.remaining, 4000), JSON.stringify(pay2.json));
  const bal3 = one("SELECT current_balance as n FROM customers WHERE id=?", customerId).n;
  check("receivable 4000", near(bal3, 4000), String(bal3));

  const pay3 = await api("POST", `/api/invoices/${cinv.id}/pay`, { amount: 4000, method: "cash" });
  check("paid in full", near(pay3.json?.remaining, 0), JSON.stringify(pay3.json));
  const st2 = one("SELECT status FROM sales_invoices WHERE id=?", cinv.id);
  const bal4 = one("SELECT current_balance as n FROM customers WHERE id=?", customerId).n;
  check("status completed and debt cleared", st2.status === "completed" && near(bal4, 0), `${st2.status} bal=${bal4}`);

  const item = one("SELECT id FROM sales_invoice_items WHERE invoice_id=?", inv.id);
  const cashBeforeRet = one("SELECT current_balance as n FROM cash_accounts WHERE kind='cash' ORDER BY id LIMIT 1").n;
  const profitBefore = one("SELECT profit as n FROM sales_invoices WHERE id=?", inv.id).n;
  const ret = await api("POST", `/api/invoices/${inv.id}/returns`, { reason: "audit", items: [{ invoice_item_id: item.id, qty: 3 }] });
  check("partial return", ret.status === 201 && near(ret.json?.total, 450), JSON.stringify(ret.json));
  const stock3 = one("SELECT current_stock as n FROM products WHERE id=?", productId).n;
  const profitAfter = one("SELECT profit as n FROM sales_invoices WHERE id=?", inv.id).n;
  const cashRet = one("SELECT current_balance as n FROM cash_accounts WHERE kind='cash' ORDER BY id LIMIT 1").n;
  check("return restock +3", stock3 === stock2 - 10 + 3, `was ${stock2} now ${stock3}`);
  check("profit drops by margin 150", near(profitAfter, profitBefore - 150), `${profitBefore} -> ${profitAfter}`);
  check("cash refund 450", near(cashRet, cashBeforeRet - 450), `${cashBeforeRet} -> ${cashRet}`);

  const disc = await api("POST", "/api/invoices", {
    type: "normal", payment_method: "cash", customer_id: customerId, discount: 100,
    items: [{ product_id: productId, quantity: 2, unit_price: 500, discount: 0 }],
  });
  check("invoice discount 1000-100=900", near(disc.json?.data?.total, 900), JSON.stringify({ total: disc.json?.data?.total, err: disc.json?.error }));

  const buy2 = await api("POST", "/api/inventory/purchases", {
    supplier_id: supplier.id, paid: 0, payment_method: "credit",
    items: [{ product_id: productId, quantity: 10, unit_cost: 200 }],
  });
  await api("POST", `/api/inventory/purchases/${buy2.json.id}/approve`, {});
  const supDebt = one("SELECT balance as n FROM suppliers WHERE id=?", supplier.id).n;
  check("credit purchase supplier +2000", near(supDebt, beforeSup + 2000), `${beforeSup} -> ${supDebt}`);
  const oldest = one("SELECT unit_cost as n FROM inventory_batches WHERE product_id=? AND remaining_qty>0 ORDER BY id ASC LIMIT 1", productId);
  check("oldest open batch still FIFO 100 not average 150", oldest.n === 100, String(oldest.n));

  const expCat = one("SELECT id FROM expense_categories LIMIT 1");
  const cashBeforeExp = one("SELECT current_balance as n FROM cash_accounts WHERE kind='cash' ORDER BY id LIMIT 1").n;
  const exp = await api("POST", "/api/expenses", { category_id: expCat.id, amount: 1000, description: "كهرباء اختبار" });
  const cashExp = one("SELECT current_balance as n FROM cash_accounts WHERE kind='cash' ORDER BY id LIMIT 1").n;
  check("expense treasury -1000", exp.status === 201 && near(cashExp, cashBeforeExp - 1000), `${cashBeforeExp} -> ${cashExp}`);

  const books = one(
    `SELECT COALESCE(SUM(l.debit),0) as d, COALESCE(SUM(l.credit),0) as c
     FROM journal_lines l JOIN journal_entries j ON j.id = l.entry_id AND j.status='posted'`,
  );
  check("posted debits equal credits", near(books.d, books.c), `D=${books.d} C=${books.c}`);

  const saleDate = one("SELECT date as n FROM sales_invoices WHERE id=?", inv.id).n;
  const dash = await api("GET", "/api/dashboard");
  const salesToday = one("SELECT COALESCE(SUM(total),0) as n FROM sales_invoices WHERE deleted_at IS NULL AND status NOT IN ('cancelled','draft','held','quote','order') AND date = ?", saleDate).n;
  check("dashboard sales today matches invoices", near(dash.json?.sales_today, salesToday), `dash=${dash.json?.sales_today} sql=${salesToday}`);

  const recon = await api("GET", "/api/reports/reconcile");
  const custRow = (recon.json?.rows || []).find((r) => r.module.startsWith("Customer"));
  check("customer reconciliation", custRow?.status === "PASS", JSON.stringify(custRow));
  const stockRow = (recon.json?.rows || []).find((r) => r.module.startsWith("Stock"));
  const journalRow = (recon.json?.rows || []).find((r) => r.module.startsWith("Journal"));
  check("stock reconciliation", stockRow?.status === "PASS", JSON.stringify(stockRow));
  check("journal reconciliation", journalRow?.status === "PASS", JSON.stringify(journalRow));

  const salesLogin = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "sales", password: "1234" }),
  });
  const salesCookie = (salesLogin.headers.get("set-cookie") || "").split(";")[0];
  const denied = await fetch(base + "/api/expenses", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: salesCookie },
    body: JSON.stringify({ category_id: expCat.id, amount: 5 }),
  });
  check("sales role cannot post expense", denied.status === 403, String(denied.status));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
