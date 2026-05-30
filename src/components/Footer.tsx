import { Activity, Mail, Phone, MapPin, ExternalLink, Globe } from 'lucide-react';

interface FooterProps {
  setCurrentTab: (tab: 'landing' | 'search' | 'ecosystem' | 'register' | 'portal') => void;
}

export default function Footer({ setCurrentTab }: FooterProps) {
  return (
    <footer className="bg-slate-950 text-slate-400 py-16 border-t border-slate-900 text-right" id="footer-section">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
          
          {/* Column 1: Brand details */}
          <div className="md:col-span-5 space-y-4">
            <div className="flex items-center space-x-reverse space-x-3">
              <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center text-white">
                <Activity className="w-5.5 h-5.5" />
              </div>
              <span className="text-xl font-black text-white">Capsula | كبسولة</span>
            </div>
            <p className="text-sm font-semibold text-slate-400 leading-relaxed">
              منصة العراق الطبية والدوائية B2B الأولى والمجانية تماماً للصيدليات ومستودعات الأدوية والمكاتب العلمية. نساعد في تسريع توزيع بضائع الأدوية وتنظيم المدفوعات في كافة المحافظات العراقية.
            </p>
            <div className="pt-2 text-xs text-slate-500 font-bold">
              تطبيق كبسولة مجاز ومسجل وفقاً للقوانين واللوائح الطبية الخاصة بوزارة الصحة العراقية ونقابة الصيادلة للجمهورية العراقية.
            </div>
          </div>

          {/* Column 2: Fast links */}
          <div className="md:col-span-3 space-y-3">
            <h4 className="text-white font-black text-sm uppercase tracking-wider">تطبيقات المنظومة</h4>
            <ul className="space-y-2 text-xs font-semibold">
              <li>
                <button onClick={() => setCurrentTab('landing')} className="hover:text-emerald-400 transition cursor-pointer">
                  الرئيسية
                </button>
              </li>
              <li>
                <button onClick={() => setCurrentTab('search')} className="hover:text-emerald-400 transition cursor-pointer">
                  دليل الأدوية والمذاخر
                </button>
              </li>
              <li>
                <button onClick={() => setCurrentTab('ecosystem')} className="hover:text-emerald-400 transition cursor-pointer">
                  منظومة كبسولة
                </button>
              </li>
              <li>
                <button onClick={() => setCurrentTab('register')} className="hover:text-emerald-400 transition cursor-pointer">
                  انضم كصيدلية مرخصة
                </button>
              </li>
            </ul>
          </div>

          {/* Column 3: Contact & Support */}
          <div className="md:col-span-4 space-y-4">
            <h4 className="text-white font-black text-sm uppercase tracking-wider">قنوات التواصل والدعم</h4>
            <ul className="space-y-3 text-xs font-semibold text-slate-400">
              <li className="flex items-center space-x-reverse space-x-2.5">
                <MapPin className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <span>المقر الرئيسي: العراق، بغداد، حي الكرادة النموذجية</span>
              </li>
              <li className="flex items-center space-x-reverse space-x-2.5 font-mono" dir="ltr">
                <Phone className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <span>+964 780 288 4040</span>
              </li>
              <li className="flex items-center space-x-reverse space-x-2.5">
                <Mail className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <span>support@capsula.iq</span>
              </li>
              <li className="flex items-center space-x-reverse space-x-2.5">
                <Globe className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <a href="https://capsula.iq/" target="_blank" rel="noopener noreferrer" className="hover:text-emerald-400 transition flex items-center space-x-reverse space-x-1">
                  <span>الموقع الرسمي: capsula.iq</span>
                  <ExternalLink className="w-3 h-3 text-slate-600" />
                </a>
              </li>
            </ul>
          </div>

        </div>

        {/* Outer footer credits card */}
        <div className="mt-12 pt-8 border-t border-slate-900 flex flex-col sm:flex-row justify-between items-center gap-4 text-[11px] font-bold text-slate-500">
          <p>© 2026 Capsula Iraq. جميع الحقوق محفوظة لشركة كبسولة للتقنيات الطبية المحدودة.</p>
          <div className="flex space-x-reverse space-x-4">
            <a href="#" className="hover:text-emerald-400">سياسة الخصوصية للأطباء</a>
            <span>•</span>
            <a href="#" className="hover:text-emerald-400">شروط معاملات الجملة الطبية</a>
          </div>
        </div>

      </div>
    </footer>
  );
}
