import assert from "node:assert/strict";
import test from "node:test";
import { FACTORY_CASH_ACCOUNTS, shouldWipeTable } from "../worker/lib/factory-wipe.ts";

test("wipe keeps people, HR, couriers, users and migrations", () => {
  for (const keep of [
    "users",
    "user_permissions",
    "sessions",
    "roles",
    "permissions",
    "role_permissions",
    "schema_migrations",
    "customers",
    "suppliers",
    "delivery_agents",
    "employees",
    "work_shifts",
  ]) {
    assert.equal(shouldWipeTable(keep), false);
  }
});

test("factory restore seeds main fund and safe treasuries", () => {
  const names = FACTORY_CASH_ACCOUNTS.map((r) => r[1]);
  assert.ok(names.includes("الصندوق الرئيسي"));
  assert.ok(names.includes("الخزنه"));
});

test("wipe clears finance and every other business table", () => {
  for (const wipe of [
    "products",
    "sales_invoices",
    "payments",
    "audit_logs",
    "settings",
    "sequences",
    "payment_methods",
    "ledger_accounts",
    "cash_accounts",
    "journal_entries",
    "vouchers",
    "pos_shifts",
    "branches",
    "backups",
    "whatsapp_templates",
  ]) {
    assert.equal(shouldWipeTable(wipe), true);
  }
});
