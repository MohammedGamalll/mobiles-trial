const login = async (u) => {
  const res = await fetch("http://127.0.0.1:8787/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: u, password: "1234" }),
  });
  const cookie = (res.headers.getSetCookie?.()[0] || res.headers.get("set-cookie") || "").split(";")[0];
  return { status: res.status, cookie };
};
const api = async (cookie, path, init = {}) => {
  const res = await fetch("http://127.0.0.1:8787" + path, {
    ...init,
    headers: { cookie, "content-type": "application/json", ...(init.headers || {}) },
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
};

const admin = await login("admin");
const h = admin.cookie;
const old = {
  dash: (await api(h, "/api/dashboard")).status,
  accountsSummary: (await api(h, "/api/accounts")).status,
  expenses: (await api(h, "/api/expenses")).status,
  delivery: (await api(h, "/api/delivery/live")).status,
  reps: (await api(h, "/api/reps")).status,
  leaves: (await api(h, "/api/hr/leaves")).status,
};
const cash0 = await api(h, "/api/ledger/cash");
const chart = await api(h, "/api/ledger/accounts");
const trial = await api(h, "/api/ledger/trial");
const j0 = await api(h, "/api/ledger/journal");
const svc = (await api(h, "/api/products?kind=service&pageSize=5")).json.data?.[0];
const sale = await api(h, "/api/invoices", {
  method: "POST",
  body: JSON.stringify({ type: "normal", items: [{ product_id: svc.id, quantity: 1, unit_price: svc.selling_price }] }),
});
const journals = await api(h, "/api/ledger/journal?source=sale&pageSize=5");
const saleJ = (journals.json.data || []).find((j) => j.source_id === sale.json.data?.id);
const exp = await api(h, "/api/expenses", {
  method: "POST",
  body: JSON.stringify({ category_id: 1, amount: 50, description: "تجربة قيد مصروف" }),
});
const cashBefore = (cash0.json.data || []).find((c) => c.kind === "cash")?.current_balance;
const vch = await api(h, "/api/ledger/vouchers", {
  method: "POST",
  body: JSON.stringify({ type: "receipt", cash_account_id: 1, party_type: "other", party_name: "تجربة", amount: 100, description: "سند قبض تجربة" }),
});
const cash1 = await api(h, "/api/ledger/cash");
const cashAfter = (cash1.json.data || []).find((c) => c.kind === "cash")?.current_balance;
const roles = [];
for (const u of ["admin", "sales", "warehouse", "delivery", "accountant"]) roles.push((await login(u)).status);

console.log(JSON.stringify({
  old,
  cash: { status: cash0.status, count: cash0.json.data?.length, before: cashBefore },
  chart: { status: chart.status, count: chart.json.data?.length },
  trial: trial.status,
  journal: { status: j0.status, count: j0.json.data?.length },
  sale: { status: sale.status, number: sale.json.data?.number, err: sale.json.error },
  saleJournal: saleJ ? { number: saleJ.number, total: saleJ.total } : null,
  expense: exp.status,
  voucher: { status: vch.status, number: vch.json.number, err: vch.json.error },
  cashDelta: cashAfter - cashBefore,
  roles,
}, null, 2));
