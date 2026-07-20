import { GoogleGenAI } from '@google/genai';
import type { Medicine, ExtractedInvoiceItem, ExtractedInvoice } from '../types';

const GEMINI_KEY_STORAGE = 'anwar_gemini_api_key';

// المفتاح يُدخله المستخدم من الواجهة فقط ويُحفظ محلياً على هذا الجهاز.
// لا تقرأ المفتاح من import.meta.env: أي متغير VITE_ يُدمج في ملفات JS المنشورة
// ويصبح مكشوفاً لأي زائر للموقع.
// تنظيف مفتاح Gemini: يزيل المسافات والمحارف الخفية (علامات الاتجاه/صفري العرض/BOM/المسافة
// غير الفاصلة) التي تُلتقط عادةً عند النسخ على نظام عربي، ويستخرج توكن «AIza…» من أي نص محيط.
export function sanitizeApiKey(raw: string): string {
  if (!raw) return '';
  const cleaned = String(raw).replace(/[\s ​-‏‪-‮⁦-⁩﻿]/g, '');
  // لا نفترض بادئة (AIza قديمة / AQ. أحدث): نستخرج أطول سلسلة تشبه مفتاحاً إن كان
  // المُدخَل محاطاً بنص، وإلا نعيد المنظَّف كما هو.
  const tokens = cleaned.match(/[A-Za-z0-9._-]{20,}/g);
  return tokens && tokens.length ? tokens.sort((a, b) => b.length - a.length)[0] : cleaned;
}

export const getStoredApiKey = (): string =>
  localStorage.getItem(GEMINI_KEY_STORAGE) || '';
export const saveApiKey = (key: string) => localStorage.setItem(GEMINI_KEY_STORAGE, sanitizeApiKey(key));

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

// درجة تطابق نصّين مُطبَّعين
function scorePair(input: string, candidate: string): number {
  if (!input || !candidate) return 0;
  if (candidate === input) return 1;
  let score = 0;
  if (candidate.includes(input) || input.includes(candidate)) {
    score = 0.85;
  } else {
    const wordsA = input.split(' ').filter(w => w.length > 2);
    const wordsB = candidate.split(' ').filter(w => w.length > 2);
    if (wordsA.length > 0 && wordsB.length > 0) {
      const matchCount = wordsA.filter(wa => wordsB.some(wb => wa.includes(wb) || wb.includes(wa))).length;
      score = matchCount / Math.max(wordsA.length, wordsB.length);
    }
  }
  // عقوبة اختلاف الجرعة: إذا حمل الاسمان أرقاماً (بعد التطبيع تبقى أرقام الجرعة فقط)
  // ولم يشترك أي رقم بينهما، فالغالب أنهما عيّاران مختلفان لنفس الدواء — نُخفض الدرجة
  // تحت عتبة القبول بدل مطابقة عيار خاطئ بصمت.
  const numsA = input.match(/\d+(?:\.\d+)?/g);
  const numsB = candidate.match(/\d+(?:\.\d+)?/g);
  if (numsA && numsB && !numsA.some(n => numsB.includes(n))) score *= 0.6;
  return score;
}

// ذاكرة المطابقات المُتعلَّمة: اسم الفاتورة المطبَّع → معرّف الدواء في المخزون.
// تُبنى من مطابقات المستخدم السابقة وتتزامن عبر Firestore بين الأجهزة.
export type InvoiceAliasMap = Record<string, string>;

// ذاكرة عدد الأشرطة المُتعلَّمة: معرّف الدواء → شريط/علبة كما أكّده المستخدم في مراجعة سابقة.
// تصحيح المستخدم أوثق من أي تقدير — فيتقدّم على Gemini وعلى عدّ الأمبولات من الاسم.
export type StripsMemoryMap = Record<string, number>;

// المطابقة مع المخزون: الذاكرة المُتعلَّمة أولاً (تطابق فوري ومؤكَّد)، ثم المطابقة الضبابية.
// نجرّب اسمين (الترجمة العربية + الاسم الإنجليزي الخام) لأن أغلب المخزون
// محفوظ بالعربية بينما الفاتورة إنجليزية — فنطابق العربي بالعربي والإنجليزي بالإنجليزي معاً.
export function matchToInventory(name: string, inventory: Medicine[], altName?: string, aliases?: InvoiceAliasMap): { medicine: Medicine | null; score: number; byAlias?: boolean } {
  const inputs = [normalizeName(name)];
  if (altName) { const n = normalizeName(altName); if (n && n !== inputs[0]) inputs.push(n); }

  // الذاكرة أولاً: إن سبق للمستخدم مطابقة هذا الاسم بعينه، نعيد نفس الدواء فوراً —
  // بشرط أن يكون الدواء ما يزال موجوداً في المخزون (وإلا نتجاهل الذاكرة ونكمل ضبابياً).
  if (aliases) {
    for (const input of inputs) {
      const savedId = input ? aliases[input] : undefined;
      if (savedId) {
        const saved = inventory.find(m => m.id === savedId);
        if (saved) return { medicine: saved, score: 1, byAlias: true };
      }
    }
  }

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
      for (const input of inputs) {
        const score = scorePair(input, candidate);
        if (score > bestScore) { bestScore = score; best = med; }
      }
    }
  }

  return { medicine: bestScore >= 0.5 ? best : null, score: bestScore };
}

// عدد الأمبولات/الفيالات في العلبة من نص الاسم (يُعدّ قطعاً ويُقسم السعر عليه).
// يعيد null إذا لم يكن الصنف أمبولاً/فيالاً — فيبقى منطق الأشرطة للأقراص كما هو.
export function ampouleVialCount(rawName: string): number | null {
  const s = (rawName || '').toLowerCase();
  // (?:\d|\b) قبل الوحدة: يلتقط «1amp» الملتصقة برقم دون التقاط «clamp/sample» الداخلية
  if (!/(?:\d|\b)(amp|ampoule|ampule|vial|vials)\b/.test(s) && !/فيال|امبول|أمبول|امبولة/.test(s)) return null;
  // «* 5 amp» أو «x10 vial» أو «10 oral vials»
  const m = s.match(/[*x×]\s*(\d{1,3})\s*(amp|ampoule|ampule|vial|vials)/)
    || s.match(/(\d{1,3})\s*(oral\s+)?(amp|ampoule|ampule|vial|vials|فيال|امبول)/);
  if (m) return Math.max(1, parseInt(m[1], 10));
  return 1; // أمبول/فيال بلا عدد صريح = قطعة واحدة
}

// أولوية «شريط/علبة»: ذاكرة المستخدم المؤكَّدة ← عدّ الأمبولات من الاسم ← تقدير Gemini (بحد أدنى 1)
export function resolveStripsPerBox(
  memStrips: number | undefined,
  avCount: number | null,
  geminiRaw: number | string | null | undefined
): number {
  if (memStrips && memStrips > 0) return memStrips;
  if (avCount !== null) return avCount;
  return Math.max(1, parseNumber(geminiRaw));
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
• rawName: انسخ الاسم الإنجليزي كما هو مكتوب تماماً في الفاتورة (مهم جداً — لا تترجمه ولا تختصره).
• arabicName: حوّل الاسم إلى الاسم التجاري العربي المعروف في الصيدليات العراقية
  أمثلة: Panadol→بندول، Augmentin→أوجمنتين، Amoxicillin→أموكسيسيلين، Metformin→ميتفورمين، Omeprazole→أوميبرازول
• company: اسم الشركة المصنّعة. في بعض الفواتير يكون بعمود مستقل، وفي فواتير «ساوة» يكون مدموجاً
  في نهاية اسم المادة (مثل «Bactiflox neo 500 mg * 10 tab acino m» → الشركة = acino m). افصله دائماً.
• stripsPerBox: احسبها من عدد الوحدات في الاسم:
  - "* X tab" أو "* X cap": stripsPerBox = X ÷ 10 (إذا كان X قابلاً للقسمة على 14 بالضبط وX≤56 فاستخدم 14)
  - أمبول/فيال (amp/vial): stripsPerBox = عدد الأمبولات/الفيالات في العلبة («* 5 amp» → 5، «10 oral vials» → 10، «* 1 amp» → 1)
  - شراب/قطرة/كريم/جل/مرهم/ساشيت/بودرة/مرش/حقنة سائلة (injection بحجم مل): stripsPerBox = 1
• unitType: "strip" للأقراص والكبسولات | "unit" لكل الباقي (شراب/كريم/أمبول/فيال...)
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

export function parseNumber(val: number | string | null | undefined): number {
  if (val === null || val === undefined) return 0;
  const s = String(val).replace(/[',]/g, '').replace(/\.00$/, '');
  return Math.round(Number(s)) || 0;
}

export async function extractInvoice(
  imageBase64: string,
  mimeType: string,
  apiKey: string,
  inventory: Medicine[],
  aliases?: InvoiceAliasMap,
  stripsMemory?: StripsMemoryMap
): Promise<ExtractedInvoice> {
  // ننظّف المفتاح أولاً: نزيل المحارف الخفية ونستخرج توكن AIza… من أي نص محيط،
  // فيَقبل اللصق حتى مع علامات اتجاه أو مسافات غير مرئية تُلتقط عند النسخ على نظام عربي.
  const key = sanitizeApiKey(apiKey);
  // لا نفترض بادئة معيّنة: مفاتيح Google قد تبدأ بـ AIza (قديمة) أو AQ. (أحدث). نرفض فقط
  // ما هو فارغ أو قصير جداً أو يحوي حروفاً غير إنجليزية (نص عربي مؤقت) — والباقي يتحقق منه الخادم.
  if (!key || key.length < 20 || !/^[\x20-\x7E]+$/.test(key)) {
    throw new Error('مفتاح Gemini API غير صالح. الصق المفتاح كاملاً من Google AI Studio (استخدم أيقونة النسخ في القائمة، لا التحديد اليدوي).');
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
    const rawName = (item.rawName || '').trim();
    // نطابق بالعربي والإنجليزي معاً — أغلب المخزون عربي والفاتورة إنجليزية،
    // مع أولوية «ذاكرة المطابقات» المُتعلَّمة من مطابقات المستخدم السابقة
    const { medicine, score, byAlias } = matchToInventory(arabicName, inventory, rawName, aliases);
    // الأمبول/الفيال: عدد القطع من الاسم (يتجاوز تقدير Gemini). الأقراص تبقى بمنطق الأشرطة.
    const avCount = ampouleVialCount(rawName || arabicName);
    // ذاكرة الأشرطة أولاً: إن سبق للمستخدم تصحيح/تأكيد «شريط/علبة» لهذا الدواء،
    // نعتمد قيمته المحفوظة ونتجاهل تقدير Gemini وعدّ الأمبولات معاً.
    const stripsPerBox = resolveStripsPerBox(
      medicine ? stripsMemory?.[medicine.id] : undefined, avCount, item.stripsPerBox);
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
      matchedByAlias: byAlias || false,
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
