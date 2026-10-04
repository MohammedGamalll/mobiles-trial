import { useApp } from "../context";
import { money, num, statusLabel } from "../lib/format";

export type InvoicePrintItem = {
  id?: number | string;
  product_name?: string;
  name_ar?: string;
  name_en?: string;
  sku?: string;
  product_sku?: string;
  quantity?: number;
  qty?: number;
  unit_price?: number;
  discount?: number;
  total?: number;
  unit_name?: string;
};

export type InvoicePrintModel = {
  number?: string | null;
  date?: string | null;
  type?: string | null;
  status?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_whatsapp?: string | null;
  address?: string | null;
  area?: string | null;
  city?: string | null;
  notes?: string | null;
  sales_agent_name?: string | null;
  sales_agent_code?: string | null;
  delivery_agent_name?: string | null;
  delivery_agent_code?: string | null;
  delivery_agent_phone?: string | null;
  expected_delivery_time?: string | null;
  payment_method?: string | null;
  subtotal?: number | null;
  discount?: number | null;
  tax_amount?: number | null;
  tax_rate?: number | null;
  extra_amount?: number | null;
  total?: number | null;
  paid?: number | null;
  remaining?: number | null;
  items?: InvoicePrintItem[] | null;
  payments?: { id?: number; method?: string; amount?: number }[] | null;
};

export function PrintBrandFooter() {
  const { tr } = useApp();
  return <div className="print-brand-footer">{tr("poweredBy")}</div>;
}

function itemName(item: InvoicePrintItem, lang: string) {
  return item.product_name || (lang === "ar" ? item.name_ar : item.name_en) || item.name_ar || item.name_en || "";
}

function itemQty(item: InvoicePrintItem) {
  return Number(item.quantity ?? item.qty ?? 0);
}

function itemTotal(item: InvoicePrintItem) {
  const qty = itemQty(item);
  const price = Number(item.unit_price || 0);
  const disc = Number(item.discount || 0);
  return Number(item.total ?? qty * price - disc);
}

export function InvoicePrint({
  inv,
  title,
  screen = false,
}: {
  inv: InvoicePrintModel;
  title?: string;
  screen?: boolean;
}) {
  const { tr, lang, settings } = useApp();
  const items = inv.items || [];
  const isDelivery = inv.type === "delivery";
  const extra = Number(inv.extra_amount || 0);
  const subtotal = Number(inv.subtotal ?? items.reduce((s, i) => s + itemQty(i) * Number(i.unit_price || 0), 0));
  const discount = Number(inv.discount || 0);
  const tax = Number(inv.tax_amount || 0);
  const total = Number(inv.total ?? subtotal - discount + tax + extra);
  const paid = Number(inv.paid || 0);
  const remaining = Number(inv.remaining ?? Math.max(0, total - paid));
  const customerName = inv.customer_name || tr("walkIn");
  const extraLabel = isDelivery ? tr("deliveryFee") : tr("extraAmount");

  return (
    <div className={`inv-print ${screen ? "" : "print-only"}`}>
      <div className="inv-print-head">
        <div className="inv-print-brand">
          {settings.logo_url ? <img src={settings.logo_url} alt="" /> : null}
          <div>
            <div className="inv-print-title">{tr("app")}</div>
            <div className="inv-print-store">{settings.store_name_ar || settings.store_name || tr("app")}</div>
            {settings.store_address ? <div>{settings.store_address}</div> : null}
            {settings.store_phone ? <div>{settings.store_phone}</div> : null}
            {settings.invoice_header ? <div className="inv-print-note">{settings.invoice_header}</div> : null}
          </div>
        </div>
        <div className="inv-print-side">
          <div className="inv-print-doc">{title || (isDelivery ? tr("deliverySale") : tr("invoice"))}</div>
          {inv.number ? <div><b>{tr("invoiceNo")}:</b> {inv.number}</div> : null}
          {inv.date ? <div><b>{tr("invoiceDate")}:</b> {inv.date}</div> : null}
          {inv.status ? <div>{statusLabel(inv.status, lang)}</div> : null}
          {inv.payment_method ? <div><b>{tr("payMethod")}:</b> {inv.payment_method}</div> : null}
        </div>
      </div>

      <div className={`inv-print-meta${isDelivery ? " is-split" : ""}`}>
        <section className="inv-print-box">
          <h3>{tr("customerDetails")}</h3>
          <div className="inv-print-strong">{customerName}</div>
          {inv.customer_phone ? <div>{tr("phone")}: {inv.customer_phone}</div> : null}
          {inv.customer_whatsapp && inv.customer_whatsapp !== inv.customer_phone ? <div>{tr("whatsapp")}: {inv.customer_whatsapp}</div> : null}
          {inv.city ? <div>{tr("city")}: {inv.city}</div> : null}
          {inv.area ? <div>{tr("area")}: {inv.area}</div> : null}
          {inv.address ? <div>{tr("address")}: {inv.address}</div> : null}
          {inv.sales_agent_name ? (
            <div>{tr("salesAgent")}: {inv.sales_agent_name}{inv.sales_agent_code ? ` (${inv.sales_agent_code})` : ""}</div>
          ) : null}
        </section>
        {isDelivery ? (
          <section className="inv-print-box">
            <h3>{tr("deliveryDetails")}</h3>
            {inv.delivery_agent_name ? <div>{tr("agent")}: <b>{inv.delivery_agent_name}</b></div> : null}
            {inv.delivery_agent_code ? <div>{tr("agentCode")}: {inv.delivery_agent_code}</div> : null}
            {inv.delivery_agent_phone ? <div>{tr("phone")}: {inv.delivery_agent_phone}</div> : null}
            {inv.expected_delivery_time ? <div>{tr("expectedTime")}: {inv.expected_delivery_time}</div> : null}
            {inv.area ? <div>{tr("area")}: {inv.area}</div> : null}
            {inv.address ? <div>{tr("address")}: {inv.address}</div> : null}
            {extra ? <div>{tr("deliveryFee")}: <b>{money(extra, lang)}</b></div> : null}
          </section>
        ) : null}
      </div>

      <table className="inv-print-table">
        <thead>
          <tr>
            <th className="is-n">#</th>
            <th>{tr("items")}</th>
            <th className="print-wide">{tr("sku")}</th>
            <th>{tr("qty")}</th>
            <th>{tr("unitPrice")}</th>
            <th className="print-wide">{tr("discount")}</th>
            <th>{tr("total")}</th>
          </tr>
        </thead>
        <tbody>
          {items.length ? items.map((item, i) => (
            <tr key={item.id ?? i}>
              <td className="is-n">{i + 1}</td>
              <td>
                <div className="inv-print-strong">{itemName(item, lang)}</div>
                {item.unit_name ? <div className="inv-print-muted">{item.unit_name}</div> : null}
              </td>
              <td className="print-wide">{item.sku || item.product_sku || ""}</td>
              <td>{num(itemQty(item), lang)}</td>
              <td>{money(item.unit_price, lang)}</td>
              <td className="print-wide">{Number(item.discount) ? money(item.discount, lang) : "—"}</td>
              <td className="inv-print-strong">{money(itemTotal(item), lang)}</td>
            </tr>
          )) : (
            <tr><td colSpan={7}>{tr("noData")}</td></tr>
          )}
        </tbody>
      </table>

      <div className="inv-print-foot">
        <div className="inv-print-notes">
          {inv.notes ? <div><b>{tr("notes")}:</b> {inv.notes}</div> : null}
          {(inv.payments || []).length ? (
            <div>
              <b>{tr("payments")}</b>
              {(inv.payments || []).map((p, i) => (
                <div key={p.id ?? i}>{p.method}: {money(p.amount, lang)}</div>
              ))}
            </div>
          ) : null}
        </div>
        <div className="inv-print-tot">
          <div><span>{tr("subtotal")}</span><b>{money(subtotal, lang)}</b></div>
          {discount ? <div><span>{tr("discount")}</span><b>{money(discount, lang)}</b></div> : null}
          {tax ? <div><span>{tr("tax")}{inv.tax_rate ? ` (${inv.tax_rate}%)` : ""}</span><b>{money(tax, lang)}</b></div> : null}
          {extra ? <div><span>{extraLabel}</span><b>{money(extra, lang)}</b></div> : null}
          <div className="is-grand"><span>{tr("total")}</span><b>{money(total, lang)}</b></div>
          <div><span>{tr("paid")}</span><b>{money(paid, lang)}</b></div>
          <div><span>{tr("remaining")}</span><b>{money(remaining, lang)}</b></div>
        </div>
      </div>

      <div className="inv-print-thanks">{settings.invoice_footer || tr("thanks")}</div>
      <PrintBrandFooter />
    </div>
  );
}
