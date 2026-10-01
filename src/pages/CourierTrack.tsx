import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../context";
import { get, post } from "../lib/api";
import { money, statusClass, statusLabel } from "../lib/format";
import { Btn, PrintBtn, PrintLetterhead } from "../components/ui";
import { OsmMap } from "../components/OsmMap";

export default function CourierTrack() {
  const { tr, lang, user, settings } = useApp();
  const [on, setOn] = useState(false);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [err, setErr] = useState("");
  const [orders, setOrders] = useState<any[]>([]);
  const watch = useRef<number | null>(null);

  async function loadOrders() {
    const r = await get<{ data: any[] }>("/api/delivery/orders?status=");
    setOrders((r.data || []).filter((o) => ["pending_delivery", "out_for_delivery", "rescheduled"].includes(o.delivery_status)));
  }
  useEffect(() => {
    loadOrders().catch(() => {});
  }, []);

  useEffect(() => {
    if (!on) {
      if (watch.current != null) navigator.geolocation.clearWatch(watch.current);
      watch.current = null;
      return;
    }
    if (!navigator.geolocation) {
      setErr(tr("gpsUnavailable"));
      return;
    }
    watch.current = navigator.geolocation.watchPosition(
      async (p) => {
        const next = { lat: p.coords.latitude, lng: p.coords.longitude };
        setPos(next);
        setErr("");
        try {
          await post("/api/delivery/location", {
            lat: next.lat,
            lng: next.lng,
            accuracy: p.coords.accuracy,
            heading: p.coords.heading,
            speed: p.coords.speed,
          });
        } catch (e: any) {
          setErr(e.message || tr("error"));
        }
      },
      (e) => setErr(e.message || tr("gpsUnavailable")),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 },
    );
    return () => {
      if (watch.current != null) navigator.geolocation.clearWatch(watch.current);
    };
  }, [on]);

  const shop = { lat: Number(settings.workplace_lat || 30.0566), lng: Number(settings.workplace_lng || 31.3300) };
  const center = pos || shop;

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
      <OsmMap center={center} shop={shop} self={pos} height={360} />
      <div className="rounded-2xl bg-white p-4 text-sm">
        <div>{tr("openOrders")}: <b>{orders.length}</b></div>
        {pos ? <div>GPS: {pos.lat.toFixed(5)}, {pos.lng.toFixed(5)}</div> : <div className="text-slate-400">{tr("waitingGps")}</div>}
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
