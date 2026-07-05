import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Upload, Loader2, CheckCircle2, AlertCircle, Search,
  ChevronDown, Trash2, FileImage, KeyRound, Eye, EyeOff,
} from 'lucide-react';
import type { Medicine, ExtractedInvoiceItem, ExtractedInvoice } from '../types';
import { extractInvoice, getStoredApiKey, saveApiKey, matchToInventory } from '../utils/invoiceExtractor';

interface DraftItem {
  id: string;
  medicineId?: string;
  nameAr: string;
  nameEn: string;
  manufacturer: string; // الشركة المصنّعة من الفاتورة — تُملأ في المخزون عند المطابقة إن كان الحقل فارغاً
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
  onClose: () => void;
  onConfirm: (items: DraftItem[], supplierName: string) => void;
}

type Step = 'key' | 'upload' | 'processing' | 'review';

function matchBadge(score: number, isMatched: boolean) {
  if (!isMatched) return { label: 'جديد', cls: 'bg-amber-100 text-amber-700 border-amber-200' };
  if (score >= 0.8) return { label: 'تطابق', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
  return { label: 'تقريبي', cls: 'bg-blue-100 text-blue-700 border-blue-200' };
}

export default function InvoiceImportModal({ inventory, onClose, onConfirm }: Props) {
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

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
      const invoice = await extractInvoice(base64, imageFile.type, apiKey.trim(), inventory);
      setExtractedInvoice(invoice);
      setItems(invoice.items);
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

  const selectMedicine = (itemId: string, med: Medicine) => {
    const it = items.find(x => x.id === itemId);
    const pricePerStrip = it && it.stripsPerBox > 0 ? Math.round(it.pricePerBox / it.stripsPerBox) : 0;
    updateItem(itemId, {
      matchedMedicine: med,
      matchScore: 1,
      arabicName: med.nameAr,
      // عند الربط بدواء موجود، نعتمد أسعار بيعه الحالية كقيم افتراضية قابلة للتعديل
      retailPrice: med.price || Math.round(pricePerStrip * 1.25),
      officialPrice: med.secondaryPrice || Math.round(pricePerStrip * 1.35),
    });
    setSearchOpen(null);
    setSearchQuery('');
  };

  const clearMatch = (itemId: string) => {
    updateItem(itemId, { matchedMedicine: null, matchScore: 0 });
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
          // الاسم الإنكليزي: نحترم المسجَّل في المخزون إن وُجد، وإلا الاسم الخام من الفاتورة (بلا الشركة)
          nameEn: med?.nameEn || cleanEnglishName(it.rawName, it.company),
          // الشركة: المسجَّلة في المخزون إن وُجدت، وإلا المكتشفة من الفاتورة
          manufacturer: med?.manufacturer || it.company || '',
          scientificName: med?.scientificName || med?.activeIngredient || 'N/A',
          category: med?.category || 'مسكنات الألم',
          price: pricePerStrip,
          retailPrice: it.retailPrice || Math.round(pricePerStrip * 1.25),
          officialPrice: it.officialPrice || Math.round(pricePerStrip * 1.35),
          qty: totalStrips,
          expiryDate: it.expiry?.replace('/', '-').padEnd(10, '-01') || '2028-12-01',
          barcode: med?.barcode || '62811' + Math.floor(Math.random() * 900000 + 100000),
          warehouse: extractedInvoice?.supplierName || it.company || '',
        };
      });
    onConfirm(draftItems, extractedInvoice?.supplierName || '');
  };

  const matchedCount = items.filter(it => it.matchedMedicine).length;
  const newCount = items.filter(it => !it.matchedMedicine).length;
  const validCount = items.filter(it => it.quantityBoxes > 0 && it.pricePerBox > 0).length;

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

                {/* Summary banner */}
                {extractedInvoice?.supplierName && (
                  <div className="mx-5 mt-4 mb-2 bg-slate-50 border border-slate-200 rounded-2xl p-3 flex items-center gap-3 text-right">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-slate-500 font-bold">المورد المكتشف</p>
                      <p className="text-xs font-extrabold text-slate-900 truncate">{extractedInvoice.supplierName}</p>
                    </div>
                    {extractedInvoice.invoiceNo && (
                      <div className="text-right">
                        <p className="text-[10px] text-slate-500 font-bold">رقم الفاتورة</p>
                        <p className="text-xs font-extrabold text-slate-900 font-mono">{extractedInvoice.invoiceNo}</p>
                      </div>
                    )}
                    {extractedInvoice.date && (
                      <div className="text-right">
                        <p className="text-[10px] text-slate-500 font-bold">التاريخ</p>
                        <p className="text-xs font-extrabold text-slate-900 font-mono">{extractedInvoice.date}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Stats row */}
                <div className="mx-5 mb-3 grid grid-cols-3 gap-2">
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-2.5 text-center">
                    <p className="text-xs font-extrabold text-emerald-700">{matchedCount}</p>
                    <p className="text-[9px] text-emerald-600 font-bold">مطابق</p>
                  </div>
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-2.5 text-center">
                    <p className="text-xs font-extrabold text-amber-700">{newCount}</p>
                    <p className="text-[9px] text-amber-600 font-bold">جديد</p>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-center">
                    <p className="text-xs font-extrabold text-slate-700">{items.length}</p>
                    <p className="text-[9px] text-slate-500 font-bold">إجمالي</p>
                  </div>
                </div>

                {/* Items list */}
                <div className="px-4 pb-2 space-y-2">
                  {items.map(item => {
                    const pricePerStrip = item.stripsPerBox > 0 ? Math.round(item.pricePerBox / item.stripsPerBox) : 0;
                    const totalStrips = item.quantityBoxes * item.stripsPerBox;
                    const badge = matchBadge(item.matchScore, !!item.matchedMedicine);
                    const isSearchingThis = searchOpen === item.id;

                    return (
                      <div key={item.id}
                        className={`border rounded-2xl p-3.5 space-y-2.5 text-right transition
                          ${item.matchedMedicine ? 'border-emerald-200 bg-emerald-50/30' : 'border-amber-200 bg-amber-50/30'}`}>

                        {/* Row 1: name + badge + delete */}
                        <div className="flex items-start gap-2">
                          <button onClick={() => removeItem(item.id)}
                            className="shrink-0 mt-0.5 text-slate-300 hover:text-red-500 transition cursor-pointer">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <div className="flex-1 min-w-0">
                            <input
                              value={item.arabicName}
                              onChange={e => updateItem(item.id, { arabicName: e.target.value })}
                              className="w-full text-xs font-extrabold text-slate-900 bg-transparent border-b border-transparent focus:border-emerald-400 focus:outline-none pb-0.5"
                              placeholder="الاسم العربي"
                            />
                            {item.rawName !== item.arabicName && (
                              <p className="text-[9px] text-slate-400 font-mono truncate mt-0.5">{item.rawName}</p>
                            )}
                          </div>
                          <span className={`shrink-0 text-[9px] font-extrabold px-2 py-0.5 rounded-full border ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </div>

                        {/* Row 1b: الشركة المصنّعة (تُملأ في المخزون عند المطابقة إن كان الحقل فارغاً) */}
                        <div className="flex items-center gap-2 pr-6">
                          <span className="text-[9px] font-extrabold text-slate-400 shrink-0">🏭 الشركة</span>
                          <input
                            value={item.company}
                            onChange={e => updateItem(item.id, { company: e.target.value })}
                            className="flex-1 min-w-0 text-[10px] font-bold text-slate-700 bg-transparent border-b border-transparent focus:border-emerald-400 focus:outline-none pb-0.5"
                            placeholder="اسم الشركة المصنّعة"
                          />
                        </div>

                        {/* Row 2: medicine match */}
                        <div className="relative">
                          {item.matchedMedicine ? (
                            <div className="flex items-center gap-2 bg-white border border-emerald-200 rounded-xl px-3 py-2">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                              <span className="flex-1 text-[10px] font-extrabold text-slate-900 truncate">
                                {item.matchedMedicine.nameAr}
                              </span>
                              <button onClick={() => clearMatch(item.id)}
                                className="text-slate-300 hover:text-red-400 transition cursor-pointer">
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setSearchOpen(isSearchingThis ? null : item.id); setSearchQuery(''); }}
                              className="w-full flex items-center gap-2 bg-white border border-dashed border-amber-300 rounded-xl px-3 py-2 text-right cursor-pointer hover:border-amber-400 transition"
                            >
                              <Search className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              <span className="flex-1 text-[10px] font-bold text-amber-600 text-right">
                                ابحث لربطه بدواء موجود في المخزون
                              </span>
                              <ChevronDown className={`w-3 h-3 text-amber-400 transition ${isSearchingThis ? 'rotate-180' : ''}`} />
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
                                    className="w-full text-[10px] font-bold bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-emerald-400"
                                  />
                                </div>
                                <div className="max-h-40 overflow-y-auto">
                                  {(searchQuery ? filteredInventory : (() => {
                                    const { medicine } = matchToInventory(item.arabicName || item.rawName, inventory);
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
                                      <p className="text-[10px] font-extrabold text-slate-900">{med.nameAr}</p>
                                      <p className="text-[9px] text-slate-400 font-mono">{med.nameEn}</p>
                                    </button>
                                  ))}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        {/* Row 3: numbers grid */}
                        <div className="grid grid-cols-4 gap-2">
                          <div className="space-y-1">
                            <label className="text-[9px] font-extrabold text-slate-500 block">علب</label>
                            <input type="number" min={1} value={item.quantityBoxes}
                              onChange={e => updateItem(item.id, { quantityBoxes: Math.max(1, Number(e.target.value)) })}
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-extrabold text-slate-900 text-center focus:outline-emerald-400" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-extrabold text-slate-500 block">شريط/علبة</label>
                            <input type="number" min={1} value={item.stripsPerBox}
                              onChange={e => updateItem(item.id, { stripsPerBox: Math.max(1, Number(e.target.value)) })}
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-extrabold text-slate-900 text-center focus:outline-emerald-400" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-extrabold text-slate-500 block">سعر/علبة</label>
                            <input type="number" min={0} value={item.pricePerBox}
                              onChange={e => updateItem(item.id, { pricePerBox: Math.max(0, Number(e.target.value)) })}
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-extrabold text-slate-900 text-center focus:outline-emerald-400" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-extrabold text-emerald-600 block">س/شريط ✓</label>
                            <div className="w-full bg-emerald-50 border border-emerald-100 rounded-lg px-2 py-1.5 text-xs font-extrabold text-emerald-700 text-center">
                              {pricePerStrip.toLocaleString()}
                            </div>
                          </div>
                        </div>

                        {/* Reference box: previous inventory prices (only when matched) */}
                        {item.matchedMedicine && (
                          <div className="bg-slate-100/70 border border-slate-200 rounded-xl px-3 py-2">
                            <p className="text-[9px] font-extrabold text-slate-500 mb-1.5">📦 الأسعار الحالية في المخزن (للشريط):</p>
                            <div className="grid grid-cols-3 gap-2">
                              <div className="text-center">
                                <span className="text-[8px] text-slate-400 font-bold block">تكلفة سابقة</span>
                                <span className="text-[10px] font-extrabold text-slate-700 font-mono">
                                  {(item.matchedMedicine.costPrice ?? item.matchedMedicine.lastCostPrice)
                                    ? (item.matchedMedicine.costPrice ?? item.matchedMedicine.lastCostPrice)!.toLocaleString()
                                    : '—'}
                                </span>
                              </div>
                              <div className="text-center">
                                <span className="text-[8px] text-slate-400 font-bold block">جمهور</span>
                                <span className="text-[10px] font-extrabold text-slate-700 font-mono">
                                  {item.matchedMedicine.price ? item.matchedMedicine.price.toLocaleString() : '—'}
                                </span>
                              </div>
                              <div className="text-center">
                                <span className="text-[8px] text-slate-400 font-bold block">رسمي</span>
                                <span className="text-[10px] font-extrabold text-slate-700 font-mono">
                                  {item.matchedMedicine.secondaryPrice ? item.matchedMedicine.secondaryPrice.toLocaleString() : '—'}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Editable selling prices */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-[9px] font-extrabold text-blue-600 block">سعر البيع للجمهور (شريط)</label>
                            <input type="number" min={0} value={item.retailPrice}
                              onChange={e => updateItem(item.id, { retailPrice: Math.max(0, Number(e.target.value)) })}
                              className="w-full bg-blue-50/50 border border-blue-200 rounded-lg px-2 py-1.5 text-xs font-extrabold text-blue-800 text-center focus:outline-blue-400" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-extrabold text-violet-600 block">سعر البيع الرسمي (شريط)</label>
                            <input type="number" min={0} value={item.officialPrice}
                              onChange={e => updateItem(item.id, { officialPrice: Math.max(0, Number(e.target.value)) })}
                              className="w-full bg-violet-50/50 border border-violet-200 rounded-lg px-2 py-1.5 text-xs font-extrabold text-violet-800 text-center focus:outline-violet-400" />
                          </div>
                        </div>

                        {/* Row 4: computed totals + expiry */}
                        <div className="flex items-center gap-3 text-right">
                          <div className="flex-1 bg-slate-50 rounded-xl px-3 py-1.5 flex items-center justify-between">
                            <span className="text-[9px] text-slate-500 font-bold">إجمالي الأشرطة</span>
                            <span className="text-xs font-extrabold text-slate-800 font-mono">{totalStrips} شريط</span>
                          </div>
                          {item.expiry && (
                            <div className="text-[9px] text-slate-500 font-bold bg-slate-50 rounded-xl px-3 py-1.5">
                              ص: {item.expiry}
                            </div>
                          )}
                        </div>
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
                disabled={validCount === 0}
                onClick={handleConfirm}
                className="flex-1 bg-emerald-600 text-white rounded-xl py-3 text-xs font-extrabold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-emerald-700 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                إضافة {validCount} صنف إلى مسودة الشراء
              </button>
            </div>
            {newCount > 0 && (
              <p className="text-[9px] text-amber-600 font-bold text-center mt-2">
                {newCount} صنف جديد سيُضاف تلقائياً إلى المخزون عند اعتماد الشراء
              </p>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
