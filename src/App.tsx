import Dashboard from './components/Dashboard';
import ErrorBoundary from './components/ErrorBoundary';
import PWAPrompt from './components/PWAPrompt';
import DialogHost from './components/ui/dialogs';

export default function App() {
  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-slate-50 selection:bg-primary-100 selection:text-primary-900">
        {/* Launch directly into ANWAR AL-HASSAN Plus + Pharmacy Management Dashboard */}
        <Dashboard />
        <PWAPrompt />
        <DialogHost />
      </div>
    </ErrorBoundary>
  );
}
