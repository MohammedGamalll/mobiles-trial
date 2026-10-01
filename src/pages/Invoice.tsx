import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useApp } from "../context";
import { get, post } from "../lib/api";
import { money, num, statusClass, statusLabel } from "../lib/format";
import { Btn, Field, Modal, PrintBtn, inputCls } from "../components/ui";
import { useConfirm } from "../components/Confirm";

export default function Invoice() {
  const { id } = useParams();
  const { tr, lang, can, settings } = useApp();
  const [inv, setInv] = useState<any>(null);
  const [wa, setWa] = useState<any>(null);
  const [msg, setMsg] = useState("");
  const [waOpen, setWaOpen] = useState(false);
  const [opened, setOpened] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [retOpen, setRetOpen] = useState(false);
  const [resultType, setResultType] = useState("full_delivery");
  const [lines, setLines] = useState<any[]>([]);
  const [collected, setCollected] = useState(0);
  const { confirmDelete, dialog } = useConfirm();
  const [notes, setNotes] = useState("");
  const [custNotes, setCustNotes] = useState("");
  const [payAmt, setPayAmt] = useState(0);

  async function reload() {
    const r = await get<{ data: any }>(`/api/invoices/${id}`);
    setInv(r.data);
    setLines((r.data.items || []).map((i: any) => ({ invoice_item_id: i.id, delivered_qty: i.quantity, returned_qty: 0 })));
    setCollected(r.data.remaining || r.data.total || 0);
  }
  useEffect(() => {
    reload().catch(() => {});
  }, [id]);

  if (!inv) return <div>{tr("loading")}</div>;
  const waEnabled = settings.whatsapp_enabled !== "0";

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
          {inv.type === "delivery" && can("delivery.update") && !["completed", "cancelled"].includes(inv.status) ? (
            <>
              {inv.delivery_status === "pending_delivery" ? (
                <Btn kind="ghost" onClick={async () => { await post(`/api/delivery/orders/${id}/status`, { status: "out_for_delivery" }); reload(); }}>
                  {tr("outForDelivery")}
                </Btn>
              ) : null}
              <Btn onClick={() => setResultOpen(true)}>{tr("deliveryResult")}</Btn>
              <Btn kind="ghost" onClick={async () => { try { await post(`/api/delivery/orders/${id}/complete`, {}); reload(); } catch { alert(tr("resultRequired")); } }}>
                {tr("completeDelivery")}
              </Btn>
            </>
          ) : null}
          {can("returns.create") && !["cancelled", "fully_returned", "held", "quote", "order"].includes(inv.status) ? (
            <Btn kind="ghost" onClick={() => setRetOpen(true)}>{tr("returnCreate")}</Btn>
          ) : null}
          {["held", "quote", "order"].includes(inv.status) && can("sales.create") ? (
            <Btn onClick={() => { window.location.href = `/pos?held=${inv.id}`; }}>{tr("resumeHeld")}</Btn>
          ) : null}
          {["held", "quote", "order"].includes(inv.status) && can("sales.create") ? (
            <Btn kind="soft" onClick={async () => { await post(`/api/invoices/${id}/finalize`, {}); reload(); }}>{tr("finalizeHeld")}</Btn>
          ) : null}
          {can("installments.manage") && inv.remaining > 0 && !["held", "quote", "order", "cancelled"].includes(inv.status) ? (
            <Btn kind="soft" onClick={() => { window.location.href = `/installments`; }}>{tr("installments")}</Btn>
          ) : null}
          {can("sales.cancel") && !["cancelled", "completed"].includes(inv.status) ? (
            <Btn kind="danger" onClick={() => confirmDelete(inv.number, async () => { await post(`/api/invoices/${id}/cancel`, {}); reload(); })}>
              {tr("void")}
            </Btn>
          ) : null}
        </div>
      </div>

      <div className="print-sheet rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-3xl font-black">{tr("app")}</div>
            <div className="text-sm text-slate-500">{settings.store_name_ar || settings.store_name}</div>
            <div className="text-sm text-slate-500">{settings.store_address}</div>
            <div className="text-sm text-slate-500">{settings.store_phone}</div>
          </div>
          <div className="text-end">
            <div className="text-lg font-black">{inv.number}</div>
            <div className="text-sm">{inv.date}</div>
            <span className={statusClass(inv.status)}>{statusLabel(inv.status, lang)}</span>
          </div>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div>
            <div className="text-xs font-bold text-slate-400">{tr("customer")}</div>
            <div className="font-bold">{inv.customer_name || tr("walkIn")}</div>
            {inv.customer_phone ? (
              <div className="text-sm">
                {inv.customer_phone}{" "}
                {inv.customer_whatsapp ? (
                  <a className="font-bold text-emerald-700" href={`https://wa.me/${String(inv.customer_whatsapp).replace(/\D/g, "").replace(/^0/, "20")}`} target="_blank" rel="noreferrer">
                    [{tr("whatsapp")}]
                  </a>
                ) : null}
              </div>
            ) : null}
            <div className="text-sm text-slate-500">{inv.address}</div>
            {inv.sales_agent_name ? <div className="mt-2 text-sm">{tr("salesAgent")}: <b>{inv.sales_agent_name}</b> {inv.sales_agent_code ? `(${inv.sales_agent_code})` : ""}</div> : null}
          </div>
          {inv.type === "delivery" ? (
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-xs font-bold text-slate-400">{tr("deliveryInfo")}</div>
              <div>{tr("agent")}: <b>{inv.delivery_agent_name}</b></div>
              <div>{tr("agentCode")}: <b>{inv.delivery_agent_code}</b></div>
              {inv.delivery_agent_phone ? <div>{tr("phone")}: {inv.delivery_agent_phone}</div> : null}
              {inv.expected_delivery_time ? <div>{tr("expectedTime")}: {inv.expected_delivery_time}</div> : null}
              <div>{tr("address")}: {inv.address}</div>
            </div>
          ) : null}
        </div>
        <div className="table-wrap mt-6">
          <table>
            <thead>
              <tr>
                <th>{tr("items")}</th>
                <th>{tr("qty")}</th>
                <th>{tr("unitPrice")}</th>
                <th>{tr("discount")}</th>
                <th>{tr("total")}</th>
              </tr>
            </thead>
            <tbody>
              {(inv.items || []).map((i: any) => (
                <tr key={i.id}>
                  <td>
                    <div className="font-semibold">{i.product_name}</div>
                    <div className="text-xs text-slate-400">{i.sku} {i.product_kind === "service" || i.item_kind === "service" ? `· ${tr("kindService")}` : ""}</div>
                  </td>
                  <td>{i.quantity}{i.unit_name ? ` ${i.unit_name}` : ""}{i.delivered_qty ? ` / ${tr("deliveredQty")} ${i.delivered_qty}` : ""}{i.returned_qty ? ` / ${tr("returnedQty")} ${i.returned_qty}` : ""}</td>
                  <td>{money(i.unit_price, lang)}</td>
                  <td>{money(i.discount, lang)}</td>
                  <td className="font-bold">{money(i.total, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 ms-auto max-w-xs space-y-1 text-sm">
          <div className="flex justify-between"><span>{tr("subtotal")}</span><b>{money(inv.subtotal, lang)}</b></div>
          <div className="flex justify-between"><span>{tr("discount")}</span><b>{money(inv.discount, lang)}</b></div>
          {inv.tax_amount ? <div className="flex justify-between"><span>{tr("tax")} {inv.tax_rate ? `(${inv.tax_rate}%)` : ""}</span><b>{money(inv.tax_amount, lang)}</b></div> : null}
          {Number(inv.extra_amount) ? <div className="flex justify-between"><span>{tr("extraAmount")}</span><b>{money(inv.extra_amount, lang)}</b></div> : null}
          <div className="flex justify-between text-base"><span>{tr("total")}</span><b>{money(inv.total, lang)}</b></div>
          <div className="flex justify-between"><span>{tr("paid")}</span><b>{money(inv.paid, lang)}</b></div>
          <div className="flex justify-between"><span>{tr("remaining")}</span><b>{money(inv.remaining, lang)}</b></div>
          <div className="flex justify-between text-xs text-slate-400"><span>{tr("payMethod")}</span><span>{inv.payment_method}</span></div>
          {(inv.payments || []).map((p: any) => (
            <div key={p.id} className="flex justify-between text-xs text-slate-500"><span>{p.method}</span><span>{money(p.amount, lang)}</span></div>
          ))}
        </div>
        <div className="mt-8 text-center text-sm text-slate-400">{settings.invoice_footer || tr("thanks")}</div>
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

      <Modal open={resultOpen} title={tr("deliveryResult")} onClose={() => setResultOpen(false)} wide>
        <Field label={tr("status")}>
          <select className={inputCls} value={resultType} onChange={(e) => setResultType(e.target.value)}>
            <option value="full_delivery">{tr("fullDelivery")}</option>
            <option value="partial_delivery">{tr("partialDelivery")}</option>
            <option value="full_return">{tr("fullReturn")}</option>
            <option value="partial_return">{tr("partialReturn")}</option>
            <option value="refused">{tr("refused")}</option>
            <option value="unavailable">{tr("unavailable")}</option>
            <option value="rescheduled">{tr("rescheduled")}</option>
          </select>
        </Field>
        <div className="table-wrap mt-3">
          <table>
            <thead>
              <tr>
                <th>{tr("items")}</th>
                <th>{tr("deliveredQty")}</th>
                <th>{tr("returnedQty")}</th>
              </tr>
            </thead>
            <tbody>
              {(inv.items || []).map((i: any) => {
                const line = lines.find((x) => x.invoice_item_id === i.id) || { delivered_qty: i.quantity, returned_qty: 0 };
                return (
                  <tr key={i.id}>
                    <td>{i.product_name} ({i.quantity})</td>
                    <td>
                      <input className={inputCls} type="number" value={line.delivered_qty} onChange={(e) => setLines((ls) => ls.map((x) => (x.invoice_item_id === i.id ? { ...x, delivered_qty: Number(e.target.value) } : x)))} />
                    </td>
                    <td>
                      <input className={inputCls} type="number" value={line.returned_qty} onChange={(e) => setLines((ls) => ls.map((x) => (x.invoice_item_id === i.id ? { ...x, returned_qty: Number(e.target.value) } : x)))} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-3 grid gap-2">
          <Field label={tr("collect")}>
            <input className={inputCls} type="number" value={collected} onChange={(e) => setCollected(Number(e.target.value))} />
          </Field>
          <Field label={tr("notes")}>
            <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <Field label={lang === "ar" ? "ملاحظات العميل" : "Customer notes"}>
            <input className={inputCls} value={custNotes} onChange={(e) => setCustNotes(e.target.value)} />
          </Field>
          <Btn
            onClick={async () => {
              await post(`/api/delivery/orders/${id}/result`, { result_type: resultType, items: lines, collected, notes, customer_notes: custNotes });
              setResultOpen(false);
              reload();
            }}
          >
            {tr("save")}
          </Btn>
        </div>
      </Modal>

      <Modal open={retOpen} title={tr("returnCreate")} onClose={() => setRetOpen(false)} wide>
        <ReturnForm inv={inv} onDone={() => { setRetOpen(false); reload(); }} onExchange={() => { window.location.href = "/pos"; }} />
      </Modal>
      {dialog}
    </div>
  );
}

function ReturnForm({ inv, onDone, onExchange }: { inv: any; onDone: () => void; onExchange?: () => void }) {
  const { tr } = useApp();
  const [reason, setReason] = useState("");
  const [items, setItems] = useState(inv.items.map((i: any) => ({ invoice_item_id: i.id, qty: 0, max: i.quantity - i.returned_qty, name: i.product_name })));
  async function send(exchange = false) {
    await post(`/api/invoices/${inv.id}/returns`, { reason: reason || (exchange ? "exchange" : ""), items: items.filter((x: any) => x.qty > 0) });
    if (exchange && onExchange) onExchange();
    else onDone();
  }
  return (
    <div className="space-y-3">
      {items.map((i: any) => (
        <div key={i.invoice_item_id} className="flex items-center justify-between gap-2">
          <span>{i.name}</span>
          <input className={`${inputCls} w-24`} type="number" max={i.max} value={i.qty} onChange={(e) => setItems(items.map((x: any) => (x.invoice_item_id === i.invoice_item_id ? { ...x, qty: Number(e.target.value) } : x)))} />
        </div>
      ))}
      <input className={inputCls} placeholder={tr("reason")} value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="flex gap-2">
        <Btn onClick={() => send(false)}>{tr("save")}</Btn>
        <Btn kind="soft" onClick={() => send(true)}>{tr("exchange")}</Btn>
      </div>
    </div>
  );
}
