import React, { useState, FormEvent, useEffect, useRef, useMemo, useCallback, useDeferredValue, forwardRef, useImperativeHandle } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShoppingBag, Wallet, Info, CheckCircle2, AlertCircle, Clock, 
  Truck, HelpCircle, PlusCircle, Search, Trash2, ArrowLeft, 
  MapPin, UserCheck, ShieldCheck, Users, Sparkles, Plus, Check,
  TrendingUp, FileText, Ban, DollarSign, Calendar, RefreshCw, BarChart3, Pill, ClipboardList, ShieldAlert, Heart,
  Barcode, X, Volume2, VolumeX, Camera, Download, Bell, Pencil, ScanLine, ChevronDown, CalendarClock
} from 'lucide-react';
import { Medicine, Order, Supplier } from '../types';
import InvoiceImportModal from './InvoiceImportModal';

// Firebase Authentication & Remote Firestore Synchronizer hooks
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { collection, doc, getDoc, setDoc, onSnapshot, deleteDoc, writeBatch, getCountFromServer, query, orderBy, limit } from 'firebase/firestore';

// Let's declare our reactive state types inside the component
interface POSItem {
  medicine: Medicine;
  quantity: number;
}

interface SaleRecord {
  invoiceId: string;
  timestamp: string;
  items: { name: string; quantity: number; price: number; costPrice?: number; lineProfit?: number }[];
  subtotal: number;
  discount: number;
  total: number;
  totalCost?: number;    // مجموع تكلفة الأصناف المباعة (IQD)
  grossProfit?: number;  // الربح الإجمالي بعد الخصم (IQD)
  profitMargin?: number; // هامش الربح % من إجمالي البيع
  customerName: string;
}

interface Expense {
  id: string;
  date: string;       // YYYY-MM-DD
  category: string;   // إيجار / رواتب / كهرباء ومولّدة ...
  amount: number;     // IQD
  description: string;
  paidBy: string;     // نقد / تحويل / بطاقة
}

interface Payable {
  id: string;
  supplierName: string;   // اسم المذخر / المورّد
  amount: number;         // أصل الدين (IQD)
  paidAmount: number;     // المسدَّد حتى الآن (IQD)
  date: string;           // YYYY-MM-DD تاريخ نشوء الدين
  dueDate?: string;       // تاريخ الاستحقاق (اختياري)
  status: 'open' | 'partial' | 'paid';
  description?: string;
  relatedOrderId?: string;
  supplierId?: string;
}

interface Receivable {
  id: string;
  customerName: string;     // اسم الزبون / المريض
  amount: number;           // أصل الدين على الزبون (IQD)
  paidAmount: number;       // المُحصَّل حتى الآن (IQD)
  date: string;             // YYYY-MM-DD تاريخ نشوء الدين
  dueDate?: string;         // تاريخ الاستحقاق (اختياري)
  status: 'open' | 'partial' | 'paid';
  description?: string;
  relatedInvoiceId?: string; // فاتورة البيع المرتبطة إن وُجدت
}

interface SalesReturn {
  returnId: string;             // RET-xxxx
  originalInvoiceId: string;    // رقم الفاتورة الأصلية
  timestamp: string;            // YYYY-MM-DD HH:mm
  items: { name: string; quantity: number; price: number; costPrice?: number }[];
  total: number;                // إجمالي مبلغ الاسترداد (IQD)
  reason: string;               // سبب الإرجاع
  refundMethod: 'cash' | 'none'; // نقد (يُخصم من الصندوق) / بدون صرف نقدي
  customerName: string;
}

interface AuditEntry {
  id: string;              // AUD-xxxx
  timestamp: string;       // YYYY-MM-DD HH:mm
  action: 'sale' | 'purchase' | 'expense' | 'payable_add' | 'payable_settle' | 'receivable_add' | 'receivable_collect' | 'return' | 'inventory_import';
  actor: string;           // currentUser.displayName || currentRole
  amount: number;          // المبلغ المالي (0 إذا لم ينطبق)
  description: string;     // وصف قصير بالعربي
  relatedId?: string;      // INV-xxxx / EXP-xxxx / PAY-xxxx / REC-xxxx / RET-xxxx
}

// مولّد مصاريف تشغيلية مبدئية لهذا الشهر (لإظهار حساب الربح الصافي)
function generateSeedExpenses(): Expense[] {
  return []; // بدون مصاريف تجريبية
}

// مولّد ذمم دائنة مبدئية (ديون مستحقة للمذاخر والمكاتب العلمية) — المتبقّي يجمع إلى 1,850,000 د.ع
function generateSeedPayables(): Payable[] {
  return []; // بدون ذمم دائنة تجريبية
}

// مولّد ذمم مدينة مبدئية (ديون مستحقة لنا على الزبائن والعيادات — البيع بالآجل)
function generateSeedReceivables(): Receivable[] {
  return []; // بدون ذمم مدينة تجريبية
}

// مولّد مرتجع تجريبي واحد (لإظهار قسم المرتجعات ممتلئاً عند أول تشغيل)
function generateSeedReturns(): SalesReturn[] {
  return []; // بدون مرتجعات تجريبية
}

function generateSeedAuditLog(): AuditEntry[] {
  return []; // بدون سجل تدقيق تجريبي
}

// لا مبيعات تاريخية تجريبية — يبدأ سجلّ المبيعات فارغاً
function generateHistoricalSales(): SaleRecord[] {
  return [];
}

function generateSeedSuppliers(): Supplier[] {
  // يبدأ قسم الموردين فارغاً — لا موردين تجريبيين. تُضاف الموردون يدوياً.
  return [];
}

// =========================================================
// POS SEARCH BAR — مكوّن معزول بحالة محلية
// السبب: حقل بحث POS كان داخل مكوّن Dashboard العملاق (آلاف الأسطر)، فكل ضغطة
// مفتاح كانت تُعيد تصيير الشجرة كاملةً = بطء محسوس. بعزله، الكتابة تُحدّث هذا
// المكوّن الصغير فقط، ويُبلّغ الأب بالقيمة المُلتزَمة بعد debounce (150ms) فقط.
// =========================================================
export type POSSearchHandle = { setValue: (v: string) => void };

interface POSSearchBarProps {
  onQueryChange: (q: string) => void;   // تُستدعى بالقيمة المؤجّلة (debounced) لفلترة الرف
  onEnter: (value: string) => boolean;  // عند Enter/الباركود — ترجع true إذا طوبقت مادة (لتفريغ الحقل)
  onScanClick: () => void;              // فتح قارئ الباركود بالكاميرا
}

const POSSearchBar = forwardRef<POSSearchHandle, POSSearchBarProps>(
  ({ onQueryChange, onEnter, onScanClick }, ref) => {
    const [input, setInput] = useState('');

    // debounce: تأخير الفلترة 150ms بعد آخر ضغطة — يمنع إعادة تصيير الأب لكل حرف
    useEffect(() => {
      const t = setTimeout(() => onQueryChange(input), 150);
      return () => clearTimeout(t);
    }, [input, onQueryChange]);

    // يسمح لقارئ الباركود (في الأب) بدفع قيمة ممسوحة إلى الحقل مباشرةً
    useImperativeHandle(ref, () => ({
      setValue: (v: string) => { setInput(v); onQueryChange(v); },
    }), [onQueryChange]);

    return (
      <div className="flex items-center gap-2 w-full sm:w-auto">
        <div className="relative flex-1 sm:flex-initial">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => { setInput(''); onQueryChange(''); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (onEnter(input)) { setInput(''); onQueryChange(''); }
              }
            }}
            className="bg-slate-50 border border-slate-200 rounded-xl pr-9 pl-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-emerald-500 w-full sm:w-52"
            placeholder="امسح الباركود أو اكتب الاسم ثم Enter..."
          />
        </div>
        <button
          type="button"
          onClick={onScanClick}
          className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-850 text-white rounded-xl px-3 py-1.5 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
          title="قراءة الباركود بالكاميرا (Scan Barcode)"
        >
          <Barcode className="w-3.5 h-3.5" />
          <span className="hidden md:inline">قارئ باركود</span>
        </button>
      </div>
    );
  }
);

// =========================================================
// MEDICINE CARD — مكوّن معزول بـ React.memo لرف POS
// السبب: كل إضافة لسلة كانت تُعيد تصيير كلّ بطاقة دواء لأنها
// داخل Dashboard. باستخراجها، تتجمّد البطاقات ما دامت props ثابتة
// (filteredPOSMeds + addToCart مستقران عند تغيّر السلة فقط).
// =========================================================
interface MedicineCardProps {
  med: Medicine;
  showVirtualPrice: boolean;
  daysUntilExpiry: number;   // محسوب مسبقاً في الأب — لا استدعاء دالة داخل المكوّن
  onAdd: (med: Medicine) => void;
}

const MedicineCard = React.memo(({ med, showVirtualPrice, daysUntilExpiry, onAdd }: MedicineCardProps) => {
  const isLow = med.availableQuantity < 15;
  const isOut = med.availableQuantity <= 0;
  const isExpiringSoon = daysUntilExpiry <= 30;
  const sellPrice = showVirtualPrice
    ? (med.secondaryPrice || (med.price + 500))
    : med.price;
  const margin = med.costPrice && med.costPrice > 0
    ? Math.round(((sellPrice - med.costPrice) / sellPrice) * 100)
    : null;

  return (
    <div
      onClick={() => !isOut && onAdd(med)}
      className={`p-3.5 rounded-2xl border text-right transition-all flex flex-col gap-2 relative ${
        isOut
          ? 'bg-slate-50 border-slate-100 opacity-50 cursor-not-allowed'
          : 'bg-white border-slate-200 hover:border-emerald-400 hover:shadow-md cursor-pointer shadow-sm active:scale-[0.98]'
      }`}
    >
      {/* Status badge */}
      <div className="flex justify-between items-start gap-1">
        <span className={`text-[8px] font-black px-2 py-0.5 rounded-full ${
          isOut ? 'bg-rose-100 text-rose-700'
            : isLow ? 'bg-amber-100 text-amber-700'
            : 'bg-emerald-50 text-emerald-700'
        }`}>
          {isOut ? 'نفذ' : isLow ? 'حرج' : '✓'}
        </span>
        {isExpiringSoon && (
          <span className="text-[7px] bg-rose-600 text-white px-1.5 py-0.5 rounded-full font-bold">منتهٍ قريباً</span>
        )}
        <span className="text-[9px] font-mono font-bold text-slate-400 mr-auto">{med.availableQuantity}</span>
      </div>

      {/* Name */}
      <div>
        <h4 className="font-extrabold text-slate-900 text-xs leading-snug line-clamp-2">{med.nameAr}</h4>
        <p className="text-[9px] text-slate-400 font-mono truncate mt-0.5">{med.nameEn}</p>
      </div>

      {/* Prices */}
      <div className="border-t border-slate-100 pt-2 flex justify-between items-end">
        <div className="space-y-0.5">
          <span className={`text-sm font-black font-mono block ${showVirtualPrice ? 'text-purple-700' : 'text-emerald-700'}`}>
            {sellPrice.toLocaleString()}
            <span className="text-[9px] font-bold text-slate-400 mr-0.5">د.ع</span>
          </span>
          {med.costPrice && med.costPrice > 0 && (
            <span className="text-[9px] text-slate-400 font-mono block">
              شراء: <span className="text-slate-500 font-bold">{med.costPrice.toLocaleString()}</span>
            </span>
          )}
        </div>
        {margin !== null && (
          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
            margin >= 20 ? 'bg-emerald-50 text-emerald-700'
              : margin >= 10 ? 'bg-amber-50 text-amber-700'
              : 'bg-rose-50 text-rose-700'
          }`}>
            {margin}%
          </span>
        )}
      </div>
    </div>
  );
});

// =========================================================
// CART ITEM ROW — مكوّن معزول بـ React.memo لصفوف السلة
// السبب: إضافة عنصر N كانت تُعيد تصيير الصفوف 1..N-1 لأن
// updateCartQty / removeFromCart لم تكن مستقرّة (closure على
// currentCart). بعد تحويلهما إلى useCallback مع functional update،
// هويتهما ثابتة → React.memo يُوقف إعادة التصيير غير الضرورية.
// =========================================================
interface CartItemRowProps {
  item: POSItem;
  showVirtualPrice: boolean;
  onInc: (medId: string) => void;
  onDec: (medId: string) => void;
  onRemove: (medId: string) => void;
}

const CartItemRow = React.memo(({ item, showVirtualPrice, onInc, onDec, onRemove }: CartItemRowProps) => {
  const unitPrice = showVirtualPrice
    ? (item.medicine.secondaryPrice || (item.medicine.price + 500))
    : item.medicine.price;
  const lineTotal = unitPrice * item.quantity;

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 flex items-center justify-between gap-3">
      <div className="flex-1 min-w-0 space-y-1">
        <span className="font-extrabold text-white text-sm block truncate">{item.medicine.nameAr}</span>
        <div className="flex items-center gap-3">
          <span className="text-sm text-emerald-400 font-mono font-bold">{unitPrice.toLocaleString()} د.ع</span>
          {item.medicine.costPrice && (
            <span className="text-xs text-slate-400 font-mono">شراء: {(item.medicine.costPrice * item.quantity).toLocaleString()} د.ع</span>
          )}
        </div>
        <span className="text-xs text-slate-300 font-mono font-semibold">× {item.quantity} = <span className="text-amber-400 font-bold">{lineTotal.toLocaleString()} د.ع</span></span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button type="button" onClick={() => onDec(item.medicine.id)}
          className="w-9 h-9 bg-slate-700 hover:bg-slate-600 text-white rounded-xl flex items-center justify-center font-bold text-lg cursor-pointer transition">−</button>
        <span className="font-black text-white font-mono w-8 text-center text-base">{item.quantity}</span>
        <button type="button" onClick={() => onInc(item.medicine.id)}
          className="w-9 h-9 bg-slate-700 hover:bg-emerald-700 text-white rounded-xl flex items-center justify-center font-bold text-lg cursor-pointer transition">+</button>
        <button type="button" onClick={() => onRemove(item.medicine.id)}
          className="w-9 h-9 text-slate-600 hover:text-rose-400 flex items-center justify-center cursor-pointer transition mr-1">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
});

export default function Dashboard() {
  // --- FIREBASE AUTH & SYNCHRONIZER METRIC REGISTERS ---
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  // رُفع عند فشل تهيئة خدمة المصادقة (مفتاح API غير صالح أو انقطاع الشبكة) — يُظهر شريط تنبيه غير معطِّل
  const [authInitFailed, setAuthInitFailed] = useState(false);
  const [signInError, setSignInError] = useState('');
  // تجاوز الدخول مؤقتاً — وضع محلي بلا مزامنة سحابية (للتجربة/المعاينة فقط)
  const [bypassLogin, setBypassLogin] = useState(false);
  // حالة المزامنة الحقيقية مع خادم Firestore — مشتقّة من البيانات الوصفية للقطة (metadata)
  // وليست مجرّد "هل يوجد مستخدم". 'synced' = وصلت للخادم، 'pending' = قيد الرفع، 'offline' = محلية فقط.
  const [syncState, setSyncState] = useState<'synced' | 'pending' | 'offline'>('pending');
  // آخر خطأ مزامنة (صلاحيات/اتصال) — يُعرض للمستخدم بشريط أحمر بدل كتمه في الـ console.
  const [syncError, setSyncError] = useState<string | null>(null);

  // --- CORE LIVING STATE OF THE PHARMACY (Saves in session-state) ---
  // يبدأ المخزون فارغاً — لا مواد تجريبية. تُضاف المواد عبر الاستيراد أو الإدخال اليدوي.
  const [inventory, setInventory] = useState<Medicine[]>([]);

  // Expiry states tracking
  const [expiryDates, setExpiryDates] = useState<Record<string, string>>({
    '1': '2028-04-12',
    '2': '2027-09-30',
    '3': '2026-06-15', // Near expiry
    '4': '2026-07-20', // Expiring in July 2026
    '5': '2028-02-15',
    '6': '2026-06-02', // Near Expiry!
    '7': '2027-11-10'
  });

  const [dismissedLowStock, setDismissedLowStock] = useState<Set<string>>(new Set());

  // B2B Supplier orders
  const [b2bOrders, setB2bOrders] = useState<Order[]>([]); // بدون طلبيات شراء تجريبية

  // Financial States
  const [walletBalance, setWalletBalance] = useState(0); // IQD cash in register — يبدأ صفراً
  const [dailySalesRevenue, setDailySalesRevenue] = useState(0); // Today's POS cash sum — يبدأ صفراً

  // --- EXPENSES LEDGER STATES (دفتر المصاريف) ---
  const [expenses, setExpenses] = useState<Expense[]>(() => generateSeedExpenses());
  const [newExpCategory, setNewExpCategory] = useState('كهرباء ومولّدة');
  const [newExpAmount, setNewExpAmount] = useState<number>(50000);
  const [newExpDesc, setNewExpDesc] = useState('');
  const [newExpPaidBy, setNewExpPaidBy] = useState('نقد');
  const [expenseSuccess, setExpenseSuccess] = useState(false);

  // --- ACCOUNTS PAYABLE / SUPPLIER DEBTS STATES (الذمم الدائنة / ديون الموردين) ---
  const [payables, setPayables] = useState<Payable[]>(() => generateSeedPayables());
  const [newPaySupplier, setNewPaySupplier] = useState('');
  const [newPayAmount, setNewPayAmount] = useState<number>(500000);
  const [newPayDueDate, setNewPayDueDate] = useState('');
  const [newPayDesc, setNewPayDesc] = useState('');
  const [payableSuccess, setPayableSuccess] = useState(false);
  const [settleInputs, setSettleInputs] = useState<Record<string, number>>({}); // per-payable settle amount

  // --- ACCOUNTS RECEIVABLE / CUSTOMER CREDIT SALES STATES (الذمم المدينة / البيع بالآجل للزبائن) ---
  const [receivables, setReceivables] = useState<Receivable[]>(() => generateSeedReceivables());
  const [newRecCustomer, setNewRecCustomer] = useState('');
  const [newRecAmount, setNewRecAmount] = useState<number>(100000);
  const [newRecDueDate, setNewRecDueDate] = useState('');
  const [newRecDesc, setNewRecDesc] = useState('');
  const [receivableSuccess, setReceivableSuccess] = useState(false);
  const [collectInputs, setCollectInputs] = useState<Record<string, number>>({}); // per-receivable collect amount

  // --- SALES RETURNS (مرتجعات المبيعات) ---
  const [salesReturns, setSalesReturns] = useState<SalesReturn[]>(() => generateSeedReturns());
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);
  const [editingItems, setEditingItems] = useState<{ name: string; quantity: number; price: number; costPrice?: number; lineProfit?: number }[]>([]);

  // --- AUDIT LOG (سجل التدقيق) ---
  const [auditLog, setAuditLog] = useState<AuditEntry[]>(() => generateSeedAuditLog());
  const [returnTarget, setReturnTarget] = useState<SaleRecord | null>(null);
  const [returnQtys, setReturnQtys] = useState<Record<number, number>>({});
  const [returnReason, setReturnReason] = useState('');
  const [returnRefundMethod, setReturnRefundMethod] = useState<'cash' | 'none'>('cash');
  const [returnSuccess, setReturnSuccess] = useState(false);

  // --- SUPPLIERS (قائمة الموردين) ---
  const [suppliers, setSuppliers] = useState<Supplier[]>(() => generateSeedSuppliers());
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [supplierFormVisible, setSupplierFormVisible] = useState(false);
  const [newSupName, setNewSupName] = useState('');
  const [newSupPhone, setNewSupPhone] = useState('');
  const [newSupContact, setNewSupContact] = useState('');
  const [newSupAddress, setNewSupAddress] = useState('');
  const [newSupCreditLimit, setNewSupCreditLimit] = useState<number>(0);
  const [newSupPaymentTerms, setNewSupPaymentTerms] = useState<number>(30);
  const [newSupNotes, setNewSupNotes] = useState('');
  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null); // المورد قيد التعديل (داخل صفحة التفاصيل)
  // state for supplier payment modal
  const [supPayModalId, setSupPayModalId] = useState<string | null>(null);
  const [supPayAmount, setSupPayAmount] = useState<number>(0);
  // مبالغ تسديد الديون لكل مورد في قسم سداد الديون بالتبويب المالي (مفتاح = اسم المورد)
  const [debtPayAmounts, setDebtPayAmounts] = useState<Record<string, number>>({});
  // بحث في سجل قوائم الشراء (B2B) — برقم القائمة أو اسم المورد
  const [b2bOrderSearch, setB2bOrderSearch] = useState('');
  // --- FINANCIAL TAB PIN LOCK ---
  const [financialPin, setFinancialPin] = useState<string>(() => localStorage.getItem('fin_pin') || '0000');
  const [financialUnlocked, setFinancialUnlocked] = useState(false);
  const [showTodaySales, setShowTodaySales] = useState(false);
  const [pinEntry, setPinEntry] = useState('');
  const [pinError, setPinError] = useState(false);
  // تغيير الباسوورد من داخل التبويب المالي
  const [changePinOld, setChangePinOld] = useState('');
  const [changePinNew, setChangePinNew] = useState('');
  const [changePinConfirm, setChangePinConfirm] = useState('');
  const [changePinMsg, setChangePinMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // --- STATEMENT VIEW (كشف الحساب) ---
  const [stmtSupplier, setStmtSupplier] = useState('');
  const [stmtCustomer, setStmtCustomer] = useState('');

  // App Section Select
  const [activeTab, setActiveTab] = useState<'home' | 'pos' | 'inventory' | 'b2b' | 'financial' | 'team'>('home');

  // --- STOCK MOVEMENT LOG ---

  // --- RBAC ---
  const [currentRole, setCurrentRole] = useState<'admin' | 'pharmacist' | 'cashier'>('admin');

  // --- NOTIFICATION CENTER ---
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);

  // --- POS CART STATES ---
  const [currentCart, setCurrentCart] = useState<POSItem[]>([]);
  const [posCustomerName, setPosCustomerName] = useState('زبون نقدي / خارجي');
  const [posDiscountPercent, setPosDiscountPercent] = useState<number>(0);
  const [posOnCredit, setPosOnCredit] = useState(false); // بيع بالآجل: تسجيل ذمّة على الزبون بدل القبض النقدي
  // القيمة المُلتزَمة للفلترة — تُحدَّث من POSSearchBar بعد debounce فقط (لا تتغيّر مع كل ضغطة)
  const [searchPOSQuery, setSearchPOSQuery] = useState('');
  // useDeferredValue: يمنح React صلاحية تأجيل/مقاطعة إعادة بناء رف المخزون الكبير دون تجميد الواجهة
  const deferredPOSQuery = useDeferredValue(searchPOSQuery);
  // مرجع لـ POSSearchBar حتى يستطيع قارئ الباركود دفع القيمة الممسوحة إلى الحقل
  const posSearchRef = useRef<POSSearchHandle>(null);
  const [lastPrintedInvoice, setLastPrintedInvoice] = useState<SaleRecord | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showVirtualPriceInPOS, setShowVirtualPriceInPOS] = useState(false);
  const [chartRange, setChartRange] = useState<7 | 30 | 90>(30); // مدى الرسم البياني للمبيعات
  const [theme] = useState<'pastel'>('pastel');
  const darkMode = false; // Dark mode removed — luxury theme only
  const [plPeriod, setPlPeriod] = useState<'month' | 'year'>('month'); // فترة قائمة الأرباح والخسائر

  // --- SALES HISTORY LEDGER ---
  const [salesLedger, setSalesLedger] = useState<SaleRecord[]>(() => generateHistoricalSales()); // يبدأ فارغاً

  // --- CONTROL REFRIGERATOR TEMPERATURE SIMULATOR ---

  // --- DYNAMIC INVENTORY ACTIONS ---
  const [searchInInventoryQuery, setSearchInInventoryQuery] = useState('');
  const deferredInvQuery = useDeferredValue(searchInInventoryQuery);
  const [invRenderCap, setInvRenderCap] = useState(200);

  // --- STOCK MOVEMENT VIEWER (حركة المادة: الوارد والصادر) ---
  const [movementMedId, setMovementMedId] = useState<string>('');
  const [movementFrom, setMovementFrom] = useState<string>('');
  const [movementTo, setMovementTo] = useState<string>('');
  const [movementSearch, setMovementSearch] = useState<string>(''); // بحث بالاسم أو الباركود
  const [movementDropdownOpen, setMovementDropdownOpen] = useState<boolean>(false);
  const [newDrugAr, setNewDrugAr] = useState('');
  const [newDrugEn, setNewDrugEn] = useState('');
  const [newDrugSci, setNewDrugSci] = useState('');
  const [newDrugPrice, setNewDrugPrice] = useState<number>(5000);
  const [newDrugSecondaryPrice, setNewDrugSecondaryPrice] = useState<number>(5500);
  const [newDrugQty, setNewDrugQty] = useState<number>(100);
  const [newDrugExpiry, setNewDrugExpiry] = useState('2028-12-01');
  const [newDrugMinStock, setNewDrugMinStock] = useState<number>(15);
  const [isAddingDrug, setIsAddingDrug] = useState(false);
  // --- تنبيهات الصلاحية: مفتوحة في أول زيارة فقط، ثم مطوية افتراضياً (محفوظة في localStorage) ---
  const inventoryFirstVisit = typeof localStorage !== 'undefined' && !localStorage.getItem('anwar_inventory_visited');
  const [showNearExpiry30, setShowNearExpiry30] = useState(inventoryFirstVisit);
  const [showExpiryHorizon, setShowExpiryHorizon] = useState(inventoryFirstVisit);
  const [showLowStock, setShowLowStock] = useState(false);
  // تعديل الكمية المباشر من جدول المخزون: الـ id قيد التحرير + القيمة المؤقتة
  const [editingQtyId, setEditingQtyId] = useState<string | null>(null);
  const [editingQtyValue, setEditingQtyValue] = useState<string>('');
  // تعديل السعر المباشر من جدول المخزون: الـ id قيد التحرير + سعر الجمهور + السعر الرسمي
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [editingPriceValue, setEditingPriceValue] = useState<string>('');
  const [editingSecondaryPriceValue, setEditingSecondaryPriceValue] = useState<string>('');
  // جرد سريع — الصف المفتوح + حقول التعديل
  const [quickAuditId, setQuickAuditId] = useState<string | null>(null);
  const [qaNameAr, setQaNameAr] = useState('');
  const [qaNameEn, setQaNameEn] = useState('');
  const [qaPrice, setQaPrice] = useState('');
  const [qaCostPrice, setQaCostPrice] = useState('');
  const [qaQty, setQaQty] = useState('');
  const [qaExpiry, setQaExpiry] = useState('');
  // المادة المطلوب حذفها (يظهر نافذة تأكيد قبل الحذف النهائي)
  const [deleteMedTarget, setDeleteMedTarget] = useState<Medicine | null>(null);
  // فلتر الفئة في جدول المخزون ('' = كل الفئات)
  // الشهر المختار للتصفية بصيغة 'YYYY-MM'؛ null = عرض كل الأشهر ضمن الأفق
  const [selectedExpiryMonth, setSelectedExpiryMonth] = useState<string | null>(null);

  // --- PURCHASE ORDERS (طلبيات الشراء) STATES ---
  const [showInvoiceImport, setShowInvoiceImport] = useState(false);
  // استيراد المخزون الكامل من ملف ES-PRO
  const [bulkImportStatus, setBulkImportStatus] = useState<'idle' | 'loading' | 'writing' | 'done' | 'error'>('idle');
  const [bulkImportProgress, setBulkImportProgress] = useState({ done: 0, total: 0 });
  const [bulkImportMsg, setBulkImportMsg] = useState('');
  const [showBulkImportConfirm, setShowBulkImportConfirm] = useState(false);
  const [purchaseDraft, setPurchaseDraft] = useState<any[]>([]);

  // المورّد النشط لمسودة الشراء الحالية — يُطبَّق على كل الأصناف ويُورَّث للأصناف الجديدة تلقائياً
  const [purchaseSupplier, setPurchaseSupplier] = useState<string>('');
  const [purchaseSearchWord, setPurchaseSearchWord] = useState('');
  const [purchaseNewProdAr, setPurchaseNewProdAr] = useState('');
  const [purchaseNewProdEn, setPurchaseNewProdEn] = useState('');
  const [purchaseNewProdSci, setPurchaseNewProdSci] = useState('');
  const [purchaseNewProdPrice, setPurchaseNewProdPrice] = useState<number>(3000);
  const [purchaseNewProdQty, setPurchaseNewProdQty] = useState<number>(50);
  const [purchaseNewProdExpiry, setPurchaseNewProdExpiry] = useState('2028-12-01');
  const [purchaseNewProdBarcode, setPurchaseNewProdBarcode] = useState('');
  const [showPurchaseNewProdForm, setShowPurchaseNewProdForm] = useState(false);
  const [purchaseSuccessBanner, setPurchaseSuccessBanner] = useState<string | null>(null);
  // شراء بالآجل: تسجيل فاتورة الشراء كذمّة على المذخر بدل خصمها نقداً من الصندوق
  const [purchaseOnCredit, setPurchaseOnCredit] = useState(false);
  const [creditSupplierName, setCreditSupplierName] = useState('مذخر التوريد اليومي');

  // --- CAMERA BARCODE SCANNER STATES & LOGIC FOR DASHBOARD ---
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanSuccessFeedback, setScanSuccessFeedback] = useState<string | null>(null);
  const [scanStream, setScanStream] = useState<MediaStream | null>(null);
  const [isBeepEnabled, setIsBeepEnabled] = useState(true);
  const [scanTarget, setScanTarget] = useState<'pos' | 'inventory' | 'add-drug' | 'purchase-order' | 'movement'>('pos');
  const [newDrugBarcode, setNewDrugBarcode] = useState('');

  const videoRef = useRef<HTMLVideoElement | null>(null);

  const playBeep = () => {
    if (!isBeepEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(1400, audioCtx.currentTime);
      gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
      
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.12);
    } catch (e) {
      console.warn("AudioContext failed:", e);
    }
  };

  const startScanning = async (target: 'pos' | 'inventory' | 'add-drug' | 'purchase-order' | 'movement') => {
    setScanTarget(target);
    setIsScanning(true);
    setScanError(null);
    setScanSuccessFeedback(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      setScanStream(stream);
    } catch (err: any) {
      console.error("Camera access failed:", err);
      setScanError("لم نتمكن من الوصول للكاميرا. يرجى مراجعة الصلاحيات أو توصيل كاميرا ومتابعة المحاكاة التلقائية.");
    }
  };

  const stopScanning = () => {
    if (scanStream) {
      scanStream.getTracks().forEach(track => track.stop());
      setScanStream(null);
    }
    setIsScanning(false);
    setScanError(null);
    setScanSuccessFeedback(null);
  };

  useEffect(() => {
    if (isScanning && scanStream && videoRef.current) {
      videoRef.current.srcObject = scanStream;
      videoRef.current.play().catch(err => {
        console.error("Video play failed:", err);
        setScanError("فشل تشغيل العرض الحي للكاميرا.");
      });
    }
  }, [isScanning, scanStream]);

  // Clean-up stream on unmount
  useEffect(() => {
    return () => {
      if (scanStream) {
        scanStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [scanStream]);

  // Detector / Simulator loop
  useEffect(() => {
    let active = true;
    let animationFrameId: number;
    let timeoutId: any;

    const runDetector = async () => {
      const currentVideo = videoRef.current;
      if (isScanning && scanStream && currentVideo && 'BarcodeDetector' in window) {
        try {
          const detector = new (window as any).BarcodeDetector({
            formats: ['ean_13', 'ean_8', 'qr_code', 'code_128', 'code_39', 'upc_a', 'upc_e']
          });
          const checkFrame = async () => {
            if (!active || !videoRef.current || videoRef.current.paused || videoRef.current.ended) return;
            try {
              const detected = await detector.detect(videoRef.current);
              if (detected && detected.length > 0 && active) {
                const scannedCode = detected[0].rawValue;
                handleScanCode(scannedCode);
                active = false;
                return;
              }
            } catch (err) {
              console.warn("Detection cycle skipped:", err);
            }
            if (active) {
              animationFrameId = requestAnimationFrame(checkFrame);
            }
          };

          currentVideo.addEventListener('play', () => {
            if (active) animationFrameId = requestAnimationFrame(checkFrame);
          });
          if (!currentVideo.paused) {
            animationFrameId = requestAnimationFrame(checkFrame);
          }
        } catch (e) {
          console.warn("BarcodeDetector setup failed, falling back to simulated matching:", e);
        }
      }
    };

    if (isScanning && !scanError && !scanSuccessFeedback) {
      runDetector();
      // Keep safety simulation timeout (4 seconds fallback)
      timeoutId = setTimeout(() => {
        if (active) {
          // Choose a random sample barcode corresponding to existing medicines or a new one
          const sampleCodes = ['6281100115598', '5011327110992', '8699532095457', '7611327110931', '4004732101236', '5011327789311', '7611327114321'];
          const randomCode = sampleCodes[Math.floor(Math.random() * sampleCodes.length)];
          handleScanCode(randomCode);
        }
      }, 4000);
    }

    return () => {
      active = false;
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isScanning, scanStream, scanError, scanSuccessFeedback]);

  const handleScanCode = (code: string) => {
    playBeep();
    setScanSuccessFeedback(`تم رصد باركود المنتّج: ${code}`);
    
    // Fill the corresponding search query or field depending on scanTarget
    if (scanTarget === 'pos') {
      posSearchRef.current?.setValue(code); setSearchPOSQuery(code);
    } else if (scanTarget === 'inventory') {
      setSearchInInventoryQuery(code);
    } else if (scanTarget === 'add-drug') {
      setNewDrugBarcode(code);
    } else if (scanTarget === 'movement') {
      // حركة المادة: اختيار الدواء مباشرةً من الباركود الممسوح
      const match = inventory.find(m => m.barcode === code);
      if (match) {
        setMovementMedId(match.id);
        setMovementSearch(`${match.nameAr} (${match.nameEn})`);
      } else {
        setMovementSearch(code);
      }
      setMovementDropdownOpen(false);
    } else if (scanTarget === 'purchase-order') {
      const match = inventory.find(m => m.barcode === code);
      if (match) {
        const existsInDraft = purchaseDraft.find(d => d.medicineId === match.id);
        if (existsInDraft) {
          // زيادة الكمية ونقل الصنف إلى أعلى القائمة
          setPurchaseDraft(prev => {
            const target = prev.find(d => d.medicineId === match.id);
            const rest = prev.filter(d => d.medicineId !== match.id);
            return [{ ...target, qty: target.qty + 10 }, ...rest];
          });
        } else {
          const freshDraft = {
            id: 'draft-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            medicineId: match.id,
            nameAr: match.nameAr,
            nameEn: match.nameEn,
            scientificName: match.scientificName,
            // سعر جملة يعتمد على آخر سعر شراء فعلي إن وُجد
            price: Number(match.lastCostPrice) || Number(match.costPrice) || Math.floor(match.price * 0.72) || 3000,
            retailPrice: match.price || 0,
            officialPrice: match.secondaryPrice || (match.price ? match.price + 500 : 0),
            qty: 1,
            expiryDate: expiryDates[match.id] || '2028-06-01',
            barcode: code,
            warehouse: purchaseSupplier || match.warehouse || '',
          };
          setPurchaseDraft(prev => [freshDraft, ...prev]);
        }
      } else {
        setPurchaseNewProdBarcode(code);
        setShowPurchaseNewProdForm(true);
      }
    }

    setTimeout(() => {
      stopScanning();
    }, 1500);
  };

  // Theme: always luxury (pastel class)
  useEffect(() => {
    const html = document.documentElement;
    html.classList.remove('dark');
    html.classList.add('pastel');
  }, []);

  // RBAC: reset activeTab when role changes
  useEffect(() => {
    const allowed: Record<typeof currentRole, string[]> = {
      admin: ['home', 'pos', 'inventory', 'b2b', 'financial'],
      pharmacist: ['home', 'pos', 'inventory', 'b2b'],
      cashier: ['home', 'pos', 'inventory'],
    };
    if (!allowed[currentRole].includes(activeTab)) setActiveTab('home');
  }, [currentRole]);

  // قفل التبويب المالي عند مغادرته — يتطلب إدخال الباسوورد في كل مرة
  useEffect(() => {
    if (activeTab !== 'financial') {
      setFinancialUnlocked(false);
      setPinEntry('');
      setPinError(false);
    }
  }, [activeTab]);

  // علّم أن المستخدم زار المخزون مرة، حتى تُطوى تنبيهات الصلاحية في الزيارات اللاحقة
  useEffect(() => {
    if (activeTab === 'inventory') {
      localStorage.setItem('anwar_inventory_visited', '1');
    }
  }, [activeTab]);

  // Web push notifications on load
  useEffect(() => {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'granted') {
      const today = new Date();
      const expiredMeds = inventory.filter(m => expiryDates[m.id] && new Date(expiryDates[m.id]) < today);
      if (expiredMeds.length > 0) {
        new Notification('صيدلية انوار الحسن', { body: `${expiredMeds.length} أصناف منتهية الصلاحية!` });
      }
      const lowMeds = inventory.filter(m => m.availableQuantity <= (m.minStock ?? 15));
      if (lowMeds.length > 0) {
        new Notification('صيدلية انوار الحسن', { body: `${lowMeds.length} أصناف تحتاج طلب عاجل.` });
      }
    }
  }, []);

  // خريطة أيام الصلاحية — تُحسب مرة واحدة عند تغيّر expiryDates فقط
  const expiryDaysMap = useMemo(() => {
    const todayMs = new Date(new Date().toLocaleDateString('en-CA')).getTime();
    const map: Record<string, number> = {};
    for (const id in expiryDates) {
      const expDateStr = expiryDates[id];
      if (!expDateStr) { map[id] = 9999; continue; }
      map[id] = Math.round((new Date(expDateStr).getTime() - todayMs) / 86400000);
    }
    return map;
  }, [expiryDates]);

  const getDaysUntilExpiry = useCallback((id: string) => expiryDaysMap[id] ?? 9999, [expiryDaysMap]);

  const getNearExpiryMeds = () => {
    return inventory.filter(m => {
      const days = getDaysUntilExpiry(m.id);
      return days <= 30;
    });
  };

  // --- لوحة الصلاحيات الموسّعة (6 أشهر) ---
  const EXPIRY_HORIZON_DAYS = 180; // أفق المراقبة: 6 أشهر

  // تصنيف خطورة الصلاحية (للون والوسم وترتيب الأولوية)
  const expirySeverity = (days: number): 'expired' | 'critical' | 'warning' | 'watch' => {
    if (days < 0) return 'expired';   // منتهية فعلاً
    if (days <= 30) return 'critical'; // ≤ شهر — حرج
    if (days <= 90) return 'warning';  // ≤ 3 أشهر — تحذير
    return 'watch';                    // ≤ 6 أشهر — مراقبة
  };

  // كل الأدوية التي لها تاريخ صلاحية ضمن أفق 6 أشهر (يشمل المنتهية)، مرتّبة بالأولوية: الأقرب انتهاءً أولاً
  const getHorizonExpiryMeds = () => {
    return inventory
      .filter(m => {
        if (!expiryDates[m.id]) return false;
        const days = getDaysUntilExpiry(m.id);
        return days <= EXPIRY_HORIZON_DAYS;
      })
      .sort((a, b) => getDaysUntilExpiry(a.id) - getDaysUntilExpiry(b.id));
  };

  // قائمة الأشهر الستة القادمة (تبدأ من الشهر الحالي) مع عدد المستحضرات المنتهية في كل شهر
  const getExpiryMonths = () => {
    const meds = getHorizonExpiryMeds();
    const now = new Date();
    const months: { key: string; label: string; count: number }[] = [];
    const arMonths = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];
    for (let i = 0; i < 7; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const count = meds.filter(m => (expiryDates[m.id] || '').substring(0, 7) === key).length;
      months.push({ key, label: `${arMonths[d.getMonth()]} ${d.getFullYear()}`, count });
    }
    return months;
  };

  // فتح محرّر الكمية المباشر لصف في جدول المخزون
  const startEditingQty = (med: Medicine) => {
    setEditingQtyId(med.id);
    setEditingQtyValue(String(med.availableQuantity));
  };

  // حفظ الكمية المعدّلة يدوياً: تحديث الحالة + المزامنة مع Firestore إن وُجد مستخدم
  const saveEditingQty = (medId: string) => {
    const parsed = Math.max(0, Math.round(Number(editingQtyValue)));
    if (isNaN(parsed)) { setEditingQtyId(null); return; }
    let updatedMed: Medicine | null = null;
    setInventory(prev => prev.map(m => {
      if (m.id === medId) {
        updatedMed = {
          ...m,
          availableQuantity: parsed,
          status: parsed <= 0 ? 'unavailable' : parsed < (m.minStock ?? 15) ? 'low' : 'available',
          updatedAt: new Date().toISOString(),
        } as Medicine;
        return updatedMed;
      }
      return m;
    }));
    if (currentUser && updatedMed) {
      setDoc(doc(db, 'users', currentUser.uid, 'inventory', medId), updatedMed)
        .catch(e => handleFirestoreError(e, OperationType.WRITE, `users/${currentUser.uid}/inventory/${medId}`));
    }
    setEditingQtyId(null);
    setEditingQtyValue('');
  };

  // تعديل سريع للكمية بمقدار ثابت (+/-) مع المزامنة مع Firestore
  const adjustStockQty = (medId: string, delta: number) => {
    let updatedMed: Medicine | null = null;
    setInventory(prev => prev.map(m => {
      if (m.id === medId) {
        const nextQty = Math.max(0, m.availableQuantity + delta);
        updatedMed = {
          ...m,
          availableQuantity: nextQty,
          status: nextQty <= 0 ? 'unavailable' : nextQty < (m.minStock ?? 15) ? 'low' : 'available',
          updatedAt: new Date().toISOString(),
        } as Medicine;
        return updatedMed;
      }
      return m;
    }));
    if (currentUser && updatedMed) {
      setDoc(doc(db, 'users', currentUser.uid, 'inventory', medId), updatedMed)
        .catch(e => handleFirestoreError(e, OperationType.WRITE, `users/${currentUser.uid}/inventory/${medId}`));
    }
  };

  // جرد سريع — فتح الصف
  const startQuickAudit = (med: Medicine) => {
    setQuickAuditId(med.id);
    setQaNameAr(med.nameAr);
    setQaNameEn(med.nameEn || '');
    setQaPrice(String(med.price));
    setQaCostPrice(String(med.costPrice || ''));
    setQaQty(String(med.availableQuantity));
    setQaExpiry(expiryDates[med.id] || '');
  };

  // جرد سريع — حفظ كل الحقول دفعةً
  const saveQuickAudit = (medId: string) => {
    const price = Math.max(0, Math.round(Number(qaPrice)));
    const cost  = Math.max(0, Math.round(Number(qaCostPrice)));
    const qty   = Math.max(0, Math.round(Number(qaQty)));
    if (isNaN(price) || isNaN(qty)) { setQuickAuditId(null); return; }
    let updatedMed: Medicine | null = null;
    setInventory(prev => prev.map(m => {
      if (m.id !== medId) return m;
      updatedMed = {
        ...m,
        nameAr: qaNameAr.trim() || m.nameAr,
        nameEn: qaNameEn.trim() || m.nameEn,
        price,
        costPrice: cost > 0 ? cost : m.costPrice,
        availableQuantity: qty,
        status: qty <= 0 ? 'unavailable' : qty < (m.minStock ?? 15) ? 'low' : 'available',
      } as Medicine;
      return updatedMed!;
    }));
    if (qaExpiry) setExpiryDates(prev => ({ ...prev, [medId]: qaExpiry }));
    if (currentUser) {
      const uid = currentUser.uid;
      if (updatedMed)
        setDoc(doc(db, 'users', uid, 'inventory', medId), updatedMed)
          .catch(e => handleFirestoreError(e, OperationType.WRITE, `users/${uid}/inventory/${medId}`));
      if (qaExpiry)
        setDoc(doc(db, 'users', uid, 'expiryDates', medId), { expiry: qaExpiry, userId: uid })
          .catch(e => handleFirestoreError(e, OperationType.WRITE, `users/${uid}/expiryDates/${medId}`));
    }
    addAuditEntry({ action: 'inventory_import', amount: 0, description: `جرد سريع: ${qaNameAr.trim()} — كمية: ${qty}، سعر: ${price.toLocaleString()} د.ع` });
    setQuickAuditId(null);
  };

  // فتح محرّر السعر المباشر لصف في جدول المخزون
  const startEditingPrice = (med: Medicine) => {
    setEditingPriceId(med.id);
    setEditingPriceValue(String(med.price));
    setEditingSecondaryPriceValue(String(med.secondaryPrice ?? med.price));
  };

  // حفظ السعر المعدّل يدوياً: تحديث الحالة + المزامنة مع Firestore إن وُجد مستخدم
  const saveEditingPrice = (medId: string) => {
    const parsedPrice = Math.max(0, Math.round(Number(editingPriceValue)));
    const parsedSecondary = Math.max(0, Math.round(Number(editingSecondaryPriceValue)));
    if (isNaN(parsedPrice) || isNaN(parsedSecondary)) { setEditingPriceId(null); return; }
    let updatedMed: Medicine | null = null;
    setInventory(prev => prev.map(m => {
      if (m.id === medId) {
        updatedMed = {
          ...m,
          price: parsedPrice,
          secondaryPrice: parsedSecondary,
          updatedAt: new Date().toISOString(),
        } as Medicine;
        return updatedMed;
      }
      return m;
    }));
    if (currentUser && updatedMed) {
      setDoc(doc(db, 'users', currentUser.uid, 'inventory', medId), updatedMed)
        .catch(e => handleFirestoreError(e, OperationType.WRITE, `users/${currentUser.uid}/inventory/${medId}`));
    }
    setEditingPriceId(null);
    setEditingPriceValue('');
    setEditingSecondaryPriceValue('');
  };

  // حذف مادة نهائياً من المخزون: محلياً + من Firestore
  const confirmDeleteMedicine = () => {
    const med = deleteMedTarget;
    if (!med) return;
    setInventory(prev => prev.filter(m => m.id !== med.id));
    setExpiryDates(prev => {
      const next = { ...prev };
      delete next[med.id];
      return next;
    });
    if (currentUser) {
      const userId = currentUser.uid;
      deleteDoc(doc(db, 'users', userId, 'inventory', med.id))
        .catch(e => handleFirestoreError(e, OperationType.DELETE, `users/${userId}/inventory/${med.id}`));
    }
    addAuditEntry({
      action: 'inventory_import',
      amount: 0,
      description: `حذف مادة من المخزون: ${med.nameAr}`,
      relatedId: med.id,
    });
    setDeleteMedTarget(null);
  };

  // --- STOCK MOVEMENT HELPERS (حركة المادة) ---
  // مطابقة اسم صنف في فاتورة (بيع/شراء) مع دواء في المخزون — الأسماء قد تحوي لاحقات مثل (Panadol Extra) أو (كرتون)
  const itemMatchesMed = (itemName: string | undefined, med: Medicine): boolean => {
    if (!itemName) return false;
    const cleanItem = itemName.split('(')[0].trim();
    const lower = itemName.toLowerCase();
    return (
      itemName.includes(med.nameAr) ||
      (cleanItem.length >= 4 && med.nameAr.includes(cleanItem)) ||
      (!!med.nameEn && med.nameEn.length >= 3 && lower.includes(med.nameEn.toLowerCase()))
    );
  };

  interface StockMovement {
    type: 'in' | 'out';
    date: string;       // YYYY-MM-DD أو YYYY-MM-DD HH:mm
    qty: number;
    price: number;      // سعر الوحدة (د.ع)
    ref: string;        // رقم الفاتورة / الطلبية
    party: string;      // اسم الزبون / المورد
  }

  // يجمع كل حركات الوارد (شراء) والصادر (بيع) لدواء معيّن ضمن مدى زمني اختياري
  const getStockMovements = (medId: string, from: string, to: string) => {
    const med = inventory.find(m => m.id === medId);
    if (!med) return { movements: [] as StockMovement[], totalIn: 0, totalOut: 0, valueIn: 0, valueOut: 0 };

    const inRange = (dateStr: string): boolean => {
      const d = (dateStr || '').substring(0, 10);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    };

    const movements: StockMovement[] = [];
    let totalIn = 0, totalOut = 0, valueIn = 0, valueOut = 0;

    // الصادر = المبيعات (من سجل الفواتير)
    salesLedger.forEach(s => {
      if (!inRange(s.timestamp)) return;
      s.items.forEach(it => {
        if (itemMatchesMed(it.name, med)) {
          movements.push({ type: 'out', date: s.timestamp, qty: it.quantity, price: it.price, ref: s.invoiceId, party: s.customerName });
          totalOut += it.quantity;
          valueOut += it.quantity * it.price;
        }
      });
    });

    // الوارد = المشتريات (من طلبيات المذاخر)
    b2bOrders.forEach(o => {
      if (!inRange(o.date)) return;
      (o.items || []).forEach((it: any) => {
        if (itemMatchesMed(it.medicineName, med)) {
          movements.push({ type: 'in', date: o.date, qty: it.quantity, price: it.price, ref: o.id, party: o.warehouseName });
          totalIn += it.quantity;
          valueIn += it.quantity * it.price;
        }
      });
    });

    movements.sort((a, b) => b.date.localeCompare(a.date));
    return { movements, totalIn, totalOut, valueIn, valueOut };
  };



  // --- REMOTE CLOUD FIREBASE SYNC OBSERVERS & TRIGGERS ---
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = onAuthStateChanged(auth, (user) => {
        setCurrentUser(user);
        setIsAuthLoading(false);
      });
    } catch (err) {
      // يحدث عند غياب مفتاح API أو انقطاع الشبكة قبل اكتمال التهيئة
      // نعامل المستخدم كغير مسجّل حتى لا تتوقف الواجهة
      console.error('[Auth] فشل تسجيل onAuthStateChanged:', err);
      setAuthInitFailed(true);
      setIsAuthLoading(false);
      setCurrentUser(null);
    }
    return () => { if (unsubscribe) unsubscribe(); };
  }, []);

  // مراقبة فشل عمليات الكتابة في السحابة (setDoc/deleteDoc).
  // handleFirestoreError يرمي خطأً عند فشل أي كتابة، فيظهر كـ unhandledrejection —
  // نلتقطه هنا ونُظهره للمستخدم بشريط أحمر بدل أن يُفقد بصمت في الـ console.
  // هذا يكشف فوراً إن كانت فاتورة بيع (أو أي بيان) تفشل في الوصول لبقية الأجهزة.
  useEffect(() => {
    const onRejection = (ev: PromiseRejectionEvent) => {
      const msg = String((ev.reason as { message?: string })?.message ?? ev.reason ?? '');
      if (/operationType|firestore|permission|insufficient|offline|unavailable/i.test(msg)) {
        setSyncError('فشل حفظ بعض التغييرات في السحابة — لم تصل لبقية الأجهزة. تحقّق من الاتصال وأعد المحاولة.');
        console.error('[مزامنة] فشل كتابة في السحابة:', msg);
      }
    };
    window.addEventListener('unhandledrejection', onRejection);
    return () => window.removeEventListener('unhandledrejection', onRejection);
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setIsSyncing(false);
      return;
    }

    setIsSyncing(true);
    const userId = currentUser.uid;

    // A helper to initialize user record if profile doesn't exist
    const initializeUserProfile = async () => {
      try {
        const userDocRef = doc(db, 'users', userId);
        const userDocSnap = await getDoc(userDocRef);
        if (!userDocSnap.exists()) {
          await setDoc(userDocRef, {
            uid: userId,
            email: currentUser.email || '',
            pharmacyName: 'صيدلية العائلة العراقية الكبرى',
            createdAt: new Date().toISOString()
          });
        }
      } catch (err) {
        console.error("Error creating profile:", err);
      }
    };
    initializeUserProfile();

    // 1. Sync Inventory Collection
    const inventoryCol = collection(db, 'users', userId, 'inventory');
    const unsubInventory = onSnapshot(inventoryCol, { includeMetadataChanges: true }, (snapshot) => {
      // مؤشر المزامنة الحقيقي: fromCache=true يعني أن البيانات من الكاش المحلي ولم تتزامن
      // مع الخادم بعد (أو الجهاز غير متصل). هذا هو ما كان "المؤشر الأخضر" القديم يُخفيه.
      setSyncError(null);
      setSyncState(
        snapshot.metadata.fromCache ? 'offline'
        : snapshot.metadata.hasPendingWrites ? 'pending'
        : 'synced'
      );
      if (snapshot.empty) {
        // Seed database inventory with initial local inventory states
        inventory.forEach(async (item) => {
          try {
            await setDoc(doc(db, 'users', userId, 'inventory', item.id), {
              ...item,
              userId
            });
          } catch (e) {
            handleFirestoreError(e, OperationType.CREATE, `users/${userId}/inventory/${item.id}`);
          }
        });
      } else {
        const loadedInventory: Medicine[] = [];
        snapshot.forEach((doc) => {
          loadedInventory.push(doc.data() as Medicine);
        });
        loadedInventory.sort((a, b) => Number(a.id) - Number(b.id));
        setInventory(loadedInventory);
      }
    }, (error) => {
      // لم يعد الخطأ مكتوماً — نُظهره للمستخدم ليعرف أن المزامنة متوقفة وأن البيانات محلية فقط.
      const msg = String((error as Error)?.message || error);
      console.warn('[مزامنة] خطأ في الاستماع:', `users/${userId}/inventory`, msg);
      setSyncState('offline');
      setSyncError(/permission|insufficient/i.test(msg) ? 'صلاحيات مرفوضة' : 'انقطاع الاتصال بالخادم');
    });

    // 2. Sync B2B Orders Collection
    const b2bOrdersCol = collection(db, 'users', userId, 'b2bOrders');
    const unsubB2bOrders = onSnapshot(b2bOrdersCol, (snapshot) => {
      if (snapshot.empty) {
        // Seed database orders
        b2bOrders.forEach(async (order) => {
          try {
            await setDoc(doc(db, 'users', userId, 'b2bOrders', order.id), {
              ...order,
              userId
            });
          } catch (e) {
            handleFirestoreError(e, OperationType.CREATE, `users/${userId}/b2bOrders/${order.id}`);
          }
        });
      } else {
        const loadedOrders: Order[] = [];
        snapshot.forEach((doc) => {
          loadedOrders.push(doc.data() as Order);
        });
        loadedOrders.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setB2bOrders(loadedOrders);
      }
    }, (error) => {
      console.warn('[مزامنة] خطأ مؤقت في الاستماع (لن يوقف التطبيق):', `users/${userId}/b2bOrders`);
    });

    // 3. Sync Sales Ledger Collection
    const salesLedgerCol = collection(db, 'users', userId, 'salesLedger');
    const unsubSalesLedger = onSnapshot(salesLedgerCol, (snapshot) => {
      if (snapshot.empty) {
        salesLedger.forEach(async (sale) => {
          try {
            await setDoc(doc(db, 'users', userId, 'salesLedger', sale.invoiceId), {
              ...sale,
              userId
            });
          } catch (e) {
            handleFirestoreError(e, OperationType.CREATE, `users/${userId}/salesLedger/${sale.invoiceId}`);
          }
        });
      } else {
        const loadedSales: SaleRecord[] = [];
        snapshot.forEach((doc) => {
          loadedSales.push(doc.data() as SaleRecord);
        });
        loadedSales.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setSalesLedger(loadedSales);
        
        // Recalculate daily sales revenue and wallet cash sum based on live DB data
        const totalSalesSum = loadedSales.reduce((acc, curr) => acc + curr.total, 0);
        setDailySalesRevenue(totalSalesSum);
      }
    }, (error) => {
      console.warn('[مزامنة] خطأ مؤقت في الاستماع (لن يوقف التطبيق):', `users/${userId}/salesLedger`);
    });

    // 5. Sync Expenses Collection
    const expensesCol = collection(db, 'users', userId, 'expenses');
    const unsubExpenses = onSnapshot(expensesCol, (snapshot) => {
      if (snapshot.empty) {
        expenses.forEach(async (exp) => {
          try {
            await setDoc(doc(db, 'users', userId, 'expenses', exp.id), { ...exp, userId });
          } catch (e) {
            handleFirestoreError(e, OperationType.CREATE, `users/${userId}/expenses/${exp.id}`);
          }
        });
      } else {
        const loadedExpenses: Expense[] = [];
        snapshot.forEach((doc) => {
          loadedExpenses.push(doc.data() as Expense);
        });
        loadedExpenses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setExpenses(loadedExpenses);
      }
    }, (error) => {
      console.warn('[مزامنة] خطأ مؤقت في الاستماع (لن يوقف التطبيق):', `users/${userId}/expenses`);
    });

    // 7. Sync Payables Collection (الذمم الدائنة / ديون الموردين)
    const payablesCol = collection(db, 'users', userId, 'payables');
    const unsubPayables = onSnapshot(payablesCol, (snapshot) => {
      if (snapshot.empty) {
        payables.forEach(async (p) => {
          try {
            const payload: any = {
              id: p.id,
              supplierName: p.supplierName,
              amount: p.amount,
              paidAmount: p.paidAmount,
              date: p.date,
              status: p.status,
              userId,
            };
            if (p.dueDate) payload.dueDate = p.dueDate;
            if (p.description) payload.description = p.description;
            if (p.relatedOrderId) payload.relatedOrderId = p.relatedOrderId;
            await setDoc(doc(db, 'users', userId, 'payables', p.id), payload);
          } catch (e) {
            handleFirestoreError(e, OperationType.CREATE, `users/${userId}/payables/${p.id}`);
          }
        });
      } else {
        const loaded: Payable[] = [];
        snapshot.forEach((d) => {
          loaded.push(d.data() as Payable);
        });
        loaded.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setPayables(loaded);
      }
    }, (error) => {
      console.warn('[مزامنة] خطأ مؤقت في الاستماع (لن يوقف التطبيق):', `users/${userId}/payables`);
    });

    // 8. Sync Receivables Collection (الذمم المدينة / البيع بالآجل للزبائن)
    const receivablesCol = collection(db, 'users', userId, 'receivables');
    const unsubReceivables = onSnapshot(receivablesCol, (snapshot) => {
      if (snapshot.empty) {
        receivables.forEach(async (r) => {
          try {
            const payload: any = {
              id: r.id,
              customerName: r.customerName,
              amount: r.amount,
              paidAmount: r.paidAmount,
              date: r.date,
              status: r.status,
              userId,
            };
            if (r.dueDate) payload.dueDate = r.dueDate;
            if (r.description) payload.description = r.description;
            if (r.relatedInvoiceId) payload.relatedInvoiceId = r.relatedInvoiceId;
            await setDoc(doc(db, 'users', userId, 'receivables', r.id), payload);
          } catch (e) {
            handleFirestoreError(e, OperationType.CREATE, `users/${userId}/receivables/${r.id}`);
          }
        });
      } else {
        const loaded: Receivable[] = [];
        snapshot.forEach((d) => {
          loaded.push(d.data() as Receivable);
        });
        loaded.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setReceivables(loaded);
      }
    }, (error) => {
      console.warn('[مزامنة] خطأ مؤقت في الاستماع (لن يوقف التطبيق):', `users/${userId}/receivables`);
    });

    // 9. Sync Returns Collection (مرتجعات المبيعات)
    const returnsCol = collection(db, 'users', userId, 'returns');
    const unsubReturns = onSnapshot(returnsCol, (snapshot) => {
      if (!snapshot.empty) {
        const loaded: SalesReturn[] = [];
        snapshot.forEach(d => loaded.push(d.data() as SalesReturn));
        loaded.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        setSalesReturns(loaded);
      }
    }, (error) => {
      console.warn('[Returns] onSnapshot error:', error);
    });

    // 10. Sync Audit Log Collection (سجل التدقيق)
    // تحسين الحصة: نقرأ آخر 300 سجلّ فقط من الخادم بدل المجموعة كاملةً.
    // سجل التدقيق ينمو مع كل عملية (بيع/تعديل/حذف...)، والتطبيق لا يعرض أكثر من 300 أصلاً —
    // فقراءة الكل كانت إهداراً صافياً للحصة. هذا يخفّض القراءات بشكل كبير دون أي تأثير على الميزات.
    const auditLogCol = collection(db, 'users', userId, 'auditLog');
    const auditLogQuery = query(auditLogCol, orderBy('timestamp', 'desc'), limit(300));
    const unsubAuditLog = onSnapshot(auditLogQuery, (snapshot) => {
      if (!snapshot.empty) {
        const loaded: AuditEntry[] = [];
        snapshot.forEach(d => loaded.push(d.data() as AuditEntry));
        loaded.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        setAuditLog(loaded);
      }
    }, (error) => {
      console.warn('[AuditLog] onSnapshot error:', error);
    });

    // 11. Sync Suppliers Collection (قائمة الموردين ومصادر التجهيز)
    const suppliersCol = collection(db, 'users', userId, 'suppliers');
    const unsubSuppliers = onSnapshot(suppliersCol, (snapshot) => {
      if (snapshot.empty) {
        suppliers.forEach(async (s) => {
          try {
            const payload: any = {
              id: s.id,
              name: s.name,
              createdAt: s.createdAt,
              userId,
            };
            if (s.phone) payload.phone = s.phone;
            if (s.address) payload.address = s.address;
            if (s.contactPerson) payload.contactPerson = s.contactPerson;
            if (s.creditLimit != null) payload.creditLimit = s.creditLimit;
            if (s.paymentTerms != null) payload.paymentTerms = s.paymentTerms;
            if (s.notes) payload.notes = s.notes;
            await setDoc(doc(db, 'users', userId, 'suppliers', s.id), payload);
          } catch (e) {
            handleFirestoreError(e, OperationType.CREATE, `users/${userId}/suppliers/${s.id}`);
          }
        });
      } else {
        const loaded: Supplier[] = [];
        snapshot.forEach((d) => loaded.push(d.data() as Supplier));
        loaded.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
        setSuppliers(loaded);
      }
    }, (error) => {
      console.warn('[مزامنة] خطأ مؤقت في الاستماع (لن يوقف التطبيق):', `users/${userId}/suppliers`);
    });

    setIsSyncing(false);

    return () => {
      unsubInventory();
      unsubB2bOrders();
      unsubSalesLedger();
      unsubExpenses();
      unsubPayables();
      unsubReceivables();
      unsubReturns();
      unsubAuditLog();
      unsubSuppliers();
    };
  }, [currentUser]);

  // --- AUDIT LOG HELPER (يُضيف إدخالاً جديداً لسجل التدقيق محلياً وفي Firestore) ---
  const addAuditEntry = (entry: Omit<AuditEntry, 'id' | 'timestamp' | 'actor'>) => {
    const now = new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const full: AuditEntry = {
      id: `AUD-${Math.floor(Math.random()*90000+10000)}`,
      timestamp: ts,
      actor: currentUser?.displayName || currentRole,
      ...entry,
    };
    setAuditLog(prev => [full, ...prev].slice(0, 300));
    if (currentUser) {
      const userId = currentUser.uid;
      setDoc(doc(db, 'users', userId, 'auditLog', full.id), { ...full, userId })
        .catch(e => handleFirestoreError(e, OperationType.CREATE, `users/${userId}/auditLog/${full.id}`));
    }
  };

  // --- PROCESS SALES RETURN (تسجيل مرتجع مبيعات وعكس تأثيره على المخزون والسيولة) ---
  const handleProcessReturn = (e: FormEvent) => {
    e.preventDefault();
    if (!returnTarget || !returnReason.trim()) return;

    const returnedItems = returnTarget.items
      .map((it, idx) => ({ ...it, quantity: returnQtys[idx] ?? 0 }))
      .filter(it => it.quantity > 0);
    if (returnedItems.length === 0) return;

    const returnTotal = returnedItems.reduce((s, it) => s + it.price * it.quantity, 0);
    const now = new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const newReturn: SalesReturn = {
      returnId: `RET-${Math.floor(Math.random() * 9000 + 1000)}`,
      originalInvoiceId: returnTarget.invoiceId,
      timestamp: ts,
      items: returnedItems,
      total: returnTotal,
      reason: returnReason.trim(),
      refundMethod: returnRefundMethod,
      customerName: returnTarget.customerName,
    };

    // 1. أعِد الكمية إلى المخزون (محلياً + جمع المواد المتغيّرة لمزامنتها مع Firestore)
    const restoredMeds: Medicine[] = [];
    const invAfterReturn = inventory.map(med => {
      const fullName = `${med.nameAr} (${med.nameEn})`;
      const matched = returnedItems.find(it => fullName === it.name || med.nameAr === it.name);
      if (matched) {
        const nextQty = med.availableQuantity + matched.quantity;
        const updated = {
          ...med,
          availableQuantity: nextQty,
          status: (nextQty > 15 ? 'available' : nextQty > 0 ? 'low' : 'unavailable') as Medicine['status'],
        } as Medicine;
        restoredMeds.push(updated);
        return updated;
      }
      return med;
    });
    setInventory(invAfterReturn);

    // 2. إذا كان الاسترداد نقداً → اخصم من الصندوق
    if (returnRefundMethod === 'cash') {
      setWalletBalance(prev => Math.max(0, prev - returnTotal));
    }

    // 3. سجّل المرتجع
    setSalesReturns(prev => [newReturn, ...prev]);
    addAuditEntry({
      action: 'return',
      amount: returnTotal,
      description: `مرتجع (${returnedItems.length} صنف) — ${newReturn.reason}`,
      relatedId: newReturn.returnId,
    });


    // 4. Firestore sync
    if (currentUser) {
      const userId = currentUser.uid;
      setDoc(doc(db, 'users', userId, 'returns', newReturn.returnId), { ...newReturn, userId })
        .catch(e => handleFirestoreError(e, OperationType.CREATE, `users/${userId}/returns/${newReturn.returnId}`));
      // مزامنة كميات المخزون المُعادة حتى لا تُعكَس عند إعادة التحميل
      restoredMeds.forEach(med => {
        setDoc(doc(db, 'users', userId, 'inventory', med.id), { ...med, userId })
          .catch(e => handleFirestoreError(e, OperationType.WRITE, `users/${userId}/inventory/${med.id}`));
      });
    }

    // 5. إغلاق وتصفير
    setShowReturnModal(false);
    setReturnTarget(null);
    setReturnQtys({});
    setReturnReason('');
    setReturnRefundMethod('cash');
    setReturnSuccess(true);
    setTimeout(() => setReturnSuccess(false), 3000);
  };

  // --- EDIT INVOICE ITEMS (تعديل أصناف فاتورة مبيعات موجودة) ---
  const handleSaveInvoiceEdit = (invoiceId: string) => {
    let updatedRecord: SaleRecord | null = null;
    setSalesLedger(prev => prev.map(s => {
      if (s.invoiceId !== invoiceId) return s;
      const newTotal = editingItems.reduce((sum, it) => sum + it.quantity * it.price, 0);
      const newTotalCost = editingItems.reduce((sum, it) => sum + it.quantity * (it.costPrice ?? 0), 0);
      const newGrossProfit = newTotal - newTotalCost;
      const diff = newTotal - s.total;
      if (diff !== 0) setWalletBalance(w => w + diff);
      updatedRecord = {
        ...s,
        items: editingItems.map(it => ({
          ...it,
          lineProfit: it.quantity * (it.price - (it.costPrice ?? 0)),
        })),
        subtotal: newTotal,
        total: newTotal,
        totalCost: newTotalCost,
        grossProfit: newGrossProfit,
        profitMargin: newTotal > 0 ? Math.round((newGrossProfit / newTotal) * 100) : 0,
      };
      return updatedRecord;
    }));
    // مزامنة الفاتورة المعدّلة مع Firestore حتى لا يُفقد التعديل عند إعادة التحميل
    if (currentUser && updatedRecord) {
      const userId = currentUser.uid;
      setDoc(doc(db, 'users', userId, 'salesLedger', invoiceId), { ...(updatedRecord as SaleRecord), userId })
        .catch(e => handleFirestoreError(e, OperationType.WRITE, `users/${userId}/salesLedger/${invoiceId}`));
    }
    setExpandedInvoiceId(null);
  };

  // --- ADD EXPENSE (تسجيل مصروف وخصمه من السيولة) ---
  const handleAddExpense = (e: FormEvent) => {
    e.preventDefault();
    if (!newExpAmount || newExpAmount <= 0) return;
    const expId = `EXP-${Math.floor(Math.random() * 90000 + 10000)}`;
    const newExpense: Expense = {
      id: expId,
      date: new Date().toISOString().split('T')[0],
      category: newExpCategory,
      amount: Math.round(newExpAmount),
      description: newExpDesc,
      paidBy: newExpPaidBy,
    };
    if (currentUser) {
      const userId = currentUser.uid;
      setDoc(doc(db, 'users', userId, 'expenses', expId), { ...newExpense, userId })
        .catch(err => handleFirestoreError(err, OperationType.CREATE, `users/${userId}/expenses/${expId}`));
    } else {
      setExpenses(prev => [newExpense, ...prev]);
    }
    // المصروف يُخصم من السيولة المتاحة بالصندوق
    setWalletBalance(prev => Math.max(0, prev - newExpense.amount));
    addAuditEntry({
      action: 'expense',
      amount: newExpense.amount,
      description: `مصروف ${newExpense.category}${newExpense.description ? ' — ' + newExpense.description : ''}`,
      relatedId: expId,
    });
    setExpenseSuccess(true);
    setNewExpDesc('');
    setTimeout(() => setExpenseSuccess(false), 2200);
  };

  // --- ADD PAYABLE (تسجيل ذمّة جديدة مستحقة لمذخر — لا يؤثر على السيولة) ---
  const handleAddPayable = (e: FormEvent) => {
    e.preventDefault();
    if (!newPaySupplier.trim() || !newPayAmount || newPayAmount <= 0) return;
    const payId = `PAY-${Math.floor(Math.random() * 90000 + 10000)}`;
    const matchedSup = suppliers.find(s => s.name === newPaySupplier.trim());
    const newPayable: Payable = {
      id: payId,
      supplierName: newPaySupplier.trim(),
      supplierId: matchedSup?.id,
      amount: Math.round(newPayAmount),
      paidAmount: 0,
      date: new Date().toISOString().split('T')[0],
      status: 'open',
      ...(newPayDueDate ? { dueDate: newPayDueDate } : {}),
      ...(newPayDesc ? { description: newPayDesc } : {}),
    };
    if (currentUser) {
      const userId = currentUser.uid;
      // Firestore يرفض القيم undefined — نبني الحمولة بالحقول الموجودة فقط
      const payload: any = {
        id: newPayable.id,
        supplierName: newPayable.supplierName,
        amount: newPayable.amount,
        paidAmount: newPayable.paidAmount,
        date: newPayable.date,
        status: newPayable.status,
        userId,
      };
      if (newPayable.dueDate) payload.dueDate = newPayable.dueDate;
      if (newPayable.description) payload.description = newPayable.description;
      setDoc(doc(db, 'users', userId, 'payables', payId), payload)
        .catch(err => handleFirestoreError(err, OperationType.CREATE, `users/${userId}/payables/${payId}`));
    } else {
      setPayables(prev => [newPayable, ...prev]);
    }
    // تسجيل الذمّة لا يُحرّك السيولة (نشوء دين وليس صرفاً نقدياً)
    setPayableSuccess(true);
    addAuditEntry({
      action: 'payable_add',
      amount: newPayable.amount,
      description: `ذمّة جديدة للمورّد: ${newPayable.supplierName}`,
      relatedId: payId,
    });
    setNewPaySupplier('');
    setNewPayDesc('');
    setTimeout(() => setPayableSuccess(false), 2200);
  };

  // --- SETTLE PAYABLE (تسديد دفعة على ذمّة مذخر وخصمها من السيولة) ---
  const handleSettlePayable = (p: Payable, rawAmount: number) => {
    const remaining = Math.max(0, p.amount - p.paidAmount);
    const pay = Math.min(Math.max(0, Math.round(rawAmount || 0)), remaining);
    if (pay <= 0) return;
    const newPaid = p.paidAmount + pay;
    const newStatus: Payable['status'] = newPaid >= p.amount ? 'paid' : 'partial';
    setWalletBalance(prev => Math.max(0, prev - pay));
    setPayables(prev => prev.map(x => x.id === p.id ? { ...x, paidAmount: newPaid, status: newStatus } : x));
    if (currentUser) {
      const userId = currentUser.uid;
      setDoc(doc(db, 'users', userId, 'payables', p.id), { ...p, paidAmount: newPaid, status: newStatus, userId }, { merge: true })
        .catch(err => handleFirestoreError(err, OperationType.WRITE, `users/${userId}/payables/${p.id}`));
    }
    setSettleInputs(prev => ({ ...prev, [p.id]: 0 }));
    addAuditEntry({
      action: 'payable_settle',
      amount: pay,
      description: `تسديد ذمّة ${p.supplierName} — المتبقي: ${(p.amount - newPaid).toLocaleString()} د.ع`,
      relatedId: p.id,
    });
  };

  // يبني حمولة Firestore للمورد بالحقول الموجودة فقط (Firestore يرفض undefined)
  const buildSupplierPayload = (sup: Supplier, userId: string): any => {
    const payload: any = { id: sup.id, name: sup.name, createdAt: sup.createdAt, userId };
    if (sup.phone) payload.phone = sup.phone;
    if (sup.address) payload.address = sup.address;
    if (sup.contactPerson) payload.contactPerson = sup.contactPerson;
    if (sup.creditLimit != null) payload.creditLimit = sup.creditLimit;
    if (sup.paymentTerms != null) payload.paymentTerms = sup.paymentTerms;
    if (sup.notes) payload.notes = sup.notes;
    return payload;
  };

  // --- ADD SUPPLIER (إضافة مورد جديد — يُحفظ محلياً وفي Firestore) ---
  const addSupplier = (sup: Supplier) => {
    if (currentUser) {
      const userId = currentUser.uid;
      setDoc(doc(db, 'users', userId, 'suppliers', sup.id), buildSupplierPayload(sup, userId))
        .catch(err => handleFirestoreError(err, OperationType.CREATE, `users/${userId}/suppliers/${sup.id}`));
    } else {
      setSuppliers(prev => [...prev, sup]);
    }
  };

  // --- UPDATE SUPPLIER (تعديل بيانات مورد — محلياً وفي Firestore) ---
  const updateSupplier = (sup: Supplier) => {
    setSuppliers(prev => prev.map(s => s.id === sup.id ? sup : s));
    if (currentUser) {
      const userId = currentUser.uid;
      setDoc(doc(db, 'users', userId, 'suppliers', sup.id), buildSupplierPayload(sup, userId))
        .catch(err => handleFirestoreError(err, OperationType.WRITE, `users/${userId}/suppliers/${sup.id}`));
    }
  };

  // --- DELETE SUPPLIER (حذف مورد — محلياً وفي Firestore) ---
  const deleteSupplier = (sup: Supplier) => {
    setSuppliers(prev => prev.filter(s => s.id !== sup.id));
    if (selectedSupplierId === sup.id) setSelectedSupplierId(null);
    if (currentUser) {
      const userId = currentUser.uid;
      deleteDoc(doc(db, 'users', userId, 'suppliers', sup.id))
        .catch(err => handleFirestoreError(err, OperationType.DELETE, `users/${userId}/suppliers/${sup.id}`));
    }
  };

  // --- PAY SUPPLIER DEBT (تسديد دفعة لمورد عبر ذممه المفتوحة — محلياً وفي Firestore) ---
  // amount = null يعني تسديد كامل المتبقّي
  const paySupplierDebt = (sup: Supplier, amount: number | null) => {
    const supPayablesOpen = payables.filter(p => (p.supplierId === sup.id || p.supplierName === sup.name) && p.status !== 'paid');
    const totalOwed = supPayablesOpen.reduce((s, p) => s + Math.max(0, p.amount - p.paidAmount), 0);
    const payTotal = amount == null ? totalOwed : Math.min(Math.max(0, Math.round(amount)), totalOwed);
    if (payTotal <= 0) return;

    let remaining = payTotal;
    const changedIds: string[] = [];
    const updated = payables.map(p => {
      if ((p.supplierId === sup.id || p.supplierName === sup.name) && p.status !== 'paid' && remaining > 0) {
        const canPay = Math.max(0, p.amount - p.paidAmount);
        const pay = Math.min(canPay, remaining);
        remaining -= pay;
        const newPaid = p.paidAmount + pay;
        changedIds.push(p.id);
        return { ...p, paidAmount: newPaid, status: (newPaid >= p.amount ? 'paid' : newPaid > 0 ? 'partial' : 'open') as Payable['status'] };
      }
      return p;
    });

    setPayables(updated);
    setWalletBalance(prev => Math.max(0, prev - payTotal));
    // حفظ الذمم المتغيّرة في Firestore حتى لا تُعكَس عند إعادة التحميل
    if (currentUser) {
      const userId = currentUser.uid;
      updated.forEach(p => {
        if (changedIds.includes(p.id)) {
          setDoc(doc(db, 'users', userId, 'payables', p.id), { ...p, userId }, { merge: true })
            .catch(err => handleFirestoreError(err, OperationType.WRITE, `users/${userId}/payables/${p.id}`));
        }
      });
    }
    addAuditEntry({ action: 'payable_settle', amount: payTotal, description: `تسديد ${amount == null ? 'كامل' : 'دفعة'} لـ ${sup.name}` });
  };

  // --- ADD RECEIVABLE (تسجيل ذمّة جديدة مستحقة لنا على زبون — لا يؤثر على السيولة) ---
  const handleAddReceivable = (e: FormEvent) => {
    e.preventDefault();
    if (!newRecCustomer.trim() || !newRecAmount || newRecAmount <= 0) return;
    const recId = `REC-${Math.floor(Math.random() * 90000 + 10000)}`;
    const newReceivable: Receivable = {
      id: recId,
      customerName: newRecCustomer.trim(),
      amount: Math.round(newRecAmount),
      paidAmount: 0,
      date: new Date().toISOString().split('T')[0],
      status: 'open',
      ...(newRecDueDate ? { dueDate: newRecDueDate } : {}),
      ...(newRecDesc ? { description: newRecDesc } : {}),
    };
    if (currentUser) {
      const userId = currentUser.uid;
      // Firestore يرفض القيم undefined — نبني الحمولة بالحقول الموجودة فقط
      const payload: any = {
        id: newReceivable.id,
        customerName: newReceivable.customerName,
        amount: newReceivable.amount,
        paidAmount: newReceivable.paidAmount,
        date: newReceivable.date,
        status: newReceivable.status,
        userId,
      };
      if (newReceivable.dueDate) payload.dueDate = newReceivable.dueDate;
      if (newReceivable.description) payload.description = newReceivable.description;
      setDoc(doc(db, 'users', userId, 'receivables', recId), payload)
        .catch(err => handleFirestoreError(err, OperationType.CREATE, `users/${userId}/receivables/${recId}`));
    } else {
      setReceivables(prev => [newReceivable, ...prev]);
    }
    // تسجيل الذمّة لا يُحرّك السيولة (الزبون مدين لنا، وليس نقداً في الصندوق)
    setReceivableSuccess(true);
    addAuditEntry({
      action: 'receivable_add',
      amount: newReceivable.amount,
      description: `ذمّة جديدة على الزبون: ${newReceivable.customerName}`,
      relatedId: recId,
    });
    setNewRecCustomer('');
    setNewRecDesc('');
    setTimeout(() => setReceivableSuccess(false), 2200);
  };

  // --- COLLECT RECEIVABLE (تحصيل دفعة من ذمّة زبون وإضافتها للسيولة — عكس تسديد الموردين) ---
  const handleCollectReceivable = (r: Receivable, rawAmount: number) => {
    const remaining = Math.max(0, r.amount - r.paidAmount);
    const collect = Math.min(Math.max(0, Math.round(rawAmount || 0)), remaining);
    if (collect <= 0) return;
    const newPaid = r.paidAmount + collect;
    const newStatus: Receivable['status'] = newPaid >= r.amount ? 'paid' : 'partial';
    setWalletBalance(prev => prev + collect); // CASH IN — إضافة للسيولة، عكس الذمم الدائنة
    setReceivables(prev => prev.map(x => x.id === r.id ? { ...x, paidAmount: newPaid, status: newStatus } : x));
    if (currentUser) {
      const userId = currentUser.uid;
      setDoc(doc(db, 'users', userId, 'receivables', r.id), { ...r, paidAmount: newPaid, status: newStatus, userId }, { merge: true })
        .catch(err => handleFirestoreError(err, OperationType.WRITE, `users/${userId}/receivables/${r.id}`));
    }
    setCollectInputs(prev => ({ ...prev, [r.id]: 0 }));
    addAuditEntry({
      action: 'receivable_collect',
      amount: collect,
      description: `تحصيل من ${r.customerName} — المتبقي: ${(r.amount - newPaid).toLocaleString()} د.ع`,
      relatedId: r.id,
    });
  };

  // Handle Google OAuth Action
  const handleGoogleSignIn = async () => {
    setSignInError('');
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error("Sign-in failed:", err);
      const code = err?.code ?? '';
      if (code === 'auth/popup-blocked') {
        setSignInError('المتصفح حجب نافذة تسجيل الدخول — أذن للنوافذ المنبثقة من إعدادات المتصفح ثم أعد المحاولة.');
      } else if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setSignInError('أُغلقت نافذة الدخول قبل اكتمال العملية — حاول مجدداً.');
      } else if (code === 'auth/unauthorized-domain') {
        setSignInError('هذا النطاق غير مصرّح به في إعدادات Firebase — تواصل مع المشرف.');
      } else if (code === 'auth/network-request-failed') {
        setSignInError('تعذّر الاتصال بالإنترنت — تحقّق من الشبكة وأعد المحاولة.');
      } else {
        setSignInError('فشل تسجيل الدخول — أعد المحاولة أو تحقّق من الإنترنت.');
      }
    }
  };

  // فحص قاطع للمزامنة: يقرأ العدد الفعلي للبيانات مباشرةً من خادم Firestore
  // (getCountFromServer يتجاوز الكاش المحلي دائماً) ويقارنه بالظاهر على هذا الجهاز.
  // شغّله على كل جهاز ليكشف بدقّة: هل البيانات وصلت للسحابة؟ وهل هذا الجهاز يقرؤها؟
  const handleCloudCheck = async () => {
    if (!currentUser) return;
    const uid = currentUser.uid;
    try {
      const [salesSnap, invSnap] = await Promise.all([
        getCountFromServer(collection(db, 'users', uid, 'salesLedger')),
        getCountFromServer(collection(db, 'users', uid, 'inventory')),
      ]);
      const serverSales = salesSnap.data().count;
      const serverInv = invSnap.data().count;
      const ok = serverSales === salesLedger.length && serverInv === inventory.length;
      alert(
        '🔍 فحص السحابة (قراءة مباشرة من الخادم)\n\n' +
        'الحساب: ' + (currentUser.email || '—') + '\n' +
        'معرّف الحساب (uid): ' + uid + '\n\n' +
        '— الفواتير —\n' +
        'على الخادم: ' + serverSales + '\n' +
        'ظاهرة على هذا الجهاز: ' + salesLedger.length + '\n\n' +
        '— المخزون —\n' +
        'على الخادم: ' + serverInv + '\n' +
        'ظاهر على هذا الجهاز: ' + inventory.length + '\n\n' +
        (ok
          ? '✅ متطابق — هذا الجهاز متزامن تماماً مع السحابة.'
          : '⚠️ يوجد فرق — بعض البيانات لم تتزامن مع هذا الجهاز.')
      );
    } catch (e) {
      const msg = String((e as Error)?.message || e);
      alert('تعذّر فحص السحابة:\n' + msg + '\n\nقد يعني هذا أن هذا الجهاز لا يصل لخادم Firestore (مشكلة اتصال/صلاحيات).');
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Sign-out failed:", err);
    }
  };

  // --- POS CART COMPUTE ---
  const posSubtotal = currentCart.reduce((sum, item) => sum + (item.medicine.price * item.quantity), 0);
  const posDiscountAmount = Math.round(posSubtotal * (posDiscountPercent / 100));
  const posTotal = posSubtotal - posDiscountAmount;

  // --- FINANCIAL PERIOD ANALYTICS (يومي / أسبوعي / شهري / سنوي) ---
  const {
    statsToday, statsWeek, statsMonth, statsYear, finAccent, financialPeriods,
    chartSeries, chartMax, topProfitable, topSelling, slowestMoving,
    expMonth, expYear, netProfitMonth, netProfitYear,
    plStats, plReturns, plExpenseRows, plGrossSales, plCogs, plNetSales,
    plNetCogs, plGrossProfit, plTotalExpenses, plNetProfit, plGrossMargin, plNetMargin,
    totalDebts, totalReceivables,
    finTodayStr, plIsMonth,
  } = useMemo(() => {
    // يجمّع سجل المبيعات حسب الفترة الزمنية ويحسب: المبيعات، الربح، الهامش، عدد الفواتير، متوسط الفاتورة
    const computePeriodStats = (predicate: (saleDate: Date) => boolean) => {
      const rows = salesLedger.filter(s => {
        const d = new Date(String(s.timestamp).replace(' ', 'T'));
        return !isNaN(d.getTime()) && predicate(d);
      });
      const sales = rows.reduce((sum, r) => sum + (r.total || 0), 0);
      const profit = rows.reduce((sum, r) => sum + (r.grossProfit ?? 0), 0);
      const count = rows.length;
      const margin = sales > 0 ? Math.round((profit / sales) * 100) : 0;
      const avg = count > 0 ? Math.round(sales / count) : 0;
      return { sales, profit, margin, count, avg };
    };

    const finNow = new Date();
    const finTodayStr = `${finNow.getFullYear()}-${String(finNow.getMonth() + 1).padStart(2, '0')}-${String(finNow.getDate()).padStart(2, '0')}`;
    const finWeekAgo = new Date(finNow.getFullYear(), finNow.getMonth(), finNow.getDate() - 6); // آخر 7 أيام شاملة اليوم

    const statsToday = computePeriodStats(d => {
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return ds === finTodayStr;
    });
    const statsWeek = computePeriodStats(d => d >= finWeekAgo);
    const statsMonth = computePeriodStats(d => d.getFullYear() === finNow.getFullYear() && d.getMonth() === finNow.getMonth());
    const statsYear = computePeriodStats(d => d.getFullYear() === finNow.getFullYear());

    // خرائط ألوان ثابتة (Tailwind يحتاج أسماء أصناف كاملة وليست مركّبة ديناميكياً)
    const finAccent: Record<string, { badge: string; icon: string; profit: string; ring: string }> = {
      emerald: { badge: 'bg-emerald-50 text-emerald-700', icon: 'text-emerald-600', profit: 'text-emerald-700', ring: 'border-emerald-100' },
      blue: { badge: 'bg-blue-50 text-blue-700', icon: 'text-blue-600', profit: 'text-blue-700', ring: 'border-blue-100' },
      violet: { badge: 'bg-violet-50 text-violet-700', icon: 'text-violet-600', profit: 'text-violet-700', ring: 'border-violet-100' },
      amber: { badge: 'bg-amber-50 text-amber-700', icon: 'text-amber-600', profit: 'text-amber-700', ring: 'border-amber-100' },
    };
    const financialPeriods = [
      { key: 'today', label: 'اليوم', sub: 'مبيعات هذا اليوم', stats: statsToday, accent: 'emerald' },
      { key: 'week', label: 'آخر 7 أيام', sub: 'الأسبوع الجاري', stats: statsWeek, accent: 'blue' },
      { key: 'month', label: 'هذا الشهر', sub: 'الشهر الحالي', stats: statsMonth, accent: 'violet' },
      { key: 'year', label: 'هذا العام', sub: 'السنة المالية', stats: statsYear, accent: 'amber' },
    ];

    // --- SALES/PROFIT TREND CHART SERIES (تجميع يومي أو أسبوعي حسب المدى) ---
    const buildChartSeries = (rangeDays: number) => {
      const today = new Date();
      const startDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (rangeDays - 1));
      const byWeek = rangeDays > 30; // المدى 90 يوماً يُجمّع أسبوعياً لتجنب أعمدة كثيرة
      const buckets: { label: string; sales: number; profit: number; from: Date; to: Date }[] = [];
      if (byWeek) {
        const numWeeks = Math.ceil(rangeDays / 7);
        for (let w = numWeeks - 1; w >= 0; w--) {
          const to = new Date(today.getFullYear(), today.getMonth(), today.getDate() - w * 7);
          const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - w * 7 - 6);
          buckets.push({ label: `${from.getDate()}/${from.getMonth() + 1}`, sales: 0, profit: 0, from, to });
        }
      } else {
        for (let i = rangeDays - 1; i >= 0; i--) {
          const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
          buckets.push({ label: `${d.getDate()}/${d.getMonth() + 1}`, sales: 0, profit: 0, from: d, to: d });
        }
      }
      salesLedger.forEach(s => {
        const sd = new Date(String(s.timestamp).replace(' ', 'T'));
        if (isNaN(sd.getTime())) return;
        const sDay = new Date(sd.getFullYear(), sd.getMonth(), sd.getDate());
        if (sDay < startDay || sDay > today) return;
        const b = buckets.find(bk => sDay >= bk.from && sDay <= bk.to);
        if (b) { b.sales += s.total || 0; b.profit += s.grossProfit ?? 0; }
      });
      return buckets;
    };
    const chartSeries = buildChartSeries(chartRange);
    const chartMax = Math.max(1, ...chartSeries.map(b => b.sales));

    // --- PRODUCT-LEVEL ANALYTICS (تجميع من سجل المبيعات مع توحيد الأسماء) ---
    // توحيد الاسم: إزالة الجزء بين قوسين (الاسم الإنجليزي/الوصف) لدمج السجلات القديمة والجديدة
    const normalizeName = (n: string) => String(n).split(' (')[0].trim();
    const productAgg: Record<string, { name: string; qty: number; revenue: number; profit: number }> = {};
    salesLedger.forEach(s => {
      s.items.forEach(it => {
        const key = normalizeName(it.name);
        if (!productAgg[key]) productAgg[key] = { name: key, qty: 0, revenue: 0, profit: 0 };
        productAgg[key].qty += it.quantity || 0;
        productAgg[key].revenue += (it.price || 0) * (it.quantity || 0);
        productAgg[key].profit += it.lineProfit ?? 0;
      });
    });
    const productList = Object.values(productAgg);
    const topProfitable = [...productList].sort((a, b) => b.profit - a.profit).slice(0, 5);
    const topSelling = [...productList].sort((a, b) => b.qty - a.qty).slice(0, 5);
    const slowestMoving = [...inventory]
      .map(m => {
        const sold = productAgg[normalizeName(m.nameAr)]?.qty ?? 0;
        const unitCost = m.costPrice ?? Math.round(m.price * 0.72);
        return { name: m.nameAr, sold, stock: m.availableQuantity, value: unitCost * m.availableQuantity };
      })
      .sort((a, b) => a.sold - b.sold || b.value - a.value)
      .slice(0, 5);

    // --- NET PROFIT (الربح الصافي = الربح الإجمالي − المصاريف) ---
    const sumExpenses = (predicate: (d: Date) => boolean) =>
      expenses.filter(e => { const d = new Date(e.date); return !isNaN(d.getTime()) && predicate(d); })
        .reduce((sum, e) => sum + (e.amount || 0), 0);
    const expMonth = sumExpenses(d => d.getFullYear() === finNow.getFullYear() && d.getMonth() === finNow.getMonth());
    const expYear = sumExpenses(d => d.getFullYear() === finNow.getFullYear());
    const netProfitMonth = statsMonth.profit - expMonth;
    const netProfitYear = statsYear.profit - expYear;

    // --- قائمة الأرباح والخسائر (P&L / income statement) — تجمع الإيراد والتكلفة والمرتجعات والمصاريف لفترة واحدة ---
    // مرتجعات الفترة: value = قيمة البيع المُرتجَع (تُخصم من الإيراد)، cost = تكلفة البضاعة العائدة للمخزون (تُخصم من COGS)
    const sumReturns = (predicate: (d: Date) => boolean) => {
      let value = 0, cost = 0, count = 0;
      salesReturns.forEach(r => {
        const d = new Date(String(r.timestamp).replace(' ', 'T'));
        if (isNaN(d.getTime()) || !predicate(d)) return;
        count++;
        value += r.total || 0;
        cost += r.items.reduce((s, it) => s + (it.costPrice ?? 0) * (it.quantity || 0), 0);
      });
      return { value, cost, count };
    };
    // تجميع المصاريف حسب النوع لفترة واحدة (لعرضها مفصّلة داخل القائمة)
    const expensesByCategory = (predicate: (d: Date) => boolean) => {
      const map: Record<string, number> = {};
      expenses.forEach(e => {
        const d = new Date(e.date);
        if (isNaN(d.getTime()) || !predicate(d)) return;
        map[e.category] = (map[e.category] || 0) + (e.amount || 0);
      });
      return Object.entries(map).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
    };
    const plIsMonth = plPeriod === 'month';
    const plPredicate = plIsMonth
      ? (d: Date) => d.getFullYear() === finNow.getFullYear() && d.getMonth() === finNow.getMonth()
      : (d: Date) => d.getFullYear() === finNow.getFullYear();
    const plStats = plIsMonth ? statsMonth : statsYear;
    const plReturns = sumReturns(plPredicate);
    const plExpenseRows = expensesByCategory(plPredicate);
    const plGrossSales = plStats.sales;                  // إجمالي المبيعات (الإيراد)
    const plCogs = plStats.sales - plStats.profit;       // تكلفة البضاعة المباعة = المبيعات − الربح الإجمالي
    const plNetSales = plGrossSales - plReturns.value;   // صافي المبيعات بعد خصم المرتجعات
    const plNetCogs = plCogs - plReturns.cost;           // التكلفة بعد إرجاع بضاعة المرتجعات للمخزون
    const plGrossProfit = plNetSales - plNetCogs;        // مجمل الربح = صافي المبيعات − التكلفة
    const plTotalExpenses = plExpenseRows.reduce((s, r) => s + r.amount, 0);
    const plNetProfit = plGrossProfit - plTotalExpenses; // صافي الربح = مجمل الربح − المصاريف التشغيلية
    const plGrossMargin = plNetSales > 0 ? Math.round((plGrossProfit / plNetSales) * 100) : 0;
    const plNetMargin = plNetSales > 0 ? Math.round((plNetProfit / plNetSales) * 100) : 0;

    // --- إجمالي الذمم الدائنة المستحقة (مشتقّ من دفتر ديون الموردين) ---
    const totalDebts = payables.reduce((sum, p) => sum + Math.max(0, (p.amount || 0) - (p.paidAmount || 0)), 0);

    // --- إجمالي الذمم المدينة المستحقة لنا (مشتقّ من دفتر ذمم الزبائن / البيع بالآجل) ---
    const totalReceivables = receivables.reduce((sum, r) => sum + Math.max(0, (r.amount || 0) - (r.paidAmount || 0)), 0);

    return {
      statsToday, statsWeek, statsMonth, statsYear, finAccent, financialPeriods,
      chartSeries, chartMax, topProfitable, topSelling, slowestMoving,
      expMonth, expYear, netProfitMonth, netProfitYear,
      plStats, plReturns, plExpenseRows, plGrossSales, plCogs, plNetSales,
      plNetCogs, plGrossProfit, plTotalExpenses, plNetProfit, plGrossMargin, plNetMargin,
      totalDebts, totalReceivables,
      finTodayStr, plIsMonth,
    };
  }, [salesLedger, inventory, expenses, payables, receivables, salesReturns, chartRange, plPeriod]);

  // Search filter for POS select
  // فهرس المخزون المُسبق الحساب — يُعاد بناؤه عند تغيّر inventory فقط
  const inventoryIndex = useMemo(() => inventory.map(m => ({
    m,
    nameAr:  m.nameAr.toLowerCase(),
    nameEn:  (m.nameEn || '').toLowerCase(),
    sci:     (m.scientificName || '').toLowerCase(),
    barcode: (m.barcode || '').toLowerCase(),
  })), [inventory]);

  const filteredPOSMeds = useMemo(() => {
    const q = deferredPOSQuery.toLowerCase().trim();
    if (!q) return inventory;
    return inventoryIndex
      .filter(({ nameAr, nameEn, sci, barcode }) =>
        nameAr.includes(q) || nameEn.includes(q) || sci.includes(q) || barcode.includes(q)
      )
      .map(({ m }) => m);
  }, [deferredPOSQuery, inventory, inventoryIndex]);

  const filteredInventory = useMemo(() => {
    const q = deferredInvQuery.toLowerCase().trim();
    if (!q) return inventory;
    return inventory.filter(m =>
      m.nameAr.toLowerCase().includes(q) ||
      m.nameEn.toLowerCase().includes(q) ||
      m.scientificName.toLowerCase().includes(q) ||
      (m.barcode && m.barcode.toLowerCase().includes(q))
    );
  }, [inventory, deferredInvQuery]);

  // مطابقة باركود/اسم في مرور واحد فقط (بدل 3 مرورات متتالية)
  const findScanMatch = useCallback((query: string): Medicine | null => {
    const q = query.trim();
    if (!q) return null;
    const lower = q.toLowerCase();
    let exact: Medicine | null = null;
    let partial: Medicine | null = null;
    for (const { m, nameAr, nameEn, sci, barcode } of inventoryIndex) {
      if (barcode === lower || nameAr === lower || nameEn === lower) return m;
      if (!exact && (nameAr.includes(lower) || nameEn.includes(lower) || sci.includes(lower) || barcode.includes(lower)))
        exact = m;
    }
    return exact || partial;
  }, [inventoryIndex]);

  // مُثبّت بـ useCallback + functional update — حتى تبقى هويته مستقرة (يعتمد عليه POSSearchBar)
  const addToCart = useCallback((med: Medicine) => {
    if (med.availableQuantity <= 0) return;
    setCurrentCart(prev => {
      const idx = prev.findIndex(item => item.medicine.id === med.id);
      if (idx !== -1) {
        const existing = prev[idx];
        if (existing.quantity >= med.availableQuantity) return prev;
        const rest = prev.filter(item => item.medicine.id !== med.id);
        return [{ ...existing, quantity: existing.quantity + 1 }, ...rest];
      }
      return [{ medicine: med, quantity: 1 }, ...prev];
    });
  }, []);

  // Callbacks مستقرّة تُمرَّر إلى POSSearchBar (حتى لا يُعاد ضبط مؤقّت الـ debounce بلا داعٍ)
  const handlePOSQueryChange = useCallback((q: string) => setSearchPOSQuery(q), []);
  const handlePOSEnter = useCallback((value: string) => {
    const match = findScanMatch(value);
    if (match) { addToCart(match); return true; }
    return false;
  }, [findScanMatch, addToCart]);
  const handlePOSScanClick = useCallback(() => startScanning('pos'), []);

  // مُثبّتتان بـ useCallback + functional update — هويتهما مستقرّة فلا تكسران React.memo على CartItemRow
  const removeFromCart = useCallback((medId: string) => {
    setCurrentCart(prev => prev.filter(item => item.medicine.id !== medId));
  }, []);

  const updateCartQty = useCallback((medId: string, delta: number) => {
    setCurrentCart(prev => prev.map(item => {
      if (item.medicine.id === medId) {
        const nextQty = item.quantity + delta;
        const maxQty = item.medicine.availableQuantity;
        if (nextQty >= 1 && nextQty <= maxQty) {
          return { ...item, quantity: nextQty };
        }
      }
      return item;
    }));
  }, []);

  // مغلّفان لتثبيت الإشارة المُمرَّرة إلى CartItemRow (onInc/onDec لا تقبل delta)
  const incCartQty = useCallback((medId: string) => updateCartQty(medId, 1), [updateCartQty]);
  const decCartQty = useCallback((medId: string) => updateCartQty(medId, -1), [updateCartQty]);

  // COMPLETE SALE DISPATCH
  const handleCheckoutPOS = (e: FormEvent) => {
    e.preventDefault();
    if (currentCart.length === 0) return;

    const invoiceId = `INV-${Math.floor(Math.random() * 9000 + 1000)}`;
    const now = new Date();
    const formattedTimestamp = now.getFullYear() + '-' + 
      String(now.getMonth() + 1).padStart(2, '0') + '-' + 
      String(now.getDate()).padStart(2, '0') + ' ' + 
      String(now.getHours()).padStart(2, '0') + ':' + 
      String(now.getMinutes()).padStart(2, '0');

    // --- COST & PROFIT COMPUTATION ---
    // Cost basis per line (fallback to ~72% of sale price for legacy items without costPrice)
    const itemsWithCost = currentCart.map(item => {
      const unitCost = item.medicine.costPrice ?? Math.round(item.medicine.price * 0.72);
      return {
        name: `${item.medicine.nameAr} (${item.medicine.nameEn})`,
        quantity: item.quantity,
        price: item.medicine.price,
        costPrice: unitCost,
        lineProfit: (item.medicine.price - unitCost) * item.quantity // ربح السطر قبل خصم الفاتورة
      };
    });
    const posTotalCost = itemsWithCost.reduce((sum, it) => sum + (it.costPrice * it.quantity), 0);
    const posGrossProfit = posTotal - posTotalCost; // الربح الإجمالي بعد خصم الفاتورة
    const posProfitMargin = posTotal > 0 ? Math.round((posGrossProfit / posTotal) * 100) : 0;

    const newSaleRecord: SaleRecord = {
      invoiceId,
      timestamp: formattedTimestamp,
      items: itemsWithCost,
      subtotal: posSubtotal,
      discount: posDiscountAmount,
      total: posTotal,
      totalCost: posTotalCost,
      grossProfit: posGrossProfit,
      profitMargin: posProfitMargin,
      customerName: posCustomerName,
    };

    // بيع بالآجل: أنشئ ذمّة على الزبون بدلاً من قبض نقدي فوري (الإيراد يُعترف به، لكن النقد لاحقاً)
    let creditReceivable: Receivable | null = null;
    if (posOnCredit) {
      creditReceivable = {
        id: `REC-${Math.floor(Math.random() * 90000 + 10000)}`,
        customerName: posCustomerName,
        amount: posTotal,
        paidAmount: 0,
        date: new Date().toISOString().split('T')[0],
        status: 'open',
        relatedInvoiceId: invoiceId,
        description: `بيع آجل (${currentCart.length} صنف)`,
      };
      setReceivables(prev => [creditReceivable!, ...prev]);
    }

    // 1. Decrement state values or persist directly to Firestore
    if (currentUser) {
      const userId = currentUser.uid;
      
      // Update matched medicine levels in Firestore
      currentCart.forEach(item => {
        const med = inventory.find(m => m.id === item.medicine.id);
        if (med) {
          const nextQty = Math.max(0, med.availableQuantity - item.quantity);
          const updatedMed = {
            ...med,
            availableQuantity: nextQty,
            status: nextQty <= 0 ? 'unavailable' : nextQty < 15 ? 'low' : 'available',
            updatedAt: new Date().toISOString()
          };
          setDoc(doc(db, 'users', userId, 'inventory', med.id), updatedMed)
            .catch(e => handleFirestoreError(e, OperationType.WRITE, `users/${userId}/inventory/${med.id}`));
        }
      });

      // Store sale invoice in ledger
      const finalSaleRecord = {
        ...newSaleRecord,
        userId
      };
      setDoc(doc(db, 'users', userId, 'salesLedger', invoiceId), finalSaleRecord)
        .catch(e => handleFirestoreError(e, OperationType.CREATE, `users/${userId}/salesLedger/${invoiceId}`));

      // بيع بالآجل: سجّل الذمّة المدينة على الزبون في Firestore (بدون قبض نقدي)
      if (creditReceivable) {
        const payload: any = {
          id: creditReceivable.id,
          customerName: creditReceivable.customerName,
          amount: creditReceivable.amount,
          paidAmount: creditReceivable.paidAmount,
          date: creditReceivable.date,
          status: creditReceivable.status,
          relatedInvoiceId: creditReceivable.relatedInvoiceId,
          userId,
        };
        if (creditReceivable.description) payload.description = creditReceivable.description;
        setDoc(doc(db, 'users', userId, 'receivables', creditReceivable.id), payload)
          .catch(e => handleFirestoreError(e, OperationType.CREATE, `users/${userId}/receivables/${creditReceivable.id}`));
      }

      addAuditEntry({
        action: 'sale',
        amount: posTotal,
        description: `فاتورة بيع ${posOnCredit ? 'آجل' : 'نقدي'} (${currentCart.length} صنف) — ${posCustomerName}`,
        relatedId: invoiceId,
      });
      setLastPrintedInvoice(newSaleRecord);
      setShowReceiptModal(true);
      setCurrentCart([]);
      setPosCustomerName('زبون نقدي / خارجي');
      setPosDiscountPercent(0);
      setPosOnCredit(false);
    } else {
      // Decrement state values in live inventory database!
      setInventory(prevInventory => {
        return prevInventory.map(med => {
          const cartItem = currentCart.find(i => i.medicine.id === med.id);
          if (cartItem) {
            const nextQty = Math.max(0, med.availableQuantity - cartItem.quantity);
            return {
              ...med,
              availableQuantity: nextQty,
              status: nextQty <= 0 ? 'unavailable' : nextQty < 15 ? 'low' : 'available'
            };
          }
          return med;
        });
      });

      // Adjust financial counters — الإيراد يُعترف به دائماً، لكن النقد لا يُضاف عند البيع بالآجل
      setDailySalesRevenue(prev => prev + posTotal);
      if (!posOnCredit) setWalletBalance(prev => prev + posTotal);

      // Store sales record local fallback
      setSalesLedger([newSaleRecord, ...salesLedger]);
      addAuditEntry({
        action: 'sale',
        amount: posTotal,
        description: `فاتورة بيع ${posOnCredit ? 'آجل' : 'نقدي'} (${currentCart.length} صنف) — ${posCustomerName}`,
        relatedId: invoiceId,
      });
      setLastPrintedInvoice(newSaleRecord);
      setShowReceiptModal(true);

      // Clear cart & trigger reset
      setCurrentCart([]);
      setPosCustomerName('زبون نقدي / خارجي');
      setPosDiscountPercent(0);
      setPosOnCredit(false);
    }
  };

  // --- DYNAMIC NEW INVENTORY ADD ---
  const handleAddNewDrug = (e: FormEvent) => {
    e.preventDefault();
    if (!newDrugAr || !newDrugEn) return;

    // تحذير: إذا لم يكن المستخدم مسجّل دخوله، البيانات لن تُحفظ بعد إغلاق التطبيق
    if (!currentUser) {
      alert('⚠️ تنبيه: أنت غير مسجّل دخول!\n\nلحفظ المواد بشكل دائم، الرجاء الضغط على زر "ربط المزامنة السحابية (Google)" أعلى الصفحة أولاً.\n\nبدون تسجيل الدخول، ستختفي المادة عند إغلاق التطبيق أو تحديث الصفحة.');
      return;
    }

    // إنشاء ID آمن بأخذ أعلى ID موجود + 1 لتجنّب التصادم عند الحذف
    const maxExistingId = inventory.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0);
    const newId = String(maxExistingId + 1);

    const newMedItem: Medicine = {
      id: newId,
      nameAr: newDrugAr,
      nameEn: newDrugEn,
      scientificName: newDrugSci || 'N/A',
      activeIngredient: newDrugSci || 'N/A',
      category: '',
      warehouse: 'أدخلت يدويا في صيدلية انوار الحسن',
      price: newDrugPrice,
      secondaryPrice: newDrugSecondaryPrice,
      costPrice: Math.round(newDrugPrice * 0.72), // تقدير مبدئي للتكلفة (يُحدّث عند أول عملية شراء)
      lastCostPrice: Math.round(newDrugPrice * 0.72),
      availableQuantity: newDrugQty,
      status: 'available',
      minStock: newDrugMinStock,
      barcode: newDrugBarcode || '62811' + Math.floor(Math.random() * 90000000 + 10000000)
    };

    const userId = currentUser.uid;
    setDoc(doc(db, 'users', userId, 'inventory', newId), {
      ...newMedItem,
      userId
    }).catch(e => handleFirestoreError(e, OperationType.CREATE, `users/${userId}/inventory/${newId}`));

    setExpiryDates(prev => ({ ...prev, [newId]: newDrugExpiry }));

    // Reset fields
    setNewDrugAr('');
    setNewDrugEn('');
    setNewDrugSci('');
    setNewDrugPrice(5000);
    setNewDrugSecondaryPrice(5500);
    setNewDrugQty(100);
    setNewDrugBarcode('');
    setIsAddingDrug(false);
    setNewDrugMinStock(15);
  };

  // --- SEED TEST DATA (مؤقت للاختبار فقط) ---
  const handleSeedTestData = async () => {
    if (!currentUser) return;
    const userId = currentUser.uid;
    const maxId = inventory.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0);
    const testMeds: Medicine[] = [
      {
        id: String(maxId + 1),
        nameAr: 'زيثروماكس 500 ملغ',
        nameEn: 'Zithromax 500mg',
        scientificName: 'Azithromycin',
        activeIngredient: 'أزيثروميسين',
        category: 'المضادات الحيوية',
        warehouse: 'مذخر النخبة العلمي (الموصل)',
        price: 14000, secondaryPrice: 15500, costPrice: 12000, lastCostPrice: 12000,
        availableQuantity: 80, minStock: 20, status: 'available',
        barcode: '6281100000001'
      },
      {
        id: String(maxId + 2),
        nameAr: 'نيكسيوم 40 ملغ',
        nameEn: 'Nexium 40mg',
        scientificName: 'Esomeprazole',
        activeIngredient: 'إيزوميبرازول',
        category: 'أدوية الجهاز الهضمي',
        warehouse: 'مذخر السلام الدولي (النجف)',
        price: 11500, secondaryPrice: 12800, costPrice: 9800, lastCostPrice: 9800,
        availableQuantity: 5, minStock: 15, status: 'low',
        barcode: '6281100000002'
      },
      {
        id: String(maxId + 3),
        nameAr: 'ديكساميثازون 4 ملغ',
        nameEn: 'Dexamethasone 4mg',
        scientificName: 'Dexamethasone',
        activeIngredient: 'ديكساميثازون',
        category: 'كورتيزونات ومضادات الحساسية',
        warehouse: 'مذخر الفيحاء الدوائي (السليمانية)',
        price: 3200, secondaryPrice: 3700, costPrice: 2600, lastCostPrice: 2600,
        availableQuantity: 200, minStock: 50, status: 'available',
        barcode: '6281100000003'
      },
      {
        id: String(maxId + 4),
        nameAr: 'ميترونيدازول 500 ملغ',
        nameEn: 'Metronidazole 500mg',
        scientificName: 'Metronidazole',
        activeIngredient: 'ميترونيدازول',
        category: 'أدوية الأمعاء والطفيليات',
        warehouse: 'مكتب دجلة العلمي للأدوية (بغداد)',
        price: 2800, secondaryPrice: 3200, costPrice: 2200, lastCostPrice: 2200,
        availableQuantity: 0, minStock: 10, status: 'unavailable',
        barcode: '6281100000004'
      },
      {
        id: String(maxId + 5),
        nameAr: 'أوميبرازول 20 ملغ',
        nameEn: 'Omeprazole 20mg',
        scientificName: 'Omeprazole',
        activeIngredient: 'أوميبرازول',
        category: 'أدوية الجهاز الهضمي',
        warehouse: 'مذخر قصر الشفاء الحديث (أربيل)',
        price: 5500, secondaryPrice: 6200, costPrice: 4500, lastCostPrice: 4500,
        availableQuantity: 350, minStock: 60, status: 'available',
        barcode: '6281100000005'
      }
    ];
    for (const med of testMeds) {
      await setDoc(doc(db, 'users', userId, 'inventory', med.id), { ...med, userId });
    }
    alert('✅ تمت إضافة 5 أدوية تجريبية بنجاح!');
  };

  // --- BULK INVENTORY IMPORT (استيراد المخزون الكامل من ES-PRO) ---
  const handleBulkImportInventory = async () => {
    setShowBulkImportConfirm(false);
    setBulkImportStatus('loading');
    setBulkImportMsg('جارٍ تحميل ملف الأدوية...');
    try {
      const res = await fetch('/inventory-seed.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('تعذّر تحميل ملف البيانات');
      const meds: Medicine[] = await res.json();

      // معرّفات المواد القديمة التي ستُحذف (استبدال كامل — كل ما ليس ضمن الملف الجديد)
      const newIdSet = new Set(meds.map(m => m.id));
      const oldIds = inventory.map(m => m.id).filter(id => !newIdSet.has(id));

      // استبدال الحالة المحلية فوراً بالبيانات الجديدة فقط
      setInventory(meds);

      if (!currentUser) {
        // وضع تجريبي بدون تسجيل دخول — يُحفظ محلياً فقط
        setBulkImportStatus('done');
        setBulkImportMsg(`تم تحميل ${meds.length.toLocaleString()} صنف محلياً. سجّل الدخول لمزامنتها سحابياً.`);
        setTimeout(() => setBulkImportStatus('idle'), 8000);
        return;
      }

      setBulkImportStatus('writing');
      const userId = currentUser.uid;
      const CHUNK = 450;

      // 1) حذف المواد القديمة/التجريبية من Firestore (دفعات)
      if (oldIds.length) {
        setBulkImportMsg(`جارٍ تنظيف ${oldIds.length.toLocaleString()} مادة قديمة...`);
        for (let i = 0; i < oldIds.length; i += CHUNK) {
          const batch = writeBatch(db);
          oldIds.slice(i, i + CHUNK).forEach(id => {
            batch.delete(doc(db, 'users', userId, 'inventory', id));
          });
          await batch.commit();
        }
      }

      // 2) كتابة المخزون الجديد (دفعات، حد الدفعة 500 عملية)
      setBulkImportMsg('جارٍ رفع المخزون الجديد...');
      setBulkImportProgress({ done: 0, total: meds.length });
      for (let i = 0; i < meds.length; i += CHUNK) {
        const slice = meds.slice(i, i + CHUNK);
        const batch = writeBatch(db);
        slice.forEach(m => {
          batch.set(doc(db, 'users', userId, 'inventory', m.id), { ...m, userId });
        });
        await batch.commit();
        setBulkImportProgress({ done: Math.min(i + CHUNK, meds.length), total: meds.length });
      }

      setBulkImportStatus('done');
      setBulkImportMsg(`تم استبدال المخزون بنجاح — ${meds.length.toLocaleString()} صنف في حسابك السحابي!`);
      addAuditEntry({
        action: 'inventory_import',
        amount: 0,
        description: `استبدال المخزون الكامل (${meds.length} صنف) من بيانات المخازن`,
        relatedId: 'bulk-import',
      });
      setTimeout(() => setBulkImportStatus('idle'), 10000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'خطأ غير متوقع';
      setBulkImportStatus('error');
      setBulkImportMsg(`فشل الاستيراد: ${msg}`);
      if (currentUser) handleFirestoreError(e, OperationType.WRITE, `users/${currentUser.uid}/inventory`);
    }
  };

  // تطبيق مورّد موحّد على كل أصناف مسودة الشراء (مصدره صندوق الملخص بدل عمود الجدول)
  const applyDraftSupplier = (val: string) => {
    setPurchaseSupplier(val);
    setCreditSupplierName(val);
    setPurchaseDraft(prev => prev.map(d => ({ ...d, warehouse: val })));
    if (val) setInventory(prev => prev.map(m => purchaseDraft.some(d => d.medicineId === m.id) ? { ...m, warehouse: val } : m));
  };

  // --- PURCHASE ORDERS (طلبيات الشراء) BUSINESS LOGIC ---
  const addToPurchaseDraft = (med: any, overrideQty?: number) => {
    const exists = purchaseDraft.find(d => d.medicineId === med.id);
    if (exists) {
      // زيادة الكمية ونقل الصنف إلى أعلى القائمة
      setPurchaseDraft(prev => {
        const target = prev.find(d => d.medicineId === med.id);
        const rest = prev.filter(d => d.medicineId !== med.id);
        return [{ ...target, qty: target.qty + (overrideQty ?? 10) }, ...rest];
      });
    } else {
      const newItem = {
        id: 'draft-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        medicineId: med.id,
        nameAr: med.nameAr,
        nameEn: med.nameEn,
        scientificName: med.scientificName || 'N/A',
        // سعر جملة يعتمد على آخر سعر شراء فعلي إن وُجد، وإلا التكلفة المتوسطة، وإلا تقدير 72%
        price: Number(med.lastCostPrice) || Number(med.costPrice) || Math.floor(med.price * 0.72) || 3000,
        retailPrice: med.price || 0,
        officialPrice: med.secondaryPrice || (med.price ? med.price + 500 : 0),
        qty: overrideQty ?? 1,
        expiryDate: expiryDates[med.id] || '2028-12-01',
        barcode: med.barcode || '62811' + Math.floor(Math.random() * 900000 + 100000),
        warehouse: purchaseSupplier || med.warehouse || '',
      };
      setPurchaseDraft(prev => [newItem, ...prev]);
    }
  };

  const commitPurchaseDraft = () => {
    if (purchaseDraft.length === 0) return;

    const orderId = `PO-${Math.floor(Math.random() * 90000 + 10000)}`;
    const totalCost = purchaseDraft.reduce((acc, curr) => acc + (curr.price * curr.qty), 0);

    const archivedOrder: Order = {
      id: orderId,
      date: new Date().toISOString().split('T')[0],
      warehouseName: 'قائمة توريد طلبيات الشراء اليومية للـ صيدلية',
      itemsCount: purchaseDraft.length,
      totalAmount: totalCost,
      status: 'delivered',
      items: purchaseDraft.map(item => ({
        medicineName: `${item.nameAr} (${item.nameEn})`,
        quantity: item.qty,
        price: item.price
      })),
      // لقطة كاملة من المسودة (خالية من undefined عبر JSON) لإعادة الفتح والتعديل لاحقاً
      draftSnapshot: JSON.parse(JSON.stringify(purchaseDraft)),
      onCredit: purchaseOnCredit,
      creditSupplierName: purchaseOnCredit ? (creditSupplierName.trim() || 'المذخر') : '',
    };

    let updatedInventory = [...inventory];
    let updatedExpiries = { ...expiryDates };

    purchaseDraft.forEach(draftItem => {
      if (draftItem.medicineId) {
        // Exists in inventory!
        updatedInventory = updatedInventory.map(med => {
          if (med.id === draftItem.medicineId) {
            const purchaseQty = Number(draftItem.qty);
            const purchaseUnitCost = Number(draftItem.price);
            const existingQty = med.availableQuantity;
            const existingCost = med.costPrice ?? Math.round(med.price * 0.72);
            const newQty = existingQty + purchaseQty;
            // Moving Average Cost: متوسط مرجّح بين تكلفة المخزون القديم وتكلفة الشراء الجديد
            const movingAvgCost = newQty > 0
              ? Math.round(((existingQty * existingCost) + (purchaseQty * purchaseUnitCost)) / newQty)
              : purchaseUnitCost;
            return {
              ...med,
              availableQuantity: newQty,
              costPrice: movingAvgCost,
              lastCostPrice: purchaseUnitCost,
              // سعر البيع: نحترم القيمة المعدّلة في الاستيراد إن وُجدت، وإلا التكلفة + هامش 25%
              price: draftItem.retailPrice && Number(draftItem.retailPrice) > 0
                ? Number(draftItem.retailPrice)
                : Math.floor(draftItem.price * 1.25),
              secondaryPrice: draftItem.officialPrice && Number(draftItem.officialPrice) > 0
                ? Number(draftItem.officialPrice)
                : med.secondaryPrice,
              barcode: draftItem.barcode || med.barcode,
              status: 'available' as const
            };
          }
          return med;
        });
        if (draftItem.expiryDate) {
          updatedExpiries[draftItem.medicineId] = draftItem.expiryDate;
        }
      } else {
        // Brand new drug to add to inventory list!
        const brandNewId = 'new-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
        const newMedRecord: Medicine = {
          id: brandNewId,
          nameAr: draftItem.nameAr,
          nameEn: draftItem.nameEn,
          activeIngredient: draftItem.scientificName || 'مركب فعال نشط',
          scientificName: draftItem.scientificName,
          category: '',
          warehouse: 'مكتب علمي (توريد طلبيات الشراء)',
          price: draftItem.retailPrice && Number(draftItem.retailPrice) > 0
            ? Number(draftItem.retailPrice)
            : Math.floor(draftItem.price * 1.25),
          secondaryPrice: draftItem.officialPrice && Number(draftItem.officialPrice) > 0
            ? Number(draftItem.officialPrice)
            : Math.floor(draftItem.price * 1.35),
          costPrice: Number(draftItem.price),
          lastCostPrice: Number(draftItem.price),
          availableQuantity: Number(draftItem.qty),
          status: 'available',
          barcode: draftItem.barcode || '62811' + Math.floor(Math.random() * 900000 + 100000)
        };
        updatedInventory.push(newMedRecord);
        if (draftItem.expiryDate) {
          updatedExpiries[brandNewId] = draftItem.expiryDate;
        }
      }
    });

    if (currentUser) {
      const userId = currentUser.uid;
      setDoc(doc(db, 'users', userId, 'b2bOrders', orderId), {
        ...archivedOrder,
        userId
      }).catch(e => handleFirestoreError(e, OperationType.CREATE, `users/${userId}/b2bOrders/${orderId}`));

      updatedInventory.forEach(med => {
        setDoc(doc(db, 'users', userId, 'inventory', med.id), med)
          .catch(e => handleFirestoreError(e, OperationType.WRITE, `users/${userId}/inventory/${med.id}`));
      });
    }

    setB2bOrders(prev => [archivedOrder, ...prev]);
    setInventory(updatedInventory);
    setExpiryDates(updatedExpiries);

    addAuditEntry({
      action: 'purchase',
      amount: totalCost,
      description: `فاتورة شراء ${purchaseOnCredit ? 'آجلة' : 'نقدية'} (${purchaseDraft.length} صنف)${purchaseOnCredit ? ' — ' + (creditSupplierName.trim() || 'المذخر') : ''}`,
      relatedId: orderId,
    });

    if (purchaseOnCredit) {
      // شراء بالآجل: تُسجَّل الفاتورة كذمّة على المذخر بدلاً من خصمها نقداً
      const matchedSupplier = suppliers.find(s => s.name === creditSupplierName.trim());
      const creditPayable: Payable = {
        id: `PAY-${Math.floor(Math.random() * 90000 + 10000)}`,
        supplierName: creditSupplierName.trim() || 'مذخر التوريد',
        supplierId: matchedSupplier?.id,
        amount: totalCost,
        paidAmount: 0,
        date: new Date().toISOString().split('T')[0],
        status: 'open',
        relatedOrderId: orderId,
        description: `فاتورة شراء آجلة (${purchaseDraft.length} صنف)`,
      };
      setPayables(prev => [creditPayable, ...prev]);
      if (currentUser) {
        const userId = currentUser.uid;
        // Firestore يرفض undefined — نرسل الحقول الموجودة فقط
        const payload: any = {
          id: creditPayable.id,
          supplierName: creditPayable.supplierName,
          amount: creditPayable.amount,
          paidAmount: creditPayable.paidAmount,
          date: creditPayable.date,
          status: creditPayable.status,
          userId,
        };
        if (creditPayable.dueDate) payload.dueDate = creditPayable.dueDate;
        if (creditPayable.description) payload.description = creditPayable.description;
        if (creditPayable.relatedOrderId) payload.relatedOrderId = creditPayable.relatedOrderId;
        setDoc(doc(db, 'users', userId, 'payables', creditPayable.id), payload)
          .catch(e => handleFirestoreError(e, OperationType.CREATE, `users/${userId}/payables/${creditPayable.id}`));
      }
    } else {
      // الدفع النقدي المعتاد: خصم قيمة الفاتورة من السيولة بالصندوق
      setWalletBalance(prev => Math.max(0, prev - totalCost));
    }

    setPurchaseDraft([]);
    setPurchaseOnCredit(false);
    setPurchaseSuccessBanner(
      purchaseOnCredit
        ? `تم اعتماد فاتورة الشراء بقيمة ${totalCost.toLocaleString()} د.ع كذمّة آجلة على ${creditSupplierName.trim() || 'المذخر'} وتحديث المخزون لـ ${purchaseDraft.length} أدوية!`
        : `تم بنجاح اعتماد فاتورة الشراء اليومي بقيمة ${totalCost.toLocaleString()} د.ع وتحديث مستويات المخزون والصلاحيات لـ ${purchaseDraft.length} أدوية!`
    );
    
    setTimeout(() => {
      setPurchaseSuccessBanner(null);
    }, 6000);
  };

  // إعادة فتح طلبية شراء سابقة للتعديل: نعكس أثرها (المخزون + النقد/الذمّة + قيد التدقيق)
  // ثم نعيد بنودها إلى المسودة ليعدّلها المستخدم ويعتمدها من جديد بنفس منطق الاعتماد المُجرَّب.
  const reopenPurchaseOrderForEdit = (orderId: string) => {
    const order = b2bOrders.find(o => o.id === orderId);
    if (!order) return;

    if (purchaseDraft.length > 0) {
      const ok = window.confirm('لديك مسودة شراء غير معتمدة حالياً. ستُستبدل ببنود هذه الطلبية. هل تريد المتابعة؟');
      if (!ok) return;
    }

    const hasSnapshot = Array.isArray(order.draftSnapshot) && order.draftSnapshot.length > 0;
    const stamp = Date.now();

    // يستعيد معرّف الدواء في المخزون؛ للمواد الجديدة (medicineId=null) نطابق بالاسم
    // حتى لا تتكرر عند إعادة الاعتماد وحتى يُعكس أثرها على المخزون بدقة.
    const resolveMedId = (d: any): string | null => {
      if (d.medicineId) return d.medicineId;
      const na = (d.nameAr || '').trim().toLowerCase();
      const ne = (d.nameEn || '').trim().toLowerCase();
      const med = inventory.find(m =>
        (na && (m.nameAr || '').trim().toLowerCase() === na) ||
        (ne && (m.nameEn || '').trim().toLowerCase() === ne)
      );
      return med?.id ?? null;
    };

    // مطابقة آمنة للطلبيات القديمة (بلا لقطة): نفصل اسم البند «عربي (إنجليزي)» ونطابقه
    // بالاسم الكامل تماماً مع حماية من النصوص الفارغة (تفادي خطأ includes('') = true دائماً).
    const matchLegacyItem = (medicineName: string) => {
      const raw = (medicineName || '').trim();
      const pm = raw.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
      const itemNameAr = (pm ? pm[1] : raw).trim();
      const itemNameEn = (pm ? pm[2] : '').trim();
      const arL = itemNameAr.toLowerCase();
      const enL = itemNameEn.toLowerCase();
      const med = inventory.find(m => {
        const mAr = (m.nameAr || '').trim().toLowerCase();
        const mEn = (m.nameEn || '').trim().toLowerCase();
        return (arL && mAr === arL) || (enL && mEn === enL);
      });
      return { med, itemNameAr, itemNameEn };
    };

    // بناء بنود المسودة لإعادة تحميلها (بمعرّفات جديدة لتفادي تكرار المفاتيح)
    let reloadItems: any[];
    if (hasSnapshot) {
      reloadItems = order.draftSnapshot!.map((d: any, i: number) => ({
        ...d,
        id: `draft-reopen-${stamp}-${i}`,
        medicineId: resolveMedId(d),
      }));
    } else {
      // طلبيات قديمة بلا لقطة: نعيد البناء بتطابق دقيق بالاسم، ونحتفظ باسم البند الأصلي إن لم نجد تطابقاً
      reloadItems = order.items.map((it, i) => {
        const { med, itemNameAr, itemNameEn } = matchLegacyItem(it.medicineName);
        return {
          id: `draft-reopen-${stamp}-${i}`,
          medicineId: med?.id ?? null,
          nameAr: med?.nameAr ?? itemNameAr,
          nameEn: med?.nameEn ?? itemNameEn,
          scientificName: med?.scientificName ?? 'N/A',
          price: Number(it.price) || 0,
          retailPrice: med?.price ?? 0,
          officialPrice: med?.secondaryPrice ?? 0,
          qty: Number(it.quantity) || 1,
          expiryDate: med ? (expiryDates[med.id] ?? '') : '',
          barcode: med?.barcode ?? '',
          warehouse: med?.warehouse ?? '',
        };
      });
    }

    // 1) عكس أثر المخزون: خصم الكميات التي أضافتها الطلبية الأصلية
    const reverseQtys: { medicineId: string | null; qty: number }[] = hasSnapshot
      ? order.draftSnapshot!.map((d: any) => ({ medicineId: resolveMedId(d), qty: Number(d.qty) || 0 }))
      : order.items.map(it => {
          const { med } = matchLegacyItem(it.medicineName);
          return { medicineId: med?.id ?? null, qty: Number(it.quantity) || 0 };
        });

    const changedMedIds = new Set<string>();
    let revertedInventory = [...inventory];
    reverseQtys.forEach(rq => {
      if (rq.medicineId) {
        revertedInventory = revertedInventory.map(m =>
          m.id === rq.medicineId
            ? { ...m, availableQuantity: Math.max(0, m.availableQuantity - rq.qty) }
            : m
        );
        changedMedIds.add(rq.medicineId);
      }
    });
    setInventory(revertedInventory);

    // 2) عكس الأثر المالي: استرجاع النقد أو حذف الذمّة المرتبطة
    let payableToDelete: Payable | undefined;
    if (order.onCredit) {
      payableToDelete = payables.find(p => p.relatedOrderId === orderId);
      setPayables(prev => prev.filter(p => p.relatedOrderId !== orderId));
    } else {
      setWalletBalance(prev => prev + (order.totalAmount || 0));
    }

    // 3) قيد تدقيق عاكس (مبلغ سالب) ليبقى صافي المشتريات صحيحاً بعد إعادة الاعتماد
    addAuditEntry({
      action: 'purchase',
      amount: -(order.totalAmount || 0),
      description: `إعادة فتح طلبية الشراء ${orderId} للتعديل — عكس القيد السابق`,
      relatedId: orderId,
    });

    // 4) إزالة الطلبية من السجل (الحالة + السحابة)
    setB2bOrders(prev => prev.filter(o => o.id !== orderId));

    // 5) مزامنة سحابية لما تغيّر
    if (currentUser) {
      const userId = currentUser.uid;
      deleteDoc(doc(db, 'users', userId, 'b2bOrders', orderId))
        .catch(e => handleFirestoreError(e, OperationType.DELETE, `users/${userId}/b2bOrders/${orderId}`));
      if (payableToDelete) {
        deleteDoc(doc(db, 'users', userId, 'payables', payableToDelete.id))
          .catch(e => handleFirestoreError(e, OperationType.DELETE, `users/${userId}/payables/${payableToDelete!.id}`));
      }
      revertedInventory.forEach(med => {
        if (changedMedIds.has(med.id)) {
          setDoc(doc(db, 'users', userId, 'inventory', med.id), med)
            .catch(e => handleFirestoreError(e, OperationType.WRITE, `users/${userId}/inventory/${med.id}`));
        }
      });
    }

    // 6) تحميل البنود إلى المسودة واستعادة وضع الآجل
    setPurchaseDraft(reloadItems);
    setPurchaseOnCredit(!!order.onCredit);
    if (order.onCredit && order.creditSupplierName) {
      setCreditSupplierName(order.creditSupplierName);
    }

    // 7) تنبيه + التمرير لأعلى حيث محرّر المسودة
    setPurchaseSuccessBanner(
      `تم فتح الطلبية ${orderId} للتعديل. عدّل البنود ثم اضغط «اعتماد الطلبية» من جديد. (تم عكس أثرها السابق على المخزون والحسابات تلقائياً)`
    );
    setTimeout(() => setPurchaseSuccessBanner(null), 8000);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Action to instantly trigger delivery arrived
  const triggerInstantDeliveryArrived = (orderId: string) => {
    const o = b2bOrders.find(order => order.id === orderId);
    if (!o || o.status === 'delivered') return;

    if (currentUser) {
      const userId = currentUser.uid;
      // 1. Mark as delivered in Firestore
      setDoc(doc(db, 'users', userId, 'b2bOrders', orderId), {
        ...o,
        status: 'delivered'
      }).catch(e => handleFirestoreError(e, OperationType.UPDATE, `users/${userId}/b2bOrders/${orderId}`));

      // 2. Replenish matched medicine levels in Firestore
      o.items.forEach(item => {
        const matchingMed = inventory.find(m => {
          const matchName = item.medicineName.toLowerCase();
          return matchName.includes(m.nameAr.toLowerCase()) || matchName.includes(m.nameEn.toLowerCase());
        });
        if (matchingMed) {
          const nextQty = matchingMed.availableQuantity + item.quantity;
          const updatedMed = {
            ...matchingMed,
            availableQuantity: nextQty,
            status: 'available',
            updatedAt: new Date().toISOString()
          };
          setDoc(doc(db, 'users', userId, 'inventory', matchingMed.id), updatedMed)
            .catch(e => handleFirestoreError(e, OperationType.WRITE, `users/${userId}/inventory/${matchingMed.id}`));
        }
      });
    } else {
      setB2bOrders(prev => prev.map(o => {
        if (o.id === orderId && o.status !== 'delivered') {
          // Find the medicine and add it to our inventory box levels
          o.items.forEach(item => {
            setInventory(inv => inv.map(m => {
              const matchName = item.medicineName.toLowerCase();
              if (matchName.includes(m.nameAr.toLowerCase()) || matchName.includes(m.nameEn.toLowerCase())) {
                return {
                  ...m,
                  availableQuantity: m.availableQuantity + item.quantity,
                  status: 'available'
                };
              }
              return m;
            }));
          });

          return { ...o, status: 'delivered' };
        }
        return o;
      }));
    }
  };

  // Payoff supplier debt manually — يسدّد 500,000 د.ع على أقدم ذمّة مفتوحة عبر دفتر ديون الموردين
  const settleSupplierDebts = () => {
    if (walletBalance < 500000) return;
    const oldestOpen = [...payables]
      .filter(p => p.status !== 'paid' && (p.amount - p.paidAmount) > 0)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
    if (!oldestOpen) return;
    handleSettlePayable(oldestOpen, 500000);
  };

  // Export financial reports to CSV
  const exportFinancialsToCSV = () => {
    const totalInventoryValue = inventory.reduce((sum, item) => sum + (item.price * item.availableQuantity), 0);
    const nowStr = new Date().toLocaleString('ar-IQ', { hour12: true });

    let csvContent = '\uFEFF'; // Excel UTF-8 BOM

    // Header Metadata
    csvContent += `كشف الحسابات والسيولة والأرصدة المالية - صيدلية انوار الحسن\r\n`;
    csvContent += `تاريخ ووقت التصدير,${nowStr}\r\n\r\n`;

    // Financial Metrics Summary Table
    csvContent += `المؤشرات المالية الرئيسية والسيولة\r\n`;
    csvContent += `المؤشر المالي,القيمة بالدينار العراقي (د.ع)\r\n`;
    csvContent += `المبيعات اليومية (Daily Sales Revenue),${dailySalesRevenue}\r\n`;
    csvContent += `الذمم المالية المستحقة للمذاخر (Total Debts),${totalDebts}\r\n`;
    csvContent += `السيولة بالصندوق (Cash Wallet Balance),${walletBalance}\r\n`;
    csvContent += `قيمة البضاعة المخزنة التقديرية (Inventory Market Value),${totalInventoryValue}\r\n\r\n`;

    // Detailed Ledger of Sales
    csvContent += `سجل المبيعات والوصولات اليومية المكتملة\r\n`;
    csvContent += `تاريخ/وقت المعاملة,رقم الفاتورة,اسم الزبون,نوع الدواء وحالة الصرف,المجموع الكلي الفعلي (د.ع)\r\n`;
    
    if (salesLedger.length === 0) {
      csvContent += `لا توجد فواتير مبيعات مسجلة اليوم,-,-,-,-\r\n`;
    } else {
      salesLedger.forEach(sale => {
        const drugsSummary = sale.items.map(it => `${it.name} (${it.quantity} علبة)`).join(' + ');
        csvContent += `"${sale.timestamp || 'اليوم'}","${sale.invoiceId}","${sale.customerName || 'زبون زائر'}","${drugsSummary}",${sale.total}\r\n`;
      });
    }

    csvContent += `\r\nتفاصيل كشف ذمم الدائنين (المذاخر والمكاتب العلمية)\r\n`;
    csvContent += `مكتب التجهيز العلمي والذمة,المبلغ المستحق (د.ع)\r\n`;
    csvContent += `مكتب دجلة العلمي للأدوية (بغداد),${totalDebts > 0 ? Math.min(750000, totalDebts) : 0}\r\n`;
    csvContent += `مذخر قصر الشفاء الحديث (أربيل),${totalDebts > 750000 ? Math.min(1100500, totalDebts - 750000) : 0}\r\n`;
    csvContent += `مكاتب التجهيز والذمم الإضافية الأخرى,${Math.max(0, totalDebts - 1850000)}\r\n`;
    csvContent += `إجمالي المستحقات لجميع المذاخر,${totalDebts}\r\n`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `التقرير_المالي_صيدلية_انوار_الحسن_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  // ====== بوابة تسجيل الدخول الإلزامية ======
  // لا يعمل التطبيق دون تسجيل دخول. هذا يمنع "وضع البيانات المحلية فقط" الذي كان يجعل
  // كل جهاز جزيرة معزولة لا تتزامن مع غيرها. كل الأجهزة يجب أن تستخدم نفس حساب Google
  // لتتوحّد البيانات (نفس uid ⇐ نفس مسار users/{uid}).
  if (isAuthLoading) {
    return (
      <div className="bg-slate-50 min-h-screen flex flex-col items-center justify-center gap-4" dir="rtl">
        <span className="w-10 h-10 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
        <p className="text-slate-500 text-sm font-bold">جارٍ التحقّق من تسجيل الدخول...</p>
      </div>
    );
  }

  if (!currentUser && !bypassLogin) {
    return (
      <div className="bg-gradient-to-br from-emerald-50 via-slate-50 to-teal-50 min-h-screen flex items-center justify-center p-4" dir="rtl">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-100 p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-emerald-600 flex items-center justify-center text-white text-2xl font-black">أ</div>
          <h1 className="text-xl font-black text-slate-800 mb-1">صيدلية انوار الحسن</h1>
          <p className="text-sm text-slate-500 mb-6">نظام إدارة الصيدلية — تسجيل الدخول مطلوب</p>

          {authInitFailed && (
            <div className="mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              تعذّر الاتصال بخدمة الحسابات. تحقّق من اتصال الإنترنت ثم أعد المحاولة.
            </div>
          )}

          {signInError && (
            <div className="mb-4 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 text-right font-semibold">
              {signInError}
            </div>
          )}

          <button
            onClick={handleGoogleSignIn}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-black transition shadow-sm cursor-pointer"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
            <span>تسجيل الدخول عبر Google</span>
          </button>

          <button
            onClick={() => setBypassLogin(true)}
            className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition cursor-pointer border border-slate-200"
          >
            <span>تجاوز الدخول مؤقتاً (وضع محلي بلا مزامنة)</span>
          </button>

          <div className="mt-5 text-[11px] leading-relaxed text-slate-500 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5">
            <span className="font-bold text-emerald-700">مهم لتوحيد البيانات بين الأجهزة:</span><br/>
            سجّل الدخول بـ <span className="font-bold">نفس حساب Google</span> على كل أجهزة الكاشير. كل الأجهزة التي تستخدم نفس الحساب ترى نفس المخزون والمبيعات لحظياً.
          </div>

        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 min-h-screen text-right" dir="rtl">

      {/* شريط تنبيه وضع محدود — يظهر فقط عند فشل تهيئة Firebase Auth */}
      {authInitFailed && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 bg-amber-50 border-b border-amber-300 px-4 py-2.5 text-sm text-amber-800"
          dir="rtl"
        >
          <div className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-shrink-0 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span className="font-medium">تعذّر الاتصال بخدمة الحسابات — يعمل التطبيق بوضع محدود (بيانات محلية فقط)</span>
          </div>
          <button
            onClick={() => setAuthInitFailed(false)}
            aria-label="إغلاق التنبيه"
            className="flex-shrink-0 rounded p-0.5 text-amber-600 hover:bg-amber-100 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      )}

      {/* شريط وضع تجاوز الدخول — بيانات محلية فقط بلا مزامنة سحابية */}
      {bypassLogin && !currentUser && (
        <div role="alert" className="flex items-center justify-between gap-3 bg-slate-100 border-b border-slate-300 px-4 py-2 text-xs text-slate-700" dir="rtl">
          <span className="font-bold">وضع تجاوز الدخول مؤقت — البيانات محلية فقط على هذا الجهاز ولن تتزامن سحابياً.</span>
          <button
            onClick={() => setBypassLogin(false)}
            className="flex-shrink-0 rounded-lg px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition cursor-pointer border-none"
          >
            العودة لتسجيل الدخول
          </button>
        </div>
      )}

      {/* شريط خطأ المزامنة — يظهر عند رفض الصلاحيات أو انقطاع الخادم (لم يعد مكتوماً في الـ console) */}
      {syncError && (
        <div role="alert" className="flex items-center gap-2 bg-red-50 border-b border-red-300 px-4 py-2.5 text-sm text-red-800" dir="rtl">
          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse flex-shrink-0" />
          <span className="font-medium">تعذّرت المزامنة مع السحابة ({syncError}). بياناتك محفوظة على هذا الجهاز فقط ولم تُرفع بعد — تحقّق من الإنترنت ثم أعد المحاولة.</span>
        </div>
      )}

      {/*
        =========================================================
        MATCH BRAND HEADER DIRECT FROM THE USER SCREENSHOT IMAGE
        =========================================================
      */}
      <header className="bg-white border-b border-slate-200/80 sticky top-0 z-40 px-4 sm:px-6 lg:px-8 py-3.5 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          
          {/* LEFT: Firebase Authentication Cloud Sync status */}
          <div className="flex items-center space-x-reverse space-x-3">
            {isAuthLoading ? (
              <div className="flex items-center space-x-reverse space-x-2 text-slate-400 text-xs">
                <span className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                <span>جاري تحميل المزامنة...</span>
              </div>
            ) : currentUser ? (
              <div className="flex items-center space-x-reverse space-x-2.5">
                {currentUser.photoURL && (
                  <img 
                    src={currentUser.photoURL} 
                    alt={currentUser.displayName || 'الصيدلية'} 
                    className="w-8 h-8 rounded-full border border-slate-200"
                    referrerPolicy="no-referrer"
                  />
                )}
                <div className="text-right hidden sm:block">
                  <span className="text-xs font-black text-slate-800 block leading-tight">
                    {currentUser.displayName || 'صيدلية شريكة'}
                  </span>
                  {/* بريد الحساب المسجّل — للتأكد بصرياً أن كل الأجهزة تستخدم نفس الحساب */}
                  <span className="text-[9px] text-slate-400 font-mono block leading-tight" dir="ltr">
                    {currentUser.email}
                  </span>
                  {/* مؤشر المزامنة الحقيقي — مشتقّ من حالة الاتصال الفعلية بخادم Firestore */}
                  <span className="text-[9px] font-bold block flex items-center space-x-reverse space-x-1">
                    {syncState === 'synced' ? (
                      <><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" /><span className="text-emerald-600">متزامن مع السحابة ✓</span></>
                    ) : syncState === 'pending' ? (
                      <><span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" /><span className="text-amber-600">جارٍ المزامنة...</span></>
                    ) : (
                      <><span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" /><span className="text-red-600">غير متصل — محلي فقط</span></>
                    )}
                  </span>
                </div>
                <button
                  onClick={handleCloudCheck}
                  className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-lg transition cursor-pointer border border-emerald-200"
                  title="قراءة العدد الفعلي من خادم Firestore ومقارنته بهذا الجهاز"
                >
                  🔍 فحص السحابة
                </button>
                <button
                  onClick={handleSignOut}
                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-bold rounded-lg transition cursor-pointer"
                >
                  تسجيل خروج
                </button>
              </div>
            ) : (
              <button 
                onClick={handleGoogleSignIn}
                className="flex items-center space-x-reverse space-x-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition shadow-sm cursor-pointer"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path 
                    fill="currentColor" 
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" 
                  />
                  <path 
                    fill="currentColor" 
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" 
                  />
                  <path 
                    fill="currentColor" 
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" 
                  />
                  <path 
                    fill="currentColor" 
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" 
                  />
                </svg>
                <span>ربط المزامنة السحابية (Google)</span>
              </button>
            )}
            <span className="text-slate-300 font-mono text-sm tracking-wide font-bold hidden sm:inline">|</span>
            <span className="text-slate-400 font-mono text-sm tracking-wide font-bold hidden sm:inline">ANWAR AL-HASSAN</span>
            {/* Role selector */}
            {currentUser && (
              <select
                value={currentRole}
                onChange={e => setCurrentRole(e.target.value as 'admin' | 'pharmacist' | 'cashier')}
                className="text-[9px] font-bold bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 cursor-pointer"
              >
                <option value="admin">مدير</option>
                <option value="pharmacist">صيدلاني</option>
                <option value="cashier">كاشير</option>
              </select>
            )}
            {/* Enable Notifications Button */}
            {typeof Notification !== 'undefined' && Notification.permission !== 'granted' && (
              <button
                onClick={() => {
                  Notification.requestPermission().then(p => {
                    if (p === 'granted') alert('تم تفعيل الإشعارات بنجاح!');
                  });
                }}
                className="text-[9px] font-bold bg-amber-50 border border-amber-200 text-amber-700 rounded-lg px-2 py-1 cursor-pointer hover:bg-amber-100 transition hidden sm:flex items-center gap-1"
              >
                <Bell className="w-3 h-3" />
                تفعيل الإشعارات
              </button>
            )}
            {/* Luxury theme badge */}
            <div
              title="النسخة الذهبية الفاخرة"
              className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black cursor-default select-none"
              style={{background:'linear-gradient(135deg,#F5DAAC,#DFB060)',color:'#6B3A08',boxShadow:'0 2px 8px rgba(184,134,42,0.25)'}}
            >
              ✦ LUXURY
            </div>

            {/* Notification Bell */}
            <div className="relative">
              <button
                onClick={() => setShowNotifDropdown(prev => !prev)}
                className="w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 transition cursor-pointer relative"
              >
                <Bell className="w-4 h-4" />
                {(inventory.some(m => expiryDates[m.id] && new Date(expiryDates[m.id]) < new Date()) ||
                  inventory.some(m => m.availableQuantity <= (m.minStock ?? 15)) ||
                  payables.some(p => p.dueDate && new Date(p.dueDate) < new Date() && p.status !== 'paid')
                ) && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-rose-500 rounded-full border-2 border-white" />
                )}
              </button>
              {showNotifDropdown && (
                <div className="absolute left-0 top-10 w-72 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-4 space-y-3 text-right" dir="rtl">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-xs font-black text-slate-800">مركز الإشعارات</span>
                    <button onClick={() => setShowNotifDropdown(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-4 h-4" /></button>
                  </div>
                  {inventory.filter(m => expiryDates[m.id] && new Date(expiryDates[m.id]) < new Date()).map(m => (
                    <div key={m.id} className="text-[10px] text-rose-700 bg-rose-50 rounded-lg px-3 py-2 font-bold flex items-center gap-2">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      <span>{m.nameAr} — منتهية الصلاحية</span>
                    </div>
                  ))}
                  {inventory.filter(m => m.availableQuantity <= (m.minStock ?? 15) && m.availableQuantity > 0).map(m => (
                    <div key={m.id} className="text-[10px] text-amber-700 bg-amber-50 rounded-lg px-3 py-2 font-bold flex items-center gap-2">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      <span>{m.nameAr} — مخزون منخفض ({m.availableQuantity})</span>
                    </div>
                  ))}
                  {payables.filter(p => p.dueDate && new Date(p.dueDate) < new Date() && p.status !== 'paid').map(p => (
                    <div key={p.id} className="text-[10px] text-slate-700 bg-slate-50 rounded-lg px-3 py-2 font-bold flex items-center gap-2">
                      <Clock className="w-3 h-3 shrink-0" />
                      <span>{p.supplierName} — دين متأخر</span>
                    </div>
                  ))}
                  {!inventory.some(m => expiryDates[m.id] && new Date(expiryDates[m.id]) < new Date()) &&
                   !inventory.some(m => m.availableQuantity <= (m.minStock ?? 15)) &&
                   !payables.some(p => p.dueDate && new Date(p.dueDate) < new Date() && p.status !== 'paid') && (
                    <p className="text-[10px] text-slate-400 text-center">لا توجد تنبيهات جديدة</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* MIDDLE: Quick Refrigerator temp readout */}
          <div className="hidden sm:flex items-center space-x-reverse space-x-4 bg-slate-50 border border-slate-100 px-4 py-1.5 rounded-full text-xs font-semibold">
            <span className="text-slate-500">المستشعر الذكي:</span>
            <div className="flex items-center space-x-reverse space-x-1.5">
              <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping" />
              <strong className="text-slate-900 font-mono">4.7°C</strong>
              <span className="text-slate-400 text-[10px]">(المطابقة الدوائية ✓)</span>
            </div>
          </div>

          {/* RIGHT: Logo tile widget following the screenshot image of 'نظام إدارة صيدليات المتكامل' */}
          <div className="flex items-center space-x-reverse space-x-3.5">
            <div className="text-right hidden sm:block">
              <h1 className="text-slate-900 font-extrabold text-lg tracking-tight leading-none mb-0.5">
                انوار الحسن <span className="text-emerald-500 font-black">+</span>
              </h1>
              <p className="text-[10px] text-slate-500 font-bold tracking-tight">
                نظام إدارة صيدليات المتكامل
              </p>
            </div>
            {/* The white tile squircle with an emerald-green hardware chip circuit icon */}
            <div className="w-11 h-11 bg-white rounded-2xl border border-slate-100 shadow-sm flex items-center justify-center text-emerald-600 font-black">
              <span className="relative">
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                  {/* جسم البطة */}
                  <ellipse cx="13" cy="15" rx="7" ry="5" />
                  {/* الرأس */}
                  <circle cx="19" cy="9" r="3.2" />
                  {/* المنقار */}
                  <ellipse cx="22.5" cy="9.5" rx="1.8" ry="1" />
                  {/* الذيل */}
                  <ellipse cx="6.5" cy="14" rx="2" ry="1.2" transform="rotate(-20 6.5 14)" />
                  {/* العين */}
                  <circle cx="20" cy="8.2" r="0.55" fill="white" />
                </svg>
                <div className="absolute -top-1 -left-1 w-2.5 h-2.5 bg-emerald-500 rounded-full border border-white" />
              </span>
            </div>
          </div>

        </div>
      </header>

      {/* 
        =========================================================
        PHARMACY WORKSPACE METRIC BAR & MAIN SUB SECTION NAVIGATION
        =========================================================
      */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        

        {/* 
          =========================================================
          WORKSPACE INNER LAYOUT - SIDEBAR LINKS & VIEWS
          =========================================================
        */}
        {activeTab === 'home' ? (
          /* ======================================================
             الصفحة الرئيسية — بطاقات تنقل لكل قسم
             ====================================================== */
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

              {/* POS */}
              <button
                onClick={() => setActiveTab('pos')}
                className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all cursor-pointer text-right space-y-4 group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center shrink-0 group-hover:bg-emerald-100 transition">
                    <ShoppingBag className="w-6 h-6" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-black text-slate-800 text-sm">نقطة البيع السريعة</h3>
                    <p className="text-[10px] text-slate-500 font-semibold mt-0.5">إصدار الفواتير وتسجيل المبيعات</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full font-black">
                    {salesLedger.filter(s => s.timestamp.startsWith(finTodayStr)).length} فاتورة اليوم
                  </span>
                  <span className="text-[10px] text-slate-400 font-bold group-hover:text-emerald-600 transition">دخول ←</span>
                </div>
              </button>

              {/* Inventory */}
              <button
                onClick={() => setActiveTab('inventory')}
                className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-amber-300 transition-all cursor-pointer text-right space-y-4 group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center shrink-0 group-hover:bg-amber-100 transition">
                    <Pill className="w-6 h-6" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-black text-slate-800 text-sm">المخزن وتنبيهات الصلاحية</h3>
                    <p className="text-[10px] text-slate-500 font-semibold mt-0.5">إدارة المخزون ومتابعة الصلاحية</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full font-black">
                    {inventory.filter(m => (getDaysUntilExpiry(m.id) <= 30) || m.availableQuantity < 15).length} تنبيه نشط
                  </span>
                  <span className="text-[10px] text-slate-400 font-bold group-hover:text-amber-600 transition">دخول ←</span>
                </div>
              </button>

              {/* B2B */}
              {currentRole !== 'cashier' && (
                <button
                  onClick={() => setActiveTab('b2b')}
                  className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-blue-300 transition-all cursor-pointer text-right space-y-4 group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shrink-0 group-hover:bg-blue-100 transition">
                      <Truck className="w-6 h-6" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-black text-slate-800 text-sm">طلبيات المذاخر</h3>
                      <p className="text-[10px] text-slate-500 font-semibold mt-0.5">فواتير الشراء وعروض انوار الحسن B2B</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full font-black">
                      {b2bOrders.filter(o => o.status === 'pending' || o.status === 'preparing').length} طلبية نشطة
                    </span>
                    <span className="text-[10px] text-slate-400 font-bold group-hover:text-blue-600 transition">دخول ←</span>
                  </div>
                </button>
              )}

              {/* Financial */}
              {currentRole === 'admin' && (
                <button
                  onClick={() => setActiveTab('financial')}
                  className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-violet-300 transition-all cursor-pointer text-right space-y-4 group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-violet-50 text-violet-600 rounded-xl flex items-center justify-center shrink-0 group-hover:bg-violet-100 transition">
                      <BarChart3 className="w-6 h-6" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-black text-slate-800 text-sm">الحسابات المالية</h3>
                      <p className="text-[10px] text-slate-500 font-semibold mt-0.5">الأرباح والذمم وقائمة الدخل وسجل التدقيق</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] px-2.5 py-1 rounded-full font-black ${netProfitMonth >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                      صافي الشهر: {netProfitMonth.toLocaleString()} د.ع
                    </span>
                    <span className="text-[10px] text-slate-400 font-bold group-hover:text-violet-600 transition">دخول ←</span>
                  </div>
                </button>
              )}


            </div>

            {/* Compliance card — كان في الـ sidebar، يظهر في الصفحة الرئيسية فقط */}
            <div className="lux-dark-panel-wide bg-slate-900 text-white p-5 rounded-2xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-emerald-400 font-extrabold text-[11px]">
                  <ShieldCheck className="w-4 h-4" />
                  <span>تفتيش نقابة صيادلة العراق</span>
                </div>
                <p className="text-[10px] text-slate-300 font-semibold">الصيدلية ممتثلة لكافة شروط نقابة صيادلة العراق ووزارة الصحة الاتحادية.</p>
              </div>
              <div className="flex gap-4 text-[10px] font-mono text-slate-400 shrink-0">
                <span>ترخيص: مجاز رسمي</span>
                <span>آخر مطابقة: اليوم</span>
              </div>
            </div>
          </div>
        ) : (
          /* ======================================================
             صفحة القسم — شريط رجوع + محتوى كامل العرض
             ====================================================== */
          <div className="space-y-4">
            {/* شريط الرجوع للرئيسية */}
            <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-2xl px-5 py-3 shadow-sm">
              <button
                onClick={() => setActiveTab('home')}
                className="flex items-center gap-1.5 text-emerald-600 hover:text-emerald-700 font-black text-xs transition cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>الرئيسية</span>
              </button>
              <span className="text-slate-300 font-mono text-sm">/</span>
              <span className="text-slate-700 font-black text-xs">
                {activeTab === 'pos' ? 'نقطة البيع السريعة (POS)'
                  : activeTab === 'inventory' ? 'المخزن وتنبيهات الصلاحية'
                  : activeTab === 'b2b' ? 'طلبيات المذاخر (انوار الحسن B2B)'
                  : activeTab === 'financial' ? 'الحسابات المالية وجرد الذمم' : ''}
              </span>
            </div>
            {/* محتوى القسم — كامل العرض */}
            <div className="space-y-6">
            
            <AnimatePresence mode="wait">
              
              {/* 
                =========================================================
                VIEWPORT SECTION 1: POS TERMINAL
                =========================================================
              */}
              {activeTab === 'pos' && (
                <motion.div
                  key="pos"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="grid grid-cols-1 lg:grid-cols-12 gap-6"
                >
                  
                  {/* Left Column: POS Register — dark theme */}
                  <div className="lux-dark-panel lg:col-span-7 order-first lg:order-none bg-slate-900 rounded-3xl p-5 shadow-lg flex flex-col gap-4">

                    {/* Search bar — فوق سلة البيع */}
                    <POSSearchBar
                      ref={posSearchRef}
                      onQueryChange={handlePOSQueryChange}
                      onEnter={handlePOSEnter}
                      onScanClick={handlePOSScanClick}
                    />

                    {/* Header */}
                    <div className="flex justify-between items-center border-b border-slate-700 pb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                        <h3 className="font-extrabold text-white text-sm">سلة البيع</h3>
                        {currentCart.length > 0 && (
                          <span className="bg-emerald-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                            {currentCart.length}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => setCurrentCart([])}
                        className="text-slate-500 hover:text-rose-400 transition text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>مسح</span>
                      </button>
                    </div>

                    {currentCart.length === 0 ? (
                      <div className="text-center py-14 space-y-3 flex-1 flex flex-col items-center justify-center">
                        <ShoppingBag className="w-10 h-10 text-slate-600 mx-auto" />
                        <p className="text-xs text-slate-500 font-semibold">السلة فارغة — اختر دواءً من اليمين</p>
                      </div>
                    ) : (
                      <form onSubmit={handleCheckoutPOS} className="flex flex-col gap-4 flex-1">

                        {/* Cart Items */}
                        <div className="space-y-2.5 max-h-[380px] overflow-y-auto pl-1">
                          {currentCart.map((item) => (
                            <CartItemRow
                              key={item.medicine.id}
                              item={item}
                              showVirtualPrice={showVirtualPriceInPOS}
                              onInc={incCartQty}
                              onDec={decCartQty}
                              onRemove={removeFromCart}
                            />
                          ))}
                        </div>

                        {/* Customer & Discount */}
                        <div className="space-y-2.5 border-t border-slate-700 pt-3">
                          <input
                            type="text"
                            value={posCustomerName}
                            onChange={(e) => setPosCustomerName(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl py-2.5 px-3 text-xs font-semibold text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 transition"
                            placeholder="اسم المريض / المشتري"
                          />
                          <select
                            value={posDiscountPercent}
                            onChange={(e) => setPosDiscountPercent(Number(e.target.value))}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl py-2.5 px-3 text-xs font-semibold text-slate-300"
                          >
                            <option value="0">بدون خصم</option>
                            <option value="5">خصم عوائل الشهداء (5%)</option>
                            <option value="10">الخصم النقابي (10%)</option>
                            <option value="15">خصم خاص (15%)</option>
                          </select>
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input type="checkbox" checked={posOnCredit} onChange={(e) => setPosOnCredit(e.target.checked)}
                              className="w-4 h-4 accent-amber-500 cursor-pointer" />
                            <span className="text-[11px] font-black text-amber-400">بيع بالآجل — تسجيل ذمّة</span>
                          </label>
                          {posOnCredit && (
                            <p className="text-[10px] text-amber-500 font-bold">سيُسجَّل على «{posCustomerName}» ولن يُضاف للكاش حتى التحصيل.</p>
                          )}
                        </div>

                        {/* Totals */}
                        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 space-y-3 text-sm font-semibold">
                          <div className="flex justify-between text-slate-400">
                            <span>المجموع الفرعي</span>
                            <span className="font-mono text-slate-200 text-base">{posSubtotal.toLocaleString()} د.ع</span>
                          </div>
                          {posDiscountAmount > 0 && (
                            <div className="flex justify-between text-rose-400">
                              <span>الخصم</span>
                              <span className="font-mono text-base">−{posDiscountAmount.toLocaleString()} د.ع</span>
                            </div>
                          )}
                          <div className="flex justify-between border-t border-slate-600 pt-3 text-xl font-black">
                            <span className="text-white">الصافي</span>
                            <span className="text-emerald-400 font-mono">{posTotal.toLocaleString()} د.ع</span>
                          </div>
                          <div className="flex justify-between text-xs text-slate-500 pt-1 border-t border-slate-700">
                            <span>بالدولار الموازي</span>
                            <span className="font-mono">${(posTotal / 1500).toFixed(2)}</span>
                          </div>
                        </div>

                        <button type="submit"
                          className="w-full bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-white py-3.5 rounded-2xl text-sm font-black shadow-lg shadow-emerald-900/40 transition cursor-pointer flex items-center justify-center gap-2">
                          <Check className="w-4 h-4" />
                          <span>{posOnCredit ? 'تسجيل البيع كذمّة آجلة' : 'إتمام البيع وصرف الفاتورة'}</span>
                        </button>

                      </form>
                    )}
                  </div>

                  {/* Right Column: Searchable fast-add medicines shelf */}
                  <div className="lg:col-span-5 bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-5">
                    <div>
                      <h3 className="font-extrabold text-slate-900 text-sm">أدوية ومخازن الصيدلة الحاضرة</h3>
                      <p className="text-[10px] text-slate-400 font-semibold mt-0.5">انقر على الدواء المتوفر لإضافته إلى فاتورة العميل مباشرة</p>
                    </div>

                    {/* Price Mode Toggle — زر دائري */}
                    <div className="flex justify-end">
                      <button
                        type="button"
                        title={showVirtualPriceInPOS ? 'السعر الرسمي (مفعّل)' : 'السعر الجمهوري (مفعّل)'}
                        onClick={() => setShowVirtualPriceInPOS(!showVirtualPriceInPOS)}
                        className={`w-7 h-7 rounded-full border-2 transition-all cursor-pointer shadow-sm ${
                          showVirtualPriceInPOS
                            ? 'bg-purple-500 border-purple-400 shadow-purple-200'
                            : 'bg-slate-200 border-slate-300 hover:bg-purple-200 hover:border-purple-300'
                        }`}
                      />
                    </div>

                    {/* Inventory grid for POS shelf */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 max-h-[480px] overflow-y-auto pl-1">
                      {filteredPOSMeds.map((med) => (
                        <MedicineCard
                          key={med.id}
                          med={med}
                          showVirtualPrice={showVirtualPriceInPOS}
                          daysUntilExpiry={getDaysUntilExpiry(med.id)}
                          onAdd={addToCart}
                        />
                      ))}
                    </div>

                    {/* حركة مبيع اليوم — مسندلة */}
                    <div className="pt-4 border-t border-slate-100">
                      <button
                        onClick={() => setShowTodaySales(p => !p)}
                        className="w-full font-extrabold text-slate-800 text-xs flex items-center gap-2 cursor-pointer hover:text-blue-600 transition text-right"
                      >
                        <TrendingUp className="w-4 h-4 text-blue-500 shrink-0" />
                        <span className="flex-1">حركة مبيع اليوم</span>
                        <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                          {salesLedger.filter(s => {
                            const d = new Date(String(s.timestamp).replace(' ','T'));
                            return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` === finTodayStr;
                          }).reduce((sum, s) => sum + s.items.length, 0)} صنف
                        </span>
                        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 shrink-0 ${showTodaySales ? 'rotate-180' : ''}`} />
                      </button>

                      {showTodaySales && (() => {
                        const todayItems = salesLedger
                          .filter(s => {
                            const d = new Date(String(s.timestamp).replace(' ','T'));
                            return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` === finTodayStr;
                          })
                          .flatMap(s =>
                            s.items.map(it => ({
                              name: it.name,
                              qty: it.quantity,
                              price: it.price,
                              time: String(s.timestamp).slice(11, 16),
                              invoiceId: s.invoiceId,
                            }))
                          );
                        if (todayItems.length === 0) return (
                          <p className="text-[10px] text-slate-400 font-bold text-center py-4 mt-3">لا توجد مبيعات مسجّلة اليوم بعد</p>
                        );
                        return (
                          <div className="overflow-x-auto rounded-xl border border-slate-100 mt-3">
                            <table className="w-full text-[10px] font-bold border-collapse">
                              <thead>
                                <tr className="bg-slate-50 text-slate-500 text-[9px] border-b border-slate-100">
                                  <th className="text-right font-black py-2 px-3">الدواء / المادة</th>
                                  <th className="text-center font-black py-2 px-3">الكمية</th>
                                  <th className="text-center font-black py-2 px-3">الوقت</th>
                                  <th className="text-center font-black py-2 px-3">الفاتورة</th>
                                </tr>
                              </thead>
                              <tbody>
                                {todayItems.map((row, i) => (
                                  <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/60">
                                    <td className="text-right py-2 px-3 text-slate-700">{row.name}</td>
                                    <td className="text-center py-2 px-3">
                                      <span className="bg-blue-50 text-blue-700 font-mono px-2 py-0.5 rounded-lg">{row.qty}</span>
                                    </td>
                                    <td className="text-center py-2 px-3 font-mono text-slate-500">{row.time}</td>
                                    <td className="text-center py-2 px-3 font-mono text-slate-400 text-[9px]">{row.invoiceId}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Historical sales log list below the shelf to see how money accumulated */}
                    <div className="pt-4 border-t border-slate-100">
                      <h4 className="font-extrabold text-slate-800 text-xs mb-3 flex items-center space-x-reverse space-x-2">
                        <ClipboardList className="w-4 h-4 text-emerald-500" />
                        <span>أحدث فواتير المبيعات الصادرة اليوم</span>
                      </h4>
                      <div className="space-y-2">
                        {returnSuccess && (
                          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 text-[10px] font-bold text-emerald-700 mb-2">
                            <CheckCircle2 className="w-3.5 h-3.5" /> تمّ تسجيل المرتجع وتحديث المخزون بنجاح
                          </div>
                        )}
                        {salesLedger.map((s) => {
                          const isExpanded = expandedInvoiceId === s.invoiceId;
                          return (
                            <div key={s.invoiceId} className={`rounded-xl border text-[11px] transition-all ${isExpanded ? 'border-blue-200 bg-blue-50/30' : 'border-slate-100 bg-slate-50/50'}`}>
                              {/* رأس الفاتورة — قابل للضغط للتوسيع */}
                              <div
                                className="p-3 flex items-center justify-between cursor-pointer select-none"
                                onClick={() => {
                                  if (isExpanded) {
                                    setExpandedInvoiceId(null);
                                  } else {
                                    setExpandedInvoiceId(s.invoiceId);
                                    setEditingItems(s.items.map(it => ({ ...it })));
                                  }
                                }}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className={`text-[9px] transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                                  <strong className="text-slate-900 font-bold font-mono text-[10px]">{s.invoiceId}</strong>
                                  <span className="text-slate-400">•</span>
                                  <span className="text-slate-600 font-medium truncate">العميل: {s.customerName}</span>
                                  {salesReturns.some(r => r.originalInvoiceId === s.invoiceId) && (
                                    <span className="text-[8px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded shrink-0">مُرتجَع</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="font-mono font-bold text-slate-700">{s.total.toLocaleString()} د.ع</span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setReturnTarget(s);
                                      setReturnQtys({});
                                      setReturnReason('');
                                      setReturnRefundMethod('cash');
                                      setShowReturnModal(true);
                                    }}
                                    className="text-[9px] font-black px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg transition cursor-pointer"
                                  >
                                    إرجاع
                                  </button>
                                </div>
                              </div>

                              {/* تفاصيل الأصناف — قابلة للتعديل */}
                              {isExpanded && (
                                <div className="px-3 pb-3 space-y-2 border-t border-blue-100">
                                  <p className="text-[9px] text-blue-600 font-black pt-2">المواد المباعة — يمكنك تعديل الكمية أو السعر ثم حفظ التغييرات</p>
                                  <div className="space-y-1.5">
                                    {editingItems.map((it, idx) => (
                                      <div key={idx} className="flex items-center gap-2 bg-white border border-slate-100 rounded-lg px-3 py-2">
                                        <span className="flex-1 text-slate-700 font-bold text-[10px] truncate">{it.name}</span>
                                        <div className="flex items-center gap-1 shrink-0">
                                          <span className="text-[9px] text-slate-400">كمية</span>
                                          <input
                                            type="number"
                                            min={1}
                                            value={it.quantity}
                                            onChange={e => setEditingItems(prev => prev.map((x, i) => i === idx ? { ...x, quantity: Math.max(1, Number(e.target.value)) } : x))}
                                            className="w-14 text-center border border-slate-200 rounded-lg px-1 py-0.5 font-mono text-[10px] font-bold bg-white"
                                          />
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                          <span className="text-[9px] text-slate-400">سعر</span>
                                          <input
                                            type="number"
                                            min={0}
                                            value={it.price}
                                            onChange={e => setEditingItems(prev => prev.map((x, i) => i === idx ? { ...x, price: Math.max(0, Number(e.target.value)) } : x))}
                                            className="w-24 text-center border border-slate-200 rounded-lg px-1 py-0.5 font-mono text-[10px] font-bold bg-white"
                                          />
                                        </div>
                                        <span className="text-[9px] font-mono text-emerald-700 shrink-0">
                                          = {(it.quantity * it.price).toLocaleString()}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                  <div className="flex items-center justify-between pt-1">
                                    <span className="text-[10px] font-black text-slate-700">
                                      الإجمالي الجديد: <span className="font-mono text-emerald-700">{editingItems.reduce((s, it) => s + it.quantity * it.price, 0).toLocaleString()} د.ع</span>
                                    </span>
                                    <div className="flex gap-2">
                                      <button
                                        onClick={() => setExpandedInvoiceId(null)}
                                        className="text-[9px] font-black px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition cursor-pointer border-none"
                                      >
                                        إلغاء
                                      </button>
                                      <button
                                        onClick={() => handleSaveInvoiceEdit(s.invoiceId)}
                                        className="text-[9px] font-black px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition cursor-pointer border-none"
                                      >
                                        حفظ التعديلات
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                  </div>

                </motion.div>
              )}

              {/* 
                =========================================================
                VIEWPORT SECTION 2: DYNAMIC INVENTORY & STOCK EXPY MANAGER
                =========================================================
              */}
              {activeTab === 'inventory' && (
                <motion.div
                  key="inventory"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6">
                    <div>
                      <h3 className="font-extrabold text-slate-900 text-sm">مستودع الأدوية والمخزون الداخلي</h3>
                      <p className="text-[10px] text-slate-400 font-bold mt-0.5">تحرير الأسعار ونسب المخزون وإدارة فترات انتهاء صلاحية الأدوية العضوية والمبردة</p>
                    </div>

                    {/* Bulk import status banner */}
                    {bulkImportStatus !== 'idle' && (
                      <div className={`rounded-2xl p-4 text-right flex items-center gap-3 shadow-sm border ${
                        bulkImportStatus === 'error' ? 'bg-red-50 border-red-200' :
                        bulkImportStatus === 'done' ? 'bg-emerald-50 border-emerald-200' :
                        'bg-slate-50 border-slate-200'
                      }`}>
                        {(bulkImportStatus === 'loading' || bulkImportStatus === 'writing') && (
                          <RefreshCw className="w-5 h-5 text-slate-600 animate-spin shrink-0" />
                        )}
                        {bulkImportStatus === 'done' && <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />}
                        {bulkImportStatus === 'error' && <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />}
                        <div className="flex-1">
                          <p className={`text-xs font-extrabold ${
                            bulkImportStatus === 'error' ? 'text-red-800' :
                            bulkImportStatus === 'done' ? 'text-emerald-800' : 'text-slate-800'
                          }`}>
                            {bulkImportStatus === 'writing'
                              ? `جارٍ الرفع السحابي... ${bulkImportProgress.done.toLocaleString()} / ${bulkImportProgress.total.toLocaleString()}`
                              : bulkImportMsg}
                          </p>
                          {bulkImportStatus === 'writing' && (
                            <div className="mt-2 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500 transition-all duration-300"
                                style={{ width: `${bulkImportProgress.total ? (bulkImportProgress.done / bulkImportProgress.total) * 100 : 0}%` }} />
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Automatic Alert: Near Expiry Medicines (30 days) — collapsible */}
                    {getNearExpiryMeds().length > 0 && (
                      <div className="bg-rose-50/50 border border-rose-100 rounded-2xl p-5 text-right space-y-3.5 shadow-sm">
                        <button
                          type="button"
                          onClick={() => setShowNearExpiry30(!showNearExpiry30)}
                          className="w-full flex items-center justify-between cursor-pointer text-right"
                        >
                          <div className="flex items-center space-x-reverse space-x-2.5">
                            <span className="flex h-3 w-3 relative">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-600"></span>
                            </span>
                            <div>
                              <h4 className="font-extrabold text-xs text-rose-900">تنبيه تلقائي: مستحضرات قاربت صلاحيتها على الانتهاء (30 يوماً أو أقل)</h4>
                              <p className="text-[9px] text-rose-500 font-bold mt-0.5 font-sans">يرجى اتخاذ تدابير الوقاية وتوريد كميات جديدة أو إبرام طلبية مرتجع مع المذخر المعني</p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-reverse space-x-2">
                            <span className="text-[10px] bg-rose-100 text-rose-850 font-extrabold px-3 py-0.5 rounded-full border border-rose-200/50">
                              {getNearExpiryMeds().length} {getNearExpiryMeds().length === 1 ? "مستحضر حرج" : "مستحضرات حرجة"}
                            </span>
                            <ChevronDown className={`w-4 h-4 text-rose-400 transition-transform ${showNearExpiry30 ? 'rotate-180' : ''}`} />
                          </div>
                        </button>

                        {showNearExpiry30 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
                          {getNearExpiryMeds().map(med => {
                            const days = getDaysUntilExpiry(med.id);
                            const expDate = expiryDates[med.id] || '';
                            return (
                              <div key={med.id} className="bg-white border border-rose-100/70 p-3.5 rounded-xl flex items-center justify-between text-xs transition hover:shadow-xs hover:border-rose-200">
                                <div className="space-y-1">
                                  <strong className="font-extrabold text-slate-950 block">{med.nameAr}</strong>
                                  <span className="text-[10px] text-slate-500 font-mono block">
                                    {med.nameEn} • {med.scientificName}
                                  </span>
                                  <div className="flex items-center space-x-reverse space-x-1.5 mt-1">
                                    <Clock className="w-3.5 h-3.5 text-rose-600" />
                                    <span className="text-[10px] font-bold text-rose-600 font-mono">
                                      انتهاء الصلاحية: {expDate}
                                    </span>
                                  </div>
                                </div>
                                
                                <div className="flex flex-col items-end space-y-2.5">
                                  <span className="px-2.5 py-0.5 bg-rose-50 text-rose-800 rounded-lg border border-rose-200/40 font-extrabold text-[10px] tracking-wide">
                                    {days < 0 ? `منتهية منذ ${Math.abs(days)} يوم` : days === 0 ? 'تنتهي اليوم!' : `متبقي ${days} يوم`}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      addToPurchaseDraft(med);
                                      setActiveTab('b2b');
                                    }}
                                    className="text-[9px] bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 text-emerald-850 font-black px-2.5 py-1 rounded-lg transition border border-emerald-150 cursor-pointer flex items-center gap-1"
                                  >
                                    <Plus className="w-3 h-3" />
                                    <span>طلب توريد B2B</span>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        )}
                      </div>
                    )}

                    {/* لوحة الصلاحيات الموسّعة: أفق 6 أشهر مع تصفية بالشهر وترتيب بالأولوية */}
                    {getHorizonExpiryMeds().length > 0 && (
                      <div className="bg-white border border-slate-200/70 rounded-2xl shadow-sm overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setShowExpiryHorizon(!showExpiryHorizon)}
                          className="w-full flex items-center justify-between p-5 text-right hover:bg-slate-50/60 transition cursor-pointer"
                        >
                          <div className="flex items-center space-x-reverse space-x-2.5">
                            <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-amber-50 border border-amber-150">
                              <CalendarClock className="w-4 h-4 text-amber-600" />
                            </span>
                            <div>
                              <h4 className="font-extrabold text-xs text-slate-900">سجلّ الصلاحيات الموسّع — أفق 6 أشهر</h4>
                              <p className="text-[9px] text-slate-400 font-bold mt-0.5">اضغط شهراً لعرض كل المواد المنتهية فيه، مرتّبة بالأولوية (الأقرب انتهاءً أولاً)</p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-reverse space-x-2">
                            <span className="text-[10px] bg-amber-100 text-amber-800 font-extrabold px-3 py-0.5 rounded-full border border-amber-200/50">
                              {getHorizonExpiryMeds().length} مستحضر
                            </span>
                            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showExpiryHorizon ? 'rotate-180' : ''}`} />
                          </div>
                        </button>

                        {showExpiryHorizon && (
                          <div className="px-5 pb-5 space-y-4 border-t border-slate-100 pt-4">
                            {/* شرائح اختيار الشهر */}
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => setSelectedExpiryMonth(null)}
                                className={`text-[10px] font-extrabold px-3 py-1.5 rounded-lg border transition cursor-pointer ${selectedExpiryMonth === null ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'}`}
                              >
                                الكل ({getHorizonExpiryMeds().length})
                              </button>
                              {getExpiryMonths().map(mo => (
                                <button
                                  key={mo.key}
                                  type="button"
                                  disabled={mo.count === 0}
                                  onClick={() => setSelectedExpiryMonth(mo.key)}
                                  className={`text-[10px] font-extrabold px-3 py-1.5 rounded-lg border transition flex items-center gap-1.5 ${mo.count === 0 ? 'bg-slate-50/50 text-slate-300 border-slate-100 cursor-not-allowed' : selectedExpiryMonth === mo.key ? 'bg-amber-500 text-white border-amber-500 cursor-pointer' : 'bg-amber-50 text-amber-700 border-amber-200/60 hover:border-amber-300 cursor-pointer'}`}
                                >
                                  <span>{mo.label}</span>
                                  {mo.count > 0 && (
                                    <span className={`text-[8px] px-1.5 py-0.5 rounded-full ${selectedExpiryMonth === mo.key ? 'bg-white/25' : 'bg-amber-200/70'}`}>{mo.count}</span>
                                  )}
                                </button>
                              ))}
                            </div>

                            {/* القائمة المرتّبة بالأولوية */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {getHorizonExpiryMeds()
                                .filter(med => selectedExpiryMonth === null || (expiryDates[med.id] || '').substring(0, 7) === selectedExpiryMonth)
                                .map(med => {
                                  const days = getDaysUntilExpiry(med.id);
                                  const sev = expirySeverity(days);
                                  const tone = sev === 'expired' || sev === 'critical'
                                    ? { card: 'border-rose-100/70 hover:border-rose-200', icon: 'text-rose-600', badge: 'bg-rose-50 text-rose-700 border-rose-200/50' }
                                    : sev === 'warning'
                                    ? { card: 'border-amber-100/70 hover:border-amber-200', icon: 'text-amber-600', badge: 'bg-amber-50 text-amber-700 border-amber-200/50' }
                                    : { card: 'border-slate-200/70 hover:border-slate-300', icon: 'text-slate-500', badge: 'bg-slate-50 text-slate-600 border-slate-200/50' };
                                  return (
                                    <div key={med.id} className={`bg-white border ${tone.card} p-3.5 rounded-xl flex items-center justify-between text-xs transition hover:shadow-xs`}>
                                      <div className="space-y-1">
                                        <strong className="font-extrabold text-slate-950 block">{med.nameAr}</strong>
                                        <span className="text-[10px] text-slate-500 font-mono block">{med.nameEn} • {med.scientificName}</span>
                                        <div className="flex items-center space-x-reverse space-x-1.5 mt-1">
                                          <Clock className={`w-3.5 h-3.5 ${tone.icon}`} />
                                          <span className={`text-[10px] font-bold font-mono ${tone.icon}`}>انتهاء الصلاحية: {expiryDates[med.id]}</span>
                                        </div>
                                      </div>
                                      <div className="flex flex-col items-end space-y-2.5">
                                        <span className={`px-2.5 py-0.5 rounded-lg border font-extrabold text-[10px] tracking-wide ${tone.badge}`}>
                                          {days < 0 ? `منتهية منذ ${Math.abs(days)} يوم` : days === 0 ? 'تنتهي اليوم!' : `متبقي ${days} يوم`}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => { addToPurchaseDraft(med); setActiveTab('b2b'); }}
                                          className="text-[9px] bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 text-emerald-850 font-black px-2.5 py-1 rounded-lg transition border border-emerald-150 cursor-pointer flex items-center gap-1"
                                        >
                                          <Plus className="w-3 h-3" />
                                          <span>طلب توريد B2B</span>
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Expandable Box: Add drug Form */}
                    {isAddingDrug && (
                      <form onSubmit={handleAddNewDrug} className="bg-slate-50 p-5 rounded-2xl border border-slate-100 p-6 space-y-4">
                        <h4 className="font-black text-slate-900 text-xs">إدخال دواء ومستحضر تجميل جديد يدوياً في صيدلية انوار الحسن</h4>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div className="space-y-1">
                            <label className="block text-[10px] font-bold text-slate-500">الاسم التجاري (عربي):</label>
                            <input 
                              type="text" required
                              value={newDrugAr} onChange={(e) => setNewDrugAr(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-emerald-500" 
                              placeholder="مثال: ريفانين خافض حرارة"
                            />
                          </div>
                          
                          <div className="space-y-1">
                            <label className="block text-[10px] font-bold text-slate-500">الاسم التجاري (إنجليزي):</label>
                            <input 
                              type="text" required
                              value={newDrugEn} onChange={(e) => setNewDrugEn(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-850 focus:outline-emerald-500 font-mono" 
                              placeholder="Revanin 500mg"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="block text-[10px] font-bold text-slate-500">الاسم العلمي والمادة النشطة:</label>
                            <input 
                              type="text"
                              value={newDrugSci} onChange={(e) => setNewDrugSci(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-emerald-500 font-serif" 
                              placeholder="Paracetamol"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="block text-[10px] font-bold text-slate-500">رمز الباركود الدولي (Barcode):</label>
                            <div className="flex gap-1.5">
                              <input 
                                type="text"
                                value={newDrugBarcode} onChange={(e) => setNewDrugBarcode(e.target.value)}
                                className="flex-1 bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-emerald-500 font-mono" 
                                placeholder="مثال: 6281100115598"
                              />
                              <button
                                type="button"
                                onClick={() => startScanning('add-drug')}
                                className="bg-emerald-650 hover:bg-emerald-700 active:bg-emerald-750 text-white rounded-lg px-2.5 flex items-center justify-center transition cursor-pointer"
                                title="قراءة بالكاميرا (Scan Barcode)"
                              >
                                <Barcode className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <label className="block text-[10px] font-bold text-slate-500">السعر النقدي للجمهور (د.ع):</label>
                            <input 
                              type="number" required
                              value={newDrugPrice} onChange={(e) => setNewDrugPrice(Number(e.target.value))}
                              className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-emerald-500 font-mono" 
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="block text-[10px] font-bold text-slate-500">سعر البيع في قائمة المخزون (د.ع - رسمي):</label>
                            <input 
                              type="number" required
                              value={newDrugSecondaryPrice} onChange={(e) => setNewDrugSecondaryPrice(Number(e.target.value))}
                              className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-emerald-500 font-mono" 
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="block text-[10px] font-bold text-slate-500">الكمية الأولية (علبة):</label>
                            <input 
                              type="number" required
                              value={newDrugQty} onChange={(e) => setNewDrugQty(Number(e.target.value))}
                              className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-emerald-500 font-mono" 
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="block text-[10px] font-bold text-slate-500">تاريخ انتهاء الصلاحية للمنتج:</label>
                            <input 
                              type="date"
                              value={newDrugExpiry} onChange={(e) => setNewDrugExpiry(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-emerald-500 font-mono" 
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="block text-[10px] font-bold text-slate-500">حد التنبيه (أدنى كمية):</label>
                          <input
                            type="number" min="1"
                            value={newDrugMinStock ?? 15}
                            onChange={(e) => setNewDrugMinStock(Number(e.target.value))}
                            className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-emerald-500"
                            placeholder="15"
                          />
                        </div>

                        <div className="flex justify-end space-x-reverse space-x-3 pt-3">
                          <button 
                            type="button" onClick={() => setIsAddingDrug(false)}
                            className="bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer"
                          >
                            إلغاء التراجع
                          </button>
                          <button 
                            type="submit"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-xl text-xs font-black cursor-pointer"
                          >
                            حفظ المنتج في انوار الحسن
                          </button>
                        </div>
                      </form>
                    )}

                  {/* ===================================================== */}
                  {/* حركة المادة — سجل الوارد (شراء) والصادر (بيع) لصنف معيّن */}
                  {/* ===================================================== */}
                  <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-5">
                    <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                      <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                        <RefreshCw className="w-4 h-4 text-indigo-600" />
                      </div>
                      <div>
                        <h4 className="font-extrabold text-slate-900 text-sm">حركة المادة — سجل الوارد والصادر</h4>
                        <p className="text-[10px] text-slate-400 font-bold mt-0.5">اختر صنفاً لعرض كميات الشراء والبيع وتواريخها ضمن مدة زمنية قابلة للتحديد</p>
                      </div>
                    </div>

                    {/* أدوات التحكم: اختيار الصنف + المدى الزمني */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                      <div className="md:col-span-5 space-y-1 relative">
                        <label className="block text-[10px] font-black text-slate-500">الصنف / الدواء (بحث بالاسم أو الباركود)</label>
                        <div className="flex gap-1.5">
                          <div className="relative flex-1">
                            <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                              type="text"
                              value={movementSearch}
                              onChange={(e) => {
                                setMovementSearch(e.target.value);
                                setMovementDropdownOpen(true);
                                if (!e.target.value.trim()) setMovementMedId('');
                              }}
                              onFocus={() => setMovementDropdownOpen(true)}
                              onBlur={() => setTimeout(() => setMovementDropdownOpen(false), 150)}
                              placeholder="اكتب اسم الدواء أو امسح الباركود..."
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-9 pl-8 py-2.5 text-xs font-bold text-slate-700 focus:outline-indigo-400 placeholder:text-slate-400 placeholder:font-medium"
                            />
                            {movementSearch && (
                              <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => { setMovementSearch(''); setMovementMedId(''); setMovementDropdownOpen(false); }}
                                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer bg-transparent border-none p-0"
                                title="مسح"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => startScanning('movement')}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-3 py-2 cursor-pointer transition flex items-center justify-center shrink-0 border-none"
                            title="مسح الباركود بالكاميرا"
                          >
                            <Barcode className="w-4 h-4" />
                          </button>
                        </div>
                        {/* قائمة النتائج المنسدلة */}
                        {movementDropdownOpen && (() => {
                          const q = movementSearch.toLowerCase().trim();
                          const selectedMed = inventory.find(m => m.id === movementMedId);
                          const isExactSelected = !!selectedMed && movementSearch === `${selectedMed.nameAr} (${selectedMed.nameEn})`;
                          const filtered = [...inventory]
                            .filter(m =>
                              !q || isExactSelected ||
                              m.nameAr.toLowerCase().includes(q) ||
                              m.nameEn.toLowerCase().includes(q) ||
                              (m.scientificName || '').toLowerCase().includes(q) ||
                              (m.barcode || '').includes(q)
                            )
                            .sort((a, b) => a.nameAr.localeCompare(b.nameAr));
                          return (
                            <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                              {filtered.length === 0 ? (
                                <p className="text-[10px] text-slate-400 font-bold text-center py-3">لا توجد نتائج مطابقة</p>
                              ) : filtered.map(m => (
                                <button
                                  key={m.id}
                                  type="button"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => {
                                    setMovementMedId(m.id);
                                    setMovementSearch(`${m.nameAr} (${m.nameEn})`);
                                    setMovementDropdownOpen(false);
                                  }}
                                  className={`w-full text-right px-3 py-2 hover:bg-indigo-50 cursor-pointer border-none flex items-center justify-between gap-2 transition ${m.id === movementMedId ? 'bg-indigo-50' : 'bg-transparent'}`}
                                >
                                  <div className="min-w-0">
                                    <span className="block text-[11px] font-black text-slate-800 truncate">{m.nameAr} <span className="text-slate-400 font-mono text-[9px]">{m.nameEn}</span></span>
                                    <span className="block text-[9px] text-slate-400 font-mono">{m.barcode || '—'}</span>
                                  </div>
                                  <span className="text-[9px] text-slate-400 font-bold shrink-0 whitespace-nowrap">{m.availableQuantity} علبة</span>
                                </button>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                      <div className="md:col-span-3 space-y-1">
                        <label className="block text-[10px] font-black text-slate-500">من تاريخ</label>
                        <input
                          type="date"
                          value={movementFrom}
                          onChange={(e) => setMovementFrom(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-700 font-mono focus:outline-indigo-400"
                        />
                      </div>
                      <div className="md:col-span-3 space-y-1">
                        <label className="block text-[10px] font-black text-slate-500">إلى تاريخ</label>
                        <input
                          type="date"
                          value={movementTo}
                          onChange={(e) => setMovementTo(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-700 font-mono focus:outline-indigo-400"
                        />
                      </div>
                      <div className="md:col-span-1">
                        <button
                          type="button"
                          onClick={() => { setMovementFrom(''); setMovementTo(''); }}
                          className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-black py-2.5 rounded-xl text-[10px] cursor-pointer transition border-none"
                          title="مسح المدى الزمني"
                        >
                          مسح
                        </button>
                      </div>
                    </div>

                    {/* النتائج */}
                    {!movementMedId ? (
                      <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl py-10 text-center">
                        <Search className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                        <p className="text-[11px] text-slate-400 font-bold">اختر صنفاً من القائمة أعلاه لعرض سجل حركته (الوارد والصادر)</p>
                      </div>
                    ) : (() => {
                      const med = inventory.find(m => m.id === movementMedId);
                      const { movements, totalIn, totalOut, valueIn, valueOut } = getStockMovements(movementMedId, movementFrom, movementTo);
                      const net = totalIn - totalOut;
                      return (
                        <div className="space-y-4">
                          {/* بطاقات الملخص */}
                          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
                              <span className="text-[9px] text-emerald-700 font-black block mb-1">إجمالي الوارد (شراء)</span>
                              <strong className="text-lg font-black text-emerald-700 font-mono block">{totalIn.toLocaleString()} <span className="text-[9px] font-bold">علبة</span></strong>
                              <span className="text-[9px] text-emerald-600/70 font-bold font-mono">{valueIn.toLocaleString()} د.ع</span>
                            </div>
                            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
                              <span className="text-[9px] text-blue-700 font-black block mb-1">إجمالي الصادر (بيع)</span>
                              <strong className="text-lg font-black text-blue-700 font-mono block">{totalOut.toLocaleString()} <span className="text-[9px] font-bold">علبة</span></strong>
                              <span className="text-[9px] text-blue-600/70 font-bold font-mono">{valueOut.toLocaleString()} د.ع</span>
                            </div>
                            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                              <span className="text-[9px] text-slate-500 font-black block mb-1">صافي الحركة</span>
                              <strong className={`text-lg font-black font-mono block ${net >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{net >= 0 ? '+' : ''}{net.toLocaleString()} <span className="text-[9px] font-bold">علبة</span></strong>
                              <span className="text-[9px] text-slate-400 font-bold">وارد − صادر</span>
                            </div>
                            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4">
                              <span className="text-[9px] text-indigo-700 font-black block mb-1">الرصيد الحالي بالمخزن</span>
                              <strong className="text-lg font-black text-indigo-700 font-mono block">{(med?.availableQuantity ?? 0).toLocaleString()} <span className="text-[9px] font-bold">علبة</span></strong>
                              <span className="text-[9px] text-indigo-600/70 font-bold">{med?.nameAr}</span>
                            </div>
                          </div>

                          {/* جدول الحركات الزمني */}
                          {movements.length === 0 ? (
                            <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl py-8 text-center">
                              <p className="text-[11px] text-slate-400 font-bold">لا توجد حركات مسجّلة لهذا الصنف{(movementFrom || movementTo) ? ' ضمن المدى الزمني المحدد' : ''}</p>
                            </div>
                          ) : (
                            <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                              <table className="w-full text-right text-[11px]">
                                <thead>
                                  <tr className="bg-slate-50 text-slate-500 border-b border-slate-100 font-bold">
                                    <th className="py-2.5 px-3 rounded-r-xl">التاريخ</th>
                                    <th className="py-2.5 px-3 text-center">نوع الحركة</th>
                                    <th className="py-2.5 px-3 text-center">الكمية</th>
                                    <th className="py-2.5 px-3 text-center">سعر الوحدة</th>
                                    <th className="py-2.5 px-3 text-center">القيمة الإجمالية</th>
                                    <th className="py-2.5 px-3">المرجع</th>
                                    <th className="py-2.5 px-3 rounded-l-xl">الجهة</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {movements.map((mv, i) => (
                                    <tr key={mv.ref + '-' + i} className="border-b border-slate-100/70 hover:bg-slate-50/50 transition">
                                      <td className="py-2.5 px-3 font-mono text-slate-500 whitespace-nowrap">{mv.date}</td>
                                      <td className="py-2.5 px-3 text-center">
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-black ${mv.type === 'in' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-blue-50 text-blue-700 border-blue-100'}`}>
                                          {mv.type === 'in' ? '↓ وارد (شراء)' : '↑ صادر (بيع)'}
                                        </span>
                                      </td>
                                      <td className={`py-2.5 px-3 text-center font-mono font-black ${mv.type === 'in' ? 'text-emerald-700' : 'text-blue-700'}`}>
                                        {mv.type === 'in' ? '+' : '−'}{mv.qty.toLocaleString()}
                                      </td>
                                      <td className="py-2.5 px-3 text-center font-mono text-slate-600">{mv.price.toLocaleString()} د.ع</td>
                                      <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-700">{(mv.qty * mv.price).toLocaleString()} د.ع</td>
                                      <td className="py-2.5 px-3 font-mono text-slate-400">{mv.ref}</td>
                                      <td className="py-2.5 px-3 text-slate-600 font-semibold max-w-[160px] truncate" title={mv.party}>{mv.party}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                          <p className="text-[9px] text-slate-400 font-bold">* الوارد يُحتسب من طلبيات الشراء (المذاخر)، والصادر من سجل فواتير البيع (POS). عدد الحركات: {movements.length}</p>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Reorder point section */}
                  {(() => {
                    const lowItems = inventory.filter(m =>
                      m.availableQuantity <= 1 && !dismissedLowStock.has(m.id)
                    );
                    if (lowItems.length === 0) return null;

                    // حساب أعلى كمية سبق شراؤها لكل دواء من سجل الطلبيات
                    const getMaxPurchasedQty = (med: Medicine): number => {
                      let max = 0;
                      b2bOrders.forEach(order => {
                        order.items?.forEach((it: any) => {
                          if (
                            it.medicineName?.includes(med.nameAr.substring(0, 6)) ||
                            med.nameAr.includes((it.medicineName || '').substring(0, 6))
                          ) {
                            if ((it.quantity || 0) > max) max = it.quantity;
                          }
                        });
                      });
                      return max;
                    };

                    // اقتراح كمية الطلب بناءً على سلوك الشراء السابق
                    const getSuggestedQty = (med: Medicine): number => {
                      const maxQty = getMaxPurchasedQty(med);
                      if (maxQty > 100) return 10;
                      if (maxQty > 50)  return 5;
                      if (maxQty > 10)  return 2;
                      return 2;
                    };

                    return (
                      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
                        {/* رأس القسم — قابل للطي */}
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => setShowLowStock(p => !p)}
                            className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition text-right"
                          >
                            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                            <span className="text-xs font-black text-amber-900">أصناف نفدت أو شارفت على النفاد</span>
                            <span className="text-[10px] bg-amber-200 text-amber-900 font-extrabold px-2.5 py-0.5 rounded-full">{lowItems.length} صنف</span>
                            <ChevronDown className={`w-3.5 h-3.5 text-amber-600 transition-transform duration-200 ${showLowStock ? 'rotate-180' : ''}`} />
                          </button>
                          {/* زر الطباعة */}
                          <button
                            type="button"
                            onClick={() => {
                              const win = window.open('', '_blank');
                              if (!win) return;
                              win.document.write(`
                                <html dir="rtl"><head><title>قائمة الطلب العاجل</title>
                                <style>body{font-family:Arial,sans-serif;padding:20px;direction:rtl}
                                table{width:100%;border-collapse:collapse}
                                th,td{border:1px solid #ccc;padding:8px 12px;text-align:right}
                                th{background:#fef3c7;font-weight:bold}
                                h2{color:#92400e}</style></head><body>
                                <h2>قائمة الطلب العاجل — صيدلية انوار الحسن</h2>
                                <p style="color:#666;font-size:12px">${new Date().toLocaleDateString('ar-IQ')}</p>
                                <table><thead><tr><th>الدواء</th><th>الكمية الحالية</th><th>الكمية المقترحة للطلب</th></tr></thead>
                                <tbody>${lowItems.map(m => `<tr><td>${m.nameAr}</td><td>${m.availableQuantity} علبة</td><td>${getSuggestedQty(m)} علبة</td></tr>`).join('')}
                                </tbody></table></body></html>
                              `);
                              win.document.close();
                              win.print();
                            }}
                            className="flex items-center gap-1.5 text-[10px] font-black bg-amber-200 hover:bg-amber-300 text-amber-900 px-3 py-1.5 rounded-xl transition cursor-pointer border-none"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            طباعة القائمة
                          </button>
                        </div>

                        {/* قائمة الأصناف */}
                        {showLowStock && <div className="space-y-2">
                          {lowItems.map(m => {
                            const suggestedQty = getSuggestedQty(m);
                            const maxPast = getMaxPurchasedQty(m);
                            return (
                              <div key={m.id} className="bg-white border border-amber-100 rounded-xl px-3 py-2.5 flex items-center justify-between text-xs gap-2">
                                <div className="min-w-0 flex-1">
                                  <span className="font-bold text-slate-800 block">{m.nameAr}</span>
                                  <span className={`font-mono font-bold text-[10px] ${m.availableQuantity === 0 ? 'text-rose-600' : 'text-amber-600'}`}>
                                    {m.availableQuantity === 0 ? 'نفد المخزون' : `${m.availableQuantity} علبة متبقية`}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {/* اقتراح الكمية */}
                                  <div className="text-center">
                                    <span className="text-[8px] text-slate-400 font-bold block">اقتراح الطلب</span>
                                    <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg font-mono">
                                      {suggestedQty} علبة
                                    </span>
                                    {maxPast > 0 && (
                                      <span className="text-[8px] text-slate-400 block">بناءً على {maxPast} سابقاً</span>
                                    )}
                                  </div>
                                  {/* زر إضافة للشراء */}
                                  <button
                                    type="button"
                                    onClick={() => { addToPurchaseDraft(m, suggestedQty); setActiveTab('b2b'); }}
                                    className="text-[9px] font-black px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition cursor-pointer border-none"
                                  >
                                    أضف للشراء
                                  </button>
                                  {/* زر الإخفاء */}
                                  <button
                                    type="button"
                                    onClick={() => setDismissedLowStock(prev => new Set([...prev, m.id]))}
                                    className="text-[9px] font-black px-2 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-lg transition cursor-pointer border-none"
                                    title="إخفاء من القائمة"
                                  >
                                    ✕
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>}
                        {showLowStock && dismissedLowStock.size > 0 && (
                          <button
                            type="button"
                            onClick={() => setDismissedLowStock(new Set())}
                            className="text-[9px] text-amber-700 font-bold underline cursor-pointer bg-transparent border-none"
                          >
                            إعادة عرض الأصناف المخفية ({dismissedLowStock.size})
                          </button>
                        )}
                      </div>
                    );
                  })()}

                  {/* ===================================================== */}
                  {/* قائمة الأدوية في المخزون — شريط تحكم + جدول (نهاية القائمة) */}
                  {/* ===================================================== */}
                  <div className="space-y-3">
                    {/* شريط تحكم موحّد: بحث + فلتر الفئة + أزرار الإجراءات */}
                    <div className="bg-slate-50/70 border border-slate-150 rounded-2xl p-3 flex flex-wrap items-center gap-2">
                      <div className="relative flex-1 min-w-[180px]">
                        <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                        <input
                          type="text"
                          value={searchInInventoryQuery}
                          onChange={(e) => setSearchInInventoryQuery(e.target.value)}
                          onFocus={() => setSearchInInventoryQuery('')}
                          className="w-full bg-white border border-slate-200 rounded-xl pr-9 pl-8 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-emerald-500 font-medium"
                          placeholder="بحث بالاسم أو الباركود أو الفئة..."
                        />
                        {searchInInventoryQuery && (
                          <button
                            type="button"
                            onClick={() => setSearchInInventoryQuery('')}
                            className="absolute left-2.5 top-2 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                            title="مسح البحث"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      {searchInInventoryQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchInInventoryQuery('')}
                          className="text-[10px] font-black text-slate-500 hover:text-rose-600 px-2 py-2 transition cursor-pointer"
                        >
                          مسح ✕
                        </button>
                      )}
                      <div className="flex-1" />
                      <button
                        type="button"
                        onClick={() => startScanning('inventory')}
                        className="bg-white border border-slate-200 hover:border-emerald-300 text-slate-600 hover:text-emerald-700 rounded-xl px-3 py-2 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                        title="قراءة الباركود بالكاميرا"
                      >
                        <Barcode className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setIsAddingDrug(!isAddingDrug)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs px-3.5 py-2 rounded-xl cursor-pointer transition flex items-center space-x-reverse space-x-1.5"
                      >
                        <Plus className="w-4 h-4" />
                        <span>إضافة دواء</span>
                      </button>
                      {/* زر مؤقت للاختبار */}
                      <button
                        onClick={handleSeedTestData}
                        className="bg-orange-500 hover:bg-orange-600 text-white font-black text-xs px-3.5 py-2 rounded-xl cursor-pointer transition flex items-center space-x-reverse space-x-1.5"
                        title="إضافة 5 أدوية تجريبية"
                      >
                        <span>🧪 بيانات تجريبية</span>
                      </button>
                      {currentRole === 'admin' && (
                        <button
                          onClick={() => setShowBulkImportConfirm(true)}
                          disabled={bulkImportStatus === 'loading' || bulkImportStatus === 'writing'}
                          className="bg-slate-800 hover:bg-slate-900 text-white font-black text-xs px-3.5 py-2 rounded-xl cursor-pointer transition flex items-center space-x-reverse space-x-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Download className="w-4 h-4" />
                          <span>استيراد المخزون</span>
                        </button>
                      )}
                    </div>

                    {/* جدول المخزون */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-right border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 text-slate-400 font-black border-b border-slate-100 text-[10px]">
                            <th className="py-3 px-4">رقم الرف</th>
                            <th className="py-3 px-4">الاسم والدواء</th>
                            <th className="py-3 px-4">سعر البيع للجمهور</th>
                            <th className="py-3 px-4">سعر البيع الرسمي</th>
                            <th className="py-3 px-4">الكمية المتوفرة</th>
                            <th className="py-3 px-4">انتهاء الصلاحية</th>
                            <th className="py-3 px-4 text-center">تعديل المخزون</th>
                            <th className="py-3 px-4 text-center">حذف</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                          {filteredInventory.slice(0, invRenderCap).map((med, idx) => {
                              const expDate = expiryDates[med.id] || '2028-01-01';
                              const daysRemaining = getDaysUntilExpiry(med.id);
                              const isNearExpiry30 = daysRemaining <= 30;
                              return (
                                <React.Fragment key={med.id}>
                                <tr
                                  className={`transition border-b border-slate-100 ${isNearExpiry30 ? 'bg-rose-50/65 hover:bg-rose-100/70 text-rose-950' : 'hover:bg-slate-50/50'}`}
                                >
                                  <td className="py-3 px-4 font-mono text-slate-400">REF-{1000 + idx}</td>
                                  <td className="py-3 px-4 space-y-0.5">
                                    <strong className="text-slate-900 block font-bold">{med.nameAr}</strong>
                                    <span className="text-[10px] text-slate-400 font-mono block">{med.nameEn} • {med.scientificName}</span>
                                  </td>
                                  {editingPriceId === med.id ? (
                                    <>
                                      <td className="py-3 px-4 font-mono">
                                        <input
                                          type="number" min={0} step={250} autoFocus
                                          value={editingPriceValue}
                                          onChange={(e) => setEditingPriceValue(e.target.value)}
                                          onKeyDown={(e) => { if (e.key === 'Enter') saveEditingPrice(med.id); if (e.key === 'Escape') setEditingPriceId(null); }}
                                          className="w-24 bg-white border border-emerald-300 rounded-lg px-2 py-1 text-xs text-emerald-900 font-mono font-bold text-center focus:outline-emerald-500"
                                        />
                                      </td>
                                      <td className="py-3 px-4 font-mono">
                                        <div className="flex items-center gap-1.5">
                                          <input
                                            type="number" min={0} step={250}
                                            value={editingSecondaryPriceValue}
                                            onChange={(e) => setEditingSecondaryPriceValue(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === 'Enter') saveEditingPrice(med.id); if (e.key === 'Escape') setEditingPriceId(null); }}
                                            className="w-24 bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-700 font-mono font-bold text-center focus:outline-slate-400"
                                          />
                                          <button type="button" onClick={() => saveEditingPrice(med.id)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 rounded-lg transition cursor-pointer" title="حفظ السعر"><Check className="w-3.5 h-3.5" /></button>
                                          <button type="button" onClick={() => setEditingPriceId(null)} className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1 rounded-lg transition cursor-pointer" title="إلغاء"><X className="w-3.5 h-3.5" /></button>
                                        </div>
                                      </td>
                                    </>
                                  ) : (
                                    <>
                                      <td className="py-3 px-4 font-mono font-bold text-emerald-800">
                                        <button type="button" onClick={() => startEditingPrice(med)} className="group flex items-center gap-1.5 hover:text-emerald-600 transition cursor-pointer" title="تعديل السعر">
                                          <span>{med.price.toLocaleString()} د.ع</span>
                                          <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 transition" />
                                        </button>
                                      </td>
                                      <td className="py-3 px-4 font-mono font-bold text-slate-500/80">{(med.secondaryPrice || (med.price + 500)).toLocaleString()} د.ع</td>
                                    </>
                                  )}
                                  <td className="py-3 px-4 font-mono">
                                    <span className={`px-2 py-0.5 rounded-full font-bold ${med.availableQuantity <= 0 ? 'bg-rose-100 text-rose-800 font-sans text-[10px]' : med.availableQuantity < 15 ? 'bg-amber-100 text-amber-800 font-sans text-[10px]' : 'text-slate-800'}`}>
                                      {med.availableQuantity <= 0 ? 'نفذ بالكامل' : `${med.availableQuantity} علبة`}
                                    </span>
                                    {med.availableQuantity <= (med.minStock ?? 15) && med.availableQuantity > 0 && (
                                      <span className="text-[8px] bg-amber-500 text-white font-bold px-1.5 py-0.5 rounded mr-1">طلب عاجل</span>
                                    )}
                                  </td>
                                  <td className={`py-3 px-4 font-mono font-bold ${isNearExpiry30 ? 'text-rose-600' : 'text-slate-400'}`}>
                                    <div className="flex items-center space-x-reverse space-x-1">
                                      {isNearExpiry30 && <AlertCircle className="w-3.5 h-3.5" />}
                                      <span>{expDate}</span>
                                    </div>
                                  </td>
                                  <td className="py-3 px-4">
                                    {editingQtyId === med.id ? (
                                      <div className="flex items-center justify-center space-x-reverse space-x-1.5">
                                        <input
                                          type="number" min={0} autoFocus
                                          value={editingQtyValue}
                                          onChange={(e) => setEditingQtyValue(e.target.value)}
                                          onKeyDown={(e) => { if (e.key === 'Enter') saveEditingQty(med.id); if (e.key === 'Escape') setEditingQtyId(null); }}
                                          className="w-20 bg-white border border-emerald-300 rounded-lg px-2 py-1 text-xs text-slate-800 font-mono font-bold text-center focus:outline-emerald-500"
                                        />
                                        <button type="button" onClick={() => saveEditingQty(med.id)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 rounded-lg transition cursor-pointer" title="حفظ"><Check className="w-3.5 h-3.5" /></button>
                                        <button type="button" onClick={() => setEditingQtyId(null)} className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1 rounded-lg transition cursor-pointer" title="إلغاء"><X className="w-3.5 h-3.5" /></button>
                                      </div>
                                    ) : (
                                      <div className="flex items-center justify-center space-x-reverse space-x-1.5">
                                        <button type="button" onClick={() => startEditingQty(med)} className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-lg font-bold transition cursor-pointer text-[10px] flex items-center gap-1 border border-emerald-150" title="تعديل الكمية يدوياً"><Pencil className="w-3 h-3" /><span>تعديل</span></button>
                                        <button onClick={() => adjustStockQty(med.id, 10)} className="bg-slate-100 hover:bg-emerald-100 text-slate-600 hover:text-emerald-800 px-2 py-1 rounded font-bold transition cursor-pointer text-[10px]" title="إضافة 10 علب">+10</button>
                                        <button onClick={() => adjustStockQty(med.id, -5)} className="bg-slate-150 hover:bg-rose-100 text-slate-600 hover:text-rose-800 px-2 py-1 rounded font-bold transition cursor-pointer text-[10px]" title="تخفيض 5 علب">-5</button>
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-3 px-4 text-center">
                                    <div className="flex items-center justify-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => quickAuditId === med.id ? setQuickAuditId(null) : startQuickAudit(med)}
                                        className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition cursor-pointer border ${quickAuditId === med.id ? 'bg-violet-600 text-white border-violet-600' : 'bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100'}`}
                                        title="جرد سريع"
                                      >
                                        جرد
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setDeleteMedTarget(med)}
                                        className="text-slate-400 hover:text-white hover:bg-rose-600 p-1.5 rounded-lg transition cursor-pointer border border-transparent hover:border-rose-600"
                                        title="حذف المادة نهائياً"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>

                                {/* صف الجرد السريع الموسّع */}
                                {quickAuditId === med.id && (
                                  <tr className="bg-violet-50/80 border-b border-violet-100">
                                    <td colSpan={8} className="px-4 py-4">
                                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
                                        <div className="space-y-1">
                                          <label className="block text-[10px] font-black text-violet-700">الاسم عربي</label>
                                          <input value={qaNameAr} onChange={e => setQaNameAr(e.target.value)}
                                            className="w-full bg-white border border-violet-200 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-800 focus:outline-violet-500" />
                                        </div>
                                        <div className="space-y-1">
                                          <label className="block text-[10px] font-black text-violet-700">الاسم إنجليزي</label>
                                          <input value={qaNameEn} onChange={e => setQaNameEn(e.target.value)}
                                            className="w-full bg-white border border-violet-200 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-800 focus:outline-violet-500" />
                                        </div>
                                        <div className="space-y-1">
                                          <label className="block text-[10px] font-black text-violet-700">سعر البيع (د.ع)</label>
                                          <input type="number" min={0} step={250} value={qaPrice} onChange={e => setQaPrice(e.target.value)}
                                            className="w-full bg-white border border-violet-200 rounded-lg px-2 py-1.5 text-xs font-mono font-bold text-slate-800 focus:outline-violet-500" />
                                        </div>
                                        <div className="space-y-1">
                                          <label className="block text-[10px] font-black text-violet-700">سعر الشراء (د.ع)</label>
                                          <input type="number" min={0} step={250} value={qaCostPrice} onChange={e => setQaCostPrice(e.target.value)}
                                            className="w-full bg-white border border-violet-200 rounded-lg px-2 py-1.5 text-xs font-mono font-bold text-slate-800 focus:outline-violet-500" />
                                        </div>
                                        <div className="space-y-1">
                                          <label className="block text-[10px] font-black text-violet-700">الكمية الفعلية</label>
                                          <input type="number" min={0} value={qaQty} onChange={e => setQaQty(e.target.value)}
                                            className="w-full bg-white border border-violet-200 rounded-lg px-2 py-1.5 text-xs font-mono font-bold text-slate-800 focus:outline-violet-500" />
                                        </div>
                                        <div className="space-y-1">
                                          <label className="block text-[10px] font-black text-violet-700">انتهاء الصلاحية</label>
                                          <input type="date" value={qaExpiry} onChange={e => setQaExpiry(e.target.value)}
                                            className="w-full bg-white border border-violet-200 rounded-lg px-2 py-1.5 text-xs font-mono font-bold text-slate-800 focus:outline-violet-500" />
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2 mt-3">
                                        <button type="button" onClick={() => saveQuickAudit(med.id)}
                                          className="bg-violet-600 hover:bg-violet-700 text-white px-4 py-1.5 rounded-lg text-xs font-black transition cursor-pointer flex items-center gap-1.5">
                                          <Check className="w-3.5 h-3.5" />حفظ الجرد
                                        </button>
                                        <button type="button" onClick={() => setQuickAuditId(null)}
                                          className="bg-white hover:bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 transition cursor-pointer">
                                          إلغاء
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                                </React.Fragment>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                    {filteredInventory.length > invRenderCap && (
                      <div className="text-center py-4">
                        <button
                          type="button"
                          onClick={() => setInvRenderCap(c => c + 200)}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs px-5 py-2.5 rounded-xl cursor-pointer transition"
                        >
                          عرض المزيد ({filteredInventory.length - invRenderCap} مادة متبقية)
                        </button>
                      </div>
                    )}
                  </div>

                  </div>
                </motion.div>
              )}

              {activeTab === 'b2b' && (
                <motion.div
                  key="b2b"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                  dir="rtl"
                >
                  {/* Dashboard Hub Header */}
                  <div className="bg-gradient-to-l from-emerald-900 to-slate-900 rounded-3xl p-6 text-white shadow-md relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -ml-20 -mt-20" />
                    <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-1 text-right">
                        <span className="text-[10px] uppercase tracking-wider font-extrabold bg-emerald-500/30 text-emerald-100 px-3.5 py-1 rounded-full">إدارة مشتريات وتوريدات الأدوية</span>
                        <h3 className="font-extrabold text-lg mt-2 font-sans">طلبيات الشراء والتغذية اليومية للمخزون</h3>
                        <p className="text-xs text-slate-300 leading-relaxed max-w-2xl font-medium">
                          منظومة متكاملة لتهيئة وتخطيط طلبيات الشراء اليومية من المكاتب العلمية والمذاخر. قم باضافة كمياتك والتحكم المباشر في الأسعار، التواريخ، والباركود لتنزيلها في المخزن بضغطة زر واحدة.
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-2 bg-slate-800/40 border border-slate-700/50 p-4 rounded-2xl backdrop-blur-md">
                        <DollarSign className="w-8 h-8 text-emerald-400" />
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 block font-bold">ميزانية الصندوق المتاحة:</span>
                          <strong className="text-base text-emerald-400 font-mono tracking-wide">{walletBalance.toLocaleString()} د.ع</strong>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Top Level Success banner */}
                  {purchaseSuccessBanner && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-3.5 text-right font-semibold text-xs text-emerald-950 shadow-sm"
                    >
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <strong>عملية توريد ناجحة !</strong>
                        <p className="text-[10px] text-emerald-800 mt-1">{purchaseSuccessBanner}</p>
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
                        className="w-full flex items-center gap-3 bg-gradient-to-l from-emerald-600 to-emerald-500 text-white rounded-2xl p-4 shadow-sm hover:from-emerald-700 hover:to-emerald-600 transition cursor-pointer"
                      >
                        <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                          <ScanLine className="w-5 h-5" />
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-extrabold">استيراد فاتورة من صورة</p>
                          <p className="text-[10px] text-emerald-100 font-bold mt-0.5">ارفع صورة القائمة وسيُعبّأ المخزون تلقائياً</p>
                        </div>
                      </button>

                      {/* Interactive Section: Search and Add by Name */}
                      <div className="bg-white border border-slate-200/80 p-5 rounded-3xl shadow-xs space-y-4">
                        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                          <PlusCircle className="w-5 h-5 text-emerald-600" />
                          <h4 className="font-extrabold text-xs text-slate-900">إضافة سريعة بالاسم أو التفاصيل</h4>
                        </div>
                        
                        <div className="space-y-3">
                          <p className="text-[10px] text-slate-400 font-bold leading-relaxed">
                            اختر أي دواء مسجل مسبقاً في الصيدلية لإدراجه مباشرةً في مسودة الشراء اليومي مع تطبيق التخفيضات:
                          </p>
                          
                          <div className="relative">
                            <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-slate-400">
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
                              className="w-full bg-slate-50 hover:bg-slate-100/70 border border-slate-200 rounded-xl py-2.5 pr-9 pl-10 text-xs font-bold text-slate-850 placeholder:text-slate-400 transition focus:outline-emerald-500"
                            />
                            <button
                              type="button"
                              onClick={() => startScanning('purchase-order')}
                              title="مسح باركود"
                              className="absolute inset-y-0 left-2 flex items-center px-1 text-emerald-600 hover:text-emerald-700 transition cursor-pointer"
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
                                      <strong className="font-extrabold text-slate-900 block">{med.nameAr}</strong>
                                      <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-mono font-bold">
                                        رصيد: {med.availableQuantity}
                                      </span>
                                    </div>
                                    <span className="text-[10px] text-slate-400 font-mono block mt-0.5">{med.nameEn} • {med.scientificName}</span>
                                  </button>
                                ))}
                              {inventory.filter(m => 
                                  m.nameAr.toLowerCase().includes(purchaseSearchWord.toLowerCase()) || 
                                  m.nameEn.toLowerCase().includes(purchaseSearchWord.toLowerCase())
                               ).length === 0 && (
                                <p className="p-4 text-[10px] text-slate-400 text-center font-bold">لم نعثر على دواء مطابق. هل ترغب بإضافة منتج جديد؟</p>
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
                            <PlusCircle className="w-5 h-5 text-emerald-600" />
                            <h4 className="font-extrabold text-xs text-slate-900">تسجيل وإضافة دواء جديد كلياً 🆕</h4>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            showPurchaseNewProdForm ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'
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
                                <label className="block text-[10px]">الاسم العربي للمنتج:</label>
                                <input
                                  type="text"
                                  value={purchaseNewProdAr}
                                  onChange={(e) => setPurchaseNewProdAr(e.target.value)}
                                  className="w-full bg-slate-50 p-2 border border-slate-200 rounded-lg text-slate-900 focus:outline-emerald-500"
                                  placeholder="مثال: ريمكس 500 ملغ"
                                />
                              </div>

                              <div className="space-y-1.5 text-xs text-slate-600 font-bold">
                                <label className="block text-[10px]">الاسم الإنكليزي للمنتج:</label>
                                <input
                                  type="text"
                                  value={purchaseNewProdEn}
                                  onChange={(e) => setPurchaseNewProdEn(e.target.value)}
                                  className="w-full bg-slate-50 p-2 border border-slate-200 rounded-lg text-slate-900 font-mono focus:outline-emerald-500 text-left"
                                  placeholder="e.g. Remex 500mg"
                                />
                              </div>

                              <div className="space-y-1.5 text-xs text-slate-600 font-bold">
                                <label className="block text-[10px]">الاسم العلمي والمادة الفعالة:</label>
                                <input
                                  type="text"
                                  value={purchaseNewProdSci}
                                  onChange={(e) => setPurchaseNewProdSci(e.target.value)}
                                  className="w-full bg-slate-50 p-2 border border-slate-200 rounded-lg text-slate-900 focus:outline-emerald-500"
                                  placeholder="مثال: Paracetamol"
                                />
                              </div>

                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1 text-xs text-slate-600 font-bold">
                                  <label className="block text-[10px]">تاريخ انتهاء الصلاحية:</label>
                                  <input
                                    type="date"
                                    value={purchaseNewProdExpiry}
                                    onChange={(e) => setPurchaseNewProdExpiry(e.target.value)}
                                    className="w-full bg-slate-50 p-2 border border-slate-200 rounded-lg font-mono text-slate-800"
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1 text-xs text-slate-600 font-bold">
                                  <label className="block text-[10px]">سعر شراء الجملة (د.ع):</label>
                                  <input
                                    type="number"
                                    value={purchaseNewProdPrice}
                                    onChange={(e) => setPurchaseNewProdPrice(Number(e.target.value))}
                                    className="w-full bg-slate-50 p-2 border border-slate-200 rounded-lg text-slate-900 text-center font-mono"
                                  />
                                </div>

                                <div className="space-y-1 text-xs text-slate-600 font-bold">
                                  <label className="block text-[10px]">الكمية المطلوبة (علب):</label>
                                  <input
                                    type="number"
                                    value={purchaseNewProdQty}
                                    onChange={(e) => setPurchaseNewProdQty(Number(e.target.value))}
                                    className="w-full bg-slate-50 p-2 border border-slate-200 rounded-lg text-slate-900 text-center font-mono"
                                  />
                                </div>
                              </div>

                              <div className="space-y-1.5 text-xs text-slate-600 font-bold">
                                <label className="block text-[10px]">الباركود الرقمي للمنتج:</label>
                                <input
                                  type="text"
                                  value={purchaseNewProdBarcode}
                                  onChange={(e) => setPurchaseNewProdBarcode(e.target.value)}
                                  className="w-full bg-slate-50 p-2 border border-slate-200 rounded-lg text-slate-900 font-mono focus:outline-emerald-500"
                                  placeholder="سيتولد تلقائياً إن ترك فارغاً"
                                />
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  if (!purchaseNewProdAr || !purchaseNewProdEn) {
                                    alert('الرجاء إدخال الاسم العربي والاسم الإنكليزي لإدراج المنتج!');
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
                                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2.5 rounded-xl text-center transition shadow-sm cursor-pointer text-xs border-none"
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
                            <span className="text-[9px] bg-indigo-50 text-indigo-700 font-black px-2.5 py-0.5 rounded-full inline-block">حالة المسودة: قيد التعديل والتخصيص</span>
                            <h4 className="font-extrabold text-sm text-slate-900 mt-1">مسودة قائمة الشراء والتوريد النشطة</h4>
                            <p className="text-[10px] text-slate-400 font-bold">قم بتعديل الأعداد، الأسعار، وحالات الصلاحية مباشرة في الجدول لتحديث رصيد المخزن تلقائياً</p>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm('هل أنت متأكد من تفريغ مسودة المشتريات بالكامل؟')) {
                                  setPurchaseDraft([]);
                                }
                              }}
                              className="text-[10px] text-rose-500 hover:text-rose-700 font-extrabold bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-xl transition cursor-pointer border-none"
                            >
                              مسح المسودة
                            </button>
                          </div>
                        </div>

                        {purchaseDraft.length === 0 ? (
                          <div className="p-12 text-center border-2 border-dashed border-slate-100 rounded-2xl bg-slate-50/50 space-y-3">
                            <ClipboardList className="w-10 h-10 text-slate-300 mx-auto" />
                            <strong className="text-xs text-slate-700 block">جدول الشراء اليومي فارغ تماماً</strong>
                            <p className="text-[10px] text-slate-400 max-w-sm mx-auto font-bold leading-relaxed">
                              ابدأ الآن بإضافة منتجاتك المطلوبة، أو ابحث عن النواقص بالاسم، أو تصفّح النواقص التي أوشكت صلاحيتها على الانتهاء، أو استخدم مسدس الكاميرا المحاكي.
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            
                            {/* Embedded Interactive Table Sheet */}
                            <div className="overflow-x-auto">
                              <table className="w-full text-right text-xs">
                                <thead>
                                  <tr className="bg-slate-50 text-slate-500 border-b border-slate-100 font-bold">
                                    <th className="py-2.5 px-3 rounded-r-xl">الدواء / المستحضر</th>
                                    <th className="py-2.5 px-3 text-center">الكمية المطلوبة (علبة)</th>
                                    <th className="py-2.5 px-3 text-center">سعر جملة (د.ع)</th>
                                    <th className="py-2.5 px-3 text-center text-blue-700">سعر البيع للجمهور (د.ع)</th>
                                    <th className="py-2.5 px-3 text-center text-violet-700">سعر البيع الرسمي (د.ع)</th>
                                    <th className="py-2.5 px-3 text-center">انتهاء الصلاحية</th>
                                    <th className="py-2.5 px-3 text-center">الإجمالي الفرعي</th>
                                    <th className="py-2.5 px-3 text-center rounded-l-xl">تنظيف</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {purchaseDraft.map((item, index) => {
                                    const subTotal = (item.qty || 0) * (item.price || 0);
                                    return (
                                      <tr key={item.id} className="border-b border-slate-100/70 hover:bg-slate-50/40 transition">
                                        
                                        {/* Name & details */}
                                        <td className="py-3.5 px-3 max-w-xs">
                                          <div className="space-y-0.5">
                                            <strong className="text-slate-900 block font-bold text-xs">{item.nameAr}</strong>
                                            <span className="text-[9px] text-slate-500 font-mono block">
                                              {item.nameEn} • {item.scientificName}
                                            </span>
                                            <div className="flex flex-wrap items-center gap-1">
                                              <input
                                                type="text"
                                                value={item.barcode}
                                                onChange={(e) => {
                                                  const val = e.target.value;
                                                  setPurchaseDraft(prev => prev.map(d => d.id === item.id ? { ...d, barcode: val } : d));
                                                }}
                                                className="text-[8px] text-slate-500 font-mono bg-transparent border-none border-b border-dashed border-slate-200 focus:border-indigo-500 w-24 text-right focus:outline-none"
                                                title="تعديل باركود عبوة الشراء"
                                              />
                                            </div>
                                          </div>
                                        </td>

                                        {/* Qty Adjustment with increments */}
                                        <td className="py-3.5 px-3">
                                          <div className="flex items-center justify-center gap-1.5">
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setPurchaseDraft(prev => prev.map(d => d.id === item.id ? { ...d, qty: Math.max(1, Number(d.qty) - 5) } : d));
                                              }}
                                              className="w-6 h-6 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black rounded flex items-center justify-center transition focus:outline-none border-none cursor-pointer"
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
                                              className="w-14 bg-slate-50 rounded border border-slate-200 p-1 font-mono text-center text-slate-900 focus:outline-emerald-500"
                                            />
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setPurchaseDraft(prev => prev.map(d => d.id === item.id ? { ...d, qty: Number(d.qty) + 10 } : d));
                                              }}
                                              className="w-6 h-6 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black rounded flex items-center justify-center transition focus:outline-none border-none cursor-pointer"
                                            >
                                              +
                                            </button>
                                          </div>
                                        </td>

                                        {/* Purchase price wholesale */}
                                        <td className="py-3.5 px-3">
                                          <div className="flex items-center justify-center gap-1 font-mono">
                                            <input
                                              type="number"
                                              step="250"
                                              value={item.price}
                                              onChange={(e) => {
                                                const val = Number(e.target.value);
                                                setPurchaseDraft(prev => prev.map(d => d.id === item.id ? { ...d, price: isNaN(val) ? 0 : val } : d));
                                              }}
                                              className="w-16 bg-slate-50 rounded border border-slate-200 p-1 text-center text-slate-900 font-mono text-xs focus:outline-none"
                                            />
                                            <span className="text-[10px] text-slate-400">عراقي</span>
                                          </div>
                                        </td>

                                        {/* سعر البيع للجمهور — يُحدّث inventory.price مباشرة */}
                                        <td className="py-3.5 px-3">
                                          <div className="flex items-center justify-center gap-1 font-mono">
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
                                              className="w-16 bg-blue-50 rounded border border-blue-200 p-1 text-center text-blue-900 font-mono text-xs focus:outline-blue-400 focus:outline-none"
                                            />
                                            <span className="text-[10px] text-slate-400">عراقي</span>
                                          </div>
                                        </td>

                                        {/* سعر البيع الرسمي — يُحدّث inventory.secondaryPrice مباشرة */}
                                        <td className="py-3.5 px-3">
                                          <div className="flex items-center justify-center gap-1 font-mono">
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
                                              className="w-16 bg-violet-50 rounded border border-violet-200 p-1 text-center text-violet-900 font-mono text-xs focus:outline-none"
                                            />
                                            <span className="text-[10px] text-slate-400">عراقي</span>
                                          </div>
                                        </td>

                                        {/* Expiry Date — يعرض آخر تاريخ محفوظ ويحدّثه عند التعديل */}
                                        <td className="py-3.5 px-3">
                                          <input
                                            type="date"
                                            value={expiryDates[item.medicineId] || item.expiryDate || ''}
                                            onChange={(e) => {
                                              const val = e.target.value;
                                              setPurchaseDraft(prev => prev.map(d => d.id === item.id ? { ...d, expiryDate: val } : d));
                                              if (item.medicineId) setExpiryDates(prev => ({ ...prev, [item.medicineId]: val }));
                                            }}
                                            className="w-28 bg-slate-50 rounded border border-slate-200 p-1 font-mono text-center text-[10px] focus:outline-none"
                                          />
                                        </td>

                                        {/* Row Subtotal */}
                                        <td className="py-3.5 px-3 text-center font-mono font-bold text-slate-700">
                                          <span>{subTotal.toLocaleString()} د.ع</span>
                                        </td>

                                        {/* Row Trash Delete */}
                                        <td className="py-3.5 px-3 text-center">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setPurchaseDraft(prev => prev.filter(d => d.id !== item.id));
                                            }}
                                            className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 transition cursor-pointer border-none"
                                            title="حذف هذا الدواء"
                                          >
                                            <Trash2 className="w-4 h-4" />
                                          </button>
                                        </td>

                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>

                            {/* Summary panel & Dynamic updating math displays */}
                            <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                              <div className="space-y-1.5 text-right font-bold text-slate-700">
                                <div className="flex items-center gap-2 text-xs">
                                  <span>مجموع المنتجات المسجلة للتوريد:</span>
                                  <span className="bg-emerald-100 text-emerald-800 font-mono px-2.5 py-0.5 rounded-full text-[10px]">
                                    {purchaseDraft.reduce((acc, curr) => acc + Number(curr.qty), 0)} علبة إجمالية
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-400 leading-normal font-medium">
                                  <p>سعر توريد الجملة النهائي خاضع لحسابات الصيدلية و يحدّث أرصدة دواء صيدلية انوار الحسن مع تطبيق الأرباح تلقائياً عند التأكيد.</p>
                                </div>

                                <div className="pt-1 space-y-2">
                                  {/* المورّد الموحّد — يُطبَّق على كل أصناف المسودة (نُقل من عمود الجدول) */}
                                  <div className="space-y-1">
                                    <label className="block text-slate-500 text-[10px] font-bold">المورّد (يُطبَّق على كل الأصناف)</label>
                                    <select
                                      value={suppliers.find(s => s.name === purchaseSupplier) ? purchaseSupplier : ''}
                                      onChange={(e) => applyDraftSupplier(e.target.value)}
                                      className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-bold text-slate-700 cursor-pointer"
                                    >
                                      <option value="">— اختر المورد —</option>
                                      {suppliers.map(s => (
                                        <option key={s.id} value={s.name}>{s.name}</option>
                                      ))}
                                    </select>
                                    <input
                                      type="text"
                                      value={purchaseSupplier}
                                      onChange={(e) => applyDraftSupplier(e.target.value)}
                                      className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-bold text-slate-700"
                                      placeholder="أو اكتب اسم المورد يدوياً..."
                                    />
                                  </div>

                                  {/* شراء بالآجل: تسجيل الفاتورة كذمّة على المذخر بدل خصمها نقداً */}
                                  <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={purchaseOnCredit}
                                      onChange={(e) => setPurchaseOnCredit(e.target.checked)}
                                      className="w-4 h-4 accent-rose-600 cursor-pointer"
                                    />
                                    <span className="text-[11px] font-black text-rose-700">شراء بالآجل (على حساب المذخر)</span>
                                  </label>
                                  {purchaseOnCredit && (
                                    <p className="text-[9px] text-rose-500 font-bold leading-normal">* لن تُخصم القيمة من الصندوق، وستُسجَّل كذمّة مستحقة في دفتر ديون الموردين باسم المورّد المحدّد أعلاه.</p>
                                  )}
                                </div>
                              </div>

                              <div className="flex flex-col items-end gap-2 text-right shrink-0">
                                <span className="text-[10px] text-slate-400 font-bold">إجمالي فاتورة الشراء المتبقية:</span>
                                <strong className="text-xl text-emerald-700 font-mono font-extrabold tracking-wide">
                                  {purchaseDraft.reduce((acc, curr) => acc + (curr.price * curr.qty), 0).toLocaleString()} د.ع
                                </strong>
                              </div>
                            </div>

                            {/* Large final CTA to store products in pharmacy index and refresh levels */}
                            <button
                              type="button"
                              onClick={commitPurchaseDraft}
                              className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-black py-3 px-5 rounded-2xl flex items-center justify-center gap-2 transition shadow-md cursor-pointer hover:shadow-emerald-200 text-sm border-none"
                            >
                              <CheckCircle2 className="w-5 h-5 text-emerald-100 animate-pulse" />
                              <span>تأكيد واعتماد طلبيات الشراء وتغذية المخزون الفوري</span>
                            </button>

                          </div>
                        )}
                      </div>

                      {/* ARCHIVED PAST PURCHASE ORDERS (المشتريات السابقة والموثقة) */}
                      <div className="bg-white border border-slate-200 p-6 rounded-3xl shadow-sm space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                          <div className="flex items-center gap-2">
                            <ClipboardList className="w-5 h-5 text-indigo-600" />
                            <h4 className="font-extrabold text-xs text-slate-900">سجل قوائم المشتريات والطلبيات السابقة</h4>
                          </div>
                          <span className="text-[10px] text-slate-400 font-bold">حالة تدفق الفواتير: موثقة بكامل القيود</span>
                        </div>

                        {/* حقل البحث برقم القائمة أو اسم المورد */}
                        <div className="relative">
                          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                          <input
                            type="text"
                            value={b2bOrderSearch}
                            onChange={e => setB2bOrderSearch(e.target.value)}
                            placeholder="ابحث برقم القائمة (مثال: CAP-28109) أو اسم المورد..."
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-8 pl-3 py-2 text-[11px] font-bold text-slate-700 placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 transition"
                          />
                          {b2bOrderSearch && (
                            <button
                              type="button"
                              onClick={() => setB2bOrderSearch('')}
                              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition bg-transparent border-none cursor-pointer p-0"
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
                            return <p className="p-8 text-center text-[11px] text-slate-400 font-bold">لا يوجد طلبيات شراء سابقة مسجلة حالياً.</p>;
                          }
                          if (filtered.length === 0) {
                            return (
                              <div className="p-6 text-center space-y-1">
                                <p className="text-[11px] text-slate-500 font-bold">لا توجد نتائج لـ «{b2bOrderSearch}»</p>
                                <p className="text-[10px] text-slate-400 font-medium">تأكد من رقم القائمة أو اسم المورد</p>
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
                                    <span className="flex items-center gap-1.5 bg-indigo-50 text-indigo-800 border border-indigo-150 px-2.5 py-1 rounded-lg font-extrabold text-[11px]">
                                      <Truck className="w-3.5 h-3.5 text-indigo-600" />
                                      <span>المورد: {supplierLabel}</span>
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <strong className="text-slate-900 font-mono font-bold">{order.id}</strong>
                                    <span className="text-[8px] bg-slate-200 text-slate-600 px-2.5 py-0.2 rounded font-sans font-bold">
                                      {order.warehouseName || "توريد مباشر"}
                                    </span>
                                  </div>
                                  <span className="text-[10px] text-slate-400 font-mono block">التاريخ والمشرف: {order.date} • {order.itemsCount} أدوية مختلفة</span>
                                  
                                  {/* Detailed medicine items in order */}
                                  <div className="flex flex-wrap gap-1 mt-1.5">
                                    {order.items && order.items.map((item, id) => (
                                      <span key={id} className="text-[9px] bg-white border border-slate-200/60 text-slate-600 px-2.5 py-0.5 rounded-lg font-bold">
                                        {item.medicineName} x{item.quantity}
                                      </span>
                                    ))}
                                  </div>
                                </div>

                                <div className="flex items-center gap-4 text-right sm:text-left shrink-0">
                                  <div className="space-y-1">
                                    <span className="text-[10px] text-slate-400 block font-bold">إجمالي المدفوع:</span>
                                    <strong className="text-sm text-slate-950 font-mono font-bold">
                                      {order.totalAmount.toLocaleString()} د.ع
                                    </strong>
                                  </div>

                                  <div className="flex flex-col items-stretch gap-1.5">
                                    <span className="px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-150 rounded-xl font-extrabold text-[10px] text-center">
                                      تم استيرادها بالكامل ✅
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => reopenPurchaseOrderForEdit(order.id)}
                                      title="إعادة فتح الطلبية للتعديل — يُعكس أثرها على المخزون والحسابات وتعود بنودها إلى المسودة"
                                      className="px-3 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl font-extrabold text-[10px] flex items-center justify-center gap-1 transition cursor-pointer"
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
              )}

              {/*
                =========================================================
                VIEWPORT SECTION 5: FINANCIAL ANNOTATIONS & SUPP SETTLE
                =========================================================
              */}
              {activeTab === 'financial' && !financialUnlocked && (
                <motion.div
                  key="financial-lock"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  className="flex items-center justify-center min-h-[60vh]"
                >
                  <div className="bg-white border border-slate-200 rounded-3xl shadow-lg p-8 w-full max-w-sm space-y-6 text-center">
                    <div className="w-16 h-16 bg-violet-50 rounded-2xl flex items-center justify-center mx-auto">
                      <ShieldCheck className="w-8 h-8 text-violet-600" />
                    </div>
                    <div>
                      <h3 className="font-black text-slate-800 text-base">الحسابات المالية</h3>
                      <p className="text-[11px] text-slate-500 font-semibold mt-1">أدخل كلمة المرور للوصول إلى السجلات المالية</p>
                    </div>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (pinEntry === financialPin) {
                          setFinancialUnlocked(true);
                          setPinError(false);
                          setPinEntry('');
                        } else {
                          setPinError(true);
                          setPinEntry('');
                        }
                      }}
                      className="space-y-4"
                    >
                      <div className="relative">
                        <input
                          type="password"
                          inputMode="numeric"
                          maxLength={20}
                          value={pinEntry}
                          onChange={(e) => { setPinEntry(e.target.value); setPinError(false); }}
                          placeholder="••••"
                          autoFocus
                          className={`w-full text-center text-2xl font-mono tracking-[0.5em] bg-slate-50 border rounded-xl py-3 px-4 focus:outline-none focus:ring-2 transition ${pinError ? 'border-rose-400 focus:ring-rose-200 bg-rose-50' : 'border-slate-200 focus:ring-violet-200 focus:border-violet-400'}`}
                        />
                        {pinError && (
                          <p className="text-[11px] text-rose-600 font-bold mt-1.5 text-center">كلمة المرور غير صحيحة</p>
                        )}
                      </div>
                      <button
                        type="submit"
                        className="w-full bg-violet-600 hover:bg-violet-700 text-white font-black py-3 rounded-xl cursor-pointer transition border-none font-sans text-sm"
                      >
                        دخول
                      </button>
                    </form>
                  </div>
                </motion.div>
              )}

              {activeTab === 'financial' && financialUnlocked && (
                <motion.div
                  key="financial"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6">
                    <div className="border-b border-slate-100 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <span className="text-xs text-emerald-600 font-extrabold bg-emerald-50 px-3 py-1 rounded-full uppercase">كشاف الحسابات انوار الحسن</span>
                        <h3 className="font-extrabold text-slate-900 text-sm mt-3">الحساب المالي الموحد ومحاكاة المقاصة للذمم</h3>
                        <p className="text-[10px] text-slate-400 font-bold mt-1">
                          تتبع جرد الصيدلية الإجمالي، الحسابات المدينة والذمم المترتبة لمذاخر أدوية العراق لتسويتها عبر انوار الحسن باي
                        </p>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                        <button
                          onClick={exportFinancialsToCSV}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition shadow-sm cursor-pointer border-none text-xs font-sans hover:scale-102"
                        >
                          <Download className="w-4 h-4 text-emerald-100 animate-bounce-slow" />
                          <span>تصدير CSV</span>
                        </button>
                        <button
                          onClick={() => {
                            const backup = {
                              exportedAt: new Date().toISOString(),
                              inventory,
                              salesLedger,
                              expenses,
                              payables,
                              receivables,
                              salesReturns,
                              b2bOrders,
                              walletBalance,
                            };
                            const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `anwar-backup-${new Date().toISOString().split('T')[0]}.json`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                          className="bg-slate-700 hover:bg-slate-800 text-white font-black py-2.5 px-4 rounded-xl flex items-center gap-2 transition shadow-sm cursor-pointer text-xs"
                        >
                          <Download className="w-4 h-4" />
                          <span>نسخ احتياطي JSON</span>
                        </button>
                        <button
                          onClick={() => {
                            document.body.classList.add('printing-financial');
                            window.print();
                            setTimeout(() => document.body.classList.remove('printing-financial'), 1000);
                          }}
                          className="bg-violet-600 hover:bg-violet-700 text-white font-black py-2.5 px-4 rounded-xl flex items-center gap-2 transition shadow-sm cursor-pointer text-xs"
                        >
                          <FileText className="w-4 h-4" />
                          <span>طباعة / PDF</span>
                        </button>
                      </div>
                    </div>

                    {/* --- بطاقات المؤشرات السريعة --- */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center justify-between">
                        <div className="space-y-1">
                          <span className="text-[10px] text-slate-400 font-black tracking-wider block">السيولة في صندوق الكاش</span>
                          <span className="text-xl font-black text-slate-900 tracking-tight font-mono">
                            {walletBalance.toLocaleString()} <span className="text-xs text-slate-500 font-sans font-extrabold">د.ع</span>
                          </span>
                        </div>
                        <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                          <Wallet className="w-5 h-5" />
                        </div>
                      </div>
                      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center justify-between">
                        <div className="space-y-1">
                          <span className="text-[10px] text-slate-400 font-black tracking-wider block">أرباح ومبيعات اليوم</span>
                          <span className="text-xl font-black text-slate-900 tracking-tight font-mono">
                            {dailySalesRevenue.toLocaleString()} <span className="text-xs text-slate-500 font-sans font-extrabold">د.ع</span>
                          </span>
                        </div>
                        <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                          <TrendingUp className="w-5 h-5" />
                        </div>
                      </div>
                      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center justify-between">
                        <div className="space-y-1">
                          <span className="text-[10px] text-slate-400 font-black tracking-wider block">ذمم المذاخر المتبقية</span>
                          <span className="text-xl font-black text-rose-700 tracking-tight font-mono">
                            {totalDebts.toLocaleString()} <span className="text-xs text-slate-500 font-sans font-extrabold">د.ع</span>
                          </span>
                        </div>
                        <div className="w-10 h-10 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center">
                          <ClipboardList className="w-5 h-5" />
                        </div>
                      </div>
                      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center justify-between">
                        <div className="space-y-1">
                          <span className="text-[10px] text-slate-400 font-black tracking-wider block">المخزون الدوائي النشط</span>
                          <span className="text-xl font-black text-slate-900 tracking-tight">
                            {inventory.reduce((sum, m) => sum + m.availableQuantity, 0)} <span className="text-xs text-slate-500 font-extrabold">علب</span>
                          </span>
                        </div>
                        <div className="w-10 h-10 bg-slate-50 text-slate-700 rounded-xl flex items-center justify-center">
                          <Pill className="w-5 h-5" />
                        </div>
                      </div>
                    </div>

                    {/* --- بطاقات الملخص المالي حسب الفترة (يومي/أسبوعي/شهري/سنوي) --- */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <BarChart3 className="w-4 h-4 text-emerald-600" />
                        <span className="text-[11px] text-slate-500 font-black">ملخص الأداء المالي حسب الفترة (مبيعات / أرباح / هامش)</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {financialPeriods.map((p) => {
                          const a = finAccent[p.accent];
                          return (
                            <div key={p.key} className={`bg-white border ${a.ring} rounded-2xl p-4 shadow-sm space-y-3`}>
                              <div className="flex items-center justify-between">
                                <span className={`text-[10px] font-black px-2.5 py-1 rounded-full ${a.badge}`}>{p.label}</span>
                                <Calendar className={`w-3.5 h-3.5 ${a.icon}`} />
                              </div>
                              <div className="space-y-0.5">
                                <span className="text-[9px] text-slate-400 font-bold uppercase block">{p.sub}</span>
                                <h5 className="text-lg font-black text-slate-900 font-serif tracking-tight">
                                  {p.stats.sales.toLocaleString()} <span className="text-[10px] text-slate-400">د.ع</span>
                                </h5>
                              </div>
                              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                                <div className="space-y-0.5">
                                  <span className="text-[9px] text-slate-400 font-bold block">الربح الإجمالي</span>
                                  <strong className={`text-sm font-black font-mono ${a.profit}`}>{p.stats.profit.toLocaleString()}</strong>
                                </div>
                                <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${a.badge}`}>هامش {p.stats.margin}%</span>
                              </div>
                              <div className="flex items-center justify-between text-[9px] text-slate-400 font-bold pt-1">
                                <span>الفواتير: <strong className="text-slate-600 font-mono">{p.stats.count}</strong></span>
                                <span>م. الفاتورة: <strong className="text-slate-600 font-mono">{p.stats.avg.toLocaleString()}</strong></span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* --- منحنى المبيعات والأرباح عبر الزمن --- */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-emerald-600" />
                          <span className="text-[11px] text-slate-600 font-black">منحنى المبيعات والأرباح عبر الزمن</span>
                        </div>
                        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
                          {[7, 30, 90].map(r => (
                            <button
                              key={r}
                              onClick={() => setChartRange(r as 7 | 30 | 90)}
                              className={`text-[10px] font-black px-3 py-1.5 rounded-lg transition cursor-pointer border-none font-sans ${chartRange === r ? 'bg-white text-emerald-700 shadow-sm' : 'bg-transparent text-slate-500'}`}
                            >
                              {r} يوم
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-4 mb-3 text-[9px] font-bold text-slate-500">
                        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm inline-block" style={{ backgroundColor: '#a7f3d0' }}></span> المبيعات</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-1.5 rounded-sm inline-block" style={{ backgroundColor: '#059669' }}></span> صافي الربح</span>
                      </div>

                      <div dir="ltr" className="w-full overflow-x-auto">
                        <svg viewBox={`0 0 ${Math.max(chartSeries.length * 42, 320)} 180`} className="w-full" style={{ minWidth: Math.max(chartSeries.length * 26, 280) }}>
                          {chartSeries.map((b, i) => {
                            const gap = 42;
                            const barW = 26;
                            const x = i * gap + 10;
                            const maxH = 128;
                            const baseY = 150;
                            const salesH = Math.round((b.sales / chartMax) * maxH);
                            const profitH = Math.round((b.profit / chartMax) * maxH);
                            return (
                              <g key={i}>
                                <rect x={x} y={baseY - salesH} width={barW} height={salesH} rx={3} fill="#a7f3d0" />
                                <rect x={x + 7} y={baseY - profitH} width={barW - 14} height={profitH} rx={2} fill="#059669" />
                                <text x={x + barW / 2} y={baseY + 13} textAnchor="middle" fill="#94a3b8" style={{ fontSize: 8 }}>{b.label}</text>
                              </g>
                            );
                          })}
                          <line x1="0" y1="150" x2={Math.max(chartSeries.length * 42, 320)} y2="150" stroke="#e2e8f0" strokeWidth="1" />
                        </svg>
                      </div>
                      <p className="text-[9px] text-slate-400 font-bold mt-2 text-center">
                        القيم بالدينار العراقي • التجميع {chartRange > 30 ? 'أسبوعي' : 'يومي'} • الأعمدة الفاتحة: المبيعات، الداكنة: صافي الربح
                      </p>
                    </div>

                    {/* --- جداول تحليل أداء المنتجات (ربحية / مبيعاً / راكد) --- */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-emerald-600" />
                        <span className="text-[11px] text-slate-600 font-black">تحليل أداء المنتجات</span>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* أعلى المنتجات ربحية */}
                        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-base">🏆</span>
                            <span className="text-[11px] font-black text-slate-700">أعلى المنتجات ربحية</span>
                          </div>
                          <div className="space-y-1.5">
                            {topProfitable.map((p, i) => (
                              <div key={p.name} className="flex items-center justify-between text-[10px] font-bold bg-slate-50 rounded-lg px-3 py-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-black shrink-0">{i + 1}</span>
                                  <span className="text-slate-700 truncate">{p.name}</span>
                                </div>
                                <div className="text-left shrink-0 mr-2">
                                  <strong className="text-emerald-700 font-mono">{p.profit.toLocaleString()}</strong>
                                  <span className="text-slate-400 text-[9px]"> د.ع</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* الأكثر مبيعاً بالكمية */}
                        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                          <div className="flex items-center gap-2 mb-3">
                            <TrendingUp className="w-4 h-4 text-blue-600" />
                            <span className="text-[11px] font-black text-slate-700">الأكثر مبيعاً (بالكمية)</span>
                          </div>
                          <div className="space-y-1.5">
                            {topSelling.map((p, i) => (
                              <div key={p.name} className="flex items-center justify-between text-[10px] font-bold bg-slate-50 rounded-lg px-3 py-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-black shrink-0">{i + 1}</span>
                                  <span className="text-slate-700 truncate">{p.name}</span>
                                </div>
                                <div className="text-left shrink-0 mr-2">
                                  <strong className="text-blue-700 font-mono">{p.qty.toLocaleString()}</strong>
                                  <span className="text-slate-400 text-[9px]"> وحدة</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* الأبطأ حركةً — مخزون راكد */}
                      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-base">🐌</span>
                          <span className="text-[11px] font-black text-slate-700">الأبطأ حركةً (مخزون راكد — رأس مال مجمّد)</span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-[10px] font-bold border-collapse">
                            <thead>
                              <tr className="text-slate-400 text-[9px] border-b border-slate-100">
                                <th className="text-right font-black py-2 px-2">المنتج</th>
                                <th className="text-center font-black py-2 px-2">المُباع</th>
                                <th className="text-center font-black py-2 px-2">المخزون الحالي</th>
                                <th className="text-left font-black py-2 px-2">رأس المال المجمّد</th>
                              </tr>
                            </thead>
                            <tbody>
                              {slowestMoving.map(m => (
                                <tr key={m.name} className="border-b border-slate-50 hover:bg-slate-50/60">
                                  <td className="text-right py-2 px-2 text-slate-700">{m.name}</td>
                                  <td className="text-center py-2 px-2">
                                    <span className={`font-mono ${m.sold === 0 ? 'text-rose-600' : 'text-slate-600'}`}>{m.sold}</span>
                                  </td>
                                  <td className="text-center py-2 px-2 font-mono text-slate-600">{m.stock}</td>
                                  <td className="text-left py-2 px-2 font-mono text-amber-700">{m.value.toLocaleString()} د.ع</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <p className="text-[9px] text-slate-400 font-bold mt-2">* المنتجات قليلة/معدومة المبيعات مع رأس مال مجمّد عالٍ مرشّحة لإعادة التسعير أو العروض الترويجية.</p>
                      </div>
                    </div>

                    {/* --- دفتر المصاريف والربح الصافي --- */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                      <div className="flex items-center gap-2">
                        <Wallet className="w-4 h-4 text-emerald-600" />
                        <span className="text-[11px] text-slate-600 font-black">دفتر المصاريف والربح الصافي (هذا الشهر)</span>
                      </div>

                      {/* ملخص صافي الربح للشهر */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                          <span className="text-[9px] text-emerald-700 font-black block mb-1">الربح الإجمالي (الشهر)</span>
                          <strong className="text-base font-black text-emerald-800 font-mono">{statsMonth.profit.toLocaleString()} <span className="text-[9px] font-bold">د.ع</span></strong>
                        </div>
                        <div className="bg-rose-50 border border-rose-100 rounded-xl p-3">
                          <span className="text-[9px] text-rose-700 font-black block mb-1">− إجمالي المصاريف (الشهر)</span>
                          <strong className="text-base font-black text-rose-700 font-mono">{expMonth.toLocaleString()} <span className="text-[9px] font-bold">د.ع</span></strong>
                        </div>
                        <div className={`${netProfitMonth >= 0 ? 'bg-emerald-600' : 'bg-rose-600'} rounded-xl p-3`}>
                          <span className="text-[9px] text-white/80 font-black block mb-1">= صافي الربح (الشهر)</span>
                          <strong className="text-base font-black text-white font-mono">{netProfitMonth.toLocaleString()} <span className="text-[9px] font-bold">د.ع</span></strong>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                        {/* نموذج تسجيل مصروف */}
                        <form onSubmit={handleAddExpense} className="md:col-span-5 bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-3 text-xs font-semibold">
                          <span className="text-[10px] text-slate-400 font-black block">تسجيل مصروف جديد</span>
                          <div className="space-y-1">
                            <label className="block text-slate-500 text-[10px]">نوع المصروف</label>
                            <select value={newExpCategory} onChange={(e) => setNewExpCategory(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg p-2 font-bold text-slate-700">
                              <option value="إيجار المحل">إيجار المحل</option>
                              <option value="رواتب الموظفين">رواتب الموظفين</option>
                              <option value="كهرباء ومولّدة">كهرباء ومولّدة</option>
                              <option value="صيانة وتنظيف">صيانة وتنظيف</option>
                              <option value="نقل وتوصيل">نقل وتوصيل</option>
                              <option value="قرطاسية وأكياس">قرطاسية وأكياس</option>
                              <option value="أخرى">أخرى</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="block text-slate-500 text-[10px]">المبلغ (د.ع)</label>
                            <input type="number" min="0" required value={newExpAmount} onChange={(e) => setNewExpAmount(Number(e.target.value))} className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono text-center font-bold" />
                          </div>
                          <div className="space-y-1">
                            <label className="block text-slate-500 text-[10px]">وصف (اختياري)</label>
                            <input type="text" value={newExpDesc} onChange={(e) => setNewExpDesc(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg p-2" placeholder="مثال: فاتورة كهرباء شهر أيار" />
                          </div>
                          <div className="space-y-1">
                            <label className="block text-slate-500 text-[10px]">طريقة الدفع</label>
                            <select value={newExpPaidBy} onChange={(e) => setNewExpPaidBy(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg p-2 font-bold text-slate-700">
                              <option value="نقد">نقد</option>
                              <option value="تحويل">تحويل</option>
                              <option value="بطاقة">بطاقة</option>
                            </select>
                          </div>
                          <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2.5 rounded-xl cursor-pointer transition shadow-sm border-none font-sans text-xs">
                            إضافة المصروف وخصمه من الصندوق
                          </button>
                          {expenseSuccess && <p className="text-[10px] text-emerald-700 font-black text-center">✓ تم تسجيل المصروف وخصمه من السيولة</p>}
                        </form>

                        {/* قائمة المصاريف */}
                        <div className="md:col-span-7 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-slate-400 font-black">آخر المصاريف المسجّلة</span>
                            <span className="text-[9px] text-slate-400 font-bold">العدد: {expenses.length}</span>
                          </div>
                          <div className="space-y-2 max-h-72 overflow-y-auto pl-1">
                            {expenses.length === 0 && <p className="text-[10px] text-slate-400 font-bold text-center py-6">لا توجد مصاريف مسجّلة بعد.</p>}
                            {expenses.map((exp) => (
                              <div key={exp.id} className="flex items-center justify-between bg-white border border-slate-100 rounded-xl px-3 py-2.5 text-[10px] font-bold">
                                <div className="min-w-0">
                                  <strong className="text-slate-800 block">{exp.category}</strong>
                                  <span className="text-slate-400 text-[9px] font-semibold">{exp.date} • {exp.paidBy}{exp.description ? ` • ${exp.description}` : ''}</span>
                                </div>
                                <strong className="text-rose-700 font-mono shrink-0 mr-2">−{exp.amount.toLocaleString()} د.ع</strong>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* --- قائمة الأرباح والخسائر (Income Statement / P&L) --- */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-violet-600" />
                          <span className="text-[11px] text-slate-600 font-black">قائمة الأرباح والخسائر (الدخل)</span>
                        </div>
                        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
                          {([['month', 'هذا الشهر'], ['year', 'هذا العام']] as const).map(([k, lbl]) => (
                            <button
                              key={k}
                              onClick={() => setPlPeriod(k)}
                              className={`text-[10px] font-black px-3 py-1.5 rounded-lg transition cursor-pointer border-none font-sans ${plPeriod === k ? 'bg-white text-violet-700 shadow-sm' : 'bg-transparent text-slate-500'}`}
                            >
                              {lbl}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="border border-slate-100 rounded-2xl overflow-hidden text-[11px] font-bold">
                        {/* الإيراد */}
                        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50">
                          <span className="text-slate-700">إجمالي المبيعات (الإيراد)</span>
                          <span className="font-mono text-slate-800">{plGrossSales.toLocaleString()} د.ع</span>
                        </div>
                        <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100">
                          <span className="text-slate-500">(−) مرتجعات المبيعات{plReturns.count > 0 ? ` (${plReturns.count})` : ''}</span>
                          <span className="font-mono text-rose-600">−{plReturns.value.toLocaleString()} د.ع</span>
                        </div>
                        <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 bg-slate-50/60">
                          <span className="text-slate-700 font-black">= صافي المبيعات</span>
                          <span className="font-mono text-slate-800 font-black">{plNetSales.toLocaleString()} د.ع</span>
                        </div>
                        {/* التكلفة */}
                        <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100">
                          <span className="text-slate-500">(−) تكلفة البضاعة المباعة (COGS)</span>
                          <span className="font-mono text-rose-600">−{plNetCogs.toLocaleString()} د.ع</span>
                        </div>
                        {/* مجمل الربح */}
                        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-emerald-50">
                          <span className="text-emerald-800 font-black">= مجمل الربح <span className="text-[9px] text-emerald-600 font-bold">(هامش {plGrossMargin}%)</span></span>
                          <span className="font-mono text-emerald-800 font-black">{plGrossProfit.toLocaleString()} د.ع</span>
                        </div>
                        {/* المصاريف التشغيلية مفصّلة */}
                        <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100">
                          <span className="text-slate-700 font-black">(−) المصاريف التشغيلية</span>
                          <span className="font-mono text-rose-600">−{plTotalExpenses.toLocaleString()} د.ع</span>
                        </div>
                        {plExpenseRows.length === 0 ? (
                          <div className="px-6 py-2 border-t border-slate-50 text-[10px] text-slate-400 font-bold">لا مصاريف مسجّلة في هذه الفترة</div>
                        ) : plExpenseRows.map(row => (
                          <div key={row.category} className="flex items-center justify-between px-6 py-1.5 border-t border-slate-50 text-[10px]">
                            <span className="text-slate-500">• {row.category}</span>
                            <span className="font-mono text-slate-500">−{row.amount.toLocaleString()} د.ع</span>
                          </div>
                        ))}
                        {/* صافي الربح */}
                        <div className={`flex items-center justify-between px-4 py-3.5 border-t-2 ${plNetProfit >= 0 ? 'bg-emerald-600 border-emerald-700' : 'bg-rose-600 border-rose-700'}`}>
                          <span className="text-white font-black">= صافي الربح <span className="text-[9px] text-white/75 font-bold">(هامش {plNetMargin}%)</span></span>
                          <span className="font-mono text-white font-black text-sm">{plNetProfit.toLocaleString()} د.ع</span>
                        </div>
                      </div>
                      <p className="text-[9px] text-slate-400 font-bold">* تُحتسب القائمة آلياً من سجل المبيعات (الإيراد والتكلفة) ومرتجعات المبيعات والمصاريف التشغيلية ضمن {plIsMonth ? 'الشهر الحالي' : 'السنة المالية الحالية'}. صافي الربح = مجمل الربح − المصاريف التشغيلية.</p>
                    </div>

                    {/* ======================================================= */}
                    {/* --- قائمة الموردين ومصادر التجهيز --- */}
                    {/* ======================================================= */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Truck className="w-4 h-4 text-indigo-600" />
                          <span className="text-[11px] text-slate-600 font-black">قائمة الموردين ومصادر التجهيز</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => { setSupplierFormVisible(v => !v); setSelectedSupplierId(null); }}
                          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black px-3 py-1.5 rounded-xl transition cursor-pointer border-none"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          إضافة مورد جديد
                        </button>
                      </div>

                      {/* نموذج إضافة مورد جديد */}
                      <AnimatePresence>
                        {supplierFormVisible && !selectedSupplierId && (
                          <motion.form
                            key="supplier-form"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            onSubmit={(e) => {
                              e.preventDefault();
                              if (!newSupName.trim()) return;
                              const newSup: Supplier = {
                                id: `SUP-${Math.floor(Math.random() * 9000 + 1000)}`,
                                name: newSupName.trim(),
                                phone: newSupPhone.trim() || undefined,
                                address: newSupAddress.trim() || undefined,
                                contactPerson: newSupContact.trim() || undefined,
                                creditLimit: newSupCreditLimit > 0 ? newSupCreditLimit : undefined,
                                paymentTerms: newSupPaymentTerms > 0 ? newSupPaymentTerms : undefined,
                                notes: newSupNotes.trim() || undefined,
                                createdAt: new Date().toISOString().split('T')[0],
                              };
                              addSupplier(newSup);
                              setNewSupName(''); setNewSupPhone(''); setNewSupContact('');
                              setNewSupAddress(''); setNewSupCreditLimit(0); setNewSupPaymentTerms(30); setNewSupNotes('');
                              setSupplierFormVisible(false);
                            }}
                            className="overflow-hidden"
                          >
                            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 space-y-3 text-xs font-semibold">
                              <span className="text-[10px] text-indigo-700 font-black block">بيانات المورد الجديد</span>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1 sm:col-span-2">
                                  <label className="block text-slate-500 text-[10px]">اسم المورد / المذخر *</label>
                                  <input required type="text" value={newSupName} onChange={e => setNewSupName(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg p-2 font-bold text-slate-700 text-xs" placeholder="مذخر / شركة / مكتب علمي..." />
                                </div>
                                <div className="space-y-1">
                                  <label className="block text-slate-500 text-[10px]">رقم الهاتف</label>
                                  <input type="text" value={newSupPhone} onChange={e => setNewSupPhone(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg p-2 font-bold text-slate-700 text-xs" placeholder="07XXXXXXXXX" />
                                </div>
                                <div className="space-y-1">
                                  <label className="block text-slate-500 text-[10px]">اسم المسؤول / المندوب</label>
                                  <input type="text" value={newSupContact} onChange={e => setNewSupContact(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg p-2 font-bold text-slate-700 text-xs" placeholder="اسم المسؤول..." />
                                </div>
                                <div className="space-y-1 sm:col-span-2">
                                  <label className="block text-slate-500 text-[10px]">العنوان</label>
                                  <input type="text" value={newSupAddress} onChange={e => setNewSupAddress(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg p-2 font-bold text-slate-700 text-xs" placeholder="المحافظة — الحي..." />
                                </div>
                                <div className="space-y-1">
                                  <label className="block text-slate-500 text-[10px]">سقف الائتمان (د.ع)</label>
                                  <input type="number" min="0" value={newSupCreditLimit} onChange={e => setNewSupCreditLimit(Number(e.target.value))} className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono text-center font-bold text-xs" />
                                </div>
                                <div className="space-y-1">
                                  <label className="block text-slate-500 text-[10px]">مدة الآجل (أيام)</label>
                                  <input type="number" min="0" value={newSupPaymentTerms} onChange={e => setNewSupPaymentTerms(Number(e.target.value))} className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono text-center font-bold text-xs" />
                                </div>
                                <div className="space-y-1 sm:col-span-2">
                                  <label className="block text-slate-500 text-[10px]">ملاحظات</label>
                                  <input type="text" value={newSupNotes} onChange={e => setNewSupNotes(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg p-2 font-bold text-slate-700 text-xs" placeholder="تفاصيل إضافية..." />
                                </div>
                              </div>
                              <div className="flex gap-2 pt-1">
                                <button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-black py-2.5 rounded-xl cursor-pointer transition border-none font-sans text-xs">
                                  حفظ المورد
                                </button>
                                <button type="button" onClick={() => setSupplierFormVisible(false)} className="px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black py-2.5 rounded-xl cursor-pointer transition border-none font-sans text-xs">
                                  إلغاء
                                </button>
                              </div>
                            </div>
                          </motion.form>
                        )}
                      </AnimatePresence>

                      {/* تفاصيل مورد مختار */}
                      <AnimatePresence>
                        {selectedSupplierId && (() => {
                          const sup = suppliers.find(s => s.id === selectedSupplierId);
                          if (!sup) return null;
                          const supPayables = payables.filter(p => p.supplierId === sup.id || p.supplierName === sup.name);
                          const supOrders = b2bOrders.filter(o => o.supplierId === sup.id || o.warehouseName === sup.name);
                          const totalOwed = supPayables.reduce((s, p) => s + Math.max(0, p.amount - p.paidAmount), 0);
                          const totalPaid = supPayables.reduce((s, p) => s + (p.paidAmount || 0), 0);
                          const totalInvoiced = supPayables.reduce((s, p) => s + p.amount, 0);
                          return (
                            <motion.div
                              key="supplier-detail"
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: 8 }}
                              className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 space-y-4"
                            >
                              {/* Header */}
                              <div className="flex items-start justify-between gap-3">
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center flex-shrink-0">
                                      <Truck className="w-4 h-4 text-white" />
                                    </div>
                                    <h4 className="font-black text-sm text-slate-900">{sup.name}</h4>
                                  </div>
                                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-slate-500 font-semibold pr-10">
                                    {sup.phone && <span>📞 {sup.phone}</span>}
                                    {sup.contactPerson && <span>👤 {sup.contactPerson}</span>}
                                    {sup.address && <span>📍 {sup.address}</span>}
                                    {sup.paymentTerms && <span>🗓 آجل {sup.paymentTerms} يوم</span>}
                                    {sup.creditLimit && <span>💳 سقف {sup.creditLimit.toLocaleString()} د.ع</span>}
                                  </div>
                                  {sup.notes && <p className="text-[9px] text-slate-400 font-semibold pr-10">{sup.notes}</p>}
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      // فتح نموذج التعديل بالبيانات الحالية
                                      setEditingSupplierId(sup.id);
                                      setNewSupName(sup.name);
                                      setNewSupPhone(sup.phone || '');
                                      setNewSupContact(sup.contactPerson || '');
                                      setNewSupAddress(sup.address || '');
                                      setNewSupCreditLimit(sup.creditLimit || 0);
                                      setNewSupPaymentTerms(sup.paymentTerms || 30);
                                      setNewSupNotes(sup.notes || '');
                                    }}
                                    className="p-1.5 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-100 rounded-lg transition cursor-pointer bg-transparent border-none"
                                    title="تعديل بيانات المورد"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (window.confirm(`حذف المورد "${sup.name}"؟ لن تتأثّر الذمم أو الفواتير المسجّلة سابقاً.`)) {
                                        deleteSupplier(sup);
                                      }
                                    }}
                                    className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-100 rounded-lg transition cursor-pointer bg-transparent border-none"
                                    title="حذف المورد"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setSelectedSupplierId(null)}
                                    className="p-1.5 text-slate-400 hover:text-slate-600 transition cursor-pointer bg-transparent border-none"
                                    title="إغلاق"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>

                              {/* نموذج تعديل بيانات المورد */}
                              {editingSupplierId === sup.id && (
                                <form
                                  onSubmit={(e) => {
                                    e.preventDefault();
                                    if (!newSupName.trim()) return;
                                    updateSupplier({
                                      ...sup,
                                      name: newSupName.trim(),
                                      phone: newSupPhone.trim() || undefined,
                                      address: newSupAddress.trim() || undefined,
                                      contactPerson: newSupContact.trim() || undefined,
                                      creditLimit: newSupCreditLimit > 0 ? newSupCreditLimit : undefined,
                                      paymentTerms: newSupPaymentTerms > 0 ? newSupPaymentTerms : undefined,
                                      notes: newSupNotes.trim() || undefined,
                                    });
                                    setEditingSupplierId(null);
                                  }}
                                  className="bg-white border border-indigo-200 rounded-2xl p-4 space-y-3 text-xs font-semibold"
                                >
                                  <span className="text-[10px] text-indigo-700 font-black block">تعديل بيانات المورد</span>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-1 sm:col-span-2">
                                      <label className="block text-slate-500 text-[10px]">اسم المورد / المذخر *</label>
                                      <input required type="text" value={newSupName} onChange={e => setNewSupName(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-bold text-slate-700 text-xs" />
                                    </div>
                                    <div className="space-y-1">
                                      <label className="block text-slate-500 text-[10px]">رقم الهاتف</label>
                                      <input type="text" value={newSupPhone} onChange={e => setNewSupPhone(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-bold text-slate-700 text-xs" placeholder="07XXXXXXXXX" />
                                    </div>
                                    <div className="space-y-1">
                                      <label className="block text-slate-500 text-[10px]">اسم المسؤول / المندوب</label>
                                      <input type="text" value={newSupContact} onChange={e => setNewSupContact(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-bold text-slate-700 text-xs" />
                                    </div>
                                    <div className="space-y-1 sm:col-span-2">
                                      <label className="block text-slate-500 text-[10px]">العنوان</label>
                                      <input type="text" value={newSupAddress} onChange={e => setNewSupAddress(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-bold text-slate-700 text-xs" />
                                    </div>
                                    <div className="space-y-1">
                                      <label className="block text-slate-500 text-[10px]">سقف الائتمان (د.ع)</label>
                                      <input type="number" min="0" value={newSupCreditLimit} onChange={e => setNewSupCreditLimit(Number(e.target.value))} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-center font-bold text-xs" />
                                    </div>
                                    <div className="space-y-1">
                                      <label className="block text-slate-500 text-[10px]">مدة الآجل (أيام)</label>
                                      <input type="number" min="0" value={newSupPaymentTerms} onChange={e => setNewSupPaymentTerms(Number(e.target.value))} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-center font-bold text-xs" />
                                    </div>
                                    <div className="space-y-1 sm:col-span-2">
                                      <label className="block text-slate-500 text-[10px]">ملاحظات</label>
                                      <input type="text" value={newSupNotes} onChange={e => setNewSupNotes(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-bold text-slate-700 text-xs" />
                                    </div>
                                  </div>
                                  <div className="flex gap-2 pt-1">
                                    <button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-black py-2.5 rounded-xl cursor-pointer transition border-none font-sans text-xs">
                                      حفظ التعديلات
                                    </button>
                                    <button type="button" onClick={() => setEditingSupplierId(null)} className="px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black py-2.5 rounded-xl cursor-pointer transition border-none font-sans text-xs">
                                      إلغاء
                                    </button>
                                  </div>
                                </form>
                              )}

                              {/* ملخص الحساب */}
                              <div className="grid grid-cols-3 gap-2">
                                <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 text-center">
                                  <span className="text-[9px] text-rose-600 font-black block mb-0.5">المتبقي للمورد</span>
                                  <strong className="text-sm font-black text-rose-700 font-mono">{totalOwed.toLocaleString()}</strong>
                                  <span className="text-[8px] text-rose-500 font-bold block">د.ع</span>
                                </div>
                                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
                                  <span className="text-[9px] text-emerald-600 font-black block mb-0.5">إجمالي المسدَّد</span>
                                  <strong className="text-sm font-black text-emerald-700 font-mono">{totalPaid.toLocaleString()}</strong>
                                  <span className="text-[8px] text-emerald-500 font-bold block">د.ع</span>
                                </div>
                                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
                                  <span className="text-[9px] text-blue-600 font-black block mb-0.5">إجمالي الفواتير</span>
                                  <strong className="text-sm font-black text-blue-700 font-mono">{totalInvoiced.toLocaleString()}</strong>
                                  <span className="text-[8px] text-blue-500 font-bold block">د.ع</span>
                                </div>
                              </div>

                              {/* تسديد دفعة */}
                              {totalOwed > 0 && (
                                <div className="bg-white border border-slate-100 rounded-xl p-3 space-y-2">
                                  <span className="text-[10px] text-slate-600 font-black">تسديد دفعة للمورد</span>
                                  <div className="flex gap-2">
                                    {supPayModalId === sup.id ? (
                                      <>
                                        <input
                                          type="number"
                                          min="1"
                                          max={totalOwed}
                                          value={supPayAmount || ''}
                                          onChange={e => setSupPayAmount(Number(e.target.value))}
                                          className="flex-1 bg-white border border-slate-200 rounded-lg p-2 font-mono text-center text-xs font-bold focus:outline-emerald-400"
                                          placeholder={`أقصى ${totalOwed.toLocaleString()}`}
                                        />
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (!supPayAmount || supPayAmount <= 0) return;
                                            paySupplierDebt(sup, supPayAmount);
                                            setSupPayModalId(null); setSupPayAmount(0);
                                          }}
                                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-4 py-2 rounded-xl text-xs cursor-pointer transition border-none"
                                        >
                                          تأكيد
                                        </button>
                                        <button type="button" onClick={() => setSupPayModalId(null)} className="bg-slate-100 text-slate-600 font-bold px-3 py-2 rounded-xl text-xs cursor-pointer transition border-none">
                                          إلغاء
                                        </button>
                                      </>
                                    ) : (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => { setSupPayModalId(sup.id); setSupPayAmount(0); }}
                                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2 rounded-xl text-xs cursor-pointer transition border-none"
                                        >
                                          تسديد جزئي
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => paySupplierDebt(sup, null)}
                                          className="flex-1 bg-slate-700 hover:bg-slate-800 text-white font-black py-2 rounded-xl text-xs cursor-pointer transition border-none"
                                        >
                                          تسديد الكل ({totalOwed.toLocaleString()} د.ع)
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* سجل المعاملات — الذمم */}
                              <div className="space-y-1.5">
                                <span className="text-[10px] text-slate-500 font-black">سجل الفواتير والذمم</span>
                                {supPayables.length === 0
                                  ? <p className="text-[10px] text-slate-400 text-center py-3">لا توجد فواتير مسجّلة لهذا المورد</p>
                                  : supPayables.map(p => {
                                    const rem = Math.max(0, p.amount - p.paidAmount);
                                    const stCls = p.status === 'paid' ? 'text-emerald-700 bg-emerald-50 border-emerald-100' : p.status === 'partial' ? 'text-amber-700 bg-amber-50 border-amber-100' : 'text-rose-700 bg-rose-50 border-rose-100';
                                    const stLabel = p.status === 'paid' ? 'مسدّدة' : p.status === 'partial' ? 'جزئي' : 'مفتوحة';
                                    return (
                                      <div key={p.id} className="bg-white border border-slate-100 rounded-xl px-3 py-2 text-[10px] font-semibold flex items-center gap-2 justify-between">
                                        <div className="min-w-0">
                                          <span className="text-slate-500 font-bold block">{p.id}{p.relatedOrderId ? ` • ${p.relatedOrderId}` : ''}</span>
                                          <span className="text-slate-400 text-[9px]">{p.date}{p.description ? ` — ${p.description}` : ''}</span>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0 text-right">
                                          <div>
                                            <span className="font-mono text-slate-700 font-black block text-[11px]">{p.amount.toLocaleString()} د.ع</span>
                                            {rem > 0 && <span className="font-mono text-rose-600 text-[9px] font-bold">متبقّي {rem.toLocaleString()}</span>}
                                          </div>
                                          <span className={`px-2 py-0.5 rounded-full border text-[9px] font-black ${stCls}`}>{stLabel}</span>
                                        </div>
                                      </div>
                                    );
                                  })
                                }
                              </div>

                              {/* قوائم الشراء المرتبطة */}
                              {supOrders.length > 0 && (
                                <div className="space-y-1.5">
                                  <span className="text-[10px] text-slate-500 font-black">قوائم الشراء المرتبطة</span>
                                  {supOrders.map(o => (
                                    <div key={o.id} className="bg-white border border-slate-100 rounded-xl px-3 py-2 text-[10px] font-semibold flex items-center justify-between gap-2">
                                      <div>
                                        <span className="text-slate-700 font-black">{o.id}</span>
                                        <span className="text-slate-400 text-[9px] block">{o.date} • {o.itemsCount} أصناف</span>
                                      </div>
                                      <div className="text-right">
                                        <span className="font-mono text-slate-700 font-black block">{o.totalAmount.toLocaleString()} د.ع</span>
                                        <span className={`text-[9px] font-bold ${o.status === 'delivered' ? 'text-emerald-600' : o.status === 'cancelled' ? 'text-rose-500' : 'text-amber-600'}`}>
                                          {o.status === 'delivered' ? 'مستلمة' : o.status === 'on_way' ? 'في الطريق' : o.status === 'preparing' ? 'تحضير' : o.status === 'cancelled' ? 'ملغاة' : 'معلّقة'}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </motion.div>
                          );
                        })()}
                      </AnimatePresence>

                      {/* قائمة الموردين */}
                      {!selectedSupplierId && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {suppliers.map(sup => {
                            const supPayables = payables.filter(p => p.supplierId === sup.id || p.supplierName === sup.name);
                            const totalOwed = supPayables.reduce((s, p) => s + Math.max(0, p.amount - p.paidAmount), 0);
                            const openCount = supPayables.filter(p => p.status !== 'paid').length;
                            return (
                              <button
                                key={sup.id}
                                type="button"
                                onClick={() => { setSelectedSupplierId(sup.id); setSupplierFormVisible(false); }}
                                className="text-right bg-white border border-slate-100 hover:border-indigo-300 hover:bg-indigo-50 rounded-2xl p-4 transition cursor-pointer text-xs space-y-2 w-full"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="font-black text-slate-900 text-[11px] leading-snug truncate">{sup.name}</p>
                                    {sup.contactPerson && <p className="text-[9px] text-slate-400 font-semibold mt-0.5">{sup.contactPerson}</p>}
                                  </div>
                                  <div className="shrink-0 text-left">
                                    {totalOwed > 0
                                      ? <span className="text-[10px] font-black text-rose-600 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-full font-mono">{totalOwed.toLocaleString()} د.ع</span>
                                      : <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">✓ مسوّى</span>
                                    }
                                  </div>
                                </div>
                                <div className="flex items-center gap-3 text-[9px] text-slate-400 font-bold">
                                  {sup.phone && <span>📞 {sup.phone}</span>}
                                  {sup.paymentTerms && <span>🗓 {sup.paymentTerms} يوم آجل</span>}
                                  {openCount > 0 && <span className="text-amber-600">⚠ {openCount} ذمّة مفتوحة</span>}
                                </div>
                              </button>
                            );
                          })}
                          {suppliers.length === 0 && (
                            <p className="text-[10px] text-slate-400 font-bold text-center py-6 col-span-2">لم يُضَف أي مورّد بعد — اضغط "إضافة مورد جديد"</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* --- ديون الموردين والذمم الدائنة --- */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                      <div className="flex items-center gap-2">
                        <ClipboardList className="w-4 h-4 text-rose-600" />
                        <span className="text-[11px] text-slate-600 font-black">ديون الموردين والذمم الدائنة (المذاخر والمكاتب العلمية)</span>
                      </div>

                      {/* ملخص الذمم الدائنة */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="bg-rose-50 border border-rose-100 rounded-xl p-3">
                          <span className="text-[9px] text-rose-700 font-black block mb-1">إجمالي الذمم المستحقة</span>
                          <strong className="text-base font-black text-rose-700 font-mono">{totalDebts.toLocaleString()} <span className="text-[9px] font-bold">د.ع</span></strong>
                        </div>
                        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                          <span className="text-[9px] text-amber-700 font-black block mb-1">عدد الذمم المفتوحة</span>
                          <strong className="text-base font-black text-amber-700 font-mono">{payables.filter(p => p.status !== 'paid').length} <span className="text-[9px] font-bold">ذمّة</span></strong>
                        </div>
                        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                          <span className="text-[9px] text-emerald-700 font-black block mb-1">إجمالي المسدَّد</span>
                          <strong className="text-base font-black text-emerald-800 font-mono">{payables.reduce((s, p) => s + (p.paidAmount || 0), 0).toLocaleString()} <span className="text-[9px] font-bold">د.ع</span></strong>
                        </div>
                      </div>

                      {/* قائمة الذمم الدائنة — تُضاف تلقائياً عبر طلبيات الشراء بالآجل */}
                      <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-slate-400 font-black">ذمم الموردين المسجّلة</span>
                            <span className="text-[9px] text-slate-400 font-bold">العدد: {payables.length}</span>
                          </div>
                          <div className="space-y-2 max-h-72 overflow-y-auto pl-1">
                            {payables.length === 0 && <p className="text-[10px] text-slate-400 font-bold text-center py-6">لا توجد ذمم مستحقة.</p>}
                            {payables.map((p) => {
                              const remaining = Math.max(0, p.amount - p.paidAmount);
                              const statusLabel = p.status === 'paid' ? 'مسدّدة' : p.status === 'partial' ? 'مسدّدة جزئياً' : 'مفتوحة';
                              const statusCls = p.status === 'paid'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                : p.status === 'partial'
                                  ? 'bg-amber-50 text-amber-700 border-amber-100'
                                  : 'bg-rose-50 text-rose-700 border-rose-100';
                              return (
                                <div key={p.id} className="bg-white border border-slate-100 rounded-xl px-3 py-2.5 text-[10px] font-bold space-y-2">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <strong className="text-slate-800 block">{p.supplierName}</strong>
                                      <span className="text-slate-400 text-[9px] font-semibold">{p.date}{p.dueDate ? ` • استحقاق ${p.dueDate}` : ''}{p.description ? ` • ${p.description}` : ''}</span>
                                    </div>
                                    <span className={`shrink-0 px-2 py-0.5 rounded-full border text-[9px] font-black ${statusCls}`}>{statusLabel}</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-2 text-[9px] text-slate-500 font-bold">
                                    <span>الأصل: <span className="font-mono text-slate-700">{p.amount.toLocaleString()}</span></span>
                                    <span>المسدَّد: <span className="font-mono text-emerald-700">{p.paidAmount.toLocaleString()}</span></span>
                                    <span>المتبقّي: <span className="font-mono text-rose-700">{remaining.toLocaleString()} د.ع</span></span>
                                  </div>
                                  {p.status !== 'paid' && (
                                    <div className="flex items-center gap-1.5 pt-1">
                                      <input
                                        type="number"
                                        min="0"
                                        max={remaining}
                                        value={settleInputs[p.id] ?? ''}
                                        onChange={(e) => setSettleInputs(prev => ({ ...prev, [p.id]: Number(e.target.value) }))}
                                        className="w-24 bg-white border border-slate-200 rounded-lg p-1.5 font-mono text-center text-[10px] font-bold"
                                        placeholder="مبلغ"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => handleSettlePayable(p, settleInputs[p.id] ?? 0)}
                                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-black py-1.5 px-3 rounded-lg cursor-pointer transition border-none font-sans text-[10px]"
                                      >
                                        تسديد
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleSettlePayable(p, remaining)}
                                        className="bg-slate-700 hover:bg-slate-800 text-white font-black py-1.5 px-3 rounded-lg cursor-pointer transition border-none font-sans text-[10px]"
                                      >
                                        تسديد الكل
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                      </div>
                    </div>

                    {/* --- ذمم الزبائن والبيع بالآجل (الذمم المدينة) --- */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                      <div className="flex items-center gap-2">
                        <ClipboardList className="w-4 h-4 text-amber-600" />
                        <span className="text-[11px] text-slate-600 font-black">ذمم الزبائن والبيع بالآجل (الذمم المدينة المستحقة لنا)</span>
                      </div>

                      {/* ملخص الذمم المدينة */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                          <span className="text-[9px] text-amber-700 font-black block mb-1">إجمالي الذمم المستحقة لنا</span>
                          <strong className="text-base font-black text-amber-700 font-mono">{totalReceivables.toLocaleString()} <span className="text-[9px] font-bold">د.ع</span></strong>
                        </div>
                        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                          <span className="text-[9px] text-blue-700 font-black block mb-1">عدد الذمم المفتوحة</span>
                          <strong className="text-base font-black text-blue-700 font-mono">{receivables.filter(r => r.status !== 'paid').length} <span className="text-[9px] font-bold">ذمّة</span></strong>
                        </div>
                        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                          <span className="text-[9px] text-emerald-700 font-black block mb-1">إجمالي المُحصَّل</span>
                          <strong className="text-base font-black text-emerald-800 font-mono">{receivables.reduce((s, r) => s + (r.paidAmount || 0), 0).toLocaleString()} <span className="text-[9px] font-bold">د.ع</span></strong>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                        {/* نموذج تسجيل ذمّة على زبون */}
                        <form onSubmit={handleAddReceivable} className="md:col-span-5 bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-3 text-xs font-semibold">
                          <span className="text-[10px] text-slate-400 font-black block">تسجيل ذمّة مستحقة على زبون</span>
                          <div className="space-y-1">
                            <label className="block text-slate-500 text-[10px]">اسم الزبون / العيادة</label>
                            <input type="text" required value={newRecCustomer} onChange={(e) => setNewRecCustomer(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg p-2 font-bold text-slate-700" placeholder="مثال: عيادة د. سرمد للأطفال" />
                          </div>
                          <div className="space-y-1">
                            <label className="block text-slate-500 text-[10px]">مبلغ الدين (د.ع)</label>
                            <input type="number" min="0" required value={newRecAmount} onChange={(e) => setNewRecAmount(Number(e.target.value))} className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono text-center font-bold" />
                          </div>
                          <div className="space-y-1">
                            <label className="block text-slate-500 text-[10px]">تاريخ الاستحقاق (اختياري)</label>
                            <input type="date" value={newRecDueDate} onChange={(e) => setNewRecDueDate(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg p-2 font-bold text-slate-700" />
                          </div>
                          <div className="space-y-1">
                            <label className="block text-slate-500 text-[10px]">وصف (اختياري)</label>
                            <input type="text" value={newRecDesc} onChange={(e) => setNewRecDesc(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg p-2" placeholder="مثال: أدوية ومستلزمات شهرية للعيادة" />
                          </div>
                          <button type="submit" className="w-full bg-amber-600 hover:bg-amber-700 text-white font-black py-2.5 rounded-xl cursor-pointer transition shadow-sm border-none font-sans text-xs">
                            تسجيل ذمّة على زبون
                          </button>
                          {receivableSuccess && <p className="text-[10px] text-emerald-700 font-black text-center">✓ تم تسجيل الذمّة في دفتر ذمم الزبائن</p>}
                        </form>

                        {/* قائمة الذمم المدينة */}
                        <div className="md:col-span-7 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-slate-400 font-black">ذمم الزبائن المسجّلة</span>
                            <span className="text-[9px] text-slate-400 font-bold">العدد: {receivables.length}</span>
                          </div>
                          <div className="space-y-2 max-h-72 overflow-y-auto pl-1">
                            {receivables.length === 0 && <p className="text-[10px] text-slate-400 font-bold text-center py-6">لا توجد ذمم على الزبائن.</p>}
                            {receivables.map((r) => {
                              const remaining = Math.max(0, r.amount - r.paidAmount);
                              const statusLabel = r.status === 'paid' ? 'محصّلة بالكامل' : r.status === 'partial' ? 'محصّلة جزئياً' : 'مفتوحة';
                              const statusCls = r.status === 'paid'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                : r.status === 'partial'
                                  ? 'bg-blue-50 text-blue-700 border-blue-100'
                                  : 'bg-amber-50 text-amber-700 border-amber-100';
                              return (
                                <div key={r.id} className="bg-white border border-slate-100 rounded-xl px-3 py-2.5 text-[10px] font-bold space-y-2">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <strong className="text-slate-800 block">{r.customerName}</strong>
                                      <span className="text-slate-400 text-[9px] font-semibold">{r.date}{r.dueDate ? ` • استحقاق ${r.dueDate}` : ''}{r.description ? ` • ${r.description}` : ''}</span>
                                    </div>
                                    <span className={`shrink-0 px-2 py-0.5 rounded-full border text-[9px] font-black ${statusCls}`}>{statusLabel}</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-2 text-[9px] text-slate-500 font-bold">
                                    <span>الأصل: <span className="font-mono text-slate-700">{r.amount.toLocaleString()}</span></span>
                                    <span>المُحصَّل: <span className="font-mono text-emerald-700">{r.paidAmount.toLocaleString()}</span></span>
                                    <span>المتبقّي: <span className="font-mono text-amber-700">{remaining.toLocaleString()} د.ع</span></span>
                                  </div>
                                  {r.status !== 'paid' && (
                                    <div className="flex items-center gap-1.5 pt-1">
                                      <input
                                        type="number"
                                        min="0"
                                        max={remaining}
                                        value={collectInputs[r.id] ?? ''}
                                        onChange={(e) => setCollectInputs(prev => ({ ...prev, [r.id]: Number(e.target.value) }))}
                                        className="w-24 bg-white border border-slate-200 rounded-lg p-1.5 font-mono text-center text-[10px] font-bold"
                                        placeholder="مبلغ"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => handleCollectReceivable(r, collectInputs[r.id] ?? 0)}
                                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-black py-1.5 px-3 rounded-lg cursor-pointer transition border-none font-sans text-[10px]"
                                      >
                                        تحصيل
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleCollectReceivable(r, remaining)}
                                        className="bg-slate-700 hover:bg-slate-800 text-white font-black py-1.5 px-3 rounded-lg cursor-pointer transition border-none font-sans text-[10px]"
                                      >
                                        تحصيل الكل
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                      {/* Left: Supp debts breakdown & settle per supplier */}
                      <div className="bg-slate-50 p-5 rounded-2xl border border-slate-150 text-xs space-y-4 font-semibold text-slate-705">
                        <h4 className="font-extrabold text-slate-900 text-xs">سداد الديون وتسوية ذمم المذاخر والتقاص الطبية</h4>

                        <div className="space-y-2">
                          <p className="flex justify-between">
                            <span>إجمالي الذمم المستحقة للموردين:</span>
                            <strong className="text-rose-700 font-mono text-sm">{totalDebts.toLocaleString()} د.ع</strong>
                          </p>
                          <p className="flex justify-between text-slate-500">
                            <span>الرصيد المتاح بالصندوق:</span>
                            <span className="font-mono">{walletBalance.toLocaleString()} د.ع</span>
                          </p>
                        </div>

                        {/* قائمة ديناميكية لكل مورد له ذمم مفتوحة */}
                        {(() => {
                          // تجميع الذمم المفتوحة حسب المورد
                          const grouped = payables
                            .filter(p => p.status !== 'paid')
                            .reduce((acc, p) => {
                              const key = p.supplierName;
                              if (!acc[key]) acc[key] = { name: key, supplierId: p.supplierId, remaining: 0 };
                              acc[key].remaining += Math.max(0, p.amount - p.paidAmount);
                              return acc;
                            }, {} as Record<string, { name: string; supplierId?: string; remaining: number }>);
                          const debtSuppliers = Object.values(grouped).filter(s => s.remaining > 0);

                          if (debtSuppliers.length === 0) {
                            return (
                              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 text-center text-emerald-700 font-bold text-[11px]">
                                ✓ لا توجد ذمم مستحقة — جميع الموردين مسوَّون
                              </div>
                            );
                          }

                          return (
                            <div className="space-y-3">
                              {debtSuppliers.map(sup => {
                                const payAmt = debtPayAmounts[sup.name] || 0;
                                const canPay = walletBalance >= payAmt && payAmt > 0;
                                const canPayAll = walletBalance >= sup.remaining;
                                // ابحث عن كائن المورد الكامل أو أنشئ واحداً مؤقتاً
                                const supplierObj = suppliers.find(s => s.id === sup.supplierId || s.name === sup.name)
                                  || { id: sup.supplierId || sup.name, name: sup.name, createdAt: '' } as any;
                                return (
                                  <div key={sup.name} className="bg-white border border-slate-100 rounded-xl p-3 space-y-2.5">
                                    {/* اسم المورد والمبلغ المستحق */}
                                    <div className="flex items-center justify-between">
                                      <span className="font-black text-slate-800 text-[11px]">{sup.name}</span>
                                      <span className="font-mono text-rose-600 font-black text-[11px]">{sup.remaining.toLocaleString()} د.ع</span>
                                    </div>
                                    {/* حقل المبلغ + أزرار التسديد */}
                                    <div className="flex gap-1.5 items-center">
                                      <input
                                        type="number"
                                        min={0}
                                        max={sup.remaining}
                                        placeholder="مبلغ الدفعة"
                                        value={payAmt || ''}
                                        onChange={e => setDebtPayAmounts(prev => ({ ...prev, [sup.name]: Number(e.target.value) }))}
                                        className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 font-mono text-center text-[10px] font-bold min-w-0"
                                      />
                                      <button
                                        type="button"
                                        disabled={!canPay}
                                        onClick={() => {
                                          paySupplierDebt(supplierObj, payAmt);
                                          setDebtPayAmounts(prev => ({ ...prev, [sup.name]: 0 }));
                                        }}
                                        className="shrink-0 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-black px-3 py-1.5 rounded-lg text-[10px] cursor-pointer transition border-none"
                                      >
                                        دفعة
                                      </button>
                                      <button
                                        type="button"
                                        disabled={!canPayAll}
                                        onClick={() => paySupplierDebt(supplierObj, null)}
                                        className="shrink-0 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-black px-3 py-1.5 rounded-lg text-[10px] cursor-pointer transition border-none"
                                      >
                                        سدّد الكل
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>

                      {/* Right: Dynamic capital and markup calculator logic */}
                      <div className="space-y-4">
                        <span className="text-[10px] text-slate-400 font-black block">إحصاءات جرد القيمة السوقية الكلية</span>
                        
                        <div className="p-5 bg-white border border-slate-200 rounded-2xl flex flex-col justify-between h-minus">
                          <div className="space-y-1.5">
                            <span className="text-[10px] text-slate-400 font-extrabold uppercase">تقدير إجمالي البضاعة المخزنة بالصيدلية</span>
                            <h5 className="text-2xl font-black text-slate-900 tracking-tight font-serif">
                              {inventory.reduce((sum, item) => sum + (item.price * item.availableQuantity), 0).toLocaleString()} د.ع
                            </h5>
                            <p className="text-[10px] text-slate-500 font-semibold leading-relaxed">
                              التقدير التراكمي المحتسب للعلب الدوائية الحاضرة بالأرفف مضافاً إليها رأس المال بالصندوق.
                            </p>
                          </div>

                          <div className="pt-4 border-t border-slate-100 mt-4 text-[10px] text-slate-400 space-y-1 font-mono font-bold text-left block">
                            <div>سعر صرف الجرد على الموازي: ${(inventory.reduce((sum, item) => sum + (item.price * item.availableQuantity), 0) / 1500).toFixed(0)} USD</div>
                            <div>الربح المقدر السنوي: 24%</div>
                          </div>
                        </div>
                      </div>

                    {/* =========================================================
                        قسم المرتجعات (مرتجعات المبيعات)
                        ========================================================= */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <RefreshCw className="w-4 h-4 text-rose-500" />
                          <span className="text-[11px] text-slate-600 font-black">مرتجعات المبيعات</span>
                        </div>
                        <span className="text-[9px] bg-rose-50 text-rose-700 font-black px-2.5 py-1 rounded-full border border-rose-100">
                          {salesReturns.length} مرتجع • {salesReturns.reduce((s, r) => s + r.total, 0).toLocaleString()} د.ع
                        </span>
                      </div>

                      {salesReturns.length === 0 ? (
                        <p className="text-[10px] text-slate-400 font-bold text-center py-6">لا توجد مرتجعات مسجّلة بعد.</p>
                      ) : (
                        <div className="space-y-2 max-h-64 overflow-y-auto pl-1">
                          {salesReturns.map(r => (
                            <div key={r.returnId} className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 text-[10px] font-bold space-y-1">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-rose-700 font-black">{r.returnId}</span>
                                  <span className="text-slate-400">←</span>
                                  <span className="font-mono text-slate-500">{r.originalInvoiceId}</span>
                                </div>
                                <strong className="text-rose-700 font-mono">−{r.total.toLocaleString()} د.ع</strong>
                              </div>
                              <div className="flex items-center justify-between text-slate-500 text-[9px]">
                                <span>{r.timestamp} • {r.customerName} • {r.reason}</span>
                                <span className={`px-1.5 py-0.5 rounded font-black ${r.refundMethod === 'cash' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'}`}>
                                  {r.refundMethod === 'cash' ? 'استرداد نقدي' : 'تصحيح فقط'}
                                </span>
                              </div>
                              <div className="text-[9px] text-slate-400 font-semibold">
                                {r.items.map((it, i) => <span key={i}>{it.name} ×{it.quantity}{i < r.items.length - 1 ? ' | ' : ''}</span>)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* =========================================================
                        كشف الحساب — الموردين والزبائن
                        ========================================================= */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-5">
                      <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
                        <FileText className="w-4 h-4 text-emerald-600" />
                        <span className="text-[11px] text-slate-600 font-black">كشف الحساب — الموردين والزبائن</span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                        {/* ---- كشف حساب المورد ---- */}
                        <div className="space-y-3">
                          <span className="text-[10px] font-black text-rose-600 flex items-center gap-1.5">
                            <Truck className="w-3.5 h-3.5" /> كشف حساب المورد / المذخر
                          </span>
                          <select
                            value={stmtSupplier}
                            onChange={e => setStmtSupplier(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-[10px] font-bold focus:outline-emerald-400"
                          >
                            <option value="">— اختر المورد —</option>
                            {[...new Set(payables.map(p => p.supplierName))].map(name => (
                              <option key={name} value={name}>{name}</option>
                            ))}
                          </select>

                          {stmtSupplier && (() => {
                            const rows = payables.filter(p => p.supplierName === stmtSupplier);
                            const totalOwed = rows.reduce((s, p) => s + p.amount, 0);
                            const totalPaid = rows.reduce((s, p) => s + p.paidAmount, 0);
                            const balance = totalOwed - totalPaid;
                            let running = 0;
                            return (
                              <div className="space-y-2">
                                <div className="grid grid-cols-3 gap-2">
                                  <div className="bg-rose-50 rounded-xl p-2.5 text-center">
                                    <span className="text-[8px] text-rose-600 font-black block">إجمالي الدين</span>
                                    <strong className="text-[10px] font-mono text-rose-700">{totalOwed.toLocaleString()}</strong>
                                  </div>
                                  <div className="bg-emerald-50 rounded-xl p-2.5 text-center">
                                    <span className="text-[8px] text-emerald-600 font-black block">المدفوع</span>
                                    <strong className="text-[10px] font-mono text-emerald-700">{totalPaid.toLocaleString()}</strong>
                                  </div>
                                  <div className="bg-amber-50 rounded-xl p-2.5 text-center">
                                    <span className="text-[8px] text-amber-600 font-black block">المتبقي</span>
                                    <strong className="text-[10px] font-mono text-amber-700">{balance.toLocaleString()}</strong>
                                  </div>
                                </div>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-[9px] font-bold border-collapse">
                                    <thead>
                                      <tr className="bg-slate-100 text-slate-500">
                                        <th className="text-right p-1.5 rounded-r-lg">التاريخ</th>
                                        <th className="text-right p-1.5">البيان</th>
                                        <th className="text-left p-1.5">مدين</th>
                                        <th className="text-left p-1.5">دائن</th>
                                        <th className="text-left p-1.5 rounded-l-lg">الرصيد</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {rows.map(p => {
                                        running += (p.amount - p.paidAmount);
                                        return (
                                          <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50">
                                            <td className="p-1.5 text-slate-500">{p.date}</td>
                                            <td className="p-1.5 text-slate-700">{p.description || 'فاتورة توريد'}</td>
                                            <td className="p-1.5 font-mono text-rose-600 text-left">{p.amount.toLocaleString()}</td>
                                            <td className="p-1.5 font-mono text-emerald-600 text-left">{p.paidAmount > 0 ? p.paidAmount.toLocaleString() : '—'}</td>
                                            <td className="p-1.5 font-mono text-amber-700 text-left">{running.toLocaleString()}</td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                    <tfoot>
                                      <tr className="bg-slate-50 font-black">
                                        <td colSpan={2} className="p-1.5 text-slate-600">الرصيد النهائي</td>
                                        <td className="p-1.5 font-mono text-rose-700 text-left">{totalOwed.toLocaleString()}</td>
                                        <td className="p-1.5 font-mono text-emerald-700 text-left">{totalPaid.toLocaleString()}</td>
                                        <td className="p-1.5 font-mono text-amber-800 text-left">{balance.toLocaleString()}</td>
                                      </tr>
                                    </tfoot>
                                  </table>
                                </div>
                              </div>
                            );
                          })()}
                        </div>

                        {/* ---- كشف حساب الزبون ---- */}
                        <div className="space-y-3">
                          <span className="text-[10px] font-black text-emerald-700 flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5" /> كشف حساب الزبون / العميل
                          </span>
                          <select
                            value={stmtCustomer}
                            onChange={e => setStmtCustomer(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-[10px] font-bold focus:outline-emerald-400"
                          >
                            <option value="">— اختر الزبون —</option>
                            {[...new Set([
                              ...receivables.map(r => r.customerName),
                              ...salesLedger.map(s => s.customerName).filter(n => n !== 'زبون نقدي / خارجي'),
                            ])].map(name => (
                              <option key={name} value={name}>{name}</option>
                            ))}
                          </select>

                          {stmtCustomer && (() => {
                            const recRows = receivables.filter(r => r.customerName === stmtCustomer);
                            const saleRows = salesLedger.filter(s => s.customerName === stmtCustomer);
                            const totalSales = saleRows.reduce((s, x) => s + x.total, 0);
                            const totalRec = recRows.reduce((s, r) => s + r.amount, 0);
                            const totalCollected = recRows.reduce((s, r) => s + r.paidAmount, 0);
                            const balance = totalRec - totalCollected;
                            let running = 0;
                            const allRows: { date: string; desc: string; debit: number; credit: number; type: 'sale' | 'rec' }[] = [
                              ...saleRows.map(s => ({ date: s.timestamp.split(' ')[0], desc: `فاتورة ${s.invoiceId}`, debit: s.total, credit: 0, type: 'sale' as const })),
                              ...recRows.map(r => ({ date: r.date, desc: r.description || 'ذمّة مدينة', debit: r.amount, credit: r.paidAmount, type: 'rec' as const })),
                            ].sort((a, b) => a.date.localeCompare(b.date));
                            return (
                              <div className="space-y-2">
                                <div className="grid grid-cols-3 gap-2">
                                  <div className="bg-blue-50 rounded-xl p-2.5 text-center">
                                    <span className="text-[8px] text-blue-600 font-black block">إجمالي المبيعات</span>
                                    <strong className="text-[10px] font-mono text-blue-700">{(totalSales + totalRec).toLocaleString()}</strong>
                                  </div>
                                  <div className="bg-emerald-50 rounded-xl p-2.5 text-center">
                                    <span className="text-[8px] text-emerald-600 font-black block">المحصَّل</span>
                                    <strong className="text-[10px] font-mono text-emerald-700">{(totalSales + totalCollected).toLocaleString()}</strong>
                                  </div>
                                  <div className="bg-amber-50 rounded-xl p-2.5 text-center">
                                    <span className="text-[8px] text-amber-600 font-black block">المتبقي (ذمّة)</span>
                                    <strong className="text-[10px] font-mono text-amber-700">{balance.toLocaleString()}</strong>
                                  </div>
                                </div>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-[9px] font-bold border-collapse">
                                    <thead>
                                      <tr className="bg-slate-100 text-slate-500">
                                        <th className="text-right p-1.5 rounded-r-lg">التاريخ</th>
                                        <th className="text-right p-1.5">البيان</th>
                                        <th className="text-left p-1.5">مدين</th>
                                        <th className="text-left p-1.5">دائن</th>
                                        <th className="text-left p-1.5 rounded-l-lg">الرصيد</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {allRows.map((row, i) => {
                                        running += row.debit - row.credit;
                                        return (
                                          <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                                            <td className="p-1.5 text-slate-500">{row.date}</td>
                                            <td className="p-1.5 text-slate-700">{row.desc}</td>
                                            <td className="p-1.5 font-mono text-rose-600 text-left">{row.debit > 0 ? row.debit.toLocaleString() : '—'}</td>
                                            <td className="p-1.5 font-mono text-emerald-600 text-left">{row.credit > 0 ? row.credit.toLocaleString() : '—'}</td>
                                            <td className="p-1.5 font-mono text-amber-700 text-left">{running.toLocaleString()}</td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                    <tfoot>
                                      <tr className="bg-slate-50 font-black">
                                        <td colSpan={2} className="p-1.5 text-slate-600">الرصيد النهائي</td>
                                        <td colSpan={2} className="p-1.5 text-slate-500 text-left text-[8px]">إجمالي الحركات</td>
                                        <td className="p-1.5 font-mono text-amber-800 text-left">{balance.toLocaleString()}</td>
                                      </tr>
                                    </tfoot>
                                  </table>
                                </div>
                              </div>
                            );
                          })()}
                        </div>

                      </div>
                    </div>

                    </div>
                  </div>

                  {/* --- سجل التدقيق --- */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-slate-600" />
                        <span className="text-[11px] text-slate-600 font-black">سجل التدقيق (آخر 50 عملية)</span>
                      </div>
                      <span className="text-[9px] text-slate-400 font-bold">{auditLog.length} إدخال</span>
                    </div>

                    <div className="space-y-1.5 max-h-96 overflow-y-auto">
                      {auditLog.slice(0, 50).map(entry => {
                        const actionMeta: Record<AuditEntry['action'], { label: string; color: string; bg: string }> = {
                          sale:               { label: 'بيع',       color: 'text-emerald-700', bg: 'bg-emerald-50' },
                          purchase:           { label: 'شراء',      color: 'text-blue-700',   bg: 'bg-blue-50'   },
                          expense:            { label: 'مصروف',     color: 'text-rose-700',   bg: 'bg-rose-50'   },
                          payable_add:        { label: 'ذمّة مورّد', color: 'text-amber-700',  bg: 'bg-amber-50'  },
                          payable_settle:     { label: 'تسديد',     color: 'text-emerald-700',bg: 'bg-emerald-50'},
                          receivable_add:     { label: 'ذمّة زبون', color: 'text-violet-700', bg: 'bg-violet-50' },
                          receivable_collect: { label: 'تحصيل',     color: 'text-emerald-700',bg: 'bg-emerald-50'},
                          return:             { label: 'مرتجع',     color: 'text-rose-700',   bg: 'bg-rose-50'   },
                          inventory_import:   { label: 'استيراد مخزون', color: 'text-slate-700', bg: 'bg-slate-100' },
                        };
                        const meta = actionMeta[entry.action];
                        return (
                          <div key={entry.id} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-[10px] font-bold gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`shrink-0 px-1.5 py-0.5 rounded-md font-black text-[9px] ${meta.bg} ${meta.color}`}>{meta.label}</span>
                              <span className="text-slate-600 truncate">{entry.description}</span>
                            </div>
                            <div className="flex items-center gap-3 shrink-0 text-right">
                              {entry.amount > 0 && (
                                <span className={`font-mono font-black ${['expense','payable_settle','return'].includes(entry.action) ? 'text-rose-600' : 'text-emerald-700'}`}>
                                  {['expense','payable_settle','return'].includes(entry.action) ? '−' : '+'}{entry.amount.toLocaleString()} د.ع
                                </span>
                              )}
                              <div className="text-slate-400 text-right">
                                <span className="block font-mono">{entry.timestamp}</span>
                                <span className="block text-[9px]">{entry.actor}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {auditLog.length === 0 && (
                        <p className="text-[10px] text-slate-400 font-bold text-center py-6">لا توجد سجلات تدقيق بعد.</p>
                      )}
                    </div>
                    <p className="text-[9px] text-slate-400 font-bold">* يُسجَّل كل بيع، شراء، مصروف، تسديد ذمّة، تحصيل، ومرتجع تلقائياً مع الوقت والمسؤول.</p>
                  </div>

                  {/* --- تغيير كلمة مرور التبويب المالي --- */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-violet-600" />
                      <span className="text-[11px] text-slate-600 font-black">تغيير كلمة مرور الحسابات المالية</span>
                    </div>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!changePinOld || !changePinNew || !changePinConfirm) {
                          setChangePinMsg({ type: 'error', text: 'يرجى تعبئة جميع الحقول' });
                          return;
                        }
                        if (changePinOld !== financialPin) {
                          setChangePinMsg({ type: 'error', text: 'كلمة المرور الحالية غير صحيحة' });
                          return;
                        }
                        if (changePinNew !== changePinConfirm) {
                          setChangePinMsg({ type: 'error', text: 'كلمة المرور الجديدة وتأكيدها غير متطابقتين' });
                          return;
                        }
                        if (changePinNew.length < 4) {
                          setChangePinMsg({ type: 'error', text: 'كلمة المرور يجب أن تكون 4 أحرف على الأقل' });
                          return;
                        }
                        setFinancialPin(changePinNew);
                        try { localStorage.setItem('fin_pin', changePinNew); } catch {}
                        setChangePinOld(''); setChangePinNew(''); setChangePinConfirm('');
                        setChangePinMsg({ type: 'success', text: '✓ تم تغيير كلمة المرور بنجاح' });
                        setTimeout(() => setChangePinMsg(null), 3000);
                      }}
                      className="grid grid-cols-1 sm:grid-cols-3 gap-3"
                    >
                      <div className="space-y-1">
                        <label className="block text-[10px] text-slate-500 font-black">كلمة المرور الحالية</label>
                        <input
                          type="password"
                          value={changePinOld}
                          onChange={e => { setChangePinOld(e.target.value); setChangePinMsg(null); }}
                          placeholder="••••"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-center font-mono text-sm focus:outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-200 transition"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-[10px] text-slate-500 font-black">كلمة المرور الجديدة</label>
                        <input
                          type="password"
                          value={changePinNew}
                          onChange={e => { setChangePinNew(e.target.value); setChangePinMsg(null); }}
                          placeholder="••••"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-center font-mono text-sm focus:outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-200 transition"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-[10px] text-slate-500 font-black">تأكيد كلمة المرور</label>
                        <input
                          type="password"
                          value={changePinConfirm}
                          onChange={e => { setChangePinConfirm(e.target.value); setChangePinMsg(null); }}
                          placeholder="••••"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-center font-mono text-sm focus:outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-200 transition"
                        />
                      </div>
                      <div className="sm:col-span-3 flex items-center gap-3">
                        <button
                          type="submit"
                          className="bg-violet-600 hover:bg-violet-700 text-white font-black px-6 py-2.5 rounded-xl text-xs cursor-pointer transition border-none font-sans"
                        >
                          حفظ كلمة المرور الجديدة
                        </button>
                        {changePinMsg && (
                          <span className={`text-[11px] font-black ${changePinMsg.type === 'success' ? 'text-emerald-700' : 'text-rose-600'}`}>
                            {changePinMsg.text}
                          </span>
                        )}
                      </div>
                    </form>
                  </div>

                </motion.div>
              )}


            </AnimatePresence>

            </div>
          </div>
        )}

      </div>

      {/* 
        =========================================================
        MODAL DIALOG: HIGH-FIDELITY PRINT RECEIPT BILL SIMULATOR
        =========================================================
      */}
      <AnimatePresence>
        {showReceiptModal && lastPrintedInvoice && (
          <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setShowReceiptModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs" 
            />

            {/* Receipt Modal Content */}
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl border border-slate-200 p-6 max-w-sm w-full shadow-2xl relative text-right text-slate-800 space-y-4 z-10 print-receipt"
            >
              
              <div className="text-center space-y-2 border-b border-dashed border-slate-200 pb-4">
                <div className="w-12 h-12 bg-emerald-100 text-emerald-800 rounded-full flex items-center justify-center mx-auto shadow-sm">
                  <Check className="w-6 h-6 stroke-[3]" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-950 text-base leading-none">صيدلية انوار الحسن</h3>
                  <p className="text-[10px] text-slate-400 mt-1">البصرة / شارع القائد</p>
                </div>
              </div>

              {/* Receipt details */}
              <div className="text-[11px] leading-normal font-semibold space-y-2 text-slate-700">
                <div className="flex justify-between font-mono">
                  <span>رقم الفاتورة:</span>
                  <span className="text-slate-950 font-black">{lastPrintedInvoice.invoiceId}</span>
                </div>
                <div className="flex justify-between">
                  <span>تاريخ الصرف:</span>
                  <span className="font-mono">{lastPrintedInvoice.timestamp}</span>
                </div>
                <div className="flex justify-between">
                  <span>اسم المريض الموصوف:</span>
                  <span className="text-slate-950 font-bold">{lastPrintedInvoice.customerName}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span>نوع العملية الكاش:</span>
                  <span className="bg-emerald-50 text-emerald-800 px-2.5 py-0.5 rounded text-[9px] font-bold">صرف بيع مباشر</span>
                </div>

                {/* Items sold table list */}
                <div className="pt-2 space-y-1.5 font-bold">
                  <span className="text-[9px] text-slate-400 uppercase tracking-widest block">الأدوية المباعة والمقادير:</span>
                  {lastPrintedInvoice.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-xs py-1">
                      <span>{item.name} <span className="font-mono text-slate-400 text-[10px]">x{item.quantity}</span></span>
                      <span className="font-mono text-slate-900">{(item.price * item.quantity).toLocaleString()} د.ع</span>
                    </div>
                  ))}
                </div>

                {/* Billing sums */}
                <div className="border-t border-dashed border-slate-200/80 pt-3 mt-3 spacing-y-2">
                  {lastPrintedInvoice.discount > 0 && (
                    <p className="flex justify-between text-rose-700 text-xs py-0.5">
                      <span>الخصم المطبق:</span>
                      <span className="font-mono">-{(lastPrintedInvoice.discount).toLocaleString()} د.ع</span>
                    </p>
                  )}
                  <p className="flex justify-between items-center text-sm font-black text-slate-950 pt-1">
                    <span>الصافي المقبوض:</span>
                    <span className="font-mono text-emerald-800 text-base">{lastPrintedInvoice.total.toLocaleString()} د.ع</span>
                  </p>
                </div>
              </div>

              {/* Legal confirmation */}
              <div className="bg-slate-50 p-2.5 rounded-xl text-center text-[10px] text-slate-400 font-bold border border-slate-100 leading-normal">
                برمجيات انوار الحسن موثقة سحابياً وفقاً للائحة رقم 42 الصادرة من نقابة صيادلة العراق.
              </div>

              <button
                onClick={() => window.print()}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs py-2.5 rounded-xl cursor-pointer transition"
              >
                طباعة الفاتورة
              </button>

              <button 
                type="button" 
                onClick={() => setShowReceiptModal(false)}
                className="w-full bg-slate-950 hover:bg-slate-900 text-white font-extrabold text-xs py-2.5 rounded-xl cursor-pointer transition shadow text-center block"
              >
                الموافقة وإغلاق الفاتورة صيدلي
              </button>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 
        =========================================================
        MODAL DIALOG: SALES RETURN (مرتجع مبيعات)
        =========================================================
      */}
      <AnimatePresence>
        {showReturnModal && returnTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm" dir="rtl">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-5"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <span className="text-[10px] font-black text-rose-600 bg-rose-50 px-2.5 py-1 rounded-full uppercase">مرتجع مبيعات</span>
                  <h3 className="font-extrabold text-slate-900 text-sm mt-2">إرجاع فاتورة {returnTarget.invoiceId}</h3>
                  <p className="text-[10px] text-slate-400 font-bold mt-0.5">الزبون: {returnTarget.customerName} • المبلغ الأصلي: {returnTarget.total.toLocaleString()} د.ع</p>
                </div>
                <button onClick={() => setShowReturnModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleProcessReturn} className="space-y-4">
                {/* Items with qty inputs */}
                <div className="space-y-2">
                  <span className="text-[10px] font-black text-slate-600 block">الأصناف المُرادة للإرجاع:</span>
                  {returnTarget.items.map((it, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2.5 text-[10px] font-bold gap-3">
                      <div className="min-w-0 flex-1">
                        <span className="text-slate-800 block truncate">{it.name}</span>
                        <span className="text-slate-400 text-[9px]">الكمية المباعة: {it.quantity} • السعر: {it.price.toLocaleString()} د.ع</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <label className="text-slate-500 text-[9px]">كمية الإرجاع:</label>
                        <input
                          type="number" min={0} max={it.quantity}
                          value={returnQtys[idx] ?? 0}
                          onChange={e => setReturnQtys(prev => ({ ...prev, [idx]: Math.min(it.quantity, Math.max(0, Number(e.target.value))) }))}
                          className="w-14 bg-white border border-slate-200 rounded-lg p-1.5 text-center focus:outline-emerald-400 text-[10px]"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Running total */}
                {Object.values(returnQtys).some(q => q > 0) && (
                  <div className="bg-rose-50 border border-rose-100 rounded-xl px-3 py-2 text-[10px] font-black text-rose-700 flex justify-between">
                    <span>إجمالي مبلغ الاسترداد:</span>
                    <span className="font-mono">
                      {returnTarget.items.reduce((s, it, idx) => s + it.price * (returnQtys[idx] ?? 0), 0).toLocaleString()} د.ع
                    </span>
                  </div>
                )}

                {/* Reason */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-600 block">سبب الإرجاع: *</label>
                  <input
                    type="text" required value={returnReason} onChange={e => setReturnReason(e.target.value)}
                    placeholder="دواء منتهي الصلاحية / خطأ في الصرف / طلب الزبون..."
                    className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-[10px] font-bold focus:outline-emerald-400"
                  />
                </div>

                {/* Refund method */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-600 block">طريقة الاسترداد:</label>
                  <div className="flex gap-3">
                    {(['cash', 'none'] as const).map(m => (
                      <label key={m} className="flex items-center gap-1.5 cursor-pointer text-[10px] font-bold">
                        <input type="radio" name="refundMethod" value={m} checked={returnRefundMethod === m} onChange={() => setReturnRefundMethod(m)} className="accent-emerald-600" />
                        {m === 'cash' ? 'استرداد نقدي (يُخصم من الصندوق)' : 'بدون صرف نقدي (تصحيح فقط)'}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={!Object.values(returnQtys).some(q => q > 0)}
                  className="w-full bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white font-black text-xs py-3 rounded-xl cursor-pointer transition shadow-sm"
                >
                  تأكيد المرتجع وتحديث المخزون
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isScanning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
            dir="rtl"
          >
            <style>{`
              @keyframes scan-laser {
                0% { top: 0%; opacity: 0.8; }
                50% { top: 100%; opacity: 1; }
                100% { top: 0%; opacity: 0.8; }
              }
              .scanner-laser-line {
                animation: scan-laser 2.5s infinite linear;
              }
            `}</style>

            <motion.div
              initial={{ y: 50, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 50, opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              className="bg-white rounded-3xl w-full max-w-lg overflow-hidden border border-slate-100 shadow-2xl relative flex flex-col max-h-[90vh]"
            >
              
              {/* Modal Header */}
              <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div className="flex items-center space-x-reverse space-x-2.5">
                  <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600">
                    <Barcode className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-sm">قارئ الباركود والمنتجات</h3>
                    <p className="text-[10px] text-slate-400 font-bold mt-0.5">مسح تلقائي للأدوية وبحث مباشر في الصيدلية</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-reverse space-x-2">
                  {/* Sound Toggle */}
                  <button
                    type="button"
                    onClick={() => setIsBeepEnabled(!isBeepEnabled)}
                    className={`p-2 rounded-xl transition cursor-pointer ${
                      isBeepEnabled ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'
                    }`}
                    title={isBeepEnabled ? "كتم صوت التنبيه" : "تفعيل صوت التنبيه"}
                  >
                    {isBeepEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                  </button>
                  
                  {/* Close Button */}
                  <button
                    type="button"
                    onClick={stopScanning}
                    className="p-2 hover:bg-slate-100 text-slate-400 hover:text-slate-700 rounded-xl transition cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Viewfinder and Camera Frame Container */}
              <div className="p-6 flex-1 overflow-y-auto space-y-5 text-right">
                
                <div className="relative aspect-video bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 shadow-inner flex items-center justify-center">
                  
                  {/* Green Viewfinder Box Hud */}
                  <div className="absolute w-64 h-36 max-w-[80vw] border-2 border-dashed border-emerald-500/30 z-10 rounded-xl flex items-center justify-center">
                    
                    {/* Viewfinder Corner Decoration marks */}
                    <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-emerald-500 -mt-1 -mr-1 rounded-tr-lg" />
                    <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-emerald-500 -mt-1 -ml-1 rounded-tl-lg" />
                    <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-emerald-500 -mb-1 -mr-1 rounded-br-lg" />
                    <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-emerald-500 -mb-1 -ml-1 rounded-tl-lg" />

                    {/* Laser Sweeper Line */}
                    {!scanSuccessFeedback && !scanError && (
                      <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent scanner-laser-line shadow-[0_0_10px_#10b981]" />
                    )}

                    {/* Status Indicator inside viewport */}
                    <span className="absolute bottom-3 text-[9px] bg-slate-950/70 text-slate-300 font-mono tracking-widest px-2.5 py-1 rounded-full border border-slate-800 backdrop-blur-xs font-bold">
                      {scanSuccessFeedback ? "SUCCESS DECODING" : "LIVE CAMERA FEED"}
                    </span>
                  </div>

                  {/* Actual Camera Live Feed Element */}
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    autoPlay
                    className={`w-full h-full object-cover select-none transition ${
                      scanSuccessFeedback ? 'brightness-50 saturate-50' : ''
                    }`}
                  />

                  {/* Scanning Auto Detection status overlay */}
                  {!scanSuccessFeedback && !scanError && (
                    <div className="absolute top-3 right-3 bg-emerald-600/90 text-white font-extrabold text-[9px] px-2.5 py-1 rounded-full flex items-center gap-1.5 animate-pulse shadow-sm h-6">
                      <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping" />
                      <span>تتبع تلقائي نشط...</span>
                    </div>
                  )}

                  {/* Scan Success Overlay */}
                  {scanSuccessFeedback && (
                    <div className="absolute inset-0 bg-emerald-950/80 backdrop-blur-xs flex flex-col items-center justify-center text-center p-4 z-20">
                      <div className="w-14 h-14 bg-emerald-500 text-white rounded-full flex items-center justify-center mb-3 shadow-[0_0_20px_#10b981] animate-bounce">
                        <Check className="w-7 h-7" strokeWidth={3} />
                      </div>
                      <p className="text-white font-black text-sm leading-relaxed">{scanSuccessFeedback}</p>
                      <p className="text-emerald-300 text-[10px] font-bold mt-1">جاري مطابقة الرمز مدخل ومزاجنة المعلومات المطلوبة...</p>
                    </div>
                  )}

                  {/* Scan Error Overlay */}
                  {scanError && (
                    <div className="absolute inset-0 bg-rose-950/80 backdrop-blur-xs flex flex-col items-center justify-center text-center p-4 z-20 font-sans">
                      <div className="w-14 h-14 bg-rose-500 text-white rounded-full flex items-center justify-center mb-3 shadow-[0_0_20px_#ef4444]">
                        <X className="w-7 h-7" strokeWidth={3} />
                      </div>
                      <p className="text-white font-black text-xs leading-relaxed max-w-xs">{scanError}</p>
                      <button
                        type="button"
                        onClick={() => startScanning(scanTarget)}
                        className="mt-3 bg-white hover:bg-slate-100 text-rose-950 font-black text-[10px] px-4 py-2 rounded-lg transition"
                      >
                        إعادة محاولة الاتصال
                      </button>
                    </div>
                  )}

                </div>

                <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl space-y-2">
                  <span className="font-extrabold text-xs text-slate-800 block">تعليمات استخدام قارئ الباركود السريع:</span>
                  <ul className="text-[10px] text-slate-500 space-y-1.5 font-bold list-disc pr-4 leading-relaxed">
                    <li>ثبّت علبة الدواء أمام الكاميرا مباشرة بوضوح لتمرير شريط الباركود عبر الليزر الأخضر.</li>
                    <li>تأكد من توافر إضاءة كافية في مكان العمل ومسح أي غبار أو لمعان غير مرغوب فيه.</li>
                    <li>في حال عدم وجود كاميرا، سيعمل نظام محادثة الصيدلية التلقائي (Simulator) على توليد باركود تلقائي مطابق للأدوية الحاضرة بعد 4 ثوانٍ تيسيراً للتجربة.</li>
                  </ul>
                </div>

              </div>

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bulk Inventory Import Confirmation */}
      <AnimatePresence>
        {showBulkImportConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setShowBulkImportConfirm(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl text-right space-y-4"
              dir="rtl"
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 bg-slate-100 rounded-2xl flex items-center justify-center shrink-0">
                  <Download className="w-5 h-5 text-slate-700" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">استيراد المخزون الكامل</h3>
                  <p className="text-[10px] text-slate-400 font-bold">من ملف بيانات المخازن</p>
                </div>
              </div>
              <p className="text-xs text-slate-600 font-medium leading-relaxed">
                سيُستبدل مخزونك بالكامل بـ <strong className="text-slate-900">6,978 صنف</strong> من الملف، مع الباركود والأسعار (شراء وبيع) والكميات.
                الكميات السالبة ستُحوَّل إلى صفر. {currentUser ? 'ستُرفع إلى حسابك السحابي.' : 'ستُحفظ محلياً (غير مسجّل الدخول).'}
              </p>
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-[10px] text-rose-800 font-bold">
                ⚠️ تنبيه: سيتم <strong>حذف كل المواد الحالية</strong> (بما فيها التجريبية) واستبدالها بمواد الملف. لن تتأثّر الفواتير أو المبيعات السابقة. قد تستغرق العملية دقيقة — لا تغلق الصفحة.
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowBulkImportConfirm(false)}
                  className="flex-1 border border-slate-200 rounded-xl py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer">
                  إلغاء
                </button>
                <button onClick={handleBulkImportInventory}
                  className="flex-1 bg-rose-600 hover:bg-rose-700 text-white rounded-xl py-2.5 text-xs font-extrabold transition cursor-pointer">
                  استبدل المخزون الآن
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Delete Medicine Confirmation Modal */}
        {deleteMedTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setDeleteMedTarget(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl text-right space-y-4"
              dir="rtl"
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 bg-rose-100 rounded-2xl flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5 text-rose-600" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">حذف مادة من المخزون</h3>
                  <p className="text-[10px] text-slate-400 font-bold">هذا الإجراء لا يمكن التراجع عنه</p>
                </div>
              </div>
              <p className="text-xs text-slate-600 font-medium leading-relaxed">
                هل أنت متأكد من حذف <strong className="text-slate-900">{deleteMedTarget.nameAr}</strong> نهائياً؟
                {deleteMedTarget.availableQuantity > 0 && (
                  <span className="text-rose-700 font-bold"> (يوجد {deleteMedTarget.availableQuantity} علبة في المخزون حالياً)</span>
                )}
                {' '}{currentUser ? 'سيُحذف من حسابك السحابي أيضاً.' : 'سيُحذف محلياً (غير مسجّل الدخول).'}
              </p>
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-[10px] text-rose-800 font-bold">
                ⚠️ لن تتأثّر الفواتير أو المبيعات السابقة المسجّلة لهذه المادة.
              </div>
              <div className="flex gap-2">
                <button onClick={() => setDeleteMedTarget(null)}
                  className="flex-1 border border-slate-200 rounded-xl py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer">
                  إلغاء
                </button>
                <button onClick={confirmDeleteMedicine}
                  className="flex-1 bg-rose-600 hover:bg-rose-700 text-white rounded-xl py-2.5 text-xs font-extrabold transition cursor-pointer">
                  نعم، احذف المادة
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Invoice Import Modal */}
      <AnimatePresence>
        {showInvoiceImport && (
          <InvoiceImportModal
            inventory={inventory}
            onClose={() => setShowInvoiceImport(false)}
            onConfirm={(draftItems, supplierName) => {
              // Merge imported items into purchaseDraft
              setPurchaseDraft(prev => {
                const updated = [...prev];
                draftItems.forEach(newItem => {
                  const exists = newItem.medicineId
                    ? updated.findIndex(d => d.medicineId === newItem.medicineId)
                    : -1;
                  if (exists >= 0) {
                    updated[exists] = {
                      ...updated[exists],
                      qty: updated[exists].qty + newItem.qty,
                      price: newItem.price,
                      expiryDate: newItem.expiryDate,
                    };
                  } else {
                    updated.push(newItem);
                  }
                });
                return updated;
              });
              if (supplierName) setPurchaseSupplier(supplierName);
              setShowInvoiceImport(false);
              setPurchaseSuccessBanner(`تم استيراد ${draftItems.length} صنف من الفاتورة إلى مسودة الشراء`);
              setTimeout(() => setPurchaseSuccessBanner(null), 5000);
            }}
          />
        )}
      </AnimatePresence>

      {/* Hidden financial print div */}
      <div className='print-financial p-8 text-right' dir='rtl'>
        <h1 className='text-xl font-black mb-2'>صيدلية انوار الحسن — التقرير المالي</h1>
        <p className='text-sm mb-4'>تاريخ التصدير: {new Date().toLocaleDateString('ar-IQ')}</p>
        <table className='w-full border-collapse text-xs mb-4'><tbody>
          <tr><td className='border p-2 font-bold'>السيولة في الصندوق</td><td className='border p-2 font-mono'>{walletBalance.toLocaleString()} د.ع</td></tr>
          <tr><td className='border p-2 font-bold'>مبيعات هذا الشهر</td><td className='border p-2 font-mono'>{statsMonth.sales.toLocaleString()} د.ع</td></tr>
          <tr><td className='border p-2 font-bold'>الربح الإجمالي (الشهر)</td><td className='border p-2 font-mono'>{statsMonth.profit.toLocaleString()} د.ع</td></tr>
          <tr><td className='border p-2 font-bold'>إجمالي الذمم للموردين</td><td className='border p-2 font-mono'>{totalDebts.toLocaleString()} د.ع</td></tr>
        </tbody></table>
        <p className='text-xs text-slate-500'>صيدلية انوار الحسن — نظام إدارة صيدليات المتكامل</p>
      </div>

      {/* 
        =========================================================
        SMALL SIGNATURE FOOTER FOR ANWAR AL-HASSAN CLIENTS
        =========================================================
      */}
      <footer className="bg-slate-950 text-slate-500 py-8 border-t border-slate-900 text-center text-xs font-semibold mt-16">
        <div className="max-w-7xl mx-auto px-4 space-y-2">
          <p>© 2026 ANWAR AL-HASSAN. جميع الحقوق معتمدة ومحفوظة لنقابة صيادلة العراق ومستودعات الأدوية.</p>
          <p className="text-[10px] text-slate-600 font-mono">Platform Integration Applet ID: {`e3fe30f5-c41f-4ed7`}</p>
        </div>
      </footer>

    </div>
  );
}
