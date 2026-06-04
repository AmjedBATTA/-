import { useState } from 'react';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import Ecosystem from './components/Ecosystem';
import SearchDirectory from './components/SearchDirectory';
import RegistrationForm from './components/RegistrationForm';
import Footer from './components/Footer';
import Dashboard from './components/Dashboard';

type Tab = 'landing' | 'search' | 'ecosystem' | 'register' | 'portal';

export default function App() {
  const [currentTab, setCurrentTab] = useState<Tab>('landing');

  const goTo = (tab: Tab) => {
    setCurrentTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (currentTab === 'portal') {
    return (
      <div className="min-h-screen bg-slate-50 selection:bg-emerald-100 selection:text-emerald-900">
        <Dashboard />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white selection:bg-emerald-100 selection:text-emerald-900" dir="rtl">
      <Navbar currentTab={currentTab} setCurrentTab={goTo} />

      <main>
        {currentTab === 'landing' && (
          <>
            <Hero
              onSearchClick={() => goTo('search')}
              onRegisterClick={() => goTo('register')}
              onPortalClick={() => goTo('portal')}
            />
            <Ecosystem />
          </>
        )}

        {currentTab === 'search' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
            <SearchDirectory
              onRegisterClick={() => goTo('register')}
              onOpenQuickOrderSimulator={() => goTo('portal')}
            />
          </div>
        )}

        {currentTab === 'ecosystem' && (
          <div className="py-10">
            <Ecosystem />
          </div>
        )}

        {currentTab === 'register' && (
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
            <RegistrationForm />
          </div>
        )}
      </main>

      <Footer setCurrentTab={goTo} />
    </div>
  );
}
