import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { randomToken, type AppBindings, type AppVars } from "../lib/helpers";
import { requirePerm } from "../lib/auth";

export const uploadRoutes = new Hono<{ Bindings: AppBindings; Variables: AppVars }>();
export const publicUploadRoutes = new Hono<{ Bindings: AppBindings; Variables: AppVars }>();

const MAX = 5 * 1024 * 1024;
const TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};
const NAME_OK = /^\d+-[a-f0-9]+\.(jpg|png|webp|gif)$/i;
const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

publicUploadRoutes.get("/:name", async (c) => {
  const dir = c.env.UPLOAD_DIR;
  const name = path.basename(c.req.param("name") || "");
  if (!dir || !NAME_OK.test(name)) return c.json({ error: "not_found" }, 404);
  const file = path.join(dir, name);
  if (!fs.existsSync(file)) return c.json({ error: "not_found" }, 404);
  const buf = fs.readFileSync(file);
  return c.body(buf, 200, {
    "Content-Type": MIME[path.extname(name).toLowerCase()] || "application/octet-stream",
    "Cache-Control": "public, max-age=86400",
  });
});

uploadRoutes.post("/", requirePerm("products.create", "products.edit", "settings.edit"), async (c) => {
  const dir = c.env.UPLOAD_DIR;
  if (!dir) return c.json({ error: "upload_unavailable" }, 503);
  const body = await c.req.parseBody({ all: true });
  const raw = body.file;
  const file = raw instanceof File ? raw : Array.isArray(raw) ? raw.find((x) => x instanceof File) : null;
  if (!(file instanceof File) || !file.size) return c.json({ error: "missing_file" }, 400);
  if (file.size > MAX) return c.json({ error: "file_too_large" }, 400);
  const extFromType = TYPES[file.type];
  const extFromName = path.extname(file.name).toLowerCase() === ".jpeg" ? ".jpg" : path.extname(file.name).toLowerCase();
  const ext = extFromType || (Object.values(TYPES).includes(extFromName) ? extFromName : "");
  if (!ext) return c.json({ error: "not_image" }, 400);
  fs.mkdirSync(dir, { recursive: true });
  const name = `${Date.now()}-${randomToken().slice(0, 16)}${ext}`;
  await fs.promises.writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()));
  return c.json({ url: `/uploads/${name}`, filename: name });
});
