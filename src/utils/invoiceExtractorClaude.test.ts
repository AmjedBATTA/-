import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Medicine } from '../types';

// Claude مزوّد احتياطي: نزيّف المكتبتين معاً في ملف مستقل (vi.mock يعمل على مستوى الوحدة كلها)
const generateContent = vi.fn();
const list = vi.fn();
const create = vi.fn();
const claudeOpts: unknown[] = [];

vi.mock('@google/genai', () => ({
  GoogleGenAI: class { models = { generateContent, list } },
  Type: { ARRAY: 'ARRAY', BOOLEAN: 'BOOLEAN', INTEGER: 'INTEGER', OBJECT: 'OBJECT', STRING: 'STRING' },
}));

vi.mock('@anthropic-ai/sdk', () => {
  class AuthenticationError extends Error {}
  class Anthropic {
    static AuthenticationError = AuthenticationError;
    messages = { create };
    constructor(opts: unknown) { claudeOpts.push(opts); }
  }
  return { default: Anthropic };
});

const { extractInvoice, toClaudeSchema } = await import('./invoiceExtractor');
const { default: MockAnthropic } = await import('@anthropic-ai/sdk');

const GEMINI_KEY = 'AIzaSyTestKeyForUnitTests1234567890';
const CLAUDE_KEY = 'sk-ant-api03-TestKeyForUnitTests1234567890';
const IMG = { base64: 'ZmFrZQ==', mimeType: 'image/jpeg' };
const INVENTORY: Medicine[] = [];

const items = { items: [{ rawName: 'Panadol', quantityBoxes: '2', pricePerBox: '5000' }] };
const claudeReply = (obj: unknown) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(obj) }] });
const quota = () => new Error('429 RESOURCE_EXHAUSTED: quota exceeded');
const busy = () => Object.assign(new Error('503 UNAVAILABLE: The model is overloaded. Please try again later.'), { status: 503 });
const claudeModels = () => create.mock.calls.map(c => c[0].model as string);

beforeEach(() => {
  generateContent.mockReset();
  list.mockReset();
  create.mockReset();
  claudeOpts.length = 0;
});

describe('Claude احتياطياً عند تعذّر Gemini', () => {
  it('يكمل بـ Claude Sonnet حين يرفض Gemini (حصة) ويرسل الصورة ومخطط JSON', async () => {
    generateContent.mockRejectedValue(quota());
    create.mockResolvedValueOnce(claudeReply(items));

    const out = await extractInvoice(IMG, GEMINI_KEY, INVENTORY, { disambiguate: false, claudeKey: CLAUDE_KEY });
    expect(out.items).toHaveLength(1);
    expect(claudeModels()).toEqual(['claude-sonnet-5']);
    const req = create.mock.calls[0][0];
    expect(req.output_config.format.type).toBe('json_schema');
    expect(req.messages[0].content[0]).toMatchObject({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg' } });
    expect(claudeOpts[0]).toMatchObject({ apiKey: CLAUDE_KEY, dangerouslyAllowBrowser: true });
  });

  it('حين تزدحم كل نماذج Gemini (503) تُقرأ الفاتورة بـ Claude بدل رسالة الانتظار', async () => {
    generateContent.mockRejectedValue(busy());
    list.mockResolvedValue([]);
    create.mockResolvedValueOnce(claudeReply(items));

    const out = await extractInvoice(IMG, GEMINI_KEY, INVENTORY, { disambiguate: false, claudeKey: CLAUDE_KEY });
    expect(out.items).toHaveLength(1);
    expect(create).toHaveBeenCalledTimes(1);
  }, 15000);

  it('لا يستدعي Claude حين ينجح Gemini', async () => {
    generateContent.mockResolvedValue({ text: JSON.stringify(items) });

    await extractInvoice(IMG, GEMINI_KEY, INVENTORY, { disambiguate: false, claudeKey: CLAUDE_KEY });
    expect(create).not.toHaveBeenCalled();
  });

  it('يعمل بـ Claude وحده إن لم يُحفظ مفتاح Gemini', async () => {
    create.mockResolvedValueOnce(claudeReply(items));

    const out = await extractInvoice(IMG, '', INVENTORY, { disambiguate: false, claudeKey: CLAUDE_KEY });
    expect(out.items).toHaveLength(1);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('يذكر المزوّدين معاً حين يفشلان', async () => {
    generateContent.mockRejectedValue(quota());
    create.mockRejectedValue(new Error('500 internal error'));

    await expect(extractInvoice(IMG, GEMINI_KEY, INVENTORY, { disambiguate: false, claudeKey: CLAUDE_KEY }))
      .rejects.toThrow(/تعذّر Gemini وClaude معاً.*quota.*Claude: 500/s);
  });

  it('مفتاح Claude المرفوض يظهر برسالة عربية واضحة', async () => {
    const AuthErr = (MockAnthropic as unknown as { AuthenticationError: new (m: string) => Error }).AuthenticationError;
    create.mockRejectedValue(new AuthErr('401 invalid x-api-key'));

    await expect(extractInvoice(IMG, '', INVENTORY, { disambiguate: false, claudeKey: CLAUDE_KEY }))
      .rejects.toThrow(/مفتاح Claude غير صالح/);
  });

  it('بعد تعذّر Gemini تذهب الجولة الثانية إلى Claude Haiku مباشرةً', async () => {
    const inventory = [{
      id: 'm1', nameAr: 'بندول اكسترا', nameEn: 'Panadol Extra', activeIngredient: '', category: '',
      warehouse: '', price: 1000, availableQuantity: 10, status: 'available',
    } as Medicine];
    generateContent.mockRejectedValue(quota());
    // «Panadol Night» مقابل «Panadol Extra» = تطابق نصي ضبابي (0.5) فيُحال إلى الجولة الثانية
    create
      .mockResolvedValueOnce(claudeReply({ items: [{ rawName: 'Panadol Night', arabicName: 'بندول نايت', pricePerBox: '9000' }] }))
      .mockResolvedValueOnce(claudeReply({ decisions: [{ line: 0, chosenId: null }] }));

    await extractInvoice(IMG, GEMINI_KEY, inventory, { claudeKey: CLAUDE_KEY });
    expect(claudeModels()).toEqual(['claude-sonnet-5', 'claude-haiku-4-5']);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });
});

describe('toClaudeSchema', () => {
  it('يحوّل مخطط Gemini: الحقول كلها مطلوبة، الاختيارية تقبل null، ولا خصائص إضافية', () => {
    const out = toClaudeSchema({
      type: 'OBJECT',
      properties: {
        name: { type: 'STRING' },
        rows: { type: 'ARRAY', items: { type: 'OBJECT', properties: { qty: { type: 'STRING', nullable: true } } } },
      },
    });
    expect(out).toEqual({
      type: 'object',
      properties: {
        name: { type: 'string' },
        rows: {
          type: 'array',
          items: {
            type: 'object',
            properties: { qty: { anyOf: [{ type: 'string' }, { type: 'null' }] } },
            required: ['qty'],
            additionalProperties: false,
          },
        },
      },
      required: ['name', 'rows'],
      additionalProperties: false,
    });
  });
});
