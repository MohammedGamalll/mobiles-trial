const login = async (u) => {
  const res = await fetch("http://127.0.0.1:8787/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: u, password: "1234" }),
  });
  const cookie = (res.headers.getSetCookie?.()[0] || res.headers.get("set-cookie") || "").split(";")[0];
  return { status: res.status, cookie };
};
const api = async (cookie, path) => {
  const res = await fetch("http://127.0.0.1:8787" + path, { headers: { cookie } });
  return { status: res.status, json: await res.json().catch(() => ({})) };
};
const page = async (path) => {
  const res = await fetch("http://127.0.0.1:8787" + path);
  return { path, status: res.status };
};

const admin = await login("admin");
const h = admin.cookie;
const apis = {
  health: (await api("", "/api/health")).status,
  dash: (await api(h, "/api/dashboard")).status,
  invoices: (await api(h, "/api/invoices?status=held")).status,
  products: (await api(h, "/api/products?pageSize=5")).status,
  accounts: (await api(h, "/api/accounts")).status,
  ledger: (await api(h, "/api/ledger/accounts")).status,
  delivery: (await api(h, "/api/delivery/live")).status,
  leaves: (await api(h, "/api/hr/leaves")).status,
  visits: (await api(h, "/api/visits")).status,
};
const roles = [];
for (const u of ["admin", "sales", "warehouse", "delivery", "accountant"]) {
  roles.push((await login(u)).status);
}
const pages = [];
for (const p of ["/", "/login", "/pos", "/sales", "/products", "/delivery", "/hr", "/hr/leaves", "/stock", "/reps", "/reps/visits", "/ledger", "/more"]) {
  pages.push(await page(p));
}

console.log(JSON.stringify({ login: admin.status, apis, roles, pages }, null, 2));
