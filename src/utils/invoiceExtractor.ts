import { GoogleGenAI } from '@google/genai';
import type { Medicine, ExtractedInvoiceItem, ExtractedInvoice } from '../types';

const GEMINI_KEY_STORAGE = 'anwar_gemini_api_key';

// الأولوية: مفتاح أدخله المستخدم من الواجهة → ثم المفتاح المُضمَّن في ملف .env
export const getStoredApiKey = (): string =>
  localStorage.getItem(GEMINI_KEY_STORAGE) ||
  (import.meta.env.VITE_GEMINI_API_KEY as string | undefined) ||
  '';
export const saveApiKey = (key: string) => localStorage.setItem(GEMINI_KEY_STORAGE, key.trim());

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\d+(\.\d+)?\s*(mg|ml|iu|mcg|g\b|ملغ|مل|وحده|وحدة|tab|cap|amp|vial)/gi, '')
    .replace(/[^\w؀-ۿ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchToInventory(name: string, inventory: Medicine[]): { medicine: Medicine | null; score: number } {
  const normalizedInput = normalizeName(name);
  let best: Medicine | null = null;
  let bestScore = 0;

  for (const med of inventory) {
    const candidates = [
      normalizeName(med.nameAr),
      normalizeName(med.nameEn),
      normalizeName(med.scientificName || ''),
      normalizeName(med.activeIngredient || ''),
    ];

    for (const candidate of candidates) {
      if (!candidate) continue;
      let score = 0;

      if (candidate === normalizedInput) {
        score = 1;
      } else if (candidate.includes(normalizedInput) || normalizedInput.includes(candidate)) {
        score = 0.85;
      } else {
        const wordsA = normalizedInput.split(' ').filter(w => w.length > 2);
        const wordsB = candidate.split(' ').filter(w => w.length > 2);
        if (wordsA.length > 0 && wordsB.length > 0) {
          const matchCount = wordsA.filter(wa =>
            wordsB.some(wb => wa.includes(wb) || wb.includes(wa))
          ).length;
          score = matchCount / Math.max(wordsA.length, wordsB.length);
        }
      }

      if (score > bestScore) {
        bestScore = score;
        best = med;
      }
    }
  }

  return { medicine: bestScore >= 0.5 ? best : null, score: bestScore };
}

const EXTRACTION_PROMPT = `أنت نظام استخراج بيانات دقيق لفواتير أدوية الصيدليات العراقية.
استخرج جميع بيانات الفاتورة من الصورة وأرجع JSON صحيح فقط — بدون أي نص إضافي — بهذا التنسيق:

{
  "supplierName": "اسم المذخر أو المورد",
  "invoiceNo": "رقم الفاتورة",
  "date": "YYYY-MM-DD",
  "items": [
    {
      "rawName": "الاسم كما هو مكتوب في الفاتورة",
      "arabicName": "الاسم التجاري العربي الشائع في العراق",
      "company": "اسم الشركة المصنعة",
      "quantityBoxes": 10,
      "pricePerBox": 5000,
      "stripsPerBox": 2,
      "unitType": "strip",
      "batchNo": "PA123",
      "expiry": "YYYY/MM"
    }
  ],
  "totalAmount": 255645
}

القواعد:
• arabicName: حوّل الاسم إلى الاسم التجاري العربي المعروف في الصيدليات العراقية
  أمثلة: Panadol→بندول، Augmentin→أوجمنتين، Amoxicillin→أموكسيسيلين، Metformin→ميتفورمين، Omeprazole→أوميبرازول
• stripsPerBox: احسبها من عدد الوحدات في الاسم:
  - "* X tab" أو "* X cap": stripsPerBox = X ÷ 10 (إذا كان X قابلاً للقسمة على 14 بالضبط وX≤56 فاستخدم 14)
  - شراب/قطرة/كريم/جل/مرهم/فيال/أمبول/ساشيت/بودرة/مرش: stripsPerBox = 1
• unitType: "strip" للأقراص والكبسولات | "unit" لكل الباقي
• الأرقام: أزل الفاصلة العليا (14'765 → 14765) والنقطة العشرية (14'500.00 → 14500)
• إذا لم يكن الحقل واضحاً اجعله null`;

interface RawGeminiItem {
  rawName?: string;
  arabicName?: string;
  company?: string;
  quantityBoxes?: number | string;
  pricePerBox?: number | string;
  stripsPerBox?: number | string;
  unitType?: string;
  batchNo?: string;
  expiry?: string;
}

function parseNumber(val: number | string | null | undefined): number {
  if (val === null || val === undefined) return 0;
  const s = String(val).replace(/[',]/g, '').replace(/\.00$/, '');
  return Math.round(Number(s)) || 0;
}

export async function extractInvoice(
  imageBase64: string,
  mimeType: string,
  apiKey: string,
  inventory: Medicine[]
): Promise<ExtractedInvoice> {
  const key = apiKey.trim();
  // مفاتيح Gemini حروف وأرقام إنجليزية فقط (تبدأ بـ AIza). أي حرف غير ذلك (مثل النص العربي المؤقت)
  // سيُفشل طلب HTTP بخطأ غامض، لذا نتحقق مبكراً ونعطي رسالة واضحة.
  if (!key || !/^[\x20-\x7E]+$/.test(key) || !key.startsWith('AIza')) {
    throw new Error('مفتاح Gemini API غير صالح. تأكد من وضع المفتاح الحقيقي (يبدأ بـ AIza) في ملف .env بدلاً من النص المؤقت، ثم أعد تشغيل التطبيق.');
  }

  const ai = new GoogleGenAI({ apiKey: key });

  // نجرّب الأحدث أولاً، وإن لم يتوفر النموذج على الحساب ننتقل تلقائياً للأقدم المتاح.
  const MODEL_CANDIDATES = [
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
  ];

  const contents = [
    {
      role: 'user',
      parts: [
        { inlineData: { mimeType, data: imageBase64 } },
        { text: EXTRACTION_PROMPT },
      ],
    },
  ];

  let text = '';
  let lastError: unknown = null;
  for (const model of MODEL_CANDIDATES) {
    try {
      const response = await ai.models.generateContent({ model, contents });
      text = response.text ?? '';
      lastError = null;
      break;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      lastError = e;
      // 404 / NOT_FOUND يعني النموذج غير متاح على هذا الحساب → جرّب التالي.
      // أي خطأ آخر (مفتاح، حصة، شبكة) لا فائدة من تكراره فنوقفه فوراً.
      if (!/not found|404|not supported|unsupported/i.test(msg)) {
        throw e;
      }
    }
  }
  if (lastError) throw lastError;
  // Strip markdown code fences if present
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('لم يتمكن الذكاء الاصطناعي من استخراج البيانات. تأكد من وضوح الصورة.');

  const raw = JSON.parse(jsonMatch[0]);
  const rawItems: RawGeminiItem[] = Array.isArray(raw.items) ? raw.items : [];

  const items: ExtractedInvoiceItem[] = rawItems.map((item, idx) => {
    const arabicName = (item.arabicName || item.rawName || '').trim();
    const { medicine, score } = matchToInventory(arabicName, inventory);
    const stripsPerBox = Math.max(1, parseNumber(item.stripsPerBox));
    const pricePerStrip = stripsPerBox > 0 ? Math.round(parseNumber(item.pricePerBox) / stripsPerBox) : parseNumber(item.pricePerBox);
    // سعر البيع الافتراضي: من المخزن إن كان الدواء مطابقاً، وإلا هامش ربح فوق التكلفة
    const retailPrice = medicine?.price ?? Math.round(pricePerStrip * 1.25);
    const officialPrice = medicine?.secondaryPrice ?? Math.round(pricePerStrip * 1.35);

    return {
      id: `inv-${Date.now()}-${idx}`,
      rawName: (item.rawName || '').trim(),
      arabicName,
      company: (item.company || '').trim(),
      quantityBoxes: Math.max(1, parseNumber(item.quantityBoxes) || 1),
      pricePerBox: parseNumber(item.pricePerBox),
      stripsPerBox,
      unitType: item.unitType === 'unit' ? 'unit' : 'strip',
      retailPrice,
      officialPrice,
      batchNo: item.batchNo || undefined,
      expiry: item.expiry || undefined,
      matchedMedicine: medicine,
      matchScore: score,
    };
  });

  return {
    supplierName: (raw.supplierName || '').trim(),
    invoiceNo: raw.invoiceNo || undefined,
    date: raw.date || undefined,
    items,
    totalAmount: parseNumber(raw.totalAmount) || undefined,
  };
}
