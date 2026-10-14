import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context";
import { get, post } from "../lib/api";
import { apiMessage } from "../lib/errors";
import { money } from "../lib/format";
import { Btn, Field, PageLoading, inputCls } from "./ui";

export type PosShift = {
  id: number;
  user_id: number;
  cash_account_id: number;
  opened_at: string;
  opening_cash_balance: number;
  expected_cash_balance?: number | null;
  actual_cash_balance?: number | null;
  variance?: number | null;
  status: "open" | "closed";
  drawer_name?: string;
  drawer_name_en?: string;
  user_name?: string;
  cash_in?: number;
  cash_out?: number;
};

type Ctx = { shift: PosShift; reload: () => Promise<PosShift | null> };

const PosShiftCtx = createContext<Ctx | null>(null);

export function usePosShift() {
  return useContext(PosShiftCtx);
}

export function PosShiftGuard({ children }: { children: ReactNode }) {
  const [shift, setShift] = useState<PosShift | null | undefined>(undefined);

  async function reload() {
    try {
      const r = await get<{ shift: PosShift | null }>("/api/shifts/current");
      const next = r.shift || null;
      setShift(next);
      return next;
    } catch {
      setShift(null);
      return null;
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  if (shift === undefined) return <PageLoading />;
  if (!shift) return <OpenShiftScreen onOpened={reload} />;
  return <PosShiftCtx.Provider value={{ shift, reload }}>{children}</PosShiftCtx.Provider>;
}

function OpenShiftScreen({ onOpened }: { onOpened: () => Promise<void> }) {
  const { tr, lang, lookups } = useApp();
  const drawers = (lookups?.cash_accounts || []).filter((a) => a.kind !== "bank");
  const [cashId, setCashId] = useState(String(drawers[0]?.id || ""));
  const [opening, setOpening] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!cashId) {
      setOpening(null);
      return;
    }
    get<{ opening_cash_balance: number }>(`/api/shifts/opening?cash_account_id=${cashId}`)
      .then((r) => setOpening(Number(r.opening_cash_balance || 0)))
      .catch(() => setOpening(null));
  }, [cashId]);

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
        <h1 className="text-2xl font-black">{tr("openShift")}</h1>
        <p className="text-sm leading-6 text-[var(--muted)]">{tr("openShiftHint")}</p>
        <Field label="drawerAccount">
          <select className={inputCls} value={cashId} onChange={(e) => setCashId(e.target.value)}>
            {drawers.map((a) => (
              <option key={a.id} value={a.id}>{lang === "ar" ? a.name : a.name_en || a.name}</option>
            ))}
          </select>
        </Field>
        <div className="rounded-2xl bg-[var(--surface-2)] p-4">
          <div className="text-xs font-bold text-[var(--muted)]">{tr("openingDrawer")}</div>
          <div className="mt-1 text-2xl font-black tabular-nums">{opening == null ? "—" : money(opening, lang)}</div>
        </div>
        {err ? <div className="text-sm font-bold text-rose-600">{err}</div> : null}
        <Btn
          className="w-full"
          disabled={busy || !cashId}
          onClick={async () => {
            setBusy(true);
            setErr("");
            try {
              await post("/api/shifts/open", { cash_account_id: Number(cashId) });
              await onOpened();
            } catch (e) {
              setErr(apiMessage(tr, e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {tr("confirmOpenShift")}
        </Btn>
      </div>
    </div>
  );
}

export function CloseShiftModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const ctx = usePosShift();
  const { tr, lang } = useApp();
  const navigate = useNavigate();
  const [actual, setActual] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [expected, setExpected] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setActual("");
    setRevealed(false);
    setBusy(false);
    setErr("");
    setExpected(null);
  }, [open]);

  const counted = Number(actual);
  const shownExpected = expected ?? Number(ctx?.shift.expected_cash_balance || 0);
  const variance = revealed && Number.isFinite(counted) ? counted - shownExpected : null;

  async function revealExpected() {
    if (!ctx) return;
    setBusy(true);
    setErr("");
    try {
      const fresh = await ctx.reload();
      setExpected(Number(fresh?.expected_cash_balance || 0));
      setRevealed(true);
    } catch (e) {
      setErr(apiMessage(tr, e));
    } finally {
      setBusy(false);
    }
  }

  if (!open || !ctx) return null;

  return (
    <div className="drawer-root fixed inset-0 z-50 no-print">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <aside className="drawer-panel absolute inset-y-0 end-0 flex h-full w-full max-w-md flex-col border-s border-[var(--border)] bg-[var(--surface)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <h3 className="text-base font-bold">{tr("closeShift")}</h3>
          <button className="rounded-lg px-2 py-1 text-[var(--muted)]" onClick={onClose}>✕</button>
        </div>
        <div className="flex-1 space-y-4 overflow-auto p-5">
          <p className="text-sm leading-6 text-[var(--muted)]">{tr("closeShiftHint")}</p>
          <Field label="countedCash">
            <input className={inputCls} type="number" min={0} value={actual} onChange={(e) => { setActual(e.target.value); setRevealed(false); }} />
          </Field>
          {revealed ? (
            <div className="space-y-2 rounded-2xl bg-[var(--surface-2)] p-4 text-sm">
              <div className="flex justify-between"><span>{tr("expectedCash")}</span><b className="tabular-nums">{money(shownExpected, lang)}</b></div>
              <div className="flex justify-between"><span>{tr("shiftVariance")}</span>
                <b className={`tabular-nums ${variance != null && variance < 0 ? "text-rose-600" : "text-emerald-700"}`}>
                  {variance == null ? "—" : money(variance, lang)} {variance != null && variance < 0 ? tr("shiftShortage") : variance != null && variance > 0 ? tr("shiftOverage") : ""}
                </b>
              </div>
            </div>
          ) : null}
          {err ? <div className="text-sm font-bold text-rose-600">{err}</div> : null}
          <div className="flex gap-2">
            {!revealed ? (
              <Btn
                className="flex-1"
                disabled={!actual}
                loading={busy}
                onClick={() => void revealExpected()}
              >
                {tr("revealExpected")}
              </Btn>
            ) : (
              <Btn
                className="flex-1"
                disabled={busy || !actual}
                onClick={async () => {
                  setBusy(true);
                  setErr("");
                  try {
                    await post(`/api/shifts/close/${ctx.shift.id}`, { actual_cash_balance: counted });
                    await ctx.reload();
                    onClose();
                    navigate("/pos/shifts");
                  } catch (e) {
                    setErr(apiMessage(tr, e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {tr("confirmCloseShift")}
              </Btn>
            )}
            <Btn kind="ghost" onClick={onClose}>{tr("cancel")}</Btn>
          </div>
        </div>
      </aside>
    </div>
  );
}

export function EndShiftButton({ className = "" }: { className?: string }) {
  const { tr } = useApp();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>{tr("endShift")}</button>
      {open ? <CloseShiftModal open onClose={() => setOpen(false)} /> : null}
    </>
  );
}
