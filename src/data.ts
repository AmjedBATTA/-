import { Medicine, EcosystemService, FAQItem, Order } from './types';

export const MEDICINES_DATA: Medicine[] = [
  {
    id: '1',
    nameAr: 'بندول اكسترا',
    nameEn: 'Panadol Extra',
    scientificName: 'Paracetamol + Caffeine',
    activeIngredient: 'باراسيتامول + كافيين',
    category: 'مسكنات الألم',
    warehouse: 'مكتب دجلة العلمي للأدوية (بغداد)',
    price: 3500,
    secondaryPrice: 3800,
    availableQuantity: 450,
    status: 'available'
  },
  {
    id: '2',
    nameAr: 'اموكسيل 500 ملغ',
    nameEn: 'Amoxil 500mg',
    scientificName: 'Amoxicillin',
    activeIngredient: 'أموكسيسيلين',
    category: 'المضادات الحيوية',
    warehouse: 'مذخر قصر الشفاء الحديث (أربيل)',
    price: 7200,
    secondaryPrice: 7900,
    availableQuantity: 120,
    status: 'available'
  },
  {
    id: '3',
    nameAr: 'ليببتور 20 ملغ',
    nameEn: 'Lipitor 20mg',
    scientificName: 'Atorvastatin',
    activeIngredient: 'أتورفاستاتين',
    category: 'أدوية الكولسترول والقلب',
    warehouse: 'مذخر الرافدين للادوية (البصرة)',
    price: 18500,
    secondaryPrice: 20000,
    availableQuantity: 15,
    status: 'low'
  },
  {
    id: '4',
    nameAr: 'فولتارين جيل 50 غرام',
    nameEn: 'Voltaren Gel 50g',
    scientificName: 'Diclofenac Diethylamine',
    activeIngredient: 'ديكلوفيناك ثنائي إيثيل الأمين',
    category: 'كريمات ومسكنات موضعية',
    warehouse: 'مذخر النخبة العلمي (الموصل)',
    price: 4800,
    secondaryPrice: 5200,
    availableQuantity: 0,
    status: 'unavailable'
  },
  {
    id: '5',
    nameAr: 'كونكور 5 ملغ',
    nameEn: 'Concor 5mg',
    scientificName: 'Bisoprolol Fumarate',
    activeIngredient: 'بيسوبرولول فومارات',
    category: 'أدوية الضغط والقلب',
    warehouse: 'مكتب دجلة العلمي للأدوية (بغداد)',
    price: 11000,
    secondaryPrice: 12000,
    availableQuantity: 300,
    status: 'available'
  },
  {
    id: '6',
    nameAr: 'دياميكرون 60 ملغ',
    nameEn: 'Diamicron 60mg MR',
    scientificName: 'Gliclazide',
    activeIngredient: 'غليكلازيد',
    category: 'أدوية السكري',
    warehouse: 'مذخر السلام الدولي (النجف)',
    price: 9500,
    secondaryPrice: 10500,
    availableQuantity: 8,
    status: 'low'
  },
  {
    id: '7',
    nameAr: 'بروفين 400 ملغ',
    nameEn: 'Brufen 400mg',
    scientificName: 'Ibuprofen',
    activeIngredient: 'إيبوبروفين',
    category: 'مضادات الالتهاب ومسكنات',
    warehouse: 'مذخر الفيحاء الدوائي (السليمانية)',
    price: 4000,
    secondaryPrice: 4500,
    availableQuantity: 600,
    status: 'available'
  },
  {
    id: '8',
    nameAr: 'أوتميل شراب للأطفال',
    nameEn: 'Augmentin Suspension',
    scientificName: 'Co-amoxiclav',
    activeIngredient: 'أموكسيسيلين + حمض الكلافولانيك',
    category: 'المضادات الحيوية',
    warehouse: 'مكتب الرافدين للأدوية (بغداد)',
    price: 9800,
    secondaryPrice: 11000,
    availableQuantity: 0,
    status: 'unavailable'
  }
];

export const ECOSYSTEM_SERVICES: EcosystemService[] = [
  {
    id: 'b2b',
    titleAr: 'كبسولة B2B',
    titleEn: 'Capsula B2B',
    badge: 'المنصة الأم',
    description: 'المنصة الأساسية والأقوى في العراق التي تربط الصيدليات بمئات المذاخر الطبية ومستودعات الأدوية لشراء وتصفح آلاف المواد الطبية في ثوانٍ مع تصفية ذكية وعروض حصرية.',
    iconName: 'LayoutGrid',
    color: 'emerald'
  },
  {
    id: 'plus',
    titleAr: 'كبسولة بلس +',
    titleEn: 'Capsula Plus',
    badge: 'نظام إدارة صيدليات المتكامل',
    description: 'نظام إدارة ونقاط بيع (POS) سحابي فائق الذكاء للصيدليات، يقوم بإدارة المخزون، الحسابات المالية، والمبيعات مع تنبيهات صلاحية الأدوية التلقائية ودعم تقارير مبيعات الأطباء.',
    iconName: 'Cpu',
    color: 'blue'
  },
  {
    id: 'market',
    titleAr: 'كبسولة ماركت',
    titleEn: 'Capsula Market',
    badge: 'مستلزمات وأجهزة طبية',
    description: 'سوق رقمي مخصص للمستلزمات الطبية غير الدوائية، الأجهزة العلمية والمخبرية، مستحضرات التجميل والعناية الشخصية، يمنح صيدليتك فرصة شراء البضائع مباشرة من الوكلاء بخصومات هائلة.',
    iconName: 'ShoppingBag',
    color: 'purple'
  },
  {
    id: 'nod',
    titleAr: 'كبسولة نود',
    titleEn: 'Capsula Nod',
    badge: 'المندوبين والمكاتب العلمية',
    description: 'تطبيق ثوري يربط المندوبين والمكاتب العلمية مباشرة بإدارات الصيدليات والمذاخر، مما يسهل عمليات الحجز والزيارات العلمية وتتبع مستهدفات المندوبين بكفاءة.',
    iconName: 'Users',
    color: 'amber'
  },
  {
    id: 'pay',
    titleAr: 'كبسولة باي',
    titleEn: 'Capsula Pay',
    badge: 'حلول الدفع والتدفق المالي',
    description: 'منظومة مالية آمنة في العراق تتيح للصيادلة تسوية الفواتير مع المذاخر إلكترونياً، وجدولة الديون، وتسهيل التحصيل المالي للمستودعات مما يقلل مخاطر السيولة الورقية.',
    iconName: 'CreditCard',
    color: 'teal'
  },
  {
    id: 'offer',
    titleAr: 'كبسولة أوفير (الشراء الجماعي)',
    titleEn: 'Capsula Offer',
    badge: 'الخصومات الكبرى',
    description: 'تقنية الشراء التعاوني الجماعي، حيث تدمج كبسولة طلبات مئات الصيدليات الصغيرة لتشكيل طلب ضخم موحد، مما يؤهلهم للحصول على خصومات حصرية (بونص) وأسعار جملة منافسة.',
    iconName: 'ReceiptPercent',
    color: 'rose'
  },
  {
    id: '360',
    titleAr: 'كبسولة 360',
    titleEn: 'Capsula 360',
    badge: 'بوابة المريض والصيدلية',
    description: 'تطبيق موجه للمرضى يتيح لهم البحث عن الوصفات ونواقص الأدوية وربطهم بأقرب صيدلية تستخدم منصة كبسولة لضمان توفر الدواء وتسهيل عملية الحجز والاستلام.',
    iconName: 'ShieldPlus',
    color: 'indigo'
  }
];

export const MOCK_ORDERS: Order[] = [
  {
    id: 'CAP-28109',
    date: '2026-05-29',
    warehouseName: 'مكتب دجلة العلمي للأدوية (بغداد)',
    itemsCount: 3,
    totalAmount: 485000,
    status: 'preparing',
    items: [
      { medicineName: 'بندول اكسترا (كرتون)', quantity: 5, price: 35000 },
      { medicineName: 'كونكور 5 ملغ (علبة)', quantity: 10, price: 11000 },
      { medicineName: 'اموكسيل 500 ملغ (علبة)', quantity: 20, price: 10000 }
    ]
  },
  {
    id: 'CAP-27941',
    date: '2026-05-27',
    warehouseName: 'مذخر قصر الشفاء الحديث (أربيل)',
    itemsCount: 2,
    totalAmount: 1240000,
    status: 'on_way',
    items: [
      { medicineName: 'ليببتور 20 ملغ (علبة كبيرة)', quantity: 50, price: 18500 },
      { medicineName: 'دياميكرون 60 ملغ (علبة كبيرة)', quantity: 33, price: 9500 }
    ]
  },
  {
    id: 'CAP-26510',
    date: '2026-05-20',
    warehouseName: 'مذخر الرافدين للادوية (البصرة)',
    itemsCount: 1,
    totalAmount: 160000,
    status: 'delivered',
    items: [
      { medicineName: 'بروفين 400 ملغ (علبة صغيرة)', quantity: 40, price: 4000 }
    ]
  }
];

export const FAQS_DATA: FAQItem[] = [
  {
    id: 'faq1',
    question: 'ما هي شروط تفعيل حساب الصيدلية وبدء الطلب؟',
    answer: 'يجب أن تكون صيدلياً مجازاً وتمتلك إجازة ممارسة مهنة سارية صادرة عن نقابة صيادلة العراق. عند التسجيل عبر التطبيق، ستقوم برفع صورة الهوية أو صورة الإجازة لتتحقق منها إدارة كبسولة وتفعل حسابك خلال ساعات معدودة لتبدأ بالتسوق الفوري.'
  },
  {
    id: 'faq2',
    question: 'هل توجد عمولات أو رسوم إضافية تضعها كبسولة على الصيدليات؟',
    answer: 'لا، تطبيق كبسولة مجاني تماماً للصيدليات ولا يفرض أي زيادات أو رسوم فوق أسعار المذاخر الحقيقية. الأسعار المتاحة داخل التطبيق هي تماماً نفس الأسعار الرسمية والمعلنة الصادرة من مذاخر وشركات الأدوية شريكة المنصة.'
  },
  {
    id: 'faq3',
    question: 'كيف تتم عملية توصيل الأدوية الطلبية من كبسولة؟',
    answer: 'تتم عملية التوصيل واللوجستيات من خلال سيارات المذاخر العلمية المعتمدة ومستودعات الأدوية نفسها، أو عبر الأسطول الخاص بكبسولة المبرد وفقاً لشروط التخزين الدوائي لضمان وصول شحنتك سليمة ومبردة وبأقصر وقت.'
  },
  {
    id: 'faq4',
    question: 'أنا صاحب مذخر أدوية أو مكتب علمي، كيف يمكنني إدراج منتجاتي؟',
    answer: 'نحن نرحب بكافة المذاخر الطبية المرخصة والمكاتب العلمية بمختلف محافظات العراق. يمكنك التواصل مباشرة معنا عبر رقم خدمات المذاخر (07802884040) أو ملء نموذج رغبة الشراكة في النظام ليقوم فريق تجاري متكامل بتهيئة لوحة تحكم خاصة بك لإدارة مخزونك وطلباتك.'
  },
  {
    id: 'faq5',
    question: 'هل يمكن للصيدليات في المحافظات الشمالية أو الجنوبية الطلب من بغداد؟',
    answer: 'نعم، كبسولة تدعم الشحن والتوصيل البيني بين المحافظات. يمكنك تصفح المذاخر المتوفرة في محافظتك أو البحث عن المذاخر في المحافظات الأخرى التي تقدم خدمات الشحن إلى محافظتك بكل يسر وعبر بوابات الحساب المالي الموحد.'
  }
];

export const GOVERNORATES = [
  'بغداد',
  'أربيل',
  'البصرة',
  'الموصل',
  'النجف',
  'كربلاء',
  'السليمانية',
  'دهوك',
  'بابل',
  'صلاح الدين',
  'ديالى',
  'الأنبار',
  'ذي قار',
  'ميسان',
  'المثنى',
  'القادسية',
  'واسط',
  'كركوك'
];
