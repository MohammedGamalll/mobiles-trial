export type AuditLang = "ar" | "en";

export type AuditRow = {
  action?: string;
  entity_type?: string | null;
  entity_id?: number | string | null;
  details?: string | null;
  old_value?: string | null;
  new_value?: string | null;
};

export type AuditChange = { field: string; from: string; to: string };

const ACTIONS: Record<string, { ar: string; en: string }> = {
  login: { ar: "تسجيل دخول", en: "Sign in" },
  logout: { ar: "تسجيل خروج", en: "Sign out" },
  change_password: { ar: "تغيير كلمة المرور", en: "Change password" },
  create_invoice: { ar: "إنشاء فاتورة بيع", en: "Create sales invoice" },
  update_invoice: { ar: "تعديل فاتورة بيع", en: "Update sales invoice" },
  finalize_invoice: { ar: "ترحيل فاتورة بيع", en: "Finalize sales invoice" },
  cancel_invoice: { ar: "إلغاء فاتورة بيع", en: "Cancel sales invoice" },
  payment: { ar: "تحصيل / سداد", en: "Payment" },
  void_payment: { ar: "إلغاء دفعة", en: "Void payment" },
  return: { ar: "مرتجع", en: "Return" },
  whatsapp_mark_sent: { ar: "إرسال واتساب", en: "WhatsApp sent" },
  create_customer: { ar: "إضافة عميل", en: "Create customer" },
  edit_customer: { ar: "تعديل عميل", en: "Edit customer" },
  delete_customer: { ar: "حذف عميل", en: "Delete customer" },
  customer_payment: { ar: "تحصيل من عميل", en: "Customer payment" },
  create_supplier: { ar: "إضافة مورد", en: "Create supplier" },
  edit_supplier: { ar: "تعديل مورد", en: "Edit supplier" },
  delete_supplier: { ar: "حذف مورد", en: "Delete supplier" },
  create_user: { ar: "إضافة مستخدم", en: "Create user" },
  delete_user: { ar: "حذف مستخدم", en: "Delete user" },
  edit_permissions: { ar: "تعديل صلاحيات", en: "Edit permissions" },
  create_product: { ar: "إضافة صنف", en: "Create product" },
  edit_product: { ar: "تعديل صنف", en: "Edit product" },
  delete_product: { ar: "حذف صنف", en: "Delete product" },
  change_price: { ar: "تغيير سعر البيع", en: "Change selling price" },
  bulk_price: { ar: "تحديث أسعار بالجملة", en: "Bulk price update" },
  rename_quality: { ar: "إعادة تسمية تصنيف", en: "Rename quality" },
  clear_quality: { ar: "مسح تصنيف", en: "Clear quality" },
  import: { ar: "استيراد بيانات", en: "Import data" },
  purchase: { ar: "فاتورة مشتريات", en: "Purchase invoice" },
  submit_purchase: { ar: "تقديم مشتريات للاعتماد", en: "Submit purchase" },
  reject_purchase: { ar: "رفض مشتريات", en: "Reject purchase" },
  stock_adjustment: { ar: "تسوية مخزون", en: "Stock adjustment" },
  create_location: { ar: "إضافة مكان تخزين", en: "Create location" },
  edit_location: { ar: "تعديل مكان تخزين", en: "Edit location" },
  delete_location: { ar: "حذف مكان تخزين", en: "Delete location" },
  create_transfer: { ar: "تحويل مخزون", en: "Stock transfer" },
  complete_transfer: { ar: "إتمام تحويل مخزون", en: "Complete transfer" },
  cancel_transfer: { ar: "إلغاء تحويل مخزون", en: "Cancel transfer" },
  create_stocktake: { ar: "إنشاء جرد", en: "Create stocktake" },
  submit_stocktake: { ar: "تقديم جرد", en: "Submit stocktake" },
  approve_stocktake: { ar: "اعتماد جرد", en: "Approve stocktake" },
  expense: { ar: "مصروف", en: "Expense" },
  other_revenue: { ar: "إيراد آخر", en: "Other revenue" },
  void_other_revenue: { ar: "إلغاء إيراد", en: "Void other revenue" },
  journal: { ar: "قيد يومية", en: "Journal entry" },
  voucher: { ar: "سند", en: "Voucher" },
  void_voucher: { ar: "إلغاء سند", en: "Void voucher" },
  cash_transfer: { ar: "تحويل خزينة", en: "Cash transfer" },
  create_cash: { ar: "إضافة خزينة / حساب", en: "Create cash account" },
  edit_cash: { ar: "تعديل خزينة / حساب", en: "Edit cash account" },
  delete_cash: { ar: "إيقاف خزينة / حساب", en: "Deactivate cash account" },
  create_account: { ar: "إضافة حساب دفتر", en: "Create ledger account" },
  open_shift: { ar: "فتح وردية", en: "Open shift" },
  close_shift: { ar: "إقفال وردية", en: "Close shift" },
  create_staff: { ar: "إضافة موظف", en: "Create staff" },
  create_employee: { ar: "إضافة موظف", en: "Create employee" },
  edit_employee: { ar: "تعديل موظف", en: "Edit employee" },
  delete_employee: { ar: "حذف موظف", en: "Delete employee" },
  clock_in: { ar: "حضور", en: "Clock in" },
  clock_out: { ar: "انصراف", en: "Clock out" },
  payroll_run: { ar: "تشغيل مسير رواتب", en: "Run payroll" },
  payroll_deduct: { ar: "خصم على الراتب", en: "Payroll deduction" },
  payroll_pay: { ar: "صرف رواتب", en: "Pay payroll" },
  create_shift: { ar: "إضافة وردية عمل", en: "Create work shift" },
  edit_shift: { ar: "تعديل وردية عمل", en: "Edit work shift" },
  delete_shift: { ar: "إيقاف وردية عمل", en: "Deactivate work shift" },
  create_leave: { ar: "طلب إجازة", en: "Leave request" },
  approve_leave: { ar: "اعتماد إجازة", en: "Approve leave" },
  reject_leave: { ar: "رفض إجازة", en: "Reject leave" },
  delete_leave: { ar: "حذف إجازة", en: "Delete leave" },
  create_advance: { ar: "سلفة", en: "Salary advance" },
  cancel_advance: { ar: "إلغاء سلفة", en: "Cancel advance" },
  overtime: { ar: "إضافة ساعات إضافية", en: "Add overtime" },
  delete_overtime: { ar: "حذف ساعات إضافية", en: "Delete overtime" },
  delivery_status: { ar: "تحديث حالة توصيل", en: "Delivery status" },
  assign_courier: { ar: "تعيين مندوب", en: "Assign courier" },
  delivery_mark: { ar: "تعليم تسليم", en: "Mark delivered" },
  delivery_settle: { ar: "تسوية توصيل", en: "Delivery settlement" },
  delete_agent: { ar: "حذف مندوب", en: "Delete courier" },
  edit_rep: { ar: "تعديل مندوب", en: "Edit sales rep" },
  create_visit: { ar: "زيارة عميل", en: "Customer visit" },
  delete_visit: { ar: "حذف زيارة", en: "Delete visit" },
  pay_commission: { ar: "صرف عمولة", en: "Pay commission" },
  create_price_list: { ar: "إضافة قائمة أسعار", en: "Create price list" },
  edit_price_list: { ar: "تعديل قائمة أسعار", en: "Edit price list" },
  delete_price_list: { ar: "حذف قائمة أسعار", en: "Delete price list" },
  create_offer: { ar: "إضافة عرض كمية", en: "Create offer" },
  serials: { ar: "إضافة أرقام تسلسلية", en: "Add serials" },
  delete_serial: { ar: "حذف رقم تسلسلي", en: "Delete serial" },
  cheque: { ar: "إضافة شيك", en: "Add cheque" },
  delete_cheque: { ar: "حذف شيك", en: "Delete cheque" },
  cheque_collect: { ar: "تحصيل شيك", en: "Collect cheque" },
  cheque_bounce: { ar: "ارتجاع شيك", en: "Bounce cheque" },
  installment: { ar: "خطة تقسيط", en: "Installment plan" },
  delete_installment: { ar: "حذف خطة تقسيط", en: "Delete installment plan" },
  installment_pay: { ar: "سداد قسط", en: "Pay installment" },
  partner_create: { ar: "إضافة شريك", en: "Create partner" },
  partner_update: { ar: "تعديل شريك", en: "Update partner" },
  partner_delete: { ar: "حذف شريك", en: "Delete partner" },
  partner_draw: { ar: "سحب شريك", en: "Partner withdrawal" },
  edit_settings: { ar: "تعديل الإعدادات", en: "Edit settings" },
  edit_whatsapp_template: { ar: "تعديل قالب واتساب", en: "Edit WhatsApp template" },
  create_payment_method: { ar: "إضافة طريقة دفع", en: "Create payment method" },
  edit_payment_method: { ar: "تعديل طريقة دفع", en: "Edit payment method" },
  backup: { ar: "نسخة احتياطية", en: "Backup" },
  restore_backup: { ar: "استعادة نسخة", en: "Restore backup" },
  import_backup: { ar: "استيراد نسخة", en: "Import backup" },
  import_restore: { ar: "استيراد واستعادة نسخة", en: "Import and restore" },
  seed_demo: { ar: "تحميل بيانات تجريبية", en: "Seed demo data" },
  clear_demo: { ar: "مسح البيانات التجريبية", en: "Clear demo data" },
  wipe_all: { ar: "مسح كل بيانات البرنامج", en: "Wipe all data" },
};

const ENTITIES: Record<string, { ar: string; en: string }> = {
  invoice: { ar: "فاتورة بيع", en: "Sales invoice" },
  purchase: { ar: "فاتورة شراء", en: "Purchase" },
  customer: { ar: "عميل", en: "Customer" },
  supplier: { ar: "مورد", en: "Supplier" },
  product: { ar: "صنف", en: "Product" },
  products: { ar: "أصناف", en: "Products" },
  user: { ar: "مستخدم", en: "User" },
  role: { ar: "صلاحيات", en: "Role" },
  expense: { ar: "مصروف", en: "Expense" },
  other_revenue: { ar: "إيراد", en: "Revenue" },
  payment: { ar: "دفعة", en: "Payment" },
  journal: { ar: "قيد", en: "Journal" },
  voucher: { ar: "سند", en: "Voucher" },
  cash: { ar: "خزينة", en: "Cash" },
  cash_account: { ar: "حساب نقدي", en: "Cash account" },
  ledger_account: { ar: "حساب دفتر", en: "Ledger account" },
  pos_shift: { ar: "وردية الصندوق", en: "POS shift" },
  employee: { ar: "موظف", en: "Employee" },
  payroll: { ar: "مسير رواتب", en: "Payroll" },
  leave: { ar: "إجازة", en: "Leave" },
  advance: { ar: "سلفة", en: "Advance" },
  overtime: { ar: "ساعات إضافية", en: "Overtime" },
  work_shifts: { ar: "وردية عمل", en: "Work shift" },
  delivery_agent: { ar: "مندوب", en: "Courier" },
  sales_visit: { ar: "زيارة", en: "Visit" },
  sales_commission: { ar: "عمولة", en: "Commission" },
  stock_transfer: { ar: "تحويل مخزون", en: "Stock transfer" },
  stocktake: { ar: "جرد", en: "Stocktake" },
  storage_locations: { ar: "مكان تخزين", en: "Location" },
  price_list: { ar: "قائمة أسعار", en: "Price list" },
  product_offer: { ar: "عرض كمية", en: "Offer" },
  serial: { ar: "رقم تسلسلي", en: "Serial" },
  cheque: { ar: "شيك", en: "Cheque" },
  installment: { ar: "تقسيط", en: "Installment" },
  partner: { ar: "شريك", en: "Partner" },
  settings: { ar: "الإعدادات", en: "Settings" },
  whatsapp_template: { ar: "قالب واتساب", en: "WhatsApp template" },
  payment_method: { ar: "طريقة دفع", en: "Payment method" },
  backup: { ar: "نسخة احتياطية", en: "Backup" },
  demo: { ar: "بيانات تجريبية", en: "Demo data" },
  system: { ar: "النظام", en: "System" },
  brands: { ar: "ماركة", en: "Brand" },
  part_types: { ar: "نوع قطعة", en: "Part type" },
  categories: { ar: "تصنيف", en: "Category" },
  device_models: { ar: "موديل", en: "Device model" },
  delivery_settlement: { ar: "تسوية توصيل", en: "Delivery settlement" },
};

const FIELDS: Record<string, { ar: string; en: string }> = {
  name: { ar: "الاسم", en: "Name" },
  name_ar: { ar: "الاسم بالعربي", en: "Arabic name" },
  name_en: { ar: "الاسم بالإنجليزي", en: "English name" },
  phone: { ar: "الهاتف", en: "Phone" },
  credit_limit: { ar: "حد الائتمان", en: "Credit limit" },
  customer_type: { ar: "نوع العميل", en: "Customer type" },
  payment_terms: { ar: "شروط الدفع", en: "Payment terms" },
  city: { ar: "المدينة", en: "City" },
  address: { ar: "العنوان", en: "Address" },
  notes: { ar: "ملاحظات", en: "Notes" },
  email: { ar: "البريد", en: "Email" },
  status: { ar: "الحالة", en: "Status" },
  remaining: { ar: "المتبقي", en: "Remaining" },
  selling_price: { ar: "سعر البيع", en: "Selling price" },
  wholesale_price: { ar: "سعر الجملة", en: "Wholesale price" },
  voided: { ar: "ملغى", en: "Voided" },
  active: { ar: "نشط", en: "Active" },
  username: { ar: "اسم المستخدم", en: "Username" },
  full_name: { ar: "الاسم الكامل", en: "Full name" },
  account_number: { ar: "رقم الحساب", en: "Account number" },
  kind: { ar: "النوع", en: "Kind" },
};

const VALUES: Record<string, { ar: string; en: string }> = {
  retail: { ar: "تجزئة", en: "Retail" },
  wholesale: { ar: "جملة", en: "Wholesale" },
  cash: { ar: "نقدي", en: "Cash" },
  credit: { ar: "آجل", en: "Credit" },
  true: { ar: "نعم", en: "Yes" },
  false: { ar: "لا", en: "No" },
  void: { ar: "ملغى", en: "Void" },
  cancelled: { ar: "ملغاة", en: "Cancelled" },
  approved: { ar: "معتمدة", en: "Approved" },
  submitted: { ar: "مقدمة للاعتماد", en: "Submitted" },
  draft: { ar: "مسودة", en: "Draft" },
  kept_admin: { ar: "مع الإبقاء على حساب المدير", en: "Admin account kept" },
  already: { ar: "كانت مفعّلة مسبقاً", en: "Already seeded" },
  seeded: { ar: "تم التحميل", en: "Seeded" },
  cleared: { ar: "تم المسح", en: "Cleared" },
  bounce: { ar: "مرتجع", en: "Bounced" },
};

const VERBS: Record<string, { ar: string; en: string }> = {
  create: { ar: "إضافة", en: "Create" },
  edit: { ar: "تعديل", en: "Edit" },
  delete: { ar: "حذف", en: "Delete" },
};

function pick(map: Record<string, { ar: string; en: string }>, key: string, lang: AuditLang) {
  const row = map[key];
  return row ? row[lang] : "";
}

export function auditActionOptions(lang: AuditLang) {
  return Object.entries(ACTIONS).map(([value, labels]) => ({ value, label: labels[lang] }));
}

export function formatAuditAction(action: string | null | undefined, lang: AuditLang) {
  const raw = String(action || "").trim();
  if (!raw) return lang === "ar" ? "عملية" : "Action";
  const known = pick(ACTIONS, raw, lang);
  if (known) return known;
  const m = raw.match(/^(create|edit|delete)_(.+)$/);
  if (m) {
    const verb = pick(VERBS, m[1], lang);
    const entity = formatAuditEntity(m[2], null, lang);
    return `${verb} ${entity}`.trim();
  }
  return raw.replace(/_/g, " ");
}

export function formatAuditEntity(type: string | null | undefined, id: number | string | null | undefined, lang: AuditLang) {
  const key = String(type || "").trim();
  if (!key) return "";
  const label = pick(ENTITIES, key, lang) || key.replace(/_/g, " ");
  if (id == null || id === "" || Number(id) === 0) return label;
  return lang === "ar" ? `${label} رقم ${id}` : `${label} #${id}`;
}

function parseMaybeJson(raw: unknown) {
  if (raw == null || raw === "") return null;
  if (typeof raw === "object") return raw;
  const text = String(raw);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function same(a: unknown, b: unknown) {
  if (a == null && (b == null || b === "")) return true;
  if (b == null && (a == null || a === "")) return true;
  if (typeof a === "object" || typeof b === "object") return JSON.stringify(a) === JSON.stringify(b);
  return String(a) === String(b);
}

export function formatAuditValue(value: unknown, lang: AuditLang): string {
  if (value == null || value === "") return lang === "ar" ? "فارغ" : "Empty";
  if (typeof value === "boolean") return pick(VALUES, String(value), lang);
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  const text = String(value);
  const mapped = pick(VALUES, text, lang) || pick(VALUES, text.toLowerCase(), lang);
  if (mapped) return mapped;
  if (text === "0" || text === "1") return text === "1" ? (lang === "ar" ? "نعم" : "Yes") : (lang === "ar" ? "لا" : "No");
  return text;
}

export function formatAuditField(key: string, lang: AuditLang) {
  return pick(FIELDS, key, lang) || key.replace(/_/g, " ");
}

export function auditChanges(oldRaw: unknown, newRaw: unknown, lang: AuditLang): AuditChange[] {
  const oldVal = parseMaybeJson(oldRaw);
  const newVal = parseMaybeJson(newRaw);
  if (oldVal == null && newVal == null) return [];
  if (oldVal && typeof oldVal === "object" && !Array.isArray(oldVal) && newVal && typeof newVal === "object" && !Array.isArray(newVal)) {
    const keys = [...new Set([...Object.keys(oldVal as object), ...Object.keys(newVal as object)])];
    return keys
      .filter((k) => !same((oldVal as Record<string, unknown>)[k], (newVal as Record<string, unknown>)[k]))
      .map((k) => ({
        field: formatAuditField(k, lang),
        from: formatAuditValue((oldVal as Record<string, unknown>)[k], lang),
        to: formatAuditValue((newVal as Record<string, unknown>)[k], lang),
      }));
  }
  if (same(oldVal, newVal)) return [];
  return [
    {
      field: lang === "ar" ? "القيمة" : "Value",
      from: formatAuditValue(oldVal, lang),
      to: formatAuditValue(newVal, lang),
    },
  ];
}

function translateDetails(action: string, details: string, lang: AuditLang) {
  const d = details.trim();
  if (!d) return "";
  const mapped = pick(VALUES, d, lang);
  if (mapped) return mapped;

  let m: RegExpMatchArray | null;
  m = d.match(/^Open drawer (\d+)$/i);
  if (m) return lang === "ar" ? `فتح الصندوق رقم ${m[1]}` : `Opened drawer ${m[1]}`;
  m = d.match(/^Close shift (\d+)$/i);
  if (m) return lang === "ar" ? `إقفال الوردية رقم ${m[1]}` : `Closed shift ${m[1]}`;
  m = d.match(/^Excel products \+(\d+) skip (\d+) replace=(\d+)$/i);
  if (m) {
    return lang === "ar"
      ? `استيراد أصناف من إكسل: أُضيف ${m[1]} وتُجاهل ${m[2]}${m[3] === "1" ? " مع استبدال الموجود" : ""}`
      : `Excel products: added ${m[1]}, skipped ${m[2]}${m[3] === "1" ? ", replaced existing" : ""}`;
  }
  m = d.match(/^Import (\w+) \+(\d+) skip (\d+)$/i);
  if (m) {
    const kind = formatAuditEntity(m[1], null, lang);
    return lang === "ar" ? `استيراد ${kind}: أُضيف ${m[2]} وتُجاهل ${m[3]}` : `Imported ${kind}: added ${m[2]}, skipped ${m[3]}`;
  }
  m = d.match(/^Pay ([\d.]+) on (.+)$/i);
  if (m) return lang === "ar" ? `سداد ${m[1]} على ${m[2]}` : `Paid ${m[1]} on ${m[2]}`;
  m = d.match(/^Pay commissions (.+)$/i);
  if (m) return lang === "ar" ? `صرف عمولات شهر ${m[1]}` : `Paid commissions for ${m[1]}`;
  m = d.match(/^Selling price (.+)$/i);
  if (m) return lang === "ar" ? `سعر البيع أصبح ${m[1]}` : `Selling price ${m[1]}`;
  m = d.match(/^Update (\d+) prices$/i);
  if (m) return lang === "ar" ? `تحديث ${m[1]} سعر` : `Updated ${m[1]} prices`;
  m = d.match(/^Add (\d+) serials$/i);
  if (m) return lang === "ar" ? `إضافة ${m[1]} رقم تسلسلي` : `Added ${m[1]} serials`;
  m = d.match(/^Clock in (\d+)m$/i);
  if (m) return lang === "ar" ? `تسجيل حضور (المسافة ${m[1]} م)` : `Clocked in (${m[1]} m)`;
  m = d.match(/^Work (\d+)s$/i);
  if (m) {
    const mins = Math.max(1, Math.round(Number(m[1]) / 60));
    return lang === "ar" ? `مدة العمل ${mins} دقيقة` : `Worked ${mins} min`;
  }
  m = d.match(/^Settle (\d+) orders$/i);
  if (m) return lang === "ar" ? `تسوية ${m[1]} طلب توصيل` : `Settled ${m[1]} orders`;
  m = d.match(/^(\d+) dues$/i);
  if (m) return lang === "ar" ? `${m[1]} أقساط` : `${m[1]} dues`;
  m = d.match(/^(\d+) products$/i);
  if (m) return lang === "ar" ? `${m[1]} أصناف` : `${m[1]} products`;
  m = d.match(/^([\d.]+)h$/i);
  if (m) return lang === "ar" ? `${m[1]} ساعة إضافية` : `${m[1]} overtime hours`;
  m = d.match(/^(Create|Update|Edit|Cancel|Approve|Submit|Complete|Reject|Pay|Void|Deactivate|Soft delete) (.+)$/i);
  if (m) {
    const verb = {
      create: { ar: "إنشاء", en: "Created" },
      update: { ar: "تعديل", en: "Updated" },
      edit: { ar: "تعديل", en: "Edited" },
      cancel: { ar: "إلغاء", en: "Cancelled" },
      approve: { ar: "اعتماد", en: "Approved" },
      submit: { ar: "تقديم", en: "Submitted" },
      complete: { ar: "إتمام", en: "Completed" },
      reject: { ar: "رفض", en: "Rejected" },
      pay: { ar: "سداد", en: "Paid" },
      void: { ar: "إلغاء", en: "Voided" },
      deactivate: { ar: "إيقاف", en: "Deactivated" },
      "soft delete": { ar: "حذف", en: "Deleted" },
    }[m[1].toLowerCase()] || { ar: m[1], en: m[1] };
    return `${verb[lang]} ${m[2]}`;
  }
  if (action === "wipe_all") return formatAuditValue(d, lang);
  if (action === "seed_demo" || action === "clear_demo") return formatAuditValue(d, lang);
  if (/^[A-Za-z][A-Za-z0-9_ ]*$/.test(d) && lang === "ar") {
    return formatAuditAction(d.replace(/\s+/g, "_").toLowerCase(), lang);
  }
  return d;
}

export function formatAuditDetails(row: AuditRow, lang: AuditLang) {
  return translateDetails(String(row.action || ""), String(row.details || ""), lang);
}

export function formatAuditRow(row: AuditRow, lang: AuditLang) {
  const action = formatAuditAction(row.action, lang);
  const entity = formatAuditEntity(row.entity_type, row.entity_id, lang);
  const details = formatAuditDetails(row, lang);
  const changes = auditChanges(row.old_value, row.new_value, lang);
  return { action, entity, details, changes, title: action };
}
