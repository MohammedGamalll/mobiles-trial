import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_WHATSAPP_TEMPLATES,
  defaultTemplateByCode,
  renderTemplate,
  slugTemplateCode,
  toIntlPhone,
  waLink,
} from "../worker/lib/whatsapp.ts";

test("default templates include invoice send", () => {
  assert.ok(defaultTemplateByCode("invoice_created"));
  assert.equal(DEFAULT_WHATSAPP_TEMPLATES.length, 5);
  assert.match(defaultTemplateByCode("invoice_created")!.body_ar, /\{\{invoice_number\}\}/);
});

test("renderTemplate fills invoice fields", () => {
  const msg = renderTemplate("أهلاً {{customer_name}} فاتورة {{invoice_number}}", {
    customer_name: "عماد",
    invoice_number: "INV-10",
  });
  assert.equal(msg, "أهلاً عماد فاتورة INV-10");
});

test("custom template codes stay simple", () => {
  assert.equal(slugTemplateCode("Invoice Created"), "invoice_created");
  assert.match(slugTemplateCode("رسالة خاصة"), /^custom_/);
});

test("WhatsApp link keeps the full invoice message", () => {
  const phone = toIntlPhone("01000001111");
  const msg = "أهلاً عميلنا\n\nفاتورة INV-0024\n• REL C53 × 1\nالإجمالي: 200 جنيه\nشكرًا";
  const link = waLink(phone!, msg);
  assert.ok(link?.startsWith("https://wa.me/201000001111?text="));
  assert.ok(link!.includes(encodeURIComponent("INV-0024")));
});
