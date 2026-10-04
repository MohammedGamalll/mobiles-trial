import { useEffect, useState } from "react";
import { Phone, MapPin, Banknote } from "lucide-react";
import { useApp } from "../context";
import { get, post } from "../lib/api";
import { apiMessage } from "../lib/errors";
import { money, statusClass, statusLabel } from "../lib/format";
import { Btn, ErrorNote, PageLoading } from "../components/ui";

const ACTIVE = new Set(["out_for_delivery", "rescheduled", "customer_unavailable"]);

type Order = {
  id: number;
  number: string;
  customer_name?: string;
  customer_phone?: string;
  remaining?: number;
  total?: number;
  address?: string;
  area?: string;
  dest_lat?: number | null;
  dest_lng?: number | null;
  delivery_status?: string;
};

function mapsHref(o: Order) {
  const lat = Number(o.dest_lat);
  const lng = Number(o.dest_lng);
  if (lat && lng) return `https://maps.google.com/?q=${lat},${lng}`;
  const q = [o.address, o.area].filter(Boolean).join(" ");
  return q ? `https://maps.google.com/?q=${encodeURIComponent(q)}` : "";
}

export default function CourierDashboard() {
  const { tr, lang } = useApp();
  const [rows, setRows] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await get<{ data: Order[] }>("/api/delivery/orders");
      setRows((r.data || []).filter((x) => ACTIVE.has(String(x.delivery_status || ""))));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch((e) => setErr(apiMessage(tr, e)));
  }, []);

  async function mark(id: number) {
    setBusyId(id);
    setErr("");
    try {
      await post(`/api/delivery/orders/${id}/mark-delivered`, {});
      setRows((cur) => cur.filter((x) => x.id !== id));
    } catch (e) {
      setErr(apiMessage(tr, e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 pb-8">
      <div>
        <h1 className="text-2xl font-black">{tr("myOrders")}</h1>
        <p className="text-sm font-bold text-slate-500">{tr("delivery")}</p>
      </div>
      <ErrorNote message={err} />
      {loading ? <PageLoading /> : null}
      {!loading && !rows.length ? (
        <div className="rounded-3xl border border-slate-100 bg-white p-8 text-center text-slate-400">{tr("courierNoOrders")}</div>
      ) : null}
      {rows.map((o) => {
        const due = Number(o.remaining ?? o.total) || 0;
        const map = mapsHref(o);
        const phone = String(o.customer_phone || "").replace(/\D/g, "");
        return (
          <article key={o.id} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-lg font-black">{o.customer_name || tr("walkIn")}</div>
                <div className="text-xs font-bold text-slate-400">{o.number}</div>
              </div>
              <span className={statusClass(o.delivery_status)}>{statusLabel(o.delivery_status, lang)}</span>
            </div>
            <div className="mt-3 flex items-center gap-2 text-base font-black">
              <Banknote size={18} />
              <span>{tr("collectAmount")}</span>
              <span className="ms-auto text-teal-800">{money(due, lang)}</span>
            </div>
            {o.address || o.area ? (
              <div className="mt-2 text-sm font-bold text-slate-600">{[o.area, o.address].filter(Boolean).join(" — ")}</div>
            ) : null}
            <div className="mt-4 grid grid-cols-2 gap-2">
              {phone ? (
                <a className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-50 px-3 text-sm font-black text-emerald-800" href={`tel:${phone}`}>
                  <Phone size={16} /> {o.customer_phone}
                </a>
              ) : (
                <div className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-slate-50 text-sm text-slate-400">{tr("phone")}</div>
              )}
              {map ? (
                <a className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-sky-50 px-3 text-sm font-black text-sky-800" href={map} target="_blank" rel="noreferrer">
                  <MapPin size={16} /> {tr("viewLocation")}
                </a>
              ) : (
                <div className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-slate-50 text-sm text-slate-400">{tr("viewLocation")}</div>
              )}
            </div>
            <Btn className="mt-3 min-h-14 w-full rounded-2xl text-base" disabled={busyId === o.id} onClick={() => void mark(o.id)}>
              {busyId === o.id ? tr("loading") : tr("markDelivered")}
            </Btn>
          </article>
        );
      })}
    </div>
  );
}
