import { useState } from "react";
import { useApp } from "../context";
import { Btn, Field, Modal, inputCls } from "./ui";

export type PaymentModalResult = {
  unpaid: boolean;
  paid: number;
  surplus_mode: "wallet" | "ignore";
};

export function PaymentModal({
  open,
  title,
  due,
  debt,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title?: string;
  due: number;
  debt?: number;
  onClose: () => void;
  onSubmit: (r: PaymentModalResult) => void | Promise<void>;
}) {
  const { tr } = useApp();
  const cap = Number(due > 0 ? due : debt || 0);
  const [unpaid, setUnpaid] = useState(false);
  const [paid, setPaid] = useState(String(cap || 0));
  const [surplusMode, setSurplusMode] = useState<"wallet" | "ignore">("wallet");
  const amt = Number(paid || 0);
  const showSurplus = !unpaid && amt > cap + 0.001 && cap >= 0;
  return (
    <Modal open={open} title={title || tr("paymentModal")} onClose={onClose}>
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
