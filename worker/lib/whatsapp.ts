export type WhatsappTemplate = {
  code: string;
  name_ar: string;
  name_en: string;
  body_ar: string;
  body_en: string;
  active?: number;
};

type WhatsappDb = {
  prepare: (sql: string) => {
    bind: (...args: unknown[]) => {
      run: () => Promise<unknown>;
      first: <T = unknown>() => Promise<T | null | undefined>;
    };
  };
};

export const WA_TEMPLATE_VARS = [
  "customer_name",
  "invoice_number",
  "products",
  "total",
  "order_type",
  "store_name",
  "address",
  "agent_name",
  "agent_code",
  "agent_phone",
  "delivery_time",
] as const;

export const DEFAULT_WHATSAPP_TEMPLATES: WhatsappTemplate[] = [
  {
    code: "invoice_created",
    name_ar: "إنشاء فاتورة",
    name_en: "Invoice created",
    body_ar: `أهلاً بك يا {{customer_name}} 👋

تم تسجيل طلبك من {{store_name}}.

رقم الفاتورة:
{{invoice_number}}

المنتجات:
{{products}}

إجمالي الفاتورة:
{{total}} جنيه

نوع الطلب:
{{order_type}}
{{agent_block}}{{time_block}}{{address_block}}
شكرًا لتعاملك مع {{store_name}} ❤️`,
    body_en: `Hello {{customer_name}} 👋

Your order has been registered at {{store_name}}.

Invoice:
{{invoice_number}}

Products:
{{products}}

Total:
{{total}} EGP

Order type:
{{order_type}}
{{agent_block}}{{time_block}}{{address_block}}
Thank you for choosing {{store_name}} ❤️`,
  },
  {
    code: "out_for_delivery",
    name_ar: "خرج للتوصيل",
    name_en: "Out for delivery",
    body_ar: `أهلاً {{customer_name}} 👋

طلبك رقم {{invoice_number}} خرج الآن مع التيار {{agent_name}} ({{agent_code}}).
{{time_block}}
{{address_block}}
للمتابعة: {{agent_phone}}

{{store_name}}`,
    body_en: `Hello {{customer_name}} 👋

Order {{invoice_number}} is now out for delivery with {{agent_name}} ({{agent_code}}).
{{time_block}}
{{address_block}}
Contact: {{agent_phone}}

{{store_name}}`,
  },
  {
    code: "delivered",
    name_ar: "تم التسليم",
    name_en: "Delivered",
    body_ar: `تم تسليم طلبك رقم {{invoice_number}} بنجاح ✅

شكرًا لتعاملك مع {{store_name}} ❤️`,
    body_en: `Your order {{invoice_number}} was delivered successfully ✅

Thank you for choosing {{store_name}} ❤️`,
  },
  {
    code: "partial_delivery",
    name_ar: "تسليم جزئي",
    name_en: "Partial delivery",
    body_ar: `أهلاً {{customer_name}}

تم تسليم جزء من طلبك رقم {{invoice_number}}.

المنتجات:
{{products}}

الإجمالي النهائي:
{{total}} جنيه

{{store_name}}`,
    body_en: `Hello {{customer_name}}

Part of order {{invoice_number}} was delivered.

Items:
{{products}}

Final total:
{{total}} EGP

{{store_name}}`,
  },
  {
    code: "returned",
    name_ar: "مرتجع",
    name_en: "Returned",
    body_ar: `تم تحديث طلبك رقم {{invoice_number}}.

الحالة: مرتجع
{{products}}

{{store_name}}`,
    body_en: `Your order {{invoice_number}} was updated.

Status: Returned
{{products}}

{{store_name}}`,
  },
];

export function defaultTemplateByCode(code: string) {
  return DEFAULT_WHATSAPP_TEMPLATES.find((t) => t.code === code) || null;
}

export function slugTemplateCode(raw: string) {
  const ascii = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
  return ascii || `custom_${Date.now().toString(36)}`;
}

export async function upsertWhatsappTemplate(db: WhatsappDb, tpl: WhatsappTemplate) {
  const code = slugTemplateCode(tpl.code);
  const nameAr = String(tpl.name_ar || tpl.name_en || code).trim() || code;
  const nameEn = String(tpl.name_en || tpl.name_ar || code).trim() || code;
  const bodyAr = String(tpl.body_ar || "").trim() || defaultTemplateByCode(code)?.body_ar || DEFAULT_WHATSAPP_TEMPLATES[0].body_ar;
  const bodyEn = String(tpl.body_en || "").trim() || defaultTemplateByCode(code)?.body_en || bodyAr;
  await db
    .prepare(
      `INSERT INTO whatsapp_templates (code, name_ar, name_en, body_ar, body_en, active)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(code) DO UPDATE SET
         name_ar=excluded.name_ar,
         name_en=excluded.name_en,
         body_ar=excluded.body_ar,
         body_en=excluded.body_en,
         active=excluded.active,
         updated_at=datetime('now')`,
    )
    .bind(code, nameAr, nameEn, bodyAr, bodyEn, tpl.active === 0 ? 0 : 1)
    .run();
  return { ...tpl, code, name_ar: nameAr, name_en: nameEn, body_ar: bodyAr, body_en: bodyEn, active: tpl.active === 0 ? 0 : 1 };
}

export async function ensureWhatsappTemplates(db: WhatsappDb) {
  for (const t of DEFAULT_WHATSAPP_TEMPLATES) {
    try {
      await db
        .prepare(
          `INSERT OR IGNORE INTO whatsapp_templates (code, name_ar, name_en, body_ar, body_en, active)
           VALUES (?, ?, ?, ?, ?, 1)`,
        )
        .bind(t.code, t.name_ar, t.name_en, t.body_ar, t.body_en)
        .run();
    } catch {
      /* table may be mid-migrate */
    }
  }
}

export async function restoreWhatsappTemplates(db: WhatsappDb) {
  for (const t of DEFAULT_WHATSAPP_TEMPLATES) {
    await upsertWhatsappTemplate(db, { ...t, active: 1 });
  }
}

export async function loadWhatsappTemplate(db: WhatsappDb, code: string) {
  await ensureWhatsappTemplates(db);
  const wanted = String(code || "invoice_created").trim() || "invoice_created";
  const row = await db
    .prepare("SELECT * FROM whatsapp_templates WHERE code = ?")
    .bind(wanted)
    .first<WhatsappTemplate>();
  if (row && (row.body_ar || row.body_en)) return row;
  return defaultTemplateByCode(wanted) || DEFAULT_WHATSAPP_TEMPLATES[0];
}

export function toIntlPhone(raw: string | null | undefined) {
  if (!raw) return null;
  let n = raw.replace(/[^\d]/g, "");
  if (n.startsWith("00")) n = n.slice(2);
  if (n.startsWith("0") && n.length === 11) n = `20${n.slice(1)}`;
  if (n.startsWith("1") && n.length === 10) n = `20${n}`;
  if (!n.startsWith("20") && n.length >= 10) n = `20${n.replace(/^0+/, "")}`;
  return n;
}

export function waLink(phone: string, message: string) {
  const intl = toIntlPhone(phone);
  if (!intl) return null;
  return `https://wa.me/${intl}?text=${encodeURIComponent(message)}`;
}

type InvoiceLike = {
  number: string;
  customer_name: string | null;
  type: string;
  total: number;
  address: string | null;
  expected_delivery_time: string | null;
  delivery_agent_name: string | null;
  delivery_agent_code: string | null;
  delivery_agent_phone: string | null;
};

type ItemLike = { product_name: string; quantity: number; delivered_qty?: number; returned_qty?: number };

export function formatMoney(n: number) {
  return Number(n || 0).toLocaleString("en-EG", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function renderTemplate(body: string, vars: Record<string, string>) {
  let out = body;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{{${k}}}`, v ?? "");
  }
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

export function invoiceTemplateVars(
  invoice: InvoiceLike,
  items: ItemLike[],
  storeName: string,
  lang: "ar" | "en",
) {
  const products = items
    .map((i) => {
      const qty = i.delivered_qty != null && i.delivered_qty > 0 ? i.delivered_qty : i.quantity;
      return `• ${i.product_name} × ${qty}`;
    })
    .join("\n");
  const isDelivery = invoice.type === "delivery";
  const orderType = lang === "ar" ? (isDelivery ? "توصيل 🚚" : "استلام من المحل") : isDelivery ? "Delivery 🚚" : "Store pickup";
  let agentBlock = "";
  if (isDelivery && invoice.delivery_agent_name) {
    agentBlock =
      lang === "ar"
        ? `\nالتيار:\n${invoice.delivery_agent_name}\n\nرقم التيار:\n${invoice.delivery_agent_code || "-"}\n${invoice.delivery_agent_phone ? `\nهاتف التيار:\n${invoice.delivery_agent_phone}\n` : ""}`
        : `\nCourier:\n${invoice.delivery_agent_name}\n\nCourier no.:\n${invoice.delivery_agent_code || "-"}\n${invoice.delivery_agent_phone ? `\nPhone:\n${invoice.delivery_agent_phone}\n` : ""}`;
  }
  let timeBlock = "";
  if (invoice.expected_delivery_time) {
    timeBlock =
      lang === "ar"
        ? `\nوقت التوصيل المتوقع:\n${invoice.expected_delivery_time}\n`
        : `\nExpected delivery time:\n${invoice.expected_delivery_time}\n`;
  }
  let addressBlock = "";
  if (invoice.address) {
    addressBlock = lang === "ar" ? `\nالعنوان:\n${invoice.address}\n` : `\nAddress:\n${invoice.address}\n`;
  }
  return {
    customer_name: invoice.customer_name || (lang === "ar" ? "عميلنا" : "Customer"),
    invoice_number: invoice.number,
    products,
    total: formatMoney(invoice.total),
    order_type: orderType,
    agent_name: invoice.delivery_agent_name || "",
    agent_code: invoice.delivery_agent_code || "",
    agent_phone: invoice.delivery_agent_phone || "",
    agent_block: agentBlock,
    time_block: timeBlock,
    address_block: addressBlock,
    store_name: storeName,
    address: invoice.address || "",
    delivery_time: invoice.expected_delivery_time || "",
  };
}
