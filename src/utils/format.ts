/**
 * تنسيق موحّد للأرقام والتواريخ في كل التطبيق.
 *
 * كانت الأرقام تُعرض بـ toLocaleString() بلا تحديد لغة، فتتبع لغة الجهاز:
 * هاتف أندرويد بالعربية يطبع ٠١٢٣ وحاسوب ويندوز يطبع 0123، والجهازان في
 * الصيدلية نفسها يعرضان الفاتورة نفسها بشكلين. هنا نثبّت الأرقام اللاتينية
 * (0-9) دائماً، وهي المستخدمة فعلياً في فواتير المذاخر العراقية.
 */

const NUMBER_LOCALE = 'en-US';
// التاريخ بأسماء الأشهر العربية لكن بأرقام لاتينية (امتداد nu-latn في Unicode)
const DATE_LOCALE = 'ar-IQ-u-nu-latn';

const formatterCache = new Map<number, Intl.NumberFormat>();
function numberFormatter(maxFraction: number): Intl.NumberFormat {
  let f = formatterCache.get(maxFraction);
  if (!f) {
    f = new Intl.NumberFormat(NUMBER_LOCALE, { maximumFractionDigits: maxFraction });
    formatterCache.set(maxFraction, f);
  }
  return f;
}

/** رقم بفواصل الآلاف وأرقام لاتينية. الافتراضي حتى 3 منازل عشرية (كما كان toLocaleString). */
export function fmtNum(value: number | string | null | undefined, maxFraction = 3): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '0';
  return numberFormatter(maxFraction).format(n);
}

/** تاريخ فقط: 6‏/9‏/2026 */
export function fmtDate(d: Date): string {
  return d.toLocaleDateString(DATE_LOCALE);
}

/** تاريخ ووقت بنظام 12 ساعة: 6‏/9‏/2026، 5:26:38 ص */
export function fmtDateTime(d: Date): string {
  return d.toLocaleString(DATE_LOCALE, { hour12: true });
}
