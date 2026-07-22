// تطبيع أسماء الأدوية — ملف مستقل حتى تستطيع لوحة التحكم استيراده دون جرّ
// @google/genai (الذي يستورده invoiceExtractor في رأسه) إلى الحزمة الرئيسية.
// تُصدَّر لأنها مفتاح «ذاكرة المطابقات»: نفس التطبيع يُستخدم للمطابقة ولمفاتيح الذاكرة.
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    // أعداد العبوة (× 14 tab / 5 amp) ليست جرعة — تُحذف بالكامل مع وحدتها
    .replace(/\d+(\.\d+)?\s*(tab|cap|amp|vial)s?\b/gi, ' ')
    // الغرامات تُحوَّل إلى ملغ (1g → 1000) حتى يتطابق «Augmentin 1g» مع «أوجمنتين 1000»
    .replace(/(\d+(?:\.\d+)?)\s*(?:gm|g)\b/gi, (_, n) => String(Math.round(parseFloat(n) * 1000)))
    // الجرعة: نُبقي الرقم ونحذف الوحدة — فيُفرّق «أوجمنتين 625» عن «أوجمنتين 1000»
    .replace(/(\d+(?:\.\d+)?)\s*(mg|ml|iu|mcg|ملغ|مل|غم|جم|وحده|وحدة)/gi, '$1')
    .replace(/[^\w؀-ۿ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
