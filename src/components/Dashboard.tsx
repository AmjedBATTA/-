import { useState, FormEvent, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShoppingBag, Wallet, Info, CheckCircle2, AlertCircle, Clock, 
  Truck, HelpCircle, PlusCircle, Search, Trash2, ArrowLeft, 
  MapPin, UserCheck, ShieldCheck, Users, Sparkles, Plus, Check,
  TrendingUp, FileText, Ban, DollarSign, Calendar, RefreshCw, BarChart3, Pill, ClipboardList, ShieldAlert, Heart,
  Barcode, X, Volume2, VolumeX, Camera, Download
} from 'lucide-react';
import { Medicine, Order } from '../types';

// Firebase Authentication & Remote Firestore Synchronizer hooks
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { collection, doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';

// Let's declare our reactive state types inside the component
interface POSItem {
  medicine: Medicine;
  quantity: number;
}

interface SaleRecord {
  invoiceId: string;
  timestamp: string;
  items: { name: string; quantity: number; price: number }[];
  subtotal: number;
  discount: number;
  total: number;
  customerName: string;
  isControlled: boolean;
}

interface ControlledPrescription {
  id: string;
  patientName: string;
  doctorName: string;
  prescriptionDate: string;
  medicineName: string;
  quantity: number;
  pharmacistLicense: string;
}

export default function Dashboard() {
  // --- FIREBASE AUTH & SYNCHRONIZER METRIC REGISTERS ---
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  // --- CORE LIVING STATE OF THE PHARMACY (Saves in session-state) ---
  const [inventory, setInventory] = useState<Medicine[]>([
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
      status: 'available',
      barcode: '6281100115598'
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
      status: 'available',
      barcode: '5011327110992'
    },
    {
      id: '3',
      nameAr: 'ليبيتور 20 ملغ',
      nameEn: 'Lipitor 20mg',
      scientificName: 'Atorvastatin',
      activeIngredient: 'أتورفاستاتين',
      category: 'أدوية الكولسترول والقلب',
      warehouse: 'مذخر الرافدين للادوية (البصرة)',
      price: 18500,
      secondaryPrice: 20000,
      availableQuantity: 15,
      status: 'low',
      barcode: '8699532095457'
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
      availableQuantity: 64,
      status: 'available',
      barcode: '7611327110931'
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
      status: 'available',
      barcode: '4004732101236'
    },
    {
      id: '6',
      nameAr: 'دياميكرون 60 ملغ',
      nameEn: 'Diamicron 60mg MR',
      scientificName: 'Gliclazide',
      activeIngredient: 'غليكلازيد',
      category: 'أدوية السكري',
      price: 9500,
      secondaryPrice: 10500,
      availableQuantity: 8,
      warehouse: 'مذخر السلام الدولي (النجف)',
      status: 'low',
      barcode: '5011327789311'
    },
    {
      id: '7',
      nameAr: 'زاناكس 0.5 ملغ (خاضع للمراقبة)',
      nameEn: 'Xanax 0.5mg',
      scientificName: 'Alprazolam',
      activeIngredient: 'ألبرازولام',
      category: 'مؤثرات عقلية مهدئة',
      warehouse: 'مكتب دجلة العلمي للأدوية (بغداد)',
      price: 22000,
      secondaryPrice: 24000,
      availableQuantity: 42,
      status: 'available',
      barcode: '7611327114321'
    }
  ]);

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

  // B2B Supplier orders
  const [b2bOrders, setB2bOrders] = useState<Order[]>([
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
        { medicineName: 'ليبيتور 20 ملغ (علبة كبيرة)', quantity: 50, price: 18500 },
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
  ]);

  // Financial States
  const [walletBalance, setWalletBalance] = useState(3890000); // IQD cash in register
  const [totalDebts, setTotalDebts] = useState(1850000); // IQD suppliers debts
  const [dailySalesRevenue, setDailySalesRevenue] = useState(729000); // Today's POS cash sum

  // App Section Select
  const [activeTab, setActiveTab] = useState<'pos' | 'inventory' | 'b2b' | 'narcotics' | 'financial' | 'team'>('pos');

  // --- POS CART STATES ---
  const [currentCart, setCurrentCart] = useState<POSItem[]>([]);
  const [posCustomerName, setPosCustomerName] = useState('زبون نقدي / خارجي');
  const [posDiscountPercent, setPosDiscountPercent] = useState<number>(0);
  const [searchPOSQuery, setSearchPOSQuery] = useState('');
  const [lastPrintedInvoice, setLastPrintedInvoice] = useState<SaleRecord | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showVirtualPriceInPOS, setShowVirtualPriceInPOS] = useState(false);

  // --- SALES HISTORY LEDGER ---
  const [salesLedger, setSalesLedger] = useState<SaleRecord[]>([
    {
      invoiceId: 'INV-4821',
      timestamp: '2026-05-30 09:12',
      items: [{ name: 'اموكسيل 500 ملغ', quantity: 2, price: 7200 }],
      subtotal: 14400,
      discount: 0,
      total: 14400,
      customerName: 'أبو سيف البغدادي',
      isControlled: false
    },
    {
      invoiceId: 'INV-4820',
      timestamp: '2026-05-30 08:34',
      items: [
        { name: 'بندول اكسترا', quantity: 3, price: 3500 },
        { name: 'كونكور 5 ملغ', quantity: 1, price: 11000 }
      ],
      subtotal: 21500,
      discount: 1500,
      total: 20000,
      customerName: 'أم سليم الكرخي',
      isControlled: false
    }
  ]);

  // --- CONTROL REFRIGERATOR TEMPERATURE SIMULATOR ---
  const [fridgeTemp, setFridgeTemp] = useState<number>(4.2); // Celcius loop
  useEffect(() => {
    const interval = setInterval(() => {
      setFridgeTemp(prev => {
        const drift = (Math.random() - 0.5) * 0.4;
        const next = parseFloat((prev + drift).toFixed(1));
        return next < 2.5 ? 2.5 : next > 6.5 ? 6.5 : next;
      });
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  // --- MOH NARCOTICS REGISTRY PRESCRIPTIONS ---
  const [narcoticPrescriptions, setNarcoticPrescriptions] = useState<ControlledPrescription[]>([
    {
      id: 'REC-2910',
      patientName: 'عصام قاسم خضير',
      doctorName: 'د. يوسف شريف الكعبي (أخصائي جملة عصبية)',
      prescriptionDate: '2026-05-29',
      medicineName: 'زاناكس 0.5 ملغ (خاضع للمراقبة)',
      quantity: 1,
      pharmacistLicense: 'MOH-78329'
    }
  ]);

  // New controlled prescription form states
  const [newPrescPatient, setNewPrescPatient] = useState('');
  const [newPrescDoctor, setNewPrescDoctor] = useState('');
  const [newPrescMedId, setNewPrescMedId] = useState('7'); // Xanax id
  const [newPrescQty, setNewPrescQty] = useState(1);
  const [newPrescLicense, setNewPrescLicense] = useState('MOH-78291');
  const [prescriptionSuccess, setPrescriptionSuccess] = useState(false);

  // --- DYNAMIC INVENTORY ACTIONS ---
  const [searchInInventoryQuery, setSearchInInventoryQuery] = useState('');
  const [newDrugAr, setNewDrugAr] = useState('');
  const [newDrugEn, setNewDrugEn] = useState('');
  const [newDrugSci, setNewDrugSci] = useState('');
  const [newDrugCat, setNewDrugCat] = useState('مسكنات الألم');
  const [newDrugPrice, setNewDrugPrice] = useState<number>(5000);
  const [newDrugSecondaryPrice, setNewDrugSecondaryPrice] = useState<number>(5500);
  const [newDrugQty, setNewDrugQty] = useState<number>(100);
  const [newDrugExpiry, setNewDrugExpiry] = useState('2028-12-01');
  const [isAddingDrug, setIsAddingDrug] = useState(false);

  // --- PURCHASE ORDERS (طلبيات الشراء) STATES ---
  const [purchaseDraft, setPurchaseDraft] = useState<any[]>([
    {
      id: 'draft-1',
      medicineId: '1',
      nameAr: 'بندول اكسترا (Panadol Extra)',
      nameEn: 'Panadol Extra',
      scientificName: 'Paracetamol + Caffeine',
      category: 'مسكنات الألم',
      price: 2500,
      qty: 60,
      expiryDate: '2028-06-15',
      barcode: '6281100115598',
      retailPrice: 3500
    },
    {
      id: 'draft-2',
      medicineId: '2',
      nameAr: 'اموكسيل 500 ملغ (Amoxil)',
      nameEn: 'Amoxil',
      scientificName: 'Amoxicillin',
      category: 'المضادات الحيوية',
      price: 5200,
      qty: 25,
      expiryDate: '2027-11-01',
      barcode: '5011327110992',
      retailPrice: 7200
    }
  ]);

  const [purchaseSearchWord, setPurchaseSearchWord] = useState('');
  const [purchaseNewProdAr, setPurchaseNewProdAr] = useState('');
  const [purchaseNewProdEn, setPurchaseNewProdEn] = useState('');
  const [purchaseNewProdSci, setPurchaseNewProdSci] = useState('');
  const [purchaseNewProdCat, setPurchaseNewProdCat] = useState('مسكنات الألم');
  const [purchaseNewProdPrice, setPurchaseNewProdPrice] = useState<number>(3000);
  const [purchaseNewProdQty, setPurchaseNewProdQty] = useState<number>(50);
  const [purchaseNewProdExpiry, setPurchaseNewProdExpiry] = useState('2028-12-01');
  const [purchaseNewProdBarcode, setPurchaseNewProdBarcode] = useState('');
  const [showPurchaseNewProdForm, setShowPurchaseNewProdForm] = useState(false);
  const [purchaseSuccessBanner, setPurchaseSuccessBanner] = useState<string | null>(null);

  // --- CAMERA BARCODE SCANNER STATES & LOGIC FOR DASHBOARD ---
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanSuccessFeedback, setScanSuccessFeedback] = useState<string | null>(null);
  const [scanStream, setScanStream] = useState<MediaStream | null>(null);
  const [isBeepEnabled, setIsBeepEnabled] = useState(true);
  const [scanTarget, setScanTarget] = useState<'pos' | 'inventory' | 'add-drug' | 'purchase-order'>('pos');
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

  const startScanning = async (target: 'pos' | 'inventory' | 'add-drug' | 'purchase-order') => {
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
      setSearchPOSQuery(code);
    } else if (scanTarget === 'inventory') {
      setSearchInInventoryQuery(code);
    } else if (scanTarget === 'add-drug') {
      setNewDrugBarcode(code);
    } else if (scanTarget === 'purchase-order') {
      const match = inventory.find(m => m.barcode === code);
      if (match) {
        const existsInDraft = purchaseDraft.find(d => d.medicineId === match.id);
        if (existsInDraft) {
          setPurchaseDraft(prev => prev.map(d => d.medicineId === match.id ? { ...d, qty: d.qty + 10 } : d));
        } else {
          const freshDraft = {
            id: 'draft-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            medicineId: match.id,
            nameAr: match.nameAr,
            nameEn: match.nameEn,
            scientificName: match.scientificName,
            category: match.category,
            price: Math.floor(match.price * 0.72) || 3000,
            qty: 50,
            expiryDate: expiryDates[match.id] || '2028-06-01',
            barcode: code
          };
          setPurchaseDraft(prev => [...prev, freshDraft]);
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

  const getDaysUntilExpiry = (id: string) => {
    const expDateStr = expiryDates[id];
    if (!expDateStr) return 9999;
    const currentDate = new Date('2026-05-30');
    const expiryDate = new Date(expDateStr);
    const diffTime = expiryDate.getTime() - currentDate.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const getNearExpiryMeds = () => {
    return inventory.filter(m => {
      const days = getDaysUntilExpiry(m.id);
      return days <= 30;
    });
  };


  // --- B2B ENHANCED PROCUREMENT WIZARD ---
  const [b2bSelectedMedId, setB2bSelectedMedId] = useState('1');
  const [b2bOrderQty, setB2bOrderQty] = useState<number>(50);
  const [b2bOrderSuccess, setB2bOrderSuccess] = useState(false);
  const [b2bNewOrderId, setB2bNewOrderId] = useState('');

  // --- TEAM MEMBER STATES ---
  const [teamMembers, setTeamMembers] = useState([
    { id: 1, name: 'د. أحمد الهاشمي', role: 'الصيدلاني المدير المسؤول', license: 'ص-94281', shift: 'مناوب نهاري', status: 'active' },
    { id: 2, name: 'د. علي حسن الموسوي', role: 'صيدلاني مناوب', license: 'ص-78229', shift: 'مناوب مسائي', status: 'active' },
    { id: 3, name: 'رنا جبار العقابي', role: 'مساعد صيدلي مرخص', license: 'ت-48220', shift: 'مناوب طوارئ', status: 'break' }
  ]);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffRole, setNewStaffRole] = useState('صيدلاني مناوب');
  const [newStaffLicense, setNewStaffLicense] = useState('');

  // --- REMOTE CLOUD FIREBASE SYNC OBSERVERS & TRIGGERS ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setIsAuthLoading(false);
    });
    return unsubscribe;
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
    const unsubInventory = onSnapshot(inventoryCol, (snapshot) => {
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
      handleFirestoreError(error, OperationType.LIST, `users/${userId}/inventory`);
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
      handleFirestoreError(error, OperationType.LIST, `users/${userId}/b2bOrders`);
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
        setDailySalesRevenue(totalSalesSum > 0 ? totalSalesSum : 729000);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${userId}/salesLedger`);
    });

    // 4. Sync Narcotics Collection
    const narcoticsCol = collection(db, 'users', userId, 'narcoticPrescriptions');
    const unsubNarcotics = onSnapshot(narcoticsCol, (snapshot) => {
      if (snapshot.empty) {
        narcoticPrescriptions.forEach(async (presc) => {
          try {
            await setDoc(doc(db, 'users', userId, 'narcoticPrescriptions', presc.id), {
              ...presc,
              userId
            });
          } catch (e) {
            handleFirestoreError(e, OperationType.CREATE, `users/${userId}/narcoticPrescriptions/${presc.id}`);
          }
        });
      } else {
        const loadedPrescs: ControlledPrescription[] = [];
        snapshot.forEach((doc) => {
          loadedPrescs.push(doc.data() as ControlledPrescription);
        });
        loadedPrescs.sort((a, b) => new Date(b.prescriptionDate).getTime() - new Date(a.prescriptionDate).getTime());
        setNarcoticPrescriptions(loadedPrescs);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${userId}/narcoticPrescriptions`);
    });

    // 5. Sync Team Members Collection
    const teamCol = collection(db, 'users', userId, 'teamMembers');
    const unsubTeam = onSnapshot(teamCol, (snapshot) => {
      if (snapshot.empty) {
        teamMembers.forEach(async (member) => {
          try {
            await setDoc(doc(db, 'users', userId, 'teamMembers', String(member.id)), {
              ...member,
              id: String(member.id),
              userId
            });
          } catch (e) {
            handleFirestoreError(e, OperationType.CREATE, `users/${userId}/teamMembers/${member.id}`);
          }
        });
      } else {
        const loadedTeam: any[] = [];
        snapshot.forEach((doc) => {
          loadedTeam.push(doc.data());
        });
        loadedTeam.sort((a, b) => Number(a.id) - Number(b.id));
        setTeamMembers(loadedTeam);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${userId}/teamMembers`);
    });

    setIsSyncing(false);

    return () => {
      unsubInventory();
      unsubB2bOrders();
      unsubSalesLedger();
      unsubNarcotics();
      unsubTeam();
    };
  }, [currentUser]);

  // Handle Google OAuth Action
  const handleGoogleSignIn = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error("Sign-in failed:", err);
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

  // Search filter for POS select
  const filteredPOSMeds = inventory.filter(m => {
    const q = searchPOSQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      m.nameAr.includes(q) ||
      m.nameEn.toLowerCase().includes(q) ||
      m.scientificName.toLowerCase().includes(q) ||
      (m.barcode && m.barcode.toLowerCase().includes(q))
    );
  });

  const addToCart = (med: Medicine) => {
    if (med.availableQuantity <= 0) return;
    const existingIndex = currentCart.findIndex(item => item.medicine.id === med.id);
    if (existingIndex !== -1) {
      const alreadyInCart = currentCart[existingIndex].quantity;
      if (alreadyInCart < med.availableQuantity) {
        const nextCart = [...currentCart];
        nextCart[existingIndex].quantity += 1;
        setCurrentCart(nextCart);
      }
    } else {
      setCurrentCart([...currentCart, { medicine: med, quantity: 1 }]);
    }
  };

  const removeFromCart = (medId: string) => {
    setCurrentCart(currentCart.filter(item => item.medicine.id !== medId));
  };

  const updateCartQty = (medId: string, delta: number) => {
    const nextCart = currentCart.map(item => {
      if (item.medicine.id === medId) {
        const nextQty = item.quantity + delta;
        const maxQty = item.medicine.availableQuantity;
        if (nextQty >= 1 && nextQty <= maxQty) {
          return { ...item, quantity: nextQty };
        }
      }
      return item;
    });
    setCurrentCart(nextCart);
  };

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

    // Check if cartoon contains controlled substance
    const containsControlled = currentCart.some(item => item.medicine.category.includes('مؤثرات') || item.medicine.id === '7');

    const newSaleRecord: SaleRecord = {
      invoiceId,
      timestamp: formattedTimestamp,
      items: currentCart.map(item => ({
        name: `${item.medicine.nameAr} (${item.medicine.nameEn})`,
        quantity: item.quantity,
        price: item.medicine.price
      })),
      subtotal: posSubtotal,
      discount: posDiscountAmount,
      total: posTotal,
      customerName: posCustomerName,
      isControlled: containsControlled
    };

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
      
      setLastPrintedInvoice(newSaleRecord);
      setShowReceiptModal(true);
      setCurrentCart([]);
      setPosCustomerName('زبون نقدي / خارجي');
      setPosDiscountPercent(0);
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

      // Adjust financial counters
      setWalletBalance(prev => prev + posTotal);
      setDailySalesRevenue(prev => prev + posTotal);

      // Store sales record local fallback
      setSalesLedger([newSaleRecord, ...salesLedger]);
      setLastPrintedInvoice(newSaleRecord);
      setShowReceiptModal(true);

      // Clear cart & trigger reset
      setCurrentCart([]);
      setPosCustomerName('زبون نقدي / خارجي');
      setPosDiscountPercent(0);
    }
  };

  // --- MOH COMPLIANCE WRITE LOGS ---
  const handleAddControlledPrescription = (e: FormEvent) => {
    e.preventDefault();
    if (!newPrescPatient || !newPrescDoctor) return;

    const medObj = inventory.find(m => m.id === newPrescMedId);
    if (!medObj) return;

    const recordId = `REC-${Math.floor(Math.random() * 9000 + 1000)}`;

    // Build the log
    const newLog: ControlledPrescription = {
      id: recordId,
      patientName: newPrescPatient,
      doctorName: newPrescDoctor,
      prescriptionDate: new Date().toISOString().split('T')[0],
      medicineName: `${medObj.nameAr} (${medObj.nameEn})`,
      quantity: newPrescQty,
      pharmacistLicense: newPrescLicense
    };

    if (currentUser) {
      const userId = currentUser.uid;
      // 1. Add controlled prescription record to Firestore
      setDoc(doc(db, 'users', userId, 'narcoticPrescriptions', recordId), {
        ...newLog,
        userId
      }).catch(e => handleFirestoreError(e, OperationType.CREATE, `users/${userId}/narcoticPrescriptions/${recordId}`));

      // 2. Decrement medicine stock quantity in Firestore
      const resQty = Math.max(0, medObj.availableQuantity - newPrescQty);
      const updatedMed = {
        ...medObj,
        availableQuantity: resQty,
        status: resQty <= 0 ? 'unavailable' : resQty < 15 ? 'low' : 'available',
        updatedAt: new Date().toISOString()
      };
      setDoc(doc(db, 'users', userId, 'inventory', medObj.id), updatedMed)
        .catch(e => handleFirestoreError(e, OperationType.WRITE, `users/${userId}/inventory/${medObj.id}`));

      setPrescriptionSuccess(true);
    } else {
      // Local state fallback
      setNarcoticPrescriptions([newLog, ...narcoticPrescriptions]);
      setPrescriptionSuccess(true);

      // Decrement the narcotics quantities automatically
      setInventory(prev => prev.map(m => {
        if (m.id === newPrescMedId) {
          const resQty = Math.max(0, m.availableQuantity - newPrescQty);
          return {
            ...m,
            availableQuantity: resQty,
            status: resQty <= 0 ? 'unavailable' : resQty < 15 ? 'low' : 'available'
          };
        }
        return m;
      }));
    }

    setTimeout(() => {
      setPrescriptionSuccess(false);
      setNewPrescPatient('');
      setNewPrescDoctor('');
    }, 2500);
  };

  // --- DYNAMIC NEW INVENTORY ADD ---
  const handleAddNewDrug = (e: FormEvent) => {
    e.preventDefault();
    if (!newDrugAr || !newDrugEn) return;

    const newId = String(inventory.length + 1);
    const newMedItem: Medicine = {
      id: newId,
      nameAr: newDrugAr,
      nameEn: newDrugEn,
      scientificName: newDrugSci || 'N/A',
      activeIngredient: newDrugSci || 'N/A',
      category: newDrugCat,
      warehouse: 'أدخلت يدويا في صيدلية بلس',
      price: newDrugPrice,
      secondaryPrice: newDrugSecondaryPrice,
      availableQuantity: newDrugQty,
      status: 'available',
      barcode: newDrugBarcode || '62811' + Math.floor(Math.random() * 90000000 + 10000000)
    };

    if (currentUser) {
      const userId = currentUser.uid;
      setDoc(doc(db, 'users', userId, 'inventory', newId), {
        ...newMedItem,
        userId
      }).catch(e => handleFirestoreError(e, OperationType.CREATE, `users/${userId}/inventory/${newId}`));
    } else {
      setInventory([...inventory, newMedItem]);
    }

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
  };

  // --- PURCHASE ORDERS (طلبيات الشراء) BUSINESS LOGIC ---
  const addToPurchaseDraft = (med: any) => {
    const exists = purchaseDraft.find(d => d.medicineId === med.id);
    if (exists) {
      setPurchaseDraft(prev => prev.map(d => d.medicineId === med.id ? { ...d, qty: d.qty + 10 } : d));
    } else {
      const newItem = {
        id: 'draft-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        medicineId: med.id,
        nameAr: med.nameAr,
        nameEn: med.nameEn,
        scientificName: med.scientificName || 'N/A',
        category: med.category || 'مسكنات الألم',
        price: Math.floor(med.price * 0.72) || 3000, // Wholesale discount!
        qty: 50,
        expiryDate: expiryDates[med.id] || '2028-12-01',
        barcode: med.barcode || '62811' + Math.floor(Math.random() * 900000 + 100000)
      };
      setPurchaseDraft(prev => [...prev, newItem]);
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
      }))
    };

    let updatedInventory = [...inventory];
    let updatedExpiries = { ...expiryDates };

    purchaseDraft.forEach(draftItem => {
      if (draftItem.medicineId) {
        // Exists in inventory!
        updatedInventory = updatedInventory.map(med => {
          if (med.id === draftItem.medicineId) {
            const newQty = med.availableQuantity + Number(draftItem.qty);
            return {
              ...med,
              availableQuantity: newQty,
              price: Math.floor(draftItem.price * 1.25), // 25% profit margin for retail sale
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
          category: draftItem.category,
          warehouse: 'مكتب علمي (توريد طلبيات الشراء)',
          price: Math.floor(draftItem.price * 1.25),
          secondaryPrice: Math.floor(draftItem.price * 1.35),
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
    setWalletBalance(prev => Math.max(0, prev - totalCost));
    setPurchaseDraft([]);
    setPurchaseSuccessBanner(`تم بنجاح اعتماد فاتورة الشراء اليومي بقيمة ${totalCost.toLocaleString()} د.ع وتحديث مستويات المخزون والصلاحيات لـ ${purchaseDraft.length} أدوية!`);
    
    setTimeout(() => {
      setPurchaseSuccessBanner(null);
    }, 6000);
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

  // Payoff supplier debt manually
  const settleSupplierDebts = () => {
    if (walletBalance < 500000) return;
    setWalletBalance(prev => prev - 500000);
    setTotalDebts(prev => Math.max(0, prev - 500000));
  };

  // Export financial reports to CSV
  const exportFinancialsToCSV = () => {
    const totalInventoryValue = inventory.reduce((sum, item) => sum + (item.price * item.availableQuantity), 0);
    const nowStr = new Date().toLocaleString('ar-IQ', { hour12: true });

    let csvContent = '\uFEFF'; // Excel UTF-8 BOM

    // Header Metadata
    csvContent += `كشف الحسابات والسيولة والأرصدة المالية - صيدلية كبسولة بلس\r\n`;
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
    link.setAttribute('download', `التقرير_المالي_صيدلية_بلس_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Add staff employee
  const handleAddStaff = (e: FormEvent) => {
    e.preventDefault();
    if (!newStaffName) return;
    const newId = String(teamMembers.length + 1);
    const newMember = {
      id: newId,
      name: newStaffName,
      role: newStaffRole,
      license: newStaffLicense || `ص-${Math.floor(Math.random() * 90000 + 10000)}`,
      shift: 'دوام مرن',
      status: 'active'
    };

    if (currentUser) {
      const userId = currentUser.uid;
      setDoc(doc(db, 'users', userId, 'teamMembers', newId), {
        ...newMember,
        userId
      }).catch(e => handleFirestoreError(e, OperationType.CREATE, `users/${userId}/teamMembers/${newId}`));
    } else {
      setTeamMembers([...teamMembers, newMember]);
    }

    setNewStaffName('');
    setNewStaffLicense('');
  };

  return (
    <div className="bg-slate-50 min-h-screen text-right" dir="rtl">
      
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
                  <span className="text-[9px] text-emerald-600 font-bold block flex items-center space-x-reverse space-x-1">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                    <span>سحابة كبسولة نشطة ✓</span>
                  </span>
                </div>
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
                    D="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" 
                  />
                  <path 
                    fill="currentColor" 
                    D="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" 
                  />
                  <path 
                    fill="currentColor" 
                    D="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" 
                  />
                  <path 
                    fill="currentColor" 
                    D="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" 
                  />
                </svg>
                <span>ربط المزامنة السحابية (Google)</span>
              </button>
            )}
            <span className="text-slate-300 font-mono text-sm tracking-wide font-bold hidden sm:inline">|</span>
            <span className="text-slate-400 font-mono text-sm tracking-wide font-bold">Capsula Plus</span>
          </div>

          {/* MIDDLE: Quick Refrigerator temp readout */}
          <div className="hidden sm:flex items-center space-x-reverse space-x-4 bg-slate-50 border border-slate-100 px-4 py-1.5 rounded-full text-xs font-semibold">
            <span className="text-slate-500">مستشعر التبريد الذكي:</span>
            <div className="flex items-center space-x-reverse space-x-1.5">
              <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping" />
              <strong className="text-slate-900 font-mono">{fridgeTemp}°C</strong>
              <span className="text-slate-400 text-[10px]">(المطابقة الدوائية ✓)</span>
            </div>
          </div>

          {/* RIGHT: Logo tile widget following the screenshot image of 'نظام إدارة صيدليات المتكامل' */}
          <div className="flex items-center space-x-reverse space-x-3.5">
            <div className="text-right">
              <h1 className="text-slate-900 font-extrabold text-lg tracking-tight leading-none mb-0.5">
                كبسولة بلس <span className="text-emerald-500 font-black">+</span>
              </h1>
              <p className="text-[10px] text-slate-500 font-bold tracking-tight">
                نظام إدارة صيدليات المتكامل
              </p>
            </div>
            {/* The white tile squircle with an emerald-green hardware chip circuit icon */}
            <div className="w-11 h-11 bg-white rounded-2xl border border-slate-100 shadow-sm flex items-center justify-center text-emerald-600 font-black">
              <span className="relative">
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                  <rect x="9" y="9" width="6" height="6" rx="1" />
                  <path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 15h3M1 9h3M1 15h3" />
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
        
        {/* Real-time Counter Indicators */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] text-slate-400 font-black tracking-wider block">السيولة في صندوق الكاش</span>
              <span className="text-xl font-black text-slate-900 tracking-tight font-mono">
                {walletBalance.toLocaleString()} <span className="text-xs text-slate-500 font-sans font-extrabold">د.ع</span>
              </span>
            </div>
            <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
              <Wallet className="w-5.5 h-5.5" />
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
              <TrendingUp className="w-5.5 h-5.5" />
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
              <ClipboardList className="w-5.5 h-5.5" />
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
              <Pill className="w-5.5 h-5.5" />
            </div>
          </div>

        </div>

        {/* 
          =========================================================
          WORKSPACE INNER LAYOUT - SIDEBAR LINKS & VIEWS
          =========================================================
        */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Sidebar Controller tabs */}
          <div className="lg:col-span-3 space-y-2.5">
            <span className="text-[10px] text-slate-400 font-black uppercase tracking-wider block px-2">مفاتيح النظام</span>
            
            <button
              onClick={() => setActiveTab('pos')}
              className={`w-full flex items-center justify-between p-4 rounded-2xl font-bold text-xs transition border cursor-pointer ${
                activeTab === 'pos'
                  ? 'bg-emerald-600 text-white border-transparent shadow-lg shadow-emerald-200/50'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200/60'
              }`}
            >
              <div className="flex items-center space-x-reverse space-x-3.5">
                <ShoppingBag className="w-4.5 h-4.5" />
                <span>نقطة البيع السريعة (POS)</span>
              </div>
              <span className="text-[10px] bg-emerald-100/10 text-slate-600 font-extrabold py-0.5 px-2 rounded-full">كاش</span>
            </button>

            <button
              onClick={() => setActiveTab('inventory')}
              className={`w-full flex items-center justify-between p-4 rounded-2xl font-bold text-xs transition border cursor-pointer ${
                activeTab === 'inventory'
                  ? 'bg-emerald-600 text-white border-transparent shadow-lg shadow-emerald-200/50'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200/60'
              }`}
            >
              <div className="flex items-center space-x-reverse space-x-3.5">
                <Pill className="w-4.5 h-4.5" />
                <span>المخزن وتنبيهات الصلاحية</span>
              </div>
              <span className="text-[10px] bg-amber-500 text-white font-extrabold py-0.5 px-2 rounded-full">
                {inventory.filter(m => (getDaysUntilExpiry(m.id) <= 30) || m.availableQuantity < 15).length} تنبيه
              </span>
            </button>

            <button
              onClick={() => setActiveTab('b2b')}
              className={`w-full flex items-center justify-between p-4 rounded-2xl font-bold text-xs transition border cursor-pointer ${
                activeTab === 'b2b'
                  ? 'bg-emerald-600 text-white border-transparent shadow-lg shadow-emerald-200/50'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200/60'
              }`}
            >
              <div className="flex items-center space-x-reverse space-x-3.5">
                <Truck className="w-4.5 h-4.5" />
                <span>طلبيات المذاخر (كبسولة B2B)</span>
              </div>
              <span className="text-[10px] bg-blue-100/20 text-slate-500 font-semibold py-0.5 px-2 rounded-full">شراء وعروض</span>
            </button>

            <button
              onClick={() => setActiveTab('narcotics')}
              className={`w-full flex items-center justify-between p-4 rounded-2xl font-bold text-xs transition border cursor-pointer ${
                activeTab === 'narcotics'
                  ? 'bg-emerald-600 text-white border-transparent shadow-lg shadow-emerald-200/50'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200/60'
              }`}
            >
              <div className="flex items-center space-x-reverse space-x-3.5">
                <ShieldCheck className="w-4.5 h-4.5" />
                <span>المسجل الرقابي (سجل المؤثرات)</span>
              </div>
              <span className="text-[8px] bg-rose-600 text-white px-2 py-0.5 rounded-full font-sans">وزارة الصحة/النقابة</span>
            </button>

            <button
              onClick={() => setActiveTab('financial')}
              className={`w-full flex items-center justify-between p-4 rounded-2xl font-bold text-xs transition border cursor-pointer ${
                activeTab === 'financial'
                  ? 'bg-emerald-600 text-white border-transparent shadow-lg shadow-emerald-200/50'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200/60'
              }`}
            >
              <div className="flex items-center space-x-reverse space-x-3.5">
                <BarChart3 className="w-4.5 h-4.5" />
                <span>الحسابات المالية وجرد الذمم</span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('team')}
              className={`w-full flex items-center justify-between p-4 rounded-2xl font-bold text-xs transition border cursor-pointer ${
                activeTab === 'team'
                  ? 'bg-emerald-600 text-white border-transparent shadow-lg shadow-emerald-200/50'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200/60'
              }`}
            >
              <div className="flex items-center space-x-reverse space-x-3.5">
                <Users className="w-4.5 h-4.5" />
                <span>الصيادلة والدوام</span>
              </div>
              <span className="text-[9px] bg-slate-100 text-emerald-700 px-2.5 py-0.5 rounded-full font-bold">٢ نشط</span>
            </button>

            {/* Compliance inspection note */}
            <div className="bg-slate-900 text-white p-5 rounded-2xl border border-slate-800 space-y-3.5 text-xs">
              <div className="flex items-center space-x-reverse space-x-2 text-emerald-400 font-extrabold text-[11px]">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>تفتيش نقابة صيادلة العراق</span>
              </div>
              <p className="text-[10px] text-slate-300 font-semibold leading-relaxed">
                الصيدلية ممتثلة لكافة شروط نقابة صيادلة العراق ووزارة الصحة الاتحادية. تم رصد آخر تحديث وتعميم من اللجنة الطبية.
              </p>
              <div className="p-2 bg-slate-850 rounded-lg text-slate-400 text-[10px] space-y-1 font-mono">
                <div>ترخيص صيدلية: مجاز رسمي</div>
                <div>آخر مطابقة: اليوم الصباح</div>
              </div>
            </div>

          </div>

          {/* Main workspace container viewport */}
          <div className="lg:col-span-9 space-y-6">
            
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
                  className="grid grid-cols-1 md:grid-cols-12 gap-6"
                >
                  
                  {/* Left Column: Register checkout & current Cart */}
                  <div className="md:col-span-5 bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6">
                    <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                      <h3 className="font-extrabold text-slate-900 text-sm">سلة البيع الحالية</h3>
                      <button 
                        onClick={() => setCurrentCart([])} 
                        className="text-slate-400 hover:text-rose-600 transition text-[10px] font-bold flex items-center space-x-reverse space-x-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>مسح السلة</span>
                      </button>
                    </div>

                    {currentCart.length === 0 ? (
                      <div className="text-center py-16 space-y-3">
                        <ShoppingBag className="w-10 h-10 text-slate-300 mx-auto" />
                        <p className="text-xs text-slate-400 font-semibold">سلة الكاش فارغة حالياً. اختر دواء من اليسار لبيعه وصرفه.</p>
                      </div>
                    ) : (
                      <form onSubmit={handleCheckoutPOS} className="space-y-5">
                        
                        {/* Cart Items list */}
                        <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                          {currentCart.map((item) => (
                            <div key={item.medicine.id} className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between text-xs">
                              <div className="space-y-1">
                                <span className="font-extrabold text-slate-900 block">{item.medicine.nameAr}</span>
                                {showVirtualPriceInPOS ? (
                                  <span className="text-[9px] text-purple-650 block font-bold font-mono">
                                    {item.medicine.nameEn} • {(item.medicine.secondaryPrice || (item.medicine.price + 500)).toLocaleString()} د.ع
                                  </span>
                                ) : (
                                  <span className="text-[9px] text-slate-400 block font-mono">
                                    {item.medicine.nameEn} • {item.medicine.price.toLocaleString()} د.ع
                                  </span>
                                )}
                              </div>
                              
                              <div className="flex items-center space-x-reverse space-x-2">
                                <button 
                                  type="button"
                                  onClick={() => updateCartQty(item.medicine.id, -1)}
                                  className="w-6 h-6 bg-white border border-slate-200 text-slate-600 rounded-lg flex items-center justify-center font-bold font-mono text-sm hover:bg-slate-100 cursor-pointer"
                                >
                                  -
                                </button>
                                <span className="font-bold text-slate-800 font-mono w-6 text-center">{item.quantity}</span>
                                <button 
                                  type="button"
                                  onClick={() => updateCartQty(item.medicine.id, 1)}
                                  className="w-6 h-6 bg-white border border-slate-200 text-slate-600 rounded-lg flex items-center justify-center font-bold font-mono text-sm hover:bg-slate-100 cursor-pointer"
                                >
                                  +
                                </button>

                                <button 
                                  type="button"
                                  onClick={() => removeFromCart(item.medicine.id)}
                                  className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer mr-2"
                                  title="حذف"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Customer detail input & Discount */}
                        <div className="space-y-3 pt-3 border-t border-slate-100">
                          <div className="space-y-1">
                            <label className="block text-[10px] font-extrabold text-slate-500">اسم المريض / المشتري:</label>
                            <input 
                              type="text" 
                              value={posCustomerName}
                              onChange={(e) => setPosCustomerName(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold text-slate-800 focus:outline-emerald-500" 
                              placeholder="أدخل اسم المريض للتاريخ الطبي"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="block text-[10px] font-extrabold text-slate-500">تطبيق خصم مباشر (%):</label>
                            <select 
                              value={posDiscountPercent}
                              onChange={(e) => setPosDiscountPercent(Number(e.target.value))}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold text-slate-700"
                            >
                              <option value="0">بدون خصم (خصم 0%)</option>
                              <option value="5">خصم عوائل الشهداء والفقراء (5%)</option>
                              <option value="10">الخصم النقابي المعتمد (10%)</option>
                              <option value="15">تصفية خصم خاص للصيادلة (15%)</option>
                            </select>
                          </div>
                        </div>

                        {/* Calculated totals */}
                        <div className="bg-emerald-50/60 p-4 rounded-2xl border border-emerald-100/50 space-y-2.5 text-xs font-semibold text-slate-700">
                          <p className="flex justify-between">
                            <span>المجموع الفرعي:</span>
                            <span className="font-mono text-slate-900">{posSubtotal.toLocaleString()} د.ع</span>
                          </p>
                          {posDiscountAmount > 0 && (
                            <p className="flex justify-between text-rose-700">
                              <span>قيمة الخصم:</span>
                              <span className="font-mono">-{posDiscountAmount.toLocaleString()} د.ع</span>
                            </p>
                          )}
                          <p className="flex justify-between border-t border-emerald-200/50 pt-2.5 text-sm font-black">
                            <span className="text-slate-900">الصافي المطلوب:</span>
                            <span className="text-emerald-700 font-mono">{posTotal.toLocaleString()} د.ع</span>
                          </p>

                          {/* Currency Parallel exchange rate IQD to Dollar simulator */}
                          <div className="border-t border-dashed border-emerald-200/50 pt-2.5 flex justify-between items-center text-[10px] text-slate-400">
                            <span>السعر التفصيلي بمعدل الدولار الموازي:</span>
                            <span className="font-mono font-bold text-slate-600 bg-white px-2 py-0.5 rounded border border-emerald-100">
                              ${(posTotal / 1500).toFixed(2)} USD
                            </span>
                          </div>
                        </div>

                        <button
                          type="submit"
                          className="w-full bg-gradient-to-l from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white py-3 px-4 rounded-xl text-xs font-black shadow-md shadow-emerald-200 transition cursor-pointer flex items-center justify-center space-x-reverse space-x-2"
                        >
                          <Check className="w-4 h-4" />
                          <span>إتمام البيع وصرف الفاتورة</span>
                        </button>

                      </form>
                    )}
                  </div>

                  {/* Right Column: Searchable fast-add medicines shelf */}
                  <div className="md:col-span-7 bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-5">
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                      <div>
                        <h3 className="font-extrabold text-slate-900 text-sm">أدوية ومخازن الصيدلة الحاضرة</h3>
                        <p className="text-[10px] text-slate-400 font-semibold mt-0.5">انقر على الدواء المتوفر لإضافته إلى فاتورة العميل مباشرة</p>
                      </div>
                      
                      {/* Search Input POS */}
                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <div className="relative flex-1 sm:flex-initial">
                          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                          <input 
                            type="text" 
                            value={searchPOSQuery}
                            onChange={(e) => setSearchPOSQuery(e.target.value)}
                            className="bg-slate-50 border border-slate-200 rounded-xl pr-9 pl-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-emerald-500 w-full sm:w-52"
                            placeholder="ابحث بالاسم أو رمز الباركود..."
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => startScanning('pos')}
                          className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-850 text-white rounded-xl px-3 py-1.5 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                          title="قراءة الباركود بالكاميرا (Scan Barcode)"
                        >
                          <Barcode className="w-3.5 h-3.5" />
                          <span className="hidden md:inline">قارئ باركود</span>
                        </button>
                      </div>
                    </div>

                    {/* Price Mode Toggle Control */}
                    <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl">
                      <div className="flex items-center space-x-reverse space-x-2">
                        <span className="w-2.5 h-2.5 bg-purple-500 rounded-full animate-pulse" />
                        <span className="text-xs font-black text-slate-700">تخصيص نظام التسعير السريع للعرض:</span>
                      </div>
                      
                      <button
                        type="button"
                        onClick={() => setShowVirtualPriceInPOS(!showVirtualPriceInPOS)}
                        className={`flex items-center space-x-reverse space-x-2 px-3 py-1.5 rounded-xl border text-[10px] font-black transition cursor-pointer ${
                          showVirtualPriceInPOS
                            ? 'bg-purple-100 border-purple-300 text-purple-800 shadow-sm'
                            : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-600'
                        }`}
                      >
                        <span className={`w-2.5 h-2.5 rounded-full border transition-all ${
                          showVirtualPriceInPOS ? 'bg-purple-600 border-purple-705' : 'bg-slate-300 border-slate-400'
                        }`} />
                        <span>{showVirtualPriceInPOS ? "معروض: السعر الرسمي لقائمة المخزون 🏷️" : "عرض السعر الرسمي لقائمة المخزون بدلاً من الجمهور"}</span>
                      </button>
                    </div>

                    {/* Inventory grid for POS shelf */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[460px] overflow-y-auto pr-1">
                      {filteredPOSMeds.map((med) => {
                        const isLow = med.availableQuantity < 15;
                        const isOut = med.availableQuantity <= 0;
                        const expDate = expiryDates[med.id] || '';
                        const isExpiringSoon = getDaysUntilExpiry(med.id) <= 30;

                        return (
                          <div 
                            key={med.id}
                            onClick={() => !isOut && addToCart(med)}
                            className={`p-4 rounded-2xl border text-right transition-all flex flex-col justify-between ${
                              isOut 
                                ? 'bg-slate-50 border-slate-100 opacity-60 cursor-not-allowed'
                                : 'bg-white hover:bg-emerald-50/20 border-slate-200/80 hover:border-emerald-500/50 cursor-pointer shadow-sm hover:shadow'
                            }`}
                          >
                            <div className="space-y-1.5">
                              {/* Tags */}
                              <div className="flex justify-between items-center gap-2">
                                <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full ${
                                  isOut 
                                    ? 'bg-rose-100 text-rose-800' 
                                    : isLow 
                                    ? 'bg-amber-100 text-amber-800' 
                                    : 'bg-emerald-50 text-emerald-800'
                                }`}>
                                  {isOut ? 'نفذ المخزون' : isLow ? 'مخزون حرج شحيح' : 'متوفر ✓'}
                                </span>
                                
                                {isExpiringSoon && (
                                  <span className="text-[7px] bg-rose-600 text-white px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                                    <ShieldAlert className="w-2.5 h-2.5" />
                                    <span>قريب الصلاحية</span>
                                  </span>
                                )}
                              </div>

                              <h4 className="font-extrabold text-slate-900 text-xs leading-snug">{med.nameAr}</h4>
                              <p className="text-[9px] text-slate-500 font-mono font-medium">{med.nameEn}</p>
                              
                              <p className="text-[9px] text-slate-400 truncate">
                                المادة: <span className="font-serif font-semibold">{med.scientificName}</span>
                              </p>
                            </div>

                            <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center">
                              <div className="flex flex-col text-right">
                                {showVirtualPriceInPOS ? (
                                  <span className="text-xs font-black text-purple-700 font-serif">
                                    {(med.secondaryPrice || (med.price + 500)).toLocaleString()} د.ع
                                  </span>
                                ) : (
                                  <span className="text-xs font-black text-emerald-800 font-serif">
                                    {med.price.toLocaleString()} د.ع
                                  </span>
                                )}
                              </div>
                              <span className="text-[9px] font-mono font-bold text-slate-400">
                                علبة: {med.availableQuantity}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Historical sales log list below the shelf to see how money accumulated */}
                    <div className="pt-4 border-t border-slate-100">
                      <h4 className="font-extrabold text-slate-800 text-xs mb-3 flex items-center space-x-reverse space-x-2">
                        <ClipboardList className="w-4 h-4 text-emerald-500" />
                        <span>أحدث فواتير المبيعات الصادرة اليوم</span>
                      </h4>
                      <div className="space-y-2">
                        {salesLedger.map((s) => (
                          <div key={s.invoiceId} className="p-3 bg-slate-50/50 rounded-xl flex items-center justify-between text-[11px] border border-slate-100">
                            <div>
                              <strong className="text-slate-900 font-bold font-mono text-[10px]">{s.invoiceId}</strong>
                              <span className="text-slate-400 mx-2">•</span>
                              <span className="text-slate-600 font-medium">العميل: {s.customerName}</span>
                              {s.isControlled && (
                                <span className="text-[8px] bg-rose-100 text-rose-800 font-bold px-1.5 py-0.5 rounded mr-2">مؤثر عقلي رقابي</span>
                              )}
                            </div>
                            <div className="text-left font-mono font-bold text-slate-700">
                              <span>{s.total.toLocaleString()} د.ع</span>
                            </div>
                          </div>
                        ))}
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
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                      <div>
                        <h3 className="font-extrabold text-slate-900 text-sm">مستودع الأدوية والمخزون الداخلي</h3>
                        <p className="text-[10px] text-slate-400 font-bold mt-0.5">تحرير الأسعار ونسب المخزون وإدارة فترات انتهاء صلاحية الأدوية العضوية والمبردة</p>
                      </div>

                      <div className="flex gap-2">
                        <button 
                          onClick={() => setIsAddingDrug(!isAddingDrug)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs px-4 py-2.5 rounded-xl cursor-pointer transition flex items-center space-x-reverse space-x-1.5"
                        >
                          <Plus className="w-4 h-4" />
                          <span>إضافة دواء جديد للمنظومة</span>
                        </button>
                        
                        {/* Search in Inventory */}
                        <div className="flex items-center gap-2">
                          <div className="relative">
                            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                            <input 
                              type="text" 
                              value={searchInInventoryQuery}
                              onChange={(e) => setSearchInInventoryQuery(e.target.value)}
                              className="bg-slate-50 border border-slate-200 rounded-xl pr-9 pl-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-emerald-500 w-44 font-medium"
                              placeholder="بحث بالاسم أو الباركود..."
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => startScanning('inventory')}
                            className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-850 text-white rounded-xl px-3 py-2 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                            title="قراءة الباركود بالكاميرا (Scan Barcode)"
                          >
                            <Barcode className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Automatic Alert: Near Expiry Medicines (30 days) */}
                    {getNearExpiryMeds().length > 0 && (
                      <div className="bg-rose-50/50 border border-rose-100 rounded-2xl p-5 text-right space-y-3.5 shadow-sm">
                        <div className="flex items-center justify-between">
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
                          <span className="text-[10px] bg-rose-100 text-rose-850 font-extrabold px-3 py-0.5 rounded-full border border-rose-200/50">
                            {getNearExpiryMeds().length} {getNearExpiryMeds().length === 1 ? "مستحضر حرج" : "مستحضرات حرجة"}
                          </span>
                        </div>
                        
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
                                      setB2bSelectedMedId(med.id);
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
                      </div>
                    )}

                    {/* Expandable Box: Add drug Form */}
                    {isAddingDrug && (
                      <form onSubmit={handleAddNewDrug} className="bg-slate-50 p-5 rounded-2xl border border-slate-100 p-6 space-y-4">
                        <h4 className="font-black text-slate-900 text-xs">إدخال دواء ومستحضر تجميل جديد يدوياً في صيدلية بلس</h4>
                        
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
                            حفظ المنتج في كبسولة بلس
                          </button>
                        </div>
                      </form>
                    )}

                    {/* Stock Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-right border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 text-slate-400 font-black border-b border-slate-100 text-[10px]">
                            <th className="py-3 px-4">رقم الرف</th>
                            <th className="py-3 px-4">الاسم والدواء</th>
                            <th className="py-3 px-4">التصنيف</th>
                            <th className="py-3 px-4">سعر البيع للجمهور</th>
                            <th className="py-3 px-4">سعر البيع في قائمة المخزون (الرسمي)</th>
                            <th className="py-3 px-4">الكمية المتوفرة حالياً</th>
                            <th className="py-3 px-4">انتهاء الصلاحية</th>
                            <th className="py-3 px-4 text-center">تعديل المخزون</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                          {inventory
                            .filter(m => {
                              const q = searchInInventoryQuery.toLowerCase().trim();
                              if (!q) return true;
                              return (
                                m.nameAr.includes(q) ||
                                m.nameEn.toLowerCase().includes(q) ||
                                m.scientificName.toLowerCase().includes(q) ||
                                (m.barcode && m.barcode.toLowerCase().includes(q))
                              );
                            })
                            .map((med, idx) => {
                              const expDate = expiryDates[med.id] || '2028-01-01';
                              const daysRemaining = getDaysUntilExpiry(med.id);
                              const isNearExpiry30 = daysRemaining <= 30;

                              return (
                                <tr 
                                  key={med.id} 
                                  className={`transition border-b border-slate-100 ${
                                    isNearExpiry30 
                                      ? 'bg-rose-50/65 hover:bg-rose-100/70 text-rose-950' 
                                      : 'hover:bg-slate-50/50'
                                  }`}
                                >
                                  <td className="py-3 px-4 font-mono text-slate-400">REF-{1000 + idx}</td>
                                  <td className="py-3 px-4 space-y-0.5">
                                    <strong className="text-slate-900 block font-bold">{med.nameAr}</strong>
                                    <span className="text-[10px] text-slate-400 font-mono block">{med.nameEn} • {med.scientificName}</span>
                                  </td>
                                  <td className="py-3 px-4 text-slate-500 font-semibold">{med.category}</td>
                                  <td className="py-3 px-4 font-mono font-bold text-emerald-800">
                                    {med.price.toLocaleString()} د.ع
                                  </td>
                                  <td className="py-3 px-4 font-mono font-bold text-slate-500/80">
                                    {(med.secondaryPrice || (med.price + 500)).toLocaleString()} د.ع
                                  </td>
                                  <td className="py-3 px-4 font-mono">
                                    <span className={`px-2 py-0.5 rounded-full font-bold ${
                                      med.availableQuantity <= 0
                                        ? 'bg-rose-100 text-rose-800 font-sans text-[10px]'
                                        : med.availableQuantity < 15
                                        ? 'bg-amber-100 text-amber-800 font-sans text-[10px]'
                                        : 'text-slate-800'
                                    }`}>
                                      {med.availableQuantity <= 0 ? 'نفذ بالكامل' : `${med.availableQuantity} علبة`}
                                    </span>
                                  </td>
                                  <td className={`py-3 px-4 font-mono font-bold ${isNearExpiry30 ? 'text-rose-600' : 'text-slate-400'}`}>
                                    <div className="flex items-center space-x-reverse space-x-1">
                                      {isNearExpiry30 && <AlertCircle className="w-3.5 h-3.5" />}
                                      <span>{expDate}</span>
                                    </div>
                                  </td>
                                  <td className="py-3 px-4">
                                    <div className="flex items-center justify-center space-x-reverse space-x-1.5">
                                      <button 
                                        onClick={() => {
                                          setInventory(prev => prev.map(m => {
                                            if (m.id === med.id) {
                                              const nextQty = m.availableQuantity + 10;
                                              return { ...m, availableQuantity: nextQty, status: 'available' };
                                            }
                                            return m;
                                          }));
                                        }}
                                        className="bg-slate-100 hover:bg-emerald-100 text-slate-600 hover:text-emerald-800 px-2 py-1 rounded font-bold transition cursor-pointer text-[10px]"
                                        title="إضافة 10 علب"
                                      >
                                        +10 علب
                                      </button>
                                      
                                      <button 
                                        onClick={() => {
                                          setInventory(prev => prev.map(m => {
                                            if (m.id === med.id && m.availableQuantity >= 5) {
                                              const nextQty = m.availableQuantity - 5;
                                              return { ...m, availableQuantity: nextQty };
                                            }
                                            return m;
                                          }));
                                        }}
                                        className="bg-slate-150 hover:bg-rose-100 text-slate-600 hover:text-rose-800 px-2 py-1 rounded font-bold transition cursor-pointer text-[10px]"
                                        title="تخفيض 5 علب"
                                      >
                                        -5 علب
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
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
                    
                    {/* RIGHT PANEL - QUICK ADDERS (4 Cols) */}
                    <div className="lg:col-span-4 space-y-6">
                      
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
                              placeholder="ابحث بالاسم العربي، الإنكليزي أو المادة..."
                              className="w-full bg-slate-50 hover:bg-slate-100/70 border border-slate-200 rounded-xl py-2.5 pr-9 pl-4 text-xs font-bold text-slate-850 placeholder:text-slate-400 transition focus:outline-emerald-500"
                            />
                          </div>

                          {/* Quick Suggestion List */}
                          {purchaseSearchWord.trim().length > 0 && (
                            <div className="bg-white border border-slate-150 rounded-2xl max-h-56 overflow-y-auto divide-y divide-slate-100 text-right shadow-md scrollbar-thin">
                              {inventory
                                .filter(m => 
                                  m.nameAr.toLowerCase().includes(purchaseSearchWord.toLowerCase()) || 
                                  m.nameEn.toLowerCase().includes(purchaseSearchWord.toLowerCase()) ||
                                  (m.scientificName && m.scientificName.toLowerCase().includes(purchaseSearchWord.toLowerCase()))
                                )
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

                      {/* Barcode Quick Scan Section */}
                      <div className="bg-white border border-slate-200/80 p-5 rounded-3xl shadow-xs space-y-4">
                        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                          <Barcode className="w-5 h-5 text-emerald-600" />
                          <h4 className="font-extrabold text-xs text-slate-900">إضافة فورية عبر كاميرا الباركود</h4>
                        </div>
                        
                        <p className="text-[10px] text-slate-400 font-bold leading-relaxed">
                          وجّه باركود علبة الدواء نحو الكاميرا ليقوم النظام بمطابقتها ذاتياً وإدراجها فورياً في جدول الشراء.
                        </p>

                        <button
                          type="button"
                          onClick={() => startScanning('purchase-order')}
                          className="w-full bg-emerald-50 hover:bg-emerald-100/80 text-emerald-800 font-black py-3 px-4 rounded-2xl transition border border-emerald-100 cursor-pointer flex items-center justify-center gap-2 text-xs"
                        >
                          <Camera className="w-4 h-4 text-emerald-600 animate-pulse" />
                          <span>تفعيل قارئ الكاميرا للمشتريات</span>
                        </button>
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
                                  <label className="block text-[10px]">التصنيف الدوائي:</label>
                                  <select
                                    value={purchaseNewProdCat}
                                    onChange={(e) => setPurchaseNewProdCat(e.target.value)}
                                    className="w-full bg-slate-50 p-2 border border-slate-200 rounded-lg text-slate-800 focus:outline-emerald-500 font-bold"
                                  >
                                    <option value="مسكنات الألم">مسكنات الألم</option>
                                    <option value="المضادات الحيوية">المضادات الحيوية</option>
                                    <option value="أمراض القلب والضغط">أمراض القلب والضغط</option>
                                    <option value="السكري والغدد">السكري والغدد</option>
                                    <option value="الفيتامينات والمكملات">الفيتامينات والمكملات</option>
                                    <option value="مؤثرات عقلية رقابية">مؤثرات عقلية رقابية</option>
                                  </select>
                                </div>

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
                                    category: purchaseNewProdCat,
                                    price: purchaseNewProdPrice,
                                    qty: purchaseNewProdQty,
                                    expiryDate: purchaseNewProdExpiry,
                                    barcode: purchaseNewProdBarcode || '628' + Math.floor(Math.random() * 90000000 + 10000000)
                                  };
                                  setPurchaseDraft(prev => [...prev, customItem]);
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

                    {/* LEFT PANEL - DIVERSIFIED DAILY PURCHASE SHEET (8 Cols) */}
                    <div className="lg:col-span-8 space-y-6">
                      
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
                                    <th className="py-2.5 px-3 text-center">سعر جملة العلبة (د.ع)</th>
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
                                              <span className="text-[8px] bg-slate-100 border border-slate-200/50 text-slate-500 px-1.5 py-0.2 rounded font-sans uppercase">
                                                {item.category}
                                              </span>
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

                                        {/* Expiry Date */}
                                        <td className="py-3.5 px-3">
                                          <input
                                            type="date"
                                            value={item.expiryDate}
                                            onChange={(e) => {
                                              const val = e.target.value;
                                              setPurchaseDraft(prev => prev.map(d => d.id === item.id ? { ...d, expiryDate: val } : d));
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
                                  <p>سعر توريد الجملة النهائي خاضع لحسابات الصيدلية و يحدّث أرصدة دواء صيدلية بلس مع تطبيق الأرباح تلقائياً عند التأكيد.</p>
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

                        {b2bOrders.length === 0 ? (
                          <p className="p-8 text-center text-[11px] text-slate-400 font-bold">لا يوجد طلبيات شراء سابقة مسجلة حالياً.</p>
                        ) : (
                          <div className="space-y-3.5">
                            {b2bOrders.map((order) => (
                              <div key={order.id} className="bg-slate-50 hover:bg-slate-100/50 p-4 rounded-2xl border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs transition">
                                <div className="space-y-1 text-right">
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
                                  
                                  <span className="px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-150 rounded-xl font-extrabold text-[10px]">
                                    تم استيرادها بالكامل ✅
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                    </div>

                  </div>
                </motion.div>
              )}

              {/* 
                =========================================================
                VIEWPORT SECTION 4: NARC/PSYCH LEGAL COMPLIANCE
                =========================================================
              */}
              {activeTab === 'narcotics' && (
                <motion.div
                  key="narcotics"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6">
                    <div className="border-b border-slate-100 pb-4">
                      <span className="text-xs text-rose-500 font-extrabold bg-rose-50 px-3 py-1 rounded-full uppercase">سجل تفتيش اللجان الطبية الاتحادي</span>
                      <h3 className="font-extrabold text-slate-900 text-sm mt-3">سجل بيع المؤثرات والمخدرات الخاضعة للمراقبة</h3>
                      <p className="text-[10px] text-slate-400 font-semibold mt-1">
                        وفق المادة 52 من قانون مكافحة المخدرات لجمهورية العراق. يجب تسجيل هوية المريض الطبي، ترخيص الطبيب الموصوف ورابط الوصفة الطبية قبل الصرف.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-8text-xs font-semibold">
                      
                      {/* Register prescriptions form */}
                      <div className="md:col-span-4 bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-4">
                        <span className="text-[10px] text-slate-400 font-black block">إدراج وتوثيق وصفة خاضعة للمراقبة</span>
                        
                        {prescriptionSuccess ? (
                          <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl text-center space-y-2 text-xs font-bold font-sans">
                            <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                            <p className="text-slate-900">تم تسجيل المستند ومطابقة الترخيص!</p>
                            <span className="text-[9px] text-slate-400 block font-normal">تم تمديد الرابط وجرد المخزون.</span>
                          </div>
                        ) : (
                          <form onSubmit={handleAddControlledPrescription} className="space-y-3 text-xs font-semibold">
                            <div className="space-y-1">
                              <label className="block text-slate-500">اسم المريض الكامل:</label>
                              <input 
                                type="text" required
                                value={newPrescPatient} onChange={(e) => setNewPrescPatient(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-lg p-2 focus:outline-emerald-500" 
                                placeholder="حسب الهوية الموحدة"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="block text-slate-500">الطبيب المعالج وعيادته:</label>
                              <input 
                                type="text" required
                                value={newPrescDoctor} onChange={(e) => setNewPrescDoctor(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-lg p-2 focus:outline-emerald-500" 
                                placeholder="اللقب والرصافة الطبية"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="block text-slate-500">مادة الدواء الرقابي:</label>
                              <select 
                                value={newPrescMedId} onChange={(e) => setNewPrescMedId(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-lg p-2 font-bold text-slate-700"
                              >
                                {inventory.filter(m => m.category.includes('مؤثرات') || m.id === '7').map(m => (
                                  <option key={m.id} value={m.id}>{m.nameAr}</option>
                                ))}
                              </select>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <label className="block text-slate-500">الكمية الصرف:</label>
                                <input 
                                  type="number" min="1" max="5"
                                  value={newPrescQty} onChange={(e) => setNewPrescQty(Number(e.target.value))}
                                  className="w-full bg-white border border-slate-200 rounded-lg p-2 text-center" 
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="block text-slate-500 font-sans text-[10px]">كود نقابي:</label>
                                <input 
                                  type="text" required
                                  value={newPrescLicense} onChange={(e) => setNewPrescLicense(e.target.value)}
                                  className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono text-center text-slate-700 font-bold" 
                                />
                              </div>
                            </div>

                            <button 
                              type="submit"
                              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-black py-2 rounded-xl text-center cursor-pointer"
                            >
                              توثيق الوصفة الرقابية
                            </button>
                          </form>
                        )}
                      </div>

                      {/* Active Narc prescriptions entries */}
                      <div className="md:col-span-8 space-y-3.5">
                        <div className="bg-rose-50 border border-rose-100/50 rounded-2xl p-4 flex items-center space-x-reverse space-x-3 text-rose-800">
                          <ShieldAlert className="w-6 h-6 flex-shrink-0" />
                          <div>
                            <strong className="text-xs font-black block">هام جداً لمفتشي وزارة الصحة:</strong>
                            <p className="text-[10px] leading-relaxed font-medium mt-0.5">
                              هذا المسجل سحابي ومؤمن بلس متاح دائما لتنزيله أثناء التفتيش الدوري. أي صرف لمهدئ أو مخدر مدرج خارج هذا الكشف يعرض الصيدلية للمساءلة القانونية.
                            </p>
                          </div>
                        </div>

                        <div className="space-y-2.5">
                          <span className="text-[10px] text-slate-400 font-black block">السندات المصدقة حالياً</span>
                          
                          {narcoticPrescriptions.map((p) => (
                            <div key={p.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex justify-between items-center text-xs font-semibold">
                              <div className="space-y-1 text-right">
                                <div className="flex items-center space-x-reverse space-x-2">
                                  <strong className="text-slate-900 text-xs font-extrabold">{p.patientName}</strong>
                                  <span className="text-[9px] bg-rose-100 text-rose-800 px-2 py-0.5 rounded font-mono font-bold">{p.id}</span>
                                </div>
                                <span className="text-slate-500 font-medium block">المادة المصروفة: {p.medicineName} • الكمية: {p.quantity} علبة</span>
                                <span className="text-slate-400 text-[10px] block">الطبيب: {p.doctorName} • الكود النقابي: {p.pharmacistLicense}</span>
                              </div>
                              <span className="text-[9px] text-slate-400 font-mono block">التاريخ: {p.prescriptionDate}</span>
                            </div>
                          ))}
                        </div>
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
              {activeTab === 'financial' && (
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
                        <span className="text-xs text-emerald-600 font-extrabold bg-emerald-50 px-3 py-1 rounded-full uppercase">كشاف الحسابات كبسولة بلس</span>
                        <h3 className="font-extrabold text-slate-900 text-sm mt-3">الحساب المالي الموحد ومحاكاة المقاصة للذمم</h3>
                        <p className="text-[10px] text-slate-400 font-bold mt-1">
                          تتبع جرد الصيدلية الإجمالي، الحسابات المدينة والذمم المترتبة لمذاخر أدوية العراق لتسويتها عبر كبسولة باي
                        </p>
                      </div>
                      <button
                        onClick={exportFinancialsToCSV}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition shadow-sm cursor-pointer border-none text-xs font-sans shrink-0 hover:scale-102"
                      >
                        <Download className="w-4 h-4 text-emerald-100 animate-bounce-slow" />
                        <span>تصدير كشف حسابات المبيعات والديون (CSV)</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      
                      {/* Left: Supp debts breakdown & settle simulator */}
                      <div className="bg-slate-50 p-5 rounded-2xl border border-slate-150 text-xs space-y-4 font-semibold text-slate-705">
                        <h4 className="font-extrabold text-slate-900 text-xs">سداد الديون وتسوية ذمم المذاخر والتقاص الطبية</h4>
                        
                        <div className="space-y-2">
                          <p className="flex justify-between">
                            <span>ملفات الذمم المستحقة الإجمالي للمذاخر:</span>
                            <strong className="text-rose-700 font-mono text-sm">{totalDebts.toLocaleString()} د.ع</strong>
                          </p>
                          <p className="flex justify-between text-slate-500">
                            <span>الرصيد المتاح حالياً بالصندوق:</span>
                            <span className="font-mono">{walletBalance.toLocaleString()} د.ع</span>
                          </p>
                        </div>

                        <div className="bg-white p-3.5 rounded-xl border border-slate-100 text-[11px] space-y-2.5 font-bold">
                          <p className="flex justify-between">
                            <span>مكتب دجلة العلمي للأدوية (بغداد)</span>
                            <span className="font-mono text-slate-800">750,000 د.ع</span>
                          </p>
                          <p className="flex justify-between">
                            <span>مذخر قصر الشفاء الحديث (أربيل)</span>
                            <span className="font-mono text-slate-800">1,100,000 د.ع</span>
                          </p>
                        </div>

                        <div className="space-y-2.5">
                          <button 
                            onClick={settleSupplierDebts}
                            disabled={walletBalance < 500000 || totalDebts === 0}
                            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black py-2.5 rounded-xl text-center cursor-pointer transition shadow-sm text-xs font-sans"
                          >
                            تسوية ذمم المذاخر بقيمة (500,000 د.ع ثنائية)
                          </button>
                          <p className="text-[10px] text-slate-400 text-center font-medium leading-normal block">
                            * الضغط على الزر سيقوم بسحب قيمة 500,000 د.ع من السيولة وتسوية كشف المذاخر المعنية أوتوماتيكياً.
                          </p>
                        </div>
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

                    </div>
                  </div>
                </motion.div>
              )}

              {/* 
                =========================================================
                VIEWPORT SECTION 6: PHARMACY TEAM MANAGMENT
                =========================================================
              */}
              {activeTab === 'team' && (
                <motion.div
                  key="team"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6">
                    <div className="border-b border-slate-100 pb-4">
                      <span className="text-xs text-emerald-600 font-extrabold bg-emerald-50 px-3 py-1 rounded-full uppercase">إدارة الطاقم كابسولة بلس</span>
                      <h3 className="font-extrabold text-slate-900 text-sm mt-3">سجل الصيادلة، الموظفين والمساعدين المرخصين</h3>
                      <p className="text-[10px] text-slate-400 font-bold mt-1">
                        توزيع الصلاحيات للشفت المناوب ومتابعة تراخيص الصيادلة التابعين للمؤسسة والملحقين بنقابة صيادلة جمهورية العراق
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-8 text-xs font-semibold">
                      
                      {/* Left Add Team member form */}
                      <div className="md:col-span-4 bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-4">
                        <span className="text-[10px] text-slate-400 font-black block">إضافة صيدلاني أو مساعد للصيدلية</span>
                        
                        <form onSubmit={handleAddStaff} className="space-y-3.5 text-xs font-semibold">
                          <div className="space-y-1">
                            <label className="block text-slate-500">اسم الموظف الكامل دكتور:</label>
                            <input 
                              type="text" required
                              value={newStaffName} onChange={(e) => setNewStaffName(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-lg p-2 focus:outline-emerald-500" 
                              placeholder="د. ياسين كمال الموسوي"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="block text-slate-500">المبلغ والرصة أو المسمى الوظيفي:</label>
                            <select 
                              value={newStaffRole} onChange={(e) => setNewStaffRole(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-lg p-2 font-bold text-slate-700"
                            >
                              <option value="صيدلاني مناوب">صيدلاني مناوب</option>
                              <option value="مساعد صيدلي مرخص">مساعد صيدلي مرخص</option>
                              <option value="محاسب الصيدلية">محاسب الصيدلية</option>
                            </select>
                          </div>

                          <div className="space-y-1">
                            <label className="block text-slate-500">رقم ترخيص الممارسة (نقابة الصيادلة):</label>
                            <input 
                              type="text"
                              value={newStaffLicense} onChange={(e) => setNewStaffLicense(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-lg p-2 focus:outline-emerald-500 font-mono text-center font-bold" 
                              placeholder="مثال: ص-48220"
                            />
                          </div>

                          <button 
                            type="submit"
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2.5 rounded-xl text-center cursor-pointer transition shadow-sm"
                          >
                            حفظ وتسجيل الموظف
                          </button>
                        </form>
                      </div>

                      {/* Team lists */}
                      <div className="md:col-span-8 space-y-4">
                        <span className="text-[10px] text-slate-400 font-black block">الكادر والمناوبات المسجلين</span>
                        
                        <div className="space-y-3">
                          {teamMembers.map((member) => (
                            <div key={member.id} className="p-4 bg-white border border-slate-100 rounded-2xl flex justify-between items-center text-xs font-semibold hover:bg-slate-50/50 transition">
                              <div className="flex items-center space-x-reverse space-x-3 text-right">
                                <div className="w-10 h-10 bg-emerald-100 text-emerald-800 rounded-full flex items-center justify-center font-extrabold text-sm">
                                  {member.name.charAt(2)}
                                </div>
                                <div className="space-y-0.5">
                                  <strong className="text-slate-900 font-black block text-xs">{member.name}</strong>
                                  <p className="text-slate-500 text-[10px] font-bold">{member.role} • النقابة: {member.license}</p>
                                </div>
                              </div>

                              <div className="text-left space-y-1">
                                <span className="bg-slate-100 text-slate-700 py-1 px-3 rounded-full text-[9px] font-bold block w-max">
                                  شفت: {member.shift}
                                </span>
                                <span className={`text-[9px] font-bold px-2.5 py-0.5 rounded-full block w-max text-left mr-auto ${
                                  member.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                                }`}>
                                  {member.status === 'active' ? 'دوام متصل' : 'في استراحة'}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                    </div>
                  </div>
                </motion.div>
              )}

            </AnimatePresence>

          </div>

        </div>

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
              className="bg-white rounded-3xl border border-slate-200 p-6 max-w-sm w-full shadow-2xl relative text-right text-slate-800 space-y-4 z-10"
            >
              
              <div className="text-center space-y-2 border-b border-dashed border-slate-200 pb-4">
                <div className="w-12 h-12 bg-emerald-100 text-emerald-800 rounded-full flex items-center justify-center mx-auto shadow-sm">
                  <Check className="w-6 h-6 stroke-[3]" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-950 text-base leading-none">صيدلية النور النموذجية</h3>
                  <p className="text-[10px] text-slate-400 mt-1">العراق، بغداد • هاتف الصيدلية: +964 780 288 4040</p>
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
                برمجيات كبسولة بلس + موثقة سحابياً وفقاً للائحة رقم 42 الصادرة من نقابة صيادلة العراق.
              </div>

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

      {/* 
        =========================================================
        SMALL SIGNATURE FOOTER FOR CAPSULA CLIENTS
        =========================================================
      */}
      <footer className="bg-slate-950 text-slate-500 py-8 border-t border-slate-900 text-center text-xs font-semibold mt-16">
        <div className="max-w-7xl mx-auto px-4 space-y-2">
          <p>© 2026 Capsula Iraq Plus. جميع الحقوق معتمدة ومحفوظة لنقابة صيادلة العراق ومستودعات الأدوية.</p>
          <p className="text-[10px] text-slate-600 font-mono">Platform Integration Applet ID: {`e3fe30f5-c41f-4ed7`}</p>
        </div>
      </footer>

    </div>
  );
}
