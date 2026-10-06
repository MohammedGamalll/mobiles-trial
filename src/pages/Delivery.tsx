import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../context";
import { get, post, put, del } from "../lib/api";
import { money, statusClass, statusLabel } from "../lib/format";
import { Btn, Field, Modal, PrintBtn, PrintLetterhead, inputCls } from "../components/ui";
import { ListGate } from "../components/ListGate";
import { EmptyFilterState, SmartFilter } from "../components/SmartFilter";
import { useListQuery } from "../hooks/useListQuery";
import { useLiveList } from "../hooks/useLiveList";
import { OsmMap } from "../components/OsmMap";
import { ActionBtns, useConfirm } from "../components/Confirm";

export function DeliveryBoard() {
  const { tr, lang, can, user, settings } = useApp();
  const [tab, setTab] = useState<"orders" | "map" | "agents">(user?.role_slug === "delivery" ? "orders" : "orders");
  const f = useListQuery("delivery");
  const [rows, setRows] = useState<any[]>([]);
  const [live, setLive] = useState<{ agents: any[]; trail: any[] }>({ agents: [], trail: [] });
  const [liveErr, setLiveErr] = useState("");
  const [trailAgentId, setTrailAgentId] = useState<number | null>(null);
  const [agents, setAgents] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", code: "", phone: "", notes: "", status: "active", role_type: "delivery", commission_rate: 0, area: "", id: 0 });
  const { confirmDelete, dialog } = useConfirm();

  async function loadOrders() {
    const r = await get<{ data: any[] }>(`/api/delivery/orders?${f.qs}`);
    setRows(r.data);
  }
  async function loadLive(agentId = trailAgentId) {
    const q = agentId ? `?trail_agent_id=${agentId}` : "";
    try {
      const r = await get<{ data: { agents: any[]; trail: any[] } }>(`/api/delivery/tracking/live${q}`);
      setLive(r.data);
      setLiveErr("");
    } catch {
      const r = await get<{ data: { agents: any[]; trail: any[] } }>("/api/delivery/live");
      setLive(r.data);
      setLiveErr("");
    }
  }
  async function loadAgents() {
    const r = await get<{ data: any[] }>("/api/delivery/agents");
    setAgents(r.data);
  }

  const orders = useLiveList(loadOrders, [f.qs]);
  const agentsList = useLiveList(async () => {
    if (tab !== "agents") return;
    await loadAgents();
  }, [tab]);
  useEffect(() => {
    if (tab !== "map") return;
    loadLive().catch(() => setLiveErr("unreachable"));
    const t = setInterval(() => loadLive().catch(() => setLiveErr("unreachable")), 10000);
    return () => clearInterval(t);
  }, [tab, trailAgentId]);

  const shop = {
    lat: Number(settings.workplace_lat || 30.0566),
    lng: Number(settings.workplace_lng || 31.3300),
  };
  const colors = ["#0f766e", "#1d4ed8", "#7c3aed", "#c2410c", "#be123c"];
  const markers = (live.agents || [])
    .map((a) => ({ ...a, lat: Number(a.lat), lng: Number(a.lng) }))
    .filter((a) => Number.isFinite(a.lat) && Number.isFinite(a.lng) && (a.lat !== 0 || a.lng !== 0))
    .map((a, i) => {
      const raw = String(a.last_seen_at || "").trim();
      const iso = raw.includes("T") ? raw : raw.replace(" ", "T");
      const seen = raw ? Date.parse(/Z|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`) : 0;
      const stale = Boolean(a.stale) || !seen || Date.now() - seen > 90000;
      return {
        id: a.id,
        lat: a.lat,
        lng: a.lng,
        label: a.code,
        color: colors[i % colors.length],
        stale,
        popup: `<b>${a.name}</b> (${a.code})<br/>${stale ? tr("offline") : tr("online")}<br/>${tr("lastSeen")}: ${a.last_seen_at || "-"}<br/>${tr("openOrders")}: ${a.open_orders || 0}`,
      };
    });
  const trails = useMemo(() => {
    const points = (live.trail || []).map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) })).filter((p) => p.lat && p.lng);
    if (points.length < 2) return [];
    const i = (live.agents || []).findIndex((a) => a.id === trailAgentId);
    return [{ color: colors[i >= 0 ? i % colors.length : 0], points }];
  }, [live.trail, trailAgentId]);

  return (
    <div>
      <PrintLetterhead title={tr("delivery")} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-black">{tr("delivery")}</h1>
        <div className="no-print flex gap-2">
          {can("delivery.view", "delivery.mark") ? (
            <Link className="rounded-xl bg-teal-50 px-3 py-2 text-sm font-bold text-teal-800" to="/delivery/track">
              {tr("liveTrack")}
            </Link>
          ) : null}
          <PrintBtn />
        </div>
      </div>
      <div className="no-print mb-3 flex gap-1 rounded-xl bg-white p-1 shadow-sm">
        {(["orders", "map", "agents"] as const).map((k) => (
          <button key={k} className={`rounded-lg px-4 py-2 text-sm font-bold ${tab === k ? "bg-ink text-white" : "text-slate-600"}`} onClick={() => setTab(k)}>
            {k === "orders" ? tr("orders") : k === "map" ? tr("liveMap") : tr("couriers")}
          </button>
        ))}
      </div>

      {tab === "orders" ? (
        <>
          <SmartFilter f={f} fields={[
            { key: "status", label: "status", type: "select", quick: true, options: ["held", "completed", "partial", "fully_returned", "cancelled"].map((s) => ({ value: s, label: statusLabel(s, lang) })) },
            { key: "agent_id", label: "agent", type: "select", quick: true, lookup: "delivery_agents" },
            { key: "area", label: "area", type: "text" },
          ]} />
          <ListGate loading={orders.loading} err={orders.err} onRetry={orders.reload} empty={!rows.length} emptyFallback={<EmptyFilterState onClear={f.clear} />}>
            <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{tr("invoiceNo")}</th>
                      <th>{tr("customer")}</th>
                      <th>{tr("agent")}</th>
                      <th>{tr("area")}</th>
                      <th>{tr("total")}</th>
                      <th>{tr("status")}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td><Link className="font-bold text-cyan-800" to={`/sales/${r.id}`}>{r.number}</Link></td>
                        <td>
                          {r.customer_name}
                          <div className="text-xs text-slate-400">{r.customer_phone}</div>
                        </td>
                        <td>{`${r.delivery_agent_name || ""} (${r.delivery_agent_code || ""})`}</td>
                        <td>{r.area}</td>
                        <td>{money(r.total, lang)}</td>
                        <td><span className={statusClass(r.status)}>{statusLabel(r.status, lang)}</span></td>
                        <td></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </ListGate>
        </>
      ) : null}

      {tab === "map" ? (
        <div className="space-y-3">
          {liveErr ? (
            <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-800">{tr("error")}</div>
          ) : !markers.length ? (
            <div className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">{tr("noCourierFix")}</div>
          ) : null}
          <OsmMap
            center={markers.find((m) => m.id === trailAgentId) || markers[0] || shop}
            shop={shop}
            geofence={Number(settings.geofence_meters || 100)}
            markers={markers}
            trails={trails}
            onSelect={(id) => setTrailAgentId(Number(id))}
            height={520}
          />
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
                    const raw = String(a.last_seen_at || "").trim();
                    const iso = raw.includes("T") ? raw : raw.replace(" ", "T");
                    const seen = raw ? Date.parse(/Z|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`) : 0;
                    const online = !a.stale && seen > 0 && Date.now() - seen < 90000;
                    return (
                      <tr
                        key={a.id}
                        className={`cursor-pointer ${trailAgentId === a.id ? "bg-teal-50" : ""}`}
                        onClick={() => setTrailAgentId(a.id)}
                      >
                        <td>{a.name} ({a.code})</td>
                        <td><span className={statusClass(online ? "in" : "out")}>{online ? tr("online") : tr("offline")}</span></td>
                        <td>{a.open_orders || 0}</td>
                        <td className="text-xs">{a.last_seen_at || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "agents" ? (
        <div>
          {can("settings.edit", "hr.manage") ? (
            <Btn className="no-print mb-3" onClick={() => { setForm({ name: "", code: "", phone: "", notes: "", status: "active", role_type: "delivery", commission_rate: 0, area: "", id: 0 }); setOpen(true); }}>{tr("addCourier")}</Btn>
          ) : null}
          <ListGate loading={agentsList.loading} err={agentsList.err} onRetry={agentsList.reload} empty={!agents.length} emptyFallback={<div className="rounded-2xl bg-white p-8 text-center text-slate-400">{tr("noData")}</div>}>
            <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{tr("code")}</th>
                      <th>{tr("name")}</th>
                      <th>{tr("phone")}</th>
                      <th>{tr("roleType")}</th>
                      <th>{tr("area")}</th>
                      <th>{tr("status")}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {agents.map((a) => (
                      <tr key={a.id}>
                        <td className="font-bold">{a.code}</td>
                        <td>{a.name}</td>
                        <td>{a.phone}</td>
                        <td>{a.role_type === "sales" ? tr("roleSales") : a.role_type === "both" ? tr("roleBoth") : tr("roleDelivery")}</td>
                        <td>{a.area || "-"}</td>
                        <td><span className={statusClass(a.status === "active" ? "in" : "out")}>{a.status === "active" ? tr("active") : tr("inactive")}</span></td>
                        <td>
                          {can("settings.edit", "hr.manage") ? (
                            <ActionBtns
                              canEdit
                              canDelete
                              onEdit={() => { setForm({ ...a, notes: a.notes || "", role_type: a.role_type || "delivery", commission_rate: a.commission_rate || 0, area: a.area || "" }); setOpen(true); }}
                              onDelete={() => confirmDelete(a.name, async () => { await del(`/api/delivery/agents/${a.id}`); agentsList.reload(); })}
                            />
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </ListGate>
          <Modal open={open} title={form.id ? tr("edit") : tr("addCourier")} onClose={() => setOpen(false)}>
            <div className="space-y-3">
              <Field label={tr("name")}><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label={tr("code")}><input className={inputCls} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field>
              <Field label={tr("phone")}><input className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
              <Field label={tr("status")}>
                <select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="active">{tr("active")}</option>
                  <option value="inactive">{tr("inactive")}</option>
                </select>
              </Field>
              <Field label={tr("roleType")}>
                <select className={inputCls} value={form.role_type} onChange={(e) => setForm({ ...form, role_type: e.target.value })}>
                  <option value="delivery">{tr("roleDelivery")}</option>
                  <option value="sales">{tr("roleSales")}</option>
                  <option value="both">{tr("roleBoth")}</option>
                </select>
              </Field>
              <Field label={tr("commissionRate")}><input className={inputCls} type="number" value={form.commission_rate} onChange={(e) => setForm({ ...form, commission_rate: Number(e.target.value) })} /></Field>
              <Field label={tr("area")}><input className={inputCls} value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} /></Field>
              <Field label={tr("notes")}><input className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
              <Btn onClick={async () => {
                if (form.id) await put(`/api/delivery/agents/${form.id}`, form);
                else await post("/api/delivery/agents", form);
                setOpen(false);
                agentsList.reload();
              }}>{tr("save")}</Btn>
            </div>
          </Modal>
          {dialog}
        </div>
      ) : null}
    </div>
  );
}
