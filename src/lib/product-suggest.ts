import type { Lang } from "../i18n";

export function productDisplayName(p: any, lang: Lang) {
  return String((lang === "ar" ? p.name_ar : p.name_en) || p.name_ar || p.name_en || p.sku || "").trim();
}

function norm(s: unknown) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKC")
    .trim();
}

export function rankProductHits(rows: any[], q: string, lang: Lang, limit = 12) {
  const n = norm(q);
  if (!n) return [];
  const scored: { p: any; score: number; name: string }[] = [];
  for (const p of rows) {
    const name = norm(productDisplayName(p, lang));
    const nameAr = norm(p.name_ar);
    const nameEn = norm(p.name_en);
    const sku = norm(p.sku);
    const barcode = norm(p.barcode);
    const part = norm(p.part_number);
    const words = `${name} ${nameAr} ${nameEn}`.split(/\s+/).filter(Boolean);
    let score = 0;
    if (sku === n || barcode === n || norm(p.extra_code1) === n || norm(p.extra_code2) === n) score = 5;
    else if (name.startsWith(n) || nameAr.startsWith(n) || nameEn.startsWith(n)) score = 4;
    else if (sku.startsWith(n) || barcode.startsWith(n) || part.startsWith(n)) score = 3;
    else if (words.some((w) => w.startsWith(n))) score = 2;
    else if (`${name} ${nameAr} ${nameEn} ${sku} ${barcode} ${part}`.includes(n)) score = 1;
    if (score) scored.push({ p, score, name: name || sku });
  }
  scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, lang === "ar" ? "ar" : "en"));
  const seen = new Set<number>();
  const out: any[] = [];
  for (const row of scored) {
    if (seen.has(row.p.id)) continue;
    seen.add(row.p.id);
    out.push(row.p);
    if (out.length >= limit) break;
  }
  return out;
}
