import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = "D:\\PIXEL01\\mobiles trial";
const src = path.join(root, "hostinger-dist");
const zip = path.join(root, "elmotmyz_20260929_160800.zip");
if (fs.existsSync(zip)) fs.unlinkSync(zip);
const dataDir = path.join(src, "data");
if (fs.existsSync(dataDir)) {
  for (const n of fs.readdirSync(dataDir)) {
    if (n.startsWith("motamayez.sqlite")) fs.unlinkSync(path.join(dataDir, n));
  }
}
const items = fs.readdirSync(src).filter((n) => n !== "node_modules" && !n.includes("هوستنجر"));
const r = spawnSync(
  "powershell",
  ["-NoProfile", "-Command", `Compress-Archive -Path @(${items.map((n) => `'${path.join(src, n)}'`).join(",")}) -DestinationPath '${zip}' -Force`],
  { stdio: "inherit" },
);
if (r.status !== 0) process.exit(r.status || 1);
console.log(zip, fs.statSync(zip).size);
