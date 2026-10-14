export type CashAccountOpt = {
  id: number;
  kind?: string;
  name?: string;
  name_en?: string;
};

function isCashKind(a: CashAccountOpt) {
  return !a.kind || a.kind === "cash";
}

function isMainDrawer(a: CashAccountOpt) {
  return /صندوق رئيسي|الصندوق الرئيسي|main drawer|main cash|main fund/i.test(`${a.name || ""} ${a.name_en || ""}`);
}

function isSafeBox(a: CashAccountOpt) {
  return /^(الخزنه|الخزنة)$/i.test(String(a.name || "").trim()) || /^(safe|the safe)$/i.test(String(a.name_en || "").trim());
}

/** Purchases pay from the second treasury (الخزنة / id 2), not the POS main drawer. */
export function purchaseDefaultCashId(accounts: CashAccountOpt[] | undefined | null) {
  const cash = (accounts || []).filter(isCashKind);
  const safe = cash.find(isSafeBox);
  if (safe) return safe.id;
  const byId = cash.find((a) => a.id === 2);
  if (byId) return byId.id;
  const notMain = cash.find((a) => !isMainDrawer(a));
  return Number(notMain?.id || cash[0]?.id || 0) || 0;
}
