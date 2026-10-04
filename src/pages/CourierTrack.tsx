import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../context";
import { get } from "../lib/api";
import { money, statusClass, statusLabel } from "../lib/format";
import { Btn, PrintBtn, PrintLetterhead } from "../components/ui";
import { OsmMap } from "../components/OsmMap";
import { useCourierGps } from "../hooks/useCourierGps";

const CUSTODY = new Set(["out_for_delivery", "rescheduled", "customer_unavailable", "pending_settlement", "pending_delivery"]);
const COLORS = ["#0f766e", "#1d4ed8", "#7c3aed", "#c2410c", "#be123c"];

function pinCoords(lat: unknown, lng: unknown) {
  const a = Number(lat);
  const b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b) || (a === 0 && b === 0)) return null;
  return { lat: a, lng: b };
}

export default function CourierTrack() {
  const { tr, lang, user, settings } = useApp();
  const gps = useCourierGps();
  const fleet = user?.role_slug !== "delivery";
  const [orders, setOrders] = useState<any[]>([]);
  const [live, setLive] = useState<{ agents: any[]; trail: any[] }>({ agents: [], trail: [] });

  async function loadOrders() {
    const r = await get<{ data: any[] }>("/api/delivery/orders");
    setOrders((r.data || []).filter((o) => CUSTODY.has(String(o.delivery_status || ""))));
  }

  async function loadLive() {
    const r = await get<{ data: { agents: any[]; trail: any[] } }>("/api/delivery/tracking/live");
    setLive(r.data);
  }

  useEffect(() => {
    loadOrders().catch(() => {});
    const t = window.setInterval(() => loadOrders().catch(() => {}), 60000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (!fleet) return;
    loadLive().catch(() => {});
    const t = window.setInterval(() => loadLive().catch(() => {}), 8000);
    return () => window.clearInterval(t);
  }, [fleet]);

  const shop = { lat: Number(settings.workplace_lat || 30.0566), lng: Number(settings.workplace_lng || 31.3300) };
  const pos = gps.pos;
  const fleetMarkers = (live.agents || []).flatMap((a, i) => {
    const p = pinCoords(a.lat, a.lng);
    if (!p) return [];
    const raw = String(a.last_seen_at || "").trim();
    const iso = raw.includes("T") ? raw : raw.replace(" ", "T");
    const seen = raw ? Date.parse(/Z|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`) : 0;
    const stale = Boolean(a.stale) || !seen || Date.now() - seen > 90_000;
    return [{
      id: a.id,
      lat: p.lat,
      lng: p.lng,
      label: a.code || a.name || "•",
      color: COLORS[i % COLORS.length],
      stale,
      popup: `<b>${a.name}</b> (${a.code})<br/>${stale ? tr("offline") : tr("online")}<br/>${tr("lastSeen")}: ${a.last_seen_at || "-"}`,
    }];
  });
  const destMarkers = orders
    .filter((o) => pinCoords(o.dest_lat, o.dest_lng))
    .map((o) => ({
      id: `ord-${o.id}`,
      lat: Number(o.dest_lat),
      lng: Number(o.dest_lng),
      label: o.number?.slice(-4) || "•",
      color: "#c2410c",
      popup: `<b>${o.number}</b><br/>${o.customer_name || ""}`,
    }));
  const markers = fleet ? fleetMarkers : destMarkers;
  const firstFleet = fleetMarkers[0];
  const center = fleet ? firstFleet || shop : pos || shop;
  const toDest = !fleet && pos
    ? destMarkers.map((m) => ({ color: "#c2410c", dashed: true, points: [pos, { lat: m.lat, lng: m.lng }] }))
    : [];

  return (
    <div className="space-y-4">
      <PrintLetterhead title={tr("liveTrack")} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link to={fleet ? "/delivery" : "/courier"} className="text-sm text-slate-500">{fleet ? tr("delivery") : tr("myOrders")}</Link>
          <h1 className="text-2xl font-black">{tr("liveTrack")}</h1>
          <p className="text-sm text-slate-500">{fleet ? tr("couriers") : user?.full_name}</p>
        </div>
        <div className="no-print flex gap-2">
          {gps.enabled ? (
            <Btn kind={gps.paused ? "primary" : "danger"} onClick={() => gps.setPaused(!gps.paused)}>
              {gps.paused ? tr("startTracking") : tr("stopTracking")}
            </Btn>
          ) : null}
          <PrintBtn />
        </div>
      </div>
      {gps.enabled && gps.status === "denied" ? <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{tr("gpsNeedPermission")}</div> : null}
      {fleet && !fleetMarkers.length ? <div className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">{tr("noCourierFix")}</div> : null}
      <OsmMap center={center} shop={shop} self={fleet ? null : pos} markers={markers} trails={toDest} height={fleet ? 480 : 360} />
      {fleet ? (
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{tr("agent")}</th>
                  <th>{tr("status")}</th>
                  <th>{tr("openOrders")}</th>
                  <th>{tr("lastSeen")}</th>
                </tr>
              </thead>
              <tbody>
                {(live.agents || []).map((a) => {
                  const p = pinCoords(a.lat, a.lng);
                  const raw = String(a.last_seen_at || "").trim();
                  const iso = raw.includes("T") ? raw : raw.replace(" ", "T");
                  const seen = raw ? Date.parse(/Z|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`) : 0;
                  const online = !a.stale && seen > 0 && Date.now() - seen < 90_000;
                  return (
                    <tr key={a.id}>
                      <td>{a.name} ({a.code})</td>
                      <td><span className={statusClass(online ? "in" : "out")}>{online ? tr("online") : tr("offline")}</span></td>
                      <td>{a.open_orders || 0}</td>
                      <td className="text-xs">{p ? `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)} · ${a.last_seen_at || "-"}` : tr("waitingGps")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-2xl bg-white p-4 text-sm">
            <div>{tr("openOrders")}: <b>{orders.length}</b></div>
            {pos ? <div>GPS: {pos.lat.toFixed(5)}, {pos.lng.toFixed(5)}</div> : <div className="text-slate-400">{tr("waitingGps")}</div>}
            {gps.lastPing ? <div className="text-xs text-slate-400">{tr("lastSeen")}: {gps.lastPing}</div> : null}
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{tr("invoiceNo")}</th>
                    <th>{tr("customer")}</th>
                    <th>{tr("area")}</th>
                    <th>{tr("total")}</th>
                    <th>{tr("status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((r) => (
                    <tr key={r.id}>
                      <td className="font-bold">{r.number}</td>
                      <td>{r.customer_name}</td>
                      <td>{r.area}</td>
                      <td>{money(r.total, lang)}</td>
                      <td><span className={statusClass(r.delivery_status)}>{statusLabel(r.delivery_status, lang)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
