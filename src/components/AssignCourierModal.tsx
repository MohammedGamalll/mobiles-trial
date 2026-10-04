import { useEffect, useState } from "react";
import { useApp } from "../context";
import { post } from "../lib/api";
import { apiMessage } from "../lib/errors";
import { Btn, ErrorNote, Field, Modal, inputCls } from "./ui";

export function AssignCourierModal({
  open,
  invoice,
  onClose,
  onDone,
}: {
  open: boolean;
  invoice: { id: number; number?: string } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { tr, lookups } = useApp();
  const [agentId, setAgentId] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const agents = (lookups?.delivery_agents || []).filter((a: any) => a.status !== "inactive");

  useEffect(() => {
    if (!open) return;
    setErr("");
    setBusy(false);
    const first = (lookups?.delivery_agents || []).find((a: any) => a.status !== "inactive");
    setAgentId(first ? String(first.id) : "");
  }, [open, invoice?.id, lookups?.delivery_agents]);

  async function submit() {
    if (!invoice?.id || !agentId) {
      setErr(tr("errCourierRequired"));
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await post(`/api/delivery/orders/${invoice.id}/assign`, { delivery_agent_id: Number(agentId) });
      onDone();
      onClose();
    } catch (e) {
      setErr(apiMessage(tr, e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title={tr("assignCourier")} onClose={onClose}>
      {invoice?.number ? <div className="mb-3 text-sm font-bold">{invoice.number}</div> : null}
      <Field label={tr("agent")}>
        <select className={inputCls} value={agentId} onChange={(e) => setAgentId(e.target.value)}>
          <option value="">{tr("agent")}</option>
          {agents.map((a: any) => (
            <option key={a.id} value={a.id}>{a.name} ({a.code})</option>
          ))}
        </select>
      </Field>
      <ErrorNote message={err} />
      <div className="mt-3 flex gap-2">
        <Btn disabled={busy || !agentId} onClick={() => void submit()}>{tr("save")}</Btn>
        <Btn kind="ghost" onClick={onClose}>{tr("cancel")}</Btn>
      </div>
    </Modal>
  );
}
