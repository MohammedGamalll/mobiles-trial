import { round2 } from "./helpers";

export type FxCurrency = "EGP" | "USD";
export type SurplusMode = "wallet" | "ignore";

export function openingCreditAbs(raw: unknown) {
  const n = round2(Math.abs(Number(raw || 0)));
  return n > 0 ? n : 0;
}

/** Customer AR: negative = credit in their favor (ليه). */
export function customerOpeningSigned(raw: unknown) {
  return round2(-openingCreditAbs(raw));
}

export function fxCurrency(v: unknown): FxCurrency {
  return String(v || "EGP").toUpperCase() === "USD" ? "USD" : "EGP";
}

export function fxRate(v: unknown) {
  const n = Number(v || 0);
  return n > 0 ? n : 50;
}

export function toEgp(amount: number, currency: FxCurrency, rate: unknown) {
  const n = Number(amount || 0);
  return round2(currency === "USD" ? n * fxRate(rate) : n);
}

export function fromEgp(egp: number, currency: FxCurrency, rate: unknown) {
  const n = Number(egp || 0);
  if (currency === "USD") return round2(n / fxRate(rate));
  return round2(n);
}

/** Canonical supplier AP in EGP: positive = we owe them. */
export function supplierPayableEgp(amount: number, currency: FxCurrency, rate: unknown) {
  return round2(Math.abs(toEgp(amount, currency, rate)));
}

export function applyStandaloneReceipt(opts: {
  requested: number;
  arBalance: number;
  invoiceRemainings: { id: number; remaining: number }[];
  surplusMode: SurplusMode;
}) {
  const requested = round2(Math.max(0, Number(opts.requested || 0)));
  const debt = round2(Math.max(0, Number(opts.arBalance || 0)));
  const take = opts.surplusMode === "ignore" ? round2(Math.min(requested, debt)) : requested;
  let left = take;
  const applied: { id: number; amount: number }[] = [];
  for (const inv of opts.invoiceRemainings) {
    if (left <= 0) break;
    const amt = round2(Math.min(Number(inv.remaining || 0), left));
    if (amt <= 0) continue;
    applied.push({ id: inv.id, amount: amt });
    left = round2(left - amt);
  }
  const surplus = round2(Math.max(0, take - debt));
  const nextBalance = round2(Number(opts.arBalance || 0) - take);
  return { take, applied, surplus, nextBalance };
}

export function splitInvoiceCash(requested: number, total: number, surplusMode: SurplusMode) {
  const req = round2(Math.max(0, Number(requested || 0)));
  const tot = round2(Math.max(0, Number(total || 0)));
  const cash = surplusMode === "ignore" && req > tot ? tot : req;
  const invoicePaid = round2(Math.min(cash, tot));
  const remaining = round2(tot - invoicePaid);
  const surplus = round2(cash - invoicePaid);
  return { cash, invoicePaid, remaining, surplus };
}
