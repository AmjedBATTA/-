import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json'; // Located in the root of the project folder

const app = initializeApp(firebaseConfig);

/* تنظيف مفاتيح localStorage القديمة لمدير التبويبات المتعدد.
   كانت تسبب QuotaExceededError عند الاستيراد الكبير (آلاف الكتابات) لأنها
   تُكدّس بيانات التنسيق في localStorage المحدود (~5MB). نزيلها مرة واحدة. */
try {
  Object.keys(localStorage)
    .filter((k) => k.startsWith('firestore_clients_') || k.startsWith('firestore_mutations_') || k.startsWith('firestore_targets_'))
    .forEach((k) => localStorage.removeItem(k));
} catch { /* localStorage غير متاح — نتجاهل */ }

/* CRITICAL: The app will break without passing the named database id.
   نفعّل الكاش الدائم (IndexedDB) ليعمل التطبيق دون اتصال:
   - كل عمليات الإضافة/الحذف/التعديل تُحفظ محلياً فوراً وتُرفع تلقائياً عند عودة الاتصال.
   - نستخدم persistentSingleTabManager: يخزّن قائمة الانتظار في IndexedDB (سعة كبيرة)
     بدل localStorage المحدود — وهذا يمنع QuotaExceededError عند الاستيراد الضخم.
   - المزامنة بين الأجهزة المختلفة تتم عبر خوادم Firestore ولا تتأثر بهذا الخيار. */
export const db = initializeFirestore(
  app,
  {
    // نتجاهل الحقول غير المعرّفة (undefined) بدل رفضها: أي مستند يحوي حقلاً بقيمة undefined
    // كان يُفشل الكتابة فوراً (استثناء متزامن) فيتوقف الاعتماد صامتاً — مثل حقل الشركة
    // الاختياري الجديد في المخزون. مع هذا الخيار يُحذف الحقل غير المعرّف بأمان بدل الكسر.
    ignoreUndefinedProperties: true,
    localCache: persistentLocalCache({
      tabManager: persistentSingleTabManager(undefined),
    }),
  },
  firebaseConfig.firestoreDatabaseId
);

export const auth = getAuth();
// ملاحظة: أُزيل فحص الإقلاع القديم الذي كان يقرأ المسار 'test/connection' —
// ذلك المسار ممنوع بقواعد الأمان (كل البيانات تحت users/{uid} فقط)، فكان
// يُسجّل خطأ صلاحيات في كل تشغيل. مستمعات onSnapshot تتكفّل بحالة الاتصال.

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

/**
 * Transforms any Firestore standard permission or network failure into an actionable JSON tracking payload.
 * Mandatory pattern for Cloud Core diagnostic tracing.
 */
export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  
  console.error('Firestore Error Payload: ', JSON.stringify(errInfo, null, 2));
  throw new Error(JSON.stringify(errInfo));
}
