import { motion } from 'motion/react';
import { ShieldCheck, TrendingUp, Users, ArrowUpRight, Search, CheckCircle2, Star, Sparkles } from 'lucide-react';

interface HeroProps {
  onSearchClick: () => void;
  onRegisterClick: () => void;
  onPortalClick: () => void;
}

export default function Hero({ onSearchClick, onRegisterClick, onPortalClick }: HeroProps) {
  return (
    <section className="relative bg-gradient-to-b from-emerald-50/70 via-white to-slate-50/30 pt-10 pb-20 overflow-hidden" id="hero-section">
      {/* Abstract Background Orbs */}
      <div className="absolute top-1/4 right-0 -translate-y-1/2 translate-x-1/2 w-[500px] h-[500px] bg-emerald-100 rounded-full mix-blend-multiply filter blur-3xl opacity-40 -z-10 animate-pulse-slow" />
      <div className="absolute bottom-10 left-10 w-[350px] h-[350px] bg-blue-100 rounded-full mix-blend-multiply filter blur-3xl opacity-30 -z-10" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-right">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Text Content */}
          <div className="lg:col-span-7 space-y-8">
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="inline-flex items-center space-x-reverse space-x-2 bg-emerald-100/80 border border-emerald-200/50 text-emerald-900 rounded-full px-4 py-2 text-xs font-bold leading-none"
              id="hero-badge"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-700 animate-spin-slow" />
              <span>المنصة الرقمية الدوائية B2B الرائدة في العراق</span>
              <span className="w-1.5 h-1.5 bg-emerald-600 rounded-full animate-ping" />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1 }}
              className="space-y-4"
              id="hero-headings"
            >
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 leading-tight">
                أحدث منظومة لتسهيل <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-500">
                  تجارة الأدوية في العراق
                </span>
              </h1>
              <p className="text-lg text-slate-600 font-medium max-w-2xl leading-relaxed">
                انوار الحسن تربط آلاف الصيدليات والمذاخر العلمية ومستودعات الأدوية بمختلف المحافظات العراقية. تصفح، اطلب وباشر التحصيل المالي وإدارة نواقص صيدليتك في منصة سحابية واحدة مجانية وسريعة للغاية.
              </p>
            </motion.div>

            {/* Quick trust metrics */}
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2 }}
              className="flex flex-wrap gap-y-2 gap-x-6 text-slate-500 text-sm font-bold"
              id="trust-points"
            >
              <span className="flex items-center space-x-reverse space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>أسعار المذاخر المباشرة (0% زيادة)</span>
              </span>
              <span className="flex items-center space-x-reverse space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>مرخصة من نقابة صيادلة العراق</span>
              </span>
              <span className="flex items-center space-x-reverse space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>سرعة فائقة في معالجة الشحنات</span>
              </span>
            </motion.div>

            {/* Action Buttons */}
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.3 }}
              className="flex flex-wrap gap-4 pt-2"
              id="hero-actions"
            >
              <button
                onClick={onRegisterClick}
                className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-extrabold text-base px-8 py-4 rounded-2xl shadow-lg shadow-emerald-200 hover:shadow-xl transition-all duration-300 cursor-pointer transform hover:-translate-y-0.5"
                id="cta-join"
              >
                انضم الآن كصيدلية (مجانًا)
              </button>
              <button
                onClick={onSearchClick}
                className="bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 hover:border-slate-300 font-extrabold text-base px-8 py-4 rounded-2xl shadow-sm transition-all duration-200 cursor-pointer flex items-center space-x-reverse space-x-2"
                id="cta-search"
              >
                <Search className="w-5 h-5 text-slate-500" />
                <span>دليل الأدوية والمذاخر</span>
              </button>
              <button
                onClick={onPortalClick}
                className="w-full sm:w-auto bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-sm px-6 py-4 rounded-2xl transition duration-200 flex items-center justify-center space-x-reverse space-x-2 text-center"
                id="cta-simulation"
              >
                <span>تجربة محاكي التطبيق الحقيقي</span>
                <ArrowUpRight className="w-4 h-4 text-emerald-400" />
              </button>
            </motion.div>

            {/* Micro Stats Minimalist Grid */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="grid grid-cols-3 gap-6 pt-8 border-t border-slate-100 max-w-2xl"
              id="hero-stats-grid"
            >
              <div>
                <p className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
                  <span className="text-emerald-600">+16,000</span>
                </p>
                <p className="text-xs sm:text-sm text-slate-500 font-bold mt-1">
                  صيدلية عراقية مسجلة
                </p>
              </div>
              <div>
                <p className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
                  <span className="text-emerald-600">+450</span>
                </p>
                <p className="text-xs sm:text-sm text-slate-500 font-bold mt-1">
                  مذخر ومستودع معتمد
                </p>
              </div>
              <div>
                <p className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
                  <span className="text-emerald-600">18</span>
                </p>
                <p className="text-xs sm:text-sm text-slate-500 font-bold mt-1">
                  محافظة مغطاة بالكامل
                </p>
              </div>
            </motion.div>
          </div>

          {/* Visual Showcase - Interactive Mockup Device */}
          <div className="lg:col-span-5 flex justify-center relative" id="hero-phone-mockup">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative w-80 sm:w-88 aspect-[9/19] bg-slate-950 rounded-[40px] p-3.5 shadow-2xl border-4 border-slate-800"
            >
              {/* Speaker notch */}
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 h-5 w-32 bg-slate-900 rounded-b-2xl z-20 flex justify-center items-center">
                <span className="w-12 h-1 bg-slate-800 rounded-full block -mt-1" />
              </div>

              {/* Glowing camera lens dot */}
              <div className="absolute top-1 right-[110px] w-2.5 h-2.5 bg-slate-900 rounded-full z-20 flex items-center justify-center">
                <span className="w-1.5 h-1.5 bg-blue-900 rounded-full block" />
              </div>

              {/* Inner screen simulation */}
              <div className="w-full h-full bg-slate-50 rounded-[32px] overflow-hidden flex flex-col relative select-none text-right font-sans">
                
                {/* Header of virtual app */}
                <div className="bg-emerald-600 text-white pt-7 pb-4 px-4 shadow-md text-right relative">
                  <div className="flex justify-between items-center text-xs opacity-90 mb-2">
                    <span className="font-bold">11:58 | بغداد</span>
                    <div className="flex items-center space-x-reverse space-x-1">
                      <span className="text-[10px] bg-emerald-500 px-1.5 py-0.5 rounded-full text-white font-extrabold font-mono">5G</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    <div className="flex items-center space-x-reverse space-x-2">
                      <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center font-bold">💊</div>
                      <div>
                        <h4 className="font-extrabold text-sm block">صيدلية النور النموذجية</h4>
                        <span className="text-[10px] text-emerald-100 block">مرخصة • بغداد الكرادة</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Simulated Portal Content Carousel */}
                <div className="p-3.5 space-y-4 flex-1 overflow-y-auto text-xs bg-slate-50">
                  <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100/80">
                    <span className="text-[10px] font-extrabold text-emerald-800 block mb-1">الرغيف المالي اليومي</span>
                    <div className="flex justify-between items-center">
                      <span className="font-black text-slate-800 text-sm">3,450,000 د.ع</span>
                      <span className="text-[9px] text-emerald-600 bg-emerald-100/50 font-bold px-1.5 py-0.5 rounded-md">آمن ومحدث</span>
                    </div>
                  </div>

                  <div>
                    <span className="font-bold text-slate-800 block mb-1.5">الطلبيات النشطة القادمة</span>
                    <div className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm space-y-2.5">
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="font-black text-slate-700">طلب #CAP-28109</span>
                        <span className="bg-amber-100 text-amber-800 font-extrabold px-2 py-0.5 rounded-full">قيد التحضير</span>
                      </div>
                      <div className="text-[10px] text-slate-500">
                        مذخر دجلة العلمي للأدوية • <span className="font-bold">3 مواد</span>
                      </div>
                      {/* Step slider indicator */}
                      <div className="flex items-center justify-between pt-1">
                        <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full" />
                        <span className="h-0.5 bg-emerald-500 flex-1 mx-0.5" />
                        <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping absolute" />
                        <span className="w-2.5 h-2.5 bg-amber-500 rounded-full" />
                        <span className="h-0.5 bg-slate-200 flex-1 mx-0.5" />
                        <span className="w-2.5 h-2.5 bg-slate-200 rounded-full" />
                      </div>
                      <div className="flex justify-between text-[8px] text-slate-400">
                        <span>تم الإرسال</span>
                        <span>قيد التجهيز</span>
                        <span>في الطريق</span>
                      </div>
                    </div>
                  </div>

                  {/* Quick look search simulator */}
                  <div className="space-y-1.5">
                    <span className="font-bold text-slate-800 block">البحث عن نواقص الأدوية</span>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute right-2.5 top-2.5 text-slate-400" />
                      <input 
                        type="text" 
                        readOnly
                        placeholder="ابحث بالاسم العلمي او اسم الدواء..." 
                        className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 pr-8 text-[11px] text-slate-500 focus:outline-none"
                      />
                    </div>
                    {/* Fake result item */}
                    <div className="bg-white rounded-xl p-2.5 border border-slate-100 shadow-sm flex items-center justify-between">
                      <div>
                        <span className="font-bold text-slate-800 block text-[11px]">Amoxicillin 500mg</span>
                        <span className="text-[9px] text-slate-400 font-medium">مذخر قصر الشفاء الحديث</span>
                      </div>
                      <span className="text-[9px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">بونص 10+2</span>
                    </div>
                  </div>
                </div>

                {/* Quick actions row inside phone */}
                <div className="p-3 bg-white border-t border-slate-100 flex justify-between items-center text-[10px] text-slate-500 font-bold">
                  <div className="flex flex-col items-center">
                    <span>🛒</span>
                    <span className="text-emerald-600">الطلبات</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span>💊</span>
                    <span>النواقص</span>
                  </div>
                  <div className="flex flex-col items-center flex-1">
                    <div className="w-7 h-7 bg-emerald-600 rounded-full flex items-center justify-center text-white font-bold -mt-5 shadow-md shadow-emerald-200 text-sm">
                      +
                    </div>
                  </div>
                  <div className="flex flex-col items-center">
                    <span>📊</span>
                    <span>المالية</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span>⚙️</span>
                    <span>فريقي</span>
                  </div>
                </div>

              </div>
              
              {/* Extra Floating Badge */}
              <div className="absolute -left-12 bottom-12 bg-white rounded-2xl p-3 shadow-xl shadow-slate-100 border border-slate-100 text-right max-w-[140px] hidden sm:block">
                <div className="flex items-center space-x-reverse space-x-1.5 mb-1">
                  <span className="text-amber-500 font-bold">★</span>
                  <span className="text-amber-500 font-bold">★</span>
                  <span className="text-amber-500 font-bold">★</span>
                  <span className="text-amber-500 font-bold">★</span>
                  <span className="text-amber-500 font-bold">★</span>
                </div>
                <p className="text-[10px] text-slate-700 font-bold leading-tight">شراكة مع أكثر من 450 مذخر رسمي</p>
              </div>
            </motion.div>
          </div>

        </div>
      </div>
    </section>
  );
}
