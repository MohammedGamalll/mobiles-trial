import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { spawnSync } from "node:child_process";
import { getRequestListener } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createApiApp } from "../worker/index";
import { openMysql } from "../worker/lib/db";
import { loadDotEnv } from "../worker/lib/env-file";

type NodeHandler = (req: IncomingMessage, res: ServerResponse) => void;

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..");
loadDotEnv(projectRoot);
const staticDir =
  process.env.STATIC_DIR ||
  (fs.existsSync(path.join(here, "index.html")) ? here : path.join(projectRoot, "dist"));
const uploadDir = process.env.UPLOAD_DIR || path.join(projectRoot, "data", "uploads");
const backupDir = process.env.BACKUP_DIR || path.join(projectRoot, "data", "backups");
fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(backupDir, { recursive: true });

function resolvePort(fallback: number) {
  for (const key of ["PORT", "port", "NODE_PORT", "APP_PORT"]) {
    const n = Number(String(process.env[key] || "").trim());
    if (Number.isFinite(n) && n > 0) return n;
  }
  return fallback;
}

function applyMigrations() {
  const script = path.join(projectRoot, "scripts", "migrate.mjs");
  if (!fs.existsSync(script)) {
    console.warn("scripts/migrate.mjs missing; skip db migrate");
    return;
  }
  const result = spawnSync(process.execPath, [script], {
    stdio: "inherit",
    env: process.env,
    cwd: projectRoot,
  });
  if (result.status) {
    throw new Error(`Database migrate failed with code ${result.status}`);
  }
}

async function main() {
  applyMigrations();
  const db = await openMysql();
  const app = createApiApp();
  const env = {
    DB: db,
    APP_NAME: "المتميز",
    BACKUP_DIR: backupDir,
    UPLOAD_DIR: uploadDir,
  };

  if (process.env.SERVE_STATIC !== "0") {
    const staticOpts = {
      root: staticDir,
      rewriteRequestPath: (requestPath: string) => requestPath.replace(/^\/+/, ""),
    };
    app.use("/assets/*", serveStatic(staticOpts));
    app.use("/favicon.svg", serveStatic(staticOpts));
    app.get("*", (c) => {
      if (c.req.path.startsWith("/api/") || c.req.path.startsWith("/uploads/")) return c.json({ error: "not_found" }, 404);
      const index = path.join(staticDir, "index.html");
      if (!fs.existsSync(index)) return c.text("UI not built. Run npm run build.", 503);
      return c.html(fs.readFileSync(index, "utf8"), 200, {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      });
    });
  }

  const listener = getRequestListener((req) => app.fetch(req, env));
  const attach = (globalThis as typeof globalThis & { __motamayezAttach?: (fn: NodeHandler) => void }).__motamayezAttach;
  if (typeof attach === "function") {
    attach(listener);
    return;
  }

  const port = resolvePort(8787);
  const hostname = process.env.HOST || "0.0.0.0";
  const server = createServer(listener);
  server.listen(port, hostname, () => {
    const addr = server.address();
    const actual = typeof addr === "object" && addr ? addr.port : port;
    console.log(`المتميز listening on http://${hostname}:${actual}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
