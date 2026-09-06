import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Upload, Loader2, CheckCircle2, AlertCircle, Search,
  ChevronDown, Trash2, FileImage, KeyRound, Eye, EyeOff, Barcode, Camera, Layers,
} from 'lucide-react';
import type { Medicine, ExtractedInvoiceItem, ExtractedInvoice, InvoiceImportDraft, Supplier, SupplierMemory, Order } from '../types';
import { fmtNum } from '../utils/format';
import { confirmDialog } from './ui/dialogs';
import SupplierPicker from './SupplierPicker';
import { extractInvoice, getStoredApiKey, saveApiKey, matchToInventory, normalizeName, getErrorMessage } from '../utils/invoiceExtractor';
import type { InvoiceAliasMap, StripsMemoryMap, InvoiceImage } from '../utils/invoiceExtractor';

interface DraftItem {
  id: string;
  medicineId?: string;
  nameAr: string;
  nameEn: string;
  manufacturer: string; // الشركة المصنّعة من الفاتورة — تُملأ في المخزون عند المطابقة إن كان الحقل فارغاً
  stockCorrection?: number; // تصحيح المخزون الحالي يدوياً (للمطابق) — يُعتمد كرصيد فعلي عند الاعتماد
  soldQty?: number; // «مباع»: كمية الرصيد الوهمي التي تُسجَّل فاتورة بيع عند الاعتماد (مع تصفير المخزون)
  scientificName: string;
  category: string;
  price: number;
  retailPrice: number;
  officialPrice: number;
  qty: number;          // إجمالي الأشرطة الداخلة للمخزون (المدفوع + البونص)
  bonusQty?: number;    // منها أشرطة البونص المجانية — للتوثيق في لقطة الطلبية
  expiryDate: string;
  barcode: string;
  warehouse: string;
}

interface Props {
  inventory: Medicine[];
  suppliers: Supplier[]; // الموردون المحفوظون — مصدر القائمة المنسدلة لاختيار المورد
  supplierMemory: Record<string, SupplierMemory>; // ذاكرة كل مورد (أمثلة مؤكَّدة + شركاته) — تُمرَّر للنموذج
  b2bOrders: Order[]; // الطلبيات السابقة — لكشف فاتورة أُدخلت من قبل بنفس الرقم
  expiryDates: Record<string, string>; // معرّف الدواء → تاريخ الانتهاء المخزَّن (الأبكر، للتنبيهات)
  lastEnteredExpiry: Record<string, string>; // معرّف الدواء → آخر تاريخ أدخله المستخدم (بديل عند خلو الفاتورة)
  aliases: InvoiceAliasMap; // ذاكرة المطابقات المُتعلَّمة: اسم الفاتورة المطبَّع → معرّف الدواء
  stripsMemory: StripsMemoryMap; // ذاكرة «شريط/علبة» المؤكَّدة: معرّف الدواء → العدد الذي اعتمده المستخدم سابقاً
  onLearnAliases: (pairs: Array<{ key: string; medicineId: string; label?: string }>) => void;
  onForgetAliases: (keys: string[], medicineId: string) => void; // تُنسى فقط إن كانت تشير لهذا الدواء
  onLearnStrips: (pairs: Array<{ medicineId: string; stripsPerBox: number }>) => void;
  initialDraft?: InvoiceImportDraft | null; // مسودة معلَّقة من جلسة/جهاز سابق — تُستعاد مباشرة في خطوة المراجعة
  onDraftChange: (draft: InvoiceImportDraft | null) => void; // يُبلَّغ به الأب فيكتبه (أو يمسحه) في السحابة
  onClose: () => void;
  // meta: رقم الفاتورة (يُحفظ مع الطلبية لكشف التكرار) + ما يُتعلَّم لذاكرة المورد
  onConfirm: (items: DraftItem[], supplierName: string, meta: ConfirmMeta) => void;
}

export interface ConfirmMeta {
  invoiceNo?: string;
  examples: { raw: string; ar: string }[];
  companies: string[];
  hasMoreQueued: boolean; // طابور الفواتير: بقيت فواتير أخرى — الأب لا يغلق النافذة
}

// تلميح المورد (بلا تعبئة تلقائية): مطابقة ضبابية بين اسم المورد المقروء من الصورة والموردين المحفوظين.
// كلمات عامة مثل «مذخر/شركة/للأدوية» لا تُحتسب حتى لا يتطابق كل مذخر مع كل مذخر.
const supNorm = (v: string) => v.toLowerCase()
  .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
  .replace(/[^\w؀-ۿ\s]/g, ' ').replace(/\s+/g, ' ').trim();
const SUP_STOPWORDS = new Set(['مذخر', 'مذاخر', 'شركه', 'مكتب', 'علمي', 'العلمي', 'للادويه', 'الادويه', 'ادويه', 'company', 'co', 'pharma', 'drug', 'drugs', 'store', 'stores', 'office', 'ltd', 'the', 'for', 'and']);
function suggestSupplier(ocrName: string, list: Supplier[]): Supplier | undefined {
  const q = supNorm(ocrName);
  if (!q) return undefined;
  const qWords = q.split(' ').filter(w => w.length >= 3 && !SUP_STOPWORDS.has(w));
  let best: Supplier | undefined;
  let bestScore = 0;
  for (const sp of list) {
    const n = supNorm(sp.name);
    if (!n) continue;
    let score = 0;
    if (n === q) score = 1;
    else if (n.includes(q) || q.includes(n)) score = 0.85;
    else {
      const nWords = n.split(' ').filter(w => w.length >= 3 && !SUP_STOPWORDS.has(w));
      const hits = qWords.filter(w => nWords.some(x => x.includes(w) || w.includes(x))).length;
      score = qWords.length ? hits / Math.max(qWords.length, nWords.length || 1) : 0;
    }
    if (score > bestScore) { bestScore = score; best = sp; }
  }
  return bestScore >= 0.5 ? best : undefined;
}

// تصغير صورة الفاتورة قبل الإرسال: صور الهاتف (8–12 ميغابايت) تُرسل خاماً فتبطئ الاستخراج وتكلّف
// أكثر بلا فائدة — عرض 1600 بكسل كافٍ تماماً لقراءة النص. نُخرج JPEG بجودة 0.85.
const MAX_IMAGE_EDGE = 1600;
async function downscaleImage(file: File): Promise<InvoiceImage> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error('تعذّرت قراءة ملف الصورة.'));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('تعذّر فكّ ترميز الصورة.'));
    i.src = dataUrl;
  });
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(img.width, img.height));
  if (scale >= 1 && file.size < 1.5 * 1024 * 1024) {
    return { base64: dataUrl.split(',')[1], mimeType: file.type };
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return { base64: dataUrl.split(',')[1], mimeType: file.type };
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const out = canvas.toDataURL('image/jpeg', 0.85);
  return { base64: out.split(',')[1], mimeType: 'image/jpeg' };
}

// انحراف سعر الجملة المقروء عن آخر تكلفة محفوظة للمادة — يكشف أخطاء قراءة الأرقام (14'765 مقابل 1'4765)
const PRICE_DEVIATION_LIMIT = 0.3;
function priceDeviation(pricePerStrip: number, med: Medicine | null): number | null {
  const ref = med ? (med.lastCostPrice || med.costPrice || 0) : 0;
  if (!ref || !pricePerStrip) return null;
  return (pricePerStrip - ref) / ref;
}

type Step = 'key' | 'upload' | 'processing' | 'review';

const DEFAULT_EXPIRY_MONTH = '2028-12';
// يوحّد أي تاريخ («2027/07» أو «2027-07-01») إلى صيغة إدخال الشهر YYYY-MM
function toMonthInput(s?: string): string {
  if (!s) return '';
  const m = s.replace(/\//g, '-').match(/(\d{4})-(\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}` : '';
}

function matchBadge(score: number, isMatched: boolean, byAlias?: boolean, byAI?: boolean) {
  if (!isMatched) return { label: 'جديد', cls: 'bg-amber-100 text-amber-700 border-amber-200' };
  if (byAlias) return { label: 'محفوظ ✓', cls: 'bg-violet-100 text-violet-700 border-violet-200' };
  if (byAI) return { label: 'حُسم ذكياً', cls: 'bg-sky-100 text-sky-700 border-sky-200' };
  if (score >= 0.8) return { label: 'تطابق', cls: 'bg-primary-100 text-primary-700 border-primary-200' };
  return { label: 'تقريبي', cls: 'bg-blue-100 text-blue-700 border-blue-200' };
}

export default function InvoiceImportModal({ inventory, suppliers, supplierMemory, b2bOrders, expiryDates, lastEnteredExpiry, aliases, stripsMemory, onLearnAliases, onForgetAliases, onLearnStrips, initialDraft, onDraftChange, onClose, onConfirm }: Props) {
  const initialKey = getStoredApiKey();
  // مسودة سحابية معلَّقة (فاتورة رُوجعت ولم تُضَف لمسودة الشراء بعد) — تُستعاد مباشرة في خطوة المراجعة
  const [step, setStep] = useState<Step>(initialDraft ? 'review' : (initialKey ? 'upload' : 'key'));
  const [apiKey, setApiKey] = useState(initialKey);
  const [showKey, setShowKey] = useState(false);
  // صور متعددة لفاتورة واحدة (الفواتير الطويلة تحتاج صفحتين أو أكثر) — تُرسل معاً في طلب واحد
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [progressMsg, setProgressMsg] = useState('');
  const [sortByConfidence, setSortByConfidence] = useState(false); // الأقل ثقة أولاً في المراجعة
  // طابور الفواتير: كل عنصر = صور فاتورة واحدة بانتظار التحليل بعد الحالية؛ batchDone = ما اعتُمد منها
  const [queue, setQueue] = useState<File[][]>([]);
  const [batchDone, setBatchDone] = useState(0);
  // كاميرا التصوير المباشر للفاتورة (مستقلة عن ماسح الباركود أدناه)
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const [extractedInvoice, setExtractedInvoice] = useState<ExtractedInvoice | null>(() =>
    initialDraft ? { supplierName: initialDraft.supplierName, invoiceNo: initialDraft.invoiceNo, date: initialDraft.date, items: [], totalAmount: initialDraft.totalAmount } : null
  );
  // إعادة ربط كل صنف بالدواء الفعلي من المخزون الحي عبر matchedMedicineId — لا نُجمِّد بيانات قديمة
  // المورد يختاره المستخدم من القائمة المنسدلة (أو يكتب اسماً جديداً) — لا يُلتقط من الصورة أبداً.
  // يُستعاد من المسودة السحابية فقط إن كان المستخدم قد اختاره سابقاً.
  const [supplierName, setSupplierName] = useState<string>(initialDraft?.supplierName || '');
  const [items, setItems] = useState<ExtractedInvoiceItem[]>(() =>
    initialDraft ? initialDraft.items.map(({ matchedMedicineId, ...rest }) => ({
      ...rest,
      matchedMedicine: inventory.find(m => m.id === matchedMedicineId) || null,
    })) : []
  );
  const [error, setError] = useState<string>('');
  const [searchOpen, setSearchOpen] = useState<string | null>(null); // item id
  const [searchQuery, setSearchQuery] = useState('');
  const [editingStockId, setEditingStockId] = useState<string | null>(null); // المخزون الحالي قيد التعديل (بالنقر المزدوج)
  const [expiryPickerId, setExpiryPickerId] = useState<string | null>(null); // منتقي شهر/سنة الانتهاء المفتوح (بطاقة واحدة كحد أقصى)
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
          applyBarcode(targetId, found[0].rawValue);
          active = false;
          stopScan();
          return;
        }
      } catch { /* إطار غير جاهز — نتجاهل ونعيد */ }
      if (active) raf = requestAnimationFrame(check);
    };
    raf = requestAnimationFrame(check);
    return () => { active = false; if (raf) cancelAnimationFrame(raf); };
    // applyBarcode يُعاد إنشاؤه في كل عرض؛ إضافته هنا تُعيد تشغيل التأثير (وتقطع بثّ الكاميرا)
    // عند أي إعادة رسم لا علاقة لها بالمسح — الاعتماد على targetId المُلتقَط أعلاه كافٍ وآمن.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanningItemId, scanStream, stopScan]);

  // إيقاف الكاميرا عند إغلاق النافذة
  useEffect(() => () => { scanStream?.getTracks().forEach(t => t.stop()); }, [scanStream]);

  // --- WRITE-BACK: مسودة المراجعة الحالية إلى السحابة (عبر onDraftChange الذي يكتبها الأب) ---
  // أي تعديل على الأصناف يُبلَّغ بعد نصف ثانية من التوقف عن التغيير. مغادرة خطوة المراجعة
  // أو تفريغ القائمة يُبلَّغ بـ null فتُمسَح المسودة السحابية تلقائياً —
  // بلا أي كود خاص في كل نقطة خروج ممكنة.
  useEffect(() => {
    const snapshot: InvoiceImportDraft | null = (step === 'review' && items.length > 0) ? {
      items: items.map(({ matchedMedicine, ...rest }) => ({
        ...rest,
        matchedMedicineId: matchedMedicine?.id ?? null,
      })),
      supplierName,
      invoiceNo: extractedInvoice?.invoiceNo,
      date: extractedInvoice?.date,
      totalAmount: extractedInvoice?.totalAmount,
    } : null;
    const t = setTimeout(() => onDraftChange(snapshot), 500);
    return () => clearTimeout(t);
  }, [step, items, extractedInvoice, supplierName, onDraftChange]);

  const handleFilesPicked = useCallback((files: FileList | File[]) => {
    const list = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (!list.length) {
      setError('يرجى اختيار ملف صورة فقط (JPG, PNG, WEBP)');
      return;
    }
    setError('');
    setImageFiles(prev => [...prev, ...list]);
    list.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => setImagePreviews(prev => [...prev, e.target?.result as string]);
      reader.readAsDataURL(file);
    });
  }, []);
  const removeImageAt = (idx: number) => {
    setImageFiles(prev => prev.filter((_, i) => i !== idx));
    setImagePreviews(prev => prev.filter((_, i) => i !== idx));
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) handleFilesPicked(e.dataTransfer.files);
  }, [handleFilesPicked]);

  // --- تصوير الفاتورة مباشرة بكاميرا الجهاز: معاينة حيّة + زر التقاط، وكل لقطة تُضاف كصفحة ---
  const openCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1920 } },
        audio: false,
      });
      setCameraStream(stream);
      setCameraOpen(true);
    } catch {
      setCameraError('تعذّر فتح الكاميرا — تحقّق من صلاحيات المتصفح، أو ارفع الصورة من المعرض.');
    }
  };
  const closeCamera = useCallback(() => {
    setCameraStream(prev => { prev?.getTracks().forEach(t => t.stop()); return null; });
    setCameraOpen(false);
  }, []);
  const capturePhoto = () => {
    const v = cameraVideoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')?.drawImage(v, 0, 0);
    c.toBlob(b => {
      if (b) handleFilesPicked([new File([b], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' })]);
    }, 'image/jpeg', 0.92);
  };
  useEffect(() => {
    if (cameraOpen && cameraStream && cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = cameraStream;
      cameraVideoRef.current.play().catch(() => setCameraError('فشل تشغيل عرض الكاميرا.'));
    }
  }, [cameraOpen, cameraStream]);
  useEffect(() => () => { cameraStream?.getTracks().forEach(t => t.stop()); }, [cameraStream]);

  // --- طابور الفواتير ---
  // «فاتورة أخرى»: الصور الحالية تُحفظ كفاتورة في الطابور وتُفرَّغ الساحة لفاتورة جديدة
  const pushCurrentToQueue = () => {
    if (!imageFiles.length) return;
    setQueue(q => [...q, imageFiles]);
    setImageFiles([]);
    setImagePreviews([]);
  };
  // بدء فاتورة (من الطابور): تُعرض صورها ويبدأ تحليلها فوراً
  const startInvoice = (files: File[]) => {
    setImageFiles(files);
    setImagePreviews([]);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => setImagePreviews(prev => [...prev, e.target?.result as string]);
      reader.readAsDataURL(file);
    });
    void handleAnalyze(files);
  };
  const batchTotal = batchDone + queue.length + (imageFiles.length ? 1 : 0);
  const batchPos = batchDone + 1;

  const handleAnalyze = async (filesOverride?: File[]) => {
    const files = filesOverride ?? imageFiles;
    if (!files.length || !apiKey.trim()) return;
    closeCamera();
    setStep('processing');
    setError('');
    try {
      setProgressMsg(files.length > 1 ? `جارٍ ضغط ${files.length} صور…` : 'جارٍ ضغط الصورة…');
      const imgs: InvoiceImage[] = [];
      for (const f of files) imgs.push(await downscaleImage(f));
      // ذاكرة المورد المختار مسبقاً (إن اختير في خطوة الرفع) تُلحَق بالطلب كأمثلة مؤكَّدة
      const chosenSupplier = suppliers.find(sp => sp.name === supplierName.trim());
      const mem = chosenSupplier ? supplierMemory[chosenSupplier.id] : null;
      const invoice = await extractInvoice(imgs, apiKey.trim(), inventory, {
        aliases, stripsMemory, supplierMemory: mem, onProgress: setProgressMsg,
      });
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
      setSortByConfidence(false);
      setStep('review');
    } catch (err: unknown) {
      const msg = getErrorMessage(err);
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
    // «شريط/علبة» المحفوظ لهذا الدواء من مراجعات سابقة — يحلّ محل تقدير Gemini فور الربط
    const memStrips = stripsMemory[med.id];
    updateItem(itemId, {
      matchedMedicine: med,
      matchScore: 1,
      matchedByAlias: false,
      arabicName: med.nameAr,
      // الشركة المصنّعة المسجَّلة في المخزون تحلّ محل تخمين OCR من الفاتورة عند الربط
      ...(med.manufacturer ? { company: med.manufacturer } : {}),
      ...(memStrips && memStrips > 0 ? { stripsPerBox: memStrips } : {}),
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

  const handleConfirm = (onlyMatched = false) => {
    // اعتماد الفاتورة بعد المراجعة = تأكيد ضمني لكل المطابقات الظاهرة:
    // نحفظها في الذاكرة فتُطابَق فوراً في الفواتير القادمة (المكرَّر يُهمَل في الأعلى)
    const source = onlyMatched ? items.filter(it => it.matchedMedicine) : items;
    items.forEach(it => { if (it.matchedMedicine) learnItemAliases(it, it.matchedMedicine); });
    // وكذلك «شريط/علبة» المعتمَد لكل مادة مطابَقة — تصحيح المستخدم (أو إقراره للتقدير)
    // يُحفَظ فتقرؤه الفواتير القادمة كما هو بدل إعادة التقدير
    onLearnStrips(
      items
        .filter(it => it.matchedMedicine && it.stripsPerBox > 0)
        .map(it => ({ medicineId: it.matchedMedicine!.id, stripsPerBox: it.stripsPerBox }))
    );
    const draftItems: DraftItem[] = source
      .filter(it => it.quantityBoxes > 0 && it.pricePerBox > 0)
      .map(it => {
        // البونص يدخل المخزون مجاناً: الأشرطة الكلية = (المدفوع + البونص) × شريط/علبة،
        // والتكلفة الفعلية للشريط = المبلغ المدفوع ÷ الأشرطة الكلية — فيَنخفض متوسط التكلفة تلقائياً
        // ويبقى إجمالي الفاتورة (المبلغ المدفوع) كما هو.
        const bonus = it.bonusBoxes || 0;
        const totalStrips = (it.quantityBoxes + bonus) * it.stripsPerBox;
        const pricePerStrip = Math.round((it.pricePerBox * it.quantityBoxes) / totalStrips);
        const med = it.matchedMedicine;
        return {
          id: `draft-inv-${it.id}`,
          medicineId: med?.id,
          // الاسم العربي: حقل المراجعة يعكس دائماً القيمة الحالية (يبدأ من اسم المخزون عند المطابقة
          // ويبقى كذلك ما لم يُعدَّل) — فتعديله هنا هو ما يُعتمد، لا الاسم القديم صامتاً.
          nameAr: it.arabicName || med?.nameAr || it.rawName,
          // الاسم الإنكليزي: تعديل المستخدم في بطاقة المراجعة (إن وُجد) هو المعتمد دائماً حتى لو كان
          // للمادة اسم محفوظ سابقاً؛ وإلا المحفوظ في المخزون، وإلا الاسم الخام من الفاتورة (بلا الشركة)
          nameEn: (it.nameEnOverride ?? (med?.nameEn || cleanEnglishName(it.rawName, it.company))).trim(),
          // الشركة: المسجَّلة في المخزون إن وُجدت، وإلا المكتشفة من الفاتورة
          manufacturer: med?.manufacturer || it.company || '',
          // تصحيح المخزون: يُمرَّر فقط إن غيّره المستخدم فعلاً عن الرصيد الحالي للمادة المطابقة
          stockCorrection: (med && it.stockOverride !== undefined && it.stockOverride !== med.availableQuantity)
            ? it.stockOverride : undefined,
          soldQty: (med && it.soldQty && it.soldQty > 0) ? it.soldQty : undefined,
          scientificName: med?.scientificName || med?.activeIngredient || 'N/A',
          category: med?.category || 'مسكنات الألم',
          price: pricePerStrip,
          retailPrice: it.retailPrice || Math.round(pricePerStrip * 1.25),
          officialPrice: it.officialPrice || Math.round(pricePerStrip * 1.35),
          qty: totalStrips,
          bonusQty: bonus > 0 ? bonus * it.stripsPerBox : undefined,
          // it.expiry بصيغة YYYY-MM بعد التهيئة → نُكمّلها إلى أول الشهر YYYY-MM-01
          expiryDate: it.expiry ? `${it.expiry}-01` : `${DEFAULT_EXPIRY_MONTH}-01`,
          // الباركود: باركود المخزون للمطابق، وإلا المُدخَل يدوياً للجديد، وإلا يُولَّد تلقائياً
          barcode: med?.barcode || (it.barcode || '').trim() || '62811' + Math.floor(Math.random() * 900000 + 100000),
          warehouse: supplierName || it.company || '',
        };
      });
    // ذاكرة المورد: أمثلة (اسم الفاتورة → اسم المخزون المعتمد) + الشركات — تُدمج في Dashboard
    const examples = items
      .filter(it => it.matchedMedicine && it.rawName.trim())
      .map(it => ({ raw: it.rawName.trim(), ar: it.matchedMedicine!.nameAr }));
    const companies = Array.from(new Set(items.map(it => (it.company || '').trim()).filter(Boolean)));
    const hasMore = queue.length > 0;
    onConfirm(draftItems, supplierName.trim(), { invoiceNo: extractedInvoice?.invoiceNo, examples, companies, hasMoreQueued: hasMore });
    if (hasMore) {
      // الفاتورة التالية من الطابور: تُحلَّل فوراً وتبقى النافذة مفتوحة (المورد المختار يبقى — غالباً الدفعة من مورد واحد)
      const [next, ...rest] = queue;
      setQueue(rest);
      setBatchDone(d => d + 1);
      setItems([]);
      setExtractedInvoice(null);
      startInvoice(next);
    }
  };

  const matchedCount = items.filter(it => it.matchedMedicine).length;
  const newCount = items.filter(it => !it.matchedMedicine).length;
  const validCount = items.filter(it => it.quantityBoxes > 0 && it.pricePerBox > 0).length;
  const matchedValidCount = items.filter(it => it.matchedMedicine && it.quantityBoxes > 0 && it.pricePerBox > 0).length;

  // مطابقة الإجمالي: مجموع الأسطر مقابل إجمالي الفاتورة المقروء — فرق يعني سطراً ضائعاً أو رقماً خاطئاً
  const linesTotal = items.reduce((sum, it) => sum + it.quantityBoxes * it.pricePerBox, 0);
  const invoiceTotal = extractedInvoice?.totalAmount || 0;
  const totalDiff = invoiceTotal > 0 && linesTotal > 0 ? linesTotal - invoiceTotal : 0;
  const totalMismatch = Math.abs(totalDiff) > Math.max(250, invoiceTotal * 0.01);

  // فاتورة مكرّرة: نفس رقم الفاتورة سبق اعتماده في طلبية سابقة (للمورد نفسه إن كان معروفاً)
  const invoiceNo = (extractedInvoice?.invoiceNo || '').trim();
  const duplicateOrder = invoiceNo
    ? b2bOrders.find(o => (o.invoiceNo || '').trim() === invoiceNo
        && (!supplierName.trim() || !o.supplierName || o.supplierName === supplierName.trim()))
    : undefined;

  // انحرافات السعر: عدد الأسطر التي يختلف سعرها عن آخر شراء بأكثر من الحد
  const deviationCount = items.filter(it => {
    const pps = it.stripsPerBox > 0 ? Math.round(it.pricePerBox / it.stripsPerBox) : 0;
    const d = priceDeviation(pps, it.matchedMedicine);
    return d !== null && Math.abs(d) > PRICE_DEVIATION_LIMIT;
  }).length;

  // التكلفة الفعلية للشريط (بعد البونص) — نفس معادلة الاعتماد
  const effectiveCostPerStrip = (it: ExtractedInvoiceItem) => {
    const total = (it.quantityBoxes + (it.bonusBoxes || 0)) * it.stripsPerBox;
    return total > 0 ? Math.round((it.pricePerBox * it.quantityBoxes) / total) : 0;
  };
  // بيع بخسارة: سعر البيع للجمهور (شريط) أقل من التكلفة الفعلية للشريط
  const isSellingAtLoss = (it: ExtractedInvoiceItem) => {
    const cost = effectiveCostPerStrip(it);
    return cost > 0 && it.retailPrice > 0 && it.retailPrice < cost;
  };
  const lossCount = items.filter(isSellingAtLoss).length;
  const uncertainCount = items.filter(it => it.uncertain).length;

  // ترتيب المراجعة: الأقل ثقة أولاً (غير واضح ← جديد ← ضبابي ← حُسم ذكياً ← تطابق ← محفوظ) — الترتيب الأصلي عند الإيقاف
  const confidenceRank = (it: ExtractedInvoiceItem) =>
    it.uncertain ? -1 : !it.matchedMedicine ? 0 : it.matchedByAlias ? 4 : it.matchedByAI ? 2 : it.matchScore >= 0.8 ? 3 : 1;
  const visibleItems = sortByConfidence ? [...items].sort((a, b) => confidenceRank(a) - confidenceRank(b)) : items;
  const removeUnmatched = async () => {
    if (!newCount) return;
    if (!(await confirmDialog({ title: `حذف ${newCount} صنف غير مطابق من هذه الفاتورة؟`, confirmText: 'حذف', danger: true }))) return;
    setItems(prev => prev.filter(it => it.matchedMedicine));
  };

  // صاحب باركود موجود مسبقاً في المخزون — الباركود مطابقة مؤكَّدة 100%، أوثق من تطابق الاسم الضبابي
  const barcodeOwner = (barcode: string): Medicine | null => {
    const b = (barcode || '').trim();
    if (!b) return null;
    return inventory.find(m => (m.barcode || '').trim() === b) || null;
  };
  // إدخال/مسح باركود لمادة «جديدة» يتبيّن أنه مسجَّل فعلاً لدواء في المخزون: نربطها به تلقائياً
  // (نفس أثر اختياره يدوياً من مربّع البحث) بدل تركها «جديدة» خلف تحذير يُبقيها عالقة.
  const applyBarcode = (itemId: string, barcode: string) => {
    const owner = barcodeOwner(barcode);
    if (owner) selectMedicine(itemId, owner);
    else updateItem(itemId, { barcode });
  };
  // شبكة أمان: صنف بقي بلا مطابقة وباركوده مع ذلك مسجَّل لمادة أخرى (مثلاً بعد إلغاء ربطه يدوياً)
  const hasDuplicateBarcode = items.some(it => !it.matchedMedicine && !!barcodeOwner(it.barcode || ''));

  const filteredInventory = inventory.filter(m => {
    const q = searchQuery.toLowerCase();
    return m.nameAr.toLowerCase().includes(q) || m.nameEn.toLowerCase().includes(q);
  }).slice(0, 8);

  return (
    <div className="fixed inset-y-0 left-0 z-50 flex max-w-full">
      {/* Backdrop — أخف من نافذة منبثقة عادية ومن دون تشويش، يُبقي صفحة الشراء ظاهرة خلفه
          فتبدو اللوحة امتداداً لنفس الشاشة بدل نافذة منفصلة */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/20"
        onClick={onClose}
      />

      {/* طبقة قارئ الباركود بالكاميرا (فوق كل شيء) */}
      {scanningItemId && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex flex-col items-center justify-center p-4" onClick={stopScan}>
          <div className="relative w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <video ref={videoRef} playsInline muted className="w-full rounded-2xl bg-black aspect-[3/4] object-cover" />
            {/* إطار استهداف */}
            <div className="absolute inset-8 border-2 border-primary-400/80 rounded-2xl pointer-events-none" />
            <p className="text-center text-white text-xs font-bold mt-3">وجّه الكاميرا نحو الباركود…</p>
            {scanError && <p className="text-center text-rose-300 text-sm font-bold mt-2">{scanError}</p>}
            <button
              type="button"
              onClick={stopScan}
              className="mt-4 w-full bg-white/15 hover:bg-white/25 text-white rounded-xl py-2.5 text-xs font-semibold transition cursor-pointer"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}

      <motion.div
        initial={{ x: '-100%' }}
        animate={{ x: 0 }}
        exit={{ x: '-100%' }}
        transition={{ type: 'tween', duration: 0.25, ease: 'easeOut' }}
        className="relative bg-white w-full sm:w-[600px] lg:w-[760px] h-full flex flex-col shadow-2xl rounded-r-3xl"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="font-semibold text-sm text-slate-900">استيراد فاتورة من صورة</h2>
            <p className="text-sm text-slate-500 font-bold mt-0.5">
              {step === 'key' && 'أدخل مفتاح Gemini API لتفعيل الميزة'}
              {batchTotal > 1 && step !== 'key' && <span className="text-violet-700">فاتورة {batchPos} من {batchTotal} · </span>}
              {step === 'upload' && 'ارفع صورة الفاتورة أو صوّرها مباشرة لاستخراج البيانات تلقائياً'}
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
                      <p className="text-xs font-semibold text-amber-900">مفتاح Gemini API مطلوب</p>
                      <p className="text-sm text-amber-700 mt-1 leading-relaxed font-medium">
                        هذه الميزة تستخدم Google Gemini لقراءة الفواتير. أدخل مفتاح API مرة واحدة وسيُحفظ على جهازك.
                        احصل على مفتاح مجاني من Google AI Studio.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-600 block">مفتاح Gemini API</label>
                  <div className="relative">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={e => setApiKey(e.target.value)}
                      placeholder="AIzaSy... أو AQ...."
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 pr-10 text-xs tabular-nums text-slate-900 focus:outline-primary-500 text-left"
                      dir="ltr"
                    />
                    <button type="button" onClick={() => setShowKey(s => !s)}
                      className="absolute inset-y-0 right-3 flex items-center text-slate-500 hover:text-slate-600 cursor-pointer">
                      {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <button
                  disabled={!apiKey.trim()}
                  onClick={() => { saveApiKey(apiKey); setStep('upload'); }}
                  className="w-full bg-primary-600 text-white rounded-xl py-3 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary-700 transition cursor-pointer"
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
                  className={`border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-3 cursor-pointer transition p-3
                    ${imageFiles.length ? 'border-primary-400 bg-primary-50' : 'border-slate-200 hover:border-primary-300 bg-slate-50 hover:bg-primary-50/50'}`}
                  style={{ minHeight: 180 }}
                >
                  {imagePreviews.length ? (
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      {imagePreviews.map((src, i) => (
                        <div key={i} className="relative">
                          <img src={src} alt={`صفحة ${i + 1}`} className="h-36 rounded-xl object-contain shadow bg-white" />
                          <span className="absolute top-1 right-1 text-xs font-bold bg-slate-900/70 text-white rounded-full px-1.5 py-0.5">{i + 1}</span>
                          <button type="button" title="إزالة هذه الصورة"
                            onClick={e => { e.stopPropagation(); removeImageAt(i); }}
                            className="absolute top-1 left-1 w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center cursor-pointer hover:bg-rose-700">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      <div className="h-36 w-24 rounded-xl border-2 border-dashed border-primary-300 flex flex-col items-center justify-center text-primary-700 text-sm font-semibold gap-1">
                        <FileImage className="w-5 h-5" />
                        + صفحة أخرى
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="w-14 h-14 bg-white rounded-2xl shadow-sm flex items-center justify-center border border-slate-200">
                        <FileImage className="w-7 h-7 text-slate-500" />
                      </div>
                      <div className="text-center">
                        <p className="text-xs font-semibold text-slate-700">اسحب الصورة هنا أو انقر للاختيار</p>
                        <p className="text-sm text-slate-500 font-bold mt-1">JPG, PNG, WEBP — يمكن اختيار عدة صور لفاتورة طويلة (تُضغط تلقائياً قبل الإرسال)</p>
                      </div>
                    </>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
                    onChange={e => { if (e.target.files?.length) handleFilesPicked(e.target.files); e.target.value = ''; }} />
                </div>

                {imageFiles.length > 0 && (
                  <p className="text-sm text-primary-700 font-bold text-center">
                    ✓ {imageFiles.length === 1 ? imageFiles[0].name : `${imageFiles.length} صور — صفحات متتابعة لفاتورة واحدة`}
                  </p>
                )}

                {/* الكاميرا المباشرة: معاينة حيّة داخل النافذة، كل التقاط يُضاف كصفحة للفاتورة الحالية */}
                {cameraOpen && (
                  <div className="bg-slate-900 rounded-2xl p-3 space-y-2">
                    <video ref={cameraVideoRef} playsInline muted className="w-full max-h-72 rounded-xl object-contain bg-black" />
                    <div className="flex items-center justify-between gap-2">
                      <button type="button" onClick={closeCamera}
                        className="px-3 py-2 rounded-xl bg-slate-700 text-slate-200 text-sm font-semibold hover:bg-slate-600 transition cursor-pointer">
                        إغلاق الكاميرا
                      </button>
                      <button type="button" onClick={capturePhoto}
                        className="flex-1 py-3 rounded-xl bg-primary-500 hover:bg-primary-400 text-white text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer">
                        <Camera className="w-4 h-4" />
                        التقاط {imageFiles.length > 0 ? `صفحة ${imageFiles.length + 1}` : 'الفاتورة'}
                      </button>
                    </div>
                    <p className="text-sm text-slate-500 font-bold text-center">ثبّت الهاتف فوق الفاتورة كاملةً بإضاءة جيدة، ثم التقط. صفحة ثانية؟ التقط مرة أخرى.</p>
                  </div>
                )}
                {cameraError && (
                  <p className="text-sm font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 text-right">{cameraError}</p>
                )}
                {!cameraOpen && (
                  <button type="button" onClick={openCamera}
                    className="w-full py-3 rounded-xl border-2 border-primary-300 bg-primary-50 text-primary-800 text-xs font-semibold flex items-center justify-center gap-2 hover:bg-primary-100 transition cursor-pointer">
                    <Camera className="w-4 h-4" />
                    تصوير الفاتورة بالكاميرا مباشرة
                  </button>
                )}

                {/* طابور الفواتير: فواتير محفوظة بانتظار التحليل واحدة تلو الأخرى، كل واحدة بمراجعتها */}
                {(queue.length > 0 || imageFiles.length > 0) && (
                  <div className={`rounded-xl p-3 space-y-1.5 border ${queue.length ? 'bg-violet-50 border-violet-200' : 'bg-slate-50 border-slate-200'}`}>
                    {queue.length > 0 && (
                      <>
                        <p className="text-sm font-semibold text-violet-800 flex items-center gap-1.5"><Layers className="w-3.5 h-3.5" /> طابور الفواتير: {queue.length} فاتورة محفوظة{imageFiles.length ? ' + الحالية' : ''}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {queue.map((files, i) => (
                            <span key={i} className="inline-flex items-center gap-1 bg-white border border-violet-200 rounded-full px-2 py-0.5 text-sm font-bold text-violet-700">
                              فاتورة {batchDone + i + 1}: {files.length} {files.length === 1 ? 'صورة' : 'صور'}
                              <button type="button" title="إزالة من الطابور" onClick={() => setQueue(q => q.filter((_, j) => j !== i))}
                                className="text-violet-400 hover:text-rose-600 cursor-pointer"><X className="w-3 h-3" /></button>
                            </span>
                          ))}
                        </div>
                      </>
                    )}
                    {imageFiles.length > 0 && (
                      <button type="button" onClick={pushCurrentToQueue}
                        className="w-full py-2 rounded-lg border border-violet-300 bg-white text-violet-800 text-sm font-semibold hover:bg-violet-100 transition cursor-pointer">
                        + حفظ هذه الفاتورة في الطابور وتصوير فاتورة أخرى
                      </button>
                    )}
                    {queue.length > 0 && (
                      <p className="text-xs text-violet-600 font-bold">تُحلَّل بالتتابع وتُراجَع كل واحدة على حدة، وتُضاف كلها إلى مسودة الشراء نفسها.</p>
                    )}
                  </div>
                )}

                {/* اختيار المورد قبل التحليل (اختياري): يُلحق أمثلته المؤكَّدة من فواتيره السابقة بالطلب
                    فترتفع دقة الترجمة والشركات، ويُملأ حقل المورد في المراجعة تلقائياً */}
                <div className="space-y-1">
                  <label className="block text-sm font-semibold text-slate-600">المورد (اختياري — يحسّن الدقة إن اختير)</label>
                  <SupplierPicker suppliers={suppliers} value={supplierName} onChange={setSupplierName} />
                  {(() => {
                    const sp = suppliers.find(x => x.name === supplierName.trim());
                    const mem = sp ? supplierMemory[sp.id] : undefined;
                    return mem && mem.examples.length > 0 ? (
                      <p className="text-sm text-violet-700 font-bold">✓ ذاكرة هذا المورد: {mem.examples.length} مثال مؤكَّد و{mem.companies.length} شركة ستُرفق مع الطلب</p>
                    ) : null;
                  })()}
                </div>

                {error && (
                  <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-right">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-sm font-bold text-red-700">{error}</p>
                  </div>
                )}

                <div className="flex gap-2">
                  <button onClick={() => setStep('key')}
                    className="flex-none px-4 py-3 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer">
                    تغيير المفتاح
                  </button>
                  <button
                    disabled={!imageFiles.length && !queue.length}
                    onClick={() => {
                      // الطابور أولاً بترتيب الحفظ، ثم الفاتورة الحالية — كل فاتورة تُحلَّل ثم تُراجَع ثم التالية
                      const batch = [...queue, ...(imageFiles.length ? [imageFiles] : [])];
                      if (!batch.length) return;
                      setQueue(batch.slice(1));
                      setBatchDone(0);
                      startInvoice(batch[0]);
                    }}
                    className="flex-1 bg-primary-600 text-white rounded-xl py-3 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary-700 transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Upload className="w-4 h-4" />
                    {queue.length + (imageFiles.length ? 1 : 0) > 1
                      ? `تحليل ${queue.length + (imageFiles.length ? 1 : 0)} فواتير بالتتابع`
                      : 'تحليل الفاتورة بالذكاء الاصطناعي'}
                  </button>
                </div>
              </motion.div>
            )}

            {/* STEP: Processing */}
            {step === 'processing' && (
              <motion.div key="proc" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="p-10 flex flex-col items-center gap-5 text-center">
                <div className="w-16 h-16 bg-primary-50 rounded-full flex items-center justify-center border-2 border-primary-200">
                  <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{progressMsg || 'جارٍ قراءة الفاتورة...'}</p>
                  <p className="text-sm text-slate-500 font-bold mt-1">يقوم Gemini بتحليل الصورة واستخراج الأدوية والأسعار</p>
                </div>
                <div className="flex gap-1.5 mt-2">
                  {[0, 1, 2].map(i => (
                    <motion.div key={i} className="w-2 h-2 bg-primary-400 rounded-full"
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

                {/* لافتة الملخّص — المورد يُختار يدوياً من الموردين المحفوظين (لا يُلتقط من الصورة)،
                    ورقم الفاتورة والتاريخ بيانات ثانوية هادئة */}
                <div className="mx-4 sm:mx-5 mt-4 mb-2 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 flex flex-wrap items-start gap-x-6 gap-y-1.5 text-right">
                  <div className="flex-1 min-w-[200px]">
                    <p className="text-sm text-slate-500 font-bold mb-1">المورد / المذخر</p>
                    <SupplierPicker suppliers={suppliers} value={supplierName} onChange={setSupplierName} />
                    {/* تلميح المورد بلا تعبئة تلقائية: الاسم المقروء من الصورة يُقترح بنقرة، لا يُلتقط بصمت */}
                    {!supplierName.trim() && (extractedInvoice?.supplierName || '').trim() && (() => {
                      const ocr = (extractedInvoice?.supplierName || '').trim();
                      const sug = suggestSupplier(ocr, suppliers);
                      return sug ? (
                        <button type="button" onClick={() => setSupplierName(sug.name)}
                          className="mt-1.5 text-sm font-semibold text-violet-700 bg-violet-50 border border-violet-200 rounded-lg px-2 py-1 hover:bg-violet-100 transition cursor-pointer text-right">
                          يبدو أن الفاتورة من «{sug.name}» — اختره بنقرة
                        </button>
                      ) : (
                        <button type="button" onClick={() => setSupplierName(ocr)}
                          className="mt-1.5 text-sm font-semibold text-slate-600 bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 hover:bg-slate-200 transition cursor-pointer text-right">
                          المورد المكتوب في الفاتورة: «{ocr}» — غير محفوظ، إضافته كمورد جديد؟
                        </button>
                      );
                    })()}
                  </div>
                  {extractedInvoice?.invoiceNo && (
                    <div className="text-right">
                      <p className="text-sm text-slate-500 font-bold">رقم الفاتورة</p>
                      <p className="text-xs font-semibold text-slate-700 tabular-nums">{extractedInvoice.invoiceNo}</p>
                    </div>
                  )}
                  {extractedInvoice?.date && (
                    <div className="text-right">
                      <p className="text-sm text-slate-500 font-bold">التاريخ</p>
                      <p className="text-xs font-semibold text-slate-700 tabular-nums">{extractedInvoice.date}</p>
                    </div>
                  )}
                </div>

                {/* تنبيهات ما قبل الاعتماد: فاتورة مكرّرة / إجمالي لا يطابق / انحرافات سعر */}
                {duplicateOrder && (
                  <div className="mx-4 sm:mx-5 mb-2 bg-rose-50 border border-rose-300 rounded-2xl px-4 py-2.5 flex items-start gap-2 text-right">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <p className="text-sm font-semibold text-rose-800 leading-snug">
                      فاتورة مكرّرة؟ الرقم «{invoiceNo}» سبق اعتماده بتاريخ {duplicateOrder.date}
                      {duplicateOrder.supplierName ? ` للمورد «${duplicateOrder.supplierName}»` : ''} بقيمة {fmtNum(duplicateOrder.totalAmount)} د.ع.
                    </p>
                  </div>
                )}
                {totalMismatch && (
                  <div className="mx-4 sm:mx-5 mb-2 bg-rose-50 border border-rose-200 rounded-2xl px-4 py-2.5 flex items-start gap-2 text-right">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <p className="text-sm font-semibold text-rose-700 leading-snug">
                      مجموع الأسطر {fmtNum(linesTotal)} ≠ إجمالي الفاتورة {fmtNum(invoiceTotal)} د.ع
                      (فرق {totalDiff > 0 ? '+' : ''}{fmtNum(totalDiff)}) — قد يكون سطر ضائع أو رقم مقروء خطأً.
                    </p>
                  </div>
                )}
                {lossCount > 0 && (
                  <div className="mx-4 sm:mx-5 mb-2 bg-rose-50 border border-rose-300 rounded-2xl px-4 py-2.5 flex items-start gap-2 text-right">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <p className="text-sm font-semibold text-rose-800 leading-snug">
                      بيع بخسارة: {lossCount} سطر سعر بيعه للجمهور أقل من تكلفة الشريط الجديدة — راجع الأسعار المعلَّمة بالأحمر.
                    </p>
                  </div>
                )}
                {uncertainCount > 0 && (
                  <div className="mx-4 sm:mx-5 mb-2 bg-rose-50 border border-rose-200 rounded-2xl px-4 py-2 flex items-start gap-2 text-right">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <p className="text-sm font-semibold text-rose-700 leading-snug">
                      {uncertainCount} سطر علّمه النموذج «غير واضح» (رقم أو اسم قُرئ بصعوبة) — قارنه بالصورة قبل الاعتماد.
                    </p>
                  </div>
                )}
                {deviationCount > 0 && (
                  <div className="mx-4 sm:mx-5 mb-2 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-2 flex items-start gap-2 text-right">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-sm font-semibold text-amber-800 leading-snug">
                      {deviationCount} سطر سعره يختلف عن آخر شراء بأكثر من {Math.round(PRICE_DEVIATION_LIMIT * 100)}% — راجع الأرقام المعلَّمة بالبرتقالي.
                    </p>
                  </div>
                )}

                {/* صفّ الإحصاءات — أقراص مدمجة خفيفة بدل ثلاث بطاقات ضخمة + إجراءات جماعية */}
                <div className="mx-4 sm:mx-5 mb-3 flex items-center gap-2 flex-wrap">
                  <span className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 bg-primary-50 border border-primary-100 rounded-full px-3.5 py-1.5">
                    <span className="text-xs font-semibold text-primary-700">{matchedCount}</span>
                    <span className="text-sm text-primary-600 font-bold">مطابق</span>
                  </span>
                  <span className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 bg-amber-50 border border-amber-100 rounded-full px-3.5 py-1.5">
                    <span className="text-xs font-semibold text-amber-700">{newCount}</span>
                    <span className="text-sm text-amber-600 font-bold">جديد</span>
                  </span>
                  <span className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 bg-slate-50 border border-slate-200 rounded-full px-3.5 py-1.5">
                    <span className="text-xs font-semibold text-slate-700">{items.length}</span>
                    <span className="text-sm text-slate-500 font-bold">إجمالي</span>
                  </span>
                  <span className="flex-1" />
                  <button type="button" onClick={() => setSortByConfidence(v => !v)}
                    className={`text-sm font-semibold px-3 py-1.5 rounded-full border transition cursor-pointer ${sortByConfidence ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}
                    title="عرض الأصناف الأقل ثقة أولاً لتبدأ المراجعة بالمشكوك فيه">
                    {sortByConfidence ? '✓ الأقل ثقة أولاً' : 'ترتيب: الأقل ثقة أولاً'}
                  </button>
                  {newCount > 0 && (
                    <button type="button" onClick={removeUnmatched}
                      className="text-sm font-semibold px-3 py-1.5 rounded-full border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 transition cursor-pointer"
                      title="حذف كل الأصناف غير المطابقة من هذه الفاتورة">
                      حذف غير المطابق ({newCount})
                    </button>
                  )}
                </div>

                {/* Items list */}
                <div className="px-4 sm:px-5 pb-3 space-y-2.5">
                  {visibleItems.map(item => {
                    const pricePerStrip = item.stripsPerBox > 0 ? Math.round(item.pricePerBox / item.stripsPerBox) : 0;
                    const bonus = item.bonusBoxes || 0;
                    const totalStrips = (item.quantityBoxes + bonus) * item.stripsPerBox;
                    // التكلفة الفعلية للشريط بعد البونص (المبلغ المدفوع ÷ كل الأشرطة) — تُعرض حين يوجد بونص
                    const effectivePerStrip = totalStrips > 0 ? Math.round((item.pricePerBox * item.quantityBoxes) / totalStrips) : pricePerStrip;
                    const zeroPriceLine = item.pricePerBox === 0 && item.quantityBoxes > 0;
                    const sellLoss = isSellingAtLoss(item);
                    const badge = matchBadge(item.matchScore, !!item.matchedMedicine, item.matchedByAlias, item.matchedByAI);
                    const deviation = priceDeviation(pricePerStrip, item.matchedMedicine);
                    const deviates = deviation !== null && Math.abs(deviation) > PRICE_DEVIATION_LIMIT;
                    const isSearchingThis = searchOpen === item.id;

                    return (
                      <div key={item.id}
                        className={`bg-slate-50 border-2 rounded-2xl p-3.5 space-y-2.5 text-right transition ${item.uncertain ? 'border-rose-400 ring-2 ring-rose-100' : 'border-black'}`}>

                        {/* الصف الأول: الشارة، ثم الاسم العربي وبجانبه الشركة، والحذف في الطرف البعيد */}
                        <div className="flex items-start gap-2">
                          <span className={`shrink-0 mt-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full border ${badge.cls}`}>
                            {badge.label}
                          </span>
                          {item.uncertain && (
                            <span className="shrink-0 mt-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full border bg-rose-100 text-rose-700 border-rose-300"
                              title="النموذج قرأ رقماً أو اسماً في هذا السطر بصعوبة — قارنه بالصورة">
                              غير واضح ⚠
                            </span>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2">
                              <input
                                value={item.arabicName}
                                onChange={e => updateItem(item.id, { arabicName: e.target.value })}
                                className="flex-1 min-w-0 text-sm font-semibold text-slate-900 bg-transparent border-b border-transparent focus:border-primary-400 focus:outline-none pb-0.5"
                                placeholder="الاسم العربي"
                              />
                              {/* الشركة المصنّعة — بجانب الاسم مباشرة (تُملأ في المخزون عند المطابقة إن كان الحقل فارغاً) */}
                              <input
                                value={item.company}
                                onChange={e => updateItem(item.id, { company: e.target.value })}
                                className="shrink-0 w-24 min-w-0 text-sm font-bold text-slate-500 bg-transparent border-b border-slate-100 focus:border-primary-400 focus:outline-none pb-0.5"
                                placeholder="الشركة"
                              />
                            </div>
                            {item.rawName !== item.arabicName && (
                              <p className="text-sm text-slate-500 tabular-nums truncate mt-0.5">{item.rawName}</p>
                            )}
                          </div>
                          <button onClick={() => removeItem(item.id)}
                            className="shrink-0 mt-0.5 p-1 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* الاسم الإنكليزي — قابل للتعديل دائماً حتى بعد المطابقة؛ يبدأ من المحفوظ في
                            المخزون إن وُجد (فلا يضيع) أو من اسم الفاتورة، وأي تعديل هنا هو ما يُعتمد
                            في المخزون عند الاعتماد (انظر handleConfirm) بدل القديم المحفوظ صامتاً. */}
                        <div className="flex items-center gap-2 pr-1">
                          <span className="text-sm font-bold text-slate-500 shrink-0">الاسم الإنكليزي</span>
                          <input
                            dir="ltr"
                            value={item.nameEnOverride ?? (item.matchedMedicine?.nameEn?.trim() || cleanEnglishName(item.rawName, item.company))}
                            onChange={e => updateItem(item.id, { nameEnOverride: e.target.value })}
                            className="flex-1 min-w-0 text-left text-sm tabular-nums font-bold text-slate-700 bg-transparent border-b border-slate-100 focus:border-primary-400 focus:outline-none pb-0.5"
                            placeholder="English name"
                          />
                        </div>

                        {/* Row 2: medicine match */}
                        <div className="relative">
                          {item.matchedMedicine ? (
                            <div className="flex items-center gap-2 bg-primary-50 border border-primary-100 rounded-xl px-3 py-2">
                              <CheckCircle2 className="w-3.5 h-3.5 text-primary-600 shrink-0" />
                              <span className="flex-1 text-sm font-semibold text-primary-800 truncate">
                                {item.matchedMedicine.nameAr}
                              </span>
                              <button onClick={() => clearMatch(item.id)}
                                className="text-slate-500 hover:text-rose-600 transition cursor-pointer">
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setSearchOpen(isSearchingThis ? null : item.id); setSearchQuery(''); }}
                              className="w-full flex items-center gap-2 bg-amber-50 border border-dashed border-amber-300 rounded-xl px-3 py-2 text-right cursor-pointer hover:border-amber-400 transition"
                            >
                              <Search className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              <span className="flex-1 text-sm font-bold text-amber-700 text-right">
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
                                    className="w-full text-sm font-bold bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-primary-400"
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
                                      className="w-full px-3 py-2 hover:bg-primary-50 text-right transition cursor-pointer">
                                      <p className="text-sm font-semibold text-slate-900">{med.nameAr}</p>
                                      <p className="text-sm text-slate-500 tabular-nums">{med.nameEn}</p>
                                    </button>
                                  ))}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        {/* قسم الأرقام: الكمية والتكلفة — فاصل شعري هادئ بدل الصناديق الملوّنة.
                            الحقول البيضاء قابلة للتعديل، والقيمة المشتقّة (س/شريط) مظلَّلة */}
                        {/* سطر بسعر صفر بلا توأم مدفوع: غالباً بونص لمادة أخرى أو عرض — لن يُعتمد بلا سعر */}
                        {zeroPriceLine && (
                          <p className="text-sm font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
                            سطر بسعر صفر — إن كان بونصاً لمادة أخرى فاحذفه وأدخل كميته في حقل «بونص» لتلك المادة، وإلا أدخل سعره؛ بلا سعر لن يُضاف للمسودة.
                          </p>
                        )}
                        <div className="border-t border-slate-100 pt-2.5 grid grid-cols-5 gap-2">
                          <div className="space-y-1">
                            <label className="text-sm font-bold text-slate-500 block text-center">علب</label>
                            <input type="number" min={1} value={item.quantityBoxes}
                              onChange={e => updateItem(item.id, { quantityBoxes: Math.max(1, Number(e.target.value)) })}
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-900 text-center focus:outline-primary-400" />
                          </div>
                          {/* البونص: علب مجانية تدخل المخزون وتخفّض التكلفة الفعلية دون أن تدخل في المبلغ المدفوع */}
                          <div className="space-y-1">
                            <label className={`text-sm font-bold block text-center ${bonus > 0 ? 'text-teal-700' : 'text-slate-500'}`}>بونص</label>
                            <input type="number" min={0} value={bonus}
                              onChange={e => updateItem(item.id, { bonusBoxes: Math.max(0, Number(e.target.value)) })}
                              title="علب مجانية من المذخر — تُضاف للمخزون وتُخفّض تكلفة الشريط الفعلية"
                              className={`w-full border rounded-lg px-2 py-1.5 text-xs font-semibold text-center focus:outline-teal-400 ${bonus > 0 ? 'bg-teal-50 border-teal-300 text-teal-800' : 'bg-white border-slate-200 text-slate-900'}`} />
                          </div>
                          <div className="space-y-1">
                            <label className="text-sm font-bold text-slate-500 block text-center">شريط/علبة</label>
                            <input type="number" min={1} value={item.stripsPerBox}
                              onChange={e => updateItem(item.id, { stripsPerBox: Math.max(1, Number(e.target.value)) })}
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-900 text-center focus:outline-primary-400" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-sm font-bold text-slate-500 block text-center">سعر/علبة</label>
                            <input type="number" min={0} value={item.pricePerBox}
                              onChange={e => updateItem(item.id, { pricePerBox: Math.max(0, Number(e.target.value)) })}
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-900 text-center focus:outline-primary-400" />
                          </div>
                          <div className="space-y-1">
                            <label className={`text-sm font-bold block text-center ${deviates ? 'text-orange-700' : 'text-primary-700'}`}>س/شريط</label>
                            <div className={`w-full border rounded-lg px-2 py-1.5 text-xs font-semibold text-center ${deviates ? 'bg-orange-50 border-orange-300 text-orange-800 ring-2 ring-orange-200' : 'bg-primary-50 border-primary-100 text-primary-700'}`}
                              title={deviates ? `يختلف عن آخر شراء بنسبة ${Math.round(Math.abs(deviation!) * 100)}% — تحقّق من الرقم في الفاتورة` : undefined}>
                              {fmtNum(pricePerStrip)}
                            </div>
                            {bonus > 0 && (
                              <p className="text-sm font-semibold text-teal-700 text-center" title="التكلفة الفعلية للشريط بعد احتساب البونص المجاني">
                                فعلي {fmtNum(effectivePerStrip)}
                              </p>
                            )}
                            {/* التكلفة السابقة المسجَّلة في المخزن — رقم مجرَّد بالأحمر مباشرة تحت س/شريط، بلا تسمية ولا صندوق */}
                            {item.matchedMedicine && (item.matchedMedicine.costPrice ?? item.matchedMedicine.lastCostPrice) && (
                              <p className={`text-sm font-semibold text-center ${deviates ? 'text-orange-700' : 'text-rose-600'}`}>
                                {fmtNum((item.matchedMedicine.costPrice ?? item.matchedMedicine.lastCostPrice)!)}
                                {deviates && <span className="mr-1">({deviation! > 0 ? '+' : ''}{Math.round(deviation! * 100)}%)</span>}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* أسعار البيع + تاريخ الانتهاء + إجمالي الأشرطة — صفّ واحد على الشاشات الواسعة.
                            لمسة لونية خفيفة تميّز سعر الجمهور (أزرق) عن الرسمي (بنفسجي) دون صراخ */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div className="space-y-1">
                            <label className={`text-sm font-bold block text-center ${sellLoss ? 'text-rose-700' : 'text-slate-500'}`}>سعر البيع للجمهور (شريط)</label>
                            <input type="number" min={0} value={item.retailPrice}
                              onChange={e => updateItem(item.id, { retailPrice: Math.max(0, Number(e.target.value)) })}
                              className={`w-full border rounded-lg px-2 py-1.5 text-xs font-semibold text-center ${sellLoss ? 'bg-rose-50 border-rose-400 text-rose-800 ring-2 ring-rose-200 focus:outline-rose-500' : 'bg-blue-50/50 border-blue-100 text-blue-700 focus:outline-blue-400'}`} />
                            {sellLoss && (
                              <p className="text-sm font-semibold text-rose-700 text-center">بيع بخسارة — التكلفة {fmtNum(effectiveCostPerStrip(item))}</p>
                            )}
                          </div>
                          <div className="space-y-1">
                            <label className="text-sm font-bold text-slate-500 block text-center">سعر البيع الرسمي (شريط)</label>
                            <input type="number" min={0} value={item.officialPrice}
                              onChange={e => updateItem(item.id, { officialPrice: Math.max(0, Number(e.target.value)) })}
                              className="w-full bg-violet-50/50 border border-violet-100 rounded-lg px-2 py-1.5 text-xs font-semibold text-violet-700 text-center focus:outline-violet-400" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-sm font-bold text-slate-500 block text-center">تاريخ الانتهاء (ص)</label>
                            {/* مستطيل واحد يعرض «شهر / سنة»؛ الضغط عليه يفتح منتقياً واحداً
                                بعمودَين متجاورَين (الشهر 1-12 والسنة) — أرقام صريحة دائماً،
                                لا أسماء أشهر مثل Sep/Oct التي يفرضها منتقي month على أندرويد */}
                            {(() => {
                              const curM = item.expiry ? Number(item.expiry.split('-')[1]) : 0;
                              const curY = item.expiry ? Number(item.expiry.split('-')[0]) : 0;
                              const baseYear = new Date().getFullYear();
                              const years = Array.from({ length: 11 }, (_, i) => baseYear + i);
                              if (curY && !years.includes(curY)) years.unshift(curY);
                              const setExpiry = (m: number, y: number) =>
                                updateItem(item.id, { expiry: `${y}-${String(m).padStart(2, '0')}` });
                              const isOpen = expiryPickerId === item.id;
                              return (
                                <div className="relative">
                                  <button
                                    type="button"
                                    onClick={() => setExpiryPickerId(isOpen ? null : item.id)}
                                    className="w-full flex items-center justify-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-900 cursor-pointer focus:outline-primary-400"
                                    dir="ltr"
                                  >
                                    <span>{curM || '—'}</span>
                                    <span className="text-slate-300">/</span>
                                    <span>{curY || '—'}</span>
                                  </button>
                                  {isOpen && (
                                    <>
                                      {/* طبقة إغلاق بالنقر خارج المنتقي — تُزال معه فوراً (بلا AnimatePresence) */}
                                      <div className="fixed inset-0 z-10" onClick={() => setExpiryPickerId(null)} />
                                      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-20 bg-white border border-slate-200 rounded-xl shadow-lg p-2 flex gap-2" dir="ltr">
                                        {/* عمود الشهر */}
                                        <div className="max-h-44 overflow-y-auto flex flex-col gap-0.5">
                                          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                            <button key={m} type="button"
                                              onClick={() => setExpiry(m, curY || baseYear)}
                                              className={`w-11 py-1 rounded-md text-xs font-semibold text-center cursor-pointer transition ${
                                                m === curM ? 'bg-primary-600 text-white' : 'text-slate-700 hover:bg-primary-50'
                                              }`}>
                                              {m}
                                            </button>
                                          ))}
                                        </div>
                                        <div className="w-px bg-slate-100 shrink-0" />
                                        {/* عمود السنة — اختيار السنة يُغلق المنتقي (الشهر ثم السنة هو التسلسل الطبيعي) */}
                                        <div className="max-h-44 overflow-y-auto flex flex-col gap-0.5">
                                          {years.map(y => (
                                            <button key={y} type="button"
                                              onClick={() => { setExpiry(curM || 12, y); setExpiryPickerId(null); }}
                                              className={`w-14 py-1 rounded-md text-xs font-semibold text-center cursor-pointer transition tabular-nums ${
                                                y === curY ? 'bg-primary-600 text-white' : 'text-slate-700 hover:bg-primary-50'
                                              }`}>
                                              {y}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    </>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                          <div className="space-y-1">
                            <label className="text-sm font-bold text-slate-500 block text-center">إجمالي الأشرطة</label>
                            <div className="w-full bg-slate-100/70 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-700 text-center tabular-nums">
                              {totalStrips} شريط{bonus > 0 && <span className="text-teal-700 font-bold"> (منها {bonus * item.stripsPerBox} بونص)</span>}
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
                              <span className="text-sm text-slate-600 font-bold shrink-0">صحّح المخزون الفعلي</span>
                              <input
                                type="number"
                                min={0}
                                autoFocus
                                defaultValue={currentStock}
                                onBlur={e => {
                                  const v = Math.max(0, Math.round(Number(e.target.value)));
                                  updateItem(item.id, { stockOverride: Number.isFinite(v) ? v : currentStock, soldQty: undefined });
                                  setEditingStockId(null);
                                }}
                                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingStockId(null); }}
                                className="w-24 bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-semibold text-slate-900 text-center focus:outline-primary-400"
                              />
                            </div>
                          ) : (
                            <div
                              onDoubleClick={() => setEditingStockId(item.id)}
                              title="انقر مرتين لتصحيح المخزون الفعلي"
                              className={`rounded-xl px-3 py-1.5 flex items-center justify-between cursor-pointer transition border ${corrected ? 'bg-amber-50 border-amber-200' : 'bg-slate-100/70 border-slate-200 hover:border-slate-300'}`}
                            >
                              <span className={`text-sm font-bold flex items-center gap-1.5 flex-wrap ${corrected ? 'text-amber-700' : 'text-slate-500'}`}>
                                <span>المخزون الحالي في المخزن {item.soldQty ? '(مُباع بالكامل ✓)' : corrected ? '(مُصحَّح ✎)' : '— انقر مرتين للتعديل'}</span>
                                {/* «مباع»: الرصيد الوهمي كله بيع فعلي لم يُسجَّل بالباركود — يُصفَّر ويُسجَّل فاتورة بيع عند الاعتماد */}
                                {(item.matchedMedicine.availableQuantity > 0 || item.soldQty) && (
                                  <button type="button"
                                    onClick={e => {
                                      e.stopPropagation();
                                      if (item.soldQty) updateItem(item.id, { soldQty: undefined, stockOverride: undefined });
                                      else updateItem(item.id, { soldQty: item.matchedMedicine!.availableQuantity, stockOverride: 0 });
                                    }}
                                    title={item.soldQty ? 'إلغاء اعتبار الرصيد مبيعاً' : 'اعتبار الرصيد الحالي كله مبيعاً (يُصفَّر المخزون وتُسجَّل فاتورة بيع عند الاعتماد)'}
                                    className={`px-2 py-0.5 rounded-md text-xs font-bold border transition cursor-pointer ${item.soldQty
                                      ? 'bg-rose-500 border-rose-500 text-white hover:bg-rose-600'
                                      : 'bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100'}`}>
                                    {item.soldQty ? `مباع ${fmtNum(item.soldQty)} ✓` : 'مباع'}
                                  </button>
                                )}
                              </span>
                              <span className={`text-xs font-semibold tabular-nums ${corrected ? 'text-amber-800' : 'text-slate-700'}`}>
                                {corrected && (
                                  <span className="text-sm text-slate-500 line-through ml-1">{fmtNum(item.matchedMedicine.availableQuantity)}</span>
                                )}
                                {fmtNum(currentStock)} شريط
                              </span>
                            </div>
                          );
                        })()}</div>}

                        {/* باركود المادة الجديدة (لغير المطابقة فقط — يُولَّد تلقائياً إن تُرك فارغاً) */}
                        {!item.matchedMedicine && (() => {
                          const dupMed = barcodeOwner(item.barcode || '');
                          return (
                          <div className="border-t border-slate-100 pt-2.5 space-y-1">
                            <label className="text-sm font-bold text-slate-500 block">باركود المادة الجديدة (اختياري)</label>
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                inputMode="numeric"
                                value={item.barcode || ''}
                                onChange={e => applyBarcode(item.id, e.target.value)}
                                placeholder="امسح بالكاميرا أو اكتب الباركود — يُولَّد تلقائياً إن تُرك فارغاً"
                                className={`flex-1 min-w-0 bg-white border rounded-lg px-3 py-1.5 text-sm tabular-nums font-bold text-slate-900 text-center focus:outline-primary-400 ${dupMed ? 'border-rose-400 bg-rose-50' : 'border-slate-200'}`}
                                dir="ltr"
                              />
                              <button
                                type="button"
                                onClick={() => startScan(item.id)}
                                title="قراءة الباركود بالكاميرا"
                                className="shrink-0 bg-primary-600 hover:bg-primary-700 text-white rounded-lg px-3 py-1.5 flex items-center gap-1.5 text-sm font-bold transition cursor-pointer"
                              >
                                <Barcode className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">قارئ باركود</span>
                              </button>
                            </div>
                            {/* تنبيه الباركود المكرّر — منع لا دمج */}
                            {dupMed && (
                              <div className="flex items-start gap-1.5 bg-rose-50 border border-rose-100 rounded-lg px-2.5 py-1.5">
                                <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-px" />
                                <p className="text-sm font-semibold text-rose-700 leading-snug">
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
              {/* زر «إعادة» حُذف — علامة ✕ تغلق وتمسح المسودة، وإعادة الفتح تبدأ بصورة جديدة أصلاً */}
              <button
                disabled={validCount === 0 || hasDuplicateBarcode}
                onClick={() => handleConfirm(false)}
                className="flex-1 bg-primary-600 text-white rounded-xl py-3 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary-700 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                {queue.length > 0
                  ? `إضافة ${validCount} صنف ثم الفاتورة التالية (${queue.length} متبقية)`
                  : `إضافة ${validCount} صنف إلى مسودة الشراء`}
              </button>
              {/* اعتماد المطابق فقط: يترك الأصناف الجديدة/غير المطابقة خارج المسودة دون حذفها يدوياً */}
              {newCount > 0 && matchedValidCount > 0 && (
                <button
                  disabled={hasDuplicateBarcode}
                  onClick={() => handleConfirm(true)}
                  className="flex-none px-4 py-3 border border-primary-300 bg-primary-50 text-primary-800 rounded-xl text-xs font-semibold hover:bg-primary-100 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  title="إضافة الأصناف المطابقة فقط وتجاهل غير المطابقة"
                >
                  المطابق فقط ({matchedValidCount})
                </button>
              )}
            </div>
            {hasDuplicateBarcode ? (
              <p className="text-sm text-rose-600 font-semibold text-center mt-2">
                ⚠ يوجد باركود مكرّر لمادة موجودة — صحّحه أو اتركه فارغاً قبل المتابعة.
              </p>
            ) : newCount > 0 && (
              <p className="text-sm text-amber-600 font-bold text-center mt-2">
                {newCount} صنف جديد سيُضاف تلقائياً إلى المخزون عند اعتماد الشراء
              </p>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
