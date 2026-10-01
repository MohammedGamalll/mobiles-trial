import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await build({
  entryPoints: [path.join(root, "server", "index.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: path.join(root, "dist", "server.mjs"),
  external: ["mysql2", "mysql2/promise"],
  banner: {
    js: `import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);`,
  },
});

const dist = path.join(root, "dist");
fs.writeFileSync(path.join(dist, "index.js"), `import "./server.mjs";\n`);
console.log("bundled dist/server.mjs");
