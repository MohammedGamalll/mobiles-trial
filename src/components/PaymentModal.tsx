import { useEffect, useState } from "react";
import { useApp } from "../context";
import { money } from "../lib/format";
import { Btn, Field, Modal, inputCls } from "./ui";

export type PaymentModalResult = {
  unpaid: boolean;
  paid: number;
  surplus_mode: "wallet" | "ignore";
};

export type PaymentSummary = {
  number?: string;
  party?: string;
  date?: string;
  total?: number;
  discount?: number;
  returned?: number;
  net?: number;
  paid?: number;
  remaining?: number;
  surplus?: number;
  surplusLabel?: string;
};

export function PaymentModal({
  open,
  title,
  due,
  debt,
  summary,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title?: string;
  due: number;
  debt?: number;
  summary?: PaymentSummary;
  onClose: () => void;
  onSubmit: (r: PaymentModalResult) => void | Promise<void>;
}) {
  const { tr, lang } = useApp();
  const cap = Number(due > 0 ? due : debt || 0);
  const [unpaid, setUnpaid] = useState(false);
  const [paid, setPaid] = useState(String(cap || 0));
  const [surplusMode, setSurplusMode] = useState<"wallet" | "ignore">("wallet");
  useEffect(() => {
    if (!open) return;
    setUnpaid(false);
    setPaid(String(cap || 0));
    setSurplusMode("wallet");
  }, [open, cap]);
  const amt = Number(paid || 0);
  const take = unpaid ? 0 : Math.min(amt, cap);
  const extra = unpaid ? 0 : Math.max(0, amt - cap);
  const nextRemaining = Math.max(0, cap - take);
  const showSurplus = !unpaid && extra > 0.001 && cap >= 0;
  const lines = [
    summary?.number ? [tr("invoiceNo"), summary.number] : null,
    summary?.party ? [tr("name"), summary.party] : null,
    summary?.date ? [tr("date"), summary.date] : null,
    summary?.total != null ? [tr("total"), money(summary.total, lang)] : null,
    summary?.discount != null && Number(summary.discount) > 0 ? [tr("discount"), money(summary.discount, lang)] : null,
    summary?.returned != null && Number(summary.returned) > 0 ? [tr("returnedAmount"), money(summary.returned, lang)] : null,
    summary?.net != null ? [tr("netTotal"), money(summary.net, lang)] : null,
    summary?.paid != null ? [tr("paidAmount"), money(summary.paid, lang)] : null,
    [tr("remainingAmount"), money(summary?.remaining != null ? summary.remaining : cap, lang)],
    summary?.surplus != null && Number(summary.surplus) > 0 ? [summary.surplusLabel || tr("surplusOnHim"), money(summary.surplus, lang)] : null,
  ].filter(Boolean) as [string, string][];
  return (
    <Modal open={open} title={title || tr("paymentModal")} onClose={onClose}>
      {lines.length ? (
        <div className="mb-3 grid grid-cols-2 gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm">
          {lines.map(([label, value], i) => (
            <div key={`${label}-${i}`}>
              <div className="text-xs font-bold text-slate-500">{label}</div>
              <div className="font-extrabold">{value}</div>
            </div>
          ))}
        </div>
      ) : null}
      <Field label={tr("payStatus")}>
        <select
          className={inputCls}
          value={unpaid ? "unpaid" : "paid"}
          onChange={(e) => {
            const next = e.target.value === "unpaid";
            setUnpaid(next);
            if (next) setPaid("0");
            else setPaid(String(cap || 0));
          }}
        >
          <option value="paid">{tr("invoicePaid")}</option>
          <option value="unpaid">{tr("invoiceUnpaid")}</option>
        </select>
      </Field>
      {unpaid ? null : (
        <Field label={tr("amount")}>
          <input className={inputCls} type="text" inputMode="decimal" value={paid} onChange={(e) => setPaid(e.target.value)} />
        </Field>
      )}
      {!unpaid ? (
        <div className="mb-3 grid grid-cols-2 gap-2 text-sm font-bold">
          <div>{tr("paidAmount")}: {money(take, lang)}</div>
          <div>{tr("remainingAmount")}: {money(nextRemaining, lang)}</div>
          {extra > 0.001 ? <div className="col-span-2">{summary?.surplusLabel || tr("surplus")}: {money(extra, lang)}</div> : null}
        </div>
      ) : null}
      {showSurplus ? (
        <Field label={tr("surplus")}>
          <label className="mb-2 flex items-center gap-2 text-sm font-bold">
            <input type="radio" checked={surplusMode === "wallet"} onChange={() => setSurplusMode("wallet")} />
            {tr("surplusWallet")}
          </label>
          <label className="flex items-center gap-2 text-sm font-bold">
            <input type="radio" checked={surplusMode === "ignore"} onChange={() => setSurplusMode("ignore")} />
            {tr("surplusIgnore")}
          </label>
        </Field>
      ) : null}
      <Btn
        className="mt-3"
        onClick={() => onSubmit({ unpaid, paid: unpaid ? 0 : amt, surplus_mode: showSurplus ? surplusMode : "wallet" })}
      >
        {tr("save")}
      </Btn>
    </Modal>
  );
}
