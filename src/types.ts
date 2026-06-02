export interface Medicine {
  id: string;
  nameAr: string;
  nameEn: string;
  activeIngredient: string;
  category: string;
  warehouse: string;
  price: number; // IQD
  secondaryPrice?: number; // IQD - سعر البيع في قائمة المخزون (الرسمي)
  costPrice?: number; // IQD - متوسط تكلفة الشراء (متوسط متحرك) — أساس حساب الربح
  lastCostPrice?: number; // IQD - آخر سعر شراء فعلي من المذخر (للمقارنة)
  availableQuantity: number;
  minStock?: number;
  status: 'available' | 'low' | 'unavailable';
  scientificName: string;
  barcode?: string;
}

export interface EcosystemService {
  id: string;
  titleAr: string;
  titleEn: string;
  badge: string;
  description: string;
  iconName: string;
  color: string;
}

export interface Order {
  id: string;
  date: string;
  warehouseName: string;
  supplierId?: string;
  itemsCount: number;
  totalAmount: number; // IQD
  status: 'pending' | 'preparing' | 'on_way' | 'delivered' | 'cancelled';
  items: { medicineName: string; quantity: number; price: number }[];
}

export interface Supplier {
  id: string;           // SUP-XXXX
  name: string;
  phone?: string;
  address?: string;
  contactPerson?: string;
  creditLimit?: number; // IQD — سقف الائتمان
  paymentTerms?: number; // أيام الآجل المسموح بها
  notes?: string;
  createdAt: string;    // YYYY-MM-DD
}

export interface FAQItem {
  id: string;
  question: string;
  answer: string;
}

export interface ExtractedInvoiceItem {
  id: string;
  rawName: string;
  arabicName: string;
  company: string;
  quantityBoxes: number;
  pricePerBox: number;
  stripsPerBox: number;
  unitType: 'strip' | 'unit';
  retailPrice: number;
  officialPrice: number;
  batchNo?: string;
  expiry?: string;
  matchedMedicine: Medicine | null;
  matchScore: number;
}

export interface ExtractedInvoice {
  supplierName: string;
  invoiceNo?: string;
  date?: string;
  items: ExtractedInvoiceItem[];
  totalAmount?: number;
}
