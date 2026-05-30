export interface Medicine {
  id: string;
  nameAr: string;
  nameEn: string;
  activeIngredient: string;
  category: string;
  warehouse: string;
  price: number; // IQD
  secondaryPrice?: number; // IQD - سعر البيع في قائمة المخزون (الرسمي)
  availableQuantity: number;
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
  itemsCount: number;
  totalAmount: number; // IQD
  status: 'pending' | 'preparing' | 'on_way' | 'delivered' | 'cancelled';
  items: { medicineName: string; quantity: number; price: number }[];
}

export interface FAQItem {
  id: string;
  question: string;
  answer: string;
}
