import assert from "node:assert/strict";
import test from "node:test";
import { STAFF_KINDS } from "../worker/lib/staff.ts";

test("staff kinds cover courier and office roles", () => {
  assert.deepEqual([...STAFF_KINDS], ["courier", "cashier", "warehouse", "accountant"]);
});
