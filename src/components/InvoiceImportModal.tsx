import { Fragment, useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Upload, Loader2, CheckCircle2, AlertCircle,
  ChevronLeft, ChevronRight, MoreVertical, FileImage, KeyRound, Eye, EyeOff, Camera, Layers,
} from 'lucide-react';
import type { Medicine, ExtractedInvoiceItem, ExtractedInvoice, InvoiceImportDraft, Supplier, SupplierMemory, Order } from '../types';
import { fmtNum } from '../utils/format';
import { confirmDialog } from './ui/dialogs';
import SupplierPicker from './SupplierPicker';
import { extractInvoice, getStoredApiKey, saveApiKey, getStoredClaudeKey, saveClaudeKey, normalizeName, getErrorMessage } from '../utils/invoiceExtractor';
import type { InvoiceAliasMap, StripsMemoryMap, InvoiceImage } from '../utils/invoiceExtractor';

import { medDisplayName, cleanEnName } from '../utils/medName';
import InvoiceItemPage from './invoice/InvoiceItemPage';
import { MedicineSearchSheet, ExpirySheet } from './invoice/InvoiceSheets';
import { itemFrameClass, cleanEnglishName } from './invoice/reviewHelpers';

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

// تصغير صورة الفاتورة قبل الإرسال — بحذر: 1600 بكسل (الإعداد السابق) جعل أرقام الأسعار في
// أعمدة الفاتورة الضيقة غير مقروءة فأعاد النموذج null للأسعار وظهرت كلها صفراً. الحد الآن 3000
// بكسل (قريب مما يعالجه النموذج داخلياً أصلاً) وجودة 0.92، ولا نعيد ترميز الصورة إن كانت
// ضمن الحد وحجمها معقولاً — الضغط للصور الضخمة فقط.
const MAX_IMAGE_EDGE = 3000;
const MAX_RAW_BYTES = 4 * 1024 * 1024;
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
  if (scale >= 1 && file.size <= MAX_RAW_BYTES) {
    return { base64: dataUrl.split(',')[1], mimeType: file.type };
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return { base64: dataUrl.split(',')[1], mimeType: file.type };
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const out = canvas.toDataURL('image/jpeg', 0.92);
  return { base64: out.split(',')[1], mimeType: 'image/jpeg' };
}

type Step = 'key' | 'upload' | 'processing' | 'review';

const DEFAULT_EXPIRY_MONTH = '2028-12';
// يوحّد أي تاريخ («2027/07» أو «2027-07-01») إلى صيغة إدخال الشهر YYYY-MM
function toMonthInput(s?: string): string {
  if (!s) return '';
  const m = s.replace(/\//g, '-').match(/(\d{4})-(\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}` : '';
}

export default function InvoiceImportModal({ inventory, suppliers, supplierMemory, b2bOrders, expiryDates, lastEnteredExpiry, aliases, stripsMemory, onLearnAliases, onForgetAliases, onLearnStrips, initialDraft, onDraftChange, onClose, onConfirm }: Props) {
  const initialKey = getStoredApiKey();
  const initialClaudeKey = getStoredClaudeKey();
  // مسودة سحابية معلَّقة (فاتورة رُوجعت ولم تُضَف لمسودة الشراء بعد) — تُستعاد مباشرة في خطوة المراجعة
  const [step, setStep] = useState<Step>(initialDraft ? 'review' : (initialKey || initialClaudeKey ? 'upload' : 'key'));
  const [apiKey, setApiKey] = useState(initialKey);
  const [claudeKey, setClaudeKey] = useState(initialClaudeKey);
  const [showKey, setShowKey] = useState(false);
  const hasAnyKey = !!(apiKey.trim() || claudeKey.trim());
  // صور متعددة لفاتورة واحدة (الفواتير الطويلة تحتاج صفحتين أو أكثر) — تُرسل معاً في طلب واحد
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [progressMsg, setProgressMsg] = useState('');
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
  // المراجعة صفحات أفقية (دواء في كل صفحة): pageIdx = الصفحة الظاهرة، sheet = الورقة السفلية المفتوحة
  // (بحث ربط دواء أو منتقي الانتهاء) لصنف واحد كحد أقصى
  const [pageIdx, setPageIdx] = useState(0);
  const [sheet, setSheet] = useState<{ kind: 'search' | 'expiry'; itemId: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false); // قائمة ⋯ للإجراءات الجماعية النادرة
  const pagerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  // الخروج من قائمة المطابقة يُفقد مراجعة المستخدم — يسأل أولاً إن كانت هناك مواد مستخرجة
  const requestClose = () => {
    if (items.length === 0 || window.confirm('هل تريد الخروج من قائمة المطابقة؟')) onClose();
  };

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
    if (!files.length || !hasAnyKey) return;
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
        aliases, stripsMemory, supplierMemory: mem, onProgress: setProgressMsg, claudeKey: claudeKey.trim(),
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
      setPageIdx(0);
      setStep('review');
    } catch (err: unknown) {
      const msg = getErrorMessage(err);
      // أخطاء Claude تحمل اسمه ورسالتها العربية الخاصة — لا نحوّلها إلى «تحقق من مفتاح Gemini»
      setError(!msg.includes('Claude') && (msg.includes('API_KEY') || msg.includes('403') || msg.includes('401'))
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
      matchFactors: undefined, // ربط يدوي = مؤكَّد من المستخدم، لا حاجة لتفصيل الاعتبارات
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
    setSheet(null);
    setSearchQuery('');
  };

  const clearMatch = (itemId: string) => {
    const it = items.find(x => x.id === itemId);
    // إلغاء المطابقة = تصحيح صريح: نمحو من الذاكرة ما كان يشير لهذا الدواء بهذه الأسماء،
    // حتى لا تتكرر المطابقة الخاطئة في الفواتير القادمة
    if (it?.matchedMedicine) onForgetAliases(aliasKeysOf(it), it.matchedMedicine.id);
    updateItem(itemId, { matchedMedicine: null, matchScore: 0, matchedByAlias: false, matchFactors: undefined });
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
          nameEn: cleanEnName(it.nameEnOverride ?? (med?.nameEn || cleanEnglishName(it.rawName, it.company))),
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

  const newCount = items.filter(it => !it.matchedMedicine).length;
  const validCount = items.filter(it => it.quantityBoxes > 0 && it.pricePerBox > 0).length;
  const matchedValidCount = items.filter(it => it.matchedMedicine && it.quantityBoxes > 0 && it.pricePerBox > 0).length;

  // فاتورة مكرّرة: نفس رقم الفاتورة سبق اعتماده في طلبية سابقة (للمورد نفسه إن كان معروفاً)
  const invoiceNo = (extractedInvoice?.invoiceNo || '').trim();
  const duplicateOrder = invoiceNo
    ? b2bOrders.find(o => (o.invoiceNo || '').trim() === invoiceNo
        && (!supplierName.trim() || !o.supplierName || o.supplierName === supplierName.trim()))
    : undefined;

  const removeUnmatched = async () => {
    if (!newCount) return;
    if (!(await confirmDialog({ title: `حذف ${newCount} صنف غير مطابق من هذه الفاتورة؟`, confirmText: 'حذف', danger: true }))) return;
    setItems(prev => prev.filter(it => it.matchedMedicine));
  };

  // --- التنقل بين صفحات الأدوية: scroll-snap أفقي بمحور RTL (الصنف الأول عند اليمين، والتالي عن يساره) ---
  const total = items.length;
  const scrollToPage = useCallback((idx: number, behavior: ScrollBehavior = 'smooth') => {
    const page = pagerRef.current?.children[idx] as HTMLElement | undefined;
    page?.scrollIntoView({ inline: 'center', block: 'nearest', behavior });
  }, []);
  const goToPage = (idx: number) => {
    const clamped = Math.max(0, Math.min(total - 1, idx));
    setPageIdx(clamped);
    scrollToPage(clamped);
  };
  // الصفحة الظاهرة = أقرب صفحة لمنتصف الحاوية (يعمل مع السحب باللمس والأسهم معاً، ومع حافة الجارة الطالّة)
  const onPagerScroll = () => {
    const el = pagerRef.current;
    if (!el || el.children.length === 0) return;
    const box = el.getBoundingClientRect();
    const mid = box.left + box.width / 2;
    // تقدير أولي من مسافة التمرير ÷ عرض الصفحة+الفاصل (يتحمّل قفزة عدّة صفحات دفعة واحدة)، ثم تدقيق بالجارتين
    const n = el.children.length;
    let est = pageIdx;
    if (n > 1) {
      const pitch = Math.abs((el.children[1] as HTMLElement).getBoundingClientRect().left - (el.children[0] as HTMLElement).getBoundingClientRect().left);
      if (pitch > 0) est = Math.round(Math.abs(el.scrollLeft) / pitch);
    }
    est = Math.max(0, Math.min(n - 1, est));
    let best = est;
    let bestDist = Infinity;
    const from = Math.max(0, est - 1);
    const to = Math.min(n - 1, est + 1);
    for (let i = from; i <= to; i++) {
      const r = (el.children[i] as HTMLElement).getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - mid);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    setPageIdx(prev => (prev === best ? prev : best));
  };
  // حذف صنف قد يُنقص عدد الصفحات: إن كنا على الأخيرة المحذوفة نعود للتي قبلها
  useEffect(() => {
    if (step !== 'review' || total === 0) return;
    if (pageIdx > total - 1) {
      setPageIdx(total - 1);
      scrollToPage(total - 1, 'auto');
    }
  }, [step, total, pageIdx, scrollToPage]);
  // لوحة المفاتيح على الحاسوب: ← التالي · → السابق (اتجاه القراءة العربية) — لا تعترض الكتابة في الحقول
  useEffect(() => {
    if (step !== 'review') return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (sheet || scanningItemId) return;
      if (e.key === 'ArrowLeft') goToPage(pageIdx + 1);
      else if (e.key === 'ArrowRight') goToPage(pageIdx - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, pageIdx, total, sheet, scanningItemId]);
  // السحب الأفقي الزائد عند أول/آخر صفحة يفسّره بعض المتصفحات إيماءة «رجوع» تُخرج المستخدم من التطبيق؛
  // نمنعه على الجذر فقط ما دامت المراجعة مفتوحة. لا نضع overscroll-behavior-x على الحاوية ولا على الصفحات:
  // اختُبر في Chrome فكان وضعه عليهما هو ما يُفعّل الإيماءة، وتركه تلقائياً يُمرّر الزائد إلى الجذر فيُمنع.
  useEffect(() => {
    if (step !== 'review') return;
    const root = document.documentElement;
    const prev = root.style.overscrollBehaviorX;
    root.style.overscrollBehaviorX = 'none';
    return () => { root.style.overscrollBehaviorX = prev; };
  }, [step]);
  const sheetItem = sheet ? items.find(i => i.id === sheet.itemId) : undefined;

  // صاحب باركود موجود مسبقاً في المخزون — الباركود مطابقة مؤكَّدة 100%، أوثق من تطابق الاسم الضبابي
  const barcodeOwner = (barcode: string): Medicine | null => {
    const b = (barcode || '').trim();
    if (!b) return null;
    return inventory.find(m => (m.barcode || '').trim() === b) || null;
  };
  // إدخال/مسح باركود لصنف: إن كان مسجَّلاً لدواء في المخزون نربط الصنف به تلقائياً (نفس أثر اختياره يدوياً
  // من مربّع البحث) بدل تركه «جديداً» خلف تحذير يُبقيه عالقاً. وإن لم يكن مسجَّلاً فالصنف مادة جديدة
  // بهذا الباركود — وإن كان مربوطاً بدواء من قبل فيُفكّ ربطه أولاً.
  const applyBarcode = (itemId: string, barcode: string) => {
    const owner = barcodeOwner(barcode);
    const it = items.find(x => x.id === itemId);
    if (owner) {
      // الباركود لنفس الدواء المربوط أصلاً: لا شيء يتغيّر (وإلا تُمسح أسعار عدّلها المستخدم)
      if (it?.matchedMedicine?.id === owner.id) return;
      selectMedicine(itemId, owner);
      return;
    }
    if (it?.matchedMedicine) clearMatch(itemId);
    updateItem(itemId, { barcode });
  };
  // شبكة أمان: صنف بقي بلا مطابقة وباركوده مع ذلك مسجَّل لمادة أخرى (مثلاً بعد إلغاء ربطه يدوياً)
  const hasDuplicateBarcode = items.some(it => !it.matchedMedicine && !!barcodeOwner(it.barcode || ''));

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex max-w-full">
      {/* Backdrop — أخف من نافذة منبثقة عادية ومن دون تشويش، يُبقي صفحة الشراء ظاهرة خلفه
          فتبدو اللوحة امتداداً لنفس الشاشة بدل نافذة منفصلة */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/20"
        onClick={requestClose}
      />

      {/* طبقة قارئ الباركود بالكاميرا (فوق كل شيء) */}
      {scanningItemId && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex flex-col items-center justify-center p-4" onClick={stopScan}>
          <div className="relative w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <video ref={videoRef} playsInline muted className="w-full rounded-2xl bg-black aspect-[3/4] object-cover" />
            {/* إطار استهداف */}
            <div className="absolute inset-8 border-2 border-primary-400/80 rounded-2xl pointer-events-none" />
            <p className="text-center text-white text-xs font-bold mt-3">وجّه الكاميرا نحو الباركود…</p>
            {scanError && <p className="text-center text-danger-300 text-sm font-bold mt-2">{scanError}</p>}
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
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'tween', duration: 0.25, ease: 'easeOut' }}
        className="relative bg-white w-full sm:w-[600px] lg:w-[760px] h-full flex flex-col shadow-2xl rounded-l-3xl"
        dir="rtl"
      >
        {/* Header — مضغوط أثناء المراجعة: العنوان + زر الإضافة + الإغلاق في سطر واحد */}
        <div className={`border-b border-slate-100 shrink-0 ${step === 'review'
          ? 'px-4 pb-1 pt-[calc(var(--safe-area-inset-top,env(safe-area-inset-top,0px))+.25rem)]'
          : 'p-5 space-y-3'}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-sm text-slate-900 truncate">استيراد فاتورة من صورة</h2>
              {(step !== 'review' || batchTotal > 1) && (
                <p className="text-sm text-slate-500 font-bold mt-0.5">
                  {step === 'key' && 'أدخل مفتاح Gemini أو Claude لتفعيل الميزة'}
                  {batchTotal > 1 && step !== 'key' && <span className="text-special-700">فاتورة {batchPos} من {batchTotal}{step !== 'review' && ' · '}</span>}
                  {step === 'upload' && 'ارفع صورة الفاتورة أو صوّرها مباشرة لاستخراج البيانات تلقائياً'}
                  {step === 'processing' && 'جارٍ تحليل الفاتورة بالذكاء الاصطناعي...'}
                </p>
              )}
            </div>
            {step === 'review' && (
              <button
                disabled={validCount === 0 || hasDuplicateBarcode}
                onClick={() => handleConfirm(false)}
                title={queue.length > 0 ? `إضافة ${validCount} صنف ثم الفاتورة التالية (${queue.length} متبقية)` : `إضافة ${validCount} صنف إلى مسودة الشراء`}
                className="shrink-0 h-9 px-3.5 rounded-full bg-primary-600 text-white text-sm font-bold flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed active:bg-primary-700 transition cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                إضافة {validCount}
              </button>
            )}
            <button onClick={requestClose} aria-label="إغلاق"
              className={`shrink-0 grid place-items-center hover:bg-slate-100 rounded-xl transition cursor-pointer ${step === 'review' ? 'h-9 w-9 -me-1.5' : 'p-2'}`}>
              <X className="w-4 h-4 text-slate-500" />
            </button>
          </div>

          {/* مؤشر الخطوات: 1 مفتاح · 2 صورة · 3 مراجعة (processing تصنيفها ضمن خطوة الصورة — انتقالية وليست قراراً من المستخدم).
              يُخفى أثناء المراجعة: العدّاد في الأسفل يغني عنه ومساحة الشاشة أثمن */}
          {step !== 'review' && (
            <div className="flex items-center gap-1.5" aria-label="خطوات استيراد الفاتورة">
              {(['key', 'upload', 'review'] as const).map((s, idx, arr) => {
                const stageOf = (st: Step) => st === 'key' ? 0 : (st === 'upload' || st === 'processing') ? 1 : 2;
                const current = stageOf(step);
                const done = idx < current;
                const active = idx === current;
                return (
                  <Fragment key={s}>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        done ? 'bg-primary-600 text-white' : active ? 'bg-primary-100 text-primary-700 ring-2 ring-primary-300' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {done ? '✓' : idx + 1}
                      </span>
                      <span className={`text-sm font-semibold ${active ? 'text-primary-700' : done ? 'text-slate-600' : 'text-slate-500'}`}>
                        {s === 'key' ? 'مفتاح' : s === 'upload' ? 'صورة' : 'مراجعة'}
                      </span>
                    </div>
                    {idx < arr.length - 1 && <span className={`h-px flex-1 ${done ? 'bg-primary-300' : 'bg-slate-200'}`} />}
                  </Fragment>
                );
              })}
            </div>
          )}
        </div>

        {/* Content */}
        <div className={`flex-1 min-h-0 ${step === 'review' ? 'flex flex-col' : 'overflow-y-auto'}`}>
          <AnimatePresence mode="wait">

            {/* STEP: API Key */}
            {step === 'key' && (
              <motion.div key="key" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="p-6 space-y-5 max-w-md mx-auto">
                <div className="bg-warn-50 border border-warn-200 rounded-2xl p-4 text-right">
                  <div className="flex items-start gap-3">
                    <KeyRound className="w-5 h-5 text-warn-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-warn-900">مفتاح Gemini أو Claude مطلوب</p>
                      <p className="text-sm text-warn-700 mt-1 leading-relaxed font-medium">
                        هذه الميزة تستخدم Google Gemini لقراءة الفواتير. أدخل مفتاح API مرة واحدة وسيُحفظ على جهازك.
                        احصل على مفتاح مجاني من Google AI Studio.
                        مفتاح Claude اختياري: يُستخدم تلقائياً حين يتعذّر Gemini (ازدحام أو نفاد الحصة)، وهو مدفوع من console.anthropic.com.
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
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-600 block">مفتاح Claude API (اختياري — احتياطي)</label>
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={claudeKey}
                    onChange={e => setClaudeKey(e.target.value)}
                    placeholder="sk-ant-..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-xs tabular-nums text-slate-900 focus:outline-primary-500 text-left"
                    dir="ltr"
                  />
                </div>
                <button
                  disabled={!hasAnyKey}
                  onClick={() => { saveApiKey(apiKey); saveClaudeKey(claudeKey); setStep('upload'); }}
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
                            className="absolute top-1 left-1 w-5 h-5 rounded-full bg-danger-600 text-white flex items-center justify-center cursor-pointer hover:bg-danger-700">
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
                  <div className="fixed inset-0 z-[200] bg-black flex flex-col gap-2 p-3">
                    <video ref={cameraVideoRef} playsInline muted className="w-full flex-1 min-h-0 object-contain bg-black" />
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
                    <p className="text-sm text-slate-400 font-bold text-center">ثبّت الهاتف فوق الفاتورة كاملةً بإضاءة جيدة، ثم التقط. صفحة ثانية؟ التقط مرة أخرى.</p>
                  </div>
                )}
                {cameraError && (
                  <p className="text-sm font-bold text-danger-700 bg-danger-50 border border-danger-200 rounded-xl px-3 py-2 text-right">{cameraError}</p>
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
                  <div className={`rounded-xl p-3 space-y-1.5 border ${queue.length ? 'bg-special-50 border-special-200' : 'bg-slate-50 border-slate-200'}`}>
                    {queue.length > 0 && (
                      <>
                        <p className="text-sm font-semibold text-special-800 flex items-center gap-1.5"><Layers className="w-3.5 h-3.5" /> طابور الفواتير: {queue.length} فاتورة محفوظة{imageFiles.length ? ' + الحالية' : ''}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {queue.map((files, i) => (
                            <span key={i} className="inline-flex items-center gap-1 bg-white border border-special-200 rounded-full px-2 py-0.5 text-sm font-bold text-special-700">
                              فاتورة {batchDone + i + 1}: {files.length} {files.length === 1 ? 'صورة' : 'صور'}
                              <button type="button" title="إزالة من الطابور" onClick={() => setQueue(q => q.filter((_, j) => j !== i))}
                                className="text-special-400 hover:text-danger-600 cursor-pointer"><X className="w-3 h-3" /></button>
                            </span>
                          ))}
                        </div>
                      </>
                    )}
                    {imageFiles.length > 0 && (
                      <button type="button" onClick={pushCurrentToQueue}
                        className="w-full py-2 rounded-lg border border-special-300 bg-white text-special-800 text-sm font-semibold hover:bg-special-100 transition cursor-pointer">
                        + حفظ هذه الفاتورة في الطابور وتصوير فاتورة أخرى
                      </button>
                    )}
                    {queue.length > 0 && (
                      <p className="text-xs text-special-600 font-bold">تُحلَّل بالتتابع وتُراجَع كل واحدة على حدة، وتُضاف كلها إلى مسودة الشراء نفسها.</p>
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
                      <p className="text-sm text-special-700 font-bold">✓ ذاكرة هذا المورد: {mem.examples.length} مثال مؤكَّد و{mem.companies.length} شركة ستُرفق مع الطلب</p>
                    ) : null;
                  })()}
                </div>

                {error && (
                  <div className="flex items-start gap-2 bg-danger-50 border border-danger-200 rounded-xl p-3 text-right">
                    <AlertCircle className="w-4 h-4 text-danger-500 shrink-0 mt-0.5" />
                    <p className="text-sm font-bold text-danger-700">{error}</p>
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

            {/* STEP: Review — صفحات أفقية، دواء في كل صفحة (التفاصيل في InvoiceItemPage) */}
            {step === 'review' && (
              <motion.div key="review" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex-1 min-h-0 flex flex-col">

                {/* الشريط العلوي: المورد يُختار يدوياً من الموردين المحفوظين (لا يُلتقط من الصورة)،
                    ورقم الفاتورة والتاريخ بيانات ثانوية. التنبيهات عند وجودها فقط وبسطر واحد لكلٍّ منها. */}
                <div className="shrink-0 bg-white border-b border-slate-100">
                  <div className="px-3 py-1 flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <SupplierPicker
                        suppliers={suppliers}
                        value={supplierName}
                        onChange={setSupplierName}
                        selectClassName="w-full h-9 rounded-lg bg-slate-50 border border-slate-200 px-2.5 text-sm font-bold text-slate-800"
                        inputClassName="w-full h-9 rounded-lg bg-slate-50 border border-primary-300 px-2.5 text-sm font-bold text-slate-800"
                      />
                    </div>
                    {(extractedInvoice?.invoiceNo || extractedInvoice?.date) && (
                      <div className="shrink-0 text-[11px] leading-[14px] tabular-nums text-right">
                        {extractedInvoice?.invoiceNo && <p className="font-semibold text-slate-700">{extractedInvoice.invoiceNo}</p>}
                        {extractedInvoice?.date && <p className="text-slate-500">{extractedInvoice.date}</p>}
                      </div>
                    )}
                    {/* إجراءات جماعية نادرة — تظهر فقط حين توجد أصناف غير مطابقة */}
                    {newCount > 0 && (
                      <div className="relative shrink-0">
                        <button type="button" onClick={() => setMenuOpen(v => !v)} aria-label="المزيد من الإجراءات"
                          className="h-9 w-9 grid place-items-center rounded-lg border border-slate-200 bg-white active:bg-slate-50 transition cursor-pointer">
                          <MoreVertical className="w-4 h-4 text-slate-600" />
                        </button>
                        {menuOpen && (
                          <>
                            <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
                            <div className="absolute left-0 top-full mt-1 z-30 w-64 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                              {matchedValidCount > 0 && (
                                <button type="button" disabled={hasDuplicateBarcode}
                                  onClick={() => { setMenuOpen(false); handleConfirm(true); }}
                                  className="w-full px-4 h-12 text-right text-sm font-semibold text-primary-800 active:bg-primary-50 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                                  إضافة المطابق فقط ({matchedValidCount})
                                </button>
                              )}
                              <button type="button"
                                onClick={() => { setMenuOpen(false); void removeUnmatched(); }}
                                className="w-full px-4 h-12 text-right text-sm font-semibold text-danger-700 active:bg-danger-50 border-t border-slate-100 transition cursor-pointer">
                                حذف غير المطابق ({newCount})
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="px-3 pb-1 space-y-1 empty:hidden">
                    {/* تلميح المورد بلا تعبئة تلقائية: الاسم المقروء من الصورة يُقترح بنقرة، لا يُلتقط بصمت */}
                    {!supplierName.trim() && (extractedInvoice?.supplierName || '').trim() && (() => {
                      const ocr = (extractedInvoice?.supplierName || '').trim();
                      const sug = suggestSupplier(ocr, suppliers);
                      return sug ? (
                        <AlertLine tone="info" onClick={() => setSupplierName(sug.name)}
                          text={`يبدو أن الفاتورة من «${sug.name}» — اختره بنقرة`} />
                      ) : (
                        <AlertLine tone="info" onClick={() => setSupplierName(ocr)}
                          text={`المورد المكتوب في الفاتورة: «${ocr}» — غير محفوظ، إضافته كمورد جديد؟`} />
                      );
                    })()}
                    {/* التنبيه الوحيد المُبقى في هذه المنطقة: يظهر فقط إن كانت الفاتورة مكرّرة */}
                    {duplicateOrder && (
                      <AlertLine tone="danger"
                        text={`فاتورة مكرّرة؟ الرقم «${invoiceNo}» سبق اعتماده بتاريخ ${duplicateOrder.date}${duplicateOrder.supplierName ? ` للمورد «${duplicateOrder.supplierName}»` : ''} بقيمة ${fmtNum(duplicateOrder.totalAmount)} د.ع.`} />
                    )}
                  </div>
                </div>

                {/* الصفحات: السحب الأفقي يتبع اتجاه القراءة العربية (الأول عند اليمين).
                    حافة الصفحة التالية تطلّ قليلاً فتدلّ على إمكان السحب. الصفحة الحالية وجارتاها فقط
                    تُرسم كاملة؛ البقية هياكل خفيفة بالعرض نفسه فيبقى التمرير سلساً مع القوائم الكبيرة.
                    الصفحة تمنع التسلسل الرأسي فقط (overscroll-y-contain): المنع الكامل كان يحجب السحب الأفقي
                    باللمس عن الحاوية فلا تنتقل الصفحات إلا بالأزرار، وكان المتصفح يفسّره إيماءة «رجوع». */}
                <div
                  ref={pagerRef}
                  dir="rtl"
                  role="group"
                  onScroll={onPagerScroll}
                  className="flex-1 min-h-0 flex gap-1 px-3 py-1.5 bg-slate-50 overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  {items.length === 0 && (
                    <p className="w-full text-center text-sm font-bold text-slate-500 py-10">لا توجد أصناف في هذه الفاتورة.</p>
                  )}
                  {items.map((item, i) => (
                    <div
                      key={item.id}
                      role="group"
                      aria-label={`دواء ${i + 1} من ${total}`}
                      className={`w-[calc(100%-.5rem)] shrink-0 snap-center snap-always overflow-y-auto overscroll-y-contain rounded-2xl bg-white ${itemFrameClass(item)}`}
                    >
                      {Math.abs(i - pageIdx) <= 1 ? (
                        <InvoiceItemPage
                          item={item}
                          barcodeOwner={barcodeOwner}
                          onUpdate={updateItem}
                          onRemove={removeItem}
                          onClearMatch={clearMatch}
                          onOpenSearch={id => { setSheet({ kind: 'search', itemId: id }); setSearchQuery(''); }}
                          onOpenExpiry={id => setSheet({ kind: 'expiry', itemId: id })}
                          onApplyBarcode={applyBarcode}
                          onScanBarcode={startScan}
                        />
                      ) : (
                        <p dir="ltr" className="p-4 text-lg font-bold text-slate-400 text-right truncate">
                          {medDisplayName({ nameAr: item.arabicName, nameEn: item.matchedMedicine?.nameEn || item.rawName })}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* Footer: تنقّل بين الأدوية — في الصفحة الأخيرة يتحوّل «التالي» إلى زر الإضافة.
            الأزرار أصغر بنسبة 30% عمّا كانت (ارتفاع 34px بدل 48px) لتتّسع صفحة الدواء في شاشة واحدة */}
        {step === 'review' && (
          <div className="shrink-0 bg-white border-t border-slate-200 rounded-b-3xl px-3 pt-1.5 pb-[max(.375rem,var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px)))]">
            {hasDuplicateBarcode && (
              <p className="text-xs text-danger-600 font-semibold text-center mb-1.5 leading-snug">
                ⚠ يوجد باركود مكرّر لمادة موجودة — صحّحه أو اتركه فارغاً قبل المتابعة.
              </p>
            )}
            <div className="flex items-center justify-center gap-3">
              <button type="button" onClick={() => goToPage(pageIdx - 1)} disabled={pageIdx <= 0}
                className="h-[34px] w-[92px] rounded-lg border border-slate-200 bg-white text-slate-700 text-[13px] font-bold flex items-center justify-center gap-1 active:bg-slate-100 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                <ChevronRight className="w-4 h-4" />
                السابق
              </button>
              <span className="shrink-0 min-w-[3.5rem] text-center text-[13px] font-bold tabular-nums text-slate-600">
                {total > 0 ? <>{pageIdx + 1} من {total}</> : '—'}
              </span>
              {pageIdx >= total - 1 && total > 0 ? (
                <button type="button" onClick={() => handleConfirm(false)} disabled={validCount === 0 || hasDuplicateBarcode}
                  title={queue.length > 0 ? `إضافة ${validCount} صنف ثم الفاتورة التالية (${queue.length} متبقية)` : `إضافة ${validCount} صنف إلى مسودة الشراء`}
                  className="h-[34px] min-w-[92px] px-3 rounded-lg bg-primary-600 text-white text-[13px] font-bold flex items-center justify-center gap-1 active:bg-primary-700 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                  <CheckCircle2 className="w-4 h-4" />
                  {queue.length > 0 ? `إضافة ${validCount} ثم التالية` : `إضافة ${validCount}`}
                </button>
              ) : (
                <button type="button" onClick={() => goToPage(pageIdx + 1)} disabled={total === 0}
                  className="h-[34px] w-[92px] rounded-lg bg-primary-600 text-white text-[13px] font-bold flex items-center justify-center gap-1 active:bg-primary-700 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                  التالي
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* الورقة السفلية: ربط دواء من المخزون / منتقي الانتهاء — تُرسم فوق اللوحة كلها */}
        <AnimatePresence>
          {sheet?.kind === 'search' && sheetItem && (
            <MedicineSearchSheet
              key="search-sheet"
              item={sheetItem}
              inventory={inventory}
              aliases={aliases}
              query={searchQuery}
              onQuery={setSearchQuery}
              onPick={med => selectMedicine(sheetItem.id, med)}
              onClose={() => { setSheet(null); setSearchQuery(''); }}
            />
          )}
          {sheet?.kind === 'expiry' && sheetItem && (
            <ExpirySheet
              key="expiry-sheet"
              expiry={sheetItem.expiry}
              onChange={expiry => updateItem(sheetItem.id, { expiry })}
              onClose={() => setSheet(null)}
            />
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

// سطر تنبيه واحد مضغوط؛ النقر يفتح نصه كاملاً (أو ينفّذ إجراءه إن كان اقتراحاً)
function AlertLine({ tone, text, onClick }: { tone: 'danger' | 'warn' | 'info'; text: string; onClick?: () => void }) {
  const [open, setOpen] = useState(false);
  const cls = tone === 'danger' ? 'bg-danger-50 border-danger-300 text-danger-800'
    : tone === 'warn' ? 'bg-warn-50 border-warn-200 text-warn-800'
    : 'bg-special-50 border-special-200 text-special-700';
  return (
    <button type="button" onClick={onClick ?? (() => setOpen(v => !v))}
      className={`w-full min-h-8 px-3 py-1 rounded-lg border flex items-center gap-2 text-xs font-semibold text-right cursor-pointer ${cls}`}>
      <AlertCircle className="w-4 h-4 shrink-0" />
      <span className={`flex-1 min-w-0 ${open ? 'whitespace-normal' : 'truncate'}`}>{text}</span>
    </button>
  );
}
