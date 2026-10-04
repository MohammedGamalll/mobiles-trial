import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useApp } from "../context";
import { get, post } from "../lib/api";
import { apiMessage } from "../lib/errors";
import { Btn, ErrorNote, Field, Modal, PageLoading, PrintBtn, inputCls } from "../components/ui";
import { InvoicePrint } from "../components/InvoicePrint";
import { useConfirm } from "../components/Confirm";
import { PaymentModal } from "../components/PaymentModal";
import { AssignCourierModal } from "../components/AssignCourierModal";

export default function Invoice() {
  const { id } = useParams();
  const { tr, lang, can, settings } = useApp();
  const [inv, setInv] = useState<any>(null);
  const [wa, setWa] = useState<any>(null);
  const [msg, setMsg] = useState("");
  const [waOpen, setWaOpen] = useState(false);
  const [opened, setOpened] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [retOpen, setRetOpen] = useState(false);
  const [resultType, setResultType] = useState("delivered");
  const [chargeTo, setChargeTo] = useState("courier");
  const [lines, setLines] = useState<any[]>([]);
  const [collected, setCollected] = useState(0);
  const { confirmDelete, dialog } = useConfirm();
  const [notes, setNotes] = useState("");
  const [custNotes, setCustNotes] = useState("");
  const [resultErr, setResultErr] = useState("");
  const [payAmt, setPayAmt] = useState(0);
  const [payOpen, setPayOpen] = useState(false);
  const [resultBusy, setResultBusy] = useState(false);

  async function reload() {
    const r = await get<{ data: any }>(`/api/invoices/${id}`);
    setInv(r.data);
    setLines((r.data.items || []).map((i: any) => ({ invoice_item_id: i.id, delivered_qty: i.quantity, returned_qty: 0 })));
    setCollected(r.data.remaining || r.data.total || 0);
  }
  useEffect(() => {
    reload().catch(() => {});
  }, [id]);

  if (!inv) return <PageLoading />;
  const waEnabled = settings.whatsapp_enabled !== "0";
  const inCustody = ["out_for_delivery", "rescheduled", "customer_unavailable"].includes(inv.delivery_status);

  async function preview(type = "invoice_created") {
    const r = await get<any>(`/api/invoices/${id}/whatsapp?type=${type}&lang=${lang}`);
    setWa(r);
    setMsg(r.message);
    setWaOpen(true);
    setOpened(false);
  }

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link to="/sales" className="text-sm text-slate-500">
            {tr("sales")}
          </Link>
          <h1 className="text-2xl font-black">{inv.number}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {waEnabled && can("whatsapp.send") ? (
            <Btn kind="soft" onClick={() => preview()}>
              {tr("sendWhatsapp")}
            </Btn>
          ) : null}
          <PrintBtn />
          <PrintBtn thermal />
          {inv.type === "delivery" && !["cancelled"].includes(inv.status) && !inv.settled_at ? (
            <>
              {can("delivery.update") && !["delivered", "customer_refused", "returned_to_warehouse", "damaged", "pending_settlement"].includes(String(inv.delivery_status || "")) ? (
                <Btn kind="ghost" onClick={() => setAssignOpen(true)}>
                  {tr("assignCourier")}
                </Btn>
              ) : null}
              {can("delivery.settle") && (inCustody || inv.delivery_status === "pending_delivery" || inv.delivery_status === "pending_settlement" || inv.delivery_agent_id) ? (
                <>
                  <Link className="ui-btn inline-flex items-center justify-center gap-2 rounded-xl bg-teal-50 px-3.5 py-2 text-sm font-bold text-teal-800 hover:bg-teal-100" to={`/delivery/settle${inv.delivery_agent_id ? `?agent=${inv.delivery_agent_id}` : ""}`}>
                    {tr("settleCourier")}
                  </Link>
                  <Btn onClick={() => { setResultErr(""); setResultOpen(true); }}>{tr("deliveryResult")}</Btn>
                </>
              ) : null}
            </>
          ) : null}
          {can("returns.create") && !["cancelled", "fully_returned", "held", "quote", "order"].includes(inv.status) ? (
            <Btn kind="ghost" onClick={() => setRetOpen(true)}>{tr("returnCreate")}</Btn>
          ) : null}
          {["held", "quote", "order"].includes(inv.status) && can("sales.create") ? (
            <Btn onClick={() => { window.location.href = `/pos?held=${inv.id}`; }}>{tr("resumeHeld")}</Btn>
          ) : null}
          {["held", "quote", "order"].includes(inv.status) && can("sales.create") ? (
            <Btn kind="soft" onClick={() => {
              if (inv.status === "quote") setPayOpen(true);
              else post(`/api/invoices/${id}/finalize`, {}).then(() => reload()).catch((e) => setMsg(apiMessage(tr, e)));
            }}>{tr("finalizeHeld")}</Btn>
          ) : null}
          {can("installments.manage") && inv.remaining > 0 && !["held", "quote", "order", "cancelled"].includes(inv.status) ? (
            <Btn kind="soft" onClick={() => { window.location.href = `/installments`; }}>{tr("installments")}</Btn>
          ) : null}
          {can("sales.cancel") && !["cancelled", "fully_returned"].includes(inv.status) ? (
            <Btn kind="danger" onClick={() => confirmDelete(inv.number, async () => { await post(`/api/invoices/${id}/cancel`, {}); reload(); })}>
              {tr("void")}
            </Btn>
          ) : null}
        </div>
      </div>

      <div className="print-sheet rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <InvoicePrint inv={inv} screen />
        {inv.customer_whatsapp ? (
          <div className="no-print mt-3 text-sm">
            <a className="font-bold text-emerald-700" href={`https://wa.me/${String(inv.customer_whatsapp).replace(/\D/g, "").replace(/^0/, "20")}`} target="_blank" rel="noreferrer">
              [{tr("whatsapp")}]
            </a>
          </div>
        ) : null}
      </div>

      {can("payments.create") && inv.remaining > 0 ? (
        <div className="no-print flex items-end gap-2 rounded-2xl bg-white p-4">
          <Field label={tr("payments")}>
            <input className={inputCls} type="number" value={payAmt} onChange={(e) => setPayAmt(Number(e.target.value))} />
          </Field>
          <Btn onClick={async () => { await post(`/api/invoices/${id}/pay`, { amount: payAmt, method: "cash" }); setPayAmt(0); reload(); }}>{tr("save")}</Btn>
        </div>
      ) : null}

      <Modal open={waOpen} title={tr("previewWhatsapp")} onClose={() => setWaOpen(false)} wide>
        <textarea className={`${inputCls} min-h-64`} value={msg} onChange={(e) => setMsg(e.target.value)} />
        <div className="mt-3 flex flex-wrap gap-2">
          <Btn kind="ghost" onClick={async () => { await navigator.clipboard.writeText(msg); }}>{tr("copy")}</Btn>
          <Btn
            onClick={async () => {
              const phone = wa?.phone;
              if (!phone) return;
              const link = `https://wa.me/${String(phone).replace(/\D/g, "").replace(/^0/, "20")}?text=${encodeURIComponent(msg)}`;
              await post(`/api/invoices/${id}/whatsapp/opened`, { type: wa?.type, message: msg, phone });
              window.open(link, "_blank");
              setOpened(true);
            }}
          >
            {tr("openWhatsapp")}
          </Btn>
          <Btn kind="ghost" onClick={() => setWaOpen(false)}>{tr("cancel")}</Btn>
        </div>
        {opened ? (
          <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm">
            <div className="font-bold">{tr("waOpened")}</div>
            <Btn
              className="mt-2"
              kind="soft"
              onClick={async () => {
                await post(`/api/invoices/${id}/whatsapp/mark-sent`, { type: wa?.type, message: msg, phone: wa?.phone });
                setWaOpen(false);
                reload();
              }}
            >
              {tr("markSent")}
            </Btn>
          </div>
        ) : null}
      </Modal>

      <Modal open={resultOpen} title={tr("deliveryResult")} onClose={() => setResultOpen(false)}>
        <Field label={tr("status")}>
          <select className={inputCls} value={resultType} onChange={(e) => setResultType(e.target.value)}>
            <option value="delivered">{tr("outcomeDelivered")}</option>
            <option value="rejected">{tr("outcomeRejected")}</option>
            <option value="returned">{tr("outcomeReturned")}</option>
            <option value="damaged">{tr("outcomeDamaged")}</option>
          </select>
        </Field>
        {resultType === "delivered" ? (
          <Field label={tr("collect")}>
            <input className={inputCls} type="number" value={collected} onChange={(e) => setCollected(Number(e.target.value))} />
          </Field>
        ) : null}
        {resultType === "damaged" ? (
          <Field label={tr("chargeTo")}>
            <select className={inputCls} value={chargeTo} onChange={(e) => setChargeTo(e.target.value)}>
              <option value="courier">{tr("chargeCourier")}</option>
              <option value="customer">{tr("chargeCustomer")}</option>
              <option value="company">{tr("chargeCompany")}</option>
            </select>
          </Field>
        ) : null}
        <Field label={tr("notes")}>
          <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <ErrorNote message={resultErr} />
        <div className="mt-3">
          <Btn
            disabled={resultBusy}
            onClick={async () => {
              try {
                setResultBusy(true);
                setResultErr("");
                await post(`/api/delivery/orders/${id}/result`, {
                  result_type: resultType,
                  collected: resultType === "delivered" ? collected : undefined,
                  charge_to: resultType === "damaged" ? chargeTo : undefined,
                  notes,
                  customer_notes: custNotes,
                });
                setResultOpen(false);
                reload();
              } catch (e) {
                setResultErr(apiMessage(tr, e));
              } finally {
                setResultBusy(false);
              }
            }}
          >
            {resultBusy ? tr("loading") : tr("save")}
          </Btn>
        </div>
      </Modal>

      <AssignCourierModal
        open={assignOpen}
        invoice={inv ? { id: Number(inv.id), number: inv.number } : null}
        onClose={() => setAssignOpen(false)}
        onDone={() => { reload().catch(() => {}); }}
      />

      <Modal open={retOpen} title={tr("returnCreate")} onClose={() => setRetOpen(false)} wide>
        <ReturnForm inv={inv} onDone={() => { setRetOpen(false); reload(); }} onExchange={() => { window.location.href = "/pos"; }} />
      </Modal>
      <PaymentModal
        open={payOpen}
        title={tr("paymentModal")}
        due={Number(inv.total) || 0}
        onClose={() => setPayOpen(false)}
        onSubmit={async (r) => {
          try {
            await post(`/api/invoices/${id}/finalize`, {
              paid: r.paid,
              unpaid: r.unpaid,
              payment_method: r.unpaid ? "credit" : "cash",
              surplus_mode: r.surplus_mode,
            });
            setPayOpen(false);
            reload();
          } catch (e) {
            setMsg(apiMessage(tr, e));
          }
        }}
      />
      {dialog}
    </div>
  );
}

function ReturnForm({ inv, onDone, onExchange }: { inv: any; onDone: () => void; onExchange?: () => void }) {
  const { tr } = useApp();
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const [items, setItems] = useState(inv.items.map((i: any) => ({ invoice_item_id: i.id, qty: 0, max: i.quantity - i.returned_qty, name: i.product_name })));
  async function send(exchange = false) {
    try {
      setErr("");
      await post(`/api/invoices/${inv.id}/returns`, { reason: reason || (exchange ? "exchange" : ""), items: items.filter((x: any) => x.qty > 0) });
      if (exchange && onExchange) onExchange();
      else onDone();
    } catch (e) {
      setErr(apiMessage(tr, e));
    }
  }
  return (
    <div className="space-y-3">
      {items.map((i: any) => (
        <div key={i.invoice_item_id} className="flex items-center justify-between gap-2">
          <span>{i.name}</span>
          <input className={`${inputCls} w-24`} type="number" min={0} max={i.max} value={i.qty} onChange={(e) => {
            const qty = Math.max(0, Math.min(i.max, Number(e.target.value) || 0));
            setItems(items.map((x: any) => (x.invoice_item_id === i.invoice_item_id ? { ...x, qty } : x)));
          }} />
        </div>
      ))}
      <input className={inputCls} placeholder={tr("reason")} value={reason} onChange={(e) => setReason(e.target.value)} />
      {err ? <div className="text-sm text-rose-600">{err}</div> : null}
      <div className="flex gap-2">
        <Btn onClick={() => send(false)}>{tr("save")}</Btn>
        <Btn kind="soft" onClick={() => send(true)}>{tr("exchange")}</Btn>
      </div>
    </div>
  );
}
