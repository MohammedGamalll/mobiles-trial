export function money(n: number | string | null | undefined, lang: "ar" | "en" = "ar") {
  const v = Number(n || 0);
  const formatted = v.toLocaleString(lang === "ar" ? "ar-EG" : "en-EG", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return lang === "ar" ? `${formatted} ج.م` : `EGP ${formatted}`;
}

export function customerBalanceLabel(n: number | string | null | undefined, lang: "ar" | "en" = "ar") {
  const v = Number(n || 0);
  const amt = money(Math.abs(v), lang);
  if (v > 0.005) return lang === "ar" ? `${amt} عليه` : `${amt} they owe`;
  if (v < -0.005) return lang === "ar" ? `${amt} ليه` : `${amt} credit`;
  return amt;
}

export function supplierBalanceLabel(egp: number | string | null | undefined, currency: string | undefined, rate: number | string | undefined, lang: "ar" | "en" = "ar") {
  const stored = Number(egp || 0);
  const r = Number(rate || 50) || 50;
  const usd = String(currency || "EGP").toUpperCase() === "USD";
  const shown = usd ? stored / r : stored;
  const formatted = Math.abs(shown).toLocaleString(lang === "ar" ? "ar-EG" : "en-EG", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const unit = usd ? (lang === "ar" ? `${formatted} $` : `USD ${formatted}`) : money(Math.abs(shown), lang);
  if (stored > 0.005) return lang === "ar" ? `${unit} ليه` : `${unit} we owe`;
  if (stored < -0.005) return lang === "ar" ? `${unit} عليه` : `${unit} they owe`;
  return unit;
}

export function num(n: number | string | null | undefined, lang: "ar" | "en" = "ar") {
  return Number(n || 0).toLocaleString(lang === "ar" ? "ar-EG" : "en-EG");
}

export function statusClass(status?: string | null) {
  const s = (status || "").toLowerCase();
  if (["completed", "delivered", "approved", "active", "in", "done", "commission_paid", "deducted", "posted", "collected", "in_stock", "paid"].includes(s)) return "badge bg-emerald-100 text-emerald-800";
  if (["pending_delivery", "out_for_delivery", "rescheduled", "draft", "open", "submitted", "held", "quote", "order", "planned", "accrued", "pending", "partial", "unpaid_sale"].includes(s)) return "badge bg-amber-100 text-amber-800";
  if (["rejected"].includes(s)) return "badge bg-rose-100 text-rose-800";
  if (["low"].includes(s)) return "badge bg-orange-100 text-orange-800";
  if (["cancelled", "fully_returned", "customer_refused", "out", "void", "bounced"].includes(s)) return "badge bg-rose-100 text-rose-800";
  if (["partially_delivered", "partially_returned", "customer_unavailable"].includes(s)) return "badge bg-sky-100 text-sky-800";
  return "badge bg-slate-100 text-slate-700";
}

export function statusLabel(status: string | null | undefined, lang: "ar" | "en") {
  const map: Record<string, { ar: string; en: string }> = {
    draft: { ar: "مسودة", en: "Draft" },
    open: { ar: "مفتوحة", en: "Open" },
    pending_delivery: { ar: "بانتظار التوصيل", en: "Pending delivery" },
    out_for_delivery: { ar: "خرج للتوصيل", en: "Out for delivery" },
    delivered: { ar: "تم التسليم", en: "Delivered" },
    partially_delivered: { ar: "تسليم جزئي", en: "Partially delivered" },
    partially_returned: { ar: "مرتجع جزئي", en: "Partially returned" },
    fully_returned: { ar: "مرتجع بالكامل", en: "Fully returned" },
    customer_refused: { ar: "رفض العميل", en: "Customer refused" },
    customer_unavailable: { ar: "العميل غير متاح", en: "Unavailable" },
    rescheduled: { ar: "إعادة جدولة", en: "Rescheduled" },
    cancelled: { ar: "ملغاة", en: "Cancelled" },
    completed: { ar: "مكتملة", en: "Completed" },
    approved: { ar: "معتمدة", en: "Approved" },
    in: { ar: "متوفر", en: "In stock" },
    low: { ar: "منخفض", en: "Low" },
    out: { ar: "نافد", en: "Out" },
    normal: { ar: "بيع عادي", en: "Pickup" },
    delivery: { ar: "توصيل", en: "Delivery" },
    service: { ar: "خدمة", en: "Service" },
    product: { ar: "منتج", en: "Product" },
    present: { ar: "حاضر", en: "Present" },
    late: { ar: "متأخر", en: "Late" },
    paid: { ar: "مصروف", en: "Paid" },
    submitted: { ar: "مقدم للاعتماد", en: "Submitted" },
    held: { ar: "معلّقة", en: "Held" },
    quote: { ar: "عرض سعر", en: "Quote" },
    order: { ar: "أمر بيع", en: "Sales order" },
    rejected: { ar: "مرفوضة", en: "Rejected" },
    planned: { ar: "مخططة", en: "Planned" },
    done: { ar: "تمت", en: "Done" },
    no_answer: { ar: "لا رد", en: "No answer" },
    accrued: { ar: "مستحقة", en: "Accrued" },
    commission_paid: { ar: "مصروفة", en: "Paid" },
    sales: { ar: "مبيعات", en: "Sales" },
    both: { ar: "توصيل ومبيعات", en: "Delivery + sales" },
    annual: { ar: "سنوية", en: "Annual" },
    sick: { ar: "مرضية", en: "Sick" },
    unpaid: { ar: "بدون راتب", en: "Unpaid" },
    emergency: { ar: "طارئة", en: "Emergency" },
    pending: { ar: "قيد المراجعة", en: "Pending" },
    deducted: { ar: "مخصومة", en: "Deducted" },
    sale: { ar: "بيع", en: "Sale" },
    payment: { ar: "تحصيل", en: "Collection" },
    expense: { ar: "مصروف", en: "Expense" },
    payroll: { ar: "رواتب", en: "Payroll" },
    opening: { ar: "افتتاحي", en: "Opening" },
    voucher: { ar: "سند", en: "Voucher" },
    manual: { ar: "يدوي", en: "Manual" },
    posted: { ar: "مرحّل", en: "Posted" },
    in_stock: { ar: "بالمخزن", en: "In stock" },
    reserved: { ar: "محجوز", en: "Reserved" },
    sold: { ar: "مباع", en: "Sold" },
    collected: { ar: "محصّل", en: "Collected" },
    bounced: { ar: "مرتد", en: "Bounced" },
    due: { ar: "مستحق", en: "Due" },
    partial: { ar: "جزئي", en: "Partial" },
    unpaid_sale: { ar: "غير مدفوع", en: "Unpaid" },
    asset: { ar: "أصل", en: "Asset" },
    liability: { ar: "التزام", en: "Liability" },
    equity: { ar: "حقوق ملكية", en: "Equity" },
    revenue: { ar: "إيراد", en: "Revenue" },
    warehouse: { ar: "مخزن", en: "Warehouse" },
    zone: { ar: "منطقة", en: "Zone" },
    aisle: { ar: "ممر", en: "Aisle" },
    bay: { ar: "باكية", en: "Bay" },
    shelf: { ar: "رف", en: "Shelf" },
    bin: { ar: "شوكة / Bin", en: "Bin" },
    purchase_in: { ar: "وارد شراء", en: "Purchase in" },
    transfer_out: { ar: "صرف تحويل", en: "Transfer out" },
    transfer_in: { ar: "وارد تحويل", en: "Transfer in" },
    stocktake_adjust: { ar: "تسوية جرد", en: "Stocktake" },
    adjust: { ar: "تسوية", en: "Adjustment" },
    sale_out: { ar: "صرف بيع", en: "Sale out" },
    return_in: { ar: "مرتجع", en: "Return in" },
  };
  if (!status) return "-";
  return map[status]?.[lang] || status;
}
