import { GoogleGenAI, Type } from '@google/genai';
import type { Medicine, ExtractedInvoiceItem, ExtractedInvoice, SupplierMemory } from '../types';
// انتقلت normalizeName إلى ملف مستقل حتى تستوردها لوحة التحكم دون جرّ @google/genai
// إلى الحزمة الرئيسية؛ يُعاد تصديرها هنا حفاظاً على الواجهة القديمة (الشاشة والاختبارات).
import { normalizeName } from './normalizeName';
export { normalizeName };

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

// فهرس مخزون مطبَّع مسبقاً: يُبنى مرة واحدة لكل استخراج بدل إعادة تطبيع أسماء آلاف المواد
// (أربع مرات لكل مادة) مع كل سطر من الفاتورة — المطابقة تصير فورية.
export interface InventoryIndexEntry { med: Medicine; keys: string[] }
export type InventoryIndex = InventoryIndexEntry[];
export function buildInventoryIndex(inventory: Medicine[]): InventoryIndex {
  return inventory.map(med => ({
    med,
    keys: Array.from(new Set([
      normalizeName(med.nameAr),
      normalizeName(med.nameEn || ''),
      normalizeName(med.scientificName || ''),
      normalizeName(med.activeIngredient || ''),
    ].filter(Boolean))),
  }));
}

function matchInputs(name: string, altName?: string): string[] {
  const normalizedName = normalizeName(name);
  const normalizedAlt = altName ? normalizeName(altName) : '';
  // إن لم يكن هناك اسم عربي فعلي، الاسم الإنكليزي (altName) هو المدخل الأساسي للمطابقة —
  // لا احتياطي ثانوي فقط — فلا تُهدَر المطابقة على اسم عربي فارغ لا يطابق شيئاً أصلاً.
  return normalizedName
    ? [normalizedName, ...(normalizedAlt && normalizedAlt !== normalizedName ? [normalizedAlt] : [])]
    : (normalizedAlt ? [normalizedAlt] : []);
}

// أفضل N مرشّحين من المخزون لاسمٍ ما (مرتّبين تنازلياً بالدرجة) — تُستخدم للجولة الثانية
// حيث يختار النموذج بينهم، وللمطابقة العادية (المرشّح الأول).
export function topCandidates(name: string, index: InventoryIndex, altName?: string, n = 5): Array<{ medicine: Medicine; score: number }> {
  const inputs = matchInputs(name, altName);
  if (!inputs.length) return [];
  const scored: Array<{ medicine: Medicine; score: number }> = [];
  for (const { med, keys } of index) {
    let best = 0;
    for (const key of keys) for (const input of inputs) {
      const sc = scorePair(input, key);
      if (sc > best) best = sc;
    }
    if (best > 0) scored.push({ medicine: med, score: best });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, n);
}

// المطابقة مع المخزون: الذاكرة المُتعلَّمة أولاً (تطابق فوري ومؤكَّد)، ثم المطابقة الضبابية.
// نجرّب اسمين (الترجمة العربية + الاسم الإنجليزي الخام) لأن أغلب المخزون
// محفوظ بالعربية بينما الفاتورة إنجليزية — فنطابق العربي بالعربي والإنجليزي بالإنجليزي معاً.
// يقبل مخزوناً خاماً (يبني الفهرس داخلياً) أو فهرساً مبنياً مسبقاً.
export function matchToInventory(name: string, inventory: Medicine[] | InventoryIndex, altName?: string, aliases?: InvoiceAliasMap): { medicine: Medicine | null; score: number; byAlias?: boolean } {
  const index: InventoryIndex = (inventory.length && 'keys' in (inventory[0] as object))
    ? inventory as InventoryIndex
    : buildInventoryIndex(inventory as Medicine[]);
  const inputs = matchInputs(name, altName);

  // الذاكرة أولاً: إن سبق للمستخدم مطابقة هذا الاسم بعينه، نعيد نفس الدواء فوراً —
  // بشرط أن يكون الدواء ما يزال موجوداً في المخزون (وإلا نتجاهل الذاكرة ونكمل ضبابياً).
  if (aliases) {
    for (const input of inputs) {
      const savedId = input ? aliases[input] : undefined;
      if (savedId) {
        const saved = index.find(e => e.med.id === savedId);
        if (saved) return { medicine: saved.med, score: 1, byAlias: true };
      }
    }
  }

  const [best] = topCandidates(name, index, altName, 1);
  const bestScore = best?.score ?? 0;
  return { medicine: bestScore >= 0.5 ? best.medicine : null, score: bestScore };
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
• إذا لم يكن الحقل واضحاً اجعله null
• إذا أُرفقت أكثر من صورة فهي صفحات متتابعة لفاتورة واحدة: ادمج أسطرها كلها في قائمة واحدة
  بالترتيب، ولا تكرّر سطراً ظهر جزئياً في نهاية صفحة وبداية التالية، وخذ الإجمالي من الصفحة الأخيرة.`;

// أمثلة مؤكَّدة من فواتير المورد نفسه (ذاكرة المورد) — تُلحَق بالطلب فتصير الترجمة العربية
// واستخراج الشركة متسقين مع ما اعتمده المستخدم سابقاً لهذا المورد بالذات.
function supplierMemoryPrompt(mem?: SupplierMemory | null): string {
  if (!mem || (!mem.examples?.length && !mem.companies?.length)) return '';
  const lines: string[] = ['\n\nمعلومات مؤكَّدة من فواتير سابقة لهذا المورد نفسه — اعتمدها عند التطابق:'];
  if (mem.companies?.length) lines.push(`• أسماء الشركات التي تظهر في فواتيره: ${mem.companies.slice(0, 30).join('، ')}`);
  if (mem.examples?.length) {
    lines.push('• أمثلة (الاسم كما في الفاتورة → الاسم العربي المعتمد في المخزون):');
    mem.examples.slice(0, 40).forEach(ex => lines.push(`  - ${ex.raw} → ${ex.ar}`));
  }
  return lines.join('\n');
}

// مخطط المخرجات المنظَّمة: النموذج مُلزَم بإرجاع JSON بهذه البنية تماماً (بدل استخراجه من نص حر
// بتعبير نمطي) — لا أسوار markdown ولا حقول ناقصة ولا JSON مكسور.
const INVOICE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    supplierName: { type: Type.STRING, nullable: true },
    invoiceNo: { type: Type.STRING, nullable: true },
    date: { type: Type.STRING, nullable: true },
    totalAmount: { type: Type.NUMBER, nullable: true },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          rawName: { type: Type.STRING },
          arabicName: { type: Type.STRING, nullable: true },
          company: { type: Type.STRING, nullable: true },
          quantityBoxes: { type: Type.NUMBER, nullable: true },
          pricePerBox: { type: Type.NUMBER, nullable: true },
          stripsPerBox: { type: Type.NUMBER, nullable: true },
          unitType: { type: Type.STRING, nullable: true },
          batchNo: { type: Type.STRING, nullable: true },
          expiry: { type: Type.STRING, nullable: true },
        },
        required: ['rawName'],
      },
    },
  },
  required: ['items'],
};

// مخطط الجولة الثانية: لكل سطر ضبابي، معرّف المرشّح المختار أو null إن لم يطابق أيٌّ منهم
const DISAMBIGUATION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    decisions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          line: { type: Type.INTEGER },
          chosenId: { type: Type.STRING, nullable: true },
        },
        required: ['line'],
      },
    },
  },
  required: ['decisions'],
};

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

// يستخرج رسالة مقروءة من أي خطأ — Error عادي، أو كائن خطأ REST من Google بالشكل
// {error:{message}}، أو نص، أو أي شكل آخر — بدل ابتلاعه صامتاً وإظهار «خطأ غير متوقع»
// بلا أي تفصيل يُبنى عليه تشخيص (مفتاح/حصة/شبكة/نموذج غير متاح).
export function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object') {
    const anyE = e as Record<string, unknown>;
    const nested = anyE.error as Record<string, unknown> | undefined;
    if (nested && typeof nested.message === 'string') return nested.message;
    if (typeof anyE.message === 'string') return anyE.message;
    try { return JSON.stringify(e); } catch { /* كائن دائري — نتجاهل ونكمل */ }
  }
  return String(e);
}

export interface InvoiceImage { base64: string; mimeType: string }

export interface ExtractOptions {
  aliases?: InvoiceAliasMap;
  stripsMemory?: StripsMemoryMap;
  supplierMemory?: SupplierMemory | null;
  onProgress?: (msg: string) => void;
  // الجولة الثانية (اختيار النموذج بين مرشّحي المخزون للأسطر الضبابية) — مفعّلة افتراضياً
  disambiguate?: boolean;
}

// النماذج بالترتيب من الأخف/الأرخص إلى الأقوى. الانتقال للتالي يحدث في حالتين:
// (1) النموذج غير متاح على الحساب (404)، أو (2) فشل التحليل/مخرجات فارغة — تصعيد لنموذج أقوى.
const MODEL_CANDIDATES = [
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
];

function isModelUnavailable(msg: string): boolean {
  return /not found|404|not supported|unsupported/i.test(msg);
}

function parseJsonLoose(text: string): unknown {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try { return JSON.parse(cleaned); } catch { /* نحاول اقتطاع أول كائن */ }
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('لم يتمكن الذكاء الاصطناعي من استخراج البيانات. تأكد من وضوح الصورة.');
  return JSON.parse(m[0]);
}

// استدعاء منظَّم مع تصعيد تلقائي: يبدأ من startIdx في سلسلة النماذج، وينتقل للأقوى عند
// عدم التوفر أو فشل التحليل. يعيد الكائن المحلَّل ومؤشّر النموذج الذي نجح.
async function callStructured(
  ai: GoogleGenAI,
  parts: Array<Record<string, unknown>>,
  schema: object,
  validate: (parsed: unknown) => boolean,
  startIdx = 0,
): Promise<{ parsed: unknown; modelIdx: number }> {
  let lastError: Error | null = null;
  for (let i = startIdx; i < MODEL_CANDIDATES.length; i++) {
    const model = MODEL_CANDIDATES[i];
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts }],
        config: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0 },
      });
      const parsed = parseJsonLoose(response.text ?? '');
      if (!validate(parsed)) throw new Error('EMPTY_RESULT');
      return { parsed, modelIdx: i };
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      lastError = new Error(msg === 'EMPTY_RESULT' ? 'لم يتمكن الذكاء الاصطناعي من استخراج البيانات. تأكد من وضوح الصورة.' : msg);
      // غير متاح أو فشل تحليل/فارغ → نصعّد للنموذج التالي؛ خطأ مفتاح/حصة/شبكة → لا فائدة من التكرار
      const escalate = isModelUnavailable(msg) || msg === 'EMPTY_RESULT' || /JSON|Unexpected token|استخراج البيانات/i.test(msg);
      if (!escalate) throw lastError;
    }
  }
  throw lastError ?? new Error('تعذّر الاتصال بنموذج Gemini.');
}

export async function extractInvoice(
  images: InvoiceImage | InvoiceImage[],
  apiKey: string,
  inventory: Medicine[],
  opts: ExtractOptions = {}
): Promise<ExtractedInvoice> {
  const imgs = Array.isArray(images) ? images : [images];
  const { aliases, stripsMemory, supplierMemory, onProgress } = opts;
  const disambiguate = opts.disambiguate !== false;
  if (!imgs.length) throw new Error('لا توجد صورة للتحليل.');

  // ننظّف المفتاح أولاً: نزيل المحارف الخفية ونستخرج توكن AIza… من أي نص محيط،
  // فيَقبل اللصق حتى مع علامات اتجاه أو مسافات غير مرئية تُلتقط عند النسخ على نظام عربي.
  const key = sanitizeApiKey(apiKey);
  // لا نفترض بادئة معيّنة: مفاتيح Google قد تبدأ بـ AIza (قديمة) أو AQ. (أحدث). نرفض فقط
  // ما هو فارغ أو قصير جداً أو يحوي حروفاً غير إنجليزية (نص عربي مؤقت) — والباقي يتحقق منه الخادم.
  if (!key || key.length < 20 || !/^[\x20-\x7E]+$/.test(key)) {
    throw new Error('مفتاح Gemini API غير صالح. الصق المفتاح كاملاً من Google AI Studio (استخدم أيقونة النسخ في القائمة، لا التحديد اليدوي).');
  }

  const ai = new GoogleGenAI({ apiKey: key });
  const index = buildInventoryIndex(inventory);

  onProgress?.(imgs.length > 1 ? `جارٍ قراءة ${imgs.length} صور للفاتورة…` : 'جارٍ قراءة الفاتورة…');
  const parts: Array<Record<string, unknown>> = [
    ...imgs.map(im => ({ inlineData: { mimeType: im.mimeType, data: im.base64 } })),
    { text: EXTRACTION_PROMPT + supplierMemoryPrompt(supplierMemory) },
  ];
  const { parsed, modelIdx } = await callStructured(
    ai, parts, INVOICE_SCHEMA,
    (p) => !!p && typeof p === 'object' && Array.isArray((p as { items?: unknown }).items) && ((p as { items: unknown[] }).items.length > 0),
  );
  const raw = parsed as { supplierName?: string; invoiceNo?: string; date?: string; totalAmount?: number | string; items: RawGeminiItem[] };
  const rawItems: RawGeminiItem[] = Array.isArray(raw.items) ? raw.items : [];

  const items: ExtractedInvoiceItem[] = rawItems.map((item, idx) => {
    const arabicName = (item.arabicName || item.rawName || '').trim();
    const rawName = (item.rawName || '').trim();
    // نطابق بالعربي والإنجليزي معاً — أغلب المخزون عربي والفاتورة إنجليزية، مع أولوية «ذاكرة
    // المطابقات» المُتعلَّمة سابقاً. نمرّر اسم Gemini العربي الخام (قبل الاستبدال باسم الفاتورة
    // عند غيابه) حتى تعتمد matchToInventory على الإنكليزي وحده متى لم يكن هناك اسم عربي فعلي.
    const { medicine, score, byAlias } = matchToInventory((item.arabicName || '').trim(), index, rawName, aliases);
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
      rawName,
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

  // --- الجولة الثانية: الأسطر الضبابية فقط (لا ذاكرة، ودرجة أقل من 0.8) تُعرض على النموذج
  // مع أفضل خمسة مرشّحين لكل سطر من المخزون ليختار الصحيح أو يرفضهم كلهم — نصّ فقط بلا صورة،
  // استدعاء واحد لكل الأسطر معاً، وبالنموذج الذي نجح في الجولة الأولى (أو أقوى منه).
  if (disambiguate) {
    const fuzzy = items
      .map((it, line) => ({ it, line, cands: it.matchedByAlias || it.matchScore >= 0.8 ? [] : topCandidates(it.arabicName, index, it.rawName, 5).filter(c => c.score >= 0.25) }))
      .filter(x => x.cands.length > 0);
    if (fuzzy.length) {
      onProgress?.(`جولة ثانية: حسم ${fuzzy.length} سطر ضبابي بين مرشّحي المخزون…`);
      const lines = fuzzy.map(x =>
        `سطر ${x.line}: «${x.it.rawName}»${x.it.arabicName && x.it.arabicName !== x.it.rawName ? ` (${x.it.arabicName})` : ''}${x.it.company ? ` — شركة: ${x.it.company}` : ''}\n` +
        x.cands.map(c => `   • id=${c.medicine.id} | ${c.medicine.nameAr}${c.medicine.nameEn ? ` | ${c.medicine.nameEn}` : ''}${c.medicine.manufacturer ? ` | ${c.medicine.manufacturer}` : ''}`).join('\n')
      ).join('\n');
      const prompt = `أنت صيدلي خبير بالأسماء التجارية في العراق. لكل سطر من فاتورة شراء، اختر معرّف المادة (id) من مرشّحي المخزون
التي هي نفس الدواء بنفس العيار/التركيز ونفس الشكل الصيدلاني (أقراص/شراب/أمبول…). العيار المختلف = مادة مختلفة → لا تختره.
إن لم يكن أيٌّ من المرشّحين هو نفس المادة أرجع chosenId = null. لا تخمّن.\n\n${lines}`;
      try {
        const { parsed: p2 } = await callStructured(
          ai, [{ text: prompt }], DISAMBIGUATION_SCHEMA,
          (p) => !!p && Array.isArray((p as { decisions?: unknown }).decisions),
          modelIdx,
        );
        const decisions = (p2 as { decisions: Array<{ line: number; chosenId?: string | null }> }).decisions;
        decisions.forEach(d => {
          const f = fuzzy.find(x => x.line === d.line);
          if (!f) return;
          const chosen = d.chosenId ? f.cands.find(c => c.medicine.id === d.chosenId) : undefined;
          const it = items[f.line];
          if (chosen) {
            const memStrips = stripsMemory?.[chosen.medicine.id];
            it.matchedMedicine = chosen.medicine;
            it.matchScore = 0.9;
            it.matchedByAI = true;
            if (memStrips && memStrips > 0) it.stripsPerBox = memStrips;
            const pps = it.stripsPerBox > 0 ? Math.round(it.pricePerBox / it.stripsPerBox) : it.pricePerBox;
            it.retailPrice = chosen.medicine.price || Math.round(pps * 1.25);
            it.officialPrice = chosen.medicine.secondaryPrice || Math.round(pps * 1.35);
          } else if (it.matchedMedicine && !it.matchedByAlias && it.matchScore < 0.8) {
            // النموذج رفض المرشّح الضبابي الذي اختارته المطابقة النصية → نتركه «جديداً» للمراجعة
            it.matchedMedicine = null;
            it.matchScore = 0;
          }
        });
      } catch {
        // الجولة الثانية اختيارية: فشلها لا يُسقط الاستخراج كله — تبقى نتائج المطابقة النصية
      }
    }
  }

  return {
    supplierName: (raw.supplierName || '').trim(),
    invoiceNo: raw.invoiceNo || undefined,
    date: raw.date || undefined,
    items,
    totalAmount: parseNumber(raw.totalAmount) || undefined,
  };
}
