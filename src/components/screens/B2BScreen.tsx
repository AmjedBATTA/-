import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  DollarSign, CheckCircle2, PlusCircle, ScanLine, Barcode, Search, Pencil, Trash2, Truck, ClipboardList, X,
} from 'lucide-react';
import type { Medicine, Order, Supplier } from '../../types';
import { fmtNum } from '../../utils/format';
import SupplierPicker from '../SupplierPicker';
import { toast, confirmDialog } from '../ui/dialogs';

interface B2BScreenProps {
  // بيانات
  inventory: Medicine[];
  setInventory: React.Dispatch<React.SetStateAction<Medicine[]>>;
  expiryDates: Record<string, string>;
  setExpiryDates: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  suppliers: Supplier[];
  b2bOrders: Order[];
  walletBalance: number;
  // بحث الطلبيات السابقة
  b2bOrderSearch: string;
  setB2bOrderSearch: (v: string) => void;
  // مسودة الشراء
  purchaseDraft: any[];
  setPurchaseDraft: React.Dispatch<React.SetStateAction<any[]>>;
  purchaseSupplier: string;
  purchaseOnCredit: boolean;
  setPurchaseOnCredit: (v: boolean) => void;
  purchaseSuccessBanner: string | null;
  // نموذج «إضافة سريعة بالاسم»
  purchaseSearchWord: string;
  setPurchaseSearchWord: (v: string) => void;
  // نموذج «منتج جديد كلياً»
  showPurchaseNewProdForm: boolean;
  setShowPurchaseNewProdForm: (v: boolean) => void;
  purchaseNewProdAr: string;
  setPurchaseNewProdAr: (v: string) => void;
  purchaseNewProdEn: string;
  setPurchaseNewProdEn: (v: string) => void;
  purchaseNewProdSci: string;
  setPurchaseNewProdSci: (v: string) => void;
  purchaseNewProdPrice: number;
  setPurchaseNewProdPrice: (v: number) => void;
  purchaseNewProdQty: number;
  setPurchaseNewProdQty: (v: number) => void;
  purchaseNewProdExpiry: string;
  setPurchaseNewProdExpiry: (v: string) => void;
  purchaseNewProdBarcode: string;
  setPurchaseNewProdBarcode: (v: string) => void;
  // تعديل صف المسودة بالنقر المزدوج/الثلاثي (اسم/باركود/رصيد المخزن)
  editingDraftField: { id: string; field: 'nameAr' | 'barcode'; medicineId?: string } | null;
  editingDraftValue: string;
  setEditingDraftValue: (v: string) => void;
  editingDraftStockId: string | null;
  setEditingDraftStockId: (v: string | null) => void;
  draftEditCancelRef: React.RefObject<boolean>;
  startEditDraftField: (item: any, field: 'nameAr' | 'barcode') => void;
  saveDraftField: () => void;
  saveDraftStock: (id: string, liveQty: number, raw: string) => void;
  // أفعال
  addToPurchaseDraft: (med: any, overrideQty?: number) => void;
  applyDraftSupplier: (val: string) => void;
  commitPurchaseDraft: () => void | Promise<void>;
  reopenPurchaseOrderForEdit: (orderId: string) => void | Promise<void>;
  findScanMatch: (query: string) => Medicine | null;
  startScanning: (target: 'pos' | 'inventory' | 'add-drug' | 'purchase-order' | 'movement' | 'purchase-new-product') => void | Promise<void>;
  setShowInvoiceImport: (v: boolean) => void;
}

export default function B2BScreen(props: B2BScreenProps) {
  const {
    inventory, setInventory, expiryDates, setExpiryDates, suppliers, b2bOrders, walletBalance,
    b2bOrderSearch, setB2bOrderSearch,
    purchaseDraft, setPurchaseDraft, purchaseSupplier, purchaseOnCredit, setPurchaseOnCredit, purchaseSuccessBanner,
    purchaseSearchWord, setPurchaseSearchWord,
    showPurchaseNewProdForm, setShowPurchaseNewProdForm,
    purchaseNewProdAr, setPurchaseNewProdAr, purchaseNewProdEn, setPurchaseNewProdEn, purchaseNewProdSci, setPurchaseNewProdSci,
    purchaseNewProdPrice, setPurchaseNewProdPrice, purchaseNewProdQty, setPurchaseNewProdQty,
    purchaseNewProdExpiry, setPurchaseNewProdExpiry, purchaseNewProdBarcode, setPurchaseNewProdBarcode,
    editingDraftField, editingDraftValue, setEditingDraftValue, editingDraftStockId, setEditingDraftStockId,
    draftEditCancelRef, startEditDraftField, saveDraftField, saveDraftStock,
    addToPurchaseDraft, applyDraftSupplier, commitPurchaseDraft, reopenPurchaseOrderForEdit,
    findScanMatch, startScanning, setShowInvoiceImport,
  } = props;

  return (
  <motion.div
    key="b2b"
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -10 }}
    className="space-y-6"
    dir="rtl"
  >
    {/* Dashboard Hub Header */}
    <div className="bg-gradient-to-l from-primary-900 to-slate-900 rounded-3xl p-6 text-white shadow-md relative overflow-hidden">
      <div className="absolute top-0 left-0 w-64 h-64 bg-primary-500/10 rounded-full blur-3xl -ml-20 -mt-20" />
      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1 text-right">
          <span className="text-sm uppercase tracking-wider font-semibold bg-primary-500/30 text-primary-100 px-3.5 py-1 rounded-full">إدارة مشتريات وتوريدات الأدوية</span>
          <h3 className="font-semibold text-lg mt-2 font-sans">طلبيات الشراء والتغذية اليومية للمخزون</h3>
          <p className="text-xs text-slate-300 leading-relaxed max-w-2xl font-medium">
            منظومة متكاملة لتهيئة وتخطيط طلبيات الشراء اليومية من المكاتب العلمية والمذاخر. قم باضافة كمياتك والتحكم المباشر في الأسعار، التواريخ، والباركود لتنزيلها في المخزن بضغطة زر واحدة.
          </p>
        </div>
        
        <div className="flex items-center gap-2 bg-slate-800/40 border border-slate-700/50 p-4 rounded-2xl backdrop-blur-md">
          <DollarSign className="w-8 h-8 text-primary-400" />
          <div className="text-right">
            <span className="text-sm text-slate-500 block font-bold">ميزانية الصندوق المتاحة:</span>
            <strong className="text-base text-money-400 tabular-nums tracking-wide">{fmtNum(walletBalance)} د.ع</strong>
          </div>
        </div>
      </div>
    </div>

    {/* Top Level Success banner */}
    {purchaseSuccessBanner && (
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 bg-primary-50 border border-primary-200 rounded-2xl flex items-start gap-3.5 text-right font-semibold text-xs text-primary-950 shadow-sm"
      >
        <CheckCircle2 className="w-5 h-5 text-primary-600 shrink-0 mt-0.5" />
        <div>
          <strong>عملية توريد ناجحة !</strong>
          <p className="text-sm text-primary-800 mt-1">{purchaseSuccessBanner}</p>
        </div>
      </motion.div>
    )}

    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      
      {/* TOP PANEL - QUICK ADDERS (صف أفقي بعرض كامل) */}
      <div className="lg:col-span-12 grid grid-cols-1 md:grid-cols-3 gap-4 items-start">

        {/* Import from Image Button */}
        <button
          type="button"
          onClick={() => setShowInvoiceImport(true)}
          className="w-full flex items-center gap-3 bg-gradient-to-l from-primary-600 to-primary-500 text-white rounded-2xl p-4 shadow-sm hover:from-primary-700 hover:to-primary-600 transition cursor-pointer"
        >
          <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
            <ScanLine className="w-5 h-5" />
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold">استيراد فاتورة من صورة</p>
            <p className="text-sm text-primary-100 font-bold mt-0.5">ارفع صورة القائمة وسيُعبّأ المخزون تلقائياً</p>
          </div>
        </button>

        {/* Interactive Section: Search and Add by Name */}
        <div className="bg-white border border-slate-200/80 p-5 rounded-3xl shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <PlusCircle className="w-5 h-5 text-primary-600" />
            <h4 className="font-semibold text-xs text-slate-900">إضافة سريعة بالاسم أو التفاصيل</h4>
          </div>
          
          <div className="space-y-3">
            <p className="text-sm text-slate-500 font-bold leading-relaxed">
              اختر أي دواء مسجل مسبقاً في الصيدلية لإدراجه مباشرةً في مسودة الشراء اليومي مع تطبيق التخفيضات:
            </p>
            
            <div className="relative">
              <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-slate-500">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={purchaseSearchWord}
                onChange={(e) => setPurchaseSearchWord(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const match = findScanMatch(purchaseSearchWord);
                    if (match) { addToPurchaseDraft(match); setPurchaseSearchWord(''); }
                  }
                }}
                placeholder="امسح الباركود أو اكتب الاسم ثم Enter..."
                className="w-full bg-slate-50 hover:bg-slate-100/70 border border-slate-200 rounded-xl py-2.5 pr-9 pl-10 text-xs font-bold text-slate-850 placeholder:text-slate-500 transition focus:outline-primary-500"
              />
              <button
                type="button"
                onClick={() => startScanning('purchase-order')}
                title="مسح باركود"
                className="absolute inset-y-0 left-2 flex items-center px-1 text-primary-600 hover:text-primary-700 transition cursor-pointer"
              >
                <Barcode className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Suggestion List */}
            {purchaseSearchWord.trim().length > 0 && (
              <div className="bg-white border border-slate-150 rounded-2xl max-h-56 overflow-y-auto divide-y divide-slate-100 text-right shadow-md scrollbar-thin">
                {inventory
                  .filter(m => {
                    const q = purchaseSearchWord.toLowerCase();
                    return (
                      m.nameAr.toLowerCase().includes(q) ||
                      m.nameEn.toLowerCase().includes(q) ||
                      (m.scientificName && m.scientificName.toLowerCase().includes(q)) ||
                      (m.barcode && m.barcode.toLowerCase().includes(q))
                    );
                  })
                  .slice(0, 6)
                  .map(med => (
                    <button
                      key={med.id}
                      type="button"
                      onClick={() => {
                        addToPurchaseDraft(med);
                        setPurchaseSearchWord('');
                      }}
                      className="w-full p-3 hover:bg-slate-50 transition text-right text-xs block cursor-pointer"
                    >
                      <div className="flex justify-between items-center">
                        <strong className="font-semibold text-slate-900 block">{med.nameAr}</strong>
                        <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full tabular-nums font-bold">
                          رصيد: {med.availableQuantity}
                        </span>
                      </div>
                      <span className="text-sm text-slate-500 tabular-nums block mt-0.5">{med.nameEn} • {med.scientificName}</span>
                    </button>
                  ))}
                {inventory.filter(m => 
                    m.nameAr.toLowerCase().includes(purchaseSearchWord.toLowerCase()) || 
                    m.nameEn.toLowerCase().includes(purchaseSearchWord.toLowerCase())
                 ).length === 0 && (
                  <p className="p-4 text-sm text-slate-500 text-center font-bold">لم نعثر على دواء مطابق. هل ترغب بإضافة منتج جديد؟</p>
                )}
              </div>
            )}
          </div>
        </div>


        {/* Section: Dynamic form to add a completely custom brand new drug */}
        <div className="bg-white border border-slate-200/80 p-5 rounded-3xl shadow-xs space-y-4">
          <button
            type="button"
            onClick={() => setShowPurchaseNewProdForm(!showPurchaseNewProdForm)}
            className="w-full flex items-center justify-between transition hover:opacity-80 border-none bg-transparent cursor-pointer"
          >
            <div className="flex items-center gap-2 text-slate-800">
              <PlusCircle className="w-5 h-5 text-primary-600" />
              <h4 className="font-semibold text-xs text-slate-900">تسجيل وإضافة دواء جديد كلياً 🆕</h4>
            </div>
            <span className={`text-sm font-bold px-2 py-0.5 rounded-full ${
              showPurchaseNewProdForm ? 'bg-warn-100 text-warn-800' : 'bg-slate-100 text-slate-500'
            }`}>
              {showPurchaseNewProdForm ? 'إغلاق' : 'توسعة'}
            </span>
          </button>

          <AnimatePresence>
            {showPurchaseNewProdForm && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden space-y-3.5 pt-3 text-right"
              >
                <div className="space-y-1.5 text-xs text-slate-600 font-bold">
                  <label className="block text-sm">الاسم العربي للمنتج:</label>
                  <input
                    type="text"
                    value={purchaseNewProdAr}
                    onChange={(e) => setPurchaseNewProdAr(e.target.value)}
                    className="w-full bg-slate-50 p-2 border border-slate-200 rounded-lg text-slate-900 focus:outline-primary-500"
                    placeholder="مثال: ريمكس 500 ملغ"
                  />
                </div>

                <div className="space-y-1.5 text-xs text-slate-600 font-bold">
                  <label className="block text-sm">الاسم الإنكليزي للمنتج:</label>
                  <input
                    type="text"
                    value={purchaseNewProdEn}
                    onChange={(e) => setPurchaseNewProdEn(e.target.value)}
                    className="w-full bg-slate-50 p-2 border border-slate-200 rounded-lg text-slate-900 tabular-nums focus:outline-primary-500 text-left"
                    placeholder="e.g. Remex 500mg"
                  />
                </div>

                <div className="space-y-1.5 text-xs text-slate-600 font-bold">
                  <label className="block text-sm">الاسم العلمي والمادة الفعالة:</label>
                  <input
                    type="text"
                    value={purchaseNewProdSci}
                    onChange={(e) => setPurchaseNewProdSci(e.target.value)}
                    className="w-full bg-slate-50 p-2 border border-slate-200 rounded-lg text-slate-900 focus:outline-primary-500"
                    placeholder="مثال: Paracetamol"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1 text-xs text-slate-600 font-bold">
                    <label className="block text-sm">تاريخ انتهاء الصلاحية:</label>
                    <input
                      type="date"
                      value={purchaseNewProdExpiry}
                      onChange={(e) => setPurchaseNewProdExpiry(e.target.value)}
                      className="w-full bg-slate-50 p-2 border border-slate-200 rounded-lg tabular-nums text-slate-800"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1 text-xs text-slate-600 font-bold">
                    <label className="block text-sm">سعر شراء الجملة (د.ع):</label>
                    <input
                      type="number"
                      value={purchaseNewProdPrice}
                      onChange={(e) => setPurchaseNewProdPrice(Number(e.target.value))}
                      className="w-full bg-slate-50 p-2 border border-slate-200 rounded-lg text-slate-900 text-center tabular-nums"
                    />
                  </div>

                  <div className="space-y-1 text-xs text-slate-600 font-bold">
                    <label className="block text-sm">الكمية المطلوبة (علب):</label>
                    <input
                      type="number"
                      value={purchaseNewProdQty}
                      onChange={(e) => setPurchaseNewProdQty(Number(e.target.value))}
                      className="w-full bg-slate-50 p-2 border border-slate-200 rounded-lg text-slate-900 text-center tabular-nums"
                    />
                  </div>
                </div>

                <div className="space-y-1.5 text-xs text-slate-600 font-bold">
                  <label className="block text-sm">الباركود الرقمي للمنتج:</label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={purchaseNewProdBarcode}
                      onChange={(e) => setPurchaseNewProdBarcode(e.target.value)}
                      className="flex-1 min-w-0 bg-slate-50 p-2 border border-slate-200 rounded-lg text-slate-900 tabular-nums focus:outline-primary-500"
                      placeholder="سيتولد تلقائياً إن ترك فارغاً"
                    />
                    <button
                      type="button"
                      onClick={() => startScanning('purchase-new-product')}
                      className="bg-primary-600 hover:bg-primary-700 text-white rounded-lg px-2.5 flex items-center justify-center transition cursor-pointer shrink-0"
                      title="قراءة الباركود بالكاميرا"
                    >
                      <Barcode className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (!purchaseNewProdAr || !purchaseNewProdEn) {
                      toast('الرجاء إدخال الاسم العربي والاسم الإنكليزي لإدراج المنتج!', 'info');
                      return;
                    }
                    const customItem = {
                      id: 'draft-new-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
                      medicineId: null, 
                      nameAr: `${purchaseNewProdAr} (جديد 🆕)`,
                      nameEn: purchaseNewProdEn,
                      scientificName: purchaseNewProdSci || 'N/A',
                      category: '',
                      price: purchaseNewProdPrice,
                      qty: purchaseNewProdQty,
                      expiryDate: purchaseNewProdExpiry,
                      barcode: purchaseNewProdBarcode || '628' + Math.floor(Math.random() * 90000000 + 10000000),
                      warehouse: purchaseSupplier || '',
                    };
                    setPurchaseDraft(prev => [customItem, ...prev]);
                    setPurchaseNewProdAr('');
                    setPurchaseNewProdEn('');
                    setPurchaseNewProdSci('');
                    setPurchaseNewProdPrice(3000);
                    setPurchaseNewProdQty(50);
                    setPurchaseNewProdBarcode('');
                    setShowPurchaseNewProdForm(false);
                  }}
                  className="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-2.5 rounded-xl text-center transition shadow-sm cursor-pointer text-xs border-none"
                >
                  إضافة المنتج الجديد إلى جدول المشتريات
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>

      {/* MAIN PANEL - DIVERSIFIED DAILY PURCHASE SHEET (بعرض كامل) */}
      <div className="lg:col-span-12 space-y-6">
        
        {/* Interactive Draft Sheet */}
        <div className="bg-white border border-slate-200 p-6 rounded-3xl shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="space-y-0.5 text-right">
              <span className="text-xs bg-accent-50 text-accent-700 font-bold px-2.5 py-0.5 rounded-full inline-block">حالة المسودة: قيد التعديل والتخصيص</span>
              <h4 className="font-semibold text-sm text-slate-900 mt-1">مسودة قائمة الشراء والتوريد النشطة</h4>
              <p className="text-sm text-slate-500 font-bold">قم بتعديل الأعداد، الأسعار، وحالات الصلاحية مباشرة في الجدول لتحديث رصيد المخزن تلقائياً</p>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  confirmDialog({ title: 'تفريغ مسودة المشتريات بالكامل؟', confirmText: 'تفريغ', danger: true })
                    .then(ok => { if (ok) setPurchaseDraft([]); });
                }}
                className="text-sm text-danger-500 hover:text-danger-700 font-semibold bg-danger-50 hover:bg-danger-100 px-3 py-1.5 rounded-xl transition cursor-pointer border-none"
              >
                مسح المسودة
              </button>
            </div>
          </div>

          {purchaseDraft.length === 0 ? (
            <div className="p-12 text-center border-2 border-dashed border-slate-100 rounded-2xl bg-slate-50/50 space-y-3">
              <ClipboardList className="w-10 h-10 text-slate-300 mx-auto" />
              <strong className="text-xs text-slate-700 block">جدول الشراء اليومي فارغ تماماً</strong>
              <p className="text-sm text-slate-500 max-w-sm mx-auto font-bold leading-relaxed">
                ابدأ الآن بإضافة منتجاتك المطلوبة، أو ابحث عن النواقص بالاسم، أو تصفّح النواقص التي أوشكت صلاحيتها على الانتهاء، أو استخدم مسدس الكاميرا المحاكي.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              
              {/* بطاقات الأصناف — بديل الجدول العريض: كل صنف بطاقة تلتفّ حقولها على عرض الشاشة
                  فتظهر كاملة في شاشة واحدة بلا تمرير أفقي. كل المعالجات كما كانت في الجدول. */}
              <div className="space-y-2.5">
                {purchaseDraft.map((item) => {
                  const subTotal = (item.qty || 0) * (item.price || 0);
                  // الرصيد الحقيقي الحالي للصنف في المخزن (مصدره inventory لا كمية المسودة)
                  const liveMed = inventory.find(m => m.id === item.medicineId);
                  const liveQty = liveMed?.availableQuantity ?? 0;
                  const fieldCls = 'w-full rounded-lg border p-1.5 tabular-nums text-center text-xs focus:outline-primary-500';
                  const labelCls = 'block text-xs font-bold text-slate-500 mb-0.5 text-center';
                  return (
                    <div key={item.id} className="bg-white border border-slate-200 rounded-2xl p-3 space-y-2.5 hover:border-slate-300 transition">

                      {/* الصف الأول: الاسم والرصيد والباركود — والإجمالي وزر الحذف */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 space-y-0.5">
                          {/* الاسم العربي (ثلاث نقرات للتعديل) + الرصيد الحقيقي بالمخزن بجانبه */}
                          <div className="flex items-center gap-2 flex-wrap">
                            {editingDraftField !== null && editingDraftField.id === item.id && editingDraftField.field === 'nameAr' ? (
                              <input
                                autoFocus
                                type="text"
                                value={editingDraftValue}
                                onChange={e => setEditingDraftValue(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
                                  else if (e.key === 'Escape') { draftEditCancelRef.current = true; (e.target as HTMLInputElement).blur(); }
                                }}
                                onBlur={saveDraftField}
                                className="text-slate-900 font-bold text-xs flex-1 min-w-0 bg-accent-50 border border-accent-300 rounded px-1 focus:outline-accent-500 text-right"
                                title="اضغط Enter للحفظ أو Escape للإلغاء"
                              />
                            ) : (
                              <strong
                                className="text-slate-900 font-bold text-sm cursor-text select-none"
                                title="انقر ثلاث مرات لتعديل الاسم العربي"
                                onClick={e => { if (e.detail === 3) startEditDraftField(item, 'nameAr'); }}
                              >{item.nameAr}</strong>
                            )}
                            {item.medicineId && liveMed ? (
                              editingDraftStockId === item.id ? (
                                <input
                                  type="number"
                                  min={0}
                                  autoFocus
                                  defaultValue={item.stockCorrection ?? liveQty}
                                  onBlur={e => saveDraftStock(item.id, liveQty, e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingDraftStockId(null); }}
                                  className="w-16 bg-white border border-info-400 rounded-full px-2 py-0.5 text-xs font-bold text-info-900 text-center focus:outline-info-500"
                                />
                              ) : (() => {
                                const effQty = item.stockCorrection ?? liveQty;
                                const corrected = item.stockCorrection !== undefined && item.stockCorrection !== liveQty;
                                return (
                                  <span
                                    onDoubleClick={() => setEditingDraftStockId(item.id)}
                                    className={`text-xs font-bold px-1.5 py-0.5 rounded-full shrink-0 cursor-pointer ${corrected ? 'bg-warn-100 text-warn-800 border border-warn-300' : effQty <= 0 ? 'bg-danger-100 text-danger-700' : effQty < (liveMed.minStock ?? 15) ? 'bg-warn-100 text-warn-700' : 'bg-primary-50 text-primary-700'}`}
                                    title="الرصيد الحالي في المخزن — انقر مرتين لتصحيحه"
                                  >بالمخزن: {effQty}{corrected ? ' ✎' : ''}</span>
                                );
                              })()
                            ) : (
                              <span className="text-xs font-bold px-1.5 py-0.5 rounded-full shrink-0 bg-info-50 text-info-700" title="صنف جديد غير موجود بالمخزن بعد">جديد</span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span className="text-xs text-slate-500 tabular-nums">
                              {item.nameEn} • {item.scientificName}
                            </span>
                            {/* الباركود — ثلاث نقرات للتعديل مع انتشار للمخزون */}
                            {editingDraftField !== null && editingDraftField.id === item.id && editingDraftField.field === 'barcode' ? (
                              <input
                                autoFocus
                                type="text"
                                value={editingDraftValue}
                                onChange={e => setEditingDraftValue(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
                                  else if (e.key === 'Escape') { draftEditCancelRef.current = true; (e.target as HTMLInputElement).blur(); }
                                }}
                                onBlur={saveDraftField}
                                className="text-xs text-slate-500 tabular-nums bg-accent-50 border border-accent-300 rounded px-1 w-24 text-right focus:outline-accent-500"
                                title="اضغط Enter للحفظ أو Escape للإلغاء"
                              />
                            ) : (
                              <span
                                className="text-xs text-slate-500 tabular-nums cursor-text select-none border-b border-dashed border-slate-200"
                                title="انقر ثلاث مرات لتعديل الباركود"
                                onClick={e => { if (e.detail === 3) startEditDraftField(item, 'barcode'); }}
                              >{item.barcode || '—'}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-left">
                            <span className="block text-xs font-bold text-slate-500">الإجمالي</span>
                            <span className="tabular-nums font-semibold text-slate-800 text-sm">{fmtNum(subTotal)} <span className="text-xs">د.ع</span></span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setPurchaseDraft(prev => prev.filter(d => d.id !== item.id));
                            }}
                            className="text-slate-500 hover:text-danger-600 p-1.5 rounded-lg hover:bg-danger-50 transition cursor-pointer border-none"
                            title="حذف هذا الدواء"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* الصف الثاني: الحقول القابلة للتعديل — تلتفّ على عرض الشاشة */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                        {/* الكمية */}
                        <div>
                          <label className={labelCls}>الكمية (علبة)</label>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setPurchaseDraft(prev => prev.map(d => d.id === item.id ? { ...d, qty: Math.max(1, Number(d.qty) - 5) } : d));
                              }}
                              className="w-10 h-10 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg flex items-center justify-center transition focus:outline-none border-none cursor-pointer shrink-0"
                              title="−5"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min="1"
                              value={item.qty}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setPurchaseDraft(prev => prev.map(d => d.id === item.id ? { ...d, qty: isNaN(val) ? 1 : val } : d));
                              }}
                              className={`${fieldCls} bg-slate-50 border-slate-200 text-slate-900 min-w-0`}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setPurchaseDraft(prev => prev.map(d => d.id === item.id ? { ...d, qty: Number(d.qty) + 10 } : d));
                              }}
                              className="w-10 h-10 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg flex items-center justify-center transition focus:outline-none border-none cursor-pointer shrink-0"
                              title="+10"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        {/* سعر الجملة */}
                        <div>
                          <label className={labelCls}>سعر الجملة (د.ع)</label>
                          <input
                            type="number"
                            step="250"
                            value={item.price}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setPurchaseDraft(prev => prev.map(d => d.id === item.id ? { ...d, price: isNaN(val) ? 0 : val } : d));
                            }}
                            className={`${fieldCls} bg-slate-50 border-slate-200 text-slate-900`}
                          />
                        </div>

                        {/* سعر البيع للجمهور — يُحدّث inventory.price مباشرة */}
                        <div>
                          <label className={`${labelCls} text-info-700`}>البيع للجمهور (د.ع)</label>
                          <input
                            type="number"
                            step="250"
                            value={item.retailPrice ?? ''}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              if (isNaN(val)) return;
                              setPurchaseDraft(prev => prev.map(d => d.id === item.id ? { ...d, retailPrice: val } : d));
                              setInventory(prev => prev.map(m => m.id === item.medicineId ? { ...m, price: val } : m));
                            }}
                            className={`${fieldCls} bg-info-50 border-info-200 text-info-900 focus:outline-info-400`}
                          />
                        </div>

                        {/* سعر البيع الرسمي — يُحدّث inventory.secondaryPrice مباشرة */}
                        <div>
                          <label className={`${labelCls} text-special-700`}>البيع الرسمي (د.ع)</label>
                          <input
                            type="number"
                            step="250"
                            value={item.officialPrice ?? ''}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              if (isNaN(val)) return;
                              setPurchaseDraft(prev => prev.map(d => d.id === item.id ? { ...d, officialPrice: val } : d));
                              setInventory(prev => prev.map(m => m.id === item.medicineId ? { ...m, secondaryPrice: val } : m));
                            }}
                            className={`${fieldCls} bg-special-50 border-special-200 text-special-900 focus:outline-special-400`}
                          />
                        </div>

                        {/* الانتهاء — يعرض آخر تاريخ محفوظ ويحدّثه عند التعديل */}
                        <div className="col-span-2 sm:col-span-1">
                          <label className={labelCls}>انتهاء الصلاحية</label>
                          <input
                            type="date"
                            value={expiryDates[item.medicineId] || item.expiryDate || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setPurchaseDraft(prev => prev.map(d => d.id === item.id ? { ...d, expiryDate: val } : d));
                              if (item.medicineId) setExpiryDates(prev => ({ ...prev, [item.medicineId]: val }));
                            }}
                            className={`${fieldCls} bg-slate-50 border-slate-200 text-slate-900 text-sm`}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Summary panel & Dynamic updating math displays */}
              <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1.5 text-right font-bold text-slate-700">
                  <div className="flex items-center gap-2 text-xs">
                    <span>مجموع المنتجات المسجلة للتوريد:</span>
                    <span className="bg-primary-100 text-primary-800 tabular-nums px-2.5 py-0.5 rounded-full text-sm">
                      {purchaseDraft.reduce((acc, curr) => acc + Number(curr.qty), 0)} علبة إجمالية
                    </span>
                  </div>
                  <div className="text-sm text-slate-500 leading-normal font-medium">
                    <p>سعر توريد الجملة النهائي خاضع لحسابات الصيدلية و يحدّث أرصدة دواء صيدلية انوار الحسن مع تطبيق الأرباح تلقائياً عند التأكيد.</p>
                  </div>

                  <div className="pt-1 space-y-2">
                    {/* المورّد الموحّد — يُختار من الموردين المحفوظين عبر قائمة منسدلة،
                        أو يُكتب اسم جديد فيُحفظ كمورد عند اعتماد الشراء */}
                    <div className="space-y-1">
                      <label className="block text-slate-500 text-sm font-bold">المورّد (يُطبَّق على كل الأصناف)</label>
                      <SupplierPicker suppliers={suppliers} value={purchaseSupplier} onChange={applyDraftSupplier} />
                    </div>

                    {/* شراء بالآجل: تسجيل الفاتورة كذمّة على المذخر بدل خصمها نقداً */}
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={purchaseOnCredit}
                        onChange={(e) => setPurchaseOnCredit(e.target.checked)}
                        className="w-4 h-4 accent-danger-600 cursor-pointer"
                      />
                      <span className="text-sm font-bold text-danger-700">شراء بالآجل (على حساب المذخر)</span>
                    </label>
                    {purchaseOnCredit && (
                      <p className="text-xs text-danger-500 font-bold leading-normal">* لن تُخصم القيمة من الصندوق، وستُسجَّل كذمّة مستحقة في دفتر ديون الموردين باسم المورّد المحدّد أعلاه.</p>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2 text-right shrink-0">
                  <span className="text-sm text-slate-500 font-bold">إجمالي فاتورة الشراء المتبقية:</span>
                  <strong className="text-xl text-primary-700 tabular-nums font-semibold tracking-wide">
                    {fmtNum(purchaseDraft.reduce((acc, curr) => acc + (curr.price * curr.qty), 0))} د.ع
                  </strong>
                </div>
              </div>

              {/* Large final CTA to store products in pharmacy index and refresh levels */}
              <button
                type="button"
                onClick={commitPurchaseDraft}
                className="w-full bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white font-bold py-3 px-5 rounded-2xl flex items-center justify-center gap-2 transition shadow-md cursor-pointer hover:shadow-primary-200 text-sm border-none"
              >
                <CheckCircle2 className="w-5 h-5 text-primary-100 animate-pulse" />
                <span>تأكيد واعتماد طلبيات الشراء وتغذية المخزون الفوري</span>
              </button>

            </div>
          )}
        </div>

        {/* ARCHIVED PAST PURCHASE ORDERS (المشتريات السابقة والموثقة) */}
        <div className="bg-white border border-slate-200 p-6 rounded-3xl shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-accent-600" />
              <h4 className="font-semibold text-xs text-slate-900">سجل قوائم المشتريات والطلبيات السابقة</h4>
            </div>
            <span className="text-sm text-slate-500 font-bold">حالة تدفق الفواتير: موثقة بكامل القيود</span>
          </div>

          {/* حقل البحث برقم القائمة أو اسم المورد */}
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
            <input
              type="text"
              value={b2bOrderSearch}
              onChange={e => setB2bOrderSearch(e.target.value)}
              placeholder="ابحث برقم القائمة (مثال: CAP-28109) أو اسم المورد..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-8 pl-3 py-2 text-sm font-bold text-slate-700 placeholder:text-slate-500 placeholder:font-normal focus:outline-none focus:border-accent-400 focus:ring-1 focus:ring-accent-200 transition"
            />
            {b2bOrderSearch && (
              <button
                type="button"
                onClick={() => setB2bOrderSearch('')}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-600 transition bg-transparent border-none cursor-pointer p-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {(() => {
            const q = b2bOrderSearch.trim().toLowerCase();
            const filtered = q
              ? b2bOrders.filter(o =>
                  o.id.toLowerCase().includes(q) ||
                  (o.warehouseName || '').toLowerCase().includes(q)
                )
              : b2bOrders;

            if (b2bOrders.length === 0) {
              return <p className="p-8 text-center text-sm text-slate-500 font-bold">لا يوجد طلبيات شراء سابقة مسجلة حالياً.</p>;
            }
            if (filtered.length === 0) {
              return (
                <div className="p-6 text-center space-y-1">
                  <p className="text-sm text-slate-500 font-bold">لا توجد نتائج لـ «{b2bOrderSearch}»</p>
                  <p className="text-sm text-slate-500 font-medium">تأكد من رقم القائمة أو اسم المورد</p>
                </div>
              );
            }

            return (
            <div className="space-y-3.5">
              {filtered.map((order) => {
                // اسم المورد: مورد الآجل أولاً، ثم المورّد المحفوظ ضمن بنود اللقطة، ثم اسم المخزن
                const supplierLabel =
                  (order.onCredit && order.creditSupplierName && order.creditSupplierName.trim())
                    ? order.creditSupplierName.trim()
                    : (Array.isArray(order.draftSnapshot)
                        ? (order.draftSnapshot.find((d: any) => d.warehouse && String(d.warehouse).trim())?.warehouse || '')
                        : '')
                      || (order.warehouseName && order.warehouseName.trim())
                      || 'مورد غير محدد';
                return (
                <div key={order.id} className="bg-slate-50 hover:bg-slate-100/50 p-4 rounded-2xl border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs transition">
                  <div className="space-y-1 text-right">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="flex items-center gap-1.5 bg-accent-50 text-accent-800 border border-accent-200 px-2.5 py-1 rounded-lg font-semibold text-sm">
                        <Truck className="w-3.5 h-3.5 text-accent-600" />
                        <span>المورد: {supplierLabel}</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <strong className="text-slate-900 tabular-nums font-bold">{order.id}</strong>
                      <span className="text-xs bg-slate-200 text-slate-600 px-2.5 py-0.2 rounded font-sans font-bold">
                        {order.warehouseName || "توريد مباشر"}
                      </span>
                    </div>
                    <span className="text-sm text-slate-500 tabular-nums block">التاريخ والمشرف: {order.date} • {order.itemsCount} أدوية مختلفة</span>
                    
                    {/* Detailed medicine items in order */}
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {order.items && order.items.map((item, id) => (
                        <span key={id} className="text-xs bg-white border border-slate-200/60 text-slate-600 px-2.5 py-0.5 rounded-lg font-bold">
                          {item.medicineName} x{item.quantity}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-right sm:text-left shrink-0">
                    <div className="space-y-1">
                      <span className="text-sm text-slate-500 block font-bold">إجمالي المدفوع:</span>
                      <strong className="text-sm text-slate-950 tabular-nums font-bold">
                        {fmtNum(order.totalAmount)} د.ع
                      </strong>
                    </div>

                    <div className="flex flex-col items-stretch gap-1.5">
                      <span className="px-3 py-1 bg-primary-50 text-primary-800 border border-primary-100 rounded-xl font-semibold text-sm text-center">
                        تم استيرادها بالكامل ✅
                      </span>
                      <button
                        type="button"
                        onClick={() => reopenPurchaseOrderForEdit(order.id)}
                        title="إعادة فتح الطلبية للتعديل — يُعكس أثرها على المخزون والحسابات وتعود بنودها إلى المسودة"
                        className="px-3 py-1 bg-warn-50 hover:bg-warn-100 text-warn-800 border border-warn-200 rounded-xl font-semibold text-sm flex items-center justify-center gap-1 transition cursor-pointer"
                      >
                        <Pencil className="w-3 h-3" />
                        <span>تعديل القائمة</span>
                      </button>
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
            );
          })()}
        </div>

      </div>

    </div>
  </motion.div>
  );
}
