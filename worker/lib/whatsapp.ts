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

export function renderTemplate(
  body: string,
  vars: Record<string, string>,
) {
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
      return lang === "ar" ? `• ${i.product_name} × ${qty}` : `• ${i.product_name} × ${qty}`;
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
