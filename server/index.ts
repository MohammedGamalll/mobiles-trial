import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createApiApp } from "../worker/index";
import { openMysql } from "../worker/lib/db";
import { loadDotEnv } from "../worker/lib/env-file";

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

async function main() {
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

  const port = Number(process.env.PORT || 8787);
  const hostname = process.env.HOST || "0.0.0.0";
  serve({ fetch: (req) => app.fetch(req, env), port, hostname }, (info) => {
    console.log(`المتميز listening on http://${hostname}:${info.port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
