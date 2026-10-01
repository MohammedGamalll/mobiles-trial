export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export type PingCheck = {
  ok: boolean;
  code?: "gps_required" | "gps_accuracy" | "gps_spoof";
  dist?: number;
  dtS?: number;
};

export function pingDistanceOk(
  prev: { lat: number; lng: number; accuracy?: number | null; recorded_at: string } | null,
  next: { lat: number; lng: number; accuracy?: number | null },
  nowMs: number,
  maxKmh = 120,
  maxAccuracyM = 100,
): PingCheck {
  if (!Number.isFinite(next.lat) || !Number.isFinite(next.lng)) return { ok: false, code: "gps_required" };
  if (Math.abs(next.lat) > 90 || Math.abs(next.lng) > 180) return { ok: false, code: "gps_required" };
  const acc = Number(next.accuracy);
  if (Number.isFinite(acc) && acc > maxAccuracyM) return { ok: false, code: "gps_accuracy" };
  if (!prev) return { ok: true };
  const prevMs = Date.parse(String(prev.recorded_at).replace(" ", "T") + (String(prev.recorded_at).includes("Z") ? "" : "Z"));
  const dtS = Math.max(1, Number.isFinite(prevMs) ? (nowMs - prevMs) / 1000 : 20);
  const dist = haversineMeters(prev.lat, prev.lng, next.lat, next.lng);
  const slack = Number(prev.accuracy || 0) + Number(next.accuracy || 0);
  const maxM = ((maxKmh * 1000) / 3600) * dtS + slack;
  if (dist > maxM) return { ok: false, code: "gps_spoof", dist, dtS };
  return { ok: true, dist, dtS };
}

export function workplaceFromSettings(settings: Record<string, string>) {
  return {
    lat: Number(settings.workplace_lat || 0),
    lng: Number(settings.workplace_lng || 0),
    meters: Number(settings.geofence_meters || 100),
    shiftStart: settings.shift_start || "09:00",
  };
}
