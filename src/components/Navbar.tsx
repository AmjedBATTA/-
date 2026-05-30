import { useState } from 'react';
import { Menu, X, LayoutGrid, Cpu, User, Activity, Search, Sparkles } from 'lucide-react';

interface NavbarProps {
  currentTab: 'landing' | 'search' | 'ecosystem' | 'register' | 'portal';
  setCurrentTab: (tab: 'landing' | 'search' | 'ecosystem' | 'register' | 'portal') => void;
}

export default function Navbar({ currentTab, setCurrentTab }: NavbarProps) {
  const [isOpen, setIsOpen] = useState(false);

  const navLinks = [
    { id: 'landing', label: 'الرئيسية' },
    { id: 'search', label: 'دليل الأدوية والمذاخر' },
    { id: 'ecosystem', label: 'منظومة كبسولة' },
    { id: 'register', label: 'انضم كصيدلية' },
  ] as const;

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-sm transition-all duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-20" id="nav-container">
          {/* Logo & Brand */}
          <button 
            onClick={() => setCurrentTab('landing')}
            className="flex items-center space-x-reverse space-x-3 cursor-pointer group text-right"
            id="brand-logo-btn"
          >
            <div className="w-11 h-11 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-emerald-200 group-hover:bg-emerald-700 transition-all duration-300">
              <Activity className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <span className="text-2xl font-black text-slate-900 tracking-tight block">
                Capsula <span className="text-emerald-600 font-extrabold text-xl">كبسولة</span>
              </span>
              <span className="text-[10px] text-slate-400 font-bold block -mt-1 tracking-wider uppercase">
                B2B Pharma Network
              </span>
            </div>
          </button>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-reverse space-x-8" id="desktop-menu">
            {navLinks.map((link) => (
              <button
                key={link.id}
                onClick={() => {
                  setCurrentTab(link.id);
                  setIsOpen(false);
                }}
                className={`relative py-2 text-sm font-semibold transition-all duration-200 cursor-pointer ${
                  currentTab === link.id
                    ? 'text-emerald-600 font-bold'
                    : 'text-slate-600 hover:text-emerald-600'
                }`}
                id={`nav-link-${link.id}`}
              >
                {link.label}
                {currentTab === link.id && (
                  <span className="absolute bottom-0 left-0 right-0 h-[3px] bg-emerald-600 rounded-full" />
                )}
              </button>
            ))}
          </nav>

          {/* Action Buttons */}
          <div className="hidden md:flex items-center space-x-reverse space-x-4" id="nav-actions">
            {/* Pharmacy Portal Simulator Trigger */}
            <button
              onClick={() => setCurrentTab('portal')}
              className={`flex items-center space-x-reverse space-x-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 shadow-sm border ${
                currentTab === 'portal'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 shadow-emerald-50'
                  : 'bg-slate-900 hover:bg-slate-800 text-white border-transparent'
              }`}
              id="portal-toggle-btn"
            >
              <Cpu className="w-4 h-4 animate-pulse" />
              <span>بوابة الصيدلية (محاكي التطبيق)</span>
            </button>
          </div>

          {/* Mobile Menu Toggle */}
          <div className="flex items-center space-x-reverse space-x-3 md:hidden" id="mobile-toggle">
            <button
              onClick={() => setCurrentTab('portal')}
              className="p-2.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition"
              title="بوابة الصيدلية"
              id="mobile-portal-btn"
            >
              <Cpu className="w-5 h-5" />
            </button>
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 hover:text-emerald-600 transition focus:outline-none"
              id="mobile-menu-btn"
            >
              {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="md:hidden bg-white border-t border-slate-100 px-4 py-5 space-y-3 shadow-inner text-right" id="mobile-dropdown">
          <div className="space-y-1">
            {navLinks.map((link) => (
              <button
                key={link.id}
                onClick={() => {
                  setCurrentTab(link.id);
                  setIsOpen(false);
                }}
                className={`block w-full py-3 px-4 text-right rounded-xl text-base font-bold transition ${
                  currentTab === link.id
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'text-slate-700 hover:bg-slate-50 hover:text-emerald-600'
                }`}
                id={`mobile-nav-link-${link.id}`}
              >
                {link.label}
              </button>
            ))}
          </div>
          <div className="pt-3 border-t border-slate-100">
            <button
              onClick={() => {
                setCurrentTab('portal');
                setIsOpen(false);
              }}
              className="w-full flex items-center justify-center space-x-reverse space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-3 px-4 rounded-xl shadow-md"
              id="mobile-portal-launch-btn"
            >
              <Cpu className="w-5 h-5" />
              <span>دخول محاكي الصيدليات</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
