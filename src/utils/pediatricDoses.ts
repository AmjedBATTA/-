import type { Medicine } from '../types';

// =========================================================
// جرعات شرابات الأطفال — بيانات مرجعية + حساب الجرعة بالوزن/العمر
// المصدر: قسم Pediatric في Medscape Drug Reference (reference.medscape.com)،
// نُقلت الأرقام كما وردت فيه (تمت مراجعتها في 2026-09-26). للاسترشاد فقط —
// الوصفة الطبية تتقدّم دائماً، ولا يُعدَّل أي رقم هنا بلا مرجع.
// =========================================================

export interface AgeDose {
  minMonths: number;     // شامل
  maxMonths?: number;    // غير شامل (بلا حد = بلا سقف)
  mg: number | [number, number]; // الجرعة الواحدة بالملغ (أو مدى)
  maxDayMg?: number;
  label?: string;        // نص بديل حين تكون الجرعة مدى (مثل «٥–١٠ ملغ»)
}
export interface WeightBand { minKg: number; maxKg?: number; mg: number } // يُختار أول نطاق يكون الوزن ≤ maxKg فيه؛ minKg للنطاق الأول فقط = أقل وزن

export interface Regimen {
  id: string;
  label: string;           // الاستطباب بالعربية
  kind: 'perKgDay' | 'perKgDose' | 'age' | 'weightBand' | 'fixed';
  mgPerKg?: [number, number];   // perKgDay: ملغ/كغ/يوم — perKgDose: ملغ/كغ/جرعة
  dosesPerDay?: number;         // عدد الجرعات في اليوم (perKgDay يُقسَّم عليها)
  interval: string;             // «كل 12 ساعة» …
  maxDoseMg?: number;
  maxDayMg?: number;
  maxDayMgPerKg?: number;       // سقف يومي بالوزن (باراسيتامول 75، آيبوبروفين 40)
  ages?: AgeDose[];
  bands?: WeightBand[];
  fixedMg?: number;
  minAgeMonths?: number;        // أقل عمر مذكور في المصدر لهذا النظام
  maxKg?: number;               // فوقه تُستعمل جرعة البالغين/الحبوب
  duration?: string;
  note?: string;
}

export interface Concentration { mgPer5ml: number; label?: string }

export interface SyrupDrug {
  id: string;
  nameAr: string;
  nameEn: string;
  match: RegExp;                // يطابق الاسم العلمي/التجاري في المخزون
  component?: string;           // «مكوّن الأموكسيسيلين» — ما تُحسب عليه الملغات
  concentrations: Concentration[];
  regimens: Regimen[];
  warnings?: string[];
  source: string;               // رابط صفحة Medscape
}

const M = 'https://reference.medscape.com/drug/';

export const SYRUP_DRUGS: SyrupDrug[] = [
  {
    id: 'paracetamol', nameAr: 'باراسيتامول', nameEn: 'Paracetamol (Acetaminophen)',
    match: /paracetamol|acetaminophen|panadol|calpol|adol|tylenol|باراسيتامول|بنادول|كالبول|ادول/i,
    concentrations: [{ mgPer5ml: 120 }, { mgPer5ml: 160 }, { mgPer5ml: 250 }],
    regimens: [{
      id: 'fever', label: 'حرارة وألم (رضّع وأطفال)', kind: 'perKgDose', mgPerKg: [10, 15],
      interval: 'كل 4–6 ساعات عند الحاجة', maxDoseMg: 1000, maxDayMg: 4000, maxDayMgPerKg: 75,
      note: 'حديثو الولادة (أقل من شهر) لهم جداول مختلفة — تُراجع الوصفة.',
    }],
    warnings: ['احسب كل مصادر الباراسيتامول (شراب + تحاميل + أدوية زكام مركّبة) ضمن الحد اليومي.'],
    source: M + 'tylenol-acetaminophen-343346',
  },
  {
    id: 'ibuprofen', nameAr: 'آيبوبروفين', nameEn: 'Ibuprofen',
    match: /ibuprofen|brufen|nurofen|advil|motrin|ايبوبروفين|بروفين|نوروفين/i,
    concentrations: [{ mgPer5ml: 100 }, { mgPer5ml: 200 }],
    regimens: [{
      id: 'fever', label: 'حرارة', kind: 'perKgDose', mgPerKg: [5, 10],
      interval: 'كل 6–8 ساعات', maxDoseMg: 400, maxDayMgPerKg: 40, minAgeMonths: 6,
    }, {
      id: 'pain', label: 'ألم', kind: 'perKgDose', mgPerKg: [4, 10],
      interval: 'كل 6–8 ساعات', maxDayMgPerKg: 40, minAgeMonths: 6,
    }],
    warnings: ['أقل من 6 أشهر: الأمان والفعالية غير مثبتين.'],
    source: M + 'advil-motrin-ibuprofen-343289',
  },
  {
    id: 'amoxicillin', nameAr: 'أموكسيسيلين', nameEn: 'Amoxicillin',
    // يستبعد التركيبة مع الكلافولانيت (لها بطاقتها الخاصة)
    match: /^(?!.*(clav|augmentin|اوجمنتين|كلاف)).*(amoxicillin|amoxil|اموكسيسيلين|اموكسيل)/i,
    concentrations: [{ mgPer5ml: 125 }, { mgPer5ml: 250 }, { mgPer5ml: 200 }, { mgPer5ml: 400 }],
    regimens: [
      { id: 'mild', label: 'التهابات خفيفة–متوسطة (أنف، أذن، حنجرة)', kind: 'perKgDay', mgPerKg: [25, 25], dosesPerDay: 2, interval: 'كل 12 ساعة', minAgeMonths: 3, maxKg: 40, duration: '10–14 يوماً' },
      { id: 'severe', label: 'التهابات شديدة / الجهاز التنفسي السفلي', kind: 'perKgDay', mgPerKg: [45, 45], dosesPerDay: 2, interval: 'كل 12 ساعة', minAgeMonths: 3, maxKg: 40, duration: '10–14 يوماً' },
      { id: 'aom', label: 'التهاب الأذن الوسطى الحاد', kind: 'perKgDay', mgPerKg: [80, 90], dosesPerDay: 2, interval: 'كل 12 ساعة', minAgeMonths: 2, duration: 'أقل من سنتين: 10 أيام — أكبر (خفيف/متوسط): 5–7 أيام' },
      { id: 'cap', label: 'ذات الرئة المكتسبة (علاج تجريبي)', kind: 'perKgDay', mgPerKg: [90, 90], dosesPerDay: 2, interval: 'كل 12 ساعة', maxDayMg: 4000, minAgeMonths: 3, duration: '10 أيام' },
      { id: 'infant', label: 'رضيع أقل من 3 أشهر', kind: 'perKgDay', mgPerKg: [30, 30], dosesPerDay: 2, interval: 'كل 12 ساعة', note: 'الحد الأعلى 30 ملغ/كغ/يوم لهذا العمر.' },
    ],
    warnings: ['فوق 40 كغ تُستعمل جرعة البالغين.'],
    source: M + 'amoxil-amoxicillin-342473',
  },
  {
    id: 'augmentin', nameAr: 'أموكسيسيلين + كلافولانيت (أوجمنتين)', nameEn: 'Amoxicillin/Clavulanate',
    match: /clav|augmentin|amoclan|curam|اوجمنتين|اوغمنتين|كلافولان|اموكلان/i,
    component: 'تُحسب الملغات على مكوّن الأموكسيسيلين',
    concentrations: [
      { mgPer5ml: 125, label: '156 (125/31.25)' },
      { mgPer5ml: 200, label: '228 (200/28.5)' },
      { mgPer5ml: 250, label: '312 (250/62.5)' },
      { mgPer5ml: 400, label: '457 (400/57)' },
      { mgPer5ml: 600, label: 'ES 642 (600/42.9)' },
    ],
    regimens: [
      { id: 'less', label: 'التهابات أقل شدة (جلد، مسالك بولية)', kind: 'perKgDay', mgPerKg: [25, 25], dosesPerDay: 2, interval: 'كل 12 ساعة', minAgeMonths: 3, maxKg: 40, note: 'يُستعمل تركيز 228 أو 457 مع نظام كل 12 ساعة.' },
      { id: 'std', label: 'أذن وسطى / جيوب / صدر / التهابات شديدة', kind: 'perKgDay', mgPerKg: [45, 45], dosesPerDay: 2, interval: 'كل 12 ساعة', minAgeMonths: 3, maxKg: 40, note: 'يُستعمل تركيز 228 أو 457 مع نظام كل 12 ساعة.' },
      { id: 'es', label: 'ES-600: أذن وسطى متكررة/مستمرة', kind: 'perKgDay', mgPerKg: [90, 90], dosesPerDay: 2, interval: 'كل 12 ساعة', minAgeMonths: 3, maxKg: 40, duration: '10 أيام', note: 'بتركيز ES 642 فقط، للأعمار 3 أشهر–12 سنة وأوزان 8–40 كغ.' },
      { id: 'infant', label: 'رضيع أقل من 3 أشهر', kind: 'perKgDay', mgPerKg: [30, 30], dosesPerDay: 2, interval: 'كل 12 ساعة', note: 'بتركيز 156 (125/31.25) فقط.' },
    ],
    warnings: ['التركيزات ليست متبادلة: نسبة الكلافولانيت تختلف — لا تُستبدل بين الأنواع.', 'فوق 40 كغ تُستعمل جرعة البالغين (حبوب).'],
    source: M + 'augmentin-amoxicillin-clavulanate-342474',
  },
  {
    id: 'azithromycin', nameAr: 'أزيثرومايسين', nameEn: 'Azithromycin',
    match: /azithro|zithromax|azomax|zomax|ازيثرو|زيثروماكس|ازوماكس/i,
    concentrations: [{ mgPer5ml: 100 }, { mgPer5ml: 200 }],
    regimens: [
      { id: '3day', label: 'أذن وسطى / جيوب أنفية (3 أيام)', kind: 'perKgDay', mgPerKg: [10, 10], dosesPerDay: 1, interval: 'مرة يومياً', minAgeMonths: 6, duration: '3 أيام' },
      { id: 'cap', label: 'ذات الرئة (5 أيام)', kind: 'perKgDay', mgPerKg: [10, 10], dosesPerDay: 1, interval: 'مرة يومياً', minAgeMonths: 6, duration: '5 أيام', note: 'اليوم الأول 10 ملغ/كغ، ثم نصفها (5 ملغ/كغ) من اليوم 2 إلى 5.' },
      { id: 'strep', label: 'التهاب البلعوم/اللوزتين العقدي', kind: 'perKgDay', mgPerKg: [12, 12], dosesPerDay: 1, interval: 'مرة يومياً', maxDayMg: 500, minAgeMonths: 24, duration: '5 أيام' },
    ],
    source: M + 'zithromax-zmax-azithromycin-342523',
  },
  {
    id: 'cefixime', nameAr: 'سيفيكسيم', nameEn: 'Cefixime',
    match: /cefixime|suprax|ximacef|سيفيكسيم|سوبراكس/i,
    concentrations: [{ mgPer5ml: 100 }, { mgPer5ml: 200 }],
    regimens: [
      { id: 'once', label: 'التهابات (أذن، بلعوم، صدر، مسالك) — مرة يومياً', kind: 'perKgDay', mgPerKg: [8, 8], dosesPerDay: 1, interval: 'مرة يومياً', maxDayMg: 400, minAgeMonths: 6, maxKg: 45 },
      { id: 'bid', label: 'نفس الاستطبابات — مقسّمة على جرعتين', kind: 'perKgDay', mgPerKg: [8, 8], dosesPerDay: 2, interval: 'كل 12 ساعة', maxDayMg: 400, minAgeMonths: 6, maxKg: 45 },
    ],
    warnings: ['فوق 45 كغ أو أكبر من 12 سنة: 400 ملغ يومياً.'],
    source: M + 'suprax-cefixime-342503',
  },
  {
    id: 'cephalexin', nameAr: 'سيفالكسين', nameEn: 'Cephalexin',
    match: /cephalexin|cefalexin|keflex|سيفالكسين|كفلكس/i,
    concentrations: [{ mgPer5ml: 125 }, { mgPer5ml: 250 }],
    regimens: [
      { id: 'std', label: 'صدر / جلد / عظم / مسالك', kind: 'perKgDay', mgPerKg: [25, 50], dosesPerDay: 4, interval: 'كل 6 ساعات', maxDayMg: 4000, minAgeMonths: 12, duration: '7–14 يوماً' },
      { id: 'severe', label: 'التهابات شديدة', kind: 'perKgDay', mgPerKg: [50, 100], dosesPerDay: 4, interval: 'كل 6 ساعات', maxDayMg: 4000, minAgeMonths: 12, duration: '7–14 يوماً' },
      { id: 'aom', label: 'التهاب الأذن الوسطى', kind: 'perKgDay', mgPerKg: [75, 100], dosesPerDay: 4, interval: 'كل 6 ساعات', maxDayMg: 4000, minAgeMonths: 12, duration: '7–14 يوماً' },
    ],
    warnings: ['يجوز التقسيم كل 8 ساعات: تُقسم الكمية اليومية على 3 جرعات بدل 4.', 'جرعة الطفل لا تتجاوز جرعة البالغ (حتى 4 غم/يوم).', 'الالتهابات العقدية: 10 أيام على الأقل.'],
    source: M + 'keflex-cephalexin-342490',
  },
  {
    id: 'cefuroxime', nameAr: 'سيفوروكسيم', nameEn: 'Cefuroxime',
    match: /cefuroxime|zinnat|ceftin|سيفوروكسيم|زينات/i,
    concentrations: [{ mgPer5ml: 125 }, { mgPer5ml: 250 }],
    regimens: [
      { id: 'std', label: 'أذن وسطى / جيوب / قوباء', kind: 'perKgDay', mgPerKg: [30, 30], dosesPerDay: 2, interval: 'كل 12 ساعة', maxDayMg: 1000, minAgeMonths: 3, duration: '10 أيام' },
      { id: 'pharyngitis', label: 'التهاب البلعوم/اللوزتين', kind: 'perKgDay', mgPerKg: [20, 20], dosesPerDay: 2, interval: 'كل 12 ساعة', maxDayMg: 500, minAgeMonths: 3, duration: '10 أيام' },
    ],
    source: M + 'ceftin-zinacef-cefuroxime-342500',
  },
  {
    id: 'cefadroxil', nameAr: 'سيفادروكسيل', nameEn: 'Cefadroxil',
    match: /cefadroxil|duricef|سيفادروكسيل/i,
    concentrations: [{ mgPer5ml: 125 }, { mgPer5ml: 250 }, { mgPer5ml: 500 }],
    regimens: [
      { id: 'std', label: 'التهابات حسّاسة', kind: 'perKgDay', mgPerKg: [30, 30], dosesPerDay: 2, interval: 'كل 12 ساعة' },
      { id: 'strep', label: 'التهاب البلعوم العقدي', kind: 'perKgDay', mgPerKg: [30, 30], dosesPerDay: 1, interval: 'مرة يومياً', maxDoseMg: 1000, duration: '10 أيام' },
    ],
    source: M + 'duricef-ultracef-cefadroxil-342489',
  },
  {
    id: 'clarithromycin', nameAr: 'كلاريثرومايسين', nameEn: 'Clarithromycin',
    match: /clarithro|klacid|biaxin|كلاريثرو|كلاسيد/i,
    concentrations: [{ mgPer5ml: 125 }, { mgPer5ml: 250 }],
    regimens: [
      { id: 'std', label: 'أذن / جيوب / قصبات / ذات الرئة', kind: 'perKgDay', mgPerKg: [15, 15], dosesPerDay: 2, interval: 'كل 12 ساعة', maxDoseMg: 500, minAgeMonths: 6, duration: '10 أيام', note: 'ذات الرئة المكتسبة: من عمر 3 أشهر.' },
      { id: 'skin', label: 'التهابات الجلد / البلعوم العقدي', kind: 'perKgDay', mgPerKg: [15, 15], dosesPerDay: 2, interval: 'كل 12 ساعة', maxDoseMg: 250, minAgeMonths: 6, duration: '10 أيام' },
    ],
    source: M + 'biaxin-xl-clarithromycin-342524',
  },
  {
    id: 'metronidazole', nameAr: 'ميترونيدازول', nameEn: 'Metronidazole',
    match: /metronidazole|flagyl|فلاجيل|ميترونيدازول|فلاجل/i,
    concentrations: [{ mgPer5ml: 125 }, { mgPer5ml: 200 }],
    regimens: [
      { id: 'amoeba', label: 'الأميبا', kind: 'perKgDay', mgPerKg: [35, 50], dosesPerDay: 3, interval: 'كل 8 ساعات', maxDoseMg: 750, maxDayMg: 2250, duration: '10 أيام' },
      { id: 'giardia', label: 'الجيارديا', kind: 'perKgDay', mgPerKg: [15, 15], dosesPerDay: 3, interval: 'كل 8 ساعات', duration: '5 أيام' },
      { id: 'anaerobic', label: 'التهابات لاهوائية (رضّع وأطفال)', kind: 'perKgDay', mgPerKg: [30, 30], dosesPerDay: 4, interval: 'كل 6 ساعات', maxDayMg: 4000 },
    ],
    warnings: ['تأكد من محتوى الميترونيدازول على العبوة: شراب «بنزوات 200 ملغ» يعادل غالباً 125 ملغ ميترونيدازول / 5 مل.'],
    source: M + 'flagyl-metronidazole-342566',
  },
  {
    id: 'cotrimoxazole', nameAr: 'كوتريموكسازول (سبترين)', nameEn: 'Trimethoprim/Sulfamethoxazole',
    match: /co-?trimoxazole|trimethoprim|sulfamethoxazole|septrin|bactrim|سبترين|باكتريم|كوتريموكسازول/i,
    component: 'تُحسب الملغات على مكوّن التريميثوبريم (TMP)',
    concentrations: [{ mgPer5ml: 40, label: '240 (40/200)' }, { mgPer5ml: 80, label: '480 (80/400)' }],
    regimens: [
      { id: 'std', label: 'التهابات خفيفة–متوسطة / مسالك بولية / شيغيلا', kind: 'perKgDay', mgPerKg: [8, 8], dosesPerDay: 2, interval: 'كل 12 ساعة', minAgeMonths: 2, duration: 'مسالك: 7–14 يوماً — شيغيلا: 5 أيام' },
      { id: 'aom', label: 'التهاب الأذن الوسطى', kind: 'perKgDay', mgPerKg: [6, 10], dosesPerDay: 2, interval: 'كل 12 ساعة', minAgeMonths: 2, duration: '10 أيام' },
    ],
    warnings: ['ممنوع تحت عمر شهرين.'],
    source: M + 'bactrim-trimethoprim-sulfamethoxazole-342543',
  },
  {
    id: 'cetirizine', nameAr: 'سيتريزين', nameEn: 'Cetirizine',
    match: /^(?!.*levo).*(cetirizine|zyrtec|سيتريزين|زيرتك)/i,
    concentrations: [{ mgPer5ml: 5 }],
    regimens: [{
      id: 'allergy', label: 'حساسية أنف / شرى', kind: 'age', interval: 'مرة يومياً',
      ages: [
        { minMonths: 24, maxMonths: 72, mg: 2.5, maxDayMg: 5, label: 'يمكن رفعها إلى 5 ملغ مرة يومياً أو 2.5 ملغ مرتين' },
        { minMonths: 72, mg: [5, 10], maxDayMg: 10, label: 'حسب شدة الأعراض' },
      ],
      minAgeMonths: 24,
    }],
    warnings: ['أقل من سنتين: الأمان والفعالية غير مثبتين (شراب فموي).'],
    source: M + 'quzyttir-zyrtec-cetirizine-343384',
  },
  {
    id: 'loratadine', nameAr: 'لوراتادين', nameEn: 'Loratadine',
    match: /^(?!.*deslor).*(loratadine|claritine?|lorano|لوراتادين|كلاريتين)/i,
    concentrations: [{ mgPer5ml: 5 }],
    regimens: [{
      id: 'allergy', label: 'حساسية أنف', kind: 'age', interval: 'مرة يومياً',
      ages: [{ minMonths: 24, maxMonths: 72, mg: 5, maxDayMg: 5 }, { minMonths: 72, mg: 10, maxDayMg: 10 }],
      minAgeMonths: 24,
    }],
    warnings: ['الشرى (urticaria): فوق 6 سنوات فقط.'],
    source: M + 'claritin-reditabs-loratadine-343397',
  },
  {
    id: 'desloratadine', nameAr: 'ديسلوراتادين', nameEn: 'Desloratadine',
    match: /desloratadine|aerius|ديسلوراتادين|ايريوس/i,
    concentrations: [{ mgPer5ml: 2.5 }],
    regimens: [{
      id: 'allergy', label: 'حساسية أنف / شرى مزمن', kind: 'age', interval: 'مرة يومياً',
      ages: [
        { minMonths: 6, maxMonths: 12, mg: 1 },
        { minMonths: 12, maxMonths: 72, mg: 1.25 },
        { minMonths: 72, maxMonths: 144, mg: 2.5 },
        { minMonths: 144, mg: 5 },
      ],
      minAgeMonths: 6,
    }],
    source: M + 'clarinex-reditabs-desloratadine-343396',
  },
  {
    id: 'chlorpheniramine', nameAr: 'كلورفينيرامين', nameEn: 'Chlorpheniramine',
    match: /chlorphen|piriton|كلورفينيرامين|بريتون/i,
    concentrations: [{ mgPer5ml: 2 }],
    regimens: [{
      id: 'allergy', label: 'حساسية أنف', kind: 'age', interval: 'كل 4–6 ساعات',
      ages: [{ minMonths: 72, maxMonths: 144, mg: 2, maxDayMg: 12 }, { minMonths: 144, mg: 4, maxDayMg: 24 }],
      minAgeMonths: 72,
    }],
    warnings: ['المصدر لا يذكر جرعة تحت 6 سنوات — تُراجع الوصفة.'],
    source: M + 'chlortrimeton-chlorpheniramine-343386',
  },
  {
    id: 'diphenhydramine', nameAr: 'ديفينهيدرامين', nameEn: 'Diphenhydramine',
    match: /diphenhydramine|benadryl|ديفينهيدرامين|بينادريل/i,
    concentrations: [{ mgPer5ml: 12.5 }],
    regimens: [{
      id: 'allergy', label: 'تفاعل تحسسي', kind: 'age', interval: 'كل 4–6 ساعات',
      ages: [
        { minMonths: 24, maxMonths: 72, mg: 6.25, maxDayMg: 37.5 },
        { minMonths: 72, maxMonths: 144, mg: [12.5, 25], maxDayMg: 150 },
        { minMonths: 144, mg: [25, 50], maxDayMg: 300 },
      ],
      minAgeMonths: 24,
    }],
    warnings: ['السعال تحت 12 سنة: غير مثبت الأمان.'],
    source: M + 'benadryl-nytol-diphenhydramine-343392',
  },
  {
    id: 'ondansetron', nameAr: 'أوندانسيترون', nameEn: 'Ondansetron',
    match: /ondansetron|zofran|اوندانسيترون|زوفران/i,
    concentrations: [{ mgPer5ml: 4 }],
    regimens: [{
      id: 'ge', label: 'تقيؤ شديد مع التهاب معدة وأمعاء (جرعة واحدة)', kind: 'weightBand', interval: 'جرعة واحدة فقط',
      bands: [{ minKg: 8, maxKg: 15, mg: 2 }, { minKg: 15, maxKg: 30, mg: 4 }, { minKg: 30, mg: 8 }],
      note: 'استعمال خارج النشرة؛ الاستعمال الروتيني غير موصى به (CDC).',
    }],
    source: M + 'ondansetron-342052',
  },
  {
    id: 'salbutamol', nameAr: 'سالبوتامول', nameEn: 'Salbutamol (Albuterol)',
    match: /salbutamol|albuterol|ventolin|سالبوتامول|فنتولين/i,
    concentrations: [{ mgPer5ml: 2 }],
    regimens: [
      { id: 'young', label: 'تشنج قصبي — 2 إلى 6 سنوات', kind: 'perKgDose', mgPerKg: [0.1, 0.1], dosesPerDay: 3, interval: 'كل 8 ساعات', maxDoseMg: 2, minAgeMonths: 24, note: 'عند الحاجة يمكن رفعها إلى 0.2 ملغ/كغ كل 8 ساعات بحد 4 ملغ للجرعة.' },
      { id: 'older', label: 'تشنج قصبي — 6 إلى 14 سنة', kind: 'fixed', fixedMg: 2, interval: 'كل 6–8 ساعات', maxDayMg: 24, minAgeMonths: 72 },
    ],
    source: M + 'proventil-hfa-ventolin-hfa-albuterol-343426',
  },
  {
    id: 'prednisolone', nameAr: 'بريدنيزولون', nameEn: 'Prednisolone',
    match: /prednisolone|pediapred|orapred|بريدنيزولون/i,
    concentrations: [{ mgPer5ml: 5 }, { mgPer5ml: 15 }],
    regimens: [
      { id: 'asthma', label: 'نوبة ربو حادة', kind: 'perKgDay', mgPerKg: [1, 2], dosesPerDay: 1, interval: 'مرة يومياً (أو مقسّمة كل 12 ساعة)', maxDayMg: 80, duration: '3–5 أيام' },
      { id: 'inflammation', label: 'التهاب (عام)', kind: 'perKgDay', mgPerKg: [0.1, 2], dosesPerDay: 1, interval: 'مرة يومياً (أو مقسّمة كل 6–12 ساعة)', maxDayMg: 80 },
    ],
    source: M + 'pediapred-orapred-prednisolone-342745',
  },
  {
    id: 'nitazoxanide', nameAr: 'نيتازوكسانيد', nameEn: 'Nitazoxanide',
    match: /nitazoxanide|alinia|nanazoxid|نيتازوكسانيد|نانازوكسيد/i,
    concentrations: [{ mgPer5ml: 100 }],
    regimens: [{
      id: 'diarrhea', label: 'إسهال الجيارديا / الكريبتوسبوريديوم', kind: 'age', interval: 'كل 12 ساعة', duration: '3 أيام',
      ages: [{ minMonths: 12, maxMonths: 48, mg: 100 }, { minMonths: 48, maxMonths: 144, mg: 200 }, { minMonths: 144, mg: 500 }],
      minAgeMonths: 12,
    }],
    source: M + 'alinia-nitazoxanide-342664',
  },
  {
    id: 'albendazole', nameAr: 'ألبيندازول', nameEn: 'Albendazole',
    match: /albendazole|zentel|البيندازول|زنتل/i,
    concentrations: [{ mgPer5ml: 200 }, { mgPer5ml: 100 }],
    regimens: [
      { id: 'single', label: 'الأسكارس / الديدان الشصية', kind: 'fixed', fixedMg: 400, dosesPerDay: 1, interval: 'جرعة واحدة', duration: 'يوم واحد' },
      { id: 'pinworm', label: 'الدودة الدبوسية', kind: 'fixed', fixedMg: 400, dosesPerDay: 1, interval: 'جرعة واحدة', duration: 'تُكرر بعد أسبوعين' },
      { id: 'trichuris', label: 'الدودة السوطية', kind: 'fixed', fixedMg: 400, dosesPerDay: 1, interval: 'مرة يومياً', duration: '3 أيام' },
    ],
    warnings: ['المصدر لا يحدد جرعة للأعمار الصغيرة (أقل من سنتين) — تُراجع الوصفة.', 'يؤخذ مع الطعام.'],
    source: M + 'albendazole-342648',
  },
  {
    id: 'mebendazole', nameAr: 'ميبيندازول', nameEn: 'Mebendazole',
    match: /mebendazole|vermox|ميبيندازول|فيرموكس/i,
    concentrations: [{ mgPer5ml: 100 }],
    regimens: [
      { id: 'worms', label: 'الأسكارس / السوطية / الشصية', kind: 'fixed', fixedMg: 100, dosesPerDay: 2, interval: 'كل 12 ساعة', minAgeMonths: 24, duration: '3 أيام' },
      { id: 'pinworm', label: 'الدودة الدبوسية', kind: 'fixed', fixedMg: 100, dosesPerDay: 1, interval: 'جرعة واحدة', minAgeMonths: 24, duration: 'تُكرر بعد 3 أسابيع إن لم يُشفَ' },
    ],
    source: M + 'emverm-vermox-mebendazole-342658',
  },
];

// ---------- المطابقة مع المخزون ----------

const SYRUP_FORM = /syrup|susp|suspension|oral\s*sol|elixir|شراب|معلق|محلول\s*فموي|سيرب/i;

/** يعيد بطاقة الجرعات لمادة المخزون إن كانت شراباً معروفاً (يشترط كلمة شكل صيدلاني + مادة فعالة معروفة) */
export function findSyrupDrug(med: Pick<Medicine, 'nameAr' | 'nameEn' | 'activeIngredient' | 'scientificName' | 'category'>): SyrupDrug | null {
  const text = [med.nameEn, med.nameAr, med.activeIngredient, med.scientificName, med.category].filter(Boolean).join(' ');
  if (!SYRUP_FORM.test(text)) return null;
  return SYRUP_DRUGS.find(d => d.match.test(text)) ?? null;
}

/** يستخرج التركيز من الاسم («250mg/5ml» أو «125 ملغ/5 مل») إن طابق أحد تركيزات البطاقة */
export function detectConcentration(drug: SyrupDrug, name: string): number | null {
  const m = name.match(/(\d+(?:\.\d+)?)\s*(?:mg|ملغ|ملغم)\s*\/\s*5\s*(?:ml|مل)/i);
  if (!m) return null;
  const v = Number(m[1]);
  return drug.concentrations.some(c => c.mgPer5ml === v) ? v : null;
}

// ---------- الحساب ----------

export interface DoseResult {
  doseMg: [number, number];      // الجرعة الواحدة (مدى؛ متساويان إن كانت قيمة واحدة)
  doseMl: [number, number];
  dayMg?: [number, number];      // المجموع اليومي بحسب النظام المجدول
  maxDayMg?: number;             // السقف اليومي الذي لا يُتجاوز
  dosesPerDay?: number;
  capped: string[];              // أي سقف طُبِّق على الحساب
  warnings: string[];            // تحذيرات العمر/الوزن
  label?: string;                // ملاحظة الجرعة (نظام العمر)
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** عمر بالأشهر والوزن بالكغ (أيٌّ منهما قد يكون null إن لم يُدخل). */
export function computeDose(reg: Regimen, mgPer5ml: number, weightKg: number | null, ageMonths: number | null): DoseResult | { error: string } {
  const capped: string[] = [];
  const warnings: string[] = [];
  const mgToMl = (mg: number) => round1(mg * 5 / mgPer5ml);

  if (reg.minAgeMonths !== undefined && ageMonths !== null && ageMonths < reg.minAgeMonths) {
    warnings.push(`العمر أقل من الحد المذكور في المصدر لهذا الاستطباب (${fmtAge(reg.minAgeMonths)}).`);
  }
  if (reg.maxKg !== undefined && weightKg !== null && weightKg > reg.maxKg) {
    warnings.push(`الوزن فوق ${reg.maxKg} كغ — المصدر يوصي بجرعة البالغين.`);
  }

  let dose: [number, number];
  let day: [number, number] | undefined;
  let maxDay: number | undefined = reg.maxDayMg;
  let label: string | undefined;

  switch (reg.kind) {
    case 'perKgDay': {
      if (!weightKg) return { error: 'أدخل وزن الطفل' };
      const [lo, hi] = reg.mgPerKg!;
      day = [weightKg * lo, weightKg * hi];
      if (reg.maxDayMg && day[1] > reg.maxDayMg) { day = [Math.min(day[0], reg.maxDayMg), reg.maxDayMg]; capped.push(`الحد اليومي ${reg.maxDayMg} ملغ`); }
      const n = reg.dosesPerDay ?? 1;
      dose = [day[0] / n, day[1] / n];
      if (reg.maxDoseMg && dose[1] > reg.maxDoseMg) {
        dose = [Math.min(dose[0], reg.maxDoseMg), reg.maxDoseMg];
        day = [dose[0] * n, dose[1] * n];
        capped.push(`حد الجرعة الواحدة ${reg.maxDoseMg} ملغ`);
      }
      break;
    }
    case 'perKgDose': {
      if (!weightKg) return { error: 'أدخل وزن الطفل' };
      const [lo, hi] = reg.mgPerKg!;
      dose = [weightKg * lo, weightKg * hi];
      if (reg.maxDoseMg && dose[1] > reg.maxDoseMg) { dose = [Math.min(dose[0], reg.maxDoseMg), reg.maxDoseMg]; capped.push(`حد الجرعة الواحدة ${reg.maxDoseMg} ملغ`); }
      if (reg.maxDayMgPerKg) maxDay = Math.min(weightKg * reg.maxDayMgPerKg, reg.maxDayMg ?? Infinity);
      if (reg.dosesPerDay) day = [dose[0] * reg.dosesPerDay, dose[1] * reg.dosesPerDay];
      break;
    }
    case 'age': {
      if (ageMonths === null) return { error: 'أدخل عمر الطفل' };
      const band = reg.ages!.find(a => ageMonths >= a.minMonths && (a.maxMonths === undefined || ageMonths < a.maxMonths));
      if (!band) return { error: `لا توجد جرعة في المصدر لهذا العمر (تبدأ من ${fmtAge(reg.ages![0].minMonths)})` };
      dose = Array.isArray(band.mg) ? [band.mg[0], band.mg[1]] : [band.mg, band.mg];
      maxDay = band.maxDayMg;
      label = band.label;
      break;
    }
    case 'weightBand': {
      if (!weightKg) return { error: 'أدخل وزن الطفل' };
      const bands = reg.bands!;
      const band = weightKg < bands[0].minKg ? undefined : bands.find(b => b.maxKg === undefined || weightKg <= b.maxKg);
      if (!band) return { error: `لا توجد جرعة في المصدر لهذا الوزن (تبدأ من ${bands[0].minKg} كغ)` };
      dose = [band.mg, band.mg];
      break;
    }
    case 'fixed': {
      dose = [reg.fixedMg!, reg.fixedMg!];
      if (reg.dosesPerDay) day = [reg.fixedMg! * reg.dosesPerDay, reg.fixedMg! * reg.dosesPerDay];
      break;
    }
  }

  return {
    doseMg: [round1(dose[0]), round1(dose[1])],
    doseMl: [mgToMl(dose[0]), mgToMl(dose[1])],
    dayMg: day ? [round1(day[0]), round1(day[1])] : undefined,
    maxDayMg: maxDay !== undefined ? round1(maxDay) : undefined,
    dosesPerDay: reg.dosesPerDay,
    capped, warnings, label,
  };
}

export function fmtAge(months: number): string {
  if (months < 12) return `${months} أشهر`;
  const y = months / 12;
  return Number.isInteger(y) ? (y === 1 ? 'سنة' : y === 2 ? 'سنتان' : `${y} سنوات`) : `${months} شهراً`;
}
