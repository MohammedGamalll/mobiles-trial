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
    net_due: round2(profit_share - (Number(opts.withdrawals) || 0)),
  };
}
