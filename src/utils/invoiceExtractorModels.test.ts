import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Medicine } from '../types';

// نعزل اختبارات اختيار النموذج في ملف مستقل: vi.mock يعمل على مستوى الوحدة كلها،
// ولا نريد تزييف @google/genai في بقية اختبارات الاستخراج.
const generateContent = vi.fn();
const list = vi.fn();

vi.mock('@google/genai', () => ({
  GoogleGenAI: class { models = { generateContent, list } },
  Type: { ARRAY: 'ARRAY', BOOLEAN: 'BOOLEAN', INTEGER: 'INTEGER', OBJECT: 'OBJECT', STRING: 'STRING' },
}));

const { extractInvoice, suggestedModelFrom } = await import('./invoiceExtractor');

const KEY = 'AIzaSyTestKeyForUnitTests1234567890';
const IMG = { base64: 'ZmFrZQ==', mimeType: 'image/jpeg' };
const INVENTORY: Medicine[] = [];

const okResponse = { text: JSON.stringify({ items: [{ rawName: 'Panadol', quantityBoxes: 2, pricePerBox: 5000 }] }) };

// رسالة الإيقاف الحقيقية التي وصلت من Google على التطبيق الحي
const deprecated = (model: string) =>
  Object.assign(new Error(`This model models/${model} is no longer available to new users. ` +
    `Please update your code to use models/gemini-3.6-flash for the latest features and improvements.`), { status: 404 });

const modelsUsed = () => generateContent.mock.calls.map(c => c[0].model as string);

beforeEach(() => {
  generateContent.mockReset();
  list.mockReset();
});

describe('suggestedModelFrom', () => {
  it('يلتقط البديل الذي توصي به Google لا النموذج المتوقف', () => {
    expect(suggestedModelFrom(deprecated('gemini-2.5-flash').message)).toBe('gemini-3.6-flash');
  });

  it('يعيد null إن لم تحمل الرسالة توصية', () => {
    expect(suggestedModelFrom('429 quota exceeded')).toBeNull();
    expect(suggestedModelFrom('models/gemini-2.0-flash is not found')).toBeNull();
  });
});

describe('تصعيد النماذج عند الإيقاف', () => {
  it('ينتقل للنموذج التالي عند 404 وينجح', async () => {
    generateContent
      .mockRejectedValueOnce(deprecated('gemini-3.6-flash'))
      .mockResolvedValueOnce(okResponse);

    const out = await extractInvoice(IMG, KEY, INVENTORY, { disambiguate: false });
    expect(out.items).toHaveLength(1);
    expect(modelsUsed()).toHaveLength(2);
  });

  it('يجرّب البديل الموصى به في رسالة Google قبل بقية القائمة', async () => {
    generateContent
      .mockRejectedValueOnce(
        Object.assign(new Error('This model models/gemini-3.6-flash is not found. ' +
          'Please update your code to use models/gemini-4-flash for the latest features.'), { status: 404 }))
      .mockResolvedValueOnce(okResponse);

    await extractInvoice(IMG, KEY, INVENTORY, { disambiguate: false });
    // النموذج المقترح داخل الرسالة يسبق المرشّح الثابت التالي
    expect(modelsUsed()[1]).toBe('gemini-4-flash');
  });

  // السيناريو الذي كسر التطبيق الحي مرتين: كل الأسماء المكتوبة يدوياً أوقفتها Google
  it('يسأل Google عن المتاح فعلاً حين تُوقَف كل النماذج المكتوبة في الكود', async () => {
    generateContent.mockImplementation(({ model }: { model: string }) => {
      if (model === 'gemini-9.9-flash') return Promise.resolve(okResponse);
      return Promise.reject(deprecated(model));
    });
    list.mockResolvedValue([
      { name: 'models/text-embedding-004', supportedActions: ['embedContent'] },
      { name: 'models/gemini-9.9-flash', supportedActions: ['generateContent'] },
    ]);

    const out = await extractInvoice(IMG, KEY, INVENTORY, { disambiguate: false });
    expect(out.items).toHaveLength(1);
    expect(list).toHaveBeenCalled();
    expect(modelsUsed().at(-1)).toBe('gemini-9.9-flash');
  });

  it('يذكر النماذج المجرَّبة في رسالة الخطأ حين لا يبقى أي نموذج', async () => {
    generateContent.mockImplementation(({ model }: { model: string }) => Promise.reject(deprecated(model)));
    list.mockResolvedValue([]);

    await expect(extractInvoice(IMG, KEY, INVENTORY, { disambiguate: false }))
      .rejects.toThrow(/جُرِّبت:.*gemini-3\.6-flash/s);
  });

  it('يتذكّر النموذج الناجح فيبدأ به في الاستخراج التالي بلا محاولات ضائعة', async () => {
    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
    });
    generateContent.mockImplementation(({ model }: { model: string }) =>
      model === 'gemini-9.9-flash' ? Promise.resolve(okResponse) : Promise.reject(deprecated(model)));
    list.mockResolvedValue([{ name: 'models/gemini-9.9-flash', supportedActions: ['generateContent'] }]);

    await extractInvoice(IMG, KEY, INVENTORY, { disambiguate: false });
    const firstRunCalls = generateContent.mock.calls.length;
    expect(firstRunCalls).toBeGreaterThan(1);

    generateContent.mockClear();
    await extractInvoice(IMG, KEY, INVENTORY, { disambiguate: false });
    expect(modelsUsed()).toEqual(['gemini-9.9-flash']);
    vi.unstubAllGlobals();
  });

  it('لا يهدر محاولات على بقية النماذج حين يكون الخطأ في المفتاح أو الحصة', async () => {
    generateContent.mockRejectedValue(new Error('429 RESOURCE_EXHAUSTED: quota exceeded'));

    await expect(extractInvoice(IMG, KEY, INVENTORY, { disambiguate: false })).rejects.toThrow(/quota/);
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(list).not.toHaveBeenCalled();
  });
});
