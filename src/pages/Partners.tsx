import { useEffect, useState } from "react";
import { useApp } from "../context";
import { del, get, post, put } from "../lib/api";
import { apiMessage } from "../lib/errors";
import { money, num } from "../lib/format";
import { TablePager } from "../components/TablePager";
import { usePagedRows } from "../hooks/usePagedRows";
import { ActionBtns, useConfirm } from "../components/Confirm";
import { SmartFilter } from "../components/SmartFilter";
import { useListQuery } from "../hooks/useListQuery";
import { ProfitBreakdown, type ProfitBreakdownData } from "../components/ProfitBreakdown";
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
  available_profit?: number;
  owner_available?: number;
  period_draws?: number;
  total_wastage: number;
  revenues: number;
  expenses: number;
  shift_overage?: number;
  shift_shortage?: number;
  profit_breakdown?: ProfitBreakdownData | null;
  draws?: ProfitDraw[];
  from?: string;
  to?: string;
};

type ProfitDraw = {
  id: number;
  date: string;
  source: string;
  amount: number;
  partner_name: string | null;
  note: string;
  user_name: string;
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
  available?: number;
};

function clampAmount(raw: string, cap: number) {
  if (raw === "" || raw === ".") return raw;
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  if (n < 0) return "0";
  if (n > cap) return String(cap);
  return raw;
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
    <span className={`tabular-nums ${strong ? "font-black" : "font-bold"}`}>
      {money(n, lang as "ar" | "en")}
    </span>
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
  const f = useListQuery("partners", { period: "this_month" });
  const cashAccounts = lookups?.cash_accounts || [];
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [rows, setRows] = useState<Partner[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState<Partner | null>(null);
  const [drawOpen, setDrawOpen] = useState<Partner | null>(null);
  const [profitOpen, setProfitOpen] = useState(false);
  const [profit, setProfit] = useState({ amount: "", cash_account_id: "", partner_id: "", note: "" });
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
        `/api/partners?${f.qs}`,
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
  }, [f.qs]);

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
      await post(`/api/partners/${drawOpen.id}/withdraw?${f.qs}`, {
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

  async function withdrawProfit() {
    setSaving(true);
    setErr("");
    try {
      await post(`/api/partners/profit-withdraw?${f.qs}`, {
        amount: Number(profit.amount || 0),
        cash_account_id: Number(profit.cash_account_id || 0),
        partner_id: profit.partner_id ? Number(profit.partner_id) : undefined,
        note: profit.note.trim() || undefined,
      });
      setProfitOpen(false);
      setProfit({ amount: "", cash_account_id: "", partner_id: "", note: "" });
      await load();
    } catch (e) {
      setErr(apiMessage(tr, e));
    } finally {
      setSaving(false);
    }
  }

  const pagedPartners = usePagedRows(rows, page, pageSize);
  const usedPct = rows.reduce(
    (s, r) => s + (Number(r.equity_percentage) || 0),
    0,
  );
  const drawCap = drawOpen ? Number(drawOpen.available ?? drawOpen.net_due ?? 0) : 0;
  const selectedProfit = profit.partner_id
    ? rows.find((r) => String(r.id) === profit.partner_id)
    : null;
  const profitCap = selectedProfit
    ? Number(selectedProfit.available ?? selectedProfit.net_due ?? 0)
    : Number(dash?.owner_available ?? dash?.available_profit ?? 0);

  return (
    <div className="text-[var(--text)]">
      <PrintLetterhead title={tr("partnersEquity")} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-black">{tr("partnersEquity")}</h1>
          <div className="mt-1 text-sm text-[var(--muted)]">
            {tr("equityPercent")}:{" "}
            {num(usedPct, lang)}
            %
          </div>
          {dash?.from ? (
            <div className="mt-1 text-sm font-bold text-[var(--muted)]">
              {tr("fromDate")} {dash.from}
              {dash.to && dash.to !== dash.from ? ` · ${tr("toDate")} ${dash.to}` : ""}
            </div>
          ) : null}
        </div>
        <div className="no-print flex flex-wrap gap-2">
          {can("partners.manage") ? (
            <>
              <Btn
                kind="soft"
                onClick={() => {
                  setErr("");
                  setProfit({
                    amount: "",
                    cash_account_id: String(cashAccounts[0]?.id || ""),
                    partner_id: "",
                    note: "",
                  });
                  setProfitOpen(true);
                }}
              >
                {tr("profitWithdraw")}
              </Btn>
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
            </>
          ) : null}
          <PrintBtn />
        </div>
      </div>

      <SmartFilter f={f} fields={[]} />
      {err ? <ErrorNote message={err} /> : null}

      {dash ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Kpi
            label={tr("netEquity")}
            value={money(dash.net_equity, lang)}
          />
          <Kpi
            label={tr("availableProfit")}
            value={money(dash.available_profit ?? dash.net_profit, lang)}
            hint={`${tr("netProfit")} ${money(dash.net_profit, lang)} − ${tr("withdrawals")} ${money(dash.period_draws || 0, lang)}`}
          />
          <Kpi
            label={tr("netProfit")}
            value={money(dash.net_profit, lang)}
          />
          <Kpi
            label={tr("totalWastage")}
            value={money(dash.total_wastage, lang)}
            warn
          />
        </div>
      ) : null}

      {dash?.profit_breakdown ? <ProfitBreakdown data={dash.profit_breakdown} className="mb-4" /> : null}

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
                <th className="text-center">{tr("canWithdraw")}</th>
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
              {pagedPartners.rows.map((r) => (
                <tr key={r.id}>
                  <td className="truncate font-bold" title={r.name}>
                    {r.name}
                  </td>
                  <td className="whitespace-nowrap text-center font-bold tabular-nums">
                    {num(r.equity_percentage, lang)}
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
                    <AmountCell n={r.available ?? r.net_due} lang={lang} strong />
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
        <TablePager page={page} pageSize={pageSize} total={rows.length} disabled={loading} onPage={setPage} onPageSize={setPageSize} />
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
        <div className="border-b border-[var(--border)] px-4 py-3 text-sm font-black">{tr("profitWithdrawals")}</div>
        <div className="table-wrap overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="text-center">{tr("date")}</th>
                <th className="text-center">{tr("beneficiary")}</th>
                <th className="text-center">{tr("amount")}</th>
                <th className="text-center">{tr("notes")}</th>
              </tr>
            </thead>
            <tbody>
              {!(dash?.draws || []).length ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-[var(--muted)]">
                    {tr("noData")}
                  </td>
                </tr>
              ) : (
                (dash?.draws || []).map((d) => (
                  <tr key={d.id}>
                    <td className="whitespace-nowrap font-bold tabular-nums">{d.date}</td>
                    <td className=" font-bold">{d.partner_name || tr("owner")}</td>
                    <td className="whitespace-nowrap ">
                      <AmountCell n={d.amount} lang={lang} />
                    </td>
                    <td className=" text-[var(--muted)]">{d.note || "—"}</td>
                  </tr>
                ))
              )}
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
          <div className="text-sm font-bold">
            {tr("canWithdraw")}: {money(drawCap, lang)}
          </div>
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
              min={0}
              max={drawCap}
              step="0.01"
              value={draw.amount}
              onChange={(e) => setDraw({ ...draw, amount: clampAmount(e.target.value, drawCap) })}
              disabled={drawCap <= 0}
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
            <Btn loading={saving} disabled={drawCap <= 0 || !(Number(draw.amount) > 0)} onClick={() => void withdraw()}>
              {tr("save")}
            </Btn>
          </div>
        </div>
      </Modal>
      <Modal open={profitOpen} title={tr("profitWithdraw")} onClose={() => setProfitOpen(false)}>
        <div className="space-y-3">
          <div className="text-sm font-bold">
            {tr("availableProfit")}: {money(dash?.available_profit ?? 0, lang)}
          </div>
          <div className="text-sm font-bold">
            {tr("canWithdraw")}: {money(profitCap, lang)}
            {selectedProfit ? ` · ${selectedProfit.name}` : ` · ${tr("owner")}`}
          </div>
          <Field label="cashBox">
            <select
              className={inputCls}
              value={profit.cash_account_id}
              onChange={(e) => setProfit({ ...profit, cash_account_id: e.target.value })}
            >
              <option value="">{tr("cashBox")}</option>
              {cashAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {lang === "ar" ? a.name : a.name_en || a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={tr("partnersEquity")}>
            <select
              className={inputCls}
              value={profit.partner_id}
              onChange={(e) => {
                const id = e.target.value;
                const row = id ? rows.find((r) => String(r.id) === id) : null;
                const cap = row
                  ? Number(row.available ?? row.net_due ?? 0)
                  : Number(dash?.owner_available ?? dash?.available_profit ?? 0);
                setProfit({ ...profit, partner_id: id, amount: clampAmount(profit.amount, cap) });
              }}
            >
              <option value="">{tr("ownerDraw")} — {money(dash?.owner_available ?? 0, lang)}</option>
              {rows.map((r) => (
                <option key={r.id} value={r.id}>{r.name} — {money(r.available ?? r.net_due, lang)}</option>
              ))}
            </select>
          </Field>
          <Field label="amount">
            <input
              className={`${inputCls} tabular-nums`}
              type="number"
              min={0}
              max={profitCap}
              step="0.01"
              value={profit.amount}
              onChange={(e) => setProfit({ ...profit, amount: clampAmount(e.target.value, profitCap) })}
              disabled={profitCap <= 0}
            />
          </Field>
          <Field label="notes">
            <input
              className={inputCls}
              value={profit.note}
              onChange={(e) => setProfit({ ...profit, note: e.target.value })}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Btn kind="ghost" onClick={() => setProfitOpen(false)}>{tr("cancel")}</Btn>
            <Btn loading={saving} disabled={profitCap <= 0 || !(Number(profit.amount) > 0)} onClick={() => void withdrawProfit()}>{tr("save")}</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
