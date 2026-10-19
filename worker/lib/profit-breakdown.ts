import type { AppDb } from "./db";
import {
  reportStamp,
  resolveMovementScope,
  shiftTaggedJournalBinds,
  shiftTaggedJournalSql,
} from "./daily-movement";
import type { ListQ } from "./filters";
import { round2 } from "./helpers";
import { accountSignedBalance, companyValuationFromTrial, typeForCode, type LedgerType, type TrialValuationRow } from "./partners";
import { loadTrialBalance } from "./trial-balance";

export type ProfitBreakdownLine = {
  key: string;
  code: string;
  name_ar: string;
  name_en: string;
  amount: number;
};

export type ProfitBreakdown = {
  lines: ProfitBreakdownLine[];
  net_profit: number;
};

export type ProfitBreakdownResult = ProfitBreakdown & {
  from: string;
  to: string;
  shift_id?: number | null;
};

type NamedTrialRow = TrialValuationRow & {
  name_ar?: string;
  name_en?: string;
};

const KNOWN: Record<string, { key: string; name_ar: string; name_en: string }> = {
  "4100": { key: "sales", name_ar: "المبيعات", name_en: "Sales" },
  "4200": { key: "otherRevenues", name_ar: "إيرادات متنوعة", name_en: "Other revenues" },
  "4210": { key: "shiftOverage", name_ar: "زيادة صندوق", name_en: "Cash overage" },
  "5100": { key: "cogs", name_ar: "تكلفة البضاعة", name_en: "Cost of goods" },
  "5200": { key: "expenses", name_ar: "المصروفات", name_en: "Expenses" },
  "5215": { key: "shiftShortage", name_ar: "عجز صندوق", name_en: "Cash shortage" },
  "5300": { key: "payroll", name_ar: "الرواتب", name_en: "Payroll" },
  "5400": { key: "wastage", name_ar: "الهوالك", name_en: "Wastage" },
};

const KNOWN_ORDER = ["4100", "4200", "4210", "5100", "5200", "5215", "5300", "5400"];

function metaFor(code: string, name_ar?: string, name_en?: string) {
  const known = KNOWN[code];
  if (known) {
    return {
      key: known.key,
      name_ar: name_ar || known.name_ar,
      name_en: name_en || known.name_en,
    };
  }
  return {
    key: `acct_${code}`,
    name_ar: name_ar || code,
    name_en: name_en || code,
  };
}

function signedMovement(type: LedgerType, debitMinusCredit: number) {
  const magnitude = accountSignedBalance(type, debitMinusCredit);
  return type === "expense" ? round2(-magnitude) : magnitude;
}

export function profitBreakdownFromTrial(rows: NamedTrialRow[]): ProfitBreakdown {
  const byCode = new Map<string, ProfitBreakdownLine>();
  for (const row of rows) {
    const type = (row.type || typeForCode(row.code)) as LedgerType;
    if (type !== "revenue" && type !== "expense") continue;
    const code = String(row.code || "").trim();
    if (!code) continue;
    const amount = signedMovement(type, row.net_balance);
    const prev = byCode.get(code);
    if (prev) {
      prev.amount = round2(prev.amount + amount);
      continue;
    }
    const meta = metaFor(code, row.name_ar, row.name_en);
    byCode.set(code, { ...meta, code, amount });
  }
  const net_profit = companyValuationFromTrial(rows).net_profit;
  const extras = [...byCode.keys()].filter((code) => !KNOWN[code]).sort();
  const lines = [...KNOWN_ORDER, ...extras]
    .map((code) => byCode.get(code))
    .filter((line): line is ProfitBreakdownLine => !!line && Math.abs(line.amount) >= 0.005);
  return { lines, net_profit };
}

async function loadPlJournalRows(db: AppDb, fromDt: string, toDt: string, shiftId: number): Promise<NamedTrialRow[]> {
  const stamp = reportStamp("j", "date", "created_at");
  const { results } = await db
    .prepare(
      `SELECT a.code, a.name_ar, a.name_en, a.type,
              COALESCE(SUM(l.debit - l.credit), 0) as net_balance
       FROM journal_lines l
       JOIN journal_entries j ON j.id = l.entry_id
       JOIN ledger_accounts a ON a.id = l.account_id AND a.type IN ('revenue', 'expense')
       WHERE j.status = 'posted'
         AND (
           ${shiftTaggedJournalSql("j")}
           OR (${stamp} >= ? AND ${stamp} <= ?)
           OR (j.source = 'shift_variance' AND j.source_id = ?)
         )
       GROUP BY a.id, a.code, a.name_ar, a.name_en, a.type`,
    )
    .bind(...shiftTaggedJournalBinds(shiftId), fromDt, toDt, shiftId)
    .all<{ code: string; name_ar: string; name_en: string; type: string; net_balance: number }>();
  return (results || []).map((row) => {
    const net = Number(row.net_balance) || 0;
    return {
      type: row.type,
      code: row.code,
      name_ar: row.name_ar,
      name_en: row.name_en,
      net_balance: net,
      closing_balance: net,
    };
  });
}

export async function loadProfitBreakdown(db: AppDb, p: ListQ): Promise<ProfitBreakdownResult> {
  const trial = await loadTrialBalance(db, p);
  return {
    ...profitBreakdownFromTrial(trial.data),
    from: trial.from,
    to: trial.to,
    shift_id: null,
  };
}

export async function loadProfitBreakdownForMovement(db: AppDb, p: ListQ): Promise<ProfitBreakdownResult> {
  const { range, shift, shiftId } = await resolveMovementScope(db, p);
  if (shiftId && shift) {
    const rows = await loadPlJournalRows(db, range.fromDt, range.toDt, shiftId);
    return {
      ...profitBreakdownFromTrial(rows),
      from: range.fromDate,
      to: range.toDate,
      shift_id: shiftId,
    };
  }
  const trial = await loadTrialBalance(db, {
    ...p,
    from: range.fromDate,
    to: range.toDate,
    date_from: range.fromDate,
    date_to: range.toDate,
  });
  return {
    ...profitBreakdownFromTrial(trial.data),
    from: trial.from,
    to: trial.to,
    shift_id: null,
  };
}
