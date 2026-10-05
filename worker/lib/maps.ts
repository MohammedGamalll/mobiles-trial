export type MapsCoords = { lat: number; lng: number };

const COORD = "(-?\\d+(?:\\.\\d+)?)";

function validPair(lat: number, lng: number): MapsCoords | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

function pair(a?: string, b?: string) {
  return validPair(Number(a), Number(b));
}

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export function extractMapsUrl(raw: string): string {
  const s = String(raw || "").trim();
  const m = s.match(/https?:\/\/[^\s<>"']+/i);
  return m ? m[0].replace(/[),.]+$/, "") : s;
}

export function looksLikeMapsUrl(raw: string) {
  return /google\.|maps\.app|goo\.gl|maps\.google|share\.google/i.test(raw);
}

export function isShortMapsUrl(raw: string) {
  return /maps\.app\.goo\.gl|goo\.gl\/maps|share\.google\//i.test(raw);
}

export function formatMapsCoord(n: number) {
  return Number.isFinite(n) ? n.toFixed(6) : "";
}

function parseDecoded(s: string, allowLoose: boolean): MapsCoords | null {
  if (!s) return null;
  const place = s.match(new RegExp(`!8m2!3d${COORD}!4d${COORD}`));
  if (place) return pair(place[1], place[2]);
  const bangs = [...s.matchAll(new RegExp(`!3d${COORD}!4d${COORD}`, "g"))];
  if (bangs.length) {
    const last = bangs[bangs.length - 1];
    return pair(last[1], last[2]);
  }
  const q = s.match(new RegExp(`[?&#](?:q|query|ll|center|destination)=${COORD}\\s*,\\s*${COORD}`, "i"));
  if (q) return pair(q[1], q[2]);
  const at = s.match(new RegExp(`@${COORD}\\s*,\\s*${COORD}`));
  if (at) return pair(at[1], at[2]);
  if (allowLoose) {
    const loose = s.match(/(-?\d{1,2}\.\d{3,})\s*[, ]\s*(-?\d{1,3}\.\d{3,})/);
    if (loose) return pair(loose[1], loose[2]);
  }
  return null;
}

export function parseMapsCoords(raw: string): MapsCoords | null {
  const extracted = extractMapsUrl(raw);
  const s = safeDecode(extracted.replace(/\s+/g, " ")).trim();
  if (!s) return null;
  return parseDecoded(s, s.length < 2000);
}

export function coordsFromMapsHtml(html: string): MapsCoords | null {
  const text = String(html || "");
  const canonical =
    text.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i)?.[1] ||
    text.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)/i)?.[1] ||
    "";
  if (canonical) {
    const fromCanon = parseMapsCoords(canonical);
    if (fromCanon) return fromCanon;
  }
  const mapsLinks = text.match(/https?:\/\/(?:www\.)?(?:google\.[^/"'\s]+|maps\.app\.goo\.gl)[^"'\s<>]*/gi) || [];
  for (const link of mapsLinks) {
    if (!/\/maps\//i.test(link) && !/maps\.app/i.test(link)) continue;
    const fromLink = parseMapsCoords(link);
    if (fromLink) return fromLink;
  }
  return null;
}
