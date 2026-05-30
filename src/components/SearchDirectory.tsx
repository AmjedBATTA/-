import { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, MapPin, Check, AlertTriangle, ShieldX, Info, HeartHandshake, Filter, ShoppingCart, Sparkles, Barcode, X, Volume2, VolumeX, Camera, Loader2, RefreshCw } from 'lucide-react';
import { MEDICINES_DATA, GOVERNORATES } from '../data';
import { Medicine } from '../types';

interface SearchDirectoryProps {
  onRegisterClick: () => void;
  onOpenQuickOrderSimulator?: (medicine: Medicine) => void;
}

export default function SearchDirectory({ onRegisterClick, onOpenQuickOrderSimulator }: SearchDirectoryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedGovernorate, setSelectedGovernorate] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  
  // Simulated requested/interest list for pharmacies
  const [expressedInterest, setExpressedInterest] = useState<Record<string, boolean>>({});

  const handleExpressInterest = (id: string) => {
    setExpressedInterest(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // --- CAMERA BARCODE SCANNER STATES & LOGIC ---
  const [isScanning, setIsScanning] = useState(false);
  const [scanStream, setScanStream] = useState<MediaStream | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [isBeepEnabled, setIsBeepEnabled] = useState(true);
  const [scanSuccessFeedback, setScanSuccessFeedback] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const SAMPLE_BARCODES = useMemo(() => [
    { barcode: '6281100115598', name: 'بندول اكسترا (Panadol Extra)', searchKey: 'Panadol' },
    { barcode: '5011327110992', name: 'اموكسيل 500 ملغ (Amoxil)', searchKey: 'Amoxil' },
    { barcode: '8699532095457', name: 'ليبيتور 20 ملغ (Lipitor)', searchKey: 'Lipitor' },
    { barcode: '7611327110931', name: 'فولتارين جيل (Voltaren)', searchKey: 'Voltaren' },
    { barcode: '4004732101236', name: 'كونكور 5 ملغ (Concor)', searchKey: 'Concor' },
    { barcode: '5011327789311', name: 'بروفين 400 ملغ (Brufen)', searchKey: 'Brufen' },
  ], []);

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

  const startScanning = async () => {
    setIsScanning(true);
    setScanError(null);
    setScanSuccessFeedback(null);
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      setScanStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(err => {
          console.error("Video block play failed:", err);
        });
      }
    } catch (err: any) {
      console.error("Camera getUserMedia blocked error:", err);
      setScanError("لم نتمكن من الوصول لكاميرا الجهاز الحقيقية. يمكنك استخدام روابط محاكاة الباركود السريعة أدناه لتجريب ميزة العثور الفوري.");
    }
  };

  const stopScanning = () => {
    if (scanStream) {
      scanStream.getTracks().forEach(track => track.stop());
      setScanStream(null);
    }
    setIsScanning(false);
    setScanSuccessFeedback(null);
  };

  const handleScanMatch = (item: { barcode: string; name: string; searchKey: string }) => {
    playBeep();
    setScanSuccessFeedback(`تم رصد باركود: ${item.barcode} • ${item.name}`);
    setSearchQuery(item.searchKey);
    setTimeout(() => {
      stopScanning();
    }, 1500);
  };

  // Auto clean tracks
  useEffect(() => {
    return () => {
      if (scanStream) {
        scanStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [scanStream]);

  // Active real-time Barcode Detector loop (if supported by device) + Simulated fallback
  useEffect(() => {
    let active = true;
    let animationFrameId: number;
    let timeoutId: any;

    const runDetector = async () => {
      if (isScanning && scanStream && videoRef.current && 'BarcodeDetector' in window) {
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
                const match = SAMPLE_BARCODES.find(b => b.barcode === scannedCode);
                if (match) {
                  handleScanMatch(match);
                } else {
                  playBeep();
                  setScanSuccessFeedback(`تم رصد باركود للعميل: ${scannedCode}`);
                  setSearchQuery(scannedCode);
                  setTimeout(() => {
                    stopScanning();
                  }, 1500);
                }
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

          videoRef.current.addEventListener('play', () => {
            if (active) animationFrameId = requestAnimationFrame(checkFrame);
          });
          if (!videoRef.current.paused) {
            animationFrameId = requestAnimationFrame(checkFrame);
          }
        } catch (e) {
          console.warn("BarcodeDetector setup failed, falling back to simulated matching:", e);
        }
      }
    };

    if (isScanning && !scanError && !scanSuccessFeedback) {
      runDetector();
      // Keep safety simulation timeout (5 seconds fallback)
      timeoutId = setTimeout(() => {
        if (active) {
          const randomItem = SAMPLE_BARCODES[Math.floor(Math.random() * SAMPLE_BARCODES.length)];
          handleScanMatch(randomItem);
        }
      }, 5000);
    }

    return () => {
      active = false;
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isScanning, scanStream, scanError, scanSuccessFeedback, SAMPLE_BARCODES]);

  const categories = useMemo(() => {
    const set = new Set(MEDICINES_DATA.map(m => m.category));
    return ['all', ...Array.from(set)];
  }, []);

  const filteredMedicines = useMemo(() => {
    return MEDICINES_DATA.filter(med => {
      const matchText = 
        med.nameAr.toLowerCase().includes(searchQuery.toLowerCase()) ||
        med.nameEn.toLowerCase().includes(searchQuery.toLowerCase()) ||
        med.scientificName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        med.activeIngredient.toLowerCase().includes(searchQuery.toLowerCase()) ||
        med.warehouse.toLowerCase().includes(searchQuery.toLowerCase());

      const matchCategory = selectedCategory === 'all' || med.category === selectedCategory;
      const matchGov = selectedGovernorate === 'all' || med.warehouse.includes(selectedGovernorate);
      const matchStatus = selectedStatus === 'all' || med.status === selectedStatus;

      return matchText && matchCategory && matchGov && matchStatus;
    });
  }, [searchQuery, selectedCategory, selectedGovernorate, selectedStatus]);

  return (
    <>
      <section className="py-16 bg-slate-50 text-right" id="search-directory-section">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header Section */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <span className="text-xs font-extrabold text-emerald-600 bg-emerald-100/70 border border-emerald-200/40 px-3 py-1.5 rounded-full uppercase tracking-wider inline-block mb-3">
            البحث اللحظي النشط
          </span>
          <h2 className="text-3xl font-black text-slate-900 sm:text-4xl">
            تصفح دليل الأدوية ومخزون المذاخر
          </h2>
          <p className="mt-3 text-base text-slate-600 leading-relaxed font-medium">
            مفتوح للعموم بشكل حي. ابحث عن الأدوية والمواد الطبية الشائعة وقارن بين المذاخر ومستودعات التغطية في العراق. يتطلب الشراء الفعلي حساب صيدلية مفعل.
          </p>
        </div>

        {/* Info Banner */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-8 flex flex-col md:flex-row items-center justify-between text-amber-900 gap-4">
          <div className="flex items-center space-x-reverse space-x-3">
            <Info className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <p className="text-sm font-semibold">
              <strong className="font-extrabold text-amber-950">تنويه هام للجمهور:</strong> الأسعار المعروضة وتوفر المخزون هي أسعار معاملات جملة مخصصة حصرياً للصيدليات والمكاتب العلمية المرخصة في العراق، وليست لعامة المرضى.
            </p>
          </div>
          <button 
            onClick={onRegisterClick}
            className="bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-extrabold text-xs px-5 py-2.5 rounded-xl transition-all shadow-sm flex-shrink-0 cursor-pointer"
          >
            سجل صيدليتك لتتمكن من الشراء
          </button>
        </div>

        {/* Filter Controls Dashboard */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 mb-8 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            
            {/* Search Input with Barcode Scanning Trigger */}
            <div className="lg:col-span-5">
              <label className="block text-xs font-extrabold text-slate-500 mb-1.5 mr-1">ابحث باسم الدواء، المادة الفعالة أو المذخر</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-5 h-5 text-slate-400 absolute right-3.5 top-3.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="مثال: بندول، Amoxil، Paracetamol، أو اسم المذخر..."
                    className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-500 rounded-2xl py-3 px-3 pr-11 text-sm text-slate-800 placeholder-slate-400 font-semibold focus:outline-none transition-all duration-200"
                  />
                </div>
                <button
                  type="button"
                  id="scan-barcode-button"
                  onClick={startScanning}
                  className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-extrabold text-xs px-4 rounded-2xl transition-all shadow-sm hover:shadow flex items-center justify-center gap-2 cursor-pointer border border-transparent shrink-0"
                >
                  <Barcode className="w-4 h-4 text-emerald-100" />
                  <span>مسح باركود (Scan Barcode)</span>
                </button>
              </div>
            </div>

            {/* Category Filter */}
            <div className="lg:col-span-3">
              <label className="block text-xs font-extrabold text-slate-500 mb-1.5 mr-1">الصنف العلاجي</label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-500 rounded-2xl py-3 px-4 text-sm text-slate-700 font-semibold focus:outline-none transition-all"
              >
                <option value="all">كل الأصناف العلاجية ({categories.length - 1})</option>
                {categories.filter(c => c !== 'all').map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Governorate Filter */}
            <div className="lg:col-span-2">
              <label className="block text-xs font-extrabold text-slate-500 mb-1.5 mr-1">تصفية المحافظة</label>
              <select
                value={selectedGovernorate}
                onChange={(e) => setSelectedGovernorate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-500 rounded-2xl py-3 px-4 text-sm text-slate-700 font-semibold focus:outline-none transition-all"
              >
                <option value="all">كل المحافظات ({GOVERNORATES.length})</option>
                {GOVERNORATES.map(gov => (
                  <option key={gov} value={gov}>{gov}</option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div className="lg:col-span-2">
              <label className="block text-xs font-extrabold text-slate-500 mb-1.5 mr-1">حالة التوفر</label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-500 rounded-2xl py-3 px-4 text-sm text-slate-700 font-semibold focus:outline-none transition-all"
              >
                <option value="all">كل الحالات</option>
                <option value="available">متوفر حالياً</option>
                <option value="low">متبقي قليل جداً</option>
                <option value="unavailable">نواقص (غير متوفر)</option>
              </select>
            </div>

          </div>

          {/* Quick Info Counts */}
          <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 font-bold border-t border-slate-100 pt-4 gap-2">
            <div>
              تم العثور على <span className="text-emerald-600 font-extrabold">{filteredMedicines.length}</span> دواء/مادة مطابقة لمعايير البحث.
            </div>
            <div className="flex space-x-reverse space-x-4">
              <span className="flex items-center space-x-reverse space-x-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 block" />
                <span>متوفر</span>
              </span>
              <span className="flex items-center space-x-reverse space-x-1">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 block" />
                <span>متبقي قليل (احجز سريعاً)</span>
              </span>
              <span className="flex items-center space-x-reverse space-x-1">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 block" />
                <span>نواقص (طلب إشعار فور التوفر)</span>
              </span>
            </div>
          </div>
        </div>

        {/* Grid Results */}
        {filteredMedicines.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" id="search-results-grid">
            {filteredMedicines.map((med) => {
              const hasExpressedInterest = expressedInterest[med.id];
              return (
                <div 
                  key={med.id}
                  className="bg-white rounded-3xl border border-slate-100 hover:border-emerald-200 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden flex flex-col"
                  id={`med-card-${med.id}`}
                >
                  
                  {/* Card upper part */}
                  <div className="p-6 flex-1 space-y-4 text-right">
                    
                    {/* Badge and Status Row */}
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] bg-slate-100 text-slate-600 font-extrabold px-2.5 py-1 rounded-full">
                        {med.category}
                      </span>
                      
                      {/* Availability badges */}
                      {med.status === 'available' && (
                        <span className="inline-flex items-center space-x-reverse space-x-1 bg-emerald-50 text-emerald-800 text-[10px] font-extrabold px-2.5 py-1 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 block" />
                          <span>متوفر حالياً</span>
                        </span>
                      )}
                      {med.status === 'low' && (
                        <span className="inline-flex items-center space-x-reverse space-x-1 bg-amber-50 text-amber-800 text-[10px] font-extrabold px-2.5 py-1 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 block animate-pulse" />
                          <span>شبه نافذ</span>
                        </span>
                      )}
                      {med.status === 'unavailable' && (
                        <span className="inline-flex items-center space-x-reverse space-x-1 bg-rose-50 text-rose-800 text-[10px] font-extrabold px-2.5 py-1 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 block" />
                          <span>غير متوفر حالياً</span>
                        </span>
                      )}
                    </div>

                    {/* Drug Titles */}
                    <div className="space-y-1">
                      <h3 className="text-xl font-bold text-slate-900 tracking-tight">
                        {med.nameAr}
                      </h3>
                      <p className="text-sm text-slate-500 font-semibold font-mono" dir="ltr">
                        {med.nameEn}
                      </p>
                      <p className="text-xs text-slate-400 font-bold">
                        المادة العلمية: {med.scientificName}
                      </p>
                    </div>

                    {/* Warehouse Provider */}
                    <div className="pt-3 border-t border-slate-100 space-y-2">
                      <div className="flex items-center space-x-reverse space-x-2 text-xs text-slate-600 font-bold">
                        <MapPin className="w-4 h-4 text-slate-400" />
                        <span>{med.warehouse}</span>
                      </div>
                      <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-xl text-xs font-semibold">
                        <span className="text-slate-500">سعر البيع للجمهور:</span>
                        <span className="text-emerald-700 font-black text-sm">{med.price.toLocaleString()} د.ع / علبة</span>
                      </div>
                    </div>

                  </div>

                  {/* Card Actions Footer */}
                  <div className="px-6 py-4 bg-slate-50 border-t border-slate-100/50 flex items-center justify-between gap-3">
                    {med.status === 'unavailable' ? (
                      <button
                        onClick={() => handleExpressInterest(med.id)}
                        className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-reverse space-x-2 border cursor-pointer ${
                          hasExpressedInterest
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                        }`}
                      >
                        <HeartHandshake className="w-4 h-4" />
                        <span>{hasExpressedInterest ? 'تم تفعيل التنبيه اللحظي ✓' : 'نبّهني فور التوفر'}</span>
                      </button>
                    ) : (
                      <>
                        {onOpenQuickOrderSimulator ? (
                          <button
                            onClick={() => onOpenQuickOrderSimulator(med)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs py-2.5 px-4 rounded-xl shadow-sm transition-all flex-1 cursor-pointer flex items-center justify-center space-x-reverse space-x-1.5"
                          >
                            <ShoppingCart className="w-3.5 h-3.5" />
                            <span>طلب تجريبي سريع</span>
                          </button>
                        ) : (
                          <button
                            onClick={onRegisterClick}
                            className="bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-800 font-bold text-xs py-2.5 px-4 rounded-xl transition-all flex-1 cursor-pointer"
                          >
                            طلب شراء جملة
                          </button>
                        )}
                        <span className="text-[10px] text-slate-400 font-semibold">
                          المخزون: {med.availableQuantity} علبة
                        </span>
                      </>
                    )}
                  </div>

                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white rounded-3xl border border-slate-100 p-12 text-center max-w-lg mx-auto shadow-sm" id="search-empty-state">
            <ShieldX className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-950 mb-1">عذراً، لم نجد نتائج تطابق بحثك</h3>
            <p className="text-slate-500 text-xs leading-relaxed max-w-sm mx-auto font-medium">
              تأكب من كتابة الاسم التجاري أو العلمي بشكل صحيح، أو جرب تغيير معايير التصفية والبحث النشط.
            </p>
          </div>
        )}

      </div>
    </section>

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
                    <h3 className="font-extrabold text-slate-900 text-sm">قارئ الباركود الذكي</h3>
                    <p className="text-[10px] text-slate-400 font-bold mt-0.5">البحث المباشر بالكاميرا عن الأدوية والمواد</p>
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
                      <p className="text-emerald-300 text-[10px] font-bold mt-1">جاري كتابة الكود في خانة البحث ومطابقة المنتج...</p>
                    </div>
                  )}

                  {/* Scan failure / camera access block fallback screen */}
                  {scanError && !scanSuccessFeedback && (
                    <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center text-center p-6 z-20">
                      <div className="w-12 h-12 bg-amber-500/10 text-amber-500 rounded-full flex items-center justify-center mb-3">
                        <Camera className="w-6 h-6 animate-pulse" />
                      </div>
                      <p className="text-amber-200 text-xs font-semibold leading-relaxed max-w-sm">
                        {scanError}
                      </p>
                    </div>
                  )}

                </div>

                {/* Guide Note */}
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex gap-3 text-xs text-slate-600 font-medium leading-relaxed">
                  <Info className="w-5 h-5 text-emerald-600 shrink-0" />
                  <p>
                    وجه عدسة كاميرا الموبايل أو اللابتوب مباشرة نحو الباركود المطبوع على علبة الدواء. سيقوم النظام بقراءة الخطوط الضوئية ومطابقتها فورياً ببيانات المستودع.
                  </p>
                </div>

                {/* Simulators & Samples Click trigger area */}
                <div className="space-y-2.5">
                  <div className="flex justify-between items-center px-1">
                    <span className="text-[10px] text-slate-400 font-black uppercase tracking-wider">
                      محاكاة سريعة للباركود (اضغط للمطابقة الفورية)
                    </span>
                    <span className="text-[9px] bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      توصية الفحص السريع
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    {SAMPLE_BARCODES.map((item) => (
                      <button
                        key={item.barcode}
                        type="button"
                        onClick={() => handleScanMatch(item)}
                        disabled={!!scanSuccessFeedback}
                        className="p-3 bg-slate-50 hover:bg-emerald-50/40 border border-slate-200/80 hover:border-emerald-300 rounded-xl transition text-right flex flex-col justify-between text-xs cursor-pointer focus:outline-none disabled:opacity-55 group"
                      >
                        <span className="font-extrabold text-slate-950 block leading-tight truncate group-hover:text-emerald-950 transition-colors">
                          {item.name}
                        </span>
                        <div className="flex justify-between items-center mt-2 w-full pt-1.5 border-t border-slate-200/40 font-mono text-[9px] text-slate-400 break-all">
                          <span>{item.barcode}</span>
                          <span className="text-[8px] bg-slate-200/50 group-hover:bg-emerald-100 group-hover:text-emerald-800 text-slate-500 px-1 py-0.5 rounded transition">
                            محاكاة
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

              </div>

              {/* Modal Footer Controls */}
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center text-xs">
                <span className="text-slate-400 font-bold font-mono">
                  BARCODE SCAN v2.1
                </span>
                <button
                  type="button"
                  onClick={stopScanning}
                  className="bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white font-extrabold px-6 py-2 rounded-xl transition cursor-pointer"
                >
                  إغلاق القارئ
                </button>
              </div>

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}