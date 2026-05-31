import { useState } from 'react';
import { motion } from 'motion/react';
import { ECOSYSTEM_SERVICES } from '../data';
import { EcosystemService } from '../types';
import { LayoutGrid, Cpu, ShoppingBag, Users, CreditCard, Percent, ShieldPlus, ArrowDown } from 'lucide-react';

const ICONS_MAP: Record<string, any> = {
  LayoutGrid: LayoutGrid,
  Cpu: Cpu,
  ShoppingBag: ShoppingBag,
  Users: Users,
  CreditCard: CreditCard,
  ReceiptPercent: Percent,
  ShieldPlus: ShieldPlus
};

export default function Ecosystem() {
  const [selectedId, setSelectedId] = useState<string>('b2b');

  const selectedService = ECOSYSTEM_SERVICES.find(s => s.id === selectedId) || ECOSYSTEM_SERVICES[0];

  const IconComponent = ICONS_MAP[selectedService.iconName] || LayoutGrid;

  return (
    <section className="py-16 bg-white border-y border-slate-100 text-right" id="ecosystem-section">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header Section */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="text-xs font-extrabold text-blue-600 bg-blue-100/70 border border-blue-200/40 px-3 py-1.5 rounded-full uppercase tracking-wider inline-block mb-3">
            بوابة الخدمات السبع المتكاملة
          </span>
          <h2 className="text-3xl font-black text-slate-900 sm:text-4xl">
            منظومة انوار الحسن الرقمية المتكاملة
          </h2>
          <p className="mt-3 text-base text-slate-600 leading-relaxed font-semibold">
            أدوات متخصصة تخدم الصيدليات ومستودعات الأدوية والمندوبين والمؤسسات الطبية في العراق، كلها مرتبطة معاً لتسريع نمو وتوسيع قطاع الرعاية الصحية.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          
          {/* Left / Sidebar Column: App selection list */}
          <div className="lg:col-span-5 space-y-3.5" id="ecosystem-grid-selector">
            <span className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-4 mr-1">
              اختر أحد تطبيقات المنظومة للاستعراض:
            </span>
            
            {ECOSYSTEM_SERVICES.map((serv) => {
              const ServiceIcon = ICONS_MAP[serv.iconName] || LayoutGrid;
              const isSelected = serv.id === selectedId;

              // Color classes based on service color
              let colorClass = 'hover:border-slate-300';
              if (isSelected) {
                if (serv.color === 'emerald') colorClass = 'border-emerald-500 bg-emerald-50/50 text-emerald-950';
                else if (serv.color === 'blue') colorClass = 'border-blue-500 bg-blue-50/50 text-blue-950';
                else if (serv.color === 'purple') colorClass = 'border-purple-500 bg-purple-50/50 text-purple-950';
                else if (serv.color === 'amber') colorClass = 'border-amber-500 bg-amber-50/50 text-amber-950';
                else if (serv.color === 'teal') colorClass = 'border-teal-500 bg-teal-50/50 text-teal-950';
                else if (serv.color === 'rose') colorClass = 'border-rose-500 bg-rose-50/50 text-rose-950';
                else colorClass = 'border-indigo-500 bg-indigo-50/50 text-indigo-950';
              }

              return (
                <button
                  key={serv.id}
                  onClick={() => setSelectedId(serv.id)}
                  className={`w-full flex items-center space-x-reverse space-x-4 p-4 rounded-2xl border transition-all duration-300 text-right cursor-pointer ${colorClass} ${
                    isSelected ? 'shadow-sm z-10' : 'border-slate-100 bg-slate-50/50 text-slate-700'
                  }`}
                  id={`eco-btn-${serv.id}`}
                >
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
                    isSelected 
                      ? 'bg-white shadow-sm font-black' 
                      : 'bg-white text-slate-500'
                  }`}>
                    <ServiceIcon className={`w-5.5 h-5.5 ${
                      isSelected ? 'text-emerald-600' : 'text-slate-400'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-sm tracking-tight text-slate-900 truncate">
                        {serv.titleAr}
                      </h4>
                      <span className="text-[9px] text-slate-400 font-mono" dir="ltr">
                        {serv.titleEn}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-medium truncate mt-0.5">
                      {serv.badge}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right Column: Detailed Showcase Screen */}
          <div className="lg:col-span-7" id="ecosystem-view-screen">
            <div className="bg-slate-50 rounded-[32px] border border-slate-100 p-8 shadow-sm flex flex-col min-h-[500px] justify-between text-right relative overflow-hidden">
              
              {/* Decorative Corner Badge */}
              <div className="absolute top-0 left-0 bg-slate-900 text-white rounded-br-2xl py-1.5 px-4 font-bold text-[10px] uppercase font-mono tracking-wider">
                Live Preview
              </div>

              <div className="space-y-6">
                
                {/* Visual Icon and badges */}
                <div className="flex items-center space-x-reverse space-x-4 pt-4">
                  <div className="w-16 h-16 bg-white rounded-2xl shadow-md flex items-center justify-center text-slate-800">
                    <IconComponent className="w-8 h-8 text-emerald-600" />
                  </div>
                  <div>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-extrabold px-3 py-1 rounded-full block w-max uppercase tracking-wider mb-1">
                      {selectedService.badge}
                    </span>
                    <h3 className="text-2xl font-black text-slate-900 flex items-center space-x-reverse space-x-2">
                      <span>{selectedService.titleAr}</span>
                      <span className="text-sm font-semibold text-slate-400 font-mono" dir="ltr">
                        ({selectedService.titleEn})
                      </span>
                    </h3>
                  </div>
                </div>

                {/* Rich text block */}
                <div className="space-y-4">
                  <p className="text-base text-slate-700 font-medium leading-relaxed">
                    {selectedService.description}
                  </p>
                </div>

                {/* Detailed Mock App Subsystem Presentation */}
                <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm space-y-4 font-sans text-xs">
                  <span className="text-[10px] font-extrabold text-slate-400 block tracking-widest mr-1 mb-1 uppercase">
                    أهم الميزات والحلول المصممة:
                  </span>

                  {selectedService.id === 'b2b' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-3 bg-slate-50 rounded-xl">
                        <span className="font-bold text-slate-800 block mb-0.5">البحث المتقدم الذكي</span>
                        <p className="text-[10px] text-slate-500 leading-normal">تصفية سهلة وفورية ومقارنات فورية للأسعار والبونص لعلب الأدوية.</p>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-xl">
                        <span className="font-bold text-slate-800 block mb-0.5">نظام الطلب الموحد</span>
                        <p className="text-[10px] text-slate-500 leading-normal">إرسال الفواتير لعدة مذاخر بضغطة واحدة وتجميع الشحنات بمكان واحد.</p>
                      </div>
                    </div>
                  )}

                  {selectedService.id === 'plus' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-3 bg-slate-50 rounded-xl">
                        <span className="font-bold text-slate-800 block mb-0.5">نقطة بيع سحابية POS</span>
                        <p className="text-[10px] text-slate-500 leading-normal">بيع دوائي ومبيعات سريعة بلمسة واحدة تدعم شاشات اللمس والباركود.</p>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-xl">
                        <span className="font-bold text-slate-800 block mb-0.5 font-bold">تنبيهات انتهاء الصلاحية</span>
                        <p className="text-[10px] text-slate-500 leading-normal">تنبيه آلي للأدوية القريبة لانتهاء الصلاحية قبل 6 أشهر لتسهيل تصريفها.</p>
                      </div>
                    </div>
                  )}

                  {selectedService.id === 'market' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-3 bg-slate-50 rounded-xl">
                        <span className="font-bold text-slate-800 block mb-0.5 font-bold">أجهزة مخبرية وعلمية</span>
                        <p className="text-[10px] text-slate-500 leading-normal">طلب أجهزة القياس والتحاليل من الوكيل مباشرة مجهزة بشهادة ضمان رسمية.</p>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-xl">
                        <span className="font-bold text-slate-800 block mb-0.5 font-bold">باقة مستحضرات تجميلية</span>
                        <p className="text-[10px] text-slate-500 leading-normal">شراء كوزمتك ومستحضرات تجميل بأسعار تصفية حصرية تدر أرباحاً لصيدليتك.</p>
                      </div>
                    </div>
                  )}

                  {selectedService.id === 'nod' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-3 bg-slate-50 rounded-xl">
                        <span className="font-bold text-slate-800 block mb-0.5 font-bold">جدولة الزيارات الذكية</span>
                        <p className="text-[10px] text-slate-500 leading-normal">جدولة زيارات المندوبين للصيدليات لتجنب تضارب المواعيد وساعات الذروة.</p>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-xl">
                        <span className="font-bold text-slate-800 block mb-0.5 font-bold">حجوزات علمية ميسرة</span>
                        <p className="text-[10px] text-slate-500 leading-normal">توصيل عينات الأدوية والمواد الإرشادية والترويجية وتتبعها بالكامل.</p>
                      </div>
                    </div>
                  )}

                  {selectedService.id === 'pay' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-3 bg-slate-50 rounded-xl">
                        <span className="font-bold text-slate-800 block mb-0.5 font-bold">تسوية الفواتير اللاسلكية</span>
                        <p className="text-[10px] text-slate-500 leading-normal">ادفع للم مذاخر والموزعين بضغطة زر واحدة عبر محافظ العراق المعتمدة مجاناً.</p>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-xl">
                        <span className="font-bold text-slate-800 block mb-0.5 font-bold">الجدولة والديون</span>
                        <p className="text-[10px] text-slate-500 leading-normal">تسجيل ومتابعة تواريخ الاستحقاق وجدولة المدفوعات الدوائية بلا تعقيد.</p>
                      </div>
                    </div>
                  )}

                  {selectedService.id === 'offer' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-3 bg-slate-50 rounded-xl">
                        <span className="font-bold text-slate-800 block mb-0.5 font-bold">الشراء التعاوني لأسنان الدواء</span>
                        <p className="text-[10px] text-slate-500 leading-normal">الاستفادة كصيدلي صغير من بونص الكميات الضخمة من شركات الأدوية العالمية.</p>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-xl">
                        <span className="font-bold text-slate-800 block mb-0.5 font-bold">عروض بونص تصل لـ 50%</span>
                        <p className="text-[10px] text-slate-500 leading-normal">مستويات بونص فريدة تطرح حصرياً عبر تجمع انوار الحسن المشترك.</p>
                      </div>
                    </div>
                  )}

                  {selectedService.id === '360' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-3 bg-slate-50 rounded-xl">
                        <span className="font-bold text-slate-800 block mb-0.5 font-bold font-bold">تتبع الوصفة الإلكترونية</span>
                        <p className="text-[10px] text-slate-500 leading-normal">يتيح المريض للصيدليات البحث عن الدواء ووصفته رقمياً لتوفير ثوانٍ التوصيل.</p>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-xl">
                        <span className="font-bold text-slate-800 block mb-0.5 font-bold">توجه لأقرب صيدلية متوفرة</span>
                        <p className="text-[10px] text-slate-500 leading-normal">ربط فوري يرسل المرضى مباشرة للصيدلية التي تحتضن الدواء المفقود.</p>
                      </div>
                    </div>
                  )}

                </div>
              </div>

              {/* Action Banner inside preview */}
              <div className="mt-8 pt-6 border-t border-slate-200/50 flex flex-col sm:flex-row items-center justify-between text-xs gap-4">
                <span className="text-slate-500 font-bold">كل هذه الخدمات مرتبطة ومؤمنة في حساب انوار الحسن واحد موحد.</span>
                <span className="text-emerald-700 font-extrabold flex items-center space-x-reverse space-x-1.5 bg-emerald-100/50 px-3 py-1.5 rounded-lg">
                  <span>فعال وآمن 100%</span>
                </span>
              </div>

            </div>
          </div>

        </div>

      </div>
    </section>
  );
}
