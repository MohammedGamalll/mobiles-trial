import assert from "node:assert/strict";
import test from "node:test";
import { haversineMeters, pingDistanceOk } from "../worker/lib/geo.ts";

const cairo = { lat: 30.0444, lng: 31.2357 };

test("first ping is accepted", () => {
  const r = pingDistanceOk(null, cairo, Date.now());
  assert.equal(r.ok, true);
});

test("200m in 20s is accepted at 120 km/h cap", () => {
  const now = Date.parse("2026-10-01T18:00:20Z");
  const prev = { ...cairo, accuracy: 10, recorded_at: "2026-10-01 18:00:00" };
  const nextLat = cairo.lat + 200 / 111320;
  const r = pingDistanceOk(prev, { lat: nextLat, lng: cairo.lng, accuracy: 10 }, now, 120, 100);
  assert.equal(r.ok, true);
  assert.ok((r.dist || 0) > 150 && (r.dist || 0) < 250);
});

test("8km in 20s is spoof", () => {
  const now = Date.parse("2026-10-01T18:00:20Z");
  const prev = { ...cairo, accuracy: 10, recorded_at: "2026-10-01 18:00:00" };
  const nextLat = cairo.lat + 8000 / 111320;
  const r = pingDistanceOk(prev, { lat: nextLat, lng: cairo.lng, accuracy: 10 }, now, 120, 100);
  assert.equal(r.ok, false);
  assert.equal(r.code, "gps_spoof");
});

test("bad accuracy and invalid coords reject", () => {
  assert.equal(pingDistanceOk(null, { lat: 91, lng: 31 }, Date.now()).code, "gps_required");
  assert.equal(pingDistanceOk(null, { lat: 30, lng: 31, accuracy: 150 }, Date.now()).code, "gps_accuracy");
});

test("haversine is roughly 111km per degree latitude", () => {
  const m = haversineMeters(30, 31, 31, 31);
  assert.ok(m > 110000 && m < 112000);
});
