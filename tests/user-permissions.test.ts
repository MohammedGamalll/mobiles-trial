import assert from "node:assert/strict";
import test from "node:test";
import { isSuperAdmin, userHasPerm } from "../worker/lib/user-permissions.ts";

test("admin slug and user id 1 bypass permission checks", () => {
  assert.equal(isSuperAdmin({ id: 9, role_slug: "admin" }), true);
  assert.equal(isSuperAdmin({ id: 1, role_slug: "sales" }), true);
  assert.equal(isSuperAdmin({ id: 4, role_slug: "sales" }), false);
  assert.equal(userHasPerm({ id: 1, role_slug: "sales", permissions: [] }, "sales.create"), true);
});

test("same job role can have different per-user checklists", () => {
  const a = { id: 2, role_slug: "sales", role_id: 2, permissions: ["sales.create", "sales.view"] };
  const b = { id: 3, role_slug: "sales", role_id: 2, permissions: ["sales.view"] };
  assert.equal(userHasPerm(a, "sales.create"), true);
  assert.equal(userHasPerm(b, "sales.create"), false);
  assert.equal(userHasPerm(b, "sales.view"), true);
  assert.equal(userHasPerm(b, "sales.create", "sales.view"), true);
});

test("missing user is forbidden", () => {
  assert.equal(userHasPerm(null, "sales.create"), false);
});
