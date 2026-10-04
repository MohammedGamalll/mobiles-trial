import { useEffect, useState } from "react";
import { useApp } from "../context";
import { post } from "../lib/api";

const PAUSE_KEY = "motamayez_gps_paused";

export type CourierGpsStatus = "off" | "paused" | "waiting" | "live" | "skipped" | "denied";

type Snap = {
  status: CourierGpsStatus;
  pos: { lat: number; lng: number } | null;
  lastPing: string;
  err: string;
  paused: boolean;
};

const listeners = new Set<() => void>();
let snap: Snap = { status: "off", pos: null, lastPing: "", err: "", paused: false };
let watchId: number | null = null;
let lastSent = 0;
let intervalMs = 20000;
let currentEnabled = false;
let eventsBound = false;

function emit(part: Partial<Snap>) {
  snap = { ...snap, ...part };
  listeners.forEach((fn) => fn());
}

function pausedFromStore() {
  try {
    return localStorage.getItem(PAUSE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setCourierGpsPaused(paused: boolean) {
  try {
    localStorage.setItem(PAUSE_KEY, paused ? "1" : "0");
  } catch {
    /* ignore */
  }
  emit({ paused, status: paused ? "paused" : snap.status === "paused" ? "waiting" : snap.status });
  window.dispatchEvent(new Event("motamayez-gps"));
}

async function send(lat: number, lng: number, accuracy?: number, heading?: number, force = false) {
  const now = Date.now();
  if (!force && now - lastSent < intervalMs) return;
  lastSent = now;
  try {
    const res = await post<{ ok?: boolean; skipped?: string; at?: string }>("/api/delivery/tracking/ping", {
      lat,
      lng,
      accuracy,
      heading,
    });
    if (res.skipped) emit({ err: "", status: "skipped" });
    else emit({ err: "", status: "live", lastPing: res.at || "" });
  } catch {
    /* retry on next watch tick */
  }
}

function stopWatch() {
  if (watchId != null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
  watchId = null;
}

function startWatch() {
  if (watchId != null) return;
  if (!navigator.geolocation) {
    emit({ status: "denied", err: "gpsUnavailable" });
    return;
  }
  emit({ status: "waiting" });
  watchId = navigator.geolocation.watchPosition(
    (p) => {
      const pos = { lat: p.coords.latitude, lng: p.coords.longitude };
      emit({ pos });
      void send(pos.lat, pos.lng, p.coords.accuracy, p.coords.heading ?? undefined, lastSent === 0);
    },
    () => emit({ status: "denied", err: "gpsUnavailable" }),
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
  );
}

function syncEngine(enabled: boolean, nextInterval: number) {
  currentEnabled = enabled;
  intervalMs = nextInterval;
  const paused = pausedFromStore();
  emit({ paused });
  if (!enabled) {
    stopWatch();
    emit({ status: "off" });
    return;
  }
  if (paused) {
    stopWatch();
    emit({ status: "paused" });
    return;
  }
  startWatch();
}

export function useCourierGps() {
  const { user, settings } = useApp();
  const enabled = user?.role_slug === "delivery" && Boolean(user.delivery_agent_id);
  const nextInterval = Math.max(10, Number(settings.gps_ping_interval_s || 20) || 20) * 1000;
  const [state, setState] = useState(snap);

  useEffect(() => {
    const sub = () => setState({ ...snap });
    listeners.add(sub);
    syncEngine(enabled, nextInterval);
    if (!eventsBound) {
      eventsBound = true;
      const onEvt = () => syncEngine(currentEnabled, intervalMs);
      window.addEventListener("motamayez-gps", onEvt);
      window.addEventListener("storage", onEvt);
    }
    return () => {
      listeners.delete(sub);
    };
  }, [enabled, nextInterval]);

  return {
    enabled,
    ...state,
    setPaused: setCourierGpsPaused,
  };
}
