import Dashboard from './components/Dashboard';
import ErrorBoundary from './components/ErrorBoundary';

export default function App() {
  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-slate-50 selection:bg-emerald-100 selection:text-emerald-900">
        {/* Launch directly into ANWAR AL-HASSAN Plus + Pharmacy Management Dashboard */}
        <Dashboard />
      </div>
    </ErrorBoundary>
  );
}
