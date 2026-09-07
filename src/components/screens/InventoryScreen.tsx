import React, { FormEvent } from 'react';
import { motion } from 'motion/react';
import {
  AlertCircle, Barcode, CalendarClock, Check, CheckCircle2, ChevronDown, Clock, Download,
  Factory, FileText, FlaskConical, Pencil, Pill, Plus, RefreshCw, Search, Trash2, X,
} from 'lucide-react';
import type { Medicine, Order } from '../../types';
import { fmtNum, fmtDate } from '../../utils/format';
import { escapeHtml, MOVEMENT_DROPDOWN_LIMIT, EXPIRY_LIST_LIMIT } from '../dashboard/shared';
import { InventorySearchBar, type POSSearchHandle } from '../pos/SearchBars';
import { todayLocalISO } from '../../utils/finance';

type ActiveTab = 'home' | 'pos' | 'inventory' | 'b2b' | 'financial' | 'team';

interface InventoryScreenProps {
  // بيانات
  inventory: Medicine[];
  filteredInventory: Medicine[];
  expiryDates: Record<string, string>;
  currentRole: 'admin' | 'pharmacist' | 'cashier';
  b2bOrders: Order[];
  setActiveTab: (tab: ActiveTab) => void;
  addToPurchaseDraft: (med: Medicine, overrideQty?: number) => void;
  startScanning: (target: 'pos' | 'inventory' | 'add-drug' | 'purchase-order' | 'movement' | 'purchase-new-product') => void | Promise<void>;
  setDeleteMedTarget: (m: Medicine | null) => void;
  // استيراد جماعي
  bulkImportStatus: 'idle' | 'loading' | 'writing' | 'done' | 'error';
  bulkImportProgress: { done: number; total: number };
  bulkImportMsg: string;
  setShowBulkImportConfirm: (v: boolean) => void;
  exportInventoryToCSV: () => void;
  handleSeedTestData: () => void | Promise<void>;
  // البحث والعرض
  searchInInventoryQuery: string;
  handleInvQueryChange: (q: string) => void;
  invSearchRef: React.RefObject<POSSearchHandle | null>;
  setSearchInInventoryQuery: (v: string) => void;
  invRenderCap: number;
  setInvRenderCap: React.Dispatch<React.SetStateAction<number>>;
  // انتهاء الصلاحية
  showNearExpiry30: boolean;
  setShowNearExpiry30: (v: boolean) => void;
  showExpiryHorizon: boolean;
  setShowExpiryHorizon: (v: boolean) => void;
  selectedExpiryMonth: string | null;
  setSelectedExpiryMonth: (v: string | null) => void;
  getNearExpiryMeds: () => Medicine[];
  getHorizonExpiryMeds: () => Medicine[];
  getExpiryMonths: () => { key: string; label: string; count: number }[];
  getDaysUntilExpiry: (id: string) => number;
  expirySeverity: (days: number) => 'expired' | 'critical' | 'warning' | 'watch';
  // مخزون راكد
  showDeadStock: boolean;
  setShowDeadStock: (v: boolean) => void;
  deadStock: { rows: { med: Medicine; lastSale: string | null; capital: number }[]; total: number };
  deadStockVisible: { med: Medicine; lastSale: string | null; capital: number }[];
  deadStockDays: 90 | 180 | 365;
  setDeadStockDays: (v: 90 | 180 | 365) => void;
  deadStockQuery: string;
  setDeadStockQuery: (v: string) => void;
  // نواقص المخزون
  showLowStock: boolean;
  setShowLowStock: React.Dispatch<React.SetStateAction<boolean>>;
  dismissedLowStock: Set<string>;
  setDismissedLowStock: React.Dispatch<React.SetStateAction<Set<string>>>;
  // تعديل السعر والكمية بالنقر
  editingPriceId: string | null;
  setEditingPriceId: (v: string | null) => void;
  editingPriceValue: string;
  setEditingPriceValue: (v: string) => void;
  editingSecondaryPriceValue: string;
  setEditingSecondaryPriceValue: (v: string) => void;
  startEditingPrice: (med: Medicine) => void;
  saveEditingPrice: (medId: string) => void;
  editingQtyId: string | null;
  setEditingQtyId: (v: string | null) => void;
  editingQtyValue: string;
  setEditingQtyValue: (v: string) => void;
  startEditingQty: (med: Medicine) => void;
  saveEditingQty: (medId: string) => void;
  adjustStockQty: (medId: string, delta: number) => void;
  // التدقيق السريع
  quickAuditId: string | null;
  setQuickAuditId: (v: string | null) => void;
  qaNameAr: string;
  setQaNameAr: (v: string) => void;
  qaNameEn: string;
  setQaNameEn: (v: string) => void;
  qaPrice: string;
  setQaPrice: (v: string) => void;
  qaCostPrice: string;
  setQaCostPrice: (v: string) => void;
  qaQty: string;
  setQaQty: (v: string) => void;
  qaExpiry: string;
  setQaExpiry: (v: string) => void;
  startQuickAudit: (med: Medicine) => void;
  saveQuickAudit: (medId: string) => void;
  // إضافة دواء جديد
  isAddingDrug: boolean;
  setIsAddingDrug: (v: boolean) => void;
  newDrugAr: string;
  setNewDrugAr: (v: string) => void;
  newDrugEn: string;
  setNewDrugEn: (v: string) => void;
  newDrugSci: string;
  setNewDrugSci: (v: string) => void;
  newDrugBarcode: string;
  setNewDrugBarcode: (v: string) => void;
  newDrugPrice: number;
  setNewDrugPrice: (v: number) => void;
  newDrugSecondaryPrice: number;
  setNewDrugSecondaryPrice: (v: number) => void;
  newDrugQty: number;
  setNewDrugQty: (v: number) => void;
  newDrugMinStock: number;
  setNewDrugMinStock: (v: number) => void;
  newDrugExpiry: string;
  setNewDrugExpiry: (v: string) => void;
  handleAddNewDrug: (e: FormEvent) => void;
  // سجل حركة الصنف
  movementMedId: string;
  setMovementMedId: (v: string) => void;
  movementSearch: string;
  setMovementSearch: (v: string) => void;
  movementDropdownOpen: boolean;
  setMovementDropdownOpen: (v: boolean) => void;
  movementFrom: string;
  setMovementFrom: (v: string) => void;
  movementTo: string;
  setMovementTo: (v: string) => void;
  getStockMovements: (medId: string, from: string, to: string) => {
    movements: { type: 'in' | 'out'; date: string; qty: number; price: number; ref: string; party: string }[];
    totalIn: number; totalOut: number; valueIn: number; valueOut: number;
  };
}

export default function InventoryScreen(props: InventoryScreenProps) {
  const {
    inventory, filteredInventory, expiryDates, currentRole, b2bOrders, setActiveTab, addToPurchaseDraft, startScanning, setDeleteMedTarget,
    bulkImportStatus, bulkImportProgress, bulkImportMsg, setShowBulkImportConfirm, exportInventoryToCSV, handleSeedTestData,
    searchInInventoryQuery, handleInvQueryChange, invSearchRef, setSearchInInventoryQuery, invRenderCap, setInvRenderCap,
    showNearExpiry30, setShowNearExpiry30, showExpiryHorizon, setShowExpiryHorizon, selectedExpiryMonth, setSelectedExpiryMonth,
    getNearExpiryMeds, getHorizonExpiryMeds, getExpiryMonths, getDaysUntilExpiry, expirySeverity,
    showDeadStock, setShowDeadStock, deadStock, deadStockVisible, deadStockDays, setDeadStockDays, deadStockQuery, setDeadStockQuery,
    showLowStock, setShowLowStock, dismissedLowStock, setDismissedLowStock,
    editingPriceId, setEditingPriceId, editingPriceValue, setEditingPriceValue, editingSecondaryPriceValue, setEditingSecondaryPriceValue,
    startEditingPrice, saveEditingPrice, editingQtyId, setEditingQtyId, editingQtyValue, setEditingQtyValue, startEditingQty, saveEditingQty, adjustStockQty,
    quickAuditId, setQuickAuditId, qaNameAr, setQaNameAr, qaNameEn, setQaNameEn, qaPrice, setQaPrice, qaCostPrice, setQaCostPrice, qaQty, setQaQty,
    qaExpiry, setQaExpiry, startQuickAudit, saveQuickAudit,
    isAddingDrug, setIsAddingDrug, newDrugAr, setNewDrugAr, newDrugEn, setNewDrugEn, newDrugSci, setNewDrugSci,
    newDrugBarcode, setNewDrugBarcode, newDrugPrice, setNewDrugPrice, newDrugSecondaryPrice, setNewDrugSecondaryPrice,
    newDrugQty, setNewDrugQty, newDrugMinStock, setNewDrugMinStock, newDrugExpiry, setNewDrugExpiry, handleAddNewDrug,
    movementMedId, setMovementMedId, movementSearch, setMovementSearch, movementDropdownOpen, setMovementDropdownOpen,
    movementFrom, setMovementFrom, movementTo, setMovementTo, getStockMovements,
  } = props;

  return (
                <motion.div
                  key="inventory"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <h3 className="font-semibold text-slate-900 text-sm">مستودع الأدوية والمخزون الداخلي</h3>
                        <p className="text-sm text-slate-500 font-bold mt-0.5">تحرير الأسعار ونسب المخزون وإدارة فترات انتهاء صلاحية الأدوية العضوية والمبردة</p>
                      </div>
                      <button
                        type="button"
                        onClick={exportInventoryToCSV}
                        className="bg-primary-600 hover:bg-primary-700 text-white font-bold py-2 px-4 rounded-xl flex items-center gap-2 transition shadow-sm cursor-pointer text-sm"
                        title="تنزيل جرد المخزون الكامل كملف Excel/CSV"
                      >
                        <FileText className="w-4 h-4" />
                        <span>تصدير الجرد CSV</span>
                      </button>
                    </div>

                    {/* Bulk import status banner */}
                    {bulkImportStatus !== 'idle' && (
                      <div className={`rounded-2xl p-4 text-right flex items-center gap-3 shadow-sm border ${
                        bulkImportStatus === 'error' ? 'bg-danger-50 border-danger-200' :
                        bulkImportStatus === 'done' ? 'bg-primary-50 border-primary-200' :
                        'bg-slate-50 border-slate-200'
                      }`}>
                        {(bulkImportStatus === 'loading' || bulkImportStatus === 'writing') && (
                          <RefreshCw className="w-5 h-5 text-slate-600 animate-spin shrink-0" />
                        )}
                        {bulkImportStatus === 'done' && <CheckCircle2 className="w-5 h-5 text-primary-600 shrink-0" />}
                        {bulkImportStatus === 'error' && <AlertCircle className="w-5 h-5 text-danger-600 shrink-0" />}
                        <div className="flex-1">
                          <p className={`text-xs font-semibold ${
                            bulkImportStatus === 'error' ? 'text-danger-800' :
                            bulkImportStatus === 'done' ? 'text-primary-800' : 'text-slate-800'
                          }`}>
                            {bulkImportStatus === 'writing'
                              ? `جارٍ الرفع السحابي... ${fmtNum(bulkImportProgress.done)} / ${fmtNum(bulkImportProgress.total)}`
                              : bulkImportMsg}
                          </p>
                          {bulkImportStatus === 'writing' && (
                            <div className="mt-2 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                              <div className="h-full bg-primary-500 transition-all duration-300"
                                style={{ width: `${bulkImportProgress.total ? (bulkImportProgress.done / bulkImportProgress.total) * 100 : 0}%` }} />
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Automatic Alert: Near Expiry Medicines (30 days) — collapsible */}
                    {getNearExpiryMeds().length > 0 && (
                      <div className="bg-danger-50/50 border border-danger-100 rounded-2xl p-5 text-right space-y-3.5 shadow-sm">
                        <button
                          type="button"
                          onClick={() => setShowNearExpiry30(!showNearExpiry30)}
                          className="w-full flex items-center justify-between cursor-pointer text-right"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-3 w-3 relative">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-danger-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-3 w-3 bg-danger-600"></span>
                            </span>
                            <div>
                              <h4 className="font-semibold text-xs text-danger-900">تنبيه تلقائي: مستحضرات قاربت صلاحيتها على الانتهاء (30 يوماً أو أقل)</h4>
                              <p className="text-xs text-danger-500 font-bold mt-0.5 font-sans">يرجى اتخاذ تدابير الوقاية وتوريد كميات جديدة أو إبرام طلبية مرتجع مع المذخر المعني</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm bg-danger-100 text-danger-800 font-semibold px-3 py-0.5 rounded-full border border-danger-200/50">
                              {getNearExpiryMeds().length} {getNearExpiryMeds().length === 1 ? "مستحضر حرج" : "مستحضرات حرجة"}
                            </span>
                            <ChevronDown className={`w-4 h-4 text-danger-400 transition-transform ${showNearExpiry30 ? 'rotate-180' : ''}`} />
                          </div>
                        </button>

                        {showNearExpiry30 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
                          {/* سقف العرض: القائمة قد تضم مئات المواد مع مخزون بحجم ~7000 صنف */}
                          {getNearExpiryMeds().slice(0, EXPIRY_LIST_LIMIT).map(med => {
                            const days = getDaysUntilExpiry(med.id);
                            const expDate = expiryDates[med.id] || '';
                            return (
                              <div key={med.id} className="bg-white border border-danger-100/70 p-3.5 rounded-xl flex items-center justify-between text-xs transition hover:shadow-xs hover:border-danger-200">
                                <div className="space-y-1">
                                  <strong className="font-semibold text-slate-950 block">{med.nameAr}</strong>
                                  <span className="text-sm text-slate-500 tabular-nums block">
                                    {med.nameEn} • {med.scientificName}
                                  </span>
                                  <div className="flex items-center gap-1.5 mt-1">
                                    <Clock className="w-3.5 h-3.5 text-danger-600" />
                                    <span className="text-sm font-bold text-danger-600 tabular-nums">
                                      انتهاء الصلاحية: {expDate}
                                    </span>
                                  </div>
                                </div>
                                
                                <div className="flex flex-col items-end space-y-2.5">
                                  <span className="px-2.5 py-0.5 bg-danger-50 text-danger-800 rounded-lg border border-danger-200/40 font-semibold text-sm tracking-wide">
                                    {days < 0 ? `منتهية منذ ${Math.abs(days)} يوم` : days === 0 ? 'تنتهي اليوم!' : `متبقي ${days} يوم`}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      addToPurchaseDraft(med);
                                      setActiveTab('b2b');
                                    }}
                                    className="text-xs bg-primary-50 hover:bg-primary-100 active:bg-primary-200 text-primary-800 font-bold px-2.5 py-1 rounded-lg transition border border-primary-100 cursor-pointer flex items-center gap-1"
                                  >
                                    <Plus className="w-3 h-3" />
                                    <span>طلب توريد B2B</span>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                          {getNearExpiryMeds().length > EXPIRY_LIST_LIMIT && (
                            <div className="md:col-span-2 text-sm text-slate-500 font-bold text-center py-1">
                              يُعرض {EXPIRY_LIST_LIMIT} من أصل {fmtNum(getNearExpiryMeds().length)} مستحضر — راجع سجلّ الصلاحيات الموسّع أدناه
                            </div>
                          )}
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
                          <div className="flex items-center gap-2.5">
                            <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-warn-50 border border-warn-200">
                              <CalendarClock className="w-4 h-4 text-warn-600" />
                            </span>
                            <div>
                              <h4 className="font-semibold text-xs text-slate-900">سجلّ الصلاحيات الموسّع — أفق 6 أشهر</h4>
                              <p className="text-xs text-slate-500 font-bold mt-0.5">اضغط شهراً لعرض كل المواد المنتهية فيه، مرتّبة بالأولوية (الأقرب انتهاءً أولاً)</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm bg-warn-100 text-warn-800 font-semibold px-3 py-0.5 rounded-full border border-warn-200/50">
                              {getHorizonExpiryMeds().length} مستحضر
                            </span>
                            <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${showExpiryHorizon ? 'rotate-180' : ''}`} />
                          </div>
                        </button>

                        {showExpiryHorizon && (
                          <div className="px-5 pb-5 space-y-4 border-t border-slate-100 pt-4">
                            {/* شرائح اختيار الشهر */}
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => setSelectedExpiryMonth(null)}
                                className={`text-sm font-semibold px-3 py-1.5 rounded-lg border transition cursor-pointer ${selectedExpiryMonth === null ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'}`}
                              >
                                الكل ({getHorizonExpiryMeds().length})
                              </button>
                              {getExpiryMonths().map(mo => (
                                <button
                                  key={mo.key}
                                  type="button"
                                  disabled={mo.count === 0}
                                  onClick={() => setSelectedExpiryMonth(mo.key)}
                                  className={`text-sm font-semibold px-3 py-1.5 rounded-lg border transition flex items-center gap-1.5 ${mo.count === 0 ? 'bg-slate-50/50 text-slate-300 border-slate-100 cursor-not-allowed' : selectedExpiryMonth === mo.key ? 'bg-warn-500 text-white border-warn-500 cursor-pointer' : 'bg-warn-50 text-warn-700 border-warn-200/60 hover:border-warn-300 cursor-pointer'}`}
                                >
                                  <span>{mo.label}</span>
                                  {mo.count > 0 && (
                                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${selectedExpiryMonth === mo.key ? 'bg-white/25' : 'bg-warn-200/70'}`}>{mo.count}</span>
                                  )}
                                </button>
                              ))}
                            </div>

                            {/* القائمة المرتّبة بالأولوية */}
                            {/* سقف العرض: أفق 6 أشهر قد يضم آلاف المواد مع مخزون ~7000 صنف —
                                نُظهر الأعلى أولوية (الأقرب انتهاءً) وتصفية الشهر تُظهر البقية */}
                            {(() => {
                              const horizonFiltered = getHorizonExpiryMeds()
                                .filter(med => selectedExpiryMonth === null || (expiryDates[med.id] || '').substring(0, 7) === selectedExpiryMonth);
                              return (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {horizonFiltered
                                .slice(0, EXPIRY_LIST_LIMIT)
                                .map(med => {
                                  const days = getDaysUntilExpiry(med.id);
                                  const sev = expirySeverity(days);
                                  const tone = sev === 'expired' || sev === 'critical'
                                    ? { card: 'border-danger-100/70 hover:border-danger-200', icon: 'text-danger-600', badge: 'bg-danger-50 text-danger-700 border-danger-200/50' }
                                    : sev === 'warning'
                                    ? { card: 'border-warn-100/70 hover:border-warn-200', icon: 'text-warn-600', badge: 'bg-warn-50 text-warn-700 border-warn-200/50' }
                                    : { card: 'border-slate-200/70 hover:border-slate-300', icon: 'text-slate-500', badge: 'bg-slate-50 text-slate-600 border-slate-200/50' };
                                  return (
                                    <div key={med.id} className={`bg-white border ${tone.card} p-3.5 rounded-xl flex items-center justify-between text-xs transition hover:shadow-xs`}>
                                      <div className="space-y-1">
                                        <strong className="font-semibold text-slate-950 block">{med.nameAr}</strong>
                                        <span className="text-sm text-slate-500 tabular-nums block">{med.nameEn} • {med.scientificName}</span>
                                        <div className="flex items-center gap-1.5 mt-1">
                                          <Clock className={`w-3.5 h-3.5 ${tone.icon}`} />
                                          <span className={`text-sm font-bold tabular-nums ${tone.icon}`}>انتهاء الصلاحية: {expiryDates[med.id]}</span>
                                        </div>
                                      </div>
                                      <div className="flex flex-col items-end space-y-2.5">
                                        <span className={`px-2.5 py-0.5 rounded-lg border font-semibold text-sm tracking-wide ${tone.badge}`}>
                                          {days < 0 ? `منتهية منذ ${Math.abs(days)} يوم` : days === 0 ? 'تنتهي اليوم!' : `متبقي ${days} يوم`}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => { addToPurchaseDraft(med); setActiveTab('b2b'); }}
                                          className="text-xs bg-primary-50 hover:bg-primary-100 active:bg-primary-200 text-primary-800 font-bold px-2.5 py-1 rounded-lg transition border border-primary-100 cursor-pointer flex items-center gap-1"
                                        >
                                          <Plus className="w-3 h-3" />
                                          <span>طلب توريد B2B</span>
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              {horizonFiltered.length > EXPIRY_LIST_LIMIT && (
                                <div className="md:col-span-2 text-sm text-slate-500 font-bold text-center py-1">
                                  يُعرض {EXPIRY_LIST_LIMIT} من أصل {fmtNum(horizonFiltered.length)} مستحضر (الأقرب انتهاءً أولاً) — اختر شهراً لتضييق القائمة
                                </div>
                              )}
                            </div>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    )}

                    {/* المخزون الراكد: رصيد موجود بلا بيع منذ مدة — رأس مال محبوس يُفضَّل إرجاعه للمذخر قبل انتهائه */}
                    <div className="bg-white border border-slate-200/70 rounded-2xl shadow-sm overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setShowDeadStock(!showDeadStock)}
                        className="w-full flex items-center justify-between p-5 text-right hover:bg-slate-50/60 transition cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-slate-100 border border-slate-200">
                            <Clock className="w-4 h-4 text-slate-600" />
                          </span>
                          <div>
                            <h4 className="font-semibold text-xs text-slate-900">المخزون الراكد — لم يُبَع منذ {deadStockDays} يوماً</h4>
                            <p className="text-xs text-slate-500 font-bold mt-0.5">مواد برصيد موجود بلا أي بيع خلال المدة، مرتّبة برأس المال المحبوس فيها — للإرجاع أو التصفية قبل الانتهاء</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm bg-slate-100 text-slate-700 font-semibold px-3 py-0.5 rounded-full border border-slate-200">
                            {fmtNum(deadStock.rows.length)} مادة · {fmtNum(deadStock.total)} د.ع
                          </span>
                          <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${showDeadStock ? 'rotate-180' : ''}`} />
                        </div>
                      </button>
                      {showDeadStock && (
                        <div className="px-5 pb-5 space-y-3 border-t border-slate-100 pt-4">
                          <div className="flex flex-wrap items-center gap-2">
                            {([90, 180, 365] as const).map(d => (
                              <button key={d} type="button" onClick={() => setDeadStockDays(d)}
                                className={`text-sm font-semibold px-3 py-1 rounded-full border transition cursor-pointer ${deadStockDays === d ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>
                                {d} يوماً
                              </button>
                            ))}
                            <input
                              type="text"
                              value={deadStockQuery}
                              onChange={e => setDeadStockQuery(e.target.value)}
                              placeholder="بحث باسم المادة…"
                              className="flex-1 min-w-[160px] bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 focus:outline-primary-500"
                            />
                          </div>
                          <p className="text-xs text-slate-500 font-bold">
                            «لم يُبَع منذ التسجيل» = لا يوجد أي بيع مسجَّل للمادة في التطبيق. تُعرض أعلى {deadStockVisible.length} مادة قيمةً؛ استخدم البحث للوصول لغيرها.
                          </p>
                          {deadStockVisible.length === 0 ? (
                            <p className="text-xs text-slate-500 font-bold text-center py-6">لا مخزون راكد ضمن هذه المدة 🎉</p>
                          ) : (
                            <div className="space-y-1.5 max-h-96 overflow-y-auto pl-1">
                              {deadStockVisible.map(({ med, lastSale, capital }) => {
                                const exp = expiryDates[med.id];
                                return (
                                  <div key={med.id} className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm font-semibold text-slate-800 truncate">{med.nameAr}</p>
                                      <p className="text-xs font-bold text-slate-500 tabular-nums">
                                        بالمخزن: {fmtNum(med.availableQuantity)} · {lastSale ? `آخر بيع: ${lastSale}` : 'لم يُبَع منذ التسجيل'}
                                        {exp && <> · ينتهي: <span className={exp < todayLocalISO() ? 'text-danger-600' : 'text-warn-700'}>{exp.slice(0, 7)}</span></>}
                                      </p>
                                    </div>
                                    <span className="text-xs tabular-nums font-bold text-slate-700 shrink-0">{fmtNum(capital)} <span className="text-xs font-bold text-slate-500">د.ع</span></span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Expandable Box: Add drug Form */}
                    {isAddingDrug && (
                      <form onSubmit={handleAddNewDrug} className="bg-slate-50 p-5 rounded-2xl border border-slate-100 p-6 space-y-4">
                        <h4 className="font-bold text-slate-900 text-xs">إدخال دواء ومستحضر تجميل جديد يدوياً في صيدلية انوار الحسن</h4>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div className="space-y-1">
                            <label className="block text-sm font-bold text-slate-500">الاسم التجاري (عربي):</label>
                            <input 
                              type="text" required
                              value={newDrugAr} onChange={(e) => setNewDrugAr(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-primary-500" 
                              placeholder="مثال: ريفانين خافض حرارة"
                            />
                          </div>
                          
                          <div className="space-y-1">
                            <label className="block text-sm font-bold text-slate-500">الاسم التجاري (إنجليزي):</label>
                            <input 
                              type="text" required
                              value={newDrugEn} onChange={(e) => setNewDrugEn(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-850 focus:outline-primary-500 tabular-nums" 
                              placeholder="Revanin 500mg"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="block text-sm font-bold text-slate-500">الاسم العلمي والمادة النشطة:</label>
                            <input 
                              type="text"
                              value={newDrugSci} onChange={(e) => setNewDrugSci(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-primary-500" 
                              placeholder="Paracetamol"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="block text-sm font-bold text-slate-500">رمز الباركود الدولي (Barcode):</label>
                            <div className="flex gap-1.5">
                              <input 
                                type="text"
                                value={newDrugBarcode} onChange={(e) => setNewDrugBarcode(e.target.value)}
                                className="flex-1 bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-primary-500 tabular-nums" 
                                placeholder="مثال: 6281100115598"
                              />
                              <button
                                type="button"
                                onClick={() => startScanning('add-drug')}
                                className="bg-primary-600 hover:bg-primary-700 active:bg-primary-700 text-white rounded-lg px-2.5 flex items-center justify-center transition cursor-pointer"
                                title="قراءة بالكاميرا (Scan Barcode)"
                              >
                                <Barcode className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <label className="block text-sm font-bold text-slate-500">السعر النقدي للجمهور (د.ع):</label>
                            <input 
                              type="number" required
                              value={newDrugPrice} onChange={(e) => setNewDrugPrice(Number(e.target.value))}
                              className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-primary-500 tabular-nums" 
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="block text-sm font-bold text-slate-500">سعر البيع في قائمة المخزون (د.ع - رسمي):</label>
                            <input 
                              type="number" required
                              value={newDrugSecondaryPrice} onChange={(e) => setNewDrugSecondaryPrice(Number(e.target.value))}
                              className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-primary-500 tabular-nums" 
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="block text-sm font-bold text-slate-500">الكمية الأولية (علبة):</label>
                            <input 
                              type="number" required
                              value={newDrugQty} onChange={(e) => setNewDrugQty(Number(e.target.value))}
                              className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-primary-500 tabular-nums" 
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="block text-sm font-bold text-slate-500">تاريخ انتهاء الصلاحية للمنتج:</label>
                            <input 
                              type="date"
                              value={newDrugExpiry} onChange={(e) => setNewDrugExpiry(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-primary-500 tabular-nums" 
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="block text-sm font-bold text-slate-500">حد التنبيه (أدنى كمية):</label>
                          <input
                            type="number" min="1"
                            value={newDrugMinStock ?? 15}
                            onChange={(e) => setNewDrugMinStock(Number(e.target.value))}
                            className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-primary-500"
                            placeholder="15"
                          />
                        </div>

                        <div className="flex justify-end gap-3 pt-3">
                          <button 
                            type="button" onClick={() => setIsAddingDrug(false)}
                            className="bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer"
                          >
                            إلغاء التراجع
                          </button>
                          <button 
                            type="submit"
                            className="bg-primary-600 hover:bg-primary-700 text-white px-5 py-2 rounded-xl text-xs font-bold cursor-pointer"
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
                      <div className="w-8 h-8 rounded-xl bg-accent-50 flex items-center justify-center shrink-0">
                        <RefreshCw className="w-4 h-4 text-accent-600" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-slate-900 text-sm">حركة المادة — سجل الوارد والصادر</h4>
                        <p className="text-sm text-slate-500 font-bold mt-0.5">اختر صنفاً لعرض كميات الشراء والبيع وتواريخها ضمن مدة زمنية قابلة للتحديد</p>
                      </div>
                    </div>

                    {/* أدوات التحكم: اختيار الصنف + المدى الزمني */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                      <div className="md:col-span-5 space-y-1 relative">
                        <label className="block text-sm font-bold text-slate-500">الصنف / الدواء (بحث بالاسم أو الباركود)</label>
                        <div className="flex gap-1.5">
                          <div className="relative flex-1">
                            <Search className="w-3.5 h-3.5 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
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
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-9 pl-8 py-2.5 text-xs font-bold text-slate-700 focus:outline-accent-400 placeholder:text-slate-500 placeholder:font-medium"
                            />
                            {movementSearch && (
                              <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => { setMovementSearch(''); setMovementMedId(''); setMovementDropdownOpen(false); }}
                                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-600 cursor-pointer bg-transparent border-none p-0"
                                title="مسح"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => startScanning('movement')}
                            className="bg-accent-600 hover:bg-accent-700 text-white rounded-xl px-3 py-2 cursor-pointer transition flex items-center justify-center shrink-0 border-none"
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
                                <p className="text-sm text-slate-500 font-bold text-center py-3">لا توجد نتائج مطابقة</p>
                              ) : filtered.slice(0, MOVEMENT_DROPDOWN_LIMIT).map(m => (
                                // سقف العرض: بدون بحث تتطابق كل الأصناف (~7000 زر) فتجمّد القائمة المنسدلة
                                <button
                                  key={m.id}
                                  type="button"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => {
                                    setMovementMedId(m.id);
                                    setMovementSearch(`${m.nameAr} (${m.nameEn})`);
                                    setMovementDropdownOpen(false);
                                  }}
                                  className={`w-full text-right px-3 py-2 hover:bg-accent-50 cursor-pointer border-none flex items-center justify-between gap-2 transition ${m.id === movementMedId ? 'bg-accent-50' : 'bg-transparent'}`}
                                >
                                  <div className="min-w-0">
                                    <span className="block text-sm font-bold text-slate-800 truncate">{m.nameAr} <span className="text-slate-500 tabular-nums text-xs">{m.nameEn}</span></span>
                                    <span className="block text-xs text-slate-500 tabular-nums">{m.barcode || '—'}</span>
                                  </div>
                                  <span className="text-xs text-slate-500 font-bold shrink-0 whitespace-nowrap">{m.availableQuantity} علبة</span>
                                </button>
                              ))}
                              {filtered.length > MOVEMENT_DROPDOWN_LIMIT && (
                                <p className="text-sm text-slate-500 font-bold text-center py-2">
                                  يُعرض {MOVEMENT_DROPDOWN_LIMIT} من أصل {fmtNum(filtered.length)} صنف — اكتب في البحث لعرض المزيد
                                </p>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                      <div className="md:col-span-3 space-y-1">
                        <label className="block text-sm font-bold text-slate-500">من تاريخ</label>
                        <input
                          type="date"
                          value={movementFrom}
                          onChange={(e) => setMovementFrom(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-700 tabular-nums focus:outline-accent-400"
                        />
                      </div>
                      <div className="md:col-span-3 space-y-1">
                        <label className="block text-sm font-bold text-slate-500">إلى تاريخ</label>
                        <input
                          type="date"
                          value={movementTo}
                          onChange={(e) => setMovementTo(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-700 tabular-nums focus:outline-accent-400"
                        />
                      </div>
                      <div className="md:col-span-1">
                        <button
                          type="button"
                          onClick={() => { setMovementFrom(''); setMovementTo(''); }}
                          className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-2.5 rounded-xl text-sm cursor-pointer transition border-none"
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
                        <p className="text-sm text-slate-500 font-bold">اختر صنفاً من القائمة أعلاه لعرض سجل حركته (الوارد والصادر)</p>
                      </div>
                    ) : (() => {
                      const med = inventory.find(m => m.id === movementMedId);
                      const { movements, totalIn, totalOut, valueIn, valueOut } = getStockMovements(movementMedId, movementFrom, movementTo);
                      const net = totalIn - totalOut;
                      return (
                        <div className="space-y-4">
                          {/* بطاقات الملخص */}
                          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                            <div className="bg-primary-50 border border-primary-100 rounded-2xl p-4">
                              <span className="text-xs text-primary-700 font-bold block mb-1">إجمالي الوارد (شراء)</span>
                              <strong className="text-lg font-bold text-money-700 tabular-nums block">{fmtNum(totalIn)} <span className="text-xs font-bold">علبة</span></strong>
                              <span className="text-xs text-money-600/70 font-bold tabular-nums">{fmtNum(valueIn)} د.ع</span>
                            </div>
                            <div className="bg-info-50 border border-info-100 rounded-2xl p-4">
                              <span className="text-xs text-info-700 font-bold block mb-1">إجمالي الصادر (بيع)</span>
                              <strong className="text-lg font-bold text-info-700 tabular-nums block">{fmtNum(totalOut)} <span className="text-xs font-bold">علبة</span></strong>
                              <span className="text-xs text-info-600/70 font-bold tabular-nums">{fmtNum(valueOut)} د.ع</span>
                            </div>
                            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                              <span className="text-xs text-slate-500 font-bold block mb-1">صافي الحركة</span>
                              <strong className={`text-lg font-bold tabular-nums block ${net >= 0 ? 'text-money-700' : 'text-danger-600'}`}>{net >= 0 ? '+' : ''}{fmtNum(net)} <span className="text-xs font-bold">علبة</span></strong>
                              <span className="text-xs text-slate-500 font-bold">وارد − صادر</span>
                            </div>
                            <div className="bg-accent-50 border border-accent-100 rounded-2xl p-4">
                              <span className="text-xs text-accent-700 font-bold block mb-1">الرصيد الحالي بالمخزن</span>
                              <strong className="text-lg font-bold text-accent-700 tabular-nums block">{fmtNum((med?.availableQuantity ?? 0))} <span className="text-xs font-bold">علبة</span></strong>
                              <span className="text-xs text-accent-600/70 font-bold">{med?.nameAr}</span>
                            </div>
                          </div>

                          {/* جدول الحركات الزمني */}
                          {movements.length === 0 ? (
                            <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl py-8 text-center">
                              <p className="text-sm text-slate-500 font-bold">لا توجد حركات مسجّلة لهذا الصنف{(movementFrom || movementTo) ? ' ضمن المدى الزمني المحدد' : ''}</p>
                            </div>
                          ) : (
                            <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                              <table className="w-full text-right text-sm">
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
                                      <td className="py-2.5 px-3 tabular-nums text-slate-500 whitespace-nowrap">{mv.date}</td>
                                      <td className="py-2.5 px-3 text-center">
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-bold ${mv.type === 'in' ? 'bg-primary-50 text-primary-700 border-primary-100' : 'bg-info-50 text-info-700 border-info-100'}`}>
                                          {mv.type === 'in' ? '↓ وارد (شراء)' : '↑ صادر (بيع)'}
                                        </span>
                                      </td>
                                      <td className={`py-2.5 px-3 text-center tabular-nums font-bold ${mv.type === 'in' ? 'text-primary-700' : 'text-info-700'}`}>
                                        {mv.type === 'in' ? '+' : '−'}{fmtNum(mv.qty)}
                                      </td>
                                      <td className="py-2.5 px-3 text-center tabular-nums text-slate-600">{fmtNum(mv.price)} د.ع</td>
                                      <td className="py-2.5 px-3 text-center tabular-nums font-bold text-slate-700">{fmtNum((mv.qty * mv.price))} د.ع</td>
                                      <td className="py-2.5 px-3 tabular-nums text-slate-500">{mv.ref}</td>
                                      <td className="py-2.5 px-3 text-slate-600 font-semibold max-w-[160px] truncate" title={mv.party}>{mv.party}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                          <p className="text-xs text-slate-500 font-bold">* الوارد يُحتسب من طلبيات الشراء (المذاخر)، والصادر من سجل فواتير البيع (POS). عدد الحركات: {movements.length}</p>
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
                      <div className="bg-warn-50 border border-warn-200 rounded-2xl p-4 space-y-3">
                        {/* رأس القسم — قابل للطي */}
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => setShowLowStock(p => !p)}
                            className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition text-right"
                          >
                            <AlertCircle className="w-4 h-4 text-warn-600 shrink-0" />
                            <span className="text-xs font-bold text-warn-900">أصناف نفدت أو شارفت على النفاد</span>
                            <span className="text-sm bg-warn-200 text-warn-900 font-semibold px-2.5 py-0.5 rounded-full">{lowItems.length} صنف</span>
                            <ChevronDown className={`w-3.5 h-3.5 text-warn-600 transition-transform duration-200 ${showLowStock ? 'rotate-180' : ''}`} />
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
                                <p style="color:#666;font-size:12px">${fmtDate(new Date())}</p>
                                <table><thead><tr><th>الدواء</th><th>الكمية الحالية</th><th>الكمية المقترحة للطلب</th></tr></thead>
                                <tbody>${lowItems.map(m => `<tr><td>${escapeHtml(m.nameAr)}</td><td>${m.availableQuantity} علبة</td><td>${getSuggestedQty(m)} علبة</td></tr>`).join('')}
                                </tbody></table></body></html>
                              `);
                              win.document.close();
                              win.print();
                            }}
                            className="flex items-center gap-1.5 text-sm font-bold bg-warn-200 hover:bg-warn-300 text-warn-900 px-3 py-1.5 rounded-xl transition cursor-pointer border-none"
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
                              <div key={m.id} className="bg-white border border-warn-100 rounded-xl px-3 py-2.5 flex items-center justify-between text-xs gap-2">
                                <div className="min-w-0 flex-1">
                                  <span className="font-bold text-slate-800 block">{m.nameAr}</span>
                                  <span className={`tabular-nums font-bold text-sm ${m.availableQuantity === 0 ? 'text-danger-600' : 'text-warn-600'}`}>
                                    {m.availableQuantity === 0 ? 'نفد المخزون' : `${m.availableQuantity} علبة متبقية`}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {/* اقتراح الكمية */}
                                  <div className="text-center">
                                    <span className="text-xs text-slate-500 font-bold block">اقتراح الطلب</span>
                                    <span className="text-sm font-bold text-primary-700 bg-primary-50 px-2 py-0.5 rounded-lg tabular-nums">
                                      {suggestedQty} علبة
                                    </span>
                                    {maxPast > 0 && (
                                      <span className="text-xs text-slate-500 block">بناءً على {maxPast} سابقاً</span>
                                    )}
                                  </div>
                                  {/* زر إضافة للشراء */}
                                  <button
                                    type="button"
                                    onClick={() => { addToPurchaseDraft(m, suggestedQty); setActiveTab('b2b'); }}
                                    className="text-xs font-bold px-2.5 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition cursor-pointer border-none"
                                  >
                                    أضف للشراء
                                  </button>
                                  {/* زر الإخفاء */}
                                  <button
                                    type="button"
                                    onClick={() => setDismissedLowStock(prev => new Set([...prev, m.id]))}
                                    className="text-xs font-bold px-2 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-lg transition cursor-pointer border-none"
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
                            className="text-xs text-warn-700 font-bold underline cursor-pointer bg-transparent border-none"
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
                      <InventorySearchBar ref={invSearchRef} onQueryChange={handleInvQueryChange} />
                      {searchInInventoryQuery && (
                        <button
                          type="button"
                          onClick={() => { invSearchRef.current?.setValue(''); }}
                          className="text-sm font-bold text-slate-500 hover:text-danger-600 px-2 py-2 transition cursor-pointer"
                        >
                          مسح ✕
                        </button>
                      )}
                      <div className="flex-1" />
                      <button
                        type="button"
                        onClick={() => startScanning('inventory')}
                        className="bg-white border border-slate-200 hover:border-primary-300 text-slate-600 hover:text-primary-700 rounded-xl px-3 py-2 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                        title="قراءة الباركود بالكاميرا"
                      >
                        <Barcode className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setIsAddingDrug(!isAddingDrug)}
                        className="bg-primary-600 hover:bg-primary-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl cursor-pointer transition flex items-center gap-1.5"
                      >
                        <Plus className="w-4 h-4" />
                        <span>إضافة دواء</span>
                      </button>
                      {/* زر مؤقت للاختبار */}
                      <button
                        onClick={handleSeedTestData}
                        className="bg-warn-500 hover:bg-warn-600 text-white font-bold text-xs px-3.5 py-2 rounded-xl cursor-pointer transition flex items-center gap-1.5"
                        title="إضافة 5 أدوية تجريبية"
                      >
                        <span className="inline-flex items-center gap-1"><FlaskConical className="w-3.5 h-3.5" />بيانات تجريبية</span>
                      </button>
                      {currentRole === 'admin' && (
                        <button
                          onClick={() => setShowBulkImportConfirm(true)}
                          disabled={bulkImportStatus === 'loading' || bulkImportStatus === 'writing'}
                          className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs px-3.5 py-2 rounded-xl cursor-pointer transition flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
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
                          <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100 text-sm">
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
                          {filteredInventory.length === 0 && (
                            <tr>
                              <td colSpan={8} className="px-4 py-14 text-center">
                                {inventory.length === 0 ? (
                                  <div className="flex flex-col items-center gap-3">
                                    <Pill className="w-9 h-9 text-slate-300" />
                                    <p className="text-sm font-bold text-slate-600">المخزون فارغ تماماً — لا مادة مسجَّلة بعد</p>
                                    <div className="flex flex-wrap items-center justify-center gap-2">
                                      <button type="button" onClick={() => setIsAddingDrug(true)}
                                        className="bg-primary-600 hover:bg-primary-700 text-white font-bold text-sm px-4 py-2 rounded-xl cursor-pointer transition flex items-center gap-1.5">
                                        <Plus className="w-4 h-4" /><span>إضافة أول مادة</span>
                                      </button>
                                      <button type="button" onClick={handleSeedTestData}
                                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm px-4 py-2 rounded-xl cursor-pointer transition flex items-center gap-1.5">
                                        <FlaskConical className="w-4 h-4" /><span>بيانات تجريبية</span>
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex flex-col items-center gap-3">
                                    <Search className="w-9 h-9 text-slate-300" />
                                    <p className="text-sm font-bold text-slate-600">لا نتائج مطابقة لـ«{searchInInventoryQuery}»</p>
                                    <button type="button" onClick={() => setSearchInInventoryQuery('')}
                                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm px-4 py-2 rounded-xl cursor-pointer transition">
                                      مسح البحث
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                          {filteredInventory.slice(0, invRenderCap).map((med, idx) => {
                              const expDate = expiryDates[med.id] || '2028-01-01';
                              const daysRemaining = getDaysUntilExpiry(med.id);
                              const isNearExpiry30 = daysRemaining <= 30;
                              return (
                                <React.Fragment key={med.id}>
                                <tr
                                  className={`transition border-b border-slate-100 ${isNearExpiry30 ? 'bg-danger-50/65 hover:bg-danger-100/70 text-danger-950' : 'hover:bg-slate-50/50'}`}
                                >
                                  <td className="py-3 px-4 tabular-nums text-slate-500">REF-{1000 + idx}</td>
                                  <td className="py-3 px-4 space-y-0.5">
                                    <strong className="text-slate-900 block font-bold">{med.nameAr}</strong>
                                    <span className="text-sm text-slate-500 tabular-nums block">{med.nameEn} • {med.scientificName}</span>
                                    {med.manufacturer && (
                                      <span className="text-xs text-slate-500 font-bold flex items-center gap-1"><Factory className="w-3 h-3 shrink-0" />{med.manufacturer}</span>
                                    )}
                                  </td>
                                  {editingPriceId === med.id ? (
                                    <>
                                      <td className="py-3 px-4 tabular-nums">
                                        <input
                                          type="number" min={0} step={250} autoFocus
                                          value={editingPriceValue}
                                          onChange={(e) => setEditingPriceValue(e.target.value)}
                                          onKeyDown={(e) => { if (e.key === 'Enter') saveEditingPrice(med.id); if (e.key === 'Escape') setEditingPriceId(null); }}
                                          className="w-24 bg-white border border-primary-300 rounded-lg px-2 py-1 text-xs text-primary-900 tabular-nums font-bold text-center focus:outline-primary-500"
                                        />
                                      </td>
                                      <td className="py-3 px-4 tabular-nums">
                                        <div className="flex items-center gap-1.5">
                                          <input
                                            type="number" min={0} step={250}
                                            value={editingSecondaryPriceValue}
                                            onChange={(e) => setEditingSecondaryPriceValue(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === 'Enter') saveEditingPrice(med.id); if (e.key === 'Escape') setEditingPriceId(null); }}
                                            className="w-24 bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-700 tabular-nums font-bold text-center focus:outline-slate-400"
                                          />
                                          <button type="button" onClick={() => saveEditingPrice(med.id)} className="bg-primary-600 hover:bg-primary-700 text-white px-2 py-1 rounded-lg transition cursor-pointer" title="حفظ السعر"><Check className="w-3.5 h-3.5" /></button>
                                          <button type="button" onClick={() => setEditingPriceId(null)} className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1 rounded-lg transition cursor-pointer" title="إلغاء"><X className="w-3.5 h-3.5" /></button>
                                        </div>
                                      </td>
                                    </>
                                  ) : (
                                    <>
                                      <td className="py-3 px-4 tabular-nums font-bold text-primary-800">
                                        <button type="button" onClick={() => startEditingPrice(med)} className="group flex items-center gap-1.5 hover:text-primary-600 transition cursor-pointer" title="تعديل السعر">
                                          <span>{fmtNum(med.price)} د.ع</span>
                                          <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 transition" />
                                        </button>
                                      </td>
                                      <td className="py-3 px-4 tabular-nums font-bold text-slate-500/80">{fmtNum((med.secondaryPrice || (med.price + 500)))} د.ع</td>
                                    </>
                                  )}
                                  <td className="py-3 px-4 tabular-nums">
                                    <span className={`px-2 py-0.5 rounded-full font-bold ${med.availableQuantity <= 0 ? 'bg-danger-100 text-danger-800 font-sans text-sm' : med.availableQuantity < 15 ? 'bg-warn-100 text-warn-800 font-sans text-sm' : 'text-slate-800'}`}>
                                      {med.availableQuantity <= 0 ? 'نفذ بالكامل' : `${med.availableQuantity} علبة`}
                                    </span>
                                    {med.availableQuantity <= (med.minStock ?? 15) && med.availableQuantity > 0 && (
                                      <span className="text-xs bg-warn-500 text-white font-bold px-1.5 py-0.5 rounded mr-1">طلب عاجل</span>
                                    )}
                                  </td>
                                  <td className={`py-3 px-4 tabular-nums font-bold ${isNearExpiry30 ? 'text-danger-600' : 'text-slate-500'}`}>
                                    <div className="flex items-center gap-1">
                                      {isNearExpiry30 && <AlertCircle className="w-3.5 h-3.5" />}
                                      <span>{expDate}</span>
                                    </div>
                                  </td>
                                  <td className="py-3 px-4">
                                    {editingQtyId === med.id ? (
                                      <div className="flex items-center justify-center gap-1.5">
                                        <input
                                          type="number" min={0} autoFocus
                                          value={editingQtyValue}
                                          onChange={(e) => setEditingQtyValue(e.target.value)}
                                          onKeyDown={(e) => { if (e.key === 'Enter') saveEditingQty(med.id); if (e.key === 'Escape') setEditingQtyId(null); }}
                                          className="w-20 bg-white border border-primary-300 rounded-lg px-2 py-1 text-xs text-slate-800 tabular-nums font-bold text-center focus:outline-primary-500"
                                        />
                                        <button type="button" onClick={() => saveEditingQty(med.id)} className="bg-primary-600 hover:bg-primary-700 text-white px-2 py-1 rounded-lg transition cursor-pointer" title="حفظ"><Check className="w-3.5 h-3.5" /></button>
                                        <button type="button" onClick={() => setEditingQtyId(null)} className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1 rounded-lg transition cursor-pointer" title="إلغاء"><X className="w-3.5 h-3.5" /></button>
                                      </div>
                                    ) : (
                                      <div className="flex items-center justify-center gap-1.5">
                                        <button type="button" onClick={() => startEditingQty(med)} className="bg-primary-50 hover:bg-primary-100 text-primary-800 px-2.5 py-1 rounded-lg font-bold transition cursor-pointer text-sm flex items-center gap-1 border border-primary-100" title="تعديل الكمية يدوياً"><Pencil className="w-3 h-3" /><span>تعديل</span></button>
                                        <button onClick={() => adjustStockQty(med.id, 10)} className="bg-slate-100 hover:bg-primary-100 text-slate-600 hover:text-primary-800 px-3 py-2 min-h-10 rounded-lg font-bold transition cursor-pointer text-xs" title="إضافة 10 علب">+10</button>
                                        <button onClick={() => adjustStockQty(med.id, -5)} className="bg-slate-100 hover:bg-danger-100 text-slate-600 hover:text-danger-800 px-3 py-2 min-h-10 rounded-lg font-bold transition cursor-pointer text-xs" title="تخفيض 5 علب">-5</button>
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-3 px-4 text-center">
                                    <div className="flex items-center justify-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => quickAuditId === med.id ? setQuickAuditId(null) : startQuickAudit(med)}
                                        className={`px-2.5 py-1 rounded-lg text-sm font-bold transition cursor-pointer border ${quickAuditId === med.id ? 'bg-special-600 text-white border-special-600' : 'bg-special-50 text-special-700 border-special-200 hover:bg-special-100'}`}
                                        title="جرد سريع"
                                      >
                                        جرد
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setDeleteMedTarget(med)}
                                        className="text-slate-500 hover:text-white hover:bg-danger-600 p-1.5 rounded-lg transition cursor-pointer border border-transparent hover:border-danger-600"
                                        title="حذف المادة نهائياً"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>

                                {/* صف الجرد السريع الموسّع */}
                                {quickAuditId === med.id && (
                                  <tr className="bg-special-50/80 border-b border-special-100">
                                    <td colSpan={8} className="px-4 py-4">
                                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
                                        <div className="space-y-1">
                                          <label className="block text-sm font-bold text-special-700">الاسم عربي</label>
                                          <input value={qaNameAr} onChange={e => setQaNameAr(e.target.value)}
                                            className="w-full bg-white border border-special-200 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-800 focus:outline-special-500" />
                                        </div>
                                        <div className="space-y-1">
                                          <label className="block text-sm font-bold text-special-700">الاسم إنجليزي</label>
                                          <input value={qaNameEn} onChange={e => setQaNameEn(e.target.value)}
                                            className="w-full bg-white border border-special-200 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-800 focus:outline-special-500" />
                                        </div>
                                        <div className="space-y-1">
                                          <label className="block text-sm font-bold text-special-700">سعر البيع (د.ع)</label>
                                          <input type="number" min={0} step={250} value={qaPrice} onChange={e => setQaPrice(e.target.value)}
                                            className="w-full bg-white border border-special-200 rounded-lg px-2 py-1.5 text-xs tabular-nums font-bold text-slate-800 focus:outline-special-500" />
                                        </div>
                                        <div className="space-y-1">
                                          <label className="block text-sm font-bold text-special-700">سعر الشراء (د.ع)</label>
                                          <input type="number" min={0} step={250} value={qaCostPrice} onChange={e => setQaCostPrice(e.target.value)}
                                            className="w-full bg-white border border-special-200 rounded-lg px-2 py-1.5 text-xs tabular-nums font-bold text-slate-800 focus:outline-special-500" />
                                        </div>
                                        <div className="space-y-1">
                                          <label className="block text-sm font-bold text-special-700">الكمية الفعلية</label>
                                          <input type="number" min={0} value={qaQty} onChange={e => setQaQty(e.target.value)}
                                            className="w-full bg-white border border-special-200 rounded-lg px-2 py-1.5 text-xs tabular-nums font-bold text-slate-800 focus:outline-special-500" />
                                        </div>
                                        <div className="space-y-1">
                                          <label className="block text-sm font-bold text-special-700">انتهاء الصلاحية</label>
                                          <input type="date" value={qaExpiry} onChange={e => setQaExpiry(e.target.value)}
                                            className="w-full bg-white border border-special-200 rounded-lg px-2 py-1.5 text-xs tabular-nums font-bold text-slate-800 focus:outline-special-500" />
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2 mt-3">
                                        <button type="button" onClick={() => saveQuickAudit(med.id)}
                                          className="bg-special-600 hover:bg-special-700 text-white px-4 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5">
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
                          className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-5 py-2.5 rounded-xl cursor-pointer transition"
                        >
                          عرض المزيد ({filteredInventory.length - invRenderCap} مادة متبقية)
                        </button>
                      </div>
                    )}
                  </div>

                  </div>
                </motion.div>

  );
}
