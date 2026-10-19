import { round2 } from "./helpers";

export type LedgerType = "asset" | "liability" | "equity" | "revenue" | "expense";

export type CompanyValuation = {
  total_assets: number;
  total_liabilities: number;
  net_equity: number;
  net_profit: number;
  total_wastage: number;
  revenues: number;
  cogs: number;
  expenses: number;
  shift_overage: number;
  shift_shortage: number;
};

export type PartnerShares = {
  profit_share: number;
  asset_share: number;
  net_due: number;
};

export type TrialValuationRow = {
  type: string;
  code: string;
  closing_balance: number;
  net_balance: number;
};

export function typeForCode(code: string): LedgerType {
  const head = String(code || "").trim().slice(0, 1);
  if (head === "1") return "asset";
  if (head === "2") return "liability";
  if (head === "3") return "equity";
  if (head === "4") return "revenue";
  return "expense";
}

export function accountSignedBalance(type: LedgerType, debitMinusCredit: number) {
  const raw = round2(Number(debitMinusCredit) || 0);
  if (type === "asset" || type === "expense") return raw;
  return round2(-raw);
}

export function assertEquityCap(existingPercents: number[], nextPercent: number) {
  const next = round2(Number(nextPercent) || 0);
  if (!(next > 0) || next > 100) throw new Error("invalid_percent");
  const used = round2(existingPercents.reduce((s, n) => s + (Number(n) || 0), 0));
  if (round2(used + next) > 100.005) throw new Error("equity_cap");
  return { used, next, remaining: round2(100 - used) };
}

export function partnerDrawLines(equityAccountId: number, cashAccountId: number, amount: number) {
  const n = round2(amount);
  return [
    { account_id: equityAccountId, debit: n },
    { account_id: cashAccountId, credit: n },
  ];
}

export function partnerDepositLines(equityAccountId: number, cashAccountId: number, amount: number) {
  const n = round2(amount);
  return [
    { account_id: cashAccountId, debit: n },
    { account_id: equityAccountId, credit: n },
  ];
}

export function companyValuationFromTrial(rows: TrialValuationRow[]): CompanyValuation {
  let assets = 0;
  let liabilities = 0;
  let revenues = 0;
  let expensesAll = 0;
  let cogs = 0;
  let opex = 0;
  let wastage = 0;
  for (const r of rows) {
    const type = (r.type || typeForCode(r.code)) as LedgerType;
    const closing = accountSignedBalance(type, r.closing_balance);
    const period = accountSignedBalance(type, r.net_balance);
    if (type === "asset") assets += closing;
    else if (type === "liability") liabilities += closing;
    else if (type === "revenue") revenues += period;
    else if (type === "expense") {
      expensesAll += period;
      const code = String(r.code || "");
      if (code === "5100" || code.startsWith("51")) cogs += period;
      else if (code === "5400" || code.startsWith("54")) wastage += period;
      else opex += period;
    }
  }
  return {
    total_assets: round2(assets),
    total_liabilities: round2(liabilities),
    net_equity: round2(assets - liabilities),
    net_profit: round2(revenues - expensesAll),
    total_wastage: round2(wastage),
    revenues: round2(revenues),
    cogs: round2(cogs),
    expenses: round2(opex),
    shift_overage: round2(rows.filter((r) => String(r.code) === "4210").reduce((s, r) => s + accountSignedBalance("revenue", r.net_balance), 0)),
    shift_shortage: round2(rows.filter((r) => String(r.code) === "5215").reduce((s, r) => s + accountSignedBalance("expense", r.net_balance), 0)),
  };
}

export function companyValuation(balancesByCode: Record<string, number>): CompanyValuation {
  return companyValuationFromTrial(
    Object.entries(balancesByCode).map(([code, raw]) => ({
      code,
      type: typeForCode(code),
      closing_balance: Number(raw) || 0,
      net_balance: Number(raw) || 0,
    })),
  );
}

export function availableToWithdraw(netProfit: number, periodDraws: number) {
  return round2((Number(netProfit) || 0) - (Number(periodDraws) || 0));
}

export function remainingShare(share: number, withdrawn: number) {
  return round2(Math.max(0, (Number(share) || 0) - (Number(withdrawn) || 0)));
}

export function ownerProfitShare(netProfit: number, allocatedPercent: number) {
  const left = round2(Math.max(0, 100 - (Number(allocatedPercent) || 0)));
  return round2((Number(netProfit) || 0) * (left / 100));
}

export function withdrawCap(personalRemaining: number, companyAvailable: number) {
  return round2(Math.max(0, Math.min(Number(personalRemaining) || 0, Number(companyAvailable) || 0)));
}

export function assertCanWithdraw(amount: number, available: number) {
  const n = round2(amount);
  const cap = round2(available);
  if (!(n > 0)) throw new Error("missing_fields");
  if (cap <= 0.005 || n > cap + 0.005) throw new Error("exceeds_available");
  return n;
}

export function partnerLiveShares(opts: {
  percent: number;
  netProfit: number;
  netEquity: number;
  withdrawals: number;
}): PartnerShares {
  const ratio = (Number(opts.percent) || 0) / 100;
  const profit_share = round2((Number(opts.netProfit) || 0) * ratio);
  const asset_share = round2((Number(opts.netEquity) || 0) * ratio);
  return {
    profit_share,
    asset_share,
    net_due: remainingShare(profit_share, opts.withdrawals),
  };
}
