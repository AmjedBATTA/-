import type { Medicine, Supplier } from '../../types';

// تطبيع خفيف لنصوص البحث: أحرف صغيرة، توحيد الهمزات والتاء المربوطة والألف المقصورة،
// أرقام عربية → لاتينية، وكل الرموز (/ - . ×) تصير فراغات حتى تنفصل «160/5» إلى كلمتين.
export function searchNorm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[^\w؀-ۿ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Let's declare our reactive state types inside the component
export interface POSItem {
  medicine: Medicine;
  quantity: number;
  outOfStock?: boolean; // علامة تذكير لمادة نافذة (رصيد صفر): تظهر بالأحمر الباهت، لا تُحتسب في المجموع ولا تُخصم من المخزون
  zeroStock?: boolean;  // بيع فعلي لمادة رصيدها صفر (المسح الثاني للنافذة): يُحتسب ويُسجَّل، والمخزون يبقى صفراً لا سالباً
  customPrice?: number; // سعر بيع مخصّص لهذا السطر فقط (نقرة على السعر في السلة) — يحلّ محل سعر المخزون في الفاتورة والربح
}

// تعقيم نص قبل حقنه في قالب HTML يُبنى كسلسلة نصية (مثل صفحات الطباعة عبر document.write) —
// أسماء الأدوية قابلة للتحرير وتأتي أيضاً من استخراج OCR، فقد تحمل وسوماً خبيثة
export const escapeHtml = (s: string) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

// حدود عرض القوائم الكبيرة — المخزون الحقيقي ~7000 صنف، وتركيب آلاف البطاقات في
// DOM دفعة واحدة يجمّد الواجهة (قياس فعلي: 6.3 ثانية لفتح تبويب POS بدون حد)
export const POS_SHELF_LIMIT = 60;          // رف POS: يكفي للنقر السريع، والبحث يُظهر البقية
export const MOVEMENT_DROPDOWN_LIMIT = 50;  // قائمة اختيار المادة في عارض حركة المخزون
export const NOTIF_LIST_LIMIT = 15;         // مركز الإشعارات: أقصى عدد لكل فئة تنبيه
export const EXPIRY_LIST_LIMIT = 100;       // قوائم الصلاحيات (30 يوماً / أفق 6 أشهر)

export interface SaleRecord {
  invoiceId: string;
  timestamp: string;
  items: { medicineId?: string; name: string; quantity: number; price: number; costPrice?: number; lineProfit?: number }[];
  subtotal: number;
  discount: number;
  total: number;
  totalCost?: number;    // مجموع تكلفة الأصناف المباعة (IQD)
  grossProfit?: number;  // الربح الإجمالي بعد الخصم (IQD)
  profitMargin?: number; // هامش الربح % من إجمالي البيع
  customerName: string;
}

export interface Expense {
  id: string;
  date: string;       // YYYY-MM-DD
  category: string;   // إيجار / رواتب / كهرباء ومولّدة ...
  amount: number;     // IQD
  description: string;
  paidBy: string;     // نقد / تحويل / بطاقة
}

export interface Payable {
  id: string;
  supplierName: string;   // اسم المذخر / المورّد
  amount: number;         // أصل الدين (IQD)
  paidAmount: number;     // المسدَّد حتى الآن (IQD)
  date: string;           // YYYY-MM-DD تاريخ نشوء الدين
  dueDate?: string;       // تاريخ الاستحقاق (اختياري)
  status: 'open' | 'partial' | 'paid';
  description?: string;
  relatedOrderId?: string;
  supplierId?: string;
}

export interface Receivable {
  id: string;
  customerName: string;     // اسم الزبون / المريض
  amount: number;           // أصل الدين على الزبون (IQD)
  paidAmount: number;       // المُحصَّل حتى الآن (IQD)
  date: string;             // YYYY-MM-DD تاريخ نشوء الدين
  dueDate?: string;         // تاريخ الاستحقاق (اختياري)
  status: 'open' | 'partial' | 'paid';
  description?: string;
  relatedInvoiceId?: string; // فاتورة البيع المرتبطة إن وُجدت
}

export interface SalesReturn {
  returnId: string;             // RET-xxxx
  originalInvoiceId: string;    // رقم الفاتورة الأصلية
  timestamp: string;            // YYYY-MM-DD HH:mm
  items: { medicineId?: string; name: string; quantity: number; price: number; costPrice?: number }[];
  total: number;                // إجمالي مبلغ الاسترداد (IQD)
  reason: string;               // سبب الإرجاع
  refundMethod: 'cash' | 'none'; // نقد (يُخصم من الصندوق) / بدون صرف نقدي
  customerName: string;
}

export interface AuditEntry {
  id: string;              // AUD-xxxx
  timestamp: string;       // YYYY-MM-DD HH:mm
  action: 'sale' | 'purchase' | 'expense' | 'payable_add' | 'payable_settle' | 'receivable_add' | 'receivable_collect' | 'return' | 'inventory_import' | 'inventory_edit' | 'inventory_delete' | 'security';
  actor: string;           // currentUser.displayName || currentRole
  amount: number;          // المبلغ المالي (0 إذا لم ينطبق)
  description: string;     // وصف قصير بالعربي
  relatedId?: string;      // INV-xxxx / EXP-xxxx / PAY-xxxx / REC-xxxx / RET-xxxx
}

// مولّد مصاريف تشغيلية مبدئية لهذا الشهر (لإظهار حساب الربح الصافي)
export function generateSeedExpenses(): Expense[] {
  return []; // بدون مصاريف تجريبية
}

// مولّد ذمم دائنة مبدئية (ديون مستحقة للمذاخر والمكاتب العلمية) — المتبقّي يجمع إلى 1,850,000 د.ع
export function generateSeedPayables(): Payable[] {
  return []; // بدون ذمم دائنة تجريبية
}

// مولّد ذمم مدينة مبدئية (ديون مستحقة لنا على الزبائن والعيادات — البيع بالآجل)
export function generateSeedReceivables(): Receivable[] {
  return []; // بدون ذمم مدينة تجريبية
}

// مولّد مرتجع تجريبي واحد (لإظهار قسم المرتجعات ممتلئاً عند أول تشغيل)
export function generateSeedReturns(): SalesReturn[] {
  return []; // بدون مرتجعات تجريبية
}

export function generateSeedAuditLog(): AuditEntry[] {
  return []; // بدون سجل تدقيق تجريبي
}

// لا مبيعات تاريخية تجريبية — يبدأ سجلّ المبيعات فارغاً
export function generateHistoricalSales(): SaleRecord[] {
  return [];
}

export function generateSeedSuppliers(): Supplier[] {
  // يبدأ قسم الموردين فارغاً — لا موردين تجريبيين. تُضاف الموردون يدوياً.
  return [];
}
