"use strict";

const http = require("http");

function resolvePort() {
  for (const key of ["PORT", "port", "NODE_PORT", "APP_PORT"]) {
    const n = Number(String(process.env[key] || "").trim());
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 3000;
}

const port = resolvePort();
const hostname = process.env.HOST || "0.0.0.0";
let handler = null;

const server = http.createServer((req, res) => {
  if (handler) {
    handler(req, res);
    return;
  }
  res.writeHead(503, {
    "Content-Type": "application/json; charset=utf-8",
    "Retry-After": "1",
  });
  res.end(JSON.stringify({ error: "starting" }));
});

server.listen(port, hostname, () => {
  const addr = server.address();
  const actual = addr && typeof addr === "object" ? addr.port : port;
  console.log(`المتميز listening on http://${hostname}:${actual}`);
});

global.__motamayezAttach = (fn) => {
  handler = fn;
};

import("./dist/server.mjs").catch((err) => {
  console.error(err);
  process.exit(1);
});
