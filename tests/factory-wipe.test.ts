import assert from "node:assert/strict";
import test from "node:test";
import { shouldWipeTable } from "../worker/lib/factory-wipe.ts";

test("wipe keeps only admin auth and migrations", () => {
  for (const keep of ["users", "sessions", "roles", "permissions", "role_permissions", "schema_migrations"]) {
    assert.equal(shouldWipeTable(keep), false);
  }
});

test("wipe clears finance and every other business table", () => {
  for (const wipe of [
    "products",
    "customers",
    "sales_invoices",
    "employees",
    "payments",
    "audit_logs",
    "settings",
    "sequences",
    "payment_methods",
    "ledger_accounts",
    "cash_accounts",
    "journal_entries",
    "vouchers",
    "branches",
    "backups",
  ]) {
    assert.equal(shouldWipeTable(wipe), true);
  }
});
