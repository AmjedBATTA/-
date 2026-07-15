import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Upload, Loader2, CheckCircle2, AlertCircle, Search,
  ChevronDown, Trash2, FileImage, KeyRound, Eye, EyeOff, Barcode,
} from 'lucide-react';
import type { Medicine, ExtractedInvoiceItem, ExtractedInvoice } from '../types';
import { extractInvoice, getStoredApiKey, saveApiKey, matchToInventory, normalizeName } from '../utils/invoiceExtractor';
import type { InvoiceAliasMap } from '../utils/invoiceExtractor';

interface DraftItem {
  id: string;
  medicineId?: string;
  nameAr: string;
  nameEn: string;
  manufacturer: string; // الشركة المصنّعة من الفاتورة — تُملأ في المخزون عند المطابقة إن كان الحقل فارغاً
  stockCorrection?: number; // تصحيح المخزون الحالي يدوياً (للمطابق) — يُعتمد كرصيد فعلي عند الاعتماد
  scientificName: string;
  category: string;
  price: number;
  retailPrice: number;
  officialPrice: number;
  qty: number;
  expiryDate: string;
  barcode: string;
  warehouse: string;
}

interface Props {
  inventory: Medicine[];
  expiryDates: Record<string, string>; // معرّف الدواء → تاريخ الانتهاء المخزَّن (الأبكر، للتنبيهات)
  lastEnteredExpiry: Record<string, string>; // معرّف الدواء → آخر تاريخ أدخله المستخدم (بديل عند خلو الفاتورة)
  aliases: InvoiceAliasMap; // ذاكرة المطابقات المُتعلَّمة: اسم الفاتورة المطبَّع → معرّف الدواء
  onLearnAliases: (pairs: Array<{ key: string; medicineId: string; label?: string }>) => void;
  onForgetAliases: (keys: string[], medicineId: string) => void; // تُنسى فقط إن كانت تشير لهذا الدواء
  onClose: () => void;
  onConfirm: (items: DraftItem[], supplierName: string) => void;
}

type Step = 'key' | 'upload' | 'processing' | 'review';

const DEFAULT_EXPIRY_MONTH = '2028-12';
// يوحّد أي تاريخ («2027/07» أو «2027-07-01») إلى صيغة إدخال الشهر YYYY-MM
function toMonthInput(s?: string): string {
  if (!s) return '';
  const m = s.replace(/\//g, '-').match(/(\d{4})-(\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}` : '';
}

function matchBadge(score: number, isMatched: boolean, byAlias?: boolean) {
  if (!isMatched) return { label: 'جديد', cls: 'bg-amber-100 text-amber-700 border-amber-200' };
  if (byAlias) return { label: 'محفوظ ✓', cls: 'bg-violet-100 text-violet-700 border-violet-200' };
  if (score >= 0.8) return { label: 'تطابق', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
  return { label: 'تقريبي', cls: 'bg-blue-100 text-blue-700 border-blue-200' };
}

export default function InvoiceImportModal({ inventory, expiryDates, lastEnteredExpiry, aliases, onLearnAliases, onForgetAliases, onClose, onConfirm }: Props) {
  const initialKey = getStoredApiKey();
  const [step, setStep] = useState<Step>(initialKey ? 'upload' : 'key');
  const [apiKey, setApiKey] = useState(initialKey);
  const [showKey, setShowKey] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [extractedInvoice, setExtractedInvoice] = useState<ExtractedInvoice | null>(null);
  const [items, setItems] = useState<ExtractedInvoiceItem[]>([]);
  const [error, setError] = useState<string>('');
  const [searchOpen, setSearchOpen] = useState<string | null>(null); // item id
  const [searchQuery, setSearchQuery] = useState('');
  const [editingStockId, setEditingStockId] = useState<string | null>(null); // المخزون الحالي قيد التعديل (بالنقر المزدوج)
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  // --- ماسح الباركود بالكاميرا (مكتفٍ بذاته داخل النافذة، بنفس تقنية BarcodeDetector) ---
  const [scanningItemId, setScanningItemId] = useState<string | null>(null);
  const [scanStream, setScanStream] = useState<MediaStream | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const startScan = useCallback(async (itemId: string) => {
    setScanError(null);
    setScanningItemId(itemId);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      setScanStream(stream);
    } catch {
      setScanError('تعذّر الوصول للكاميرا — تحقّق من صلاحيات المتصفح، أو اكتب الباركود يدوياً.');
    }
  }, []);

  const stopScan = useCallback(() => {
    setScanStream(prev => { prev?.getTracks().forEach(t => t.stop()); return null; });
    setScanningItemId(null);
    setScanError(null);
  }, []);

  // ربط البثّ بعنصر الفيديو
  useEffect(() => {
    if (scanningItemId && scanStream && videoRef.current) {
      videoRef.current.srcObject = scanStream;
      videoRef.current.play().catch(() => setScanError('فشل تشغيل عرض الكاميرا.'));
    }
  }, [scanningItemId, scanStream]);

  // حلقة الكشف: عند رصد باركود يُملأ حقل المادة ويُغلق الماسح
  useEffect(() => {
    if (!scanningItemId || !scanStream) return;
    if (!('BarcodeDetector' in window)) {
      setScanError('المتصفح لا يدعم قارئ الباركود — اكتب الباركود يدوياً.');
      return;
    }
    let active = true;
    let raf = 0;
    const detector = new (window as unknown as { BarcodeDetector: new (o: unknown) => { detect: (v: unknown) => Promise<{ rawValue: string }[]> } })
      .BarcodeDetector({ formats: ['ean_13', 'ean_8', 'qr_code', 'code_128', 'code_39', 'upc_a', 'upc_e'] });
    const targetId = scanningItemId;
    const check = async () => {
      const v = videoRef.current;
      if (!active || !v || v.paused || v.ended) return;
      try {
        const found = await detector.detect(v);
        if (found && found.length > 0 && active) {
          setItems(prev => prev.map(it => it.id === targetId ? { ...it, barcode: found[0].rawValue } : it));
          active = false;
          stopScan();
          return;
        }
      } catch { /* إطار غير جاهز — نتجاهل ونعيد */ }
      if (active) raf = requestAnimationFrame(check);
    };
    raf = requestAnimationFrame(check);
    return () => { active = false; if (raf) cancelAnimationFrame(raf); };
  }, [scanningItemId, scanStream, stopScan]);

  // إيقاف الكاميرا عند إغلاق النافذة
  useEffect(() => () => { scanStream?.getTracks().forEach(t => t.stop()); }, [scanStream]);

  const handleFilePicked = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('يرجى اختيار ملف صورة فقط (JPG, PNG, WEBP)');
      return;
    }
    setImageFile(file);
    setError('');
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFilePicked(file);
  }, [handleFilePicked]);

  const handleAnalyze = async () => {
    if (!imageFile || !apiKey.trim()) return;
    setStep('processing');
    setError('');
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(imageFile);
      });
      const invoice = await extractInvoice(base64, imageFile.type, apiKey.trim(), inventory, aliases);
      setExtractedInvoice(invoice);
      // تهيئة كل صنف: تاريخ الانتهاء (YYYY-MM) — الأولوية: تاريخ الفاتورة الحالية (OCR) أولاً،
      // وإلا آخر تاريخ أدخله المستخدم لهذه المادة، وإلا المخزَّن (الأبكر) للتوافق، وإلا الافتراضي.
      // الباركود = باركود المخزون للمطابق، ويُترك فارغاً للجديد ليُدخله المستخدم أو يُولَّد لاحقاً.
      const prepared = invoice.items.map(it => {
        const med = it.matchedMedicine;
        const lastMonth = med ? toMonthInput(lastEnteredExpiry[med.id]) : '';
        const storedMonth = med ? toMonthInput(expiryDates[med.id]) : '';
        return {
          ...it,
          expiry: toMonthInput(it.expiry) || lastMonth || storedMonth || DEFAULT_EXPIRY_MONTH,
          barcode: med?.barcode || '',
        };
      });
      setItems(prepared);
      setStep('review');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ غير متوقع';
      setError(msg.includes('API_KEY') || msg.includes('403') || msg.includes('401')
        ? 'مفتاح API غير صالح. تحقق من مفتاح Gemini.'
        : msg);
      setStep('upload');
    }
  };

  const updateItem = (id: string, patch: Partial<ExtractedInvoiceItem>) => {
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it));
  };

  const removeItem = (id: string) => setItems(prev => prev.filter(it => it.id !== id));

  // مفاتيح الذاكرة لصنفٍ ما: الاسم الخام من الفاتورة + الترجمة العربية (مطبَّعين)
  const aliasKeysOf = (it: ExtractedInvoiceItem): string[] =>
    Array.from(new Set([normalizeName(it.rawName || ''), normalizeName(it.arabicName || '')].filter(k => k.length >= 3)));

  // تعلُّم مطابقة مؤكَّدة: نحفظ (اسم الفاتورة → الدواء) ونستثني ما يطابق اسم الدواء نفسه
  // (لا فائدة من حفظه — المطابقة النصية تجده فوراً أصلاً)
  const learnItemAliases = (it: ExtractedInvoiceItem, med: Medicine) => {
    const selfKeys = new Set([normalizeName(med.nameAr || ''), normalizeName(med.nameEn || '')]);
    const pairs = aliasKeysOf(it)
      .filter(k => !selfKeys.has(k))
      .map(key => ({ key, medicineId: med.id, label: (it.rawName || it.arabicName || '').trim() }));
    if (pairs.length) onLearnAliases(pairs);
  };

  const selectMedicine = (itemId: string, med: Medicine) => {
    const it = items.find(x => x.id === itemId);
    // مطابقة يدوية صريحة = أوثق إشارة تعلُّم: تُحفظ فوراً قبل أن يُستبدل الاسم العربي باسم المخزون
    if (it) learnItemAliases(it, med);
    const pricePerStrip = it && it.stripsPerBox > 0 ? Math.round(it.pricePerBox / it.stripsPerBox) : 0;
    // لا نطمس تاريخ الفاتورة (OCR) إن وُجد؛ نملأ من آخر مُدخَل ثم المخزَّن فقط إن كان الحقل افتراضياً
    const wasDefault = !it?.expiry || it.expiry === DEFAULT_EXPIRY_MONTH;
    const medMonth = toMonthInput(lastEnteredExpiry[med.id]) || toMonthInput(expiryDates[med.id]);
    updateItem(itemId, {
      matchedMedicine: med,
      matchScore: 1,
      matchedByAlias: false,
      arabicName: med.nameAr,
      // باركود المخزون + تاريخ المادة (آخر مُدخَل/مخزَّن) عند غياب تاريخ الفاتورة
      ...(wasDefault && medMonth ? { expiry: medMonth } : {}),
      barcode: med.barcode || '',
      // عند الربط بدواء موجود، نعتمد أسعار بيعه الحالية كقيم افتراضية قابلة للتعديل
      retailPrice: med.price || Math.round(pricePerStrip * 1.25),
      officialPrice: med.secondaryPrice || Math.round(pricePerStrip * 1.35),
    });
    setSearchOpen(null);
    setSearchQuery('');
  };

  const clearMatch = (itemId: string) => {
    const it = items.find(x => x.id === itemId);
    // إلغاء المطابقة = تصحيح صريح: نمحو من الذاكرة ما كان يشير لهذا الدواء بهذه الأسماء،
    // حتى لا تتكرر المطابقة الخاطئة في الفواتير القادمة
    if (it?.matchedMedicine) onForgetAliases(aliasKeysOf(it), it.matchedMedicine.id);
    updateItem(itemId, { matchedMedicine: null, matchScore: 0, matchedByAlias: false });
  };

  // في فواتير «ساوة» تُدمج الشركة بنهاية الاسم — نزيلها من الاسم الإنكليزي المخزَّن
  // مع بقائها في حقلها المستقل، فيبقى اسم الدواء نظيفاً.
  const cleanEnglishName = (raw: string, company: string) => {
    let n = (raw || '').trim();
    const c = (company || '').trim();
    if (c && n.toLowerCase().endsWith(c.toLowerCase())) {
      n = n.slice(0, n.length - c.length).replace(/[\s*·\-–—]+$/, '').trim();
    }
    return n;
  };

  const handleConfirm = () => {
    // اعتماد الفاتورة بعد المراجعة = تأكيد ضمني لكل المطابقات الظاهرة:
    // نحفظها في الذاكرة فتُطابَق فوراً في الفواتير القادمة (المكرَّر يُهمَل في الأعلى)
    items.forEach(it => { if (it.matchedMedicine) learnItemAliases(it, it.matchedMedicine); });
    const draftItems: DraftItem[] = items
      .filter(it => it.quantityBoxes > 0 && it.pricePerBox > 0)
      .map(it => {
        const totalStrips = it.quantityBoxes * it.stripsPerBox;
        const pricePerStrip = Math.round(it.pricePerBox / it.stripsPerBox);
        const med = it.matchedMedicine;
        return {
          id: `draft-inv-${it.id}`,
          medicineId: med?.id,
          nameAr: med?.nameAr || it.arabicName || it.rawName,
          // الاسم الإنكليزي: نحترم المسجَّل في المخزون إن وُجد (لا يُستبدل بعد حفظه الأول)،
          // وإلا تصحيح المستخدم في بطاقة المراجعة، وإلا الاسم الخام من الفاتورة (بلا الشركة)
          nameEn: med?.nameEn || (it.nameEnOverride ?? cleanEnglishName(it.rawName, it.company)).trim(),
          // الشركة: المسجَّلة في المخزون إن وُجدت، وإلا المكتشفة من الفاتورة
          manufacturer: med?.manufacturer || it.company || '',
          // تصحيح المخزون: يُمرَّر فقط إن غيّره المستخدم فعلاً عن الرصيد الحالي للمادة المطابقة
          stockCorrection: (med && it.stockOverride !== undefined && it.stockOverride !== med.availableQuantity)
            ? it.stockOverride : undefined,
          scientificName: med?.scientificName || med?.activeIngredient || 'N/A',
          category: med?.category || 'مسكنات الألم',
          price: pricePerStrip,
          retailPrice: it.retailPrice || Math.round(pricePerStrip * 1.25),
          officialPrice: it.officialPrice || Math.round(pricePerStrip * 1.35),
          qty: totalStrips,
          // it.expiry بصيغة YYYY-MM بعد التهيئة → نُكمّلها إلى أول الشهر YYYY-MM-01
          expiryDate: it.expiry ? `${it.expiry}-01` : `${DEFAULT_EXPIRY_MONTH}-01`,
          // الباركود: باركود المخزون للمطابق، وإلا المُدخَل يدوياً للجديد، وإلا يُولَّد تلقائياً
          barcode: med?.barcode || (it.barcode || '').trim() || '62811' + Math.floor(Math.random() * 900000 + 100000),
          warehouse: extractedInvoice?.supplierName || it.company || '',
        };
      });
    onConfirm(draftItems, extractedInvoice?.supplierName || '');
  };

  const matchedCount = items.filter(it => it.matchedMedicine).length;
  const newCount = items.filter(it => !it.matchedMedicine).length;
  const validCount = items.filter(it => it.quantityBoxes > 0 && it.pricePerBox > 0).length;

  // صاحب باركود موجود مسبقاً في المخزون (للمنع لا الدمج): مادة جديدة أُدخل لها باركود مكرّر
  const barcodeOwner = (barcode: string): Medicine | null => {
    const b = (barcode || '').trim();
    if (!b) return null;
    return inventory.find(m => (m.barcode || '').trim() === b) || null;
  };
  // منع المتابعة إن كان أي صنف جديد يحمل باركوداً موجوداً لمادة أخرى
  const hasDuplicateBarcode = items.some(it => !it.matchedMedicine && !!barcodeOwner(it.barcode || ''));

  const filteredInventory = inventory.filter(m => {
    const q = searchQuery.toLowerCase();
    return m.nameAr.toLowerCase().includes(q) || m.nameEn.toLowerCase().includes(q);
  }).slice(0, 8);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* طبقة قارئ الباركود بالكاميرا (فوق كل شيء) */}
      {scanningItemId && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex flex-col items-center justify-center p-4" onClick={stopScan}>
          <div className="relative w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <video ref={videoRef} playsInline muted className="w-full rounded-2xl bg-black aspect-[3/4] object-cover" />
            {/* إطار استهداف */}
            <div className="absolute inset-8 border-2 border-emerald-400/80 rounded-2xl pointer-events-none" />
            <p className="text-center text-white text-xs font-bold mt-3">وجّه الكاميرا نحو الباركود…</p>
            {scanError && <p className="text-center text-rose-300 text-[11px] font-bold mt-2">{scanError}</p>}
            <button
              type="button"
              onClick={stopScan}
              className="mt-4 w-full bg-white/15 hover:bg-white/25 text-white rounded-xl py-2.5 text-xs font-extrabold transition cursor-pointer"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        className="relative bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-4xl max-h-[96vh] flex flex-col shadow-2xl"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="font-extrabold text-sm text-slate-900">استيراد فاتورة من صورة</h2>
            <p className="text-[10px] text-slate-400 font-bold mt-0.5">
              {step === 'key' && 'أدخل مفتاح Gemini API لتفعيل الميزة'}
              {step === 'upload' && 'ارفع صورة الفاتورة لاستخراج البيانات تلقائياً'}
              {step === 'processing' && 'جارٍ تحليل الفاتورة بالذكاء الاصطناعي...'}
              {step === 'review' && `${items.length} صنف مستخرج · ${matchedCount} مطابق · ${newCount} جديد`}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition cursor-pointer">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">

            {/* STEP: API Key */}
            {step === 'key' && (
              <motion.div key="key" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="p-6 space-y-5 max-w-md mx-auto">
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-right">
                  <div className="flex items-start gap-3">
                    <KeyRound className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-extrabold text-amber-900">مفتاح Gemini API مطلوب</p>
                      <p className="text-[10px] text-amber-700 mt-1 leading-relaxed font-medium">
                        هذه الميزة تستخدم Google Gemini لقراءة الفواتير. أدخل مفتاح API مرة واحدة وسيُحفظ على جهازك.
                        احصل على مفتاح مجاني من Google AI Studio.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-extrabold text-slate-600 block">مفتاح Gemini API</label>
                  <div className="relative">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={e => setApiKey(e.target.value)}
                      placeholder="AIzaSy... أو AQ...."
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 pr-10 text-xs font-mono text-slate-900 focus:outline-emerald-500 text-left"
                      dir="ltr"
                    />
                    <button type="button" onClick={() => setShowKey(s => !s)}
                      className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer">
                      {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <button
                  disabled={!apiKey.trim()}
                  onClick={() => { saveApiKey(apiKey); setStep('upload'); }}
                  className="w-full bg-emerald-600 text-white rounded-xl py-3 text-xs font-extrabold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-emerald-700 transition cursor-pointer"
                >
                  حفظ المفتاح والمتابعة
                </button>
              </motion.div>
            )}

            {/* STEP: Upload */}
            {step === 'upload' && (
              <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="p-6 space-y-4">
                {/* Drop zone */}
                <div
                  ref={dropRef}
                  onDrop={handleDrop}
                  onDragOver={e => e.preventDefault()}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-3 cursor-pointer transition
                    ${imageFile ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 hover:border-emerald-300 bg-slate-50 hover:bg-emerald-50/50'}`}
                  style={{ minHeight: 180 }}
                >
                  {imagePreview ? (
                    <img src={imagePreview} alt="فاتورة" className="max-h-44 rounded-xl object-contain shadow" />
                  ) : (
                    <>
                      <div className="w-14 h-14 bg-white rounded-2xl shadow-sm flex items-center justify-center border border-slate-200">
                        <FileImage className="w-7 h-7 text-slate-400" />
                      </div>
                      <div className="text-center">
                        <p className="text-xs font-extrabold text-slate-700">اسحب الصورة هنا أو انقر للاختيار</p>
                        <p className="text-[10px] text-slate-400 font-bold mt-1">JPG, PNG, WEBP — الحد الأقصى 10MB</p>
                      </div>
                    </>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFilePicked(f); }} />
                </div>

                {imageFile && (
                  <p className="text-[10px] text-emerald-700 font-bold text-center">
                    ✓ {imageFile.name}
                  </p>
                )}

                {error && (
                  <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-right">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-[10px] font-bold text-red-700">{error}</p>
                  </div>
                )}

                <div className="flex gap-2">
                  <button onClick={() => setStep('key')}
                    className="flex-none px-4 py-3 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer">
                    تغيير المفتاح
                  </button>
                  <button
                    disabled={!imageFile}
                    onClick={handleAnalyze}
                    className="flex-1 bg-emerald-600 text-white rounded-xl py-3 text-xs font-extrabold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-emerald-700 transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Upload className="w-4 h-4" />
                    تحليل الفاتورة بالذكاء الاصطناعي
                  </button>
                </div>
              </motion.div>
            )}

            {/* STEP: Processing */}
            {step === 'processing' && (
              <motion.div key="proc" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="p-10 flex flex-col items-center gap-5 text-center">
                <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center border-2 border-emerald-200">
                  <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
                </div>
                <div>
                  <p className="text-sm font-extrabold text-slate-900">جارٍ قراءة الفاتورة...</p>
                  <p className="text-[10px] text-slate-500 font-bold mt-1">يقوم Gemini بتحليل الصورة واستخراج الأدوية والأسعار</p>
                </div>
                <div className="flex gap-1.5 mt-2">
                  {[0, 1, 2].map(i => (
                    <motion.div key={i} className="w-2 h-2 bg-emerald-400 rounded-full"
                      animate={{ y: [0, -8, 0] }}
                      transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }} />
                  ))}
                </div>
              </motion.div>
            )}

            {/* STEP: Review */}
            {step === 'review' && (
              <motion.div key="review" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex flex-col">

                {/* لافتة الملخّص — اسم المورد يتصدّر، ورقم الفاتورة والتاريخ بيانات ثانوية هادئة */}
                {extractedInvoice?.supplierName && (
                  <div className="mx-4 sm:mx-5 mt-4 mb-2 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-1.5 text-right">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-slate-400 font-bold">المورد المكتشف</p>
                      <p className="text-sm font-extrabold text-slate-900 truncate">{extractedInvoice.supplierName}</p>
                    </div>
                    {extractedInvoice.invoiceNo && (
                      <div className="text-right">
                        <p className="text-[10px] text-slate-400 font-bold">رقم الفاتورة</p>
                        <p className="text-xs font-extrabold text-slate-700 font-mono">{extractedInvoice.invoiceNo}</p>
                      </div>
                    )}
                    {extractedInvoice.date && (
                      <div className="text-right">
                        <p className="text-[10px] text-slate-400 font-bold">التاريخ</p>
                        <p className="text-xs font-extrabold text-slate-700 font-mono">{extractedInvoice.date}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* صفّ الإحصاءات — أقراص مدمجة خفيفة بدل ثلاث بطاقات ضخمة */}
                <div className="mx-4 sm:mx-5 mb-3 flex items-center gap-2">
                  <span className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 bg-emerald-50 border border-emerald-100 rounded-full px-3.5 py-1.5">
                    <span className="text-xs font-extrabold text-emerald-700">{matchedCount}</span>
                    <span className="text-[10px] text-emerald-600 font-bold">مطابق</span>
                  </span>
                  <span className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 bg-amber-50 border border-amber-100 rounded-full px-3.5 py-1.5">
                    <span className="text-xs font-extrabold text-amber-700">{newCount}</span>
                    <span className="text-[10px] text-amber-600 font-bold">جديد</span>
                  </span>
                  <span className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 bg-slate-50 border border-slate-200 rounded-full px-3.5 py-1.5">
                    <span className="text-xs font-extrabold text-slate-700">{items.length}</span>
                    <span className="text-[10px] text-slate-500 font-bold">إجمالي</span>
                  </span>
                </div>

                {/* Items list */}
                <div className="px-4 sm:px-5 pb-3 space-y-2.5">
                  {items.map(item => {
                    const pricePerStrip = item.stripsPerBox > 0 ? Math.round(item.pricePerBox / item.stripsPerBox) : 0;
                    const totalStrips = item.quantityBoxes * item.stripsPerBox;
                    const badge = matchBadge(item.matchScore, !!item.matchedMedicine, item.matchedByAlias);
                    const isSearchingThis = searchOpen === item.id;

                    return (
                      <div key={item.id}
                        className={`bg-slate-50 border rounded-2xl p-3.5 space-y-2.5 text-right transition
                          ${item.matchedMedicine ? 'border-emerald-100' : 'border-amber-200'}`}>

                        {/* الصف الأول: الشارة على حافة القراءة (تصطفّ عمودياً عبر البطاقات) ثم الاسم، والحذف في الطرف البعيد */}
                        <div className="flex items-start gap-2.5">
                          <span className={`shrink-0 mt-0.5 text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${badge.cls}`}>
                            {badge.label}
                          </span>
                          <div className="flex-1 min-w-0">
                            <input
                              value={item.arabicName}
                              onChange={e => updateItem(item.id, { arabicName: e.target.value })}
                              className="w-full text-sm font-extrabold text-slate-900 bg-transparent border-b border-transparent focus:border-emerald-400 focus:outline-none pb-0.5"
                              placeholder="الاسم العربي"
                            />
                            {item.rawName !== item.arabicName && (
                              <p className="text-[10px] text-slate-400 font-mono truncate mt-0.5">{item.rawName}</p>
                            )}
                          </div>
                          <button onClick={() => removeItem(item.id)}
                            className="shrink-0 mt-0.5 p-1 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* كتلة التعريف الهادئة: الشركة + الاسم الإنكليزي — عمودان على الشاشات الواسعة */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 pr-1">
                          {/* الشركة المصنّعة (تُملأ في المخزون عند المطابقة إن كان الحقل فارغاً) */}
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-400 shrink-0">الشركة</span>
                            <input
                              value={item.company}
                              onChange={e => updateItem(item.id, { company: e.target.value })}
                              className="flex-1 min-w-0 text-[11px] font-bold text-slate-700 bg-transparent border-b border-slate-100 focus:border-emerald-400 focus:outline-none pb-0.5"
                              placeholder="اسم الشركة المصنّعة"
                            />
                          </div>

                          {/* الاسم الإنكليزي — المحفوظ في المخزون يُعرض فقط (يُعدَّل من شاشة المخزون)؛
                              وإن لم يكن للمادة اسم إنكليزي بعد، يُعرض اسم الفاتورة قابلاً للتصحيح
                              قبل حفظه الأول (يُحفظ مرة واحدة ولا يتغيّر في الفواتير القادمة) */}
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-400 shrink-0">الاسم الإنكليزي</span>
                            {item.matchedMedicine?.nameEn?.trim() ? (
                              <>
                                <p dir="ltr" className="flex-1 min-w-0 truncate text-left text-[11px] font-mono font-bold text-slate-500">
                                  {item.matchedMedicine.nameEn}
                                </p>
                                <span className="shrink-0 text-[10px] font-bold text-slate-400 bg-slate-100 border border-slate-200 rounded-full px-1.5 py-0.5"
                                  title="محفوظ من مطابقة سابقة — يُعدَّل من شاشة المخزون فقط">
                                  من المخزن
                                </span>
                              </>
                            ) : (
                              <>
                                <input
                                  dir="ltr"
                                  value={item.nameEnOverride ?? cleanEnglishName(item.rawName, item.company)}
                                  onChange={e => updateItem(item.id, { nameEnOverride: e.target.value })}
                                  className="flex-1 min-w-0 text-left text-[11px] font-mono font-bold text-slate-700 bg-transparent border-b border-slate-100 focus:border-emerald-400 focus:outline-none pb-0.5"
                                  placeholder="English name"
                                />
                                <span className="shrink-0 text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5"
                                  title="سيُحفظ مع المادة في المخزن عند الاعتماد — لأول مرة فقط، ولن يتغيّر في الفواتير القادمة">
                                  يُحفظ لأول مرة
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Row 2: medicine match */}
                        <div className="relative">
                          {item.matchedMedicine ? (
                            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span className="flex-1 text-[11px] font-extrabold text-emerald-800 truncate">
                                {item.matchedMedicine.nameAr}
                              </span>
                              <button onClick={() => clearMatch(item.id)}
                                className="text-slate-400 hover:text-rose-600 transition cursor-pointer">
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setSearchOpen(isSearchingThis ? null : item.id); setSearchQuery(''); }}
                              className="w-full flex items-center gap-2 bg-amber-50 border border-dashed border-amber-300 rounded-xl px-3 py-2 text-right cursor-pointer hover:border-amber-400 transition"
                            >
                              <Search className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              <span className="flex-1 text-[11px] font-bold text-amber-700 text-right">
                                ابحث لربطه بدواء موجود في المخزون
                              </span>
                              <ChevronDown className={`w-3 h-3 text-amber-600 transition ${isSearchingThis ? 'rotate-180' : ''}`} />
                            </button>
                          )}

                          {/* Dropdown search */}
                          <AnimatePresence>
                            {isSearchingThis && (
                              <motion.div
                                initial={{ opacity: 0, y: -4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -4 }}
                                className="absolute top-full right-0 left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-10 overflow-hidden"
                              >
                                <div className="p-2 border-b border-slate-100">
                                  <input
                                    autoFocus
                                    type="text"
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    placeholder="ابحث بالاسم..."
                                    className="w-full text-[11px] font-bold bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-emerald-400"
                                  />
                                </div>
                                <div className="max-h-40 overflow-y-auto">
                                  {(searchQuery ? filteredInventory : (() => {
                                    const { medicine } = matchToInventory(item.arabicName || item.rawName, inventory, item.rawName, aliases);
                                    const topMatches = inventory
                                      .map(m => ({ m, score: [m.nameAr, m.nameEn, m.scientificName].map(n => {
                                        const na = (n || '').toLowerCase(); const nb = (item.arabicName || item.rawName).toLowerCase();
                                        return na.includes(nb.slice(0, 4)) || nb.includes(na.slice(0, 4)) ? 0.6 : 0;
                                      }).reduce((a: number, b) => Math.max(a, b), 0) }))
                                      .filter(x => x.score > 0 || x.m.id === medicine?.id)
                                      .sort((a, b) => b.score - a.score)
                                      .slice(0, 6)
                                      .map(x => x.m);
                                    return topMatches.length ? topMatches : inventory.slice(0, 6);
                                  })()).map(med => (
                                    <button key={med.id} onClick={() => selectMedicine(item.id, med)}
                                      className="w-full px-3 py-2 hover:bg-emerald-50 text-right transition cursor-pointer">
                                      <p className="text-[11px] font-extrabold text-slate-900">{med.nameAr}</p>
                                      <p className="text-[10px] text-slate-400 font-mono">{med.nameEn}</p>
                                    </button>
                                  ))}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        {/* قسم الأرقام: الكمية والتكلفة — فاصل شعري هادئ بدل الصناديق الملوّنة.
                            الحقول البيضاء قابلة للتعديل، والقيمة المشتقّة (س/شريط) مظلَّلة */}
                        <div className="border-t border-slate-100 pt-2.5 grid grid-cols-4 gap-2">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 block text-center">علب</label>
                            <input type="number" min={1} value={item.quantityBoxes}
                              onChange={e => updateItem(item.id, { quantityBoxes: Math.max(1, Number(e.target.value)) })}
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-extrabold text-slate-900 text-center focus:outline-emerald-400" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 block text-center">شريط/علبة</label>
                            <input type="number" min={1} value={item.stripsPerBox}
                              onChange={e => updateItem(item.id, { stripsPerBox: Math.max(1, Number(e.target.value)) })}
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-extrabold text-slate-900 text-center focus:outline-emerald-400" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 block text-center">سعر/علبة</label>
                            <input type="number" min={0} value={item.pricePerBox}
                              onChange={e => updateItem(item.id, { pricePerBox: Math.max(0, Number(e.target.value)) })}
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-extrabold text-slate-900 text-center focus:outline-emerald-400" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-emerald-700 block text-center">س/شريط</label>
                            <div className="w-full bg-emerald-50 border border-emerald-100 rounded-lg px-2 py-1.5 text-xs font-extrabold text-emerald-700 text-center">
                              {pricePerStrip.toLocaleString()}
                            </div>
                          </div>
                        </div>

                        {/* الأسعار المرجعية من المخزن (للمطابق) — سطر هادئ بدل صندوق رمادي كامل */}
                        {item.matchedMedicine && (
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1">
                            <span className="text-[10px] font-bold text-slate-400">الأسعار الحالية في المخزن (للشريط):</span>
                            <span className="text-[10px] font-bold text-slate-500">
                              تكلفة سابقة{' '}
                              <span className="text-[11px] font-extrabold text-slate-700 font-mono">
                                {(item.matchedMedicine.costPrice ?? item.matchedMedicine.lastCostPrice)
                                  ? (item.matchedMedicine.costPrice ?? item.matchedMedicine.lastCostPrice)!.toLocaleString()
                                  : '—'}
                              </span>
                            </span>
                            <span className="text-[10px] font-bold text-slate-500">
                              جمهور{' '}
                              <span className="text-[11px] font-extrabold text-slate-700 font-mono">
                                {item.matchedMedicine.price ? item.matchedMedicine.price.toLocaleString() : '—'}
                              </span>
                            </span>
                            <span className="text-[10px] font-bold text-slate-500">
                              رسمي{' '}
                              <span className="text-[11px] font-extrabold text-slate-700 font-mono">
                                {item.matchedMedicine.secondaryPrice ? item.matchedMedicine.secondaryPrice.toLocaleString() : '—'}
                              </span>
                            </span>
                          </div>
                        )}

                        {/* أسعار البيع + تاريخ الانتهاء + إجمالي الأشرطة — صفّ واحد على الشاشات الواسعة.
                            لمسة لونية خفيفة تميّز سعر الجمهور (أزرق) عن الرسمي (بنفسجي) دون صراخ */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 block text-center">سعر البيع للجمهور (شريط)</label>
                            <input type="number" min={0} value={item.retailPrice}
                              onChange={e => updateItem(item.id, { retailPrice: Math.max(0, Number(e.target.value)) })}
                              className="w-full bg-blue-50/50 border border-blue-100 rounded-lg px-2 py-1.5 text-xs font-extrabold text-blue-700 text-center focus:outline-blue-400" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 block text-center">سعر البيع الرسمي (شريط)</label>
                            <input type="number" min={0} value={item.officialPrice}
                              onChange={e => updateItem(item.id, { officialPrice: Math.max(0, Number(e.target.value)) })}
                              className="w-full bg-violet-50/50 border border-violet-100 rounded-lg px-2 py-1.5 text-xs font-extrabold text-violet-700 text-center focus:outline-violet-400" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 block text-center">تاريخ الانتهاء (ص)</label>
                            <input
                              type="month"
                              value={item.expiry || ''}
                              onChange={e => updateItem(item.id, { expiry: e.target.value })}
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-extrabold text-slate-900 text-center focus:outline-emerald-400"
                              dir="ltr"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 block text-center">إجمالي الأشرطة</label>
                            <div className="w-full bg-slate-100/70 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-extrabold text-slate-700 text-center font-mono">
                              {totalStrips} شريط
                            </div>
                          </div>
                        </div>

                        {/* المخزون الحالي في المخزن (للمادة المطابقة فقط) — قابل للتعديل بالنقر المزدوج.
                            التصحيح يُعتمد كرصيد فعلي في المخزن عند تأكيد الاستيراد (تصحيح جرد). */}
                        {item.matchedMedicine && <div className="border-t border-slate-100 pt-2.5">{(() => {
                          const currentStock = item.stockOverride ?? item.matchedMedicine.availableQuantity;
                          const corrected = item.stockOverride !== undefined && item.stockOverride !== item.matchedMedicine.availableQuantity;
                          return editingStockId === item.id ? (
                            <div className="bg-white border border-slate-300 rounded-xl px-3 py-1.5 flex items-center justify-between gap-2">
                              <span className="text-[10px] text-slate-600 font-bold shrink-0">صحّح المخزون الفعلي</span>
                              <input
                                type="number"
                                min={0}
                                autoFocus
                                defaultValue={currentStock}
                                onBlur={e => {
                                  const v = Math.max(0, Math.round(Number(e.target.value)));
                                  updateItem(item.id, { stockOverride: Number.isFinite(v) ? v : currentStock });
                                  setEditingStockId(null);
                                }}
                                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingStockId(null); }}
                                className="w-24 bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-extrabold text-slate-900 text-center focus:outline-emerald-400"
                              />
                            </div>
                          ) : (
                            <div
                              onDoubleClick={() => setEditingStockId(item.id)}
                              title="انقر مرتين لتصحيح المخزون الفعلي"
                              className={`rounded-xl px-3 py-1.5 flex items-center justify-between cursor-pointer transition border ${corrected ? 'bg-amber-50 border-amber-200' : 'bg-slate-100/70 border-slate-200 hover:border-slate-300'}`}
                            >
                              <span className={`text-[10px] font-bold ${corrected ? 'text-amber-700' : 'text-slate-500'}`}>
                                المخزون الحالي في المخزن {corrected ? '(مُصحَّح ✎)' : '— انقر مرتين للتعديل'}
                              </span>
                              <span className={`text-xs font-extrabold font-mono ${corrected ? 'text-amber-800' : 'text-slate-700'}`}>
                                {corrected && (
                                  <span className="text-[10px] text-slate-400 line-through ml-1">{item.matchedMedicine.availableQuantity.toLocaleString()}</span>
                                )}
                                {currentStock.toLocaleString()} شريط
                              </span>
                            </div>
                          );
                        })()}</div>}

                        {/* باركود المادة الجديدة (لغير المطابقة فقط — يُولَّد تلقائياً إن تُرك فارغاً) */}
                        {!item.matchedMedicine && (() => {
                          const dupMed = barcodeOwner(item.barcode || '');
                          return (
                          <div className="border-t border-slate-100 pt-2.5 space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 block">باركود المادة الجديدة (اختياري)</label>
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                inputMode="numeric"
                                value={item.barcode || ''}
                                onChange={e => updateItem(item.id, { barcode: e.target.value })}
                                placeholder="امسح بالكاميرا أو اكتب الباركود — يُولَّد تلقائياً إن تُرك فارغاً"
                                className={`flex-1 min-w-0 bg-white border rounded-lg px-3 py-1.5 text-[11px] font-mono font-bold text-slate-900 text-center focus:outline-emerald-400 ${dupMed ? 'border-rose-400 bg-rose-50' : 'border-slate-200'}`}
                                dir="ltr"
                              />
                              <button
                                type="button"
                                onClick={() => startScan(item.id)}
                                title="قراءة الباركود بالكاميرا"
                                className="shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-3 py-1.5 flex items-center gap-1.5 text-[10px] font-bold transition cursor-pointer"
                              >
                                <Barcode className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">قارئ باركود</span>
                              </button>
                            </div>
                            {/* تنبيه الباركود المكرّر — منع لا دمج */}
                            {dupMed && (
                              <div className="flex items-start gap-1.5 bg-rose-50 border border-rose-100 rounded-lg px-2.5 py-1.5">
                                <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-px" />
                                <p className="text-[10px] font-extrabold text-rose-700 leading-snug">
                                  أقول لك المادة موجودة! هذا الباركود مُسجَّل مسبقاً للمادة «{dupMed.nameAr}» — غيّره أو اتركه فارغاً ليُولَّد تلقائياً.
                                </p>
                              </div>
                            )}
                          </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* Footer */}
        {step === 'review' && (
          <div className="p-4 border-t border-slate-100 shrink-0 bg-white rounded-b-3xl">
            <div className="flex items-center gap-3">
              <button onClick={() => { setStep('upload'); setImageFile(null); setImagePreview(''); }}
                className="flex-none px-4 py-3 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer">
                إعادة
              </button>
              <button
                disabled={validCount === 0 || hasDuplicateBarcode}
                onClick={handleConfirm}
                className="flex-1 bg-emerald-600 text-white rounded-xl py-3 text-xs font-extrabold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-emerald-700 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                إضافة {validCount} صنف إلى مسودة الشراء
              </button>
            </div>
            {hasDuplicateBarcode ? (
              <p className="text-[10px] text-rose-600 font-extrabold text-center mt-2">
                ⚠ يوجد باركود مكرّر لمادة موجودة — صحّحه أو اتركه فارغاً قبل المتابعة.
              </p>
            ) : newCount > 0 && (
              <p className="text-[10px] text-amber-600 font-bold text-center mt-2">
                {newCount} صنف جديد سيُضاف تلقائياً إلى المخزون عند اعتماد الشراء
              </p>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
