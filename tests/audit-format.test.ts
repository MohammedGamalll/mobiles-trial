import assert from "node:assert/strict";
import test from "node:test";
import {
  auditChanges,
  formatAuditAction,
  formatAuditDetails,
  formatAuditEntity,
  formatAuditRow,
} from "../src/lib/audit-format.ts";

test("actions and entities are Arabic", () => {
  assert.equal(formatAuditAction("edit_customer", "ar"), "تعديل عميل");
  assert.equal(formatAuditAction("open_shift", "ar"), "فتح وردية");
  assert.equal(formatAuditAction("create_brands", "ar"), "إضافة ماركة");
  assert.equal(formatAuditEntity("customer", 16, "ar"), "عميل رقم 16");
  assert.equal(formatAuditEntity("pos_shift", 3, "ar"), "وردية الصندوق رقم 3");
});

test("english details become readable Arabic", () => {
  assert.equal(formatAuditDetails({ action: "open_shift", details: "Open drawer 4" }, "ar"), "فتح الصندوق رقم 4");
  assert.equal(
    formatAuditDetails({ action: "import", details: "Excel products +6 skip 0 replace=1" }, "ar"),
    "استيراد أصناف من إكسل: أُضيف 6 وتُجاهل 0 مع استبدال الموجود",
  );
  assert.equal(formatAuditDetails({ action: "wipe_all", details: "kept_admin" }, "ar"), "مع الإبقاء على حساب المدير");
  assert.equal(formatAuditDetails({ action: "create_invoice", details: "Create INV-12" }, "ar"), "إنشاء INV-12");
});

test("before/after shows only changed fields with Arabic labels", () => {
  const changes = auditChanges(
    { name: "عميل تجريبي", phone: "01234567891", credit_limit: 0, customer_type: "retail", payment_terms: "cash", city: null },
    { name: "عميل تجريبي", phone: "01234567891", credit_limit: 0, customer_type: "retail", payment_terms: "cash", city: "الجيزة" },
    "ar",
  );
  assert.deepEqual(changes, [{ field: "المدينة", from: "فارغ", to: "الجيزة" }]);
});

test("row summary for customer edit", () => {
  const row = formatAuditRow(
    {
      action: "edit_customer",
      entity_type: "customer",
      entity_id: 16,
      details: "عميل تجريبي",
      old_value: JSON.stringify({ city: null }),
      new_value: JSON.stringify({ city: "الجيزة" }),
    },
    "ar",
  );
  assert.equal(row.action, "تعديل عميل");
  assert.equal(row.entity, "عميل رقم 16");
  assert.equal(row.details, "عميل تجريبي");
  assert.equal(row.changes[0]?.to, "الجيزة");
});
