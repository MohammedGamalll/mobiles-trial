import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../context";
import { get, post } from "../lib/api";
import { apiMessage } from "../lib/errors";
import { money, statusClass, statusLabel } from "../lib/format";
import { Btn, PrintBtn, PrintLetterhead } from "../components/ui";
import { OsmMap } from "../components/OsmMap";

const CUSTODY = new Set(["out_for_delivery", "rescheduled", "customer_unavailable"]);

export default function CourierTrack() {
  const { tr, lang, user, settings } = useApp();
  const [on, setOn] = useState(false);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [err, setErr] = useState("");
  const [hint, setHint] = useState("");
  const [orders, setOrders] = useState<any[]>([]);
  const [lastPing, setLastPing] = useState("");
  const timer = useRef<number | null>(null);
  const intervalMs = Math.max(10, Number(settings.gps_ping_interval_s || 20) || 20) * 1000;

  async function loadOrders() {
    const r = await get<{ data: any[] }>("/api/delivery/orders");
    setOrders((r.data || []).filter((o) => CUSTODY.has(String(o.delivery_status || ""))));
  }

  async function pingOnce() {
    if (!navigator.geolocation) {
      setErr(tr("gpsUnavailable"));
      return;
    }
    await new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (p) => {
          const next = { lat: p.coords.latitude, lng: p.coords.longitude };
          setPos(next);
          try {
            const res = await post<{ ok: boolean; skipped?: string; at?: string }>("/api/delivery/tracking/ping", {
              lat: next.lat,
              lng: next.lng,
              accuracy: p.coords.accuracy,
              heading: p.coords.heading,
            });
            if (res.skipped) {
              setHint(tr("pingSkipped"));
              setErr("");
            } else {
              setHint("");
              setErr("");
              setLastPing(res.at || "");
            }
          } catch (e) {
            setHint("");
            setErr(apiMessage(tr, e));
          }
          resolve();
        },
        (e) => {
          setErr(e.message || tr("gpsUnavailable"));
          resolve();
        },
        { enableHighAccuracy: true, maximumAge: 15000, timeout: 15000 },
      );
    });
  }

  useEffect(() => {
    loadOrders().catch(() => {});
    const t = window.setInterval(() => loadOrders().catch(() => {}), 60000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (timer.current != null) window.clearInterval(timer.current);
    timer.current = null;
    if (!on) return;
    void pingOnce();
    timer.current = window.setInterval(() => void pingOnce(), intervalMs);
    return () => {
      if (timer.current != null) window.clearInterval(timer.current);
    };
  }, [on, intervalMs]);

  const shop = { lat: Number(settings.workplace_lat || 30.0566), lng: Number(settings.workplace_lng || 31.3300) };
  const center = pos || shop;
  const destMarkers = orders
    .filter((o) => Number(o.dest_lat) && Number(o.dest_lng))
    .map((o) => ({
      id: `ord-${o.id}`,
      lat: Number(o.dest_lat),
      lng: Number(o.dest_lng),
      label: o.number?.slice(-4) || "•",
      color: "#c2410c",
      popup: `<b>${o.number}</b><br/>${o.customer_name || ""}`,
    }));
  const toDest = pos
    ? destMarkers.map((m) => ({ color: "#c2410c", dashed: true, points: [pos, { lat: m.lat, lng: m.lng }] }))
    : [];

  return (
    <div className="space-y-4">
      <PrintLetterhead title={tr("liveTrack")} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link to="/delivery" className="text-sm text-slate-500">{tr("delivery")}</Link>
          <h1 className="text-2xl font-black">{tr("liveTrack")}</h1>
          <p className="text-sm text-slate-500">{user?.full_name}</p>
        </div>
        <div className="no-print flex gap-2">
          <Btn kind={on ? "danger" : "primary"} onClick={() => setOn((v) => !v)}>
            {on ? tr("stopTracking") : tr("startTracking")}
          </Btn>
          <PrintBtn />
        </div>
      </div>
      {err ? <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div> : null}
      {hint ? <div className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">{hint}</div> : null}
      <OsmMap center={center} shop={shop} self={pos} markers={destMarkers} trails={toDest} height={360} />
      <div className="rounded-2xl bg-white p-4 text-sm">
        <div>{tr("openOrders")}: <b>{orders.length}</b></div>
        {pos ? <div>GPS: {pos.lat.toFixed(5)}, {pos.lng.toFixed(5)}</div> : <div className="text-slate-400">{tr("waitingGps")}</div>}
        {lastPing ? <div className="text-xs text-slate-400">{tr("lastSeen")}: {lastPing}</div> : null}
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
                  <td><Link className="font-bold text-cyan-800" to={`/sales/${r.id}`}>{r.number}</Link></td>
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
    </div>
  );
}
