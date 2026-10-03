import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { useApp } from "../../context";
import { post } from "../../lib/api";
import { apiMessage } from "../../lib/errors";
import { playSound } from "../../lib/sounds";

export type AccountParty = "customer" | "supplier" | "agent";

export function AccountDialogClassic({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved?: (party: AccountParty, row: any) => void;
}) {
  const { tr, lookups } = useApp();
  const [kind, setKind] = useState<AccountParty>("customer");
  const [form, setForm] = useState({ code: "", name: "", email: "", phone: "", address: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (open) {
      setKind("customer");
      setForm({ code: "", name: "", email: "", phone: "", address: "" });
      setErr("");
    }
  }, [open]);

  async function save() {
    if (!form.name.trim()) {
      setErr(tr("errNameRequired"));
      return;
    }
    setBusy(true);
    setErr("");
    try {
      if (kind === "supplier") {
        const r = await post<{ id: number }>("/api/suppliers", form);
        playSound("done");
        onSaved?.(kind, { id: r.id, ...form });
      } else if (kind === "agent") {
        const hit = (lookups?.delivery_agents || []).find((a) => a.name === form.name || a.code === form.code);
        playSound("done");
        onSaved?.(kind, hit || { name: form.name, phone: form.phone, code: form.code });
      } else {
        const r = await post<{ id: number }>("/api/customers", form);
        playSound("done");
        onSaved?.(kind, { id: r.id, ...form, whatsapp: form.phone });
      }
      onClose();
    } catch (e) {
      playSound("err");
      setErr(apiMessage(tr, e));
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;
  return (
    <div className="inv-dlg-back" role="dialog">
      <div className="inv-dlg inv-dlg-sm">
        <div className="inv-dlg-pane-title">{tr("posSaveAccount")}</div>
        <div className="inv-dlg-body">
          <label><span>{tr("posAccountCode")}</span><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></label>
          <label><span>{tr("name")}</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label><span>{tr("dlgEmail")}</span><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label><span>{tr("posMobile")}</span><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
          <label><span>{tr("address")}</span><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
          <div className="pos-classic-radios">
            <span>{tr("dlgNature")}</span>
            {([["customer", tr("posPartyCustomer")], ["supplier", tr("posPartySupplier")], ["agent", tr("posPartyAgent")]] as const).map(([id, label]) => (
              <label key={id} className="pos-classic-radio">
                <input type="radio" checked={kind === id} onChange={() => setKind(id)} />
                {label}
              </label>
            ))}
          </div>
          {err ? <div className="inv-dlg-err">{err}</div> : null}
        </div>
        <div className="inv-dlg-actions">
          <button type="button" className="is-cancel" onClick={onClose}>{tr("dlgCancel")}</button>
          <button type="button" className="is-save" disabled={busy} onClick={() => void save()}><Check size={14} /> {tr("dlgSave")}</button>
        </div>
      </div>
    </div>
  );
}
