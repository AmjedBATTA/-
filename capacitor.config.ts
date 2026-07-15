import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.anwaralhasan.pharmacy',
  appName: 'انوار الحسن',
  webDir: 'dist',
  plugins: {
    FirebaseAuthentication: {
      // skipNativeAuth=false: يسجّل الدخول في الطبقة الأصيلة ثم نمرّر
      // بيانات الاعتماد إلى Firebase JS SDK حتى تعمل قواعد Firestore كما في الويب
      skipNativeAuth: false,
      providers: ['google.com'],
    },
  },
};

export default config;
