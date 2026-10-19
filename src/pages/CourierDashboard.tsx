import { useEffect, useMemo, useState } from "react";
import { Banknote, CheckCircle2, MapPin, MessageCircle, Phone, Search } from "lucide-react";
import { useApp } from "../context";
import { get, post } from "../lib/api";
import { apiMessage } from "../lib/errors";
import { collectDue, money, statusClass, statusLabel } from "../lib/format";
import { Btn, ErrorNote, PageLoading, inputCls } from "../components/ui";
import { waMeLink } from "../lib/whatsapp";
import { useCourierGps } from "../hooks/useCourierGps";

type Order = {
  id: number;
  number: string;
  customer_name?: string;
  customer_phone?: string;
  remaining?: number;
  total?: number;
  paid?: number;
  address?: string;
  area?: string;
  dest_lat?: number | null;
  dest_lng?: number | null;
  status?: string;
  delivery_status?: string | null;
  notes?: string;
};

function mapsHref(o: Order) {
  const lat = Number(o.dest_lat);
  const lng = Number(o.dest_lng);
  if (lat && lng) return `https://maps.google.com/?q=${lat},${lng}`;
  const q = [o.address, o.area].filter(Boolean).join(" ");
  return q ? `https://maps.google.com/?q=${encodeURIComponent(q)}` : "";
}

function isMarked(o: Order) {
  return o.status === "pending_settlement" || o.delivery_status === "pending_settlement";
}

function isConfirmed(o: Order) {
  return ["delivered", "completed"].includes(String(o.status || "")) || ["delivered", "completed"].includes(String(o.delivery_status || ""));
}

export default function CourierDashboard() {
  const { tr, lang, can } = useApp();
  useCourierGps();
  const [tab, setTab] = useState<"open" | "done">("open");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Order[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [doneCount, setDoneCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busyId, setBusyId] = useState(0);

  async function load(nextTab = tab, nextQ = q) {
    setLoading(true);
    setErr("");
    try {
      const p = new URLSearchParams({ tab: nextTab });
      if (nextQ.trim()) p.set("q", nextQ.trim());
      const r = await get<{ data: Order[]; open_count?: number; done_count?: number }>(`/api/delivery/orders?${p}`);
      setRows(r.data || []);
      setOpenCount(Number(r.open_count || 0));
      setDoneCount(Number(r.done_count || 0));
    } catch (e) {
      setErr(apiMessage(tr, e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch((e) => setErr(apiMessage(tr, e)));
  }, []);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((o) =>
      [o.number, o.customer_name, o.customer_phone, o.area, o.address].some((v) => String(v || "").toLowerCase().includes(needle)),
    );
  }, [rows, q]);

  async function markDone(o: Order) {
    if (busyId) return;
    setBusyId(o.id);
    setErr("");
    setMsg("");
    try {
      await post(`/api/delivery/orders/${o.id}/mark-delivered`, {});
      setMsg(tr("markDeliveredOk"));
      setTab("done");
      await load("done", q);
    } catch (e) {
      setErr(apiMessage(tr, e));
    } finally {
      setBusyId(0);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 pb-10">
      <div>
        <h1 className="text-2xl font-black">{tr("myOrders")}</h1>
        <p className="text-sm font-bold text-slate-500">{tr("delivery")}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => { setTab("open"); void load("open", q); }}
          className={`rounded-2xl border p-3 text-start ${tab === "open" ? "border-amber-300 bg-amber-50" : "border-slate-100 bg-white"}`}
        >
          <div className="text-xs font-bold text-slate-500">{tr("courierStill")}</div>
          <div className="text-2xl font-black tabular-nums">{openCount}</div>
        </button>
        <button
          type="button"
          onClick={() => { setTab("done"); void load("done", q); }}
          className={`rounded-2xl border p-3 text-start ${tab === "done" ? "border-emerald-300 bg-emerald-50" : "border-slate-100 bg-white"}`}
        >
          <div className="text-xs font-bold text-slate-500">{tr("courierDone")}</div>
          <div className="text-2xl font-black tabular-nums">{doneCount}</div>
        </button>
      </div>

      <label className="flex items-center gap-2 rounded-2xl border border-slate-100 bg-white px-3 py-2">
        <Search size={16} className="text-slate-400" />
        <input
          className={`${inputCls} border-0 bg-transparent px-0 shadow-none`}
          placeholder={tr("courierSearch")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void load(tab, q);
          }}
        />
      </label>

      <ErrorNote message={err} />
      {msg ? <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">{msg}</div> : null}
      {loading ? <PageLoading /> : null}

      {!loading && !shown.length ? (
        <div className="rounded-3xl border border-slate-100 bg-white p-8 text-center text-slate-400">
          {tab === "done" ? tr("courierDoneEmpty") : tr("courierOpenEmpty")}
        </div>
      ) : null}

      {shown.map((o) => {
        const due = collectDue(o);
        const map = mapsHref(o);
        const phone = String(o.customer_phone || "").replace(/\D/g, "");
        const wa = waMeLink(o.customer_phone, `${tr("invoice")} ${o.number}`);
        const marked = isMarked(o);
        const confirmed = isConfirmed(o);
        return (
          <article key={o.id} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-lg font-black">{o.customer_name || tr("walkIn")}</div>
                <div className="text-xs font-bold text-slate-400">{o.number}</div>
              </div>
              <span className={statusClass(marked ? "pending_settlement" : o.status)}>
                {statusLabel(marked ? "pending_settlement" : o.status, lang)}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-2 text-base font-black">
              <Banknote size={18} />
              <span>{tr("collectAmount")}</span>
              <span className="ms-auto text-teal-800">{money(due, lang)}</span>
            </div>
            {o.address || o.area ? (
              <div className="mt-2 text-sm font-bold text-slate-600">{[o.area, o.address].filter(Boolean).join(" — ")}</div>
            ) : null}
            {marked || confirmed ? (
              <div className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">
                {confirmed ? statusLabel("delivered", lang) : tr("courierAwaitConfirm")}
                {marked ? <div className="mt-1 font-semibold text-emerald-700">{tr("courierMarkedHint")}</div> : null}
              </div>
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
            {wa ? (
              <a className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-teal-50 text-sm font-black text-teal-800" href={wa} target="_blank" rel="noreferrer">
                <MessageCircle size={16} /> {tr("whatsapp")}
              </a>
            ) : null}
            {can("delivery.mark") && !marked && !confirmed ? (
              <Btn className="mt-3 w-full" disabled={busyId === o.id} onClick={() => void markDone(o)}>
                <CheckCircle2 size={16} /> {busyId === o.id ? tr("loading") : tr("markDelivered")}
              </Btn>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
