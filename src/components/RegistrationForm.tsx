import { useState, ChangeEvent, FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { UserCheck, Phone, CheckCircle, FileText, UploadCloud, MapPin, Building, ArrowRight, ArrowLeft, Loader2, Award } from 'lucide-react';
import { GOVERNORATES } from '../data';

export default function RegistrationForm() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Form states
  const [formData, setFormData] = useState({
    pharmacyName: '',
    pharmacistName: '',
    phone: '',
    governorate: 'بغداد',
    address: '',
    syndicateNumber: '',
    licenseFile: null as File | null,
    licenseFileName: ''
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateStep = (currentStep: number) => {
    const newErrors: Record<string, string> = {};

    if (currentStep === 1) {
      if (!formData.pharmacyName.trim()) newErrors.pharmacyName = 'اسم الصيدلية مطلوب';
      if (!formData.pharmacistName.trim()) newErrors.pharmacistName = 'اسم الصيدلاني المسؤول مطلوب';
    } else if (currentStep === 2) {
      if (!formData.phone.trim()) {
        newErrors.phone = 'رقم الهاتف مطلوب';
      } else if (!/^07[3-9]\d{8}$/.test(formData.phone.trim())) {
        newErrors.phone = 'يرجى إدخال رقم هاتف عراقي صالح يتكون من 11 رقماً ويبدأ بـ 07';
      }
      if (!formData.address.trim()) newErrors.address = 'العنوان التفصيلي مطلوب';
    } else if (currentStep === 3) {
      if (!formData.syndicateNumber.trim()) newErrors.syndicateNumber = 'رقم الهوية النقابية مطلوب';
      if (!formData.licenseFileName) newErrors.licenseFile = 'يرجى إرفاق صورة مستند إجازة الصيدلية أو هوية النقابة';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(step)) {
      setStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    setStep(prev => prev - 1);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setFormData(prev => ({
        ...prev,
        licenseFile: file,
        licenseFileName: file.name
      }));
      if (errors.licenseFile) {
        setErrors(prev => ({ ...prev, licenseFile: '' }));
      }
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!validateStep(3)) return;

    setLoading(true);
    // Simulate API registration call
    setTimeout(() => {
      setLoading(false);
      setSuccess(true);
    }, 1800);
  };

  return (
    <section className="py-16 bg-slate-50 text-right" id="registration-section">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Upper Title */}
        <div className="text-center mb-10">
          <Award className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
          <h2 className="text-3xl font-black text-slate-900">انضم كصيدلية مرخصة</h2>
          <p className="mt-2 text-slate-500 font-semibold text-sm">
            سجل الآن مجاناً لتتمكن من تصفح عروض ومخازن الأدوية والطلب الفوري. تفعيل سريع خلال أقل من 12 ساعة.
          </p>
        </div>

        {/* Steps indicators header */}
        {!success && (
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm mb-8 flex justify-between items-center text-xs font-bold text-slate-400">
            <div className={`flex items-center space-x-reverse space-x-2 ${step >= 1 ? 'text-emerald-600' : ''}`}>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center border font-bold ${
                step >= 1 ? 'bg-emerald-600 border-transparent text-white' : 'border-slate-200'
              }`}>1</span>
              <span>بيانات الصيدلية</span>
            </div>
            <div className="h-px bg-slate-100 flex-1 mx-4" />
            <div className={`flex items-center space-x-reverse space-x-2 ${step >= 2 ? 'text-emerald-600' : ''}`}>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center border font-bold ${
                step >= 2 ? 'bg-emerald-600 border-transparent text-white' : 'border-slate-200'
              }`}>2</span>
              <span>المحافظة والاتصال</span>
            </div>
            <div className="h-px bg-slate-100 flex-1 mx-4" />
            <div className={`flex items-center space-x-reverse space-x-2 ${step >= 3 ? 'text-emerald-600' : ''}`}>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center border font-bold ${
                step >= 3 ? 'bg-emerald-600 border-transparent text-white' : 'border-slate-200'
              }`}>3</span>
              <span>المستندات المهنية</span>
            </div>
          </div>
        )}

        {/* Form Box */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8 relative overflow-hidden">
          
          <AnimatePresence mode="wait">
            {success ? (
              // Success Animation Screen
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-10 space-y-6"
                id="registration-success-card"
              >
                <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-md">
                  <CheckCircle className="w-10 h-10 stroke-[2.5]" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-black text-slate-900">لقد تم استلام طلبك بنجاح!</h3>
                  <p className="text-slate-500 font-semibold text-sm max-w-md mx-auto leading-relaxed">
                    مرحباً دكتور، أهلاً بك في عائلة انوار الحسن. يقوم المكاتب الفنية والتحقق النقابي الآن بمراجعة مستندات صيدليتك (<span className="text-slate-900 font-bold">{formData.pharmacyName}</span>).
                  </p>
                </div>
                <div className="bg-slate-50 rounded-2xl p-4 text-xs font-semibold text-slate-600 max-w-sm mx-auto space-y-2.5 border border-slate-100 text-right">
                  <p className="flex justify-between">
                    <span>الرقم المرجعي للملف:</span>
                    <strong className="text-slate-950 font-black font-mono">CAP-REG-{Math.floor(Math.random() * 90000 + 10000)}</strong>
                  </p>
                  <p className="flex justify-between">
                    <span>صاحب الطلب:</span>
                    <strong className="text-slate-950">د. {formData.pharmacistName}</strong>
                  </p>
                  <p className="flex justify-between">
                    <span>رقم الاتصال:</span>
                    <strong className="text-slate-950 font-mono" dir="ltr">{formData.phone}</strong>
                  </p>
                  <p className="flex justify-between">
                    <span>حالة المراجعة:</span>
                    <strong className="text-amber-600 flex items-center space-x-reverse space-x-1">
                      <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-ping" />
                      <span>قيد التحقق الفوري</span>
                    </strong>
                  </p>
                </div>
                <p className="text-xs text-slate-400 font-bold">
                  سيصلك اتصال هاتفي أو رسالة قصيرة وتنبيه للتفعيل في غضون ساعات معدودة. شكراً لثقتكم.
                </p>
                <div className="pt-4">
                  <button
                    onClick={() => {
                      setSuccess(false);
                      setStep(1);
                      setFormData({
                        pharmacyName: '',
                        pharmacistName: '',
                        phone: '',
                        governorate: 'بغداد',
                        address: '',
                        syndicateNumber: '',
                        licenseFile: null,
                        licenseFileName: ''
                      });
                    }}
                    className="bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs px-8 py-3 rounded-xl shadow-md cursor-pointer transition"
                  >
                    تقديم طلب لصيدلية أخرى
                  </button>
                </div>
              </motion.div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                
                {/* STEP 1: Pharmacy Name & Owner */}
                {step === 1 && (
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="space-y-5"
                    id="step-1"
                  >
                    <div className="flex items-center space-x-reverse space-x-3 mb-4 border-b border-slate-100 pb-3">
                      <Building className="w-6 h-6 text-emerald-600" />
                      <h4 className="text-lg font-black text-slate-900">بيانات الصيدلية والصيدلاني المسؤول</h4>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-sm font-bold text-slate-700">اسم الصيدلية كما هو مرخص</label>
                      <input
                        type="text"
                        value={formData.pharmacyName}
                        onChange={(e) => setFormData({ ...formData, pharmacyName: e.target.value })}
                        placeholder="مثل: صيدلية النور النموذجية"
                        className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white rounded-2xl py-3 px-4 text-sm font-semibold text-slate-800 focus:outline-none transition-all"
                      />
                      {errors.pharmacyName && <p className="text-xs text-rose-600 font-bold">{errors.pharmacyName}</p>}
                    </div>

                    <div className="space-y-1">
                      <label className="block text-sm font-bold text-slate-700">اسم الصيدلاني المسؤول (الكامل)</label>
                      <input
                        type="text"
                        value={formData.pharmacistName}
                        onChange={(e) => setFormData({ ...formData, pharmacistName: e.target.value })}
                        placeholder="مثل: د. أحمد علي الهاشمي"
                        className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white rounded-2xl py-3 px-4 text-sm font-semibold text-slate-800 focus:outline-none transition-all"
                      />
                      {errors.pharmacistName && <p className="text-xs text-rose-600 font-bold">{errors.pharmacistName}</p>}
                    </div>

                    <div className="bg-slate-50 rounded-2xl p-4 text-xs text-slate-500 leading-normal font-semibold">
                      ملاحظة دكتور: نحن نقوم بمطابقة هذه الأسماء مع ترخيص نقابة الصيادلة للتأكد من الموثوقية الكاملة للطلبات حماية للمستهلكين والمهنة الدوائية.
                    </div>
                  </motion.div>
                )}

                {/* STEP 2: Phone & Governorate */}
                {step === 2 && (
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="space-y-5"
                    id="step-2"
                  >
                    <div className="flex items-center space-x-reverse space-x-3 mb-4 border-b border-slate-100 pb-3">
                      <Phone className="w-6 h-6 text-emerald-600" />
                      <h4 className="text-lg font-black text-slate-900">المعلومات الجغرافية وقنوات التواصل</h4>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      
                      <div className="space-y-1">
                        <label className="block text-sm font-bold text-slate-700">رقم الهاتف الفعال (العراق)</label>
                        <input
                          type="text"
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                          placeholder="مثال: 07802884040"
                          className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white rounded-2xl py-3 px-4 text-sm font-semibold text-slate-800 focus:outline-none transition-all font-mono"
                          dir="ltr"
                        />
                        {errors.phone && <p className="text-xs text-rose-600 font-bold text-right">{errors.phone}</p>}
                      </div>

                      <div className="space-y-1">
                        <label className="block text-sm font-bold text-slate-700 text-right">المحافظة</label>
                        <select
                          value={formData.governorate}
                          onChange={(e) => setFormData({ ...formData, governorate: e.target.value })}
                          className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-500 rounded-2xl py-3.5 px-4 text-sm font-semibold text-slate-700 focus:outline-none transition-all"
                        >
                          {GOVERNORATES.map(gov => (
                            <option key={gov} value={gov}>{gov}</option>
                          ))}
                        </select>
                      </div>

                    </div>

                    <div className="space-y-1">
                      <label className="block text-sm font-bold text-slate-700">العنوان التفصيلي (اسم الحي، اسم الشارع، معالم قريبة)</label>
                      <textarea
                        rows={3}
                        value={formData.address}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        placeholder="مثل: بغداد، الكرادة داخل، قرب مستشفى الراهبات، مجمع العيادات الطبي"
                        className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white rounded-2xl py-3 px-4 text-sm font-semibold text-slate-800 focus:outline-none transition-all text-right"
                      />
                      {errors.address && <p className="text-xs text-rose-600 font-bold">{errors.address}</p>}
                    </div>
                  </motion.div>
                )}

                {/* STEP 3: Documents and validation */}
                {step === 3 && (
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="space-y-5"
                    id="step-3"
                  >
                    <div className="flex items-center space-x-reverse space-x-3 mb-4 border-b border-slate-100 pb-3">
                      <FileText className="w-6 h-6 text-emerald-600" />
                      <h4 className="text-lg font-black text-slate-900">المستندات المهنية وإجازة ممارسة المهنة</h4>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-sm font-bold text-slate-700">رقم الهوية النقابية / رخصة الصيدلية</label>
                      <input
                        type="text"
                        value={formData.syndicateNumber}
                        onChange={(e) => setFormData({ ...formData, syndicateNumber: e.target.value })}
                        placeholder="مثال: نقابة صيادلة العراق - 48291"
                        className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white rounded-2xl py-3 px-4 text-sm font-semibold text-slate-800 focus:outline-none transition-all"
                      />
                      {errors.syndicateNumber && <p className="text-xs text-rose-600 font-bold">{errors.syndicateNumber}</p>}
                    </div>

                    {/* File Upload Box */}
                    <div className="space-y-1">
                      <label className="block text-sm font-bold text-slate-700">تحميل مستند الإجازة أو الهوية (صورة / PDF)</label>
                      
                      <div className="border-2 border-dashed border-slate-200 hover:border-emerald-500 bg-slate-50/50 rounded-2xl p-6 text-center transition-all cursor-pointer relative">
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          onChange={handleFileChange}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <UploadCloud className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                        
                        {formData.licenseFileName ? (
                          <div className="space-y-1">
                            <p className="text-sm font-extrabold text-emerald-700">تم إرفاق الملف بنجاح ✓</p>
                            <p className="text-xs text-slate-500 truncate max-w-sm mx-auto font-mono">{formData.licenseFileName}</p>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <p className="text-sm font-bold text-slate-700">اسحب الملف هنا أو انقر للتصفح والتحميل</p>
                            <p className="text-xs text-slate-400">تقبل صور الهوية النقابية أو رخصة الممارسة الصادرة عن النقابة أو وزارة الصحة</p>
                          </div>
                        )}
                      </div>
                      {errors.licenseFile && <p className="text-xs text-rose-600 font-bold">{errors.licenseFile}</p>}
                    </div>
                  </motion.div>
                )}

                {/* Form Navigation Controls */}
                <div className="flex items-center justify-between pt-6 border-t border-slate-100">
                  {step > 1 ? (
                    <button
                      type="button"
                      onClick={handleBack}
                      className="flex items-center space-x-reverse space-x-2 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs px-5 py-3 rounded-xl transition cursor-pointer"
                    >
                      <ArrowRight className="w-4 h-4" />
                      <span>السابق</span>
                    </button>
                  ) : (
                    <div />
                  )}

                  {step < 3 ? (
                    <button
                      type="button"
                      onClick={handleNext}
                      className="flex items-center space-x-reverse space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-6 py-3 rounded-xl shadow-md cursor-pointer transition"
                    >
                      <span>التالي</span>
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex items-center space-x-reverse space-x-2 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs px-8 py-3 rounded-xl shadow-md cursor-pointer transition disabled:opacity-75"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                          <span>جاري مراجعة النواقص وإعداد الحساب...</span>
                        </>
                      ) : (
                        <>
                          <span>إرسال طلب التسجيل للتأكيد</span>
                          <CheckCircle className="w-4 h-4 text-emerald-400" />
                        </>
                      )}
                    </button>
                  )}
                </div>

              </form>
            )}
          </AnimatePresence>

        </div>

      </div>
    </section>
  );
}
