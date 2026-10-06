import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useApp } from "../context";
import { get, post } from "../lib/api";
import { money, statusClass, statusLabel } from "../lib/format";
import { Btn, ErrorNote, Field, PageLoading, inputCls } from "../components/ui";
import { apiMessage } from "../lib/errors";

const CUSTODY = new Set(["out_for_delivery", "rescheduled", "customer_unavailable", "pending_delivery", "pending_settlement"]);

type Row = {
  id: number;
  number: string;
  customer_name?: string;
  delivery_status?: string;
  remaining?: number;
  total?: number;
};

type Draft = {
  outcome: "delivered" | "rejected" | "damaged" | "returned";
  collected: number;
  charge_to: "courier" | "customer" | "company";
};

export default function DeliverySettle() {
  const { tr, lang, lookups } = useApp();
  const [params, setParams] = useSearchParams();
  const agents = (lookups?.delivery_agents || []).filter((a: any) => a.status !== "inactive");
  const [agentId, setAgentId] = useState(params.get("agent") || "");
  const [rows, setRows] = useState<Row[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  function patch(id: number, part: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...part } }));
  }

  async function load() {
    setErr("");
    setOk("");
    if (!agentId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const r = await get<{ data: Row[] }>(`/api/delivery/orders?agent_id=${agentId}`);
      const list = (r.data || []).filter((x) => CUSTODY.has(String(x.delivery_status || "")));
      setRows(list);
      setDrafts((prev) => {
        const next: Record<number, Draft> = {};
        for (const inv of list) {
          next[inv.id] = prev[inv.id] || {
            outcome: "delivered",
            collected: Number(inv.remaining) || Number(inv.total) || 0,
            charge_to: "courier",
          };
        }
        return next;
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch((e) => setErr(apiMessage(tr, e)));
  }, [agentId]);

  const canSubmit = Boolean(agentId) && rows.length > 0 && !busy;

  const ordersPayload = useMemo(
    () =>
      rows.map((inv) => {
        const d = drafts[inv.id];
        const outcome = d?.outcome || "delivered";
        return {
          invoice_id: inv.id,
          outcome,
          collected: outcome === "delivered" ? Number(d?.collected || 0) : undefined,
          charge_to: outcome === "damaged" ? d?.charge_to || "courier" : undefined,
        };
      }),
    [rows, drafts],
  );

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setErr("");
    setOk("");
    try {
      await post("/api/delivery/settle", { delivery_agent_id: Number(agentId), orders: ordersPayload });
      setOk(tr("settlementOk"));
      await load();
    } catch (e) {
      setErr(apiMessage(tr, e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link to="/delivery" className="text-sm text-slate-500">{tr("delivery")}</Link>
          <h1 className="text-2xl font-black">{tr("settleCourier")}</h1>
        </div>
      </div>
      <div className="mb-4 max-w-sm">
        <Field label={tr("agent")}>
          <select
            className={inputCls}
            value={agentId}
            onChange={(e) => {
              const v = e.target.value;
              setAgentId(v);
              setParams(v ? { agent: v } : {}, { replace: true });
            }}
          >
            <option value="">{tr("agent")}</option>
            {agents.map((a: any) => (
              <option key={a.id} value={a.id}>{a.name} ({a.code})</option>
            ))}
          </select>
        </Field>
      </div>
      <ErrorNote message={err} />
      {ok ? <div className="mb-3 text-sm text-emerald-700">{ok}</div> : null}
      {loading ? <PageLoading /> : !rows.length ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center text-slate-400">{tr("noData")}</div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{tr("invoiceNo")}</th>
                  <th>{tr("customer")}</th>
                  <th>{tr("status")}</th>
                  <th>{tr("remaining")}</th>
                  <th>{tr("deliveryResult")}</th>
                  <th>{tr("collect")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((inv) => {
                  const d = drafts[inv.id] || { outcome: "delivered" as const, collected: 0, charge_to: "courier" as const };
                  return (
                    <tr key={inv.id}>
                      <td><Link className="font-bold text-cyan-800" to={`/sales/${inv.id}`}>{inv.number}</Link></td>
                      <td>{inv.customer_name}</td>
                      <td><span className={statusClass(inv.delivery_status)}>{statusLabel(inv.delivery_status, lang)}</span></td>
                      <td>{money(inv.remaining ?? inv.total, lang)}</td>
                      <td>
                        <select className={inputCls} value={d.outcome} onChange={(e) => patch(inv.id, { outcome: e.target.value as Draft["outcome"] })}>
                          <option value="delivered">{tr("outcomeDelivered")}</option>
                          <option value="rejected">{tr("outcomeRejected")}</option>
                          <option value="returned">{tr("outcomeReturned")}</option>
                          <option value="damaged">{tr("outcomeDamaged")}</option>
                        </select>
                      </td>
                      <td>
                        {d.outcome === "delivered" ? (
                          <input className={inputCls} type="number" min={0} value={d.collected} onChange={(e) => patch(inv.id, { collected: Number(e.target.value) })} />
                        ) : null}
                        {d.outcome === "damaged" ? (
                          <select className={inputCls} value={d.charge_to} onChange={(e) => patch(inv.id, { charge_to: e.target.value as Draft["charge_to"] })}>
                            <option value="courier">{tr("chargeCourier")}</option>
                            <option value="customer">{tr("chargeCustomer")}</option>
                            <option value="company">{tr("chargeCompany")}</option>
                          </select>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div className="mt-4">
        <Btn loading={busy} disabled={!canSubmit || loading} onClick={() => void submit()}>{busy ? tr("loading") : tr("submitSettlement")}</Btn>
      </div>
    </div>
  );
}
