import { Btn, Field, Modal, inputCls } from "./ui";

export type CourierGate = {
  invoiceId: number;
  number?: string;
  outcome: string;
  collected: number;
  rating: number;
  onTime: boolean;
  chargeTo: string;
};

export function CourierGateModal(props: {
  gate: CourierGate | null;
  busy?: boolean;
  tr: (key: any) => string;
  onChange: (next: CourierGate) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const { gate, tr } = props;
  return (
    <Modal open={!!gate} title={tr("settleCourier")} onClose={props.onClose}>
      {gate ? (
        <div className="space-y-3">
          {gate.number ? <div className="font-black">{gate.number}</div> : null}
          <Field label={tr("deliveryResult")}>
            <select className={inputCls} value={gate.outcome} onChange={(e) => props.onChange({ ...gate, outcome: e.target.value })}>
              <option value="delivered">{tr("outcomeDelivered")}</option>
              <option value="rejected">{tr("outcomeRejected")}</option>
              <option value="returned">{tr("outcomeReturned")}</option>
              <option value="damaged">{tr("outcomeDamaged")}</option>
            </select>
          </Field>
          {gate.outcome === "delivered" ? (
            <Field label={tr("collectedCash")}>
              <input className={inputCls} type="number" min={0} value={gate.collected} onChange={(e) => props.onChange({ ...gate, collected: Number(e.target.value) })} />
            </Field>
          ) : null}
          {gate.outcome === "damaged" ? (
            <Field label={tr("chargeTo")}>
              <select className={inputCls} value={gate.chargeTo} onChange={(e) => props.onChange({ ...gate, chargeTo: e.target.value })}>
                <option value="courier">{tr("chargeCourier")}</option>
                <option value="customer">{tr("chargeCustomer")}</option>
                <option value="company">{tr("chargeCompany")}</option>
              </select>
            </Field>
          ) : null}
          <Field label={tr("avgStars")}>
            <select className={inputCls} value={gate.rating} onChange={(e) => props.onChange({ ...gate, rating: Number(e.target.value) })}>
              {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={gate.onTime} onChange={(e) => props.onChange({ ...gate, onTime: e.target.checked })} />
            {tr("onTime")}
          </label>
          <Btn loading={props.busy} onClick={props.onSave}>{tr("save")}</Btn>
        </div>
      ) : null}
    </Modal>
  );
}
