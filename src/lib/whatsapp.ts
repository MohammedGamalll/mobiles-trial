import { post } from "./api";

export function toIntlPhone(raw: string | null | undefined) {
  if (!raw) return null;
  let n = raw.replace(/[^\d]/g, "");
  if (n.startsWith("00")) n = n.slice(2);
  if (n.startsWith("0") && n.length === 11) n = `20${n.slice(1)}`;
  if (n.startsWith("1") && n.length === 10) n = `20${n}`;
  if (!n.startsWith("20") && n.length >= 10) n = `20${n.replace(/^0+/, "")}`;
  return n || null;
}

export function waMeLink(phone: string | null | undefined, message: string) {
  const intl = toIntlPhone(phone);
  if (!intl) return null;
  return `https://wa.me/${intl}?text=${encodeURIComponent(message || "")}`;
}

export function launchInvoiceWhatsApp(opts: {
  invoiceId: number;
  phone?: string | null;
  message: string;
  type?: string;
}) {
  const link = waMeLink(opts.phone, opts.message);
  if (!link || !opts.invoiceId) return false;
  window.open(link, "_blank", "noopener,noreferrer");
  void post(`/api/invoices/${opts.invoiceId}/whatsapp/opened`, {
    type: opts.type || "invoice_created",
    message: opts.message,
    phone: opts.phone,
  }).catch(() => {});
  return true;
}
