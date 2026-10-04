import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../context";
import { get } from "../lib/api";
import { money, statusClass, statusLabel } from "../lib/format";
import { Btn, PrintBtn, PrintLetterhead } from "../components/ui";
import { OsmMap } from "../components/OsmMap";
import { useCourierGps } from "../hooks/useCourierGps";

const CUSTODY = new Set(["out_for_delivery", "rescheduled", "customer_unavailable", "pending_settlement", "pending_delivery"]);

export default function CourierTrack() {
  const { tr, lang, user, settings } = useApp();
  const gps = useCourierGps();
  const [orders, setOrders] = useState<any[]>([]);

  async function loadOrders() {
    const r = await get<{ data: any[] }>("/api/delivery/orders");
    setOrders((r.data || []).filter((o) => CUSTODY.has(String(o.delivery_status || ""))));
  }

  useEffect(() => {
    loadOrders().catch(() => {});
    const t = window.setInterval(() => loadOrders().catch(() => {}), 60000);
    return () => window.clearInterval(t);
  }, []);

  const shop = { lat: Number(settings.workplace_lat || 30.0566), lng: Number(settings.workplace_lng || 31.3300) };
  const pos = gps.pos;
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
          <Link to="/courier" className="text-sm text-slate-500">{tr("myOrders")}</Link>
          <h1 className="text-2xl font-black">{tr("liveTrack")}</h1>
          <p className="text-sm text-slate-500">{user?.full_name}</p>
        </div>
        <div className="no-print flex gap-2">
          <Btn kind={gps.paused ? "primary" : "danger"} onClick={() => gps.setPaused(!gps.paused)}>
            {gps.paused ? tr("startTracking") : tr("stopTracking")}
          </Btn>
          <PrintBtn />
        </div>
      </div>
      {gps.status === "denied" ? <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{tr("gpsNeedPermission")}</div> : null}
      {gps.status === "skipped" ? <div className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">{tr("gpsNoOrders")}</div> : null}
      <OsmMap center={center} shop={shop} self={pos} markers={destMarkers} trails={toDest} height={360} />
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
    </div>
  );
}
