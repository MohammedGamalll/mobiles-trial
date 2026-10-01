import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const needed = ["server.mjs", "index.js", "index.html"];
const missing = needed.filter((name) => !fs.existsSync(path.join(dist, name)));
if (missing.length) {
  console.error("Missing built files:", missing.join(", "));
  process.exit(1);
}
console.log("dist ready");
