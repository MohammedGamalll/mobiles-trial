import { useEffect, useState } from "react";
import { useApp } from "../context";
import { del, get, post, put } from "../lib/api";
import { apiMessage } from "../lib/errors";
import { money } from "../lib/format";
import { ActionBtns, useConfirm } from "../components/Confirm";
import {
  Btn,
  ErrorNote,
  Field,
  Modal,
  PrintBtn,
  PrintLetterhead,
  inputCls,
} from "../components/ui";

type Dashboard = {
  total_assets: number;
  total_liabilities: number;
  net_equity: number;
  net_profit: number;
  total_wastage: number;
  revenues: number;
  expenses: number;
};

type Partner = {
  id: number;
  name: string;
  equity_percentage: number;
  starting_balance: number;
  total_withdrawals: number;
  profit_share: number;
  asset_share: number;
  net_due: number;
};

function auditNum(n: number) {
  return Number(n || 0).toLocaleString("en-EG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function AmountCell({
  n,
  lang,
  strong,
}: {
  n: number;
  lang: string;
  strong?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 leading-tight">
      <span className={`tabular-nums ${strong ? "font-black" : "font-bold"}`}>
        {money(n, lang as "ar" | "en")}
      </span>
      <span className="text-[11px] font-semibold tabular-nums text-[var(--muted)]">
        {auditNum(n)}
      </span>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  warn,
}: {
  label: string;
  value: string;
  hint?: string;
  warn?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 shadow-sm ${warn ? "border-amber-300 bg-amber-50" : "border-[var(--border)] bg-[var(--surface-2)]"}`}
    >
      <div
        className={`text-xs font-bold ${warn ? "text-amber-800" : "text-[var(--muted)]"}`}
      >
        {label}
      </div>
      <div
        className={`mt-1 text-2xl font-extrabold tabular-nums tracking-tight ${warn ? "text-amber-900" : "text-[var(--text)]"}`}
      >
        {value}
      </div>
      {hint ? (
        <div
          className="mt-1 text-xs tabular-nums text-[var(--muted)]"
          dir="ltr"
        >
          {hint}
        </div>
      ) : null}
    </div>
  );
}

export default function Partners() {
  const { tr, lang, can, lookups } = useApp();
  const cashAccounts = lookups?.cash_accounts || [];
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [rows, setRows] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState<Partner | null>(null);
  const [drawOpen, setDrawOpen] = useState<Partner | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    equity_percentage: "",
    starting_balance: "",
    cash_account_id: "",
  });
  const [editForm, setEditForm] = useState({ name: "", equity_percentage: "" });
  const [draw, setDraw] = useState({
    amount: "",
    cash_account_id: "",
    note: "",
  });
  const { confirmDelete, dialog } = useConfirm();

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const r = await get<{ data: Partner[]; dashboard: Dashboard }>(
        "/api/partners",
      );
      setRows(r.data || []);
      setDash(r.dashboard || null);
    } catch (e) {
      setErr(apiMessage(tr, e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createPartner() {
    setSaving(true);
    setErr("");
    try {
      const starting = Number(form.starting_balance || 0);
      await post("/api/partners", {
        name: form.name.trim(),
        equity_percentage: Number(form.equity_percentage || 0),
        starting_balance: starting,
        cash_account_id:
          starting > 0 ? Number(form.cash_account_id || 0) : undefined,
      });
      setAddOpen(false);
      setForm({
        name: "",
        equity_percentage: "",
        starting_balance: "",
        cash_account_id: "",
      });
      await load();
    } catch (e) {
      setErr(apiMessage(tr, e));
    } finally {
      setSaving(false);
    }
  }

  async function savePartner() {
    if (!editOpen) return;
    setSaving(true);
    setErr("");
    try {
      await put(`/api/partners/${editOpen.id}`, {
        name: editForm.name.trim(),
        equity_percentage: Number(editForm.equity_percentage || 0),
      });
      setEditOpen(null);
      await load();
    } catch (e) {
      setErr(apiMessage(tr, e));
    } finally {
      setSaving(false);
    }
  }

  async function withdraw() {
    if (!drawOpen) return;
    setSaving(true);
    setErr("");
    try {
      await post(`/api/partners/${drawOpen.id}/withdraw`, {
        amount: Number(draw.amount || 0),
        cash_account_id: Number(draw.cash_account_id || 0),
        note: draw.note.trim() || undefined,
      });
      setDrawOpen(null);
      setDraw({ amount: "", cash_account_id: "", note: "" });
      await load();
    } catch (e) {
      setErr(apiMessage(tr, e));
    } finally {
      setSaving(false);
    }
  }

  const usedPct = rows.reduce(
    (s, r) => s + (Number(r.equity_percentage) || 0),
    0,
  );

  return (
    <div className="text-[var(--text)]">
      <PrintLetterhead title={tr("partnersEquity")} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-black">{tr("partnersEquity")}</h1>
          <div className="mt-1 text-sm text-[var(--muted)]">
            {tr("equityPercent")}:{" "}
            {usedPct.toLocaleString(lang === "ar" ? "ar-EG" : "en-EG", {
              maximumFractionDigits: 2,
            })}
            %
          </div>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          {can("partners.manage") ? (
            <Btn
              onClick={() => {
                setErr("");
                setForm({
                  name: "",
                  equity_percentage: "",
                  starting_balance: "",
                  cash_account_id: String(cashAccounts[0]?.id || ""),
                });
                setAddOpen(true);
              }}
            >
              {tr("addPartner")}
            </Btn>
          ) : null}
          <PrintBtn />
        </div>
      </div>

      {err ? <ErrorNote message={err} /> : null}

      {dash ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Kpi
            label={tr("netEquity")}
            value={money(dash.net_equity, lang)}
            hint={auditNum(dash.net_equity)}
          />
          <Kpi
            label={tr("netProfit")}
            value={money(dash.net_profit, lang)}
            hint={`${auditNum(dash.net_profit)} · ${tr("profitAfterCosts")}`}
          />
          <Kpi
            label={tr("totalWastage")}
            value={money(dash.total_wastage, lang)}
            hint={auditNum(dash.total_wastage)}
            warn
          />
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
        <div className="table-wrap overflow-x-auto">
          <table className="w-full table-fixed">
            <colgroup>
              <col style={{ width: can("partners.manage") ? "16%" : "20%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "13%" }} />
              {can("partners.manage") ? <col style={{ width: "22%" }} /> : null}
            </colgroup>
            <thead>
              <tr>
                <th className="text-center">{tr("name")}</th>
                <th className="text-center">{tr("equityPercent")}</th>
                <th className="text-center">{tr("assetShare")}</th>
                <th className="text-center">{tr("profitShare")}</th>
                <th className="text-center">{tr("withdrawals")}</th>
                <th className="text-center">{tr("netDue")}</th>
                {can("partners.manage") ? (
                  <th className="no-print text-end">{tr("actions")}</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={can("partners.manage") ? 7 : 6}
                    className="py-8 text-center text-[var(--muted)]"
                  >
                    {tr("loading")}
                  </td>
                </tr>
              ) : null}
              {!loading && !rows.length ? (
                <tr>
                  <td
                    colSpan={can("partners.manage") ? 7 : 6}
                    className="py-8 text-center text-[var(--muted)]"
                  >
                    {tr("noData")}
                  </td>
                </tr>
              ) : null}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="truncate font-bold" title={r.name}>
                    {r.name}
                  </td>
                  <td className="whitespace-nowrap text-center font-bold tabular-nums">
                    {Number(r.equity_percentage).toLocaleString(
                      lang === "ar" ? "ar-EG" : "en-EG",
                    )}
                    %
                  </td>
                  <td className="whitespace-nowrap text-center">
                    <AmountCell n={r.asset_share} lang={lang} />
                  </td>
                  <td className="whitespace-nowrap text-center">
                    <AmountCell n={r.profit_share} lang={lang} />
                  </td>
                  <td className="whitespace-nowrap text-center">
                    <AmountCell n={r.total_withdrawals} lang={lang} />
                  </td>
                  <td className="whitespace-nowrap text-center">
                    <AmountCell n={r.net_due} lang={lang} strong />
                  </td>
                  {can("partners.manage") ? (
                    <td className="no-print whitespace-nowrap text-center">
                      <div className="flex flex-nowrap items-center justify-center gap-3">
                        <button
                          type="button"
                          className="filter-link text-sm"
                          onClick={() => {
                            setErr("");
                            setDraw({
                              amount: "",
                              cash_account_id: String(
                                cashAccounts[0]?.id || "",
                              ),
                              note: "",
                            });
                            setDrawOpen(r);
                          }}
                        >
                          {tr("recordWithdrawal")}
                        </button>
                        <ActionBtns
                          canEdit
                          canDelete
                          onEdit={() => {
                            setErr("");
                            setEditForm({
                              name: r.name,
                              equity_percentage: String(r.equity_percentage),
                            });
                            setEditOpen(r);
                          }}
                          onDelete={() =>
                            confirmDelete(r.name, async () => {
                              await del(`/api/partners/${r.id}`);
                              await load();
                            })
                          }
                        />
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {dialog}

      <Modal
        open={addOpen}
        title={tr("addPartner")}
        onClose={() => setAddOpen(false)}
      >
        <div className="space-y-3">
          <Field label="name">
            <input
              className={inputCls}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="equityPercent">
            <input
              className={`${inputCls} tabular-nums`}
              type="number"
              min={0.01}
              max={100}
              step="0.01"
              value={form.equity_percentage}
              onChange={(e) =>
                setForm({ ...form, equity_percentage: e.target.value })
              }
            />
          </Field>
          <Field label="startingBalance">
            <input
              className={`${inputCls} tabular-nums`}
              type="number"
              min={0}
              step="0.01"
              value={form.starting_balance}
              onChange={(e) =>
                setForm({ ...form, starting_balance: e.target.value })
              }
            />
          </Field>
          {Number(form.starting_balance || 0) > 0 ? (
            <Field label="cashBox">
              <select
                className={inputCls}
                value={form.cash_account_id}
                onChange={(e) =>
                  setForm({ ...form, cash_account_id: e.target.value })
                }
              >
                <option value="">{tr("cashBox")}</option>
                {cashAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {lang === "ar" ? a.name : a.name_en || a.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          <div className="flex justify-end gap-2">
            <Btn kind="ghost" onClick={() => setAddOpen(false)}>
              {tr("cancel")}
            </Btn>
            <Btn loading={saving} onClick={() => void createPartner()}>
              {tr("save")}
            </Btn>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!editOpen}
        title={tr("editPartner")}
        onClose={() => setEditOpen(null)}
      >
        <div className="space-y-3">
          <Field label="name">
            <input
              className={inputCls}
              value={editForm.name}
              onChange={(e) =>
                setEditForm({ ...editForm, name: e.target.value })
              }
            />
          </Field>
          <Field label="equityPercent">
            <input
              className={`${inputCls} tabular-nums`}
              type="number"
              min={0.01}
              max={100}
              step="0.01"
              value={editForm.equity_percentage}
              onChange={(e) =>
                setEditForm({ ...editForm, equity_percentage: e.target.value })
              }
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Btn kind="ghost" onClick={() => setEditOpen(null)}>
              {tr("cancel")}
            </Btn>
            <Btn loading={saving} onClick={() => void savePartner()}>
              {tr("save")}
            </Btn>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!drawOpen}
        title={tr("recordWithdrawal")}
        onClose={() => setDrawOpen(null)}
      >
        <div className="space-y-3">
          <div className="text-sm font-bold">{drawOpen?.name}</div>
          <Field label="cashBox">
            <select
              className={inputCls}
              value={draw.cash_account_id}
              onChange={(e) =>
                setDraw({ ...draw, cash_account_id: e.target.value })
              }
            >
              <option value="">{tr("cashBox")}</option>
              {cashAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {lang === "ar" ? a.name : a.name_en || a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="amount">
            <input
              className={`${inputCls} tabular-nums`}
              type="number"
              min={0.01}
              step="0.01"
              value={draw.amount}
              onChange={(e) => setDraw({ ...draw, amount: e.target.value })}
            />
          </Field>
          <Field label="notes">
            <input
              className={inputCls}
              value={draw.note}
              onChange={(e) => setDraw({ ...draw, note: e.target.value })}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Btn kind="ghost" onClick={() => setDrawOpen(null)}>
              {tr("cancel")}
            </Btn>
            <Btn loading={saving} onClick={() => void withdraw()}>
              {tr("save")}
            </Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
