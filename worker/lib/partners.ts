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

const ASSET_CODES = ["1100", "1110", "1200", "1300"] as const;
const LIABILITY_CODES = ["2100"] as const;
const REVENUE_CODES = ["4100", "4200"] as const;
const EXPENSE_CODES = ["5100", "5200", "5300", "5400"] as const;

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

export function companyValuation(balancesByCode: Record<string, number>): CompanyValuation {
  const signed = (code: string, type: LedgerType) => accountSignedBalance(type, balancesByCode[code] || 0);
  const total_assets = round2(ASSET_CODES.reduce((s, code) => s + signed(code, "asset"), 0));
  const total_liabilities = round2(LIABILITY_CODES.reduce((s, code) => s + signed(code, "liability"), 0));
  const revenues = round2(REVENUE_CODES.reduce((s, code) => s + signed(code, "revenue"), 0));
  const cogs = signed("5100", "expense");
  const expenses = round2(signed("5200", "expense") + signed("5300", "expense"));
  const total_wastage = signed("5400", "expense");
  const costTotal = round2(EXPENSE_CODES.reduce((s, code) => s + signed(code, "expense"), 0));
  return {
    total_assets,
    total_liabilities,
    net_equity: round2(total_assets - total_liabilities),
    net_profit: round2(revenues - costTotal),
    total_wastage,
    revenues,
    cogs,
    expenses,
  };
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
